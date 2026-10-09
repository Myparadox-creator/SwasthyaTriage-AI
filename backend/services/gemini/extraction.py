"""Structured schema for document extraction + normalization.

Every provider (real Gemini or the offline mock) must produce this exact
shape. `normalize()` is the single business-validation gate: it strips,
deduplicates, caps and coerces, and rejects unusable structures so a
malformed model response can never leak partial junk into the case record.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, ValidationError

from services.gemini.errors import ProviderError

MAX_LIST_ITEMS = 25
MAX_TERM_LEN = 120
MAX_VALUE_LEN = 64
MAX_UNIT_LEN = 32
MAX_DURATION_LEN = 120
MAX_FREE_TEXT_LEN = 4000


class ExtractedMeasurement(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    value: str
    unit: str | None = None


class DocumentExtractionSchema(BaseModel):
    """Controlled fields extracted from a document. Never diagnostic."""

    model_config = ConfigDict(extra="ignore")

    symptoms: list[str] = []
    measurements: list[ExtractedMeasurement] = []
    medications: list[str] = []
    duration: str | None = None
    free_text: str = ""
    uncertainties: list[str] = []
    low_confidence: list[str] = []


def _clean_terms(items: list[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        text = re.sub(r"\s+", " ", str(item)).strip()[:MAX_TERM_LEN]
        if text and text.lower() not in {t.lower() for t in out}:
            out.append(text)
        if len(out) >= MAX_LIST_ITEMS:
            break
    return out


def normalize(data: dict | DocumentExtractionSchema) -> DocumentExtractionSchema:
    """Validate + clean provider output. Raises ProviderError."""
    if isinstance(data, DocumentExtractionSchema):
        raw: dict = data.model_dump()
    elif isinstance(data, dict):
        raw = data
    else:
        raise ProviderError(f"Expected object, got {type(data).__name__}")

    if not isinstance(raw, dict):
        raise ProviderError("Extraction output must be an object")

    try:
        schema = DocumentExtractionSchema.model_validate(raw)
    except ValidationError as exc:
        raise ProviderError(f"Invalid extraction structure: {exc.errors()[0].get('msg')}") from exc

    measurements: list[ExtractedMeasurement] = []
    seen_meas: set[tuple[str, str]] = set()
    for m in schema.measurements:
        name = re.sub(r"\s+", " ", str(m.name)).strip()[:MAX_TERM_LEN]
        value = re.sub(r"\s+", " ", str(m.value)).strip()[:MAX_VALUE_LEN]
        unit = (str(m.unit).strip()[:MAX_UNIT_LEN] if m.unit else None) or None
        key = (name.lower(), value)
        if name and value and key not in seen_meas:
            seen_meas.add(key)
            measurements.append(ExtractedMeasurement(name=name, value=value, unit=unit))
        if len(measurements) >= MAX_LIST_ITEMS:
            break

    duration = schema.duration
    if duration is not None:
        duration = re.sub(r"\s+", " ", str(duration)).strip()[:MAX_DURATION_LEN] or None

    return DocumentExtractionSchema(
        symptoms=_clean_terms(schema.symptoms),
        measurements=measurements,
        medications=_clean_terms(schema.medications),
        duration=duration,
        free_text=schema.free_text.strip()[:MAX_FREE_TEXT_LEN],
        uncertainties=_clean_terms(schema.uncertainties),
        low_confidence=_clean_terms(schema.low_confidence),
    )
