"""Multimodal and Multilingual Voice Agent (Gemini-first with deterministic fallback).

Provides robust clinical intake and triage assistance for Indian healthcare facilities.
Accepts speech-to-text text turns or direct base64 audio chunks, extracts structured clinical
entities (symptoms, measurements, duration), handles difficult and emergency red flags with
immediate 108/112 ambulance or Tele-MANAS helpline guidance, and never diagnoses definitively.
"""

from __future__ import annotations

import base64
import logging
import re
import time
from dataclasses import dataclass, field

from config import settings
from models import Case, CaseMeasurement, CaseSymptom
from models.enums import Priority, Provenance
from services.gemini.client import GeminiClient, is_circuit_open
from services.intake.conversation import (
    _ctx,
    apply_extraction,
    build_reply,
    next_question,
    progress,
    record_answer_for_question,
)
from services.intake.fallback import extract_from_message
from services.safety.service import reevaluate_case

logger = logging.getLogger("swasthyatriage.voice.agent")

ASSISTANT_NAME = "Sonam"

# First-contact identity + consent disclosure, per language. Sonam introduces
# itself as an AI (not a doctor) and asks for consent before collecting anything.
SONAM_GREETING: dict[str, str] = {
    "en": (
        "Namaste, I am Sonam, an AI health intake assistant from SwasthyaTriage AI. "
        "I am not a doctor and I do not diagnose or prescribe. If you are comfortable, "
        "I will ask a few questions about your health, and your answers will be shared "
        "with a healthcare professional for review. Shall we begin?"
    ),
    "hi": (
        "नमस्ते, मैं सोनम हूँ, स्वास्थ्यट्राइएज एआई की एक एआई स्वास्थ्य सहायक हूँ। "
        "मैं डॉक्टर नहीं हूँ और कोई निदान या दवा नहीं बताती। यदि आप सहज हों, तो मैं आपके "
        "स्वास्थ्य के बारे में कुछ सवाल पूछूँगी, और आपके उत्तर एक स्वास्थ्य पेशेवर की "
        "समीक्षा के लिए साझा किए जाएँगे। क्या हम शुरू करें?"
    ),
    "od": (
        "ନମସ୍କାର, ମୁଁ ସୋନମ, ସ୍ୱାସ୍ଥ୍ୟଟ୍ରାଇଏଜ ଏଆଇର ଜଣେ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟିକା। "
        "ମୁଁ ଡାକ୍ତର ନୁହେଁ ଏବଂ କୌଣସି ରୋଗ ନିର୍ଣ୍ଣୟ କିମ୍ବା ଔଷଧ ଦେଇ ନଥାଏ। ଆପଣ ସହଜ ଥିଲେ, "
        "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ବିଷୟରେ କିଛି ପ୍ରଶ୍ନ ପଚାରିବି, ଏବଂ ଆପଣଙ୍କ ଉତ୍ତର ଜଣେ "
        "ସ୍ୱାସ୍ଥ୍ୟ ପେସାଦାରଙ୍କ ସମୀକ୍ଷା ପାଇଁ ସେୟାର କରାଯିବ। ଆମେ ଆରମ୍ଭ କରିବା?"
    ),
}


def build_emergency_reply(lang_code: str) -> str:
    """Red-flag safety reply: always gives national emergency numbers.

    A configured supplementary contact is offered as additional help. We never
    claim that a call has been connected or placed — only that the patient can
    dial, or that the care team can be reached on the number.
    """
    contact = (settings.emergency_escalation_contact or "").strip()
    extra_en = f" You may also reach our emergency desk at {contact}." if contact else ""
    extra_hi = f" आप हमारे आपातकालीन डेस्क {contact} पर भी संपर्क कर सकते हैं।" if contact else ""
    extra_od = f" ଆପଣ ଆମର ଆପାତକାଳୀନ ଡେସ୍କ {contact} ରେ ମଧ୍ୟ ଯୋଗାଯୋଗ କରିପାରିବେ।" if contact else ""

    if lang_code == "hi":
        return (
            "🚨 गंभीर चेतावनी संकेत मिले हैं। कृपया तुरंत नज़दीकी अस्पताल के आपातकालीन "
            f"विभाग में जाएँ या 108 / 112 एम्बुलेंस को कॉल करें।{extra_hi}"
        )
    if lang_code == "od":
        return (
            "🚨 ଗୁରୁତର ସୂଚକ ଚିହ୍ନ ମିଳିଛି। ଦୟାକରି ତୁରନ୍ତ ନିକଟସ୍ଥ ଡାକ୍ତରଖାନାର "
            f"ଆପାତକାଳୀନ ବିଭାଗକୁ ଯାଆନ୍ତୁ କିମ୍ବା ୧୦୮ / ୧୧୨ ଆମ୍ବୁଲାନ୍ସ ଡାକନ୍ତୁ।{extra_od}"
        )
    return (
        "🚨 Critical red-flag symptoms detected. Please seek emergency care immediately "
        f"at the nearest hospital or call 108 / 112 for an ambulance.{extra_en}"
    )



def _is_emergency_text(text: str) -> bool:
    """Regex pattern detector for critical clinical red flags across English, Hindi, and Odia."""
    t = (text or "").lower()
    patterns = [
        # Chest / Cardiac
        r"\b(?:chest|seene|chhati)\b.*?\b(?:pain|tightness|pressure|dard|takleef|betha)\b",
        r"\b(?:baayein|left)\s+(?:haath|arm|shoulder)\b",
        r"\b(?:heart\s+attack|dil\s+ka\s+daura)\b",
        # Respiratory
        r"\b(?:shortness\s+of\s+breath|breathless|gasping|stridor)\b",
        r"\bsaans\s+lene\s+(?:me|mein)\b.*?\b(?:takleef|dikkat|pareshani|kashta)\b",
        r"\b(?:saans\s+phool|swasa\s+kashta|sweas\s+asuchi)\b",
        # Neurological / Consciousness
        r"\b(?:unconscious|fainted|seizure|paralysis|behosh|daura)\b",
        r"\b(?:facial\s+droop|slurred\s+speech)\b",
        # Hemorrhage / Trauma
        r"\b(?:uncontrolled\s+bleeding|vomiting\s+blood|coughing\s+blood|khoon\s+ki\s+ulti|rokto)\b",
        # Self-harm / Crisis
        r"\b(?:suicide|kill\s+myself|end\s+my\s+life|aatmahatya|khudkushi)\b",
    ]
    return any(re.search(p, t) for p in patterns)


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
    diagnostics: dict = field(default_factory=dict)


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
        t0 = time.perf_counter()
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

        is_emergency = case.priority == Priority.URGENT_REVIEW or _is_emergency_text(text)
        if is_emergency:
            case.priority = Priority.URGENT_REVIEW
            lang_code = case.language.value if case.language else "hi"
            reply_text = build_emergency_reply(lang_code)
        else:
            reply_text = build_reply(case, extraction, q)

        processing_ms = round((time.perf_counter() - t0) * 1000, 1)
        return VoiceTurn(
            text=reply_text,
            progress=progress(db, case),
            can_submit=is_emergency or q is None,
            added_symptoms=changes["added_symptoms"],
            added_measurement=changes["added_measurement"],
            user_transcript=text,
            is_emergency=is_emergency,
            urgency="RED" if is_emergency else "GREEN",
            diagnostics={
                "processing_ms": processing_ms,
                "provider": "mock",
                "is_emergency": is_emergency,
                "fast_path": True,
            },
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
        t0 = time.perf_counter()
        # Fast-path: If Gemini circuit breaker is open, bypass network and return deterministic turn in <5ms
        if is_circuit_open():
            logger.info("Gemini circuit breaker open: fast-pathing voice turn to deterministic fallback")
            return self._mock_fallback.respond(
                db=db,
                case=case,
                user_text=user_text,
                audio_b64=audio_b64,
                audio_mime=audio_mime,
                actor=actor,
            )

        user_transcript: str | None = None
        effective_text = (user_text or "").strip()
        lang = case.language.value if case.language else "hi"

        # Critical Safety Directive: Never delay emergency escalation while waiting for an external LLM
        if _is_emergency_text(effective_text):
            logger.info("Critical emergency detected via regex fast-path: immediate triage escalation")
            return self._mock_fallback.respond(
                db=db,
                case=case,
                user_text=effective_text,
                audio_b64=audio_b64,
                audio_mime=audio_mime,
                actor=actor,
            )

        # 1. Multimodal Audio Processing (Speech-to-Text)
        # Fast-path: If client-side speech recognition already transcribed the utterance (effective_text is non-empty),
        # skip redundant network audio transcription to optimize response latency.
        if audio_b64 and not effective_text:
            try:
                raw_bytes = base64.b64decode(audio_b64)
                transcribed = self._gemini.transcribe_audio(
                    raw_bytes,
                    mime_type=audio_mime or "audio/webm",
                    is_interactive=True,
                    language=lang,
                )
                if transcribed:
                    user_transcript = transcribed
                    effective_text = transcribed
            except Exception as exc:
                logger.warning("Audio transcription through Gemini failed: %s", exc)
                return self._mock_fallback.respond(
                    db=db,
                    case=case,
                    user_text="Audio turn submitted",
                    actor=actor,
                )

        if not effective_text:
            raise ValueError("empty_turn")

        # 2. Clinical Triage Evaluation via Gemini
        t_llm_start = time.perf_counter()
        try:
            prior_context = {
                "case_number": case.case_number,
                "chief_concern": case.chief_concern,
                "existing_symptoms": [s.term for s in case.symptoms],
                "existing_measurements": [f"{m.name}: {m.value}{m.unit}" for m in case.measurements],
                "timeline": case.timeline_text,
            }
            res = self._gemini.triage_voice_turn(
                user_text=effective_text,
                language=lang,
                prior_context=prior_context,
                is_interactive=True,
            )
            llm_time_ms = round((time.perf_counter() - t_llm_start) * 1000, 1)
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
                            value=str(meas["value"])[:64],
                            unit=str(meas.get("unit") or "")[:32],
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
            contact = (settings.emergency_escalation_contact or "").strip()
            if contact and contact not in reply_text:
                suffix = {
                    "hi": f" आप हमारे आपातकालीन डेस्क {contact} पर भी संपर्क कर सकते हैं।",
                    "od": f" ଆପଣ ଆମର ଆପାତକାଳୀନ ଡେସ୍କ {contact} ରେ ମଧ୍ୟ ଯୋଗାଯୋଗ କରିପାରିବେ।",
                }.get(lang, f" You may also reach our emergency desk at {contact}.")
                reply_text = f"{reply_text}{suffix}"

        # 5. Safety Reevaluation
        reevaluate_case(db, case, trigger="voice", actor=actor, extra_free_text=effective_text)
        db.flush()

        active_q = next_question(db, case)
        answered = len(ctx.get("answers") or {})
        total_q = max(len(case.symptoms) + 2, 5)

        processing_ms = round((time.perf_counter() - t0) * 1000, 1)
        return VoiceTurn(
            text=reply_text,
            progress={"answered": answered, "total": total_q, "percent": min(100, int((answered / total_q) * 100))},
            can_submit=can_conclude or active_q is None,
            added_symptoms=added_symptoms,
            added_measurement=added_measurement,
            user_transcript=user_transcript or effective_text,
            is_emergency=is_emergency,
            urgency=urgency,
            diagnostics={
                "processing_ms": processing_ms,
                "llm_time_ms": llm_time_ms,
                "provider": "gemini",
                "is_emergency": is_emergency,
                "fast_path": False,
            },
        )


def get_voice_agent() -> VoiceAgent:
    """Factory: Return GeminiVoiceAgent if API key configured, otherwise MockVoiceAgent."""
    if settings.gemini_enabled:
        return GeminiVoiceAgent()
    return MockVoiceAgent()