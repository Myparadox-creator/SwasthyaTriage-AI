"""In-app voice sessions.

Two transports are offered:

* A turn-based HTTP API (``/turns`` and ``/turns/stream`` SSE) that transcribes,
  reasons and replies one turn at a time.
* A genuinely realtime WebSocket (``.../live``) that streams 16 kHz PCM to the
  Gemini Live API and streams 24 kHz native audio + transcription straight
  back, for true full-duplex conversation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from contextlib import AsyncExitStack
from datetime import datetime

from fastapi import APIRouter, Depends, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.chat import _can_converse
from auth.dependencies import get_current_user
from auth.jwt import TokenError, verify_access_token
from config import settings
from database.session import SessionLocal, get_db
from middleware.errors import AppError
from models import User, VoiceMessage, VoiceSession
from models.enums import MessageRole, SessionStatus, VoiceSessionMode
from repositories.cases import get_case_or_403
from schemas.voice import (
    CreateVoiceSessionRequest,
    VoiceSessionOut,
    VoiceSpeakRequest,
    VoiceTurnRequest,
    VoiceTurnResponse,
)
from services.audit import AuditAction, record_audit
from services.gemini.client import GeminiClient
from services.gemini.errors import ProviderError, ProviderUnavailable
from services.voice import live as live_voice
from services.voice.agent import AudioUnsupportedError, get_voice_agent

logger = logging.getLogger("swasthyatriage.voice.api")

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

    seq = (
        db.scalar(
            select(func.coalesce(func.max(VoiceMessage.sequence), 0)).where(
                VoiceMessage.session_id == session.id
            )
        )
        or 0
    ) + 1
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
        diagnostics=turn.diagnostics,
        transcript=turn.user_transcript,
    )


@router.post("/{case_id}/voice/sessions/{sid}/turns/stream")
def stream_voice_turn(
    case_id: int,
    sid: str,
    payload: VoiceTurnRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Server-Sent Events streaming endpoint for real-time sentence-by-sentence voice playback."""
    case = get_case_or_403(db, user, case_id)
    _can_converse(case)
    session = _session_or_404(db, case_id, sid)

    if session.status == SessionStatus.COMPLETED:
        raise AppError(
            "This voice session has ended", status_code=409, code="voice_session_completed"
        )

    session.status = SessionStatus.PROCESSING
    agent = get_voice_agent()

    def event_generator():
        yield f"data: {json.dumps({'type': 'start', 'status': 'PROCESSING'})}\n\n"

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
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return
        except Exception as exc:
            session.status = SessionStatus.ERROR
            session.error_detail = str(exc)
            db.commit()
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return

        # Pipelined sentence streaming for real-time TTS playback
        raw_sentences = [
            s.strip() for s in re.split(r"(?<=[.!?।|])\s+", turn.text) if s.strip()
        ]
        sentences = raw_sentences if raw_sentences else [turn.text]

        for idx, sentence_text in enumerate(sentences):
            chunk = {
                "type": "sentence",
                "text": sentence_text,
                "index": idx,
                "total_sentences": len(sentences),
                "is_first": idx == 0,
            }
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        # Persist conversation turn to database
        seq = (
            db.scalar(
                select(func.coalesce(func.max(VoiceMessage.sequence), 0)).where(
                    VoiceMessage.session_id == session.id
                )
            )
            or 0
        ) + 1
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

        # Final completion event
        completion = {
            "type": "complete",
            "reply": turn.text,
            "status": session.status.value,
            "progress": turn.progress,
            "can_submit": turn.can_submit,
            "added_symptoms": turn.added_symptoms,
            "added_measurement": turn.added_measurement,
            "provider": session.provider,
            "is_emergency": turn.is_emergency,
            "diagnostics": turn.diagnostics,
            "transcript": turn.user_transcript,
        }
        yield f"data: {json.dumps(completion, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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


@router.get("/{case_id}/voice/sessions", response_model=list[VoiceSessionOut])
def list_voice_sessions(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every voice session for a case, newest first, with full transcripts.

    Used by the clinician view so the doctor can read exactly what Sonam asked
    and what the patient answered.
    """
    case = get_case_or_403(db, user, case_id)
    return db.scalars(
        select(VoiceSession)
        .where(VoiceSession.case_id == case.id)
        .order_by(VoiceSession.created_at.desc())
    ).all()


@router.post("/{case_id}/voice/sessions/{sid}/speak")
def synthesize_voice_speech(
    case_id: int,
    sid: str,
    payload: VoiceSpeakRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Server-side TTS for the classic (turn-based) voice path.

    Returns raw 24 kHz mono signed 16-bit PCM (``audio/pcm;rate=24000``) so the
    browser can play agent replies with the Web Audio API instead of relying on
    the OS ``speechSynthesis`` voice. Falls back transparently on the client if
    this endpoint is unavailable.
    """
    case = get_case_or_403(db, user, case_id)
    session = _session_or_404(db, case.id, sid)

    if not settings.gemini_enabled:
        raise AppError(
            "Server TTS is not configured", status_code=503, code="tts_unavailable"
        )

    try:
        audio, mime = GeminiClient().synthesize_speech(
            payload.text,
            language=payload.language or session.language,
        )
    except (ProviderError, ProviderUnavailable) as exc:
        logger.warning("Server TTS failed: %s", exc)
        raise AppError(str(exc), status_code=502, code="tts_failed") from exc

    return Response(content=audio, media_type=mime)


def _next_sequence(db: Session, session_id: int) -> int:
    current = db.scalar(
        select(func.coalesce(func.max(VoiceMessage.sequence), 0)).where(
            VoiceMessage.session_id == session_id
        )
    )
    return int(current or 0) + 1


@router.websocket("/{case_id}/voice/sessions/{sid}/live")
async def live_voice_socket(
    websocket: WebSocket,
    case_id: int,
    sid: str,
    token: str | None = None,
):
    """Full-duplex realtime voice session proxied to the Gemini Live API.

    The client sends binary WebSocket frames of 16 kHz mono PCM16 audio; the
    server streams back binary 24 kHz PCM16 audio plus JSON control/transcript
    frames.
    """
    await websocket.accept()

    if token is None:
        token = websocket.query_params.get("token")

    if not live_voice.live_available():
        await websocket.send_json({"type": "error", "error": "live_unavailable"})
        await websocket.close(code=1011)
        return

    db = SessionLocal()
    case = None
    session: VoiceSession | None = None
    try:
        try:
            payload = verify_access_token(token or "")
        except TokenError:
            await websocket.send_json({"type": "error", "error": "unauthorized"})
            await websocket.close(code=4401)
            return

        user = db.get(User, int(payload["sub"]))
        if (
            user is None
            or not user.is_active
            or user.deleted_at is not None
            or payload.get("role") != user.role.value
        ):
            await websocket.send_json({"type": "error", "error": "unauthorized"})
            await websocket.close(code=4401)
            return

        try:
            case = get_case_or_403(db, user, case_id)
            _can_converse(case)
            session = _session_or_404(db, case_id, sid)
        except AppError as exc:
            await websocket.send_json(
                {"type": "error", "error": "forbidden", "detail": str(exc)}
            )
            await websocket.close(code=4403)
            return

        language = session.language or (case.language.value if case.language else "en")
        session.status = SessionStatus.CONNECTING
        session.error_detail = None
        db.commit()

        await _run_live_session(websocket, db, case, session, language)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.exception("Live voice session crashed: %s", exc)
    finally:
        try:
            if session is not None:
                session.status = SessionStatus.COMPLETED
                session.ended_at = datetime.now().astimezone()
                db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
        db.close()
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


async def _run_live_session(
    websocket: WebSocket, db: Session, case, session: VoiceSession, language: str
) -> None:
    from google.genai import types

    client = live_voice.get_live_client()
    config = live_voice.build_live_config(language, case.case_number, case.chief_concern)
    buffers: dict[str, list[str]] = {"user": [], "ai": []}

    def flush_turn() -> None:
        user_text = "".join(buffers["user"]).strip()
        ai_text = "".join(buffers["ai"]).strip()
        buffers["user"].clear()
        buffers["ai"].clear()
        if not user_text and not ai_text:
            return
        seq = _next_sequence(db, session.id)
        if user_text:
            db.add(
                VoiceMessage(
                    session_id=session.id,
                    sequence=seq,
                    role=MessageRole.PATIENT,
                    content=user_text[:4000],
                    language=language,
                    had_audio=True,
                )
            )
            seq += 1
        if ai_text:
            db.add(
                VoiceMessage(
                    session_id=session.id,
                    sequence=seq,
                    role=MessageRole.AI,
                    content=ai_text[:4000],
                    language=language,
                    had_audio=True,
                )
            )
        session.status = SessionStatus.LISTENING
        db.commit()

    async with AsyncExitStack() as stack:
        stream = None
        active_model: str | None = None
        for model in live_voice.live_models_to_try():
            try:
                stream = await stack.enter_async_context(
                    client.aio.live.connect(model=model, config=config)
                )
                active_model = model
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini Live connect failed for %s: %s", model, exc)
        if stream is None:
            await websocket.send_json({"type": "error", "error": "live_connect_failed"})
            return

        await websocket.send_json({"type": "ready", "model": active_model, "language": language})
        session.status = SessionStatus.LISTENING
        db.commit()

        await stream.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text="[The call has connected. Greet the patient and begin.]")],
            ),
            turn_complete=True,
        )

        async def pump_client() -> None:
            try:
                while True:
                    raw = await websocket.receive()
                    if raw.get("type") == "websocket.disconnect":
                        break
                    chunk = raw.get("bytes")
                    if chunk:
                        await stream.send_realtime_input(
                            audio=types.Blob(data=chunk, mime_type=live_voice.INPUT_MIME)
                        )
                        continue
                    text = raw.get("text")
                    if not text:
                        continue
                    try:
                        control = json.loads(text)
                    except json.JSONDecodeError:
                        continue
                    if control.get("type") in ("close", "end"):
                        break
            except WebSocketDisconnect:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.debug("Live client pump ended: %s", exc)

        async def handle_gemini_message(message) -> None:
            content = getattr(message, "server_content", None)
            if content is None:
                return
            if getattr(content, "interrupted", False):
                await websocket.send_json({"type": "interrupted"})
            input_tr = getattr(content, "input_transcription", None)
            if input_tr is not None and getattr(input_tr, "text", None):
                buffers["user"].append(input_tr.text)
                await websocket.send_json({"type": "input", "text": input_tr.text})
            output_tr = getattr(content, "output_transcription", None)
            if output_tr is not None and getattr(output_tr, "text", None):
                buffers["ai"].append(output_tr.text)
                await websocket.send_json({"type": "output", "text": output_tr.text})
            model_turn = getattr(content, "model_turn", None)
            if model_turn is not None:
                for part in model_turn.parts or []:
                    inline = getattr(part, "inline_data", None)
                    data = getattr(inline, "data", None)
                    if data:
                        await websocket.send_bytes(data)
            if getattr(content, "turn_complete", False):
                flush_turn()
                await websocket.send_json({"type": "turn_complete"})

        async def pump_gemini() -> None:
            # ``stream.receive()`` yields exactly one model turn and then returns,
            # so re-enter it after every turn to keep the full-duplex call alive
            # until the client disconnects or the Gemini Live socket actually closes.
            while True:
                try:
                    async for message in stream.receive():
                        await handle_gemini_message(message)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    logger.debug("Gemini Live receive loop ended: %s", exc)
                    break

        client_task = asyncio.create_task(pump_client())
        server_task = asyncio.create_task(pump_gemini())
        done, pending = await asyncio.wait(
            {client_task, server_task}, return_when=asyncio.FIRST_COMPLETED
        )
        # If the Gemini side ended while the caller was still connected, tell the
        # client so it can offer the turn-based fallback instead of a silent hang-up.
        if server_task in done and client_task in pending:
            try:
                await websocket.send_json({"type": "error", "error": "live_session_ended"})
            except Exception:  # noqa: BLE001
                pass
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

        flush_turn()

    try:
        await websocket.send_json({"type": "closed"})
    except Exception:  # noqa: BLE001
        pass

    try:
        transcript = "\n".join(
            f"{message.role.value}: {message.content}"
            for message in sorted(session.messages, key=lambda item: item.sequence)
        )
    except Exception:  # noqa: BLE001
        transcript = ""
    live_voice.finalize_live_session(db, case, transcript=transcript, language=language)
    db.commit()