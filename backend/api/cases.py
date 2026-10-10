"""Case endpoints: create, list, detail, submit, triage note."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_roles
from database.session import get_db
from middleware.errors import AppError, ForbiddenError
from models import Case, Consent, Document, Facility, FollowUp, Patient, User, VoiceSession
from models.enums import CaseSource, CaseStatus, ConsentStatus, Language, Priority, Role
from repositories.cases import (
    document_counts,
    facility_name,
    get_case_or_403,
    list_cases,
    next_case_number,
    review_note_out,
    user_name,
)
from schemas.case import (
    AISummaryResponse,
    CaseCreateRequest,
    CaseDetail,
    CaseListItem,
    CaseListResponse,
    MeasurementOut,
    SafetySignalOut,
    SubmitResponse,
    SymptomOut,
)
from schemas.documents import DocumentOut
import logging
from services.audit import AuditAction, record_audit
from services.exports.excel import sync_patient_to_persistent_workbook
from services.gemini import ProviderError, ProviderUnavailable, get_provider
from services.gemini.questions import suggest_questions
from services.gemini.summary import build_summary_payload, generated_at_now

logger = logging.getLogger(__name__)
from services.notifications import NotificationType, notify_facility_staff
from services.safety.service import reevaluate_case
from services.triage.note import build_triage_note

router = APIRouter(prefix="/api/cases", tags=["cases"])


def _require_patient_role(user: User) -> None:
    if user.role != Role.PATIENT:
        raise ForbiddenError("Only patient accounts can start an assessment")


@router.post("", status_code=201, response_model=CaseDetail)
def create_case(
    payload: CaseCreateRequest,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    if not payload.consent_accepted:
        raise AppError(
            "Consent is required before any health information is collected",
            status_code=422,
            code="consent_required",
        )

    patient = db.scalar(select(Patient).where(Patient.user_id == user.id))
    if patient is None:
        patient = Patient(user_id=user.id, full_name=user.full_name, phone=user.phone)
        db.add(patient)
        db.flush()

    if user.facility_id is None:
        # Attaches to the first active facility for prototype purposes;
        # real deployments assign facilities during registration.
        first_facility = db.scalar(
            select(Facility).where(Facility.is_active.is_(True)).order_by(Facility.id)
        )
        if first_facility is None:
            raise AppError("No facility configured", status_code=500, code="config_error")
        user.facility_id = first_facility.id
        patient.facility_id = first_facility.id

    case = Case(
        case_number=next_case_number(db),
        patient_id=patient.id,
        facility_id=user.facility_id,
        created_by_user_id=user.id,
        status=CaseStatus.DRAFT,
        priority=Priority.ROUTINE,
        source=CaseSource.CHAT,
        language=payload.language,
        chief_concern=payload.chief_concern,
        missing_information=[],
    )
    db.add(case)
    db.flush()

    db.add(
        Consent(
            patient_id=patient.id,
            case_id=case.id,
            status=ConsentStatus.GRANTED,
            consent_text_version=(payload.consent_text_version or "v1")[:16],
            language=payload.language,
        )
    )
    record_audit(
        db,
        AuditAction.CONSENT_RECORDED,
        user=user,
        case=case,
        metadata={"version": payload.consent_text_version, "language": payload.language.value},
    )
    record_audit(db, AuditAction.CASE_CREATED, user=user, case=case)
    db.commit()
    sync_patient_to_persistent_workbook(patient.id, db)
    return _case_detail(db, case)


@router.get("", response_model=CaseListResponse)
def get_cases(
    priority: Priority | None = None,
    status: CaseStatus | None = None,
    language: Language | None = None,
    source: CaseSource | None = None,
    assigned_reviewer_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total, rows = list_cases(
        db,
        user,
        priority=priority,
        status=status,
        language=language.value if language else None,
        source=source.value if source else None,
        assigned_reviewer_id=assigned_reviewer_id,
        date_from=date_from,
        date_to=date_to,
        q=q,
        page=page,
        page_size=page_size,
    )
    doc_counts = document_counts(db, [r.id for r in rows])
    items = [
        CaseListItem(
            id=c.id,
            case_number=c.case_number,
            status=c.status,
            priority=c.priority,
            source=c.source,
            language=c.language,
            chief_concern=c.chief_concern,
            created_at=c.created_at,
            submitted_at=c.submitted_at,
            reviewed_at=c.reviewed_at,
            patient_name=c.patient.full_name if c.patient else "Unknown",
            facility_id=c.facility_id,
            facility_name=facility_name(db, c.facility_id),
            assigned_reviewer_id=c.assigned_reviewer_id,
            assigned_reviewer_name=user_name(db, c.assigned_reviewer_id),
            symptom_count=len(c.symptoms),
            signal_count=len(c.safety_signals),
            has_documents=doc_counts.get(c.id, 0) > 0,
        )
        for c in rows
    ]
    return CaseListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{case_id}", response_model=CaseDetail)
def get_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    if user.role in (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN) and case.first_viewed_at is None:
        case.first_viewed_at = datetime.now().astimezone()
        record_audit(db, AuditAction.CASE_VIEWED, user=user, case=case)
        db.commit()
    return _case_detail(db, case)


@router.get("/{case_id}/triage-note")
def get_triage_note(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    return build_triage_note(db, case)


@router.post("/{case_id}/submit", response_model=SubmitResponse)
def submit_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    if case.status not in (CaseStatus.DRAFT, CaseStatus.FOLLOW_UP_REQUIRED):
        raise AppError(
            "Case has already been submitted for review",
            status_code=409,
            code="already_submitted",
        )

    evaluation = reevaluate_case(db, case, trigger="submit", actor=user)

    case.status = CaseStatus.SUBMITTED
    case.submitted_at = datetime.now().astimezone()
    if not case.missing_information:
        case.missing_information = ["Current medication", "Known medical history"]

    record_audit(
        db,
        AuditAction.CASE_SUBMITTED,
        user=user,
        case=case,
        metadata={"priority": case.priority.value, "language": case.language.value},
    )
    submitted_dt_str = case.submitted_at.strftime("%d %b %Y, %I:%M %p")
    notify_facility_staff(
        db,
        facility_id=case.facility_id,
        type=NotificationType.CASE_SUBMITTED,
        title="🚨 New Patient Case Submitted",
        body=f"Case {case.case_number} ({case.priority.value}) submitted on {submitted_dt_str} with medical documents ready for doctor review",
        case_id=case.id,
        exclude_user_id=user.id,
    )
    db.commit()

    return SubmitResponse(
        case_number=case.case_number,
        status=case.status,
        priority=case.priority,
        signals_detected=len(evaluation.signals),
        submitted_at=case.submitted_at,
        message=f"Case {case.case_number} successfully dispatched to doctor on {submitted_dt_str}.",
    )


@router.post("/{case_id}/ai-summary", response_model=AISummaryResponse)
def generate_ai_summary(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    provider = get_provider()
    payload = build_summary_payload(case)
    try:
        summary = provider.summarize_case(payload)
    except (ProviderError, ProviderUnavailable) as exc:
        logger.warning("AI provider unavailable, using deterministic mock summary: %s", exc)
        from services.gemini.summary import render_mock_summary

        summary = render_mock_summary(payload)

    case.ai_summary = summary
    case.ai_summary_generated_at = generated_at_now()
    questions = suggest_questions(db, case, provider)
    record_audit(
        db,
        AuditAction.AI_SUMMARY_GENERATED,
        user=user,
        case=case,
        metadata={"provider": provider.name, "question_count": len(questions)},
    )
    db.commit()
    return AISummaryResponse(
        summary=summary,
        generated_at=case.ai_summary_generated_at,
        provider=provider.name,
        suggested_questions=questions,
    )


def _case_detail(db: Session, case: Case) -> CaseDetail:
    patient = db.get(Patient, case.patient_id)
    documents = db.scalars(
        select(Document).where(Document.case_id == case.id, Document.deleted_at.is_(None))
    ).all()
    voice_count = len(db.scalars(select(VoiceSession).where(VoiceSession.case_id == case.id)).all())
    followup_count = len(db.scalars(select(FollowUp).where(FollowUp.case_id == case.id)).all())
    reviewer = db.get(User, case.assigned_reviewer_id) if case.assigned_reviewer_id else None
    facility = db.get(Facility, case.facility_id)

    return CaseDetail(
        id=case.id,
        case_number=case.case_number,
        status=case.status,
        priority=case.priority,
        source=case.source,
        language=case.language,
        chief_concern=case.chief_concern,
        timeline_text=case.timeline_text,
        ai_summary=case.ai_summary,
        ai_summary_generated_at=case.ai_summary_generated_at,
        missing_information=case.missing_information or [],
        created_at=case.created_at,
        submitted_at=case.submitted_at,
        reviewed_at=case.reviewed_at,
        patient={
            "id": patient.id if patient else None,
            "full_name": patient.full_name if patient else "Unknown",
            "phone": patient.phone if patient else None,
            "age": patient.age if patient else None,
            "gender": patient.gender if patient else None,
            "language": patient.language.value if patient else None,
        },
        facility={
            "id": case.facility_id,
            "name": facility.name if facility else None,
        },
        assigned_reviewer=(
            {
                "id": reviewer.id,
                "full_name": reviewer.full_name,
                "designation": reviewer.designation,
            }
            if reviewer
            else None
        ),
        symptoms=[SymptomOut.model_validate(s) for s in case.symptoms],
        measurements=[MeasurementOut.model_validate(m) for m in case.measurements],
        safety_signals=[SafetySignalOut.model_validate(s) for s in case.safety_signals],
        review_notes=[
            review_note_out(db, n)
            for n in sorted(case.review_notes, key=lambda x: x.created_at)
            if n.deleted_at is None
        ],
        documents=[DocumentOut.model_validate(d) for d in documents],
        voice_session_count=voice_count,
        followup_count=followup_count,
    )
