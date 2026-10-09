"""Healthcare worker review workflow endpoints.

Everything here is reviewer-facing and non-diagnostic. Safety-critical
actions are recorded in the audit log and moves are validated against the
case state machine. Facility isolation is enforced via get_case_or_403 and
explicit scoping on list queries.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.cases import _case_detail
from auth.dependencies import get_current_user, require_roles
from database.session import get_db
from middleware.errors import AppError, ForbiddenError
from models import AuditLog, Case, FollowUp, Patient, Referral, ReviewNote, User
from models.enums import CaseStatus, FollowUpStatus, Role
from repositories.cases import get_case_or_403
from schemas.case import (
    AuditLogListResponse,
    AuditLogOut,
    CaseDetail,
    FollowUpCreateRequest,
    FollowUpListResponse,
    FollowUpOut,
    ReferralCreateRequest,
    ReferralListResponse,
    ReferralOut,
    ReviewNoteCreate,
    ReviewNoteOut,
    ReviewOutcome,
    ReviewRequest,
)
from services.audit import AuditAction, record_audit
from services.email import (
    send_clarification_request_email,
    send_encounter_assignment_email,
)
from services.notifications import NotificationType, notify, notify_facility_staff

logger = logging.getLogger("swasthyatriage.reviews")

router = APIRouter(prefix="/api", tags=["reviews"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)

_REVIEWABLE = {CaseStatus.SUBMITTED, CaseStatus.IN_REVIEW, CaseStatus.FOLLOW_UP_REQUIRED}
_ACTIVE = {
    CaseStatus.SUBMITTED,
    CaseStatus.IN_REVIEW,
    CaseStatus.FOLLOW_UP_REQUIRED,
    CaseStatus.REVIEWED,
}


def _require_staff(user: User) -> None:
    if user.role not in STAFF_ROLES:
        raise ForbiddenError("Only healthcare staff can perform this action")


def _note_out(db: Session, note: ReviewNote) -> ReviewNoteOut:
    author = db.get(User, note.author_user_id) if note.author_user_id else None
    return ReviewNoteOut(
        id=note.id,
        note=note.note,
        created_at=note.created_at,
        author_full_name=author.full_name if author else None,
        author_role=author.role.value if author else None,
    )


def _followup_out(db: Session, fu: FollowUp) -> FollowUpOut:
    case = db.get(Case, fu.case_id)
    patient = db.get(Patient, case.patient_id) if case else None
    requester = db.get(User, fu.requested_by_user_id) if fu.requested_by_user_id else None
    return FollowUpOut(
        id=fu.id,
        public_id=fu.public_id,
        case_id=fu.case_id,
        case_number=case.case_number if case else None,
        patient_name=patient.full_name if patient else None,
        reason=fu.reason,
        items=fu.items or [],
        questions=fu.questions or [],
        channel=fu.channel,
        status=fu.status,
        result_summary=fu.result_summary,
        requested_by_user_id=fu.requested_by_user_id,
        requested_by_name=requester.full_name if requester else None,
        assigned_to_user_id=fu.assigned_to_user_id,
        created_at=fu.created_at,
        updated_at=fu.updated_at,
        completed_at=fu.completed_at,
    )


def _referral_out(db: Session, ref: Referral) -> ReferralOut:
    case = db.get(Case, ref.case_id)
    patient = db.get(Patient, case.patient_id) if case else None
    author = db.get(User, ref.created_by_user_id) if ref.created_by_user_id else None
    return ReferralOut(
        id=ref.id,
        public_id=ref.public_id,
        case_id=ref.case_id,
        case_number=case.case_number if case else None,
        patient_name=patient.full_name if patient else None,
        destination_facility=ref.destination_facility,
        reason_for_referral=ref.reason_for_referral,
        draft=ref.draft or {},
        status=ref.status,
        version=ref.version,
        supersedes_id=ref.supersedes_id,
        created_by_user_id=ref.created_by_user_id,
        created_by_name=author.full_name if author else None,
        created_at=ref.created_at,
        verified_at=ref.verified_at,
        finalized_at=ref.finalized_at,
    )


@router.post("/cases/{case_id}/notes", response_model=ReviewNoteOut, status_code=201)
def add_review_note(
    case_id: int,
    payload: ReviewNoteCreate,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)
    note = ReviewNote(case_id=case.id, author_user_id=user.id, note=payload.note)
    db.add(note)
    db.flush()
    record_audit(
        db,
        AuditAction.REVIEWER_NOTE_ADDED,
        user=user,
        case=case,
        metadata={"note_id": note.id},
    )
    notify_facility_staff(
        db,
        facility_id=case.facility_id,
        type="DOCTOR_NOTE",
        title=f"Clinical Note Added — Case #{case.case_number}",
        body=f"{user.full_name}: {payload.note[:120]}",
        case_id=case.id,
        exclude_user_id=user.id,
    )
    db.commit()
    db.refresh(note)
    return _note_out(db, note)


@router.get("/cases/{case_id}/notes", response_model=list[ReviewNoteOut])
def list_review_notes(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    notes = db.scalars(
        select(ReviewNote)
        .where(ReviewNote.case_id == case.id, ReviewNote.deleted_at.is_(None))
        .order_by(ReviewNote.created_at)
    ).all()
    return [_note_out(db, n) for n in notes]


@router.post("/cases/{case_id}/review", response_model=ReviewOutcome)
def mark_reviewed(
    case_id: int,
    payload: ReviewRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)

    if case.status == CaseStatus.REVIEWED:
        raise AppError(
            "This case has already been marked as reviewed",
            status_code=409,
            code="already_reviewed",
        )
    if case.status == CaseStatus.ESCALATED:
        raise AppError(
            "This case has been escalated and cannot be marked reviewed until resolved",
            status_code=409,
            code="case_escalated",
        )
    if case.status == CaseStatus.REFERRED:
        raise AppError(
            "This case has been referred out; review it on the receiving facility before closing",
            status_code=409,
            code="case_referred",
        )
    if case.status == CaseStatus.CLOSED:
        raise AppError("This case is closed", status_code=409, code="case_closed")
    if case.status not in _REVIEWABLE:
        raise AppError(
            "Only submitted cases can be marked as reviewed",
            status_code=409,
            code="invalid_transition",
        )

    case.status = CaseStatus.REVIEWED
    case.reviewed_at = datetime.now().astimezone()
    case.reviewed_by_user_id = user.id

    note_out: ReviewNoteOut | None = None
    if payload.note and payload.note.strip():
        note = ReviewNote(case_id=case.id, author_user_id=user.id, note=payload.note.strip())
        db.add(note)
        db.flush()
        note_out = _note_out(db, note)

    record_audit(
        db,
        AuditAction.CASE_REVIEWED,
        user=user,
        case=case,
        metadata={
            "decision": payload.decision or CaseStatus.REVIEWED.value,
            "note_added": bool(payload.note),
        },
    )
    notify(
        db,
        user_id=case.patient.user_id if case.patient else None,
        type=NotificationType.CASE_REVIEWED,
        title="Your assessment has been reviewed",
        body=f"Case {case.case_number} was reviewed by {user.full_name}",
        case_id=case.id,
    )
    db.commit()
    return ReviewOutcome(case=_case_detail(db, case), note=note_out)


@router.post("/cases/{case_id}/followups", response_model=FollowUpOut, status_code=201)
def request_followup(
    case_id: int,
    payload: FollowUpCreateRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)

    if case.status not in _ACTIVE:
        raise AppError(
            "Follow-up can only be requested on an active case",
            status_code=409,
            code="invalid_transition",
        )

    followup = FollowUp(
        public_id=uuid.uuid4().hex[:32],
        case_id=case.id,
        requested_by_user_id=user.id,
        reason=payload.reason,
        items=payload.items,
        questions=payload.questions,
        channel=payload.channel,
        status=FollowUpStatus.PENDING,
    )
    db.add(followup)
    case.status = CaseStatus.FOLLOW_UP_REQUIRED
    record_audit(
        db,
        AuditAction.FOLLOW_UP_REQUESTED,
        user=user,
        case=case,
        metadata={
            "followup_id": followup.public_id,
            "channel": payload.channel.value,
            "items": payload.items,
        },
    )
    notify_facility_staff(
        db,
        facility_id=case.facility_id,
        type=NotificationType.FOLLOW_UP_REQUESTED,
        title="Follow-up requested",
        body=f"Case {case.case_number} needs more information before review can complete",
        case_id=case.id,
        exclude_user_id=user.id,
    )
    notify(
        db,
        user_id=case.patient.user_id if case.patient else None,
        type=NotificationType.FOLLOW_UP_REQUESTED,
        title="More information requested",
        body=f"Please provide the requested details for case {case.case_number}",
        case_id=case.id,
    )
    db.commit()

    if case.patient and case.patient.user_id:
        patient_user = db.get(User, case.patient.user_id)
        if patient_user and patient_user.email:
            try:
                send_clarification_request_email(db, patient_user, case.case_number, case.id)
            except Exception as exc:
                logger.warning("[Reviews] Clarification email failed: %s", exc)

    db.refresh(followup)
    return _followup_out(db, followup)


@router.get("/cases/{case_id}/followups", response_model=list[FollowUpOut])
def list_case_followups(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    rows = db.scalars(
        select(FollowUp).where(FollowUp.case_id == case.id).order_by(FollowUp.created_at.desc())
    ).all()
    return [_followup_out(db, fu) for fu in rows]


@router.post("/cases/{case_id}/referral", response_model=ReferralOut, status_code=201)
def prepare_referral(
    case_id: int,
    payload: ReferralCreateRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    """Create the referral workflow entry point.

    A referral is created in DRAFT with the case context preserved; it is
    never finalized automatically and does not change the case status.
    """
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)

    referral = Referral(
        public_id=uuid.uuid4().hex[:32],
        case_id=case.id,
        created_by_user_id=user.id,
        destination_facility=payload.destination_facility or None,
        reason_for_referral=payload.reason_for_referral or None,
        draft={
            "case_number": case.case_number,
            "chief_concern": case.chief_concern,
            "timeline_text": case.timeline_text,
            "symptoms": [s.term for s in case.symptoms],
            "measurements": [
                {"name": m.name, "value": m.value, "unit": m.unit} for m in case.measurements
            ],
            "prioritization": case.priority.value,
            "note": "Draft prepared for healthcare professional verification.",
        },
    )
    db.add(referral)
    record_audit(
        db,
        AuditAction.REFERRAL_GENERATED,
        user=user,
        case=case,
        metadata={
            "referral_id": referral.public_id,
            "destination": payload.destination_facility,
        },
    )
    db.commit()
    db.refresh(referral)
    return _referral_out(db, referral)


@router.post("/cases/{case_id}/escalate", response_model=CaseDetail)
def escalate_case(
    case_id: int,
    payload: ReviewRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    """Escalate a case to the next review level.

    Escalation requires an explicit confirmation flag from the calling client.
    """
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)

    if payload.decision != "CONFIRM":
        raise AppError(
            "Escalation requires explicit confirmation",
            status_code=422,
            code="confirmation_required",
        )
    if case.status == CaseStatus.ESCALATED:
        raise AppError("This case is already escalated", status_code=409, code="already_escalated")
    if case.status not in _ACTIVE:
        raise AppError(
            "Only active cases can be escalated",
            status_code=409,
            code="invalid_transition",
        )

    case.status = CaseStatus.ESCALATED
    if payload.note and payload.note.strip():
        db.add(ReviewNote(case_id=case.id, author_user_id=user.id, note=payload.note.strip()))

    record_audit(
        db,
        AuditAction.CASE_ESCALATED,
        user=user,
        case=case,
        metadata={"note": payload.note},
    )
    db.commit()
    return _case_detail(db, case)


@router.post("/cases/{case_id}/assign", response_model=CaseDetail)
def assign_reviewer(
    case_id: int,
    payload: ReviewRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _require_staff(user)

    reviewer_id = payload.reviewer_id or user.id
    reviewer = db.get(User, reviewer_id)
    if reviewer is None or reviewer.role not in STAFF_ROLES:
        raise AppError(
            "Reviewer must be an active healthcare staff member",
            status_code=422,
            code="invalid_reviewer",
        )

    case.assigned_reviewer_id = reviewer.id
    if case.status not in _ACTIVE:
        raise AppError(
            "Only active cases can be assigned",
            status_code=409,
            code="invalid_transition",
        )

    record_audit(
        db,
        AuditAction.CASE_UPDATED,
        user=user,
        case=case,
        metadata={"action": "assign_reviewer", "reviewer_id": reviewer.id},
    )
    db.commit()

    if reviewer and reviewer.email:
        try:
            send_encounter_assignment_email(db, reviewer, case.case_number, case.id)
        except Exception as exc:
            logger.warning("[Reviews] Assignment email failed: %s", exc)

    return _case_detail(db, case)


@router.get("/followups", response_model=FollowUpListResponse)
def list_followups(
    status: FollowUpStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(FollowUp)
    if status is not None:
        stmt = stmt.where(FollowUp.status == status)
    if user.role != Role.SUPER_ADMIN:
        if user.facility_id is None:
            raise ForbiddenError("No facility assigned to this account")
        stmt = stmt.join(Case, FollowUp.case_id == Case.id).where(
            Case.facility_id == user.facility_id
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(FollowUp.created_at.desc())
        .offset(max(page - 1, 0) * page_size)
        .limit(page_size)
    ).all()
    return FollowUpListResponse(items=[_followup_out(db, fu) for fu in rows], total=total)


@router.get("/referrals", response_model=ReferralListResponse)
def list_referrals(
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(Referral)
    if status:
        stmt = stmt.where(Referral.status == status)
    if user.role != Role.SUPER_ADMIN:
        if user.facility_id is None:
            raise ForbiddenError("No facility assigned to this account")
        stmt = stmt.join(Case, Referral.case_id == Case.id).where(
            Case.facility_id == user.facility_id
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Referral.created_at.desc())
        .offset(max(page - 1, 0) * page_size)
        .limit(page_size)
    ).all()
    return ReferralListResponse(items=[_referral_out(db, ref) for ref in rows], total=total)


@router.get("/audit-logs", response_model=AuditLogListResponse)
def list_audit_logs(
    action: str | None = None,
    case_number: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if case_number:
        stmt = stmt.where(AuditLog.case_number == case_number)
    if user.role != Role.SUPER_ADMIN:
        if user.facility_id is None:
            raise ForbiddenError("No facility assigned to this account")
        stmt = stmt.where(AuditLog.facility_id == user.facility_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(AuditLog.created_at.desc())
        .offset(max(page - 1, 0) * page_size)
        .limit(page_size)
    ).all()
    return AuditLogListResponse(items=[AuditLogOut.model_validate(a) for a in rows], total=total)
