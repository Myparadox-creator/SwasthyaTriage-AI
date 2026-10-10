"""Clinical evidence traceability records.

Every material extracted clinical fact can be traced back to its source.
This module stores the provenance, the exact source snippet (or a safe
document location), the extraction method/model version, the confidence
estimate, validation warnings, and the human reviewer decision.

It deliberately distinguishes:
  - source-grounded evidence (verbatim patient text / report location),
  - machine-extracted facts (AI/OCR/rule), and
  - human-confirmed facts (reviewer decision).

No raw medical document body or voice transcript is stored here beyond the
bounded ``source_snippet``; full documents live in the documents subsystem.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.case import Case


class EvidenceFactType:
    SYMPTOM = "SYMPTOM"
    MEASUREMENT = "MEASUREMENT"
    TIMELINE = "TIMELINE"
    CONTEXT = "CONTEXT"
    DOCUMENT_FIELD = "DOCUMENT_FIELD"


class EvidenceSourceKind:
    """Where the fact came from — used to label source-grounded vs machine."""

    PATIENT_TEXT = "PATIENT_TEXT"
    VOICE_TRANSCRIPT = "VOICE_TRANSCRIPT"
    UPLOADED_REPORT = "UPLOADED_REPORT"
    MANUAL_ENTRY = "MANUAL_ENTRY"
    APPROVED_EXTERNAL_SOURCE = "APPROVED_EXTERNAL_SOURCE"
    CONFIGURED_RULE = "CONFIGURED_RULE"


class EvidenceReviewStatus:
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    EDITED = "EDITED"
    REJECTED = "REJECTED"


REVIEWABLE_STATUSES = (
    EvidenceReviewStatus.CONFIRMED,
    EvidenceReviewStatus.EDITED,
    EvidenceReviewStatus.REJECTED,
)


class FactEvidence(Base):
    """One traceable clinical fact attached to a case."""

    __tablename__ = "fact_evidence"
    __table_args__ = (
        UniqueConstraint("case_id", "fact_ref", name="uq_fact_evidence_case_ref"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )

    fact_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Stable reference within the case, e.g. "symptom:12" / "measurement:temperature"
    fact_ref: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))

    # Current value (post any reviewer edit) and the original as first extracted.
    normalized_value: Mapped[str | None] = mapped_column(Text)
    original_value: Mapped[str | None] = mapped_column(Text)
    current_value: Mapped[str | None] = mapped_column(Text)

    source_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    source_provenance: Mapped[str] = mapped_column(String(32), nullable=False)
    # Verbatim snippet for text sources, or a safe location pointer for documents.
    source_snippet: Mapped[str | None] = mapped_column(Text)
    source_ref_id: Mapped[str | None] = mapped_column(String(64))
    source_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    extraction_method: Mapped[str] = mapped_column(String(32), nullable=False, default="RULE")
    model_version: Mapped[str | None] = mapped_column(String(64))
    extraction_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    confidence: Mapped[float | None] = mapped_column(Float)
    confidence_tier: Mapped[str | None] = mapped_column(String(16))
    is_calibrated: Mapped[bool] = mapped_column(nullable=False, default=False)
    rationale: Mapped[str | None] = mapped_column(Text)

    validation_warnings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sop_references: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    reviewer_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=EvidenceReviewStatus.PENDING, index=True
    )
    reviewer_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewer_label: Mapped[str | None] = mapped_column(String(255))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    case: Mapped[Case] = relationship()  # noqa: F821
