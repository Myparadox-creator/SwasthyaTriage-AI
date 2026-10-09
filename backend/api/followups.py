"""Follow-up detail and lifecycle endpoints (start / complete / cancel).

Create and list stay in api/reviews.py. Every action requires a staff role
and is facility-scoped through get_case_or_403 on the follow-up's case.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from api.reviews import STAFF_ROLES, _followup_out
from auth.dependencies import require_roles
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from models import Case, FollowUp, User
from models.enums import FollowUpStatus
from repositories.cases import get_case_or_403
from schemas.case import (
    FollowUpCancelRequest,
    FollowUpCompleteRequest,
    FollowUpOut,
)
from services.audit import AuditAction, record_audit
from services.followups import complete_followup

router = APIRouter(prefix="/api/followups", tags=["followups"])


def _followup_or_403(db: Session, user: User, followup_id: int) -> tuple[FollowUp, Case]:
    followup = db.get(FollowUp, followup_id)
    if followup is None:
        raise NotFoundError("Follow-up not found")
    case = get_case_or_403(db, user, followup.case_id)
    return followup, case


@router.get("/{followup_id}", response_model=FollowUpOut)
def get_followup(
    followup_id: int,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    followup, _ = _followup_or_403(db, user, followup_id)
    return _followup_out(db, followup)


@router.post("/{followup_id}/start", response_model=FollowUpOut)
def start_followup(
    followup_id: int,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    followup, case = _followup_or_403(db, user, followup_id)
    if followup.status == FollowUpStatus.IN_PROGRESS:
        raise AppError(
            "This follow-up has already been started",
            status_code=409,
            code="already_started",
        )
    if followup.status != FollowUpStatus.PENDING:
        raise AppError(
            "Only pending follow-ups can be started",
            status_code=409,
            code="invalid_transition",
        )
    followup.status = FollowUpStatus.IN_PROGRESS
    followup.updated_at = datetime.now().astimezone()
    record_audit(
        db,
        AuditAction.FOLLOW_UP_STARTED,
        user=user,
        case=case,
        metadata={"followup_id": followup.public_id, "channel": followup.channel.value},
    )
    db.commit()
    db.refresh(followup)
    return _followup_out(db, followup)


@router.post("/{followup_id}/complete", response_model=FollowUpOut)
def complete_followup_endpoint(
    followup_id: int,
    payload: FollowUpCompleteRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    followup, _ = _followup_or_403(db, user, followup_id)
    complete_followup(
        db,
        followup,
        answers=payload.answers,
        summary=payload.summary,
        actor=user,
    )
    db.commit()
    db.refresh(followup)
    return _followup_out(db, followup)


@router.post("/{followup_id}/cancel", response_model=FollowUpOut)
def cancel_followup(
    followup_id: int,
    payload: FollowUpCancelRequest | None = Body(default=None),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    followup, case = _followup_or_403(db, user, followup_id)
    if followup.status not in {FollowUpStatus.PENDING, FollowUpStatus.IN_PROGRESS}:
        raise AppError(
            "Only pending or in-progress follow-ups can be cancelled",
            status_code=409,
            code="invalid_transition",
        )
    followup.status = FollowUpStatus.CANCELLED
    followup.updated_at = datetime.now().astimezone()
    record_audit(
        db,
        AuditAction.FOLLOW_UP_CANCELLED,
        user=user,
        case=case,
        metadata={
            "followup_id": followup.public_id,
            "reason": payload.reason if payload else None,
        },
    )
    db.commit()
    db.refresh(followup)
    return _followup_out(db, followup)
