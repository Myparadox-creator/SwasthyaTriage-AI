"""Intake chat endpoints (fallback engine mode)."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_roles
from config import settings
from database.session import get_db
from middleware.errors import AppError
from models import Case, CaseSymptom, ChatMessage, ReviewNote, User
from models.enums import CaseStatus, MessageRole, Priority, Role

logger = logging.getLogger(__name__)
from pydantic import BaseModel, Field
from repositories.cases import get_case_or_403
from schemas.chat import (
    ChatHistoryResponse,
    ChatMessageOut,
    ChatSendRequest,
    ChatSendResponse,
    QuestionOut,
)
from services.intake.conversation import (
    _ctx,
    active_questions,
    apply_extraction,
    build_reply,
    is_satisfied,
    next_question,
    progress,
    record_answer_for_question,
)
from services.intake.fallback import extract_from_message
from services.notifications import notify, notify_facility_staff
from services.safety.service import reevaluate_case

router = APIRouter(prefix="/api/cases", tags=["chat"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


class DoctorReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def _can_converse(case: Case) -> None:
    """Validate whether intake conversation or voice session is permitted."""
    if case.status in (CaseStatus.CLOSED, CaseStatus.REJECTED):
        raise AppError(
            code="CASE_CLOSED",
            message=f"Case {case.case_number} is closed and cannot accept turns.",
            status_code=400,
        )


@router.post("/{case_id}/chat", response_model=ChatSendResponse)
def send_chat_message(
    case_id: int,
    payload: ChatSendRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)

    channel = payload.channel if payload.channel in ("CHAT", "VOICE") else "CHAT"

    # Case is already submitted — allow only emergency updates / urgent messages
    if case.status not in (CaseStatus.DRAFT, CaseStatus.FOLLOW_UP_REQUIRED):
        msg_lower = payload.message.lower()
        is_emergency = payload.is_emergency or any(
            w in msg_lower
            for w in (
                "emergency",
                "chest pain",
                "breathless",
                "severe",
                "bleeding",
                "unconscious",
                "urgent",
                "faint",
                "vomit",
                "heart",
                "ambulance",
                "dard",
                "chhati",
                "rokto",
                "help",
                "madad",
                "bachao",
                "sos",
            )
        )
        if not is_emergency:
            raise AppError(
                "Case already submitted",
                status_code=409,
                code="already_submitted",
            )

        db.add(
            ChatMessage(
                public_id=uuid.uuid4().hex[:32],
                case_id=case.id,
                role=MessageRole.PATIENT,
                content=payload.message,
                language=case.language.value if case.language else "en",
                channel=channel,
            )
        )
        case.priority = Priority.URGENT_REVIEW

        # Broadcast notification to ALL staff in the facility/organization
        facility_name_str = case.facility.name if case.facility else "your designated health centre"
        patient_name = case.patient.full_name if case.patient else "Patient"
        notify_facility_staff(
            db,
            facility_id=case.facility_id,
            type="EMERGENCY_UPDATE",
            title=f"🚨 Urgent Message from Patient — Case #{case.case_number}",
            body=f"{patient_name}: {payload.message[:120]}",
            case_id=case.id,
        )

        reply = (
            f"Your emergency message has been forwarded immediately to the on-duty medical officers at {facility_name_str}. "
            f"An attending healthcare worker is reviewing your case and will answer shortly. If you are facing life-threatening symptoms, dial 108 or 112 immediately."
        )
        db.add(
            ChatMessage(
                public_id=uuid.uuid4().hex[:32],
                case_id=case.id,
                role=MessageRole.AI,
                content=reply,
                language=case.language.value if case.language else "en",
                channel=channel,
            )
        )
        db.commit()

        return ChatSendResponse(
            reply=reply,
            priority=case.priority,
            progress=progress(db, case),
            can_submit=False,
            added_symptoms=[],
            added_measurement=False,
        )

    # Standard intake flow for Draft / Follow-up required cases
    db.add(
        ChatMessage(
            public_id=uuid.uuid4().hex[:32],
            case_id=case.id,
            role=MessageRole.PATIENT,
            content=payload.message,
            language=case.language.value if case.language else "en",
            channel=channel,
        )
    )

    extraction = extract_from_message(payload.message)
    changes = apply_extraction(db, case, extraction, channel=channel)

    if not case.chief_concern:
        case.chief_concern = (
            ", ".join(s.title() for s in extraction.symptoms)[:300] or payload.message[:300]
        )

    ctx = _ctx(case)
    if "duration_days" in ctx and not case.timeline_text:
        case.timeline_text = payload.message[:500]

    active = next_question(db, case)
    if active is not None:
        record_answer_for_question(db, case, active, payload.message, extraction)
    q = next_question(db, case)

    reevaluate_case(
        db,
        case,
        trigger="chat",
        actor=user,
        extra_free_text=payload.message,
    )

    reply: str | None = None
    if settings.gemini_enabled:
        try:
            from models.enums import Provenance
            from services.gemini.client import GeminiClient

            gemini = GeminiClient()
            prior_ctx = {
                "chief_concern": case.chief_concern,
                "symptoms": [s.term for s in case.symptoms],
                "measurements": [f"{m.name}: {m.value} {m.unit or ''}" for m in case.measurements],
                "duration_days": ctx.get("duration_days"),
            }
            lang_code = case.language.value if case.language else "en"
            triage_res = gemini.triage_voice_turn(
                user_text=payload.message,
                language=lang_code,
                prior_context=prior_ctx,
            )
            if triage_res and isinstance(triage_res, dict):
                gemini_reply = triage_res.get("reply_text")
                if gemini_reply:
                    reply = gemini_reply.strip()
                # Apply extracted symptoms from Gemini
                for sym in triage_res.get("extracted_symptoms", []):
                    if sym and sym.lower() not in {s.term.lower() for s in case.symptoms}:
                        db.add(
                            CaseSymptom(
                                case_id=case.id,
                                term=sym.title(),
                                normalized_term=sym.lower(),
                                source=Provenance.AI_EXTRACTED,
                                collected_via=channel,
                                verified=False,
                            )
                        )
                        changes["added_symptoms"].append(sym)
                if triage_res.get("is_emergency"):
                    case.priority = Priority.URGENT_REVIEW
        except Exception as e:
            logger.warning("Gemini chat triage fallback to deterministic bank: %s", e)

    if not reply:
        reply = build_reply(case, extraction, q)

    db.add(
        ChatMessage(
            public_id=uuid.uuid4().hex[:32],
            case_id=case.id,
            role=MessageRole.AI,
            content=reply,
            language=case.language.value if case.language else "en",
            channel=channel,
        )
    )
    db.commit()

    return ChatSendResponse(
        reply=reply,
        priority=case.priority,
        progress=progress(db, case),
        can_submit=q is None,
        added_symptoms=changes["added_symptoms"],
        added_measurement=changes["added_measurement"],
    )


@router.post("/{case_id}/reply", response_model=ChatMessageOut)
def doctor_reply(
    case_id: int,
    payload: DoctorReplyRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    doc_title = f"Dr. {user.full_name}" if not user.full_name.startswith("Dr.") else user.full_name
    designation = user.designation or user.role.value.replace("_", " ").title()
    clean_text = payload.message.strip()
    formatted_content = f"[👨‍⚕️ Clinical Advice - {doc_title} ({designation})]: {clean_text}"

    msg = ChatMessage(
        public_id=uuid.uuid4().hex[:32],
        case_id=case.id,
        role=MessageRole.SYSTEM,
        content=formatted_content,
        language=case.language.value if case.language else "en",
        channel="CHAT",
    )
    db.add(msg)

    # Also record in review notes so all staff in the facility see it in clinical trail
    note = ReviewNote(
        case_id=case.id,
        author_user_id=user.id,
        note=f"Doctor Clinical Reply to Patient: {clean_text}",
    )
    db.add(note)

    # Notify all other staff in the facility/organization
    notify_facility_staff(
        db,
        facility_id=case.facility_id,
        type="DOCTOR_REPLY",
        title=f"{doc_title} sent clinical advice on Case #{case.case_number}",
        body=clean_text[:120],
        case_id=case.id,
        exclude_user_id=user.id,
    )

    # Notify the patient
    if case.patient and case.patient.user_id:
        notify(
            db,
            user_id=case.patient.user_id,
            type="DOCTOR_REPLY",
            title=f"Doctor Advice Received — Case #{case.case_number}",
            body=f"{doc_title}: {clean_text[:120]}",
            case_id=case.id,
        )

    db.commit()
    db.refresh(msg)
    return ChatMessageOut.model_validate(msg)


@router.get("/{case_id}/chat", response_model=ChatHistoryResponse)
def get_chat_history(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.case_id == case.id).order_by(ChatMessage.created_at)
    ).all()
    questions = _question_overview(db, case)
    return ChatHistoryResponse(
        case_id=case.id,
        case_number=case.case_number,
        status=case.status,
        priority=case.priority,
        messages=[ChatMessageOut.model_validate(m) for m in messages],
        questions=questions,
        progress=progress(db, case),
        can_submit=next_question(db, case) is None,
    )


def _question_overview(db: Session, case: Case) -> list[QuestionOut]:
    result: list[QuestionOut] = []
    for q in active_questions(db):
        result.append(
            QuestionOut(
                code=q.code,
                category=q.category,
                text=q.text_for(case.language.value if case.language else "en"),
                required=q.required_for_review,
                satisfied=is_satisfied(db, case, q),
            )
        )
    return result
