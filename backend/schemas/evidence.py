"""Evidence traceability API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class EvidenceReviewRequest(BaseModel):
    status: str = Field(description="CONFIRMED | EDITED | REJECTED")
    new_value: str | None = Field(default=None, max_length=500)
    reason: str | None = Field(default=None, max_length=1000)


class EvidenceOut(BaseModel):
    id: int
    case_id: int
    fact_type: str
    fact_ref: str
    label: str
    unit: str | None = None
    normalized_value: str | None = None
    original_value: str | None = None
    current_value: str | None = None
    source_kind: str
    source_provenance: str
    source_snippet: str | None = None
    source_ref_id: str | None = None
    source_timestamp: datetime | None = None
    extraction_method: str
    model_version: str | None = None
    extraction_timestamp: datetime | None = None
    confidence: float | None = None
    confidence_tier: str | None = None
    is_calibrated: bool = False
    rationale: str | None = None
    validation_warnings: list = Field(default_factory=list)
    sop_references: list = Field(default_factory=list)
    reviewer_status: str
    reviewer_label: str | None = None
    reviewed_at: datetime | None = None
    review_reason: str | None = None


class EvidenceListOut(BaseModel):
    case_id: int
    case_number: str
    total: int
    pending_review: int
    evidence: list[EvidenceOut]
    disclaimer: str = (
        "Every fact is traceable to its source. Machine-extracted facts require "
        "human confirmation. AI provides decision support only."
    )
