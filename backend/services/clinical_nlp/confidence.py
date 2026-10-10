"""Confidence estimation and calibration tiering for clinical NLP extractions.

Separates raw model probability from empirical calibration status.
Provides bounded confidence estimates for extracted symptoms and vitals
along with exact token/character evidence quotes.
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass
from typing import Any

from models.enums import Provenance


class ConfidenceTier(str, enum.Enum):
    HIGH = "HIGH"        # >= 0.85: Strong lexical/visual evidence, physiologically valid
    MEDIUM = "MEDIUM"    # 0.60 - 0.84: Extracted with partial ambiguity or mild uncertainty
    LOW = "LOW"          # < 0.60: Weak support, ambiguous phrasing, or unverified OCR scan


@dataclass
class ConfidenceItem:
    """An extracted entity with explicit confidence metadata."""

    entity_type: str  # "symptom" | "measurement" | "medication" | "duration"
    name: str
    value: str | None
    unit: str | None
    confidence: float
    tier: ConfidenceTier
    is_calibrated: bool
    evidence_quote: str | None
    rationale: str
    provenance: Provenance

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
            "confidence": round(self.confidence, 3),
            "tier": self.tier.value,
            "is_calibrated": self.is_calibrated,
            "evidence_quote": self.evidence_quote,
            "rationale": self.rationale,
            "provenance": self.provenance.value,
        }


# Uncertainty words indicating reduced confidence
HEDGING_KEYWORDS = {
    "maybe", "perhaps", "mildly", "slightly", "uncertain", "doubtful",
    "suspected", "possible", "rule out", "r/o", "unclear", "lag raha hai",
    "ho sakti hai", "sambhabata", "kichi kichi",
}


def _find_evidence_quote(term: str, context: str | None, window: int = 60) -> str | None:
    if not context or not term:
        return None
    # Case-insensitive search for term
    pattern = re.escape(term.strip())
    match = re.search(pattern, context, re.IGNORECASE)
    if not match:
        # Fallback to searching words
        first_word = term.strip().split()[0] if term.strip() else ""
        if len(first_word) >= 3:
            match = re.search(re.escape(first_word), context, re.IGNORECASE)
    if match:
        start = max(0, match.start() - window)
        end = min(len(context), match.end() + window)
        snippet = context[start:end].strip()
        return f"...{snippet}..." if (start > 0 or end < len(context)) else snippet
    return None


def estimate_symptom_confidence(
    term: str,
    context_text: str | None = None,
    raw_model_confidence: float | None = None,
    provenance: Provenance = Provenance.AI_EXTRACTED,
) -> ConfidenceItem:
    """Calculates confidence score and tier for an extracted symptom."""
    score = raw_model_confidence if raw_model_confidence is not None else 0.80
    rationale_parts = []

    clean_term = term.strip()
    evidence = _find_evidence_quote(clean_term, context_text)

    if evidence:
        score += 0.08
        rationale_parts.append("Direct lexical grounding verified in source text")
    else:
        score -= 0.15
        rationale_parts.append("No verbatim span match found in source text")

    # Check for hedging/uncertainty in context
    if evidence:
        evidence_lower = evidence.lower()
        if any(h in evidence_lower for h in HEDGING_KEYWORDS):
            score -= 0.20
            rationale_parts.append("Hedging/uncertainty marker detected near entity")

    # Length & specificity heuristic
    if len(clean_term) < 3:
        score -= 0.25
        rationale_parts.append("Very short symptom string (<3 characters)")
    elif len(clean_term.split()) >= 1:
        score += 0.04

    # Bound between 0.10 and 0.98 (never 1.0 without human verification)
    score = max(0.10, min(0.98, score))

    if score >= 0.85:
        tier = ConfidenceTier.HIGH
    elif score >= 0.60:
        tier = ConfidenceTier.MEDIUM
    else:
        tier = ConfidenceTier.LOW

    rationale = "; ".join(rationale_parts) if rationale_parts else "Standard extraction"

    return ConfidenceItem(
        entity_type="symptom",
        name=clean_term,
        value=None,
        unit=None,
        confidence=score,
        tier=tier,
        is_calibrated=False,  # Raw heuristic until calibrated via benchmark test suite
        evidence_quote=evidence,
        rationale=rationale,
        provenance=provenance,
    )


def estimate_measurement_confidence(
    name: str,
    value: str,
    unit: str | None = None,
    context_text: str | None = None,
    raw_model_confidence: float | None = None,
    provenance: Provenance = Provenance.AI_EXTRACTED,
) -> ConfidenceItem:
    """Evaluates measurement validity, unit consistency, and confidence tier."""
    score = raw_model_confidence if raw_model_confidence is not None else 0.85
    rationale_parts = []

    clean_name = name.strip()
    clean_val = value.strip()
    query = f"{clean_name} {clean_val}"
    evidence = _find_evidence_quote(clean_val, context_text) or _find_evidence_quote(clean_name, context_text)

    if evidence:
        score += 0.05
        rationale_parts.append("Measurement value ground truth span located")
    else:
        score -= 0.10
        rationale_parts.append("Measurement span not cleanly matched in text")

    # Physiological plausibility validation
    val_num_match = re.search(r"[-+]?\d*\.?\d+", clean_val)
    if val_num_match:
        try:
            num = float(val_num_match.group(0))
            name_lower = clean_name.lower()
            if "temp" in name_lower or "fever" in name_lower:
                if 95.0 <= num <= 108.0:
                    score += 0.05
                    rationale_parts.append("Physiologically plausible body temperature (°F)")
                elif 35.0 <= num <= 42.0:
                    score += 0.05
                    rationale_parts.append("Physiologically plausible body temperature (°C)")
                else:
                    score -= 0.35
                    rationale_parts.append(f"Temperature value {num} is outside normal physiological range")
            elif "spo2" in name_lower or "oxygen" in name_lower:
                if 60.0 <= num <= 100.0:
                    score += 0.05
                    rationale_parts.append("Valid SpO2 percentage range")
                else:
                    score -= 0.40
                    rationale_parts.append(f"SpO2 value {num}% is non-physiological")
            elif "pulse" in name_lower or "heart rate" in name_lower:
                if 30.0 <= num <= 220.0:
                    score += 0.05
                    rationale_parts.append("Plausible pulse rate (bpm)")
                else:
                    score -= 0.35
                    rationale_parts.append(f"Pulse rate {num} out of physiological bounds")
        except ValueError:
            pass
    else:
        score -= 0.20
        rationale_parts.append("Non-numeric measurement value")

    score = max(0.10, min(0.98, score))

    if score >= 0.85:
        tier = ConfidenceTier.HIGH
    elif score >= 0.60:
        tier = ConfidenceTier.MEDIUM
    else:
        tier = ConfidenceTier.LOW

    rationale = "; ".join(rationale_parts) if rationale_parts else "Standard numeric vitals extraction"

    return ConfidenceItem(
        entity_type="measurement",
        name=clean_name,
        value=clean_val,
        unit=unit,
        confidence=score,
        tier=tier,
        is_calibrated=False,
        evidence_quote=evidence,
        rationale=rationale,
        provenance=provenance,
    )
