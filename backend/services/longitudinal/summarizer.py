"""Longitudinal Multi-Encounter Summarization Service.

Synthesizes historical patient encounters across time, tracking symptom trajectory,
vital sign trends, and medication changes with strict source attribution.
Role: HEALTHCARE_WORKER (Medical Officer) & PATIENT.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Case, Patient


@dataclass
class EncounterEvent:
    case_number: str
    date_str: str
    facility_name: str | None
    chief_concern: str | None
    priority: str
    status: str
    symptoms: list[str]
    vitals: list[str]
    medications: list[str]
    source_attribution: str


def build_longitudinal_trajectory(db: Session, patient_id: int) -> dict[str, Any]:
    """Compiles multi-encounter timeline and longitudinal trajectory for a patient."""
    patient = db.get(Patient, patient_id)
    if not patient:
        return {"error": "patient_not_found", "encounters": []}

    # Fetch all cases for patient ordered chronologically
    stmt = (
        select(Case)
        .where(Case.patient_id == patient_id, Case.deleted_at.is_(None))
        .order_by(Case.created_at.asc())
    )
    cases = list(db.scalars(stmt).all())

    if not cases:
        return {
            "patient_id": patient_id,
            "patient_name": patient.full_name,
            "total_encounters": 0,
            "summary": "No historical encounters found for patient.",
            "encounters": [],
            "vital_trends": {},
        }

    encounters: list[EncounterEvent] = []
    vital_history: dict[str, list[dict[str, Any]]] = {}
    all_symptoms_chronological: list[dict[str, str]] = []

    for c in cases:
        date_str = c.created_at.strftime("%Y-%m-%d")
        fac_name = c.facility.name if c.facility else "General Facility"
        attr = f"[{c.case_number}, {date_str}, {fac_name}]"

        symptom_list = [s.term for s in c.symptoms]
        for s in c.symptoms:
            all_symptoms_chronological.append({"term": s.term, "case_number": c.case_number, "date": date_str})

        vital_list = []
        for m in c.measurements:
            v_str = f"{m.name}: {m.value}{(' ' + m.unit) if m.unit else ''}"
            vital_list.append(v_str)

            # Accumulate trend
            norm_name = m.name.lower().strip()
            if norm_name not in vital_history:
                vital_history[norm_name] = []
            vital_history[norm_name].append({
                "date": date_str,
                "case_number": c.case_number,
                "value": m.value,
                "unit": m.unit,
                "attribution": attr,
            })

        # Extract medications from documents or patient context
        medications: list[str] = []
        ctx = c.patient_context or {}
        if "medications" in ctx and isinstance(ctx["medications"], list):
            medications.extend([str(med) for med in ctx["medications"]])

        encounters.append(
            EncounterEvent(
                case_number=c.case_number,
                date_str=date_str,
                facility_name=fac_name,
                chief_concern=c.chief_concern,
                priority=c.priority.value if c.priority else "ROUTINE",
                status=c.status.value if c.status else "DRAFT",
                symptoms=symptom_list,
                vitals=vital_list,
                medications=medications,
                source_attribution=attr,
            )
        )

    # Generate longitudinal trajectory summary narrative
    if len(encounters) == 1:
        narrative = (
            f"Initial baseline encounter {encounters[0].source_attribution}: "
            f"Patient presented with {encounters[0].chief_concern or 'unspecified symptoms'}. "
            f"Vitals documented: {', '.join(encounters[0].vitals) if encounters[0].vitals else 'None'}. "
            f"Longitudinal multi-visit trajectory tracking established."
        )
    else:
        narrative_parts = [
            f"Longitudinal care summary across {len(encounters)} clinical encounters for {patient.full_name}:"
        ]
        for i, enc in enumerate(encounters, start=1):
            s_text = ", ".join(enc.symptoms[:4]) if enc.symptoms else "routine evaluation"
            narrative_parts.append(
                f"- Visit {i} {enc.source_attribution}: Chief concern '{enc.chief_concern or 'General'}' "
                f"with symptoms: {s_text} (Priority: {enc.priority})."
            )

        # Highlight vital trends if available
        if "temperature" in vital_history and len(vital_history["temperature"]) >= 2:
            t_first = vital_history["temperature"][0]["value"]
            t_last = vital_history["temperature"][-1]["value"]
            narrative_parts.append(f"Temperature trajectory: {t_first} -> {t_last}.")

        if "spo2" in vital_history and len(vital_history["spo2"]) >= 2:
            spo2_first = vital_history["spo2"][0]["value"]
            spo2_last = vital_history["spo2"][-1]["value"]
            narrative_parts.append(f"SpO2 trajectory: {spo2_first}% -> {spo2_last}%.")

        narrative = "\n".join(narrative_parts)

    return {
        "patient_id": patient_id,
        "patient_name": patient.full_name,
        "total_encounters": len(encounters),
        "longitudinal_narrative": narrative,
        "encounters": [
            {
                "case_number": e.case_number,
                "date": e.date_str,
                "facility": e.facility_name,
                "chief_concern": e.chief_concern,
                "priority": e.priority,
                "status": e.status,
                "symptoms": e.symptoms,
                "vitals": e.vitals,
                "medications": e.medications,
                "source_attribution": e.source_attribution,
            }
            for e in encounters
        ],
        "vital_trends": vital_history,
    }
