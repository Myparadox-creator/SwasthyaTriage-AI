"""Tele-calling endpoints: create, step, complete, view transcripts.

Follows SwasthyaTriage AI principles:
- Strictly staff-initiated or authorized follow-up workflow.
- Information-gathering only, non-diagnostic.
- Respects facility isolation.
- Every call is audited.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from models import Case, Patient, TeleCall, User
from models.enums import CallStatus, Role
from repositories.cases import get_case_or_403
from schemas.telephony import (
    TeleCallCreateRequest,
    TeleCallListResponse,
    TeleCallOut,
    TeleCallTurnRequest,
    TeleCallTurnResponse,
    TranscriptOut,
)
from services.email.service import send_sonam_call_request_email
from services.telephony.service import get_telephony_provider

router = APIRouter(prefix="/api/telecalls", tags=["telephony"])

logger = logging.getLogger("swasthyatriage.telecalls")

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


def _telecall_or_403(db: Session, user: User, call_id: int | str) -> tuple[TeleCall, Case]:
    if isinstance(call_id, int) or (isinstance(call_id, str) and call_id.isdigit()):
        stmt = select(TeleCall).where(TeleCall.id == int(call_id))
    else:
        stmt = select(TeleCall).where(TeleCall.public_id == str(call_id))

    call = db.scalar(stmt)
    if call is None:
        raise NotFoundError("Tele-call not found")
    case = get_case_or_403(db, user, call.case_id)
    return call, case


def _to_out(call: TeleCall, case: Case | None, patient: Patient | None) -> TeleCallOut:
    extracted_data = {
        key: value
        for key, value in (call.extracted_data or {}).items()
        if key != "vsdk_token"
    } if isinstance(call.extracted_data, dict) else {}

    transcripts_out: list[TranscriptOut] = []
    for t in (call.transcripts or []):
        try:
            transcripts_out.append(
                TranscriptOut(
                    id=t.id,
                    sequence=t.sequence,
                    role=str(getattr(t.role, "value", t.role)),
                    content=t.content or "",
                    language=getattr(t, "language", None),
                    created_at=getattr(t, "created_at", None),
                )
            )
        except Exception:
            continue

    return TeleCallOut(
        id=call.id,
        public_id=call.public_id,
        case_id=call.case_id,
        case_number=case.case_number if case else None,
        patient_name=patient.full_name if patient else "Unknown",
        phone_number=call.phone_number,
        status=call.status,
        direction=call.direction or "OUTBOUND",
        reason=call.reason,
        questions=call.questions or [],
        provider=call.provider or "mock",
        duration_seconds=call.duration_seconds,
        started_at=call.started_at,
        ended_at=call.ended_at,
        extracted_data=extracted_data,
        error_detail=call.error_detail,
        transcripts=transcripts_out,
        created_at=call.created_at or datetime.now().astimezone(),
    )


@router.post("", response_model=TeleCallOut, status_code=201)
def create_telecall(
    payload: TeleCallCreateRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, payload.case_id)
    provider = get_telephony_provider()

    call = provider.create_outbound_call(
        db=db,
        case=case,
        phone_number=payload.phone_number,
        reason=payload.reason,
        questions=payload.questions,
        requested_by=user,
        followup_id=payload.followup_id,
    )
    db.commit()
    db.refresh(call)

    patient = db.get(Patient, case.patient_id)
    return _to_out(call, case, patient)


@router.get("", response_model=TeleCallListResponse)
def list_telecalls(
    case_id: int | None = None,
    status: CallStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(TeleCall)
    if case_id is not None:
        stmt = stmt.where(TeleCall.case_id == case_id)
    if status is not None:
        stmt = stmt.where(TeleCall.status == status)

    if user.role != Role.SUPER_ADMIN:
        if user.facility_id is None:
            raise AppError("No facility assigned to staff account", status_code=403, code="unassigned_facility")
        stmt = stmt.join(Case, TeleCall.case_id == Case.id).where(Case.facility_id == user.facility_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(TeleCall.created_at.desc())
        .offset(max(page - 1, 0) * page_size)
        .limit(page_size)
    ).all()

    out_items = []
    for c in rows:
        try:
            cs = db.get(Case, c.case_id) if c.case_id else None
            pt = db.get(Patient, cs.patient_id) if cs and cs.patient_id else None
            out_items.append(_to_out(c, cs, pt))
        except Exception as ex:
            logger.warning("Failed to serialize telecall %s: %s", c.id, ex)
            continue

    return TeleCallListResponse(items=out_items, total=total)


@router.get("/{call_id}", response_model=TeleCallOut)
def get_telecall(
    call_id: str,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    call, case = _telecall_or_403(db, user, call_id)
    patient = db.get(Patient, case.patient_id)
    return _to_out(call, case, patient)


@router.post("/{call_id}/start", response_model=TeleCallOut)
def start_telecall(
    call_id: str,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    call, case = _telecall_or_403(db, user, call_id)
    if call.status not in (CallStatus.REQUESTED, CallStatus.DIALING):
        raise AppError(
            f"Call cannot be started from state {call.status.value}",
            status_code=409,
            code="invalid_state",
        )

    provider = get_telephony_provider(call.provider)
    call = provider.start_call(db=db, call=call)
    db.commit()
    db.refresh(call)

    patient = db.get(Patient, case.patient_id)
    return _to_out(call, case, patient)


@router.post("/{call_id}/step", response_model=TeleCallTurnResponse)
def step_telecall(
    call_id: str,
    payload: TeleCallTurnRequest | None = None,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    call, case = _telecall_or_403(db, user, call_id)
    if call.status != CallStatus.CONNECTED:
        raise AppError(
            "Call must be connected before taking conversational steps",
            status_code=409,
            code="not_connected",
        )

    provider = get_telephony_provider(call.provider)
    patient_reply = payload.patient_reply if payload else None
    res = provider.run_turn(db=db, call=call, patient_reply_override=patient_reply)
    db.commit()

    return TeleCallTurnResponse(
        agent_question=res.agent_question,
        patient_response=res.patient_response,
        item_key=res.item_key,
        extracted_value=res.extracted_value,
        is_last_question=res.is_last_question,
        duration_seconds=call.duration_seconds or 0,
    )


@router.post("/{call_id}/complete", response_model=TeleCallOut)
def complete_telecall(
    call_id: str,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    call, case = _telecall_or_403(db, user, call_id)
    if call.status == CallStatus.COMPLETED:
    patient = db.get(Patient, case.patient_id)

    try:
        send_sonam_call_request_email(
            db,
            requester_name=user.full_name,
            requester_email=user.email,
            phone=call.phone_number,
            language=case.language.value if case.language else None,
            purpose=call.reason,
            case_number=case.case_number,
            source="Staff console (Tele-consultations & Calls)",
        )
    except Exception:  # noqa: BLE001 - never block the tele-call on email failure
        logger.exception("Admin Sonam-request email failed for call %s", call.public_id)

    return _to_out(call, case, patient)

    provider = get_telephony_provider(call.provider)
    provider.complete_call(db=db, call=call, actor=user)
    db.commit()
    db.refresh(call)

    patient = db.get(Patient, case.patient_id)
    return _to_out(call, case, patient)
