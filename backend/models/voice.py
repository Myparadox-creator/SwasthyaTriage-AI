"""In-app voice sessions, tele-calls and their transcripts."""

from __future__ import annotations

from datetime import datetime

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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.enums import CallStatus, MessageRole, SessionStatus, VoiceSessionMode


class VoiceSession(Base):
    __tablename__ = "voice_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mode: Mapped[VoiceSessionMode] = mapped_column(
        Enum(VoiceSessionMode, name="voice_session_mode"),
        nullable=False,
        default=VoiceSessionMode.IN_APP,
    )
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"),
        nullable=False,
        default=SessionStatus.IDLE,
        index=True,
    )
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="gemini_live")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_detail: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    messages: Mapped[list[VoiceMessage]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="VoiceMessage.sequence",
        lazy="selectin",
    )


class VoiceMessage(Base):
    __tablename__ = "voice_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("voice_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(8))
    had_audio: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped[VoiceSession] = relationship(back_populates="messages")


class TeleCall(Base):
    __tablename__ = "tele_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    followup_id: Mapped[int | None] = mapped_column(
        ForeignKey("followups.id", ondelete="SET NULL"), index=True
    )
    requested_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")
    phone_number: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[CallStatus] = mapped_column(
        Enum(CallStatus, name="call_status"),
        nullable=False,
        default=CallStatus.REQUESTED,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="OUTBOUND")
    reason: Mapped[str | None] = mapped_column(Text)
    questions: Mapped[list | None] = mapped_column(JSON, default=list)
    external_call_id: Mapped[str | None] = mapped_column(String(120), index=True)
    room_id: Mapped[str | None] = mapped_column(String(120))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    extracted_data: Mapped[dict | None] = mapped_column(JSON)
    error_detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    transcripts: Mapped[list[CallTranscript]] = relationship(
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="CallTranscript.sequence",
        lazy="selectin",
    )


class CallTranscript(Base):
    __tablename__ = "call_transcripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(
        ForeignKey("tele_calls.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    call: Mapped[TeleCall] = relationship(back_populates="transcripts")
