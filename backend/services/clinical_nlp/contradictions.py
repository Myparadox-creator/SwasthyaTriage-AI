"""Cross-modal clinical contradiction detector for SwasthyaFlow AI.

Detects discrepancies across patient self-reporting (voice/chat),
clinical document OCR (prescriptions/lab investigations), and vital measurements.
All contradictions are surfaced as decision-support alerts for the medical officer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ContradictionItem:
    """A detected clinical discrepancy between two sources."""

    contradiction_type: str  # NEGATION_CONFLICT | VITAL_DISCORDANCE | TEMPORAL_MISMATCH | MEDICATION_DISCREPANCY
    severity: str            # CRITICAL | WARNING | INFORMATIONAL
    statement_a: str
    source_a: str
    statement_b: str
    source_b: str
    clinical_implication: str
    recommended_doctor_action: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "contradiction_type": self.contradiction_type,
            "severity": self.severity,
            "statement_a": self.statement_a,
            "source_a": self.source_a,
            "statement_b": self.statement_b,
            "source_b": self.source_b,
            "clinical_implication": self.clinical_implication,
            "recommended_doctor_action": self.recommended_doctor_action,
        }


# Known chronic medications mapped to conditions
MEDICATION_CONDITION_MAP = {
    "metformin": ("diabetes", "Type 2 Diabetes Mellitus"),
    "glimepiride": ("diabetes", "Type 2 Diabetes Mellitus"),
    "insulin": ("diabetes", "Diabetes Mellitus"),
    "amlodipine": ("hypertension", "High Blood Pressure / Hypertension"),
    "telmisartan": ("hypertension", "High Blood Pressure / Hypertension"),
    "losartan": ("hypertension", "High Blood Pressure / Hypertension"),
    "atenolol": ("hypertension", "Hypertension / Cardiac condition"),
    "atorvastatin": ("cholesterol", "Dyslipidemia / Hypercholesterolemia"),
    "salbutamol": ("asthma", "Bronchial Asthma / COPD"),
    "levothyroxine": ("thyroid", "Hypothyroidism"),
}


def detect_cross_modal_contradictions(
    *,
    patient_text: str | None,
    extracted_symptoms: list[str],
    extracted_measurements: list[dict[str, Any]],
    extracted_medications: list[str],
    document_raw_text: str | None = None,
) -> list[ContradictionItem]:
    """Scans for contradictions between patient narratives and objective extractions."""
    contradictions: list[ContradictionItem] = []
    text_lower = (patient_text or "").lower()

    # 1. Chronic condition negation vs Document Medication
    negation_patterns = [
        (r"\b(no|not|don't have|never had|koi nahi|nahin)\b.*?\b(diabetes|sugar|madhumeha)\b", "diabetes"),
        (r"\b(no|not|don't have|never had|koi nahi|nahin)\b.*?\b(bp|blood pressure|hypertension|uchha rakta chapa)\b", "hypertension"),
        (r"\b(no|not|don't have|never had|koi nahi|nahin)\b.*?\b(asthma|breathing problem|dama)\b", "asthma"),
        (r"\b(no|not|don't have|never had|koi nahi|nahin)\b.*?\b(thyroid)\b", "thyroid"),
    ]

    for pattern, cond_key in negation_patterns:
        if re.search(pattern, text_lower):
            # Check if any extracted medication contradicts this negation
            for med in extracted_medications:
                med_lower = med.lower()
                for key_med, (cond, display_name) in MEDICATION_CONDITION_MAP.items():
                    if key_med in med_lower and cond == cond_key:
                        contradictions.append(
                            ContradictionItem(
                                contradiction_type="NEGATION_CONFLICT",
                                severity="WARNING",
                                statement_a=f"Patient stated no history of {cond_key}",
                                source_a="PATIENT_VOICE_OR_CHAT",
                                statement_b=f"Prescription contains {med} (indicated for {display_name})",
                                source_b="DOCUMENT_OCR",
                                clinical_implication=(
                                    f"Patient may be unaware of diagnosis or non-compliant with {display_name} treatment."
                                ),
                                recommended_doctor_action=(
                                    f"Verify {display_name} history and current medication regimen directly with patient."
                                ),
                            )
                        )

    # 2. Fever Negation vs Objective Pyrexia
    fever_negation = bool(re.search(r"\b(no fever|not hot|bukhar nahi|jaro nahi)\b", text_lower))
    for m in extracted_measurements:
        name = str(m.get("name", "")).lower()
        val_str = str(m.get("value", ""))
        if "temp" in name or "fever" in name:
            match = re.search(r"[-+]?\d*\.?\d+", val_str)
            if match:
                try:
                    t_val = float(match.group(0))
                    # Normalization to Fahrenheit
                    if t_val < 45.0:  # Celsius
                        t_val = (t_val * 9 / 5) + 32
                    if fever_negation and t_val >= 100.4:
                        contradictions.append(
                            ContradictionItem(
                                contradiction_type="VITAL_DISCORDANCE",
                                severity="CRITICAL",
                                statement_a="Patient denied having a fever in oral intake",
                                source_a="PATIENT_VOICE_OR_CHAT",
                                statement_b=f"Clinical measurement documents elevated temperature: {val_str}",
                                source_b="CASE_MEASUREMENT",
                                clinical_implication="Unrecognized acute pyrexia; patient may have blunted subjective perception.",
                                recommended_doctor_action="Re-check temperature with calibrated thermometer; examine for acute infective focus.",
                            )
                        )
                except ValueError:
                    pass

    # 3. Normal respiration claim vs Critical SpO2
    breathing_ok = bool(re.search(r"\b(breathing fine|no breathlessness|sans theek hai|sasare asubidha nahi)\b", text_lower))
    for m in extracted_measurements:
        name = str(m.get("name", "")).lower()
        val_str = str(m.get("value", ""))
        if "spo2" in name or "oxygen" in name:
            match = re.search(r"[-+]?\d*\.?\d+", val_str)
            if match:
                try:
                    spo2_val = float(match.group(0))
                    if breathing_ok and spo2_val < 92.0:
                        contradictions.append(
                            ContradictionItem(
                                contradiction_type="VITAL_DISCORDANCE",
                                severity="CRITICAL",
                                statement_a="Patient reported no subjective shortness of breath",
                                source_a="PATIENT_VOICE_OR_CHAT",
                                statement_b=f"Documented pulse oximetry SpO2 is critically low: {spo2_val}%",
                                source_b="CASE_MEASUREMENT",
                                clinical_implication="Silent hypoxia (frequently observed in severe pneumonia, COVID-19, or acute lung injury).",
                                recommended_doctor_action="Immediate supplemental oxygen evaluation and urgent medical officer review.",
                            )
                        )
                except ValueError:
                    pass

    return contradictions
