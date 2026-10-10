"""Unit tests for Confidence Estimation, Contradiction Detection, and Missing Info."""

from services.clinical_nlp.confidence import (
    ConfidenceTier,
    estimate_measurement_confidence,
    estimate_symptom_confidence,
)
from services.clinical_nlp.contradictions import detect_cross_modal_contradictions
from services.clinical_nlp.missing_info import detect_syndrome_missing_info


def test_confidence_symptom_lexical_grounding():
    context = "Patient presents with persistent high fever and severe dry cough since Tuesday."
    item = estimate_symptom_confidence("dry cough", context_text=context)
    assert item.tier == ConfidenceTier.HIGH
    assert item.confidence >= 0.85
    assert "dry cough" in (item.evidence_quote or "").lower()


def test_confidence_symptom_hedging_marker_drops_score():
    context = "Patient feels maybe mild dizziness or slight nausea, uncertain onset."
    item = estimate_symptom_confidence("dizziness", context_text=context)
    assert item.tier in (ConfidenceTier.MEDIUM, ConfidenceTier.LOW)
    assert item.confidence < 0.85
    assert "Hedging" in item.rationale


def test_confidence_measurement_physiological_bounds():
    # Plausible temp
    m_ok = estimate_measurement_confidence("Temperature", "101.4", "F", "Recorded temp 101.4 F")
    assert m_ok.tier == ConfidenceTier.HIGH
    assert m_ok.confidence >= 0.85

    # Out-of-bounds temp
    m_bad = estimate_measurement_confidence("Temperature", "150.0", "F", "Temp 150 F recorded")
    assert m_bad.tier == ConfidenceTier.LOW
    assert "outside normal physiological range" in m_bad.rationale


def test_contradiction_negated_diabetes_with_metformin():
    contradictions = detect_cross_modal_contradictions(
        patient_text="I do not have diabetes or high sugar, only joint pain.",
        extracted_symptoms=["Joint pain"],
        extracted_measurements=[],
        extracted_medications=["Tab Metformin 500mg BD", "Calcium"],
    )
    assert len(contradictions) >= 1
    c = contradictions[0]
    assert c.contradiction_type == "NEGATION_CONFLICT"
    assert "diabetes" in c.statement_a.lower()
    assert "metformin" in c.statement_b.lower()


def test_contradiction_fever_denial_with_high_temperature():
    contradictions = detect_cross_modal_contradictions(
        patient_text="No fever at all, just felt a bit weak today.",
        extracted_symptoms=["Weakness"],
        extracted_measurements=[{"name": "Temperature", "value": "103.2 F"}],
        extracted_medications=[],
    )
    assert len(contradictions) >= 1
    c = contradictions[0]
    assert c.contradiction_type == "VITAL_DISCORDANCE"
    assert c.severity == "CRITICAL"


def test_missing_info_chest_pain_syndrome():
    missing = detect_syndrome_missing_info(
        chief_concern="Sudden acute chest pain",
        symptoms=["Chest pain"],
        patient_text="I had chest pain in the center of my chest after climbing stairs.",
    )
    aspects = [m.missing_aspect for m in missing]
    assert any("Radiation" in a for a in aspects)
    assert any("Diaphoresis" in a for a in aspects)
    assert any("breathlessness" in a.lower() for a in aspects)
