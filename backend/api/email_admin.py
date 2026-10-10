"""Admin email settings, outbox inspection, test-email sender, and Resend webhooks."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from config import settings
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from middleware.ratelimit import limiter
from models import User
from models.email import EmailLog
from models.enums import Role
from schemas.auth import AdminEmailTestRequest, MessageResponse
from services.audit import AuditAction, record_audit
from services.email import dispatch_email, email_provider_info, retry_failed_email

logger = logging.getLogger("swasthyatriage.email")

router = APIRouter(tags=["email_admin"])

ADMIN_ROLES = (Role.SUPER_ADMIN, Role.FACILITY_ADMIN)

# Resend event type -> EmailLog.status
RESEND_EVENT_STATUS = {
    "email.sent": "SENT",
    "email.delivered": "DELIVERED",
    "email.delivery_delayed": "SENT",
    "email.complained": "FAILED",
    "email.bounced": "BOUNCED",
    "email.opened": "OPENED",
    "email.clicked": "CLICKED",
}


class EmailStatusResponse(BaseModel):
    provider: str = "Transactional Email"
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


def verify_resend_signature(
    secret: str,
    svix_id: str | None,
    svix_timestamp: str | None,
    svix_signature: str | None,
    raw_body: bytes,
) -> bool:
    """Verifies a Resend (Svix) webhook signature.

    Signed content is ``{svix_id}.{svix_timestamp}.{body}`` HMAC-SHA256'd with the
    base64-decoded signing secret, matching the Svix specification.
    """
    if not (svix_id and svix_timestamp and svix_signature):
        return False

    encoded_secret = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(encoded_secret)
    except Exception:
        return False

    signed_content = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(
        hmac.new(key, signed_content, hashlib.sha256).digest()
    ).decode()

    for part in svix_signature.split(" "):
        _, _, sig = part.partition(",")
        if sig and hmac.compare_digest(sig, expected):
            return True
    return False


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
            "provider_message_id": log.provider_message_id,
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

    info = email_provider_info()

    return EmailStatusResponse(
        provider=info["provider"],
        configured=info["configured"],
        delivery_mode=settings.email_delivery_mode,
        sender_email=info["sender_email"],
        sender_name=info["sender_name"],
        reply_to_email=info["reply_to_email"],
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

    info = email_provider_info()
    try:
        log_entry = dispatch_email(
            db,
            recipient_email=target_email,
            recipient_name=admin.full_name,
            template_name="security_alert",
            context={
                "name": admin.full_name,
                "action_title": payload.subject or "Admin Email Connectivity Test",
                "details": payload.message
                or f"Successfully validated {info['provider']} integration for {info['sender_name']} in {settings.email_delivery_mode.upper()} mode.",
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
        raise AppError(f"Failed to send test email: {exc}", status_code=502) from exc

    if log_entry.status == "FAILED":
        raise AppError(
            f"{info['provider']} rejected the test email: {log_entry.error_detail}",
            status_code=502,
        )

    return MessageResponse(
        message=f"Test email successfully dispatched to {target_email} (Status: {log_entry.status}, Message ID: {log_entry.provider_message_id or 'mock'})"
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


# --- Resend Transactional Webhooks (Svix-signed) ---

@router.post("/api/webhooks/resend")
async def resend_webhook_receiver(
    request: Request,
    db: Session = Depends(get_db),
    svix_id: str | None = Header(None, alias="svix-id"),
    svix_timestamp: str | None = Header(None, alias="svix-timestamp"),
    svix_signature: str | None = Header(None, alias="svix-signature"),
):
    """Ingests Resend transactional webhook events (delivered, opened, bounce, etc.)."""
    raw_body = await request.body()

    # Verify Svix signature when a signing secret is configured
    if settings.resend_webhook_secret and not verify_resend_signature(
        settings.resend_webhook_secret, svix_id, svix_timestamp, svix_signature, raw_body
    ):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    try:
        import json

        body = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from None

    # Resend delivers a single event object; tolerate arrays as well.
    events = body if isinstance(body, list) else [body]

    processed = 0
    for evt in events:
        if not isinstance(evt, dict):
            continue

        event_type = (evt.get("type") or "").lower()
        data = evt.get("data") or {}
        msg_id = data.get("email_id") or data.get("id")

        if not msg_id:
            continue

        log = db.scalar(
            select(EmailLog).where(EmailLog.provider_message_id == str(msg_id))
        )

        if log:
            new_status = RESEND_EVENT_STATUS.get(event_type)
            if new_status:
                log.status = new_status
            if event_type in ("email.bounced", "email.complained", "email.failed"):
                detail = data.get("bounce") or data.get("reason") or event_type
                log.error_detail = f"Resend {event_type.split('.')[-1]}: {detail}"

            meta = dict(log.email_metadata or {})
            meta[f"webhook_{event_type}"] = evt.get("created_at")
            log.email_metadata = meta
            processed += 1

    db.commit()
    return {"status": "ok", "processed": processed}
