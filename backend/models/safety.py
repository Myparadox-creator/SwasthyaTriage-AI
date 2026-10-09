"""Deterministic safety rules and the signals they produce.

The engine that evaluates these rules lives in services/safety/ and is
independently testable — it never calls an LLM.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.enums import Priority, Provenance

if TYPE_CHECKING:
    from models.case import Case


class SafetyRule(Base):
    """Configured, versioned rule. Facility NULL = global platform rule."""

    __tablename__ = "safety_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Pattern matched against extracted symptom terms / free text (case-insensitive)
    match_patterns: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Optional structured condition: {"field": "measurement:temperature_f", "gte": 103}
    field_condition: Mapped[dict | None] = mapped_column(JSON)
    target_priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority_level"), nullable=False, default=Priority.REVIEW_REQUIRED
    )
    display_message: Mapped[str] = mapped_column(
        Text, nullable=False, default="Configured safety signal detected."
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    facility_id: Mapped[int | None] = mapped_column(
        ForeignKey("facilities.id", ondelete="CASCADE"), index=True
    )
    # Bumped on every rule edit so signals/audits can reference the rule version.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    signals: Mapped[list[SafetySignal]] = relationship(back_populates="rule")


class SafetySignal(Base):
    __tablename__ = "safety_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("safety_rules.id", ondelete="SET NULL"), index=True
    )
    rule_code: Mapped[str | None] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority_level"), nullable=False, default=Priority.REVIEW_REQUIRED
    )
    source: Mapped[Provenance] = mapped_column(
        Enum(Provenance, name="provenance"),
        nullable=False,
        default=Provenance.CONFIGURED_RULE,
    )
    evidence: Mapped[dict | None] = mapped_column(JSON)  # what triggered it (no interpretation)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    rule: Mapped[SafetyRule | None] = relationship(back_populates="signals")
    case: Mapped[Case] = relationship(back_populates="safety_signals")
