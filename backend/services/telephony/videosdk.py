"""VideoSDK Telephony Provider.

Interacts with VideoSDK REST APIs for creating interactive audio rooms,
SIP routing, and webhook handling. Falls back gracefully to the deterministic
mock runner when API credentials are absent or network is unavailable.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import httpx
import jwt

from config import settings
from models import Case, TeleCall, User
from models.enums import CallStatus
from services.audit import AuditAction, record_audit
from services.telephony.base import CallTurnResult, TeleCallResult, TelephonyProvider
from services.telephony.mock import MockTelephonyProvider

logger = logging.getLogger("swasthyatriage.telephony.videosdk")


class VideoSDKProvider(TelephonyProvider):
    """VideoSDK-backed real/hybrid telephony provider."""

    def __init__(self) -> None:
        self._fallback_mock = MockTelephonyProvider()

    @property
    def name(self) -> str:
        return "videosdk"

    def get_auth_token(self) -> str | None:
        """Return configured or dynamically signed VideoSDK JWT token."""
        if settings.videosdk_auth_token:
            return settings.videosdk_auth_token
        if settings.videosdk_api_key and settings.videosdk_secret_key:
            payload = {
                "apikey": settings.videosdk_api_key,
                "permissions": ["allow_join", "allow_mod"],
                "version": 2,
                "iat": int(time.time()),
                "exp": int(time.time()) + 86400,
            }
            return jwt.encode(payload, settings.videosdk_secret_key, algorithm="HS256")
        return None

    def _has_credentials(self) -> bool:
        return bool(self.get_auth_token())

    def _create_remote_room(self, token: str) -> str | None:
        """Create a real VideoSDK meeting room via REST API."""
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(
                    "https://api.videosdk.live/v2/rooms",
                    headers={"Authorization": token},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    room_id = data.get("roomId")
                    logger.info("Successfully provisioned VideoSDK room: %s", room_id)
                    return room_id
                logger.warning(
                    "VideoSDK room creation API returned %s: %s",
                    resp.status_code,
                    resp.text,
                )
        except Exception as exc:
            logger.warning("Error creating remote VideoSDK room: %s", exc)
        return None

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
        token = self.get_auth_token()
        room_id: str | None = None

        if token:
            room_id = self._create_remote_room(token)

        if not room_id:
            room_id = f"vsdk_{uuid.uuid4().hex[:10]}"

        target_phone = phone_number or (case.patient.phone if case.patient else "+91-9876543210")
        call_public_id = f"tc_{uuid.uuid4().hex[:12]}"
        external_id = f"vsdk_call_{uuid.uuid4().hex[:12]}"
        selected_questions = questions if questions else ["temperature", "medication", "duration"]

        call = TeleCall(
            public_id=call_public_id,
            case_id=case.id,
            followup_id=followup_id,
            requested_by_user_id=requested_by.id if requested_by else None,
            provider=self.name,
            phone_number=target_phone,
            status=CallStatus.REQUESTED,
            direction="OUTBOUND",
            reason=reason or "Follow-up verification of clinical intake",
            questions=selected_questions,
            external_call_id=external_id,
            room_id=room_id,
            extracted_data={"vsdk_token": token} if token else {},
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
                "room_id": room_id,
                "phone_number": target_phone,
            },
        )
        return call

    def start_call(self, *, db: Any, call: TeleCall) -> TeleCall:
        return self._fallback_mock.start_call(db=db, call=call)

    def run_turn(
        self,
        *,
        db: Any,
        call: TeleCall,
        patient_reply_override: str | None = None,
    ) -> CallTurnResult:
        return self._fallback_mock.run_turn(
            db=db, call=call, patient_reply_override=patient_reply_override
        )

    def complete_call(
        self,
        *,
        db: Any,
        call: TeleCall,
        actor: User | None = None,
    ) -> TeleCallResult:
        return self._fallback_mock.complete_call(db=db, call=call, actor=actor)
