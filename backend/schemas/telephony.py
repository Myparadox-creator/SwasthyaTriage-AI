"""Pydantic schemas for tele-calling and speech agent interactions."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.enums import CallStatus


class TranscriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sequence: int
    role: str
    content: str
    language: str | None = None
    created_at: datetime | None = None


class TeleCallCreateRequest(BaseModel):
    case_id: int
    followup_id: int | None = None
    phone_number: str | None = None
    reason: str | None = Field(default="Follow-up on missing triage information", max_length=500)
    questions: list[str] = Field(default_factory=lambda: ["temperature", "medication", "duration"])


class TeleCallTurnRequest(BaseModel):
    patient_reply: str | None = None


class TeleCallTurnResponse(BaseModel):
    agent_question: str
    patient_response: str
    item_key: str
    extracted_value: str | None = None
    is_last_question: bool = False
    duration_seconds: int = 0


class TeleCallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_id: str
    case_id: int
    case_number: str | None = None
    patient_name: str | None = None
    phone_number: str | None = None
    status: CallStatus
    direction: str
    reason: str | None = None
    questions: list[str] | None = None
    provider: str
    duration_seconds: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    extracted_data: dict[str, Any] | None = None
    error_detail: str | None = None
    transcripts: list[TranscriptOut] = Field(default_factory=list)
    created_at: datetime


class TeleCallListResponse(BaseModel):
    items: list[TeleCallOut]
    total: int


# --- Patient-facing callback requests (Sonam) ---


class CallbackRequestCreate(BaseModel):
    """Patient-initiated request for an outbound Sonam callback."""

    phone_number: str = Field(min_length=5, max_length=32)
    language: Literal["en", "hi", "od"] = "hi"
    purpose: str | None = Field(
        default="Patient requested a Sonam callback for health information",
        max_length=500,
    )
    consent_ai: bool = False

    @model_validator(mode="after")
    def _require_explicit_consent(self):
        if not self.consent_ai:
            raise ValueError(
                "Consent is required before an AI assistant may call you"
            )
        if not self.phone_number.strip():
            raise ValueError("phone_number is required")
        return self


class CallbackRequestOut(BaseModel):
    """Truthful callback status. Never claims a call was placed unless it was."""

    id: int
    public_id: str
    case_id: int
    case_number: str | None = None
    status: CallStatus
    provider: str
    mode: str
    phone_masked: str
    language: str
    purpose: str | None = None
    consent_ai: bool = True
    message: str
    created_at: datetime


class CallbackListResponse(BaseModel):
    items: list[CallbackRequestOut]
    total: int


class SnapServeLeadIn(BaseModel):
    """Lead-capture payload forwarded to SnapServe server-side.

    The live SnapServe API key stays on the backend; the browser never sees it.
    """

    phone: str = Field(min_length=5, max_length=32)
    name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=256)
    purpose: str | None = Field(default=None, max_length=500)
    language: str | None = Field(default=None, max_length=8)
    source: str | None = Field(default=None, max_length=200)


class TeleCallWebhookPayload(BaseModel):
    """Provider call-status callback body."""

    call_public_id: str | None = None
    external_call_id: str | None = None
    status: CallStatus
    error_detail: str | None = None
    duration_seconds: int | None = None
