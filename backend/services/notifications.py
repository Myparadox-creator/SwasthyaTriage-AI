"""Self-scoped in-app notifications."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from models import Notification, User

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class NotificationType:
    CASE_SUBMITTED = "case_submitted"
    CASE_REVIEWED = "case_reviewed"
    SAFETY_SIGNAL = "safety_signal"
    FOLLOW_UP_REQUESTED = "follow_up_requested"
    FOLLOW_UP_COMPLETED = "follow_up_completed"
    FOLLOW_UP_CANCELLED = "follow_up_cancelled"
    REFERRAL_VERIFIED = "referral_verified"
    REFERRAL_FINALIZED = "referral_finalized"


STAFF_ROLES = ("HEALTHCARE_WORKER", "FACILITY_ADMIN", "SUPER_ADMIN")


def notify(
    db: Session,
    *,
    user_id: int | None,
    type: str,
    title: str,
    body: str | None = None,
    case_id: int | None = None,
) -> Notification | None:
    """Create a notification for a single user. No-op for unknown users."""
    if user_id is None:
        return None
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        case_id=case_id,
    )
    db.add(notification)
    return notification


def notify_users(
    db: Session,
    user_ids: list[int],
    *,
    type: str,
    title: str,
    body: str | None = None,
    case_id: int | None = None,
    exclude_user_id: int | None = None,
) -> int:
    """Notify each recipient once, skipping the actor. Returns the count sent."""
    count = 0
    seen: set[int] = set()
    for user_id in user_ids:
        if user_id is None or user_id in seen:
            continue
        seen.add(user_id)
        if user_id == exclude_user_id:
            continue
        if notify(
            db,
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            case_id=case_id,
        ) is not None:
            count += 1
    return count


def staff_user_ids(db: Session, facility_id: int | None, *, exclude_user_id: int | None = None) -> list[int]:
    stmt = select(User.id).where(
        User.is_active.is_(True),
        User.role.in_(STAFF_ROLES),
    )
    if facility_id is not None:
        fac_stmt = stmt.where(User.facility_id == facility_id)
        if exclude_user_id is not None:
            fac_stmt = fac_stmt.where(User.id != exclude_user_id)
        uids = list(db.scalars(fac_stmt).all())
        if uids:
            return uids

    # Fallback to all active clinical staff so doctor notification is never dropped
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return list(db.scalars(stmt).all())


def notify_facility_staff(
    db: Session,
    *,
    facility_id: int | None,
    type: str,
    title: str,
    body: str | None = None,
    case_id: int | None = None,
    exclude_user_id: int | None = None,
) -> int:
    """Notify every active staff user at a facility. Returns how many were notified."""
    count = 0
    for uid in staff_user_ids(db, facility_id, exclude_user_id=exclude_user_id):
        if notify(db, user_id=uid, type=type, title=title, body=body, case_id=case_id) is not None:
            count += 1
    return count