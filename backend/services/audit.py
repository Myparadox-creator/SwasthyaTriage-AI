"""Audit trail writer. Every important action must be recorded."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from models import AuditLog, Case, User


class AuditAction:
    CONSENT_RECORDED = "CONSENT_RECORDED"
    CASE_CREATED = "CASE_CREATED"
    CASE_UPDATED = "CASE_UPDATED"
    CASE_SUBMITTED = "CASE_SUBMITTED"
    VOICE_SESSION_STARTED = "VOICE_SESSION_STARTED"
    VOICE_SESSION_COMPLETED = "VOICE_SESSION_COMPLETED"
    CHAT_MESSAGE_RECEIVED = "CHAT_MESSAGE_RECEIVED"
    REPORT_UPLOADED = "REPORT_UPLOADED"
    OCR_PROCESSED = "OCR_PROCESSED"
    AI_SUMMARY_GENERATED = "AI_SUMMARY_GENERATED"
    SAFETY_SIGNAL_GENERATED = "SAFETY_SIGNAL_GENERATED"
    CASE_VIEWED = "CASE_VIEWED"
    DOCUMENT_VIEWED = "DOCUMENT_VIEWED"
    DOCUMENT_DELETED = "DOCUMENT_DELETED"
    CASE_REVIEWED = "CASE_REVIEWED"
    REVIEWER_NOTE_ADDED = "REVIEWER_NOTE_ADDED"
    FOLLOW_UP_REQUESTED = "FOLLOW_UP_REQUESTED"
    FOLLOW_UP_STARTED = "FOLLOW_UP_STARTED"
    FOLLOW_UP_COMPLETED = "FOLLOW_UP_COMPLETED"
    FOLLOW_UP_CANCELLED = "FOLLOW_UP_CANCELLED"
    TELECALL_COMPLETED = "TELECALL_COMPLETED"
    TELECALL_DIALED = "TELECALL_DIALED"
    TELECALL_FAILED = "TELECALL_FAILED"
    TELECALL_REQUESTED = "TELECALL_REQUESTED"
    CALLBACK_WEBHOOK_RECEIVED = "CALLBACK_WEBHOOK_RECEIVED"
    CASE_UPDATED_BY_EXTRACTION = "CASE_UPDATED_BY_EXTRACTION"
    REFERRAL_GENERATED = "REFERRAL_GENERATED"
    REFERRAL_UPDATED = "REFERRAL_UPDATED"
    REFERRAL_REVISED = "REFERRAL_REVISED"
    REFERRAL_VERIFIED = "REFERRAL_VERIFIED"
    REFERRAL_FINALIZED = "REFERRAL_FINALIZED"
    CASE_ESCALATED = "CASE_ESCALATED"
    EXCEL_EXPORTED = "EXCEL_EXPORTED"
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    USER_CREATED = "USER_CREATED"
    USER_PASSWORD_RESET = "USER_PASSWORD_RESET"
    FACILITY_CREATED = "FACILITY_CREATED"
    SAFETY_RULE_UPDATED = "SAFETY_RULE_UPDATED"
    AI_CONFIG_UPDATED = "AI_CONFIG_UPDATED"
    EMAIL_TEST_DISPATCHED = "EMAIL_TEST_DISPATCHED"
    EMAIL_RETRY = "EMAIL_RETRY"
    EVIDENCE_GENERATED = "EVIDENCE_GENERATED"
    EVIDENCE_REVIEWED = "EVIDENCE_REVIEWED"
    EVALUATION_RUN_RECORDED = "EVALUATION_RUN_RECORDED"


def record_audit(
    db: Session,
    action: str,
    *,
    user: User | None = None,
    case: Case | None = None,
    facility_id: int | None = None,
    source: str = "WEB",
    metadata: dict[str, Any] | None = None,
    commit: bool = False,
) -> AuditLog:
    log = AuditLog(
        action=action,
        actor_user_id=user.id if user else None,
        actor_label=user.full_name if user else "SYSTEM",
        actor_role=user.role if user else None,
        case_id=case.id if case else None,
        case_number=case.case_number if case else None,
        facility_id=facility_id
        if facility_id is not None
        else (case.facility_id if case else None) or (user.facility_id if user else None),
        source=source,
        metadata_json=metadata,
    )
    db.add(log)
    if commit:
        db.commit()
    else:
        db.flush()
    return log
