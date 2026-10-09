"""In-app voice sessions — turn-based HTTP telephony (mock-first, no WebSocket)."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.chat import _can_converse
from auth.dependencies import get_current_user
from database.session import get_db
from middleware.errors import AppError
from models import User, VoiceMessage, VoiceSession
from models.enums import MessageRole, SessionStatus, VoiceSessionMode
from repositories.cases import get_case_or_403
from schemas.voice import (
    CreateVoiceSessionRequest,
    VoiceSessionOut,
    VoiceTurnRequest,
    VoiceTurnResponse,
)
from services.audit import AuditAction, record_audit
from services.voice.agent import AudioUnsupportedError, get_voice_agent

router = APIRouter(prefix="/api/cases", tags=["voice"])


def _session_or_404(db: Session, case_id: int, sid: str) -> VoiceSession:
    session = db.scalar(select(VoiceSession).where(VoiceSession.public_id == sid))
    if session is None or session.case_id != case_id:
        raise AppError("Voice session not found", status_code=404, code="voice_session_not_found")
    return session


@router.post("/{case_id}/voice/sessions", response_model=VoiceSessionOut, status_code=201)
def create_voice_session(
    case_id: int,
    payload: CreateVoiceSessionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _can_converse(case)

    agent = get_voice_agent()
    session = VoiceSession(
        public_id=uuid.uuid4().hex[:32],
        case_id=case.id,
        patient_id=case.patient_id,
        mode=VoiceSessionMode.IN_APP,
        status=SessionStatus.IDLE,
        language=payload.language or (case.language.value if case.language else "en"),
        provider=agent.name,
        started_at=datetime.now().astimezone(),
    )
    db.add(session)
    db.flush()

    record_audit(
        db,
        AuditAction.VOICE_SESSION_STARTED,
        user=user,
        case=case,
        metadata={"session_id": session.public_id, "mode": session.mode.value},
    )
    db.commit()
    return session


@router.post("/{case_id}/voice/sessions/{sid}/turns", response_model=VoiceTurnResponse)
def send_voice_turn(
    case_id: int,
    sid: str,
    payload: VoiceTurnRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    _can_converse(case)
    session = _session_or_404(db, case_id, sid)

    if session.status == SessionStatus.COMPLETED:
        raise AppError(
            "This voice session has ended", status_code=409, code="voice_session_completed"
        )

    session.status = SessionStatus.PROCESSING
    agent = get_voice_agent()
    try:
        turn = agent.respond(
            db=db,
            case=case,
            user_text=payload.text,
            audio_b64=payload.audio_b64,
            audio_mime=payload.audio_mime,
            actor=user,
        )
    except AudioUnsupportedError as exc:
        session.status = SessionStatus.ERROR
        session.error_detail = str(exc)
        db.commit()
        raise AppError(str(exc), status_code=422, code="voice_audio_unavailable") from exc

    seq = (max((m.sequence for m in session.messages), default=0)) + 1
    language = case.language.value if case.language else "en"
    db.add(
        VoiceMessage(
            session_id=session.id,
            sequence=seq,
            role=MessageRole.PATIENT,
            content=payload.text or turn.user_transcript or "Audio turn",
            language=language,
            had_audio=bool(payload.audio_b64),
        )
    )
    db.add(
        VoiceMessage(
            session_id=session.id,
            sequence=seq + 1,
            role=MessageRole.AI,
            content=turn.text,
            language=language,
            had_audio=False,
        )
    )
    session.status = SessionStatus.SPEAKING
    session.error_detail = None
    db.commit()

    return VoiceTurnResponse(
        reply=turn.text,
        status=session.status,
        progress=turn.progress,
        can_submit=turn.can_submit,
        added_symptoms=turn.added_symptoms,
        added_measurement=turn.added_measurement,
        provider=session.provider,
    )


@router.get("/{case_id}/voice/sessions/{sid}", response_model=VoiceSessionOut)
def get_voice_session(
    case_id: int,
    sid: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    return _session_or_404(db, case.id, sid)


@router.post("/{case_id}/voice/sessions/{sid}/complete", response_model=VoiceSessionOut)
def complete_voice_session(
    case_id: int,
    sid: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    session = _session_or_404(db, case.id, sid)

    if session.status == SessionStatus.COMPLETED:
        raise AppError(
            "This voice session has already ended", status_code=409, code="voice_session_completed"
        )

    session.status = SessionStatus.COMPLETED
    session.ended_at = datetime.now().astimezone()
    record_audit(
        db,
        AuditAction.VOICE_SESSION_COMPLETED,
        user=user,
        case=case,
        metadata={
            "session_id": session.public_id,
            "message_count": len(session.messages),
        },
    )
    db.commit()
    return session