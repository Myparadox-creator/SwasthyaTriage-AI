"""Data-retention policy and the purge routine that enforces it.

Nothing clinical is discarded here: this removes expired *credentials* (password
reset / email verification / refresh tokens), stale operational email logs, and
— only when explicitly enabled — aged voice transcripts. Patient case records
are retained for care and audit, and are pseudonymised on erasure instead.

The purge is idempotent and safe to run repeatedly (e.g. from an admin endpoint
or a scheduled job).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from config import settings
from models import (
    CallTranscript,
    EmailLog,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
    VoiceMessage,
)


@dataclass
class RetentionReport:
    """How many records of each kind a purge run removed."""

    expired_password_resets: int = 0
    expired_email_verifications: int = 0
    expired_refresh_tokens: int = 0
    purged_email_logs: int = 0
    purged_voice_transcripts: int = 0

    @property
    def total(self) -> int:
        return (
            self.expired_password_resets
            + self.expired_email_verifications
            + self.expired_refresh_tokens
            + self.purged_email_logs
            + self.purged_voice_transcripts
        )

    def as_dict(self) -> dict[str, int]:
        return {
            "expired_password_resets": self.expired_password_resets,
            "expired_email_verifications": self.expired_email_verifications,
            "expired_refresh_tokens": self.expired_refresh_tokens,
            "purged_email_logs": self.purged_email_logs,
            "purged_voice_transcripts": self.purged_voice_transcripts,
            "total": self.total,
        }


def retention_policy() -> dict:
    """Human-readable summary of the retention rules currently in force."""
    return {
        "auth_tokens": {
            "rule": "Expired or revoked authentication tokens are deleted.",
            "grace_days": settings.auth_token_grace_days,
        },
        "email_logs": {
            "rule": "Transactional email delivery logs are deleted after the window.",
            "retention_days": settings.email_log_retention_days,
        },
        "voice_transcripts": {
            "rule": (
                "Voice/call transcripts are deleted after the window when configured; "
                "otherwise they are kept for the life of the case and scrubbed on erasure."
            ),
            "retention_days": settings.voice_transcript_retention_days or None,
        },
        "clinical_records": {
            "rule": (
                "Case and clinical records are retained for care and audit, and "
                "pseudonymised on a verified erasure request."
            ),
            "retention_days": None,
        },
        "logs": {
            "rule": (
                "Application logs are processed through a PII redaction filter; "
                "phone numbers, emails and national IDs never reach the log sink in clear."
            ),
            "retention_days": None,
        },
    }


def purge_expired_data(db: Session, *, now: datetime | None = None) -> RetentionReport:
    """Delete expired credentials and stale operational records. Commits once."""
    now = now or datetime.now(UTC)
    report = RetentionReport()

    token_cutoff = now - timedelta(days=settings.auth_token_grace_days)

    res = db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.expires_at < token_cutoff)
    )
    report.expired_password_resets = res.rowcount or 0

    res = db.execute(
        delete(EmailVerificationToken).where(EmailVerificationToken.expires_at < token_cutoff)
    )
    report.expired_email_verifications = res.rowcount or 0

    res = db.execute(
        delete(RefreshToken).where(
            or_(
                RefreshToken.expires_at < token_cutoff,
                (RefreshToken.revoked_at.is_not(None))
                & (RefreshToken.revoked_at < token_cutoff),
            )
        )
    )
    report.expired_refresh_tokens = res.rowcount or 0

    email_cutoff = now - timedelta(days=settings.email_log_retention_days)
    res = db.execute(delete(EmailLog).where(EmailLog.created_at < email_cutoff))
    report.purged_email_logs = res.rowcount or 0

    if settings.voice_transcript_retention_days and settings.voice_transcript_retention_days > 0:
        voice_cutoff = now - timedelta(days=settings.voice_transcript_retention_days)
        res = db.execute(delete(CallTranscript).where(CallTranscript.created_at < voice_cutoff))
        res2 = db.execute(delete(VoiceMessage).where(VoiceMessage.created_at < voice_cutoff))
        report.purged_voice_transcripts = (res.rowcount or 0) + (res2.rowcount or 0)

    db.commit()
    return report


def count_email_logs(db: Session) -> int:
    """Count of email logs still on record (surfaced by the privacy policy view)."""
    return db.scalar(select(func.count(EmailLog.id))) or 0


__all__ = ["RetentionReport", "count_email_logs", "purge_expired_data", "retention_policy"]
