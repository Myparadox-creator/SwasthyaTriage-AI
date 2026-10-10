"""Syndrome-specific clinical missing information detector.

Analyzes reported concerns and identifies critical red-flag exclusion questions
that have not yet been documented, guiding the healthcare worker on what to ask.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class MissingInfoItem:
    syndrome: str
    missing_aspect: str
    urgency: str  # HIGH | MEDIUM | LOW
    suggested_clinician_question: str
    rationale: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "syndrome": self.syndrome,
            "missing_aspect": self.missing_aspect,
            "urgency": self.urgency,
            "suggested_clinician_question": self.suggested_clinician_question,
            "rationale": self.rationale,
        }


SYNDROME_RULES = [
    {
        "syndrome": "Chest Pain / Acute Coronary Syndrome",
        "trigger_keywords": ["chest pain", "chest tightness", "chest heaviness", "chhati betha", "seene mein dard"],
        "checks": [
            {
                "aspect": "Radiation to arm, neck, or jaw",
                "keywords": ["radiation", "left arm", "jaw", "neck", "shoulder"],
                "urgency": "HIGH",
                "question": "Does the pain radiate to your left arm, neck, shoulder, or jaw?",
                "rationale": "Radiation significantly elevates probability of acute myocardial infarction.",
            },
            {
                "aspect": "Diaphoresis / Cold sweats",
                "keywords": ["sweat", "sweating", "diaphoresis", "pasina"],
                "urgency": "HIGH",
                "question": "Are you experiencing profuse cold sweating or clamminess?",
                "rationale": "Diaphoresis combined with chest discomfort indicates autonomic activation during acute ischemia.",
            },
            {
                "aspect": "Associated breathlessness",
                "keywords": ["breathless", "short of breath", "dyspnea", "sans"],
                "urgency": "HIGH",
                "question": "Is the chest pain accompanied by difficulty in breathing?",
                "rationale": "Dyspnea with chest pain can indicate heart failure or pulmonary embolism.",
            },
        ],
    },
    {
        "syndrome": "Acute Febrile Illness",
        "trigger_keywords": ["fever", "pyrexia", "bukhar", "jaro", "chills"],
        "checks": [
            {
                "aspect": "Duration & Pattern (Intermittent / Continuous)",
                "keywords": ["days", "duration", "hours", "pattern", "continuous"],
                "urgency": "MEDIUM",
                "question": "How many days has the fever persisted, and does it spike at a specific time of day?",
                "rationale": "Critical for differentiating viral fever, malaria (quotidian/tertian), and typhoid.",
            },
            {
                "aspect": "Hemorrhagic / Bleeding signs (Petechiae, Gum bleed, Melena)",
                "keywords": ["bleeding", "petechiae", "rash", "gum", "black stool", "raktasrava"],
                "urgency": "HIGH",
                "question": "Have you noticed any reddish pin-prick spots on skin, gum bleeding, or black stools?",
                "rationale": "Essential red flag for Dengue Hemorrhagic Fever and severe coagulopathy.",
            },
            {
                "aspect": "Sensorium / Altered mental state",
                "keywords": ["confusion", "drowsy", "sensorium", "delirium", "unconscious"],
                "urgency": "HIGH",
                "question": "Has the patient exhibited drowsiness, excessive confusion, or irrational talk?",
                "rationale": "Warning sign for cerebral malaria, encephalitis, or sepsis.",
            },
        ],
    },
    {
        "syndrome": "Acute Dyspnea / Breathlessness",
        "trigger_keywords": ["breathless", "short of breath", "difficulty breathing", "sans fula", "swasa kasta"],
        "checks": [
            {
                "aspect": "Orthopnea / Inability to lie flat",
                "keywords": ["orthopnea", "lying flat", "pillows", "soi paruni"],
                "urgency": "HIGH",
                "question": "Can you sleep flat on the bed, or do you require multiple pillows to breathe?",
                "rationale": "Orthopnea differentiates left ventricular failure from primary airway spasm.",
            },
            {
                "aspect": "Stridor / Audible wheeze",
                "keywords": ["wheeze", "stridor", "whistling", "shiti"],
                "urgency": "MEDIUM",
                "question": "Is there a whistling sound or wheezing when breathing out?",
                "rationale": "Aids in assessing reversible bronchospasm vs upper airway obstruction.",
            },
        ],
    },
]


def detect_syndrome_missing_info(
    *,
    chief_concern: str | None,
    symptoms: list[str],
    patient_text: str | None,
) -> list[MissingInfoItem]:
    """Evaluates case content against syndrome triage protocols and returns missing critical items."""
    missing: list[MissingInfoItem] = []
    combined_text = " ".join([chief_concern or "", " ".join(symptoms), patient_text or ""]).lower()

    for syndrome in SYNDROME_RULES:
        # Check if this syndrome applies
        if any(kw in combined_text for kw in syndrome["trigger_keywords"]):
            for check in syndrome["checks"]:
                # Check if keywords are addressed in text
                addressed = any(kw in combined_text for kw in check["keywords"])
                if not addressed:
                    missing.append(
                        MissingInfoItem(
                            syndrome=syndrome["syndrome"],
                            missing_aspect=check["aspect"],
                            urgency=check["urgency"],
                            suggested_clinician_question=check["question"],
                            rationale=check["rationale"],
                        )
                    )

    return missing
