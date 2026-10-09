"""Document upload schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from models.enums import DocumentStatus, ExtractionMethod, Provenance


class DocumentExtractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    method: ExtractionMethod
    raw_text: str | None
    structured: dict | None
    source: Provenance
    verified: bool
    created_at: datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    filename: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    error_detail: str | None
    created_at: datetime
    extractions: list[DocumentExtractionOut]


class DocumentListResponse(BaseModel):
    case_id: int
    case_number: str
    items: list[DocumentOut]
