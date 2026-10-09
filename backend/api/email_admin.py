"""Admin email settings, outbox inspection, test-email sender, and Brevo webhooks."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_roles
from config import settings
from database.session import get_db
from middleware.errors import AppError, ForbiddenError, NotFoundError
from middleware.ratelimit import limiter
from models import User
from models.email import EmailLog
from models.enums import Role
from schemas.auth import AdminEmailTestRequest, MessageResponse
from services.audit import AuditAction, record_audit
from services.email import BrevoClient, dispatch_email, retry_failed_email

logger = logging.getLogger("swasthyatriage.email")

router = APIRouter(tags=["email_admin"])

ADMIN_ROLES = (Role.SUPER_ADMIN, Role.FACILITY_ADMIN)


class EmailStatusResponse(BaseModel):
    provider: str = "Brevo Transactional Email"
    configured: bool
    delivery_mode: str
    sender_email: str
    sender_name: str
    reply_to_email: str
    recent_sent_count: int
    recent_failed_count: int
    recent_delivered_count: int
    recent_stats: dict[str, int] = {}
    recent_logs: list[dict[str, Any]] = []
    templates: list[dict[str, str]] = []


@router.get("/api/admin/email/status", response_model=EmailStatusResponse)
def get_email_status(
    admin: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Inspects provider connectivity, sender identity, and recent outbox statistics."""
    sent_count = (
        db.scalar(
            select(func.count(EmailLog.id)).where(EmailLog.status.in_(("SENT", "DELIVERED")))
        )
        or 0
    )
    failed_count = (
        db.scalar(select(func.count(EmailLog.id)).where(EmailLog.status == "FAILED")) or 0
    )
    delivered_count = (
        db.scalar(select(func.count(EmailLog.id)).where(EmailLog.status == "DELIVERED")) or 0
    )

    recent = db.scalars(
        select(EmailLog).order_by(desc(EmailLog.created_at)).limit(15)
    ).all()

    logs_list = [
        {
            "id": log.id,
            "recipient": log.recipient_email,
            "recipient_email": log.recipient_email,
            "template_name": log.template_name,
            "subject": log.subject,
            "status": log.status.lower(),
            "brevo_message_id": log.brevo_message_id,
            "attempts": log.attempts,
            "retry_count": log.attempts,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "error_detail": log.error_detail,
        }
        for log in recent
    ]

    templates_catalog = [
        {"name": "welcome", "description": "Welcome to SwasthyaFlow AI", "purpose": "Account onboarding"},
        {"name": "email_verification", "description": "Email Verification", "purpose": "Verify email address CTA"},
        {"name": "password_reset", "description": "Password Reset", "purpose": "Single-use SHA-256 reset link"},
        {"name": "password_changed", "description": "Password Changed Confirmation", "purpose": "Security notification"},
        {"name": "staff_invitation", "description": "Staff Invitation", "purpose": "Clinician facility onboarding"},
        {"name": "encounter_assignment", "description": "Encounter Assignment", "purpose": "Triage review assignment"},
        {"name": "clarification_request", "description": "Clarification Request", "purpose": "Clinical followup clarification"},
        {"name": "referral_status", "description": "Referral Status", "purpose": "Clinical handoff update"},
        {"name": "security_alert", "description": "Important Security Alert", "purpose": "Security event alert"},
    ]

    return EmailStatusResponse(
        provider="Brevo Transactional Email",
        configured=bool(settings.brevo_api_key),
        delivery_mode=settings.email_delivery_mode,
        sender_email=settings.brevo_sender_email,
        sender_name=settings.brevo_sender_name,
        reply_to_email=settings.brevo_reply_to_email,
        recent_sent_count=sent_count,
        recent_failed_count=failed_count,
        recent_delivered_count=delivered_count,
        recent_stats={
            "total": sent_count + failed_count,
            "sent": sent_count,
            "delivered": delivered_count,
            "failed": failed_count,
        },
        recent_logs=logs_list,
        templates=templates_catalog,
    )


@router.post("/api/admin/email/test", response_model=MessageResponse)
@limiter.limit("5/minute")
def send_admin_test_email(
    payload: AdminEmailTestRequest,
    request: Request,
    admin: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Sends a transactional test email to the currently authenticated administrator."""
    # Ensure test email only goes to the authenticated administrator
    target_email = admin.email
    if not target_email or "@" not in target_email:
        raise AppError("Administrator does not have a valid email configured", status_code=400)

    test_context = {
        "name": admin.full_name,
        "message": payload.message
        or "This is a verified test email sent via Brevo Transactional Email System from SwasthyaFlow AI.",
        "app_url": settings.app_base_url,
    }

    try:
        log_entry = dispatch_email(
            db,
            recipient_email=target_email,
            recipient_name=admin.full_name,
            template_name="security_alert",
            context={
                "name": admin.full_name,
                "action_title": payload.subject or "Admin Brevo Connectivity Test",
                "details": payload.message
                or f"Successfully validated Brevo API integration for {settings.brevo_sender_name} in {settings.email_delivery_mode.upper()} mode.",
            },
        )
        record_audit(
            db,
            AuditAction.EMAIL_TEST_DISPATCHED,
            user=admin,
            metadata={"action": "send_test_email", "status": log_entry.status},
        )
    except Exception as exc:
        logger.error("[Admin Email] Test email failed: %s", exc)
        raise AppError(f"Failed to send test email: {exc}", status_code=502)

    if log_entry.status == "FAILED":
        raise AppError(
            f"Brevo provider rejected the test email: {log_entry.error_detail}",
            status_code=502,
        )

    return MessageResponse(
        message=f"Test email successfully dispatched to {target_email} (Status: {log_entry.status}, Message ID: {log_entry.brevo_message_id or 'mock'})"
    )


@router.post("/api/admin/email/retry/{log_id}", response_model=MessageResponse)
def retry_email(
    log_id: int,
    admin: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Retries a failed email from the outbox."""
    log = retry_failed_email(db, log_id)
    if not log:
        raise NotFoundError("Email log entry not found")
    record_audit(
        db,
        AuditAction.EMAIL_RETRY,
        user=admin,
        metadata={"action": "retry_email", "log_id": log_id, "result": log.status},
    )
    if log.status == "FAILED":
        raise AppError(f"Retry attempt failed: {log.error_detail}", status_code=502)
    return MessageResponse(message=f"Email retried successfully (Status: {log.status})")


# --- Brevo Transactional Webhooks ---

@router.post("/api/webhooks/brevo")
async def brevo_webhook_receiver(
    request: Request,
    db: Session = Depends(get_db),
    x_webhook_secret: str | None = Header(None, alias="X-Brevo-Webhook-Secret"),
):
    """Ingests Brevo transactional webhook events (sent, delivered, opened, bounce, etc.)."""
    # Verify webhook secret if configured
    if settings.brevo_webhook_secret and x_webhook_secret != settings.brevo_webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Brevo can deliver single object or array of events
    events = body if isinstance(body, list) else [body]

    processed = 0
    for evt in events:
        if not isinstance(evt, dict):
            continue

        event_type = (evt.get("event") or "").lower()
        msg_id = evt.get("message-id") or evt.get("messageId")

        if not msg_id:
            continue

        # Find matching outbox log
        log = db.scalar(
            select(EmailLog).where(EmailLog.brevo_message_id == str(msg_id))
        )
        if not log:
            # Try matching by bare message-id without brackets
            bare_id = str(msg_id).strip("<>")
            log = db.scalar(
                select(EmailLog).where(EmailLog.brevo_message_id.contains(bare_id))
            )

        if log:
            if event_type in ("delivered", "request"):
                log.status = "DELIVERED"
            elif event_type in ("opened", "unique_opened"):
                log.status = "OPENED"
            elif event_type in ("click",):
                log.status = "CLICKED"
            elif event_type in ("soft_bounce", "hard_bounce", "invalid_email"):
                log.status = "BOUNCED"
                log.error_detail = f"Brevo bounce: {evt.get('reason', event_type)}"
            elif event_type in ("blocked", "error"):
                log.status = "FAILED"
                log.error_detail = f"Brevo error: {evt.get('reason', event_type)}"

            meta = dict(log.email_metadata or {})
            meta[f"webhook_{event_type}"] = evt.get("date") or evt.get("ts_event")
            log.email_metadata = meta
            processed += 1

    db.commit()
    return {"status": "ok", "processed": processed}
