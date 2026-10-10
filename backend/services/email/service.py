"""High-level transactional email orchestration service for SwasthyaFlow AI."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from models import User
from models.email import EmailLog, EmailVerificationToken, PasswordResetToken
from services.email.base import EmailError
from services.email.client import get_email_client
from services.email.templates import render_email_template

logger = logging.getLogger("swasthyatriage.email")


def _hash_token(raw_token: str) -> str:
    """Computes SHA-256 hash of a security token so plaintext is never stored."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def dispatch_email(
    db: Session,
    *,
    recipient_email: str,
    template_name: str,
    context: dict,
    recipient_name: str | None = None,
) -> EmailLog:
    """Renders template, records EmailLog, and attempts delivery via Resend."""
    # Ensure default app_url in context
    if "app_url" not in context:
        context["app_url"] = settings.app_base_url

    subject, html_content, text_content = render_email_template(template_name, context)

    # 1. Create outbox audit record
    log_entry = EmailLog(
        recipient_email=recipient_email.strip().lower(),
        recipient_name=recipient_name,
        template_name=template_name,
        subject=subject,
        status="PENDING",
        attempts=0,
        email_metadata={
            "template": template_name,
            "created_at": datetime.now(UTC).isoformat(),
        },
    )
    db.add(log_entry)
    db.flush()

    # 2. Attempt delivery through the configured provider
    client = get_email_client()
    try:
        res = client.send_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            tags=[template_name],
        )
        log_entry.status = "SENT"
        log_entry.provider_message_id = res.get("messageId")
        log_entry.sent_at = datetime.now(UTC)
        log_entry.attempts += 1
    except EmailError as exc:
        log_entry.status = "FAILED"
        log_entry.attempts += 1
        log_entry.error_detail = str(exc)[:500]
        logger.warning(
            "[Email Service] Failed delivery for log_id=%d to %s: %s",
            log_entry.id,
            recipient_email,
            exc,
        )

    db.commit()
    return log_entry


# --- Security & Auth Flows ---

def create_and_send_verification_email(db: Session, user: User) -> str:
    """Generates a single-use verification token, saves its hash, and dispatches the email."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(hours=24)

    # Invalidate old unused verification tokens
    old_tokens = db.scalars(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.verified_at.is_(None),
        )
    ).all()
    for ot in old_tokens:
        ot.expires_at = datetime.now(UTC)

    v_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(v_token)
    db.flush()

    dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="email_verification",
        context={
            "name": user.full_name,
            "token": raw_token,
            "expires_hours": 24,
        },
    )
    return raw_token


def verify_email_token(db: Session, raw_token: str) -> User | None:
    """Validates raw token against stored hash and marks email verified."""
    token_hash = _hash_token(raw_token)
    now = datetime.now(UTC)
    record = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.verified_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
    )
    if not record:
        return None

    record.verified_at = now
    user = db.scalar(select(User).where(User.id == record.user_id))
    db.commit()
    return user


def create_and_send_password_reset_email(
    db: Session, user: User, app_url: str | None = None
) -> str:
    """Generates a secure password reset token, saves its hash, and dispatches reset email."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(minutes=30)

    # Invalidate older pending reset tokens
    old_tokens = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).all()
    for ot in old_tokens:
        ot.expires_at = datetime.now(UTC)

    p_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(p_token)
    db.flush()

    dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="password_reset",
        context={
            "name": user.full_name,
            "token": raw_token,
            "expires_minutes": 30,
            "app_url": (app_url or settings.app_base_url).rstrip("/"),
        },
    )
    return raw_token


def verify_password_reset_token(db: Session, raw_token: str) -> User | None:
    """Validates reset token and returns the user if token is valid and unexpired."""
    token_hash = _hash_token(raw_token)
    now = datetime.now(UTC)
    record = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    if not record:
        return None

    user = db.scalar(select(User).where(User.id == record.user_id))
    return user


def mark_password_reset_token_used(db: Session, raw_token: str) -> None:
    """Marks the reset token as used so it cannot be replayed."""
    token_hash = _hash_token(raw_token)
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    if record:
        record.used_at = datetime.now(UTC)
        db.commit()


# --- Event Helpers ---

def send_welcome_email(db: Session, user: User) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="welcome",
        context={
            "name": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        },
    )


def send_password_changed_email(db: Session, user: User) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="password_changed",
        context={
            "name": user.full_name,
            "time_str": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        },
    )


def send_staff_invitation_email(
    db: Session, user: User, facility_name: str, invite_token: str = ""
) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="staff_invitation",
        context={
            "name": user.full_name,
            "facility_name": facility_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "token": invite_token,
        },
    )


def send_encounter_assignment_email(
    db: Session, user: User, case_number: str, case_id: int
) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="encounter_assignment",
        context={
            "name": user.full_name,
            "case_number": case_number,
            "case_id": case_id,
        },
    )


def send_clarification_request_email(
    db: Session, user: User, case_number: str, case_id: int
) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="clarification_request",
        context={
            "name": user.full_name,
            "case_number": case_number,
            "case_id": case_id,
        },
    )


def send_referral_status_email(
    db: Session, user: User, case_number: str, status: str, case_id: int
) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="referral_status",
        context={
            "name": user.full_name,
            "case_number": case_number,
            "status": status,
            "case_id": case_id,
        },
    )


def send_security_alert_email(
    db: Session, user: User, action_title: str, details: str
) -> EmailLog:
    return dispatch_email(
        db,
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_name="security_alert",
        context={
            "name": user.full_name,
            "action_title": action_title,
            "details": details,
            "time_str": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        },
    )


def send_sonam_call_request_email(
    db: Session,
    *,
    requester_name: str,
    requester_email: str | None,
    phone: str | None,
    language: str | None,
    purpose: str | None,
    case_number: str | None = None,
    source: str = "Patient portal",
) -> EmailLog | None:
    """Alert the platform admin that a user wants to talk to the Sonam agent."""
    recipient = (settings.admin_notification_email or "").strip()
    if not recipient:
        return None
    return dispatch_email(
        db,
        recipient_email=recipient,
        recipient_name="Platform Admin",
        template_name="sonam_call_request",
        context={
            "requester_name": requester_name,
            "requester_email": requester_email or "",
            "phone": phone or "",
            "language": language or "en",
            "purpose": purpose or "",
            "case_number": case_number or "",
            "source": source,
            "time_str": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        },
    )


def retry_failed_email(db: Session, log_id: int) -> EmailLog | None:
    """Retries sending a previously failed email from the outbox."""
    log = db.scalar(select(EmailLog).where(EmailLog.id == log_id))
    if not log or log.status not in ("FAILED", "PENDING"):
        return log

    client = get_email_client()
    try:
        # Re-render or use cached subject
        subject, html_content, text_content = render_email_template(
            log.template_name,
            {"name": log.recipient_name, "app_url": settings.app_base_url},
        )
        res = client.send_email(
            recipient_email=log.recipient_email,
            recipient_name=log.recipient_name,
            subject=log.subject or subject,
            html_content=html_content,
            text_content=text_content,
            tags=[log.template_name],
        )
        log.status = "SENT"
        log.provider_message_id = res.get("messageId")
        log.sent_at = datetime.now(UTC)
        log.error_detail = None
        log.attempts += 1
    except EmailError as exc:
        log.attempts += 1
        log.error_detail = f"Retry failed: {exc}"[:500]

    db.commit()
    return log
