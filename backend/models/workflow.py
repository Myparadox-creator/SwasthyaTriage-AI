"""Follow-ups, referrals, notifications, question bank and audit logs."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base
from models.enums import (
    FollowUpChannel,
    FollowUpStatus,
    ReferralStatus,
    Role,
)


class FollowUp(Base):
    __tablename__ = "followups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requested_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Selected missing-information items, e.g. ["temperature", "medication"]
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    channel: Mapped[FollowUpChannel] = mapped_column(
        Enum(FollowUpChannel, name="followup_channel"),
        nullable=False,
        default=FollowUpChannel.TELECALL,
    )
    status: Mapped[FollowUpStatus] = mapped_column(
        Enum(FollowUpStatus, name="followup_status"),
        nullable=False,
        default=FollowUpStatus.PENDING,
        index=True,
    )
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    result_summary: Mapped[dict | None] = mapped_column(JSON)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    verified_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    finalized_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    destination_facility: Mapped[str | None] = mapped_column(String(255))
    reason_for_referral: Mapped[str | None] = mapped_column(Text)
    # Full draft content (AI-generated, human-verified before finalize)
    draft: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[ReferralStatus] = mapped_column(
        Enum(ReferralStatus, name="referral_status"),
        nullable=False,
        default=ReferralStatus.DRAFT,
        index=True,
    )
    # Optimistic concurrency + amendment chain: revising a finalized referral
    # creates a new row with version+1 pointing at the original (supersedes_id).
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    supersedes_id: Mapped[int | None] = mapped_column(
        ForeignKey("referrals.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class QuestionBankItem(Base):
    """Controlled healthcare information-collection framework.

    Follow-up questions must come from here — never from free-form LLM reasoning.
    """

    __tablename__ = "question_bank"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    # Field this question collects, e.g. temperature, medication, duration
    target_field: Mapped[str] = mapped_column(String(64), nullable=False)
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    text_hi: Mapped[str | None] = mapped_column(Text)
    text_od: Mapped[str | None] = mapped_column(Text)
    required_for_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def text_for(self, language: str) -> str:
        if language == "hi" and self.text_hi:
            return self.text_hi
        if language == "od" and self.text_od:
            return self.text_od
        return self.text_en


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    actor_label: Mapped[str | None] = mapped_column(String(255))  # denormalized for export
    actor_role: Mapped[Role | None] = mapped_column(Enum(Role, name="user_role"))
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="SET NULL"), index=True
    )
    case_number: Mapped[str | None] = mapped_column(String(16), index=True)
    facility_id: Mapped[int | None] = mapped_column(
        ForeignKey("facilities.id", ondelete="SET NULL"), index=True
    )
    source: Mapped[str | None] = mapped_column(String(32))  # WEB / API / TELECALL / SYSTEM
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
