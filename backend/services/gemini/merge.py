"""Merge normalized document extraction into the case record.

Facts are persisted with provenance AI_EXTRACTED and collected_via=DOCUMENT
so the review UI always shows where they came from. Duplicates are skipped;
nothing clinical is inferred — only the controlled fields are written.
"""

from __future__ import annotations

from models import Case, CaseMeasurement, CaseSymptom
from models.enums import Provenance
from services.gemini.extraction import DocumentExtractionSchema


def merge_extraction_into_case(case: Case, schema: DocumentExtractionSchema) -> bool:
    """Returns True if anything was written to the case."""
    changed = False

    existing_terms = {s.term.strip().lower() for s in case.symptoms}
    existing_terms |= {s.normalized_term.lower() for s in case.symptoms if s.normalized_term}
    for term in schema.symptoms:
        if term.lower() not in existing_terms:
            case.symptoms.append(
                CaseSymptom(
                    term=term,
                    normalized_term=term.lower()[:120],
                    source=Provenance.AI_EXTRACTED,
                    collected_via="DOCUMENT",
                    verified=False,
                )
            )
            existing_terms.add(term.lower())
            changed = True

    existing_meas = {(m.name.lower(), str(m.value).lower()) for m in case.measurements}
    for m in schema.measurements:
        key = (m.name.lower(), m.value.lower())
        if key not in existing_meas:
            case.measurements.append(
                CaseMeasurement(
                    name=m.name,
                    value=m.value,
                    unit=m.unit,
                    source=Provenance.AI_EXTRACTED,
                    collected_via="DOCUMENT",
                    verified=False,
                )
            )
            existing_meas.add(key)
            changed = True

    if schema.medications:
        ctx = case.patient_context if case.patient_context is not None else {}
        known = {str(x).strip().lower() for x in ctx.get("medications") or []}
        added = [m for m in schema.medications if m.lower() not in known]
        if added:
            merged = list(ctx.get("medications") or []) + added
            case.patient_context = {**ctx, "medications": merged}
            changed = True

    if schema.duration:
        current = case.timeline_text or ""
        if schema.duration.lower() not in current.lower():
            case.timeline_text = " ".join(filter(None, [current, schema.duration])).strip()
            changed = True

    return changed
