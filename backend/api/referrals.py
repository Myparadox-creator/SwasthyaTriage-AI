"""Referral lifecycle: detail, draft edits, verify, finalize, revise.

Create and list stay in api/reviews.py. Finalization uses optimistic
concurrency: the client echoes the `version` it reviewed, and a stale
version is rejected with 409. Revising creates a NEW draft row with
version+1 and `supersedes_id` — the original row is never mutated.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.reviews import STAFF_ROLES, _referral_out
from auth.dependencies import require_roles
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from models import Case, Referral, User
from models.enums import CaseStatus, ReferralStatus
from repositories.cases import get_case_or_403
from schemas.case import (
    ReferralFinalizeRequest,
    ReferralOut,
    ReferralUpdateRequest,
)
from services.audit import AuditAction, record_audit
from services.email import send_referral_status_email
from services.notifications import NotificationType, notify, notify_facility_staff, notify_users

logger = logging.getLogger("swasthyatriage.referrals")

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


def _referral_or_403(db: Session, user: User, referral_id: int) -> tuple[Referral, Case]:
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise NotFoundError("Referral not found")
    case = get_case_or_403(db, user, referral.case_id)
    return referral, case


@router.get("/{referral_id}", response_model=ReferralOut)
def get_referral(
    referral_id: int,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    referral, _ = _referral_or_403(db, user, referral_id)
    return _referral_out(db, referral)


@router.patch("/{referral_id}", response_model=ReferralOut)
def update_referral(
    referral_id: int,
    payload: ReferralUpdateRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    referral, case = _referral_or_403(db, user, referral_id)
    if referral.status != ReferralStatus.DRAFT:
        raise AppError(
            "Only draft referrals can be edited — revise a verified/finalized referral instead",
            status_code=409,
            code="invalid_transition",
        )

    changed: list[str] = []
    if payload.destination_facility is not None:
        referral.destination_facility = payload.destination_facility.strip() or None
        changed.append("destination_facility")
    if payload.reason_for_referral is not None:
        referral.reason_for_referral = payload.reason_for_referral.strip() or None
        changed.append("reason_for_referral")
    if payload.draft is not None:
        referral.draft = payload.draft
        changed.append("draft")
    if not changed:
        raise AppError(
            "No changes supplied",
            status_code=422,
            code="no_changes",
        )

    record_audit(
        db,
        AuditAction.REFERRAL_UPDATED,
        user=user,
        case=case,
        metadata={
            "referral_id": referral.public_id,
            "changed": changed,
            "version": referral.version,
        },
    )
    db.commit()
    db.refresh(referral)
    return _referral_out(db, referral)


@router.post("/{referral_id}/verify", response_model=ReferralOut)
def verify_referral(
    referral_id: int,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    referral, case = _referral_or_403(db, user, referral_id)
    if referral.status == ReferralStatus.VERIFIED:
        raise AppError(
            "This referral is already verified",
            status_code=409,
            code="already_verified",
        )
    if referral.status != ReferralStatus.DRAFT:
        raise AppError(
            "Only draft referrals can be verified",
            status_code=409,
            code="invalid_transition",
        )

    referral.status = ReferralStatus.VERIFIED
    referral.verified_by_user_id = user.id
    referral.verified_at = datetime.now().astimezone()
    record_audit(
        db,
        AuditAction.REFERRAL_VERIFIED,
        user=user,
        case=case,
        metadata={"referral_id": referral.public_id, "version": referral.version},
    )
    notify_facility_staff(
        db,
        facility_id=case.facility_id,
        type=NotificationType.REFERRAL_VERIFIED,
        title=f"Referral verified — {case.case_number}",
        body="Referral details verified; ready to finalize",
        case_id=case.id,
        exclude_user_id=user.id,
    )
    db.commit()
    db.refresh(referral)
    return _referral_out(db, referral)


@router.post("/{referral_id}/finalize", response_model=ReferralOut)
def finalize_referral(
    referral_id: int,
    payload: ReferralFinalizeRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    referral, case = _referral_or_403(db, user, referral_id)
    if referral.status == ReferralStatus.FINALIZED:
        raise AppError(
            "This referral has already been finalized",
            status_code=409,
            code="already_finalized",
        )
    if referral.status != ReferralStatus.VERIFIED:
        raise AppError(
            "A referral must be verified before it can be finalized",
            status_code=409,
            code="invalid_transition",
        )
    if payload.version != referral.version:
        raise AppError(
            "Referral changed elsewhere — reload and try again",
            status_code=409,
            code="version_conflict",
        )
    if case.status == CaseStatus.CLOSED:
        raise AppError("This case is closed", status_code=409, code="case_closed")

    referral.status = ReferralStatus.FINALIZED
    referral.finalized_by_user_id = user.id
    referral.finalized_at = datetime.now().astimezone()
    case.status = CaseStatus.REFERRED

    record_audit(
        db,
        AuditAction.REFERRAL_FINALIZED,
        user=user,
        case=case,
        metadata={
            "referral_id": referral.public_id,
            "version": referral.version,
            "destination": referral.destination_facility,
        },
    )

    title = f"Referral finalized — {case.case_number}"
    body = (
        f"Referred to {referral.destination_facility}"
        if referral.destination_facility
        else "Referral finalized for this case"
    )
    notify_users(
        db,
        [referral.created_by_user_id],
        type="REFERRAL_FINALIZED",
        title=title,
        body=body,
        case_id=case.id,
        exclude_user_id=user.id,
    )
    patient = case.patient
    if patient is not None and patient.user_id:
        notify(
            db,
            user_id=patient.user_id,
            type="REFERRAL_FINALIZED",
            title=title,
            body=body,
            case_id=case.id,
        )
    db.commit()

    creator = db.get(User, referral.created_by_user_id)
    if creator and creator.email:
        try:
            send_referral_status_email(db, creator, case.case_number, "FINALIZED", case.id)
        except Exception as exc:
            logger.warning("[Referrals] Referral email failed: %s", exc)

    db.refresh(referral)
    return _referral_out(db, referral)


@router.post("/{referral_id}/revise", response_model=ReferralOut, status_code=201)
def revise_referral(
    referral_id: int,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    original, case = _referral_or_403(db, user, referral_id)
    if original.status == ReferralStatus.DRAFT:
        raise AppError(
            "Draft referrals can be edited directly with PATCH",
            status_code=409,
            code="already_draft",
        )

    revision = Referral(
        public_id=uuid.uuid4().hex[:32],
        case_id=case.id,
        created_by_user_id=user.id,
        destination_facility=original.destination_facility,
        reason_for_referral=original.reason_for_referral,
        draft=dict(original.draft or {}),
        status=ReferralStatus.DRAFT,
        version=original.version + 1,
        supersedes_id=original.id,
    )
    db.add(revision)
    record_audit(
        db,
        AuditAction.REFERRAL_REVISED,
        user=user,
        case=case,
        metadata={
            "referral_id": revision.public_id,
            "supersedes_id": original.public_id,
            "version": revision.version,
            "previous_status": original.status.value,
        },
    )
    db.commit()
    db.refresh(revision)
    return _referral_out(db, revision)
