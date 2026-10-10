"""Abstract Telephony Provider interface.

Allows SwasthyaTriage AI to decouple tele-calling and voice agents from specific
telephony vendors (VideoSDK, Mock, Twilio, SIP trunking).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from models import Case, TeleCall, User


@dataclass
class CallTurnResult:
    """One conversational turn in a tele-call."""

    agent_question: str
    patient_response: str
    item_key: str
    extracted_value: str | None = None
    is_last_question: bool = False


@dataclass
class TeleCallResult:
    """Summary of a completed tele-call."""

    call_id: int
    duration_seconds: int
    transcripts: list[dict[str, str]]
    extracted_data: dict[str, str] = field(default_factory=dict)
    error: str | None = None


class TelephonyProvider(ABC):
    """Abstract provider for outbound tele-calling and speech agent interaction."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'mock', 'videosdk')."""

    @abstractmethod
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
        """Create and persist an outbound tele-call record."""

    @abstractmethod
    def start_call(self, *, db: Any, call: TeleCall) -> TeleCall:
        """Trigger call dialing and establish connection."""

    @abstractmethod
    def run_turn(
        self,
        *,
        db: Any,
        call: TeleCall,
        patient_reply_override: str | None = None,
    ) -> CallTurnResult:
        """Execute the next conversational turn in the call."""

    @abstractmethod
    def complete_call(
        self,
        *,
        db: Any,
        call: TeleCall,
        actor: User | None = None,
    ) -> TeleCallResult:
        """Finalize call, parse extracted answers, and update case."""
