"""Real Gemini provider (google-genai) with model waterfall fallback.

Activated only when `GEMINI_API_KEY` is configured. All calls: 30s timeout,
graceful fallback through resilient flash models, and every failure is
wrapped in ProviderError so endpoints never surface raw 500s or provider stack traces.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config import settings
from services.gemini.errors import ProviderError
from services.gemini.extraction import DocumentExtractionSchema, normalize
from services.gemini.summary import SYSTEM_PROMPT, build_generation_prompt

logger = logging.getLogger("swasthyatriage.gemini")

TIMEOUT_MS = 30_000
TEMPERATURE = 0.1

FALLBACK_MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-flash-latest",
]

EXTRACTION_INSTRUCTIONS = """Extract controlled facts from the document text below.
Return ONLY a JSON object with exactly these keys:
symptoms (array of short strings), measurements (array of {name, value, unit}),
medications (array of short strings), duration (string or null),
free_text (the relevant document text), uncertainties (array of strings),
low_confidence (array of strings).
Rules: never diagnose; copy terms as written; mark anything ambiguous in
uncertainties; if the document is not a health document, return empty arrays
and put your observation in uncertainties."""

VOICE_TRIAGE_SYSTEM_PROMPT = """You are SwasthyaTriage AI, an expert, empathetic clinical intake and triage assistant designed for public healthcare institutions (PHCs, CHCs, Government Hospitals) across India.

MANDATORY CLINICAL & ETHICAL DIRECTIVES:
1. NON-DIAGNOSTIC & HUMAN-IN-THE-LOOP:
   - You NEVER provide a definitive medical diagnosis.
   - You NEVER prescribe medications or suggest specific drug dosages.
   - Your explicit role is to collect, understand, and structure the patient's concerns for review by a qualified doctor or healthcare worker.

2. MULTILINGUAL & CULTURALLY ATTUNED:
   - Identify and respond in the patient's language: Hindi (Devanagari or Hinglish), Odia (Odia script or conversational), or Indian English.
   - Maintain a calm, warm, empathetic, and respectful demeanor.

3. EMERGENCY & DIFFICULT SITUATIONS (HIGH PRIORITY SAFETY PROTOCOL):
   - You must vigilantly detect RED FLAG / CRITICAL symptoms:
     * Cardiac / Thoracic: Crushing or tight chest pain, radiation to left arm/neck/jaw, cold sweats.
     * Respiratory: Severe breathlessness, gasping, stridor, inability to speak complete sentences.
     * Neurological: Sudden weakness or numbness on one side, facial droop, slurred speech, acute confusion, seizures.
     * Hemorrhagic / Trauma: Profuse uncontrolled bleeding, vomiting blood, coughing blood, severe trauma.
     * Pediatric: High fever in an infant (< 3 months), extreme lethargy, poor feeding.
     * Mental Health Crisis / Self-Harm: Suicidal distress, hopelessness, thoughts of self-harm.
   - When RED FLAGS are detected:
     * Mark "is_emergency": true, "urgency": "RED".
     * In "reply_text": Advise the patient IMMEDIATELY to seek emergency care at the nearest Emergency Department / District Hospital, or dial 108 / 112 ambulance.
     * For mental health distress: Provide India's national Tele-MANAS toll-free helpline: 14416 / 1800-891-4416.
     * Keep your tone calm, steady, and clear. Avoid panic while conveying urgent necessity of medical evaluation.

4. STRUCTURED FACT EXTRACTION:
   - Extract reported symptoms as clear medical terms (e.g. Fever, Chest Pain, Cough).
   - Extract any measurements if mentioned (e.g. Temperature 102 F, SpO2 95%, Blood Pressure).
   - Extract duration (in days/hours).
   - If non-emergency, ask ONE focused follow-up question regarding onset, progression, severity (1-10 scale), or associated symptoms.

Return strictly a valid JSON object matching this schema:
{
  "reply_text": "Empathetic, clear conversational response to the patient in their language",
  "extracted_symptoms": ["Symptom 1", "Symptom 2"],
  "extracted_measurements": [{"name": "Temperature", "value": 102.0, "unit": "F"}],
  "duration_days": 3,
  "is_emergency": false,
  "emergency_reason": null,
  "urgency": "GREEN" | "YELLOW" | "RED",
  "can_conclude": false
}"""


class GeminiClient:
    name = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key or settings.gemini_api_key
        self.model = model or settings.gemini_model
        self._client = None

    def _models_to_try(self) -> list[str]:
        """Ordered list of models with resilient fallback cascade."""
        models = [self.model]
        for m in FALLBACK_MODELS:
            if m not in models:
                models.append(m)
        return models

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                from google.genai import types
            except ImportError as exc:  # pragma: no cover
                raise ProviderError("google-genai is not installed") from exc
            try:
                self._client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=TIMEOUT_MS),
                )
            except Exception as exc:  # noqa: BLE001
                raise ProviderError(f"Could not initialise Gemini client: {exc}") from exc
        return self._client

    @staticmethod
    def _parse_json(text: str | None) -> dict:
        if not text:
            raise ProviderError("Provider returned an empty response")
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ProviderError(f"Malformed provider JSON: {exc.msg}") from exc
        if not isinstance(data, dict):
            raise ProviderError("Provider JSON must be an object")
        return data

    def _generate(self, prompt: str, *, system: str | None = None, as_json: bool) -> str:
        from google.genai import types

        config_kwargs: dict = {"temperature": TEMPERATURE}
        if as_json:
            config_kwargs["response_mime_type"] = "application/json"
        if system:
            config_kwargs["system_instruction"] = system

        last_error: ProviderError | None = None
        for model in self._models_to_try():
            try:
                response = self._get_client().models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                text = getattr(response, "text", None)
                if text:
                    return text
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini model %s failed, attempting fallback: %s", model, exc)
                last_error = ProviderError(f"Gemini request failed on {model}: {exc}")
                continue
        raise last_error or ProviderError("All Gemini fallback models exhausted")

    def _generate_parts(self, prompt: str, part) -> str:
        from google.genai import types

        last_error: ProviderError | None = None
        for model in self._models_to_try():
            try:
                response = self._get_client().models.generate_content(
                    model=model,
                    contents=[part, prompt],
                    config=types.GenerateContentConfig(
                        temperature=TEMPERATURE, response_mime_type="application/json"
                    ),
                )
                text = getattr(response, "text", None)
                if text:
                    return text
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini multimodal on %s failed: %s", model, exc)
                last_error = ProviderError(f"Gemini request failed on {model}: {exc}")
                continue
        raise last_error or ProviderError("All Gemini fallback models exhausted")

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        """Transcribe speech audio bytes using Gemini multimodal audio understanding."""
        from google.genai import types

        part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        prompt = (
            "Transcribe the spoken audio verbatim in its original language (Hindi, Odia, English, etc.). "
            "Return ONLY the plain transcript text without commentary, quotes, or metadata."
        )
        for model in self._models_to_try():
            try:
                response = self._get_client().models.generate_content(
                    model=model,
                    contents=[part, prompt],
                )
                text = getattr(response, "text", "")
                if text and text.strip():
                    return text.strip()
            except Exception as exc:
                logger.warning("Transcription failed on %s: %s", model, exc)
                continue
        raise ProviderError("Failed to transcribe audio across all available models")

    def triage_voice_turn(
        self,
        *,
        user_text: str,
        language: str = "en",
        prior_context: dict | None = None,
    ) -> dict[str, Any]:
        """Triage turn processing with clinical prompt, emergency handling, and structured extraction."""
        ctx_dump = json.dumps(prior_context or {}, ensure_ascii=False)
        prompt = (
            f"Case Background & Prior Context:\n{ctx_dump}\n\n"
            f"Patient Language Requested: {language}\n\n"
            f"Current Patient Statement:\n{user_text}\n\n"
            f"Provide your structured triage reply per your system instructions."
        )
        raw = self._generate(prompt, system=VOICE_TRIAGE_SYSTEM_PROMPT, as_json=True)
        return self._parse_json(raw)

    def extract_document(self, text: str, *, filename: str = "") -> DocumentExtractionSchema:
        raw = self._generate(
            f"{EXTRACTION_INSTRUCTIONS}\n\nDocument filename: {filename}\n"
            f"--- DOCUMENT TEXT ---\n{text}\n--- END DOCUMENT TEXT ---",
            as_json=True,
        )
        return normalize(self._parse_json(raw))

    def extract_image(
        self, image: bytes, mime: str, *, filename: str = ""
    ) -> DocumentExtractionSchema:
        from google.genai import types

        part = types.Part.from_bytes(data=image, mime_type=mime)
        prompt = f"Document filename: {filename}\n{EXTRACTION_INSTRUCTIONS}"
        raw = self._generate_parts(prompt, part)
        return normalize(self._parse_json(raw))

    def summarize_case(self, payload: dict) -> str:
        text = self._generate(
            build_generation_prompt(payload),
            system=SYSTEM_PROMPT,
            as_json=False,
        ).strip()
        if not text:
            raise ProviderError("Gemini returned an empty summary")
        return text

    def suggest_questions(self, *, candidates: list[str]) -> list[str] | None:
        prompt = (
            "From the allowed question codes below, return a JSON object "
            '{"codes": [...]} with the subset most relevant to a case with '
            "missing information. Return only codes from the list.\n"
            f"Allowed: {json.dumps(candidates)}"
        )
        try:
            raw = self._generate(prompt, as_json=True)
            data = self._parse_json(raw)
        except ProviderError:
            return None
        codes = data.get("codes")
        if not isinstance(codes, list):
            return None
        return [str(c) for c in codes]
