"""Bidirectional realtime voice via the Gemini Live API (native audio).

Unlike the turn-based agent in :mod:`services.voice.agent`, this module keeps a
single long-lived WebSocket to Gemini Live: raw 16 kHz PCM from the browser is
streamed in, and the model's 24 kHz PCM audio + live transcription are streamed
back with sub-second latency. No client-side ``speechSynthesis`` is involved.

The WebSocket endpoint in :mod:`api.voice` owns the transport; this module owns
configuration, model selection and post-session fact extraction.
"""

from __future__ import annotations

import logging

from config import settings

logger = logging.getLogger("swasthyatriage.voice.live")

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000
INPUT_MIME = f"audio/pcm;rate={INPUT_SAMPLE_RATE}"
OUTPUT_MIME = f"audio/pcm;rate={OUTPUT_SAMPLE_RATE}"

# A warm, neutral prebuilt voice for the "Sonam" persona.
VOICE_NAME = "Kore"

# Older/alternate Live model ids to try if the configured one is unavailable.
LIVE_FALLBACK_MODELS = [
    "gemini-2.5-flash-native-audio-preview-09-2025",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001",
]

_LANGUAGE_LABELS = {"hi": "Hindi or natural Hinglish", "od": "Odia", "en": "Indian English"}


def live_available() -> bool:
    """True when a Gemini API key is configured for Live streaming."""
    return bool(settings.gemini_api_key)


def live_models_to_try() -> list[str]:
    models: list[str] = []
    for model in [settings.gemini_live_model, *LIVE_FALLBACK_MODELS]:
        if model and model not in models:
            models.append(model)
    return models


def build_system_instruction(
    language: str, case_number: str, chief_concern: str | None
) -> str:
    lang = _LANGUAGE_LABELS.get(language, "Indian English")
    concern = (chief_concern or "not yet recorded").strip()
    return f"""You are Sonam, an empathetic AI clinical intake assistant working on behalf of a government health facility in India. You are on a live voice call with a patient for case {case_number}.

IDENTITY & CONSENT
- Your name is Sonam. You are an AI assistant, not a doctor or nurse. State this plainly if asked.
- Everything the patient says will be shared with a qualified healthcare professional for review.

HOW TO SPEAK
- This is a spoken conversation: speak naturally and warmly. NEVER output markdown, bullet points, JSON, emojis or stage directions.
- Keep every reply short (one to three sentences) and ask exactly ONE question at a time, then wait.
- Mirror the patient's language: {lang}. Match their level of formality and pace.

WHAT TO DO
- Recorded chief concern so far: {concern}.
- Collect, in a natural conversational order: the main symptom(s) and how long they have lasted, their severity (1-10), related symptoms, relevant past history, current medicines and any measurements the patient mentions (temperature, blood pressure, SpO2, sugar).
- Do not repeat questions the patient has already answered.

EMERGENCY (HIGHEST PRIORITY)
- If you detect red flags — crushing chest pain or pain radiating to arm/jaw, severe breathlessness, one-sided weakness or slurred speech, active heavy bleeding, suicide or self-harm distress — stop the normal intake. Calmly and clearly tell the patient to seek emergency care immediately at the nearest hospital or call 108 / 112 (mental-health crisis: Tele-MANAS 14416). Then continue only to gather their location if they can safely answer.

SAFETY
- Never give a diagnosis, never prescribe or name drug dosages, never tell the patient they are fine. You collect facts; a doctor decides.
- Begin now by greeting the patient and confirming they are ready to talk."""


def build_live_config(language: str, case_number: str, chief_concern: str | None):
    """Build a LiveConnectConfig for an audio-only Sonam session."""
    from google.genai import types

    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(
            role="system",
            parts=[types.Part(text=build_system_instruction(language, case_number, chief_concern))],
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE_NAME)
            )
        ),
    )


def get_live_client():
    """Create a google-genai client for Live streaming."""
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def finalize_live_session(
    db, case, *, transcript: str, language: str
) -> None:
    """Extract structured clinical facts from a finished live transcript.

    Best-effort: a live session already persisted every real utterance, so a
    failure here must never break session teardown — it simply logs.
    """
    transcript = (transcript or "").strip()
    if not transcript:
        return

    from models import CaseMeasurement, CaseSymptom
    from models.enums import Priority, Provenance
    from services.gemini.client import GeminiClient
    from services.intake.conversation import _ctx
    from services.safety.service import reevaluate_case

    try:
        res = GeminiClient().triage_voice_turn(
            user_text=transcript,
            language=language,
            prior_context={
                "case_number": case.case_number,
                "chief_concern": case.chief_concern,
                "existing_symptoms": [s.term for s in case.symptoms],
            },
            is_interactive=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Live transcript extraction failed: %s", exc)
        return

    existing = {s.normalized_term or s.term.lower() for s in case.symptoms}
    added: list[str] = []
    for sym in res.get("extracted_symptoms") or []:
        term = str(sym).strip()
        if term and term.lower() not in existing:
            db.add(
                CaseSymptom(
                    case_id=case.id,
                    term=term.title(),
                    normalized_term=term.lower(),
                    source=Provenance.AI_EXTRACTED,
                    collected_via="VOICE",
                    verified=False,
                )
            )
            existing.add(term.lower())
            added.append(term)

    for meas in res.get("extracted_measurements") or []:
        if isinstance(meas, dict) and meas.get("name") and meas.get("value") is not None:
            name = str(meas["name"]).strip()
            if not any(m.name.lower() == name.lower() for m in case.measurements):
                db.add(
                    CaseMeasurement(
                        case_id=case.id,
                        name=name.title(),
                        value=str(meas["value"])[:64],
                        unit=str(meas.get("unit") or "")[:32],
                        source=Provenance.AI_EXTRACTED,
                        collected_via="VOICE",
                        verified=False,
                    )
                )

    if not case.chief_concern and added:
        case.chief_concern = ", ".join(s.title() for s in added)[:300]

    duration_days = res.get("duration_days")
    if duration_days is not None and not case.timeline_text:
        case.timeline_text = f"Reported onset approximately {duration_days} days ago."

    if res.get("is_emergency") or res.get("urgency") == "RED":
        case.priority = Priority.URGENT_REVIEW
        ctx = _ctx(case)
        ctx["emergency_signal"] = {
            "detected": True,
            "reason": res.get("emergency_reason")
            or "Critical clinical red flags detected during live voice assessment",
            "urgency": res.get("urgency") or "RED",
        }

    try:
        reevaluate_case(db, case, trigger="voice", extra_free_text=transcript)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Live session safety re-evaluation failed: %s", exc)
