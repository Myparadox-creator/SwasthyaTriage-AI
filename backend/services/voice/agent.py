"""Multimodal and Multilingual Voice Agent (Gemini-first with deterministic fallback).

Provides robust clinical intake and triage assistance for Indian healthcare facilities.
Accepts speech-to-text text turns or direct base64 audio chunks, extracts structured clinical
entities (symptoms, measurements, duration), handles difficult and emergency red flags with
immediate 108/112 ambulance or Tele-MANAS helpline guidance, and never diagnoses definitively.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field

from config import settings
from models import Case, CaseMeasurement, CaseSymptom
from models.enums import Priority, Provenance
from services.gemini.client import GeminiClient
from services.intake.conversation import (
    _ctx,
    apply_extraction,
    build_reply,
    next_question,
    progress,
    record_answer_for_question,
)
from services.intake.fallback import Extraction, extract_from_message
from services.safety.service import reevaluate_case

logger = logging.getLogger("swasthyatriage.voice.agent")


class AudioUnsupportedError(Exception):
    """Raised when audio input cannot be processed."""


@dataclass
class VoiceTurn:
    """One assistant response produced from a single user turn."""

    text: str
    progress: dict
    can_submit: bool
    added_symptoms: list[str] = field(default_factory=list)
    added_measurement: bool = False
    audio_b64: str | None = None
    user_transcript: str | None = None
    is_emergency: bool = False
    urgency: str = "GREEN"


class VoiceAgent:
    name = "mock"

    def respond(
        self,
        *,
        db,
        case: Case,
        user_text: str | None = None,
        audio_b64: str | None = None,
        audio_mime: str | None = None,
        actor=None,
    ) -> VoiceTurn:
        raise NotImplementedError


class MockVoiceAgent(VoiceAgent):
    """Deterministic rule-based voice agent used for test environments or offline mode."""

    def respond(
        self,
        *,
        db,
        case: Case,
        user_text: str | None = None,
        audio_b64: str | None = None,
        audio_mime: str | None = None,
        actor=None,
    ) -> VoiceTurn:
        if audio_b64 and not settings.gemini_enabled:
            raise AudioUnsupportedError(
                "Voice audio input requires GEMINI_API_KEY (not configured)"
            )

        text = (user_text or "").strip()
        if not text and not audio_b64:
            raise ValueError("empty_turn")

        extraction = extract_from_message(text or "Voice symptom check")
        changes = apply_extraction(db, case, extraction, channel="VOICE")

        if not case.chief_concern:
            case.chief_concern = (
                ", ".join(s.title() for s in extraction.symptoms)[:300] or text[:300]
            )

        ctx = _ctx(case)
        if "duration_days" in ctx and not case.timeline_text:
            case.timeline_text = text[:500]

        active = next_question(db, case)
        if active is not None:
            record_answer_for_question(db, case, active, text, extraction)
        q = next_question(db, case)

        reevaluate_case(db, case, trigger="voice", actor=actor, extra_free_text=text)

        return VoiceTurn(
            text=build_reply(case, extraction, q),
            progress=progress(db, case),
            can_submit=q is None,
            added_symptoms=changes["added_symptoms"],
            added_measurement=changes["added_measurement"],
            user_transcript=text,
        )


class GeminiVoiceAgent(VoiceAgent):
    """Production clinical AI voice agent powered by Google Gemini.

    - Speech-to-Text: Native multimodal audio understanding.
    - Clinical Reasoning: Empathetic triage, red flag emergency detection.
    - Non-diagnostic: Collects facts, structures data, alerts doctor.
    - Resilient: Falls back smoothly to rule engine on unexpected network drops.
    """

    name = "gemini"

    def __init__(self) -> None:
        self._gemini = GeminiClient()
        self._mock_fallback = MockVoiceAgent()

    def respond(
        self,
        *,
        db,
        case: Case,
        user_text: str | None = None,
        audio_b64: str | None = None,
        audio_mime: str | None = None,
        actor=None,
    ) -> VoiceTurn:
        user_transcript: str | None = None
        effective_text = (user_text or "").strip()

        # 1. Multimodal Audio Processing (Speech-to-Text)
        if audio_b64:
            try:
                raw_bytes = base64.b64decode(audio_b64)
                transcribed = self._gemini.transcribe_audio(
                    raw_bytes, mime_type=audio_mime or "audio/webm"
                )
                if transcribed:
                    user_transcript = transcribed
                    effective_text = transcribed
            except Exception as exc:
                logger.warning("Audio transcription through Gemini failed: %s", exc)
                if not effective_text:
                    # If no fallback text was provided, re-raise or use descriptive note
                    effective_text = "Audio turn submitted"

        if not effective_text:
            raise ValueError("empty_turn")

        # 2. Clinical Triage Evaluation via Gemini
        try:
            prior_context = {
                "case_number": case.case_number,
                "chief_concern": case.chief_concern,
                "existing_symptoms": [s.term for s in case.symptoms],
                "existing_measurements": [f"{m.name}: {m.value}{m.unit}" for m in case.measurements],
                "timeline": case.timeline_text,
            }
            lang = case.language.value if case.language else "hi"
            res = self._gemini.triage_voice_turn(
                user_text=effective_text,
                language=lang,
                prior_context=prior_context,
            )
        except Exception as exc:
            logger.warning("Gemini clinical voice turn failed, falling back to rule engine: %s", exc)
            return self._mock_fallback.respond(
                db=db,
                case=case,
                user_text=effective_text,
                actor=actor,
            )

        # 3. Persist Extracted Clinical Entities
        reply_text = res.get("reply_text") or "Aapki jaankari darj kar li gayi hai."
        symptoms_extracted = res.get("extracted_symptoms") or []
        measurements_extracted = res.get("extracted_measurements") or []
        duration_days = res.get("duration_days")
        is_emergency = bool(res.get("is_emergency"))
        urgency = res.get("urgency") or ("RED" if is_emergency else "GREEN")
        can_conclude = bool(res.get("can_conclude")) or is_emergency

        added_symptoms: list[str] = []
        existing_symptom_terms = {s.normalized_term or s.term.lower() for s in case.symptoms}

        for sym in symptoms_extracted:
            clean_term = str(sym).strip()
            if clean_term and clean_term.lower() not in existing_symptom_terms:
                db.add(
                    CaseSymptom(
                        case_id=case.id,
                        term=clean_term.title(),
                        normalized_term=clean_term.lower(),
                        source=Provenance.AI_EXTRACTED,
                        collected_via="VOICE",
                        verified=False,
                    )
                )
                added_symptoms.append(clean_term)
                existing_symptom_terms.add(clean_term.lower())

        added_measurement = False
        for meas in measurements_extracted:
            if isinstance(meas, dict) and meas.get("name") and meas.get("value") is not None:
                m_name = str(meas["name"]).strip()
                if not any(m.name.lower() == m_name.lower() for m in case.measurements):
                    db.add(
                        CaseMeasurement(
                            case_id=case.id,
                            name=m_name.title(),
                            value=float(meas["value"]) if str(meas["value"]).replace(".", "", 1).isdigit() else 0.0,
                            unit=str(meas.get("unit") or ""),
                            source=Provenance.AI_EXTRACTED,
                            collected_via="VOICE",
                            verified=False,
                        )
                    )
                    added_measurement = True

        if not case.chief_concern:
            case.chief_concern = (
                ", ".join(s.title() for s in added_symptoms)[:300] or effective_text[:300]
            )

        ctx = _ctx(case)
        if duration_days is not None and "duration_days" not in ctx:
            ctx["duration_days"] = duration_days
        if not case.timeline_text and duration_days:
            case.timeline_text = f"Reported onset approximately {duration_days} days ago."

        # 4. Handle Red Flag Emergencies
        if is_emergency or urgency == "RED":
            case.priority = Priority.URGENT_REVIEW
            ctx["emergency_signal"] = {
                "detected": True,
                "reason": res.get("emergency_reason") or "Critical clinical red flags detected during voice assessment",
                "urgency": urgency,
            }

        # 5. Safety Reevaluation
        reevaluate_case(db, case, trigger="voice", actor=actor, extra_free_text=effective_text)
        db.flush()

        active_q = next_question(db, case)
        answered = len(ctx.get("answers") or {})
        total_q = max(len(case.symptoms) + 2, 5)

        return VoiceTurn(
            text=reply_text,
            progress={"answered": answered, "total": total_q, "percent": min(100, int((answered / total_q) * 100))},
            can_submit=can_conclude or active_q is None,
            added_symptoms=added_symptoms,
            added_measurement=added_measurement,
            user_transcript=user_transcript or effective_text,
            is_emergency=is_emergency,
            urgency=urgency,
        )


def get_voice_agent() -> VoiceAgent:
    """Factory: Return GeminiVoiceAgent if API key configured, otherwise MockVoiceAgent."""
    if settings.gemini_enabled:
        return GeminiVoiceAgent()
    return MockVoiceAgent()