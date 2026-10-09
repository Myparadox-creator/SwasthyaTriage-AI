"""Strictly self-scoped notifications."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.session import get_db
from middleware.errors import AppError
from models import Notification, User
from schemas.notifications import (
    NotificationListResponse,
    NotificationOut,
    ReadAllResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _owned_or_404(db: Session, user: User, notification_id: int) -> Notification:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise AppError("Notification not found", status_code=404, code="notification_not_found")
    return notification


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    unread_only: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc())

    total = db.scalar(
        select(func.count()).select_from(stmt.subquery())
    ) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    unread_count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ) or 0
    return NotificationListResponse(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        unread_count=unread_count,
        page=page,
        per_page=per_page,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ) or 0
    return UnreadCountResponse(unread_count=count)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = _owned_or_404(db, user, notification_id)
    if notification.read_at is None:
        notification.read_at = datetime.now().astimezone()
        db.commit()
    return notification


@router.post("/read-all", response_model=ReadAllResponse)
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    unread = db.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).all()
    now = datetime.now().astimezone()
    for n in unread:
        n.read_at = now
    db.commit()
    return ReadAllResponse(updated=len(unread))