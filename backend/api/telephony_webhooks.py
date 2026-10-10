"""Provider call-status webhooks.

VideoSDK (and any future PSTN provider) can POST call lifecycle updates here.
The endpoint is only active when `TELEPHONY_WEBHOOK_SECRET` is configured; the
body is authenticated with an HMAC-SHA256 signature so status is never accepted
from an unverified caller. Updates are idempotent.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from database.session import get_db
from middleware.errors import AppError
from models import TeleCall
from models.enums import CallStatus
from schemas.telephony import TeleCallWebhookPayload
from services.audit import AuditAction, record_audit

logger = logging.getLogger("swasthyatriage.telephony.webhooks")

router = APIRouter(prefix="/api/telephony/webhooks", tags=["telephony"])

_SIGNATURE_HEADERS = ("x-snapserve-signature", "x-telephony-signature", "x-videosdk-signature")

_TERMINAL = (
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.NO_ANSWER,
    CallStatus.CANCELLED,
)


def _verify_signature(raw_body: bytes, provided: str | None) -> bool:
    secret = settings.telephony_webhook_secret
    if not secret or not provided:
        return False
    candidate = provided.split("=", 1)[1] if "=" in provided else provided
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, candidate.strip().lower())


def _find_call(db: Session, payload: TeleCallWebhookPayload) -> TeleCall | None:
    if payload.call_public_id:
        call = db.scalar(select(TeleCall).where(TeleCall.public_id == payload.call_public_id))
        if call:
            return call
    if payload.external_call_id:
        return db.scalar(
            select(TeleCall).where(TeleCall.external_call_id == payload.external_call_id)
        )
    return None


@router.post("/{provider}")
async def receive_call_status(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    if not settings.telephony_webhook_secret:
        raise AppError(
            "Call-status webhooks are not configured for this deployment",
            status_code=501,
            code="webhook_not_configured",
        )

    raw_body = await request.body()
    provided = next(
        (request.headers.get(h) for h in _SIGNATURE_HEADERS if request.headers.get(h)),
        None,
    )
    if not _verify_signature(raw_body, provided):
        raise AppError(
            "Invalid webhook signature", status_code=401, code="invalid_signature"
        )

    payload = TeleCallWebhookPayload.model_validate_json(raw_body)

    call = _find_call(db, payload)
    if call is None:
        logger.warning("Webhook (%s) referenced an unknown call: %s", provider, payload)
        return {"status": "ignored", "reason": "unknown_call"}

    # Idempotent: ignore repeats of a status we have already applied.
    if call.status == payload.status:
        return {"status": "ignored", "reason": "duplicate"}

    now = datetime.now(UTC)
    previous = call.status
    call.status = payload.status
    if payload.error_detail:
        call.error_detail = payload.error_detail
    if payload.duration_seconds is not None:
        call.duration_seconds = payload.duration_seconds
    if payload.status == CallStatus.CONNECTED and call.answered_at is None:
        call.answered_at = now
    if payload.status in _TERMINAL and call.ended_at is None:
        call.ended_at = now

    record_audit(
        db,
        AuditAction.CALLBACK_WEBHOOK_RECEIVED,
        case=None,
        facility_id=None,
        metadata={
            "provider": provider,
            "call_public_id": call.public_id,
            "previous_status": previous.value,
            "status": payload.status.value,
        },
    )
    db.commit()
    return {"status": "ok", "call_public_id": call.public_id, "call_status": call.status.value}
