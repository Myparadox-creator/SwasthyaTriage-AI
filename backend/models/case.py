"""The canonical multimodal case aggregate and its structured content."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.enums import (
    CaseSource,
    CaseStatus,
    ConsentStatus,
    Language,
    Priority,
    Provenance,
)

if TYPE_CHECKING:
    from models.safety import SafetySignal


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Human-facing identifier, e.g. ST-1024
    case_number: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    facility_id: Mapped[int] = mapped_column(
        ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    assigned_reviewer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[CaseStatus] = mapped_column(
        Enum(CaseStatus, name="case_status"), nullable=False, default=CaseStatus.DRAFT, index=True
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority_level"),
        nullable=False,
        default=Priority.ROUTINE,
        index=True,
    )
    source: Mapped[CaseSource] = mapped_column(
        Enum(CaseSource, name="case_source"), nullable=False, default=CaseSource.CHAT
    )
    language: Mapped[Language] = mapped_column(
        Enum(Language, name="language_code"), nullable=False, default=Language.EN
    )

    # Patient-facing content
    chief_concern: Mapped[str | None] = mapped_column(Text)
    timeline_text: Mapped[str | None] = mapped_column(Text)
    patient_context: Mapped[dict | None] = mapped_column(
        MutableDict.as_mutable(JSON)
    )  # age/gender/history as reported

    # AI-generated (always labeled as such in the UI)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_summary_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    missing_information: Mapped[list | None] = mapped_column(JSON, default=list)

    # Review workflow
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    symptoms: Mapped[list[CaseSymptom]] = relationship(
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )
    measurements: Mapped[list[CaseMeasurement]] = relationship(
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )
    safety_signals: Mapped[list[SafetySignal]] = relationship(  # noqa: F821
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )
    review_notes: Mapped[list[ReviewNote]] = relationship(
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )
    patient: Mapped[Patient] = relationship()  # noqa: F821
    facility: Mapped[Facility] = relationship()  # noqa: F821
    chat_messages: Mapped[list[ChatMessage]] = relationship(  # noqa: F821
        back_populates="case", order_by="ChatMessage.created_at", lazy="selectin"
    )


class CaseSymptom(Base):
    __tablename__ = "case_symptoms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    term: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_term: Mapped[str | None] = mapped_column(String(120), index=True)
    severity: Mapped[str | None] = mapped_column(String(32))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[Provenance] = mapped_column(
        Enum(Provenance, name="provenance"), nullable=False, default=Provenance.PATIENT_REPORTED
    )
    collected_via: Mapped[str | None] = mapped_column(
        String(64)
    )  # VOICE / CHAT / DOCUMENT / TELECALL
    verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    verified_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    case: Mapped[Case] = relationship(back_populates="symptoms")


class CaseMeasurement(Base):
    __tablename__ = "case_measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)  # e.g. Temperature
    value: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. 101
    unit: Mapped[str | None] = mapped_column(String(32))  # e.g. °F
    source: Mapped[Provenance] = mapped_column(
        Enum(Provenance, name="provenance"), nullable=False, default=Provenance.PATIENT_REPORTED
    )
    collected_via: Mapped[str | None] = mapped_column(String(64))
    verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    verified_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    case: Mapped[Case] = relationship(back_populates="measurements")


class CaseTimeline(Base):
    __tablename__ = "case_timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    onset_text: Mapped[str | None] = mapped_column(Text)
    duration_text: Mapped[str | None] = mapped_column(String(120))
    progression: Mapped[str | None] = mapped_column(Text)  # worsening / improving / stable
    source: Mapped[Provenance] = mapped_column(
        Enum(Provenance, name="provenance"), nullable=False, default=Provenance.PATIENT_REPORTED
    )
    verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReviewNote(Base):
    __tablename__ = "review_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    case: Mapped[Case] = relationship(back_populates="review_notes")


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    session_ref: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[ConsentStatus] = mapped_column(
        Enum(ConsentStatus, name="consent_status"), nullable=False, default=ConsentStatus.GRANTED
    )
    consent_text_version: Mapped[str] = mapped_column(String(16), nullable=False, default="v1")
    language: Mapped[Language] = mapped_column(
        Enum(Language, name="language_code"), nullable=False, default=Language.EN
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
