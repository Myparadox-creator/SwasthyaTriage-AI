"""Patient-facing Sonam callback requests.

A patient can ask the AI assistant (Sonam) to call them back on a phone number.
The request is queued as a `TeleCall` on the patient's case so the care team can
place it; when a live provider (VideoSDK/SnapServe) is configured, the request
places the real outbound call immediately, otherwise it is simulated.

Consent, phone normalization, cooldown, daily caps and de-duplication are all
enforced here rather than trusted to the client.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from config import settings
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from models import Case, Consent, Facility, Patient, TeleCall, User
from models.enums import (
    CallStatus,
    CaseSource,
    CaseStatus,
    ConsentStatus,
    Language,
    Priority,
    Role,
)
from repositories.cases import next_case_number
from schemas.telephony import (
    CallbackListResponse,
    CallbackRequestCreate,
    CallbackRequestOut,
    SnapServeLeadIn,
)
from services.audit import AuditAction, record_audit
from services.email.service import send_sonam_call_request_email
from services.snapserve_leads import submit_snapserve_lead
from services.telephony.phone import mask_phone, normalize_indian_phone
from services.telephony.service import get_telephony_provider

router = APIRouter(
    prefix="/api/patients/callback-requests", tags=["patient-callbacks"]
)

logger = logging.getLogger("swasthyatriage.callbacks")

# Statuses that mean a call is still outstanding (no new request should be queued).
_ACTIVE_STATUSES = (
    CallStatus.REQUESTED,
    CallStatus.DIALING,
    CallStatus.RINGING,
    CallStatus.CONNECTED,
)

# Question bank the telephony agent will ask during a patient-requested callback.
CALLBACK_QUESTIONS = [
    "temperature",
    "medication",
    "duration",
    "medical_history",
    "spo2",
]

_COOLDOWN_MINUTES = 5
_DAILY_CAP = 3

_STATUS_MESSAGE: dict[CallStatus, str] = {
    CallStatus.REQUESTED: "Queued — waiting for the care team to place the call.",
    CallStatus.DIALING: "Dialing your number now.",
    CallStatus.RINGING: "Ringing — connecting you to the assistant.",
    CallStatus.CONNECTED: "Connected — the assistant is speaking with you.",
    CallStatus.COMPLETED: "Call completed.",
    CallStatus.FAILED: "The call could not be completed.",
    CallStatus.NO_ANSWER: "No answer.",
    CallStatus.CANCELLED: "Call cancelled.",
}


def _get_patient(db: Session, user: User) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.user_id == user.id))
    if patient is None:
        patient = Patient(user_id=user.id, full_name=user.full_name, phone=user.phone)
        db.add(patient)
        db.flush()
    return patient


def _ensure_facility(db: Session, user: User, patient: Patient) -> int:
    if user.facility_id is not None:
        return user.facility_id
    first_facility = db.scalar(
        select(Facility).where(Facility.is_active.is_(True)).order_by(Facility.id)
    )
    if first_facility is None:
        raise AppError("No facility configured", status_code=500, code="config_error")
    user.facility_id = first_facility.id
    patient.facility_id = first_facility.id
    return first_facility.id


def _language_enum(code: str) -> Language:
    try:
        return Language(code)
    except ValueError:
        return Language.HI


def _latest_case(db: Session, patient_id: int) -> Case | None:
    return db.scalar(
        select(Case)
        .where(Case.patient_id == patient_id, Case.deleted_at.is_(None))
        .order_by(Case.created_at.desc())
        .limit(1)
    )


def _create_callback_case(
    db: Session, *, patient: Patient, user: User, language: Language
) -> Case:
    facility_id = _ensure_facility(db, user, patient)
    case = Case(
        case_number=next_case_number(db),
        patient_id=patient.id,
        facility_id=facility_id,
        created_by_user_id=user.id,
        status=CaseStatus.DRAFT,
        priority=Priority.ROUTINE,
        source=CaseSource.TELECALL,
        language=language,
        chief_concern=None,
        missing_information=[],
    )
    db.add(case)
    db.flush()
    db.add(
        Consent(
            patient_id=patient.id,
            case_id=case.id,
            status=ConsentStatus.GRANTED,
            consent_text_version="v1",
            language=language,
        )
    )
    record_audit(
        db,
        AuditAction.CONSENT_RECORDED,
        user=user,
        case=case,
        metadata={"version": "v1", "language": language.value, "channel": "CALLBACK"},
    )
    return case


def _patient_calls(db: Session, patient_id: int):
    return (
        select(TeleCall)
        .join(Case, TeleCall.case_id == Case.id)
        .where(Case.patient_id == patient_id)
    )


def _enforce_limits(db: Session, patient_id: int, phone: str) -> None:
    """Cooldown + daily cap + active-call de-duplication, all scoped to this patient."""
    now = datetime.now(UTC)

    active = db.scalar(
        select(func.count(TeleCall.id))
        .join(Case, TeleCall.case_id == Case.id)
        .where(
            Case.patient_id == patient_id,
            TeleCall.status.in_(_ACTIVE_STATUSES),
        )
    )
    if active:
        raise AppError(
            "You already have a call queued. Please wait for it to complete "
            "before requesting another.",
            status_code=409,
            code="callback_already_queued",
        )

    recent = db.scalar(
        select(func.count(TeleCall.id)).where(
            TeleCall.phone_number == phone,
            TeleCall.created_at >= now - timedelta(minutes=_COOLDOWN_MINUTES),
        )
    )
    if recent:
        raise AppError(
            "Please wait a few minutes before requesting another callback.",
            status_code=429,
            code="callback_cooldown",
        )

    daily = db.scalar(
        select(func.count(TeleCall.id)).where(
            TeleCall.phone_number == phone,
            TeleCall.created_at >= now - timedelta(hours=24),
        )
    )
    if daily and daily >= _DAILY_CAP:
        raise AppError(
            "You have reached the maximum number of callback requests for today. "
            "Please try again tomorrow or use the in-app voice assistant.",
            status_code=429,
            code="callback_daily_limit",
        )


def _to_out(
    call: TeleCall, *, case: Case, mode: str, message: str
) -> CallbackRequestOut:
    return CallbackRequestOut(
        id=call.id,
        public_id=call.public_id,
        case_id=call.case_id,
        case_number=case.case_number if case else None,
        status=call.status,
        provider=call.provider,
        mode=mode,
        phone_masked=mask_phone(call.phone_number),
        language=(call.extracted_data or {}).get("language", "hi"),
        purpose=call.reason,
        consent_ai=bool((call.extracted_data or {}).get("consent_ai")),
        message=message,
        created_at=call.created_at,
    )


def _status_message(call: TeleCall) -> str:
    base = _STATUS_MESSAGE.get(call.status, "Callback status unavailable.")
    if call.status == CallStatus.FAILED and call.error_detail:
        return f"{base} ({call.error_detail})"
    if not settings.telephony_live and call.status == CallStatus.REQUESTED:
        return (
            "Request recorded. Outbound telephony is currently simulated in this "
            "environment, so no live call has been placed."
        )
    return base


@router.post("", response_model=CallbackRequestOut, status_code=201)
def create_callback_request(
    payload: CallbackRequestCreate,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    phone = normalize_indian_phone(payload.phone_number)
    if phone is None:
        raise AppError(
            "Please enter a valid 10-digit Indian mobile number.",
            status_code=422,
            code="invalid_phone_number",
        )

    patient = _get_patient(db, user)
    language = _language_enum(payload.language)

    _enforce_limits(db, patient.id, phone)

    case = _latest_case(db, patient.id)
    if case is None:
        case = _create_callback_case(db, patient=patient, user=user, language=language)

    provider = get_telephony_provider()
    purpose = (
        payload.purpose
        or "Patient requested a Sonam callback for health information"
    )

    try:
        send_sonam_call_request_email(
            db,
            requester_name=patient.full_name,
            requester_email=user.email,
            phone=phone,
            language=language.value,
            purpose=purpose,
            case_number=case.case_number,
            source="Patient dashboard (Sonam callback)",
        )
    except Exception:  # noqa: BLE001 - never block the callback on email failure
        logger.exception("Admin Sonam-request email failed for patient %s", patient.id)

    call = provider.create_outbound_call(
        db=db,
        case=case,
        phone_number=phone,
        reason=purpose,
        questions=CALLBACK_QUESTIONS,
        requested_by=user,
    )
    call.extracted_data = {
        "language": language.value,
        "consent_ai": True,
        "requested_by_patient": True,
    }
    db.flush()

    record_audit(
        db,
        AuditAction.TELECALL_REQUESTED,
        user=user,
        case=case,
        metadata={
            "telecall_id": call.public_id,
            "provider": call.provider,
            "language": language.value,
            "phone_masked": mask_phone(phone),
            "consent_ai": True,
            "mode": settings.callback_mode,
        },
    )
    db.commit()
    db.refresh(call)

    if settings.telephony_live:
        message = (
            f"Callback request recorded. A care team member will call you on the "
            f"number ending in {phone[-4:]}."
        )
    else:
        message = (
            f"Callback request recorded for the number ending in {phone[-4:]}. "
            "Outbound telephony is currently simulated in this environment, so no "
            "live call has been placed — a healthcare worker will follow up."
        )

    return _to_out(
        call, case=case, mode=settings.callback_mode, message=message
    )


@router.post("/snapserve-lead", status_code=202)
def submit_snapserve_lead_request(
    payload: SnapServeLeadIn,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    """Proxy a lead to SnapServe so the live API key never reaches the browser."""
    patient = _get_patient(db, user)
    sent = submit_snapserve_lead(
        {
            "phone": payload.phone,
            "name": payload.name or patient.full_name,
            "email": payload.email or user.email,
            "purpose": payload.purpose,
            "language": payload.language or "hi",
            "source": payload.source or "SwasthyaFlow AI Patient Portal",
        }
    )
    return {"sent": sent}


@router.get("", response_model=CallbackListResponse)
def list_callback_requests(
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    patient = _get_patient(db, user)
    stmt = _patient_calls(db, patient.id).order_by(TeleCall.created_at.desc())
    calls = db.scalars(stmt.limit(25)).all()

    items: list[CallbackRequestOut] = []
    for call in calls:
        case = db.get(Case, call.case_id)
        items.append(
            _to_out(
                call,
                case=case,
                mode=settings.callback_mode,
                message=_status_message(call),
            )
        )
    return CallbackListResponse(items=items, total=len(items))


@router.get("/{call_id}", response_model=CallbackRequestOut)
def get_callback_request(
    call_id: int,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    patient = _get_patient(db, user)
    stmt = _patient_calls(db, patient.id).where(TeleCall.id == call_id)
    call = db.scalar(stmt)
    if call is None:
        raise NotFoundError("Callback request not found")

    case = db.get(Case, call.case_id)
    return _to_out(
        call,
        case=case,
        mode=settings.callback_mode,
        message=_status_message(call),
    )
