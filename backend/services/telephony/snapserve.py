"""SnapServe AI voice-agent telephony provider.

Places real outbound PSTN calls through SnapServe's managed voice agents
(``POST /api/calls/outbound`` with an agent id and the patient's E.164 number).

SnapServe runs the live speech-to-text -> LLM -> text-to-speech conversation
itself, so the local manual "step" flow does not drive the dialogue. Instead
this provider mirrors the remote call's status, transcript, summary and
disposition back onto the local TeleCall so the staff UI and the follow-up
pipeline stay in sync.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from config import settings
from middleware.errors import AppError
from models import CallTranscript, Case, FollowUp, TeleCall, User
from models.enums import CallStatus, FollowUpStatus, MessageRole
from services.audit import AuditAction, record_audit
from services.telephony.base import CallTurnResult, TeleCallResult, TelephonyProvider
from services.telephony.phone import normalize_indian_phone

logger = logging.getLogger("swasthyatriage.telephony.snapserve")

# SnapServe call status -> local CallStatus
_STATUS_MAP: dict[str, CallStatus] = {
    "pending": CallStatus.REQUESTED,
    "queued": CallStatus.REQUESTED,
    "scheduled": CallStatus.REQUESTED,
    "dialing": CallStatus.DIALING,
    "initiated": CallStatus.DIALING,
    "ringing": CallStatus.RINGING,
    "in_progress": CallStatus.CONNECTED,
    "in-progress": CallStatus.CONNECTED,
    "connected": CallStatus.CONNECTED,
    "answered": CallStatus.CONNECTED,
    "transferred": CallStatus.CONNECTED,
    "booked": CallStatus.CONNECTED,
    "callback_scheduled": CallStatus.CONNECTED,
    "completed": CallStatus.COMPLETED,
    "ended": CallStatus.COMPLETED,
    "failed": CallStatus.FAILED,
    "error": CallStatus.FAILED,
    "cancelled": CallStatus.CANCELLED,
    "canceled": CallStatus.CANCELLED,
    "no_pickup": CallStatus.NO_ANSWER,
    "no_answer": CallStatus.NO_ANSWER,
    "no-answer": CallStatus.NO_ANSWER,
    "busy": CallStatus.NO_ANSWER,
    "voicemail": CallStatus.NO_ANSWER,
}

_TERMINAL = frozenset(
    {CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.NO_ANSWER, CallStatus.CANCELLED}
)

_AI_PREFIXES = ("agent:", "assistant:", "bot:", "ai:", "sonam:")
_PATIENT_PREFIXES = ("caller:", "user:", "patient:", "human:")


def _error_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except Exception:
        return (resp.text or f"HTTP {resp.status_code}").strip()[:300]
    if isinstance(body, dict):
        for key in ("error", "message", "detail"):
            value = body.get(key)
            if value:
                return str(value)[:300]
    return str(body)[:300]


def _parse_transcript(text: str | None) -> list[tuple[str, str]]:
    """Split a ``"Agent: ...\\nCaller: ..."`` transcript into (role, content)."""
    lines: list[list[str]] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith(_AI_PREFIXES):
            lines.append(["AI", line.split(":", 1)[1].strip()])
        elif lower.startswith(_PATIENT_PREFIXES):
            lines.append(["PATIENT", line.split(":", 1)[1].strip()])
        elif lines:
            lines[-1][1] = f"{lines[-1][1]} {line}".strip()
        else:
            lines.append(["AI", line])
    return [(role, content) for role, content in lines if content]


class SnapServeProvider(TelephonyProvider):
    """Real outbound PSTN calling via SnapServe AI voice agents."""

    @property
    def name(self) -> str:
        return "snapserve"

    # -- HTTP helpers ---------------------------------------------------
    def _url(self, path: str) -> str:
        return f"{settings.snapserve_base_url.rstrip('/')}{path}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.snapserve_api_key}",
            "Content-Type": "application/json",
        }

    def _dial(self, *, to_number: str, variables: dict[str, Any]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "agentId": settings.snapserve_agent_id,
            "toNumber": to_number,
            "variables": variables,
        }
        if settings.snapserve_from_number:
            payload["fromNumber"] = settings.snapserve_from_number
        try:
            resp = httpx.post(
                self._url("/calls/outbound"),
                headers=self._headers(),
                json=payload,
                timeout=20.0,
            )
        except httpx.HTTPError as exc:
            raise AppError(
                f"Could not reach the SnapServe telephony service: {exc}",
                status_code=502,
                code="telephony_unreachable",
            ) from exc
        if resp.status_code not in (200, 201):
            raise AppError(
                f"SnapServe could not place the call: {_error_detail(resp)}",
                status_code=502,
                code="telephony_failed",
            )
        data = resp.json()
        if not isinstance(data, dict) or not data.get("id"):
            raise AppError(
                "SnapServe did not return a call id.",
                status_code=502,
                code="telephony_bad_response",
            )
        return data

    def _fetch(self, external_call_id: str) -> dict[str, Any]:
        try:
            resp = httpx.get(
                self._url(f"/calls/{external_call_id}"),
                headers=self._headers(),
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            raise AppError(
                f"Could not reach the SnapServe telephony service: {exc}",
                status_code=502,
                code="telephony_unreachable",
            ) from exc
        if resp.status_code != 200:
            raise AppError(
                f"SnapServe call lookup failed: {_error_detail(resp)}",
                status_code=502,
                code="telephony_failed",
            )
        data = resp.json()
        return data if isinstance(data, dict) else {}

    def _end_remote(self, external_call_id: str) -> dict[str, Any] | None:
        """Best-effort request to hang up a live SnapServe call."""
        for method, path in (("post", f"/calls/{external_call_id}/end"), ("patch", f"/calls/{external_call_id}")):
            try:
                resp = getattr(httpx, method)(
                    self._url(path),
                    headers=self._headers(),
                    json={"status": "completed"},
                    timeout=10.0,
                )
                if resp.status_code < 400:
                    body = resp.json()
                    return body if isinstance(body, dict) else None
            except Exception as exc:  # noqa: BLE001 - best effort hang-up
                logger.warning("SnapServe end-call attempt (%s %s) failed: %s", method, path, exc)
        return None

    # -- remote -> local sync ------------------------------------------
    def _apply_remote(self, db: Any, call: TeleCall, data: dict[str, Any]) -> None:
        if not data:
            return

        remote_status = str(data.get("status") or "").lower()
        mapped = _STATUS_MAP.get(remote_status)
        if mapped is not None:
            call.status = mapped

        duration = data.get("durationSeconds") or data.get("duration_seconds")
        try:
            if duration is not None:
                call.duration_seconds = int(duration)
        except (TypeError, ValueError):
            pass

        now = datetime.now(UTC)
        if call.status in (CallStatus.CONNECTED, CallStatus.COMPLETED) and not call.answered_at:
            call.answered_at = now
        if call.status in _TERMINAL and not call.ended_at:
            call.ended_at = now

        extracted = dict(call.extracted_data or {})
        summary = data.get("callSummary") or data.get("summary")
        if summary:
            extracted["call_summary"] = str(summary)
        disposition = data.get("dispositionResult") or data.get("disposition")
        if isinstance(disposition, dict):
            for key, value in disposition.items():
                if value is not None and not isinstance(value, (dict, list)):
                    extracted[str(key)] = str(value)
        cost = data.get("costCents") or data.get("cost_cents")
        if cost is not None:
            extracted["cost_cents"] = str(cost)
        call.extracted_data = extracted

        failure = data.get("error") or data.get("failureReason") or data.get("failure_reason")
        if failure and call.status == CallStatus.FAILED:
            call.error_detail = str(failure)[:500]

        if not call.transcripts:
            self._sync_transcripts(db, call, data.get("transcript"))

    def _sync_transcripts(self, db: Any, call: TeleCall, text: str | None) -> None:
        parsed = _parse_transcript(text)
        if not parsed:
            return
        case = db.get(Case, call.case_id)
        lang = case.language.value if (case and case.language) else "en"
        for sequence, (role, content) in enumerate(parsed, start=1):
            db.add(
                CallTranscript(
                    call_id=call.id,
                    sequence=sequence,
                    role=MessageRole.AI if role == "AI" else MessageRole.PATIENT,
                    content=content,
                    language=lang,
                )
            )

    # -- provider interface --------------------------------------------
    def create_outbound_call(
        self,
        *,
        db: Any,
        case: Case,
        phone_number: str | None,
        reason: str | None,
        questions: list[str],
        requested_by: User | None,
        followup_id: int | None = None,
    ) -> TeleCall:
        raw = phone_number or (case.patient.phone if case.patient else None)
        target = normalize_indian_phone(raw) or (raw or "").strip()
        if not target:
            raise AppError(
                "No phone number available to dial.",
                status_code=422,
                code="missing_phone_number",
            )

        selected_questions = list(questions) if questions else []
        variables: dict[str, Any] = {
            "patient_name": case.patient.full_name if case.patient else "Patient",
            "reason": reason or "Follow-up verification of clinical intake",
            "questions": selected_questions,
            "language": case.language.value if case.language else "en",
        }

        data = self._dial(to_number=target, variables=variables)

        remote_status = str(data.get("status") or "pending").lower()
        call = TeleCall(
            public_id=f"tc_{uuid.uuid4().hex[:12]}",
            case_id=case.id,
            followup_id=followup_id,
            requested_by_user_id=requested_by.id if requested_by else None,
            provider=self.name,
            phone_number=target,
            status=_STATUS_MAP.get(remote_status, CallStatus.DIALING),
            direction="OUTBOUND",
            reason=reason or "Follow-up verification of clinical intake",
            questions=selected_questions,
            external_call_id=str(data.get("id")),
            room_id=None,
            extracted_data={},
            duration_seconds=0,
        )
        db.add(call)
        db.flush()

        record_audit(
            db,
            AuditAction.TELECALL_DIALED,
            user=requested_by,
            case=case,
            metadata={
                "call_id": call.public_id,
                "provider": self.name,
                "agent_id": settings.snapserve_agent_id,
                "snapserve_call_id": call.external_call_id,
                "phone_masked": f"****{target[-4:]}" if len(target) >= 4 else "****",
            },
        )
        logger.info(
            "SnapServe outbound call %s placed to ****%s",
            call.external_call_id,
            target[-4:] if len(target) >= 4 else "",
        )
        return call

    def start_call(self, *, db: Any, call: TeleCall) -> TeleCall:
        if not call.external_call_id:
            call.status = CallStatus.DIALING
            db.flush()
            return call
        try:
            data = self._fetch(call.external_call_id)
        except AppError as exc:
            logger.warning("SnapServe status sync on start failed: %s", exc.message)
            data = {}
        self._apply_remote(db, call, data)
        if call.started_at is None and call.status in (CallStatus.CONNECTED, CallStatus.RINGING):
            call.started_at = datetime.now(UTC)
        db.flush()
        return call

    def run_turn(
        self,
        *,
        db: Any,
        call: TeleCall,
        patient_reply_override: str | None = None,
    ) -> CallTurnResult:
        data: dict[str, Any] = {}
        if call.external_call_id:
            try:
                data = self._fetch(call.external_call_id)
            except AppError as exc:
                logger.warning("SnapServe status sync on turn failed: %s", exc.message)
        self._apply_remote(db, call, data)
        db.flush()

        parsed = _parse_transcript(data.get("transcript"))
        agent_line = next((c for r, c in reversed(parsed) if r == "AI"), call.reason or "")
        patient_line = next((c for r, c in reversed(parsed) if r == "PATIENT"), "")

        return CallTurnResult(
            agent_question=agent_line,
            patient_response=patient_line,
            item_key="snapserve",
            extracted_value=None,
            is_last_question=call.status in _TERMINAL,
        )

    def complete_call(
        self,
        *,
        db: Any,
        call: TeleCall,
        actor: User | None = None,
    ) -> TeleCallResult:
        data: dict[str, Any] = {}
        if call.external_call_id:
            try:
                data = self._fetch(call.external_call_id)
            except AppError as exc:
                logger.warning("SnapServe status sync on complete failed: %s", exc.message)
            if _STATUS_MAP.get(str(data.get("status") or "").lower(), CallStatus.CONNECTED) not in _TERMINAL:
                ended = self._end_remote(call.external_call_id)
                if ended:
                    data = ended

        self._apply_remote(db, call, data)

        now = datetime.now(UTC)
        call.status = CallStatus.COMPLETED
        call.ended_at = call.ended_at or now
        if not call.duration_seconds:
            call.duration_seconds = 0

        case = db.get(Case, call.case_id)
        extracted = {
            k: v
            for k, v in dict(call.extracted_data or {}).items()
            if not isinstance(v, (dict, list))
        }

        if call.followup_id:
            followup = db.get(FollowUp, call.followup_id)
            if followup and followup.status != FollowUpStatus.COMPLETED:
                from schemas.case import FollowUpAnswer
                from services.followups import complete_followup

                answers = [FollowUpAnswer(item=k, value=str(v)) for k, v in extracted.items()]
                summary_text = (
                    f"SnapServe tele-call completed ({call.duration_seconds}s). "
                    + ", ".join(f"{k}: {v}" for k, v in extracted.items())
                )
                complete_followup(db, followup, answers=answers, summary=summary_text, actor=actor)

        record_audit(
            db,
            AuditAction.TELECALL_COMPLETED,
            user=actor,
            case=case,
            metadata={
                "telecall_id": call.public_id,
                "provider": self.name,
                "duration_seconds": call.duration_seconds,
                "extracted_data": extracted,
            },
        )
        db.flush()

        transcripts_list = [
            {"role": t.role.value, "content": t.content, "language": t.language or "en"}
            for t in call.transcripts
        ]
        return TeleCallResult(
            call_id=call.id,
            duration_seconds=call.duration_seconds,
            transcripts=transcripts_list,
            extracted_data={k: str(v) for k, v in extracted.items()},
        )
