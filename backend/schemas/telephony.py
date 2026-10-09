"""Pydantic schemas for tele-calling and speech agent interactions."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from models.enums import CallStatus, MessageRole


class TranscriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sequence: int
    role: MessageRole
    content: str
    language: str | None = None
    created_at: datetime


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
    extracted_data: dict[str, str] | None = None
    error_detail: str | None = None
    transcripts: list[TranscriptOut] = Field(default_factory=list)
    created_at: datetime


class TeleCallListResponse(BaseModel):
    items: list[TeleCallOut]
    total: int
