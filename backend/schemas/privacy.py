"""Schemas for the privacy & data-protection endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator

from models.enums import ConsentStatus


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int | None = None
    status: ConsentStatus
    consent_text_version: str
    language: str
    recorded_at: datetime


class ConsentListResponse(BaseModel):
    items: list[ConsentOut]
    total: int


class ConsentRevokeResponse(BaseModel):
    id: int
    status: ConsentStatus
    message: str


class DataErasureRequest(BaseModel):
    """A patient must explicitly confirm before an irreversible erasure runs."""

    confirm: bool = False
    confirm_phrase: str | None = None

    @model_validator(mode="after")
    def _require_explicit_confirmation(self):
        if not self.confirm:
            raise ValueError("Erasure requires explicit confirmation")
        if (self.confirm_phrase or "").strip().upper() != "ERASE":
            raise ValueError("Type ERASE to confirm the erasure request")
        return self


class DataErasureResponse(BaseModel):
    ok: bool
    message: str
    details: dict[str, Any]


class DataExportResponse(BaseModel):
    """Metadata-only view; the full bundle is streamed as a download."""

    filename: str
    generated_at: datetime
    case_count: int
    message: str


class PrivacyPolicyResponse(BaseModel):
    environment: str
    pii_redaction: dict[str, Any]
    retention: dict[str, Any]
    rights: dict[str, str]
    controllers: dict[str, str]


class RetentionPurgeResponse(BaseModel):
    ok: bool
    message: str
    removed: dict[str, int]
