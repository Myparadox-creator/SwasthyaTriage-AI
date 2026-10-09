"""Offline mock provider — honest, deterministic, no fabricated AI.

- extract_document: reuses the existing keyword/fallback extractor on raw
  text (clearly labeled as keyword-matched in `uncertainties`).
- extract_image: raises ProviderUnavailable (NO fabricated OCR).
- summarize_case: deterministic composition of structured case data.
- suggest_questions: passes the bank candidate set through unchanged.
"""

from __future__ import annotations

from services.gemini.errors import ProviderUnavailable
from services.gemini.extraction import (
    DocumentExtractionSchema,
    ExtractedMeasurement,
    normalize,
)
from services.gemini.summary import render_mock_summary

KEYWORD_NOTE = (
    "Keyword-matched by the offline mock extractor — verify against the original document."
)
IMAGE_UNAVAILABLE = "Image extraction requires GEMINI_API_KEY (not configured)"


class MockGeminiProvider:
    name = "mock"

    def extract_document(self, text: str, *, filename: str = "") -> DocumentExtractionSchema:
        from services.intake.fallback import extract_from_message

        ex = extract_from_message(text)
        measurements: list[ExtractedMeasurement] = []
        if ex.temperature_f is not None:
            measurements.append(
                ExtractedMeasurement(name="Temperature", value=f"{ex.temperature_f:g}", unit="°F")
            )
        elif ex.temperature_c is not None:
            measurements.append(
                ExtractedMeasurement(name="Temperature", value=f"{ex.temperature_c:g}", unit="°C")
            )

        uncertainties = [KEYWORD_NOTE] if (ex.symptoms or measurements or ex.duration_days) else []
        schema = DocumentExtractionSchema(
            symptoms=list(ex.symptoms),
            measurements=measurements,
            medications=[],
            duration=f"{ex.duration_days} days" if ex.duration_days else None,
            free_text=text.strip(),
            uncertainties=uncertainties,
            low_confidence=[f"severity={ex.severity}"] if ex.severity else [],
        )
        return normalize(schema)

    def extract_image(
        self, image: bytes, mime: str, *, filename: str = ""
    ) -> DocumentExtractionSchema:
        # Honest degradation: the mock never fabricates OCR for an image.
        raise ProviderUnavailable(IMAGE_UNAVAILABLE)

    def summarize_case(self, payload: dict) -> str:
        return render_mock_summary(payload)

    def suggest_questions(self, *, candidates: list[str]) -> list[str] | None:
        return list(candidates)
