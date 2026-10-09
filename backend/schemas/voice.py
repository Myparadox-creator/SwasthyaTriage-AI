"""In-app voice session schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.enums import MessageRole, SessionStatus, VoiceSessionMode


class VoiceMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: MessageRole
    content: str
    sequence: int
    language: str | None
    had_audio: bool
    created_at: datetime


class VoiceSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    case_id: int | None
    mode: VoiceSessionMode
    status: SessionStatus
    language: str
    provider: str
    started_at: datetime | None
    ended_at: datetime | None
    error_detail: str | None
    messages: list[VoiceMessageOut]
    created_at: datetime


class CreateVoiceSessionRequest(BaseModel):
    language: str | None = Field(default=None, max_length=8)


class VoiceTurnRequest(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    audio_b64: str | None = None
    audio_mime: str | None = None

    @model_validator(mode="after")
    def _require_input(self):
        if not self.text and not self.audio_b64:
            raise ValueError("Provide text or audio_b64")
        return self


class VoiceTurnResponse(BaseModel):
    reply: str
    status: SessionStatus
    progress: dict
    can_submit: bool
    added_symptoms: list[str]
    added_measurement: bool
    provider: str