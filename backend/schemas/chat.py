"""Chat / intake schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.enums import CaseStatus, MessageRole, Priority


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_id: str
    role: MessageRole
    content: str
    language: str | None
    created_at: datetime


class QuestionOut(BaseModel):
    code: str
    category: str
    text: str
    required: bool
    satisfied: bool


class ChatSendRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    channel: str = Field(default="CHAT", pattern="^(?:CHAT|VOICE)$")
    is_emergency: bool = False


class ChatSendResponse(BaseModel):
    reply: str
    priority: Priority
    progress: dict
    can_submit: bool
    added_symptoms: list[str]
    added_measurement: bool


class ChatHistoryResponse(BaseModel):
    case_id: int
    case_number: str
    status: CaseStatus
    priority: Priority
    messages: list[ChatMessageOut]
    questions: list[QuestionOut]
    progress: dict
    can_submit: bool
