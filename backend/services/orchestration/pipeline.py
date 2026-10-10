"""Constrained Multi-Step AI Orchestration Pipeline with Deterministic Safety Gates.

Orchestrates multi-modal triage processing through safe, strictly bounded stages:
Stage 1: Multi-Modal Ingestion & Normalization
Stage 2: Confidence-Aware Entity Extraction with Evidence Quotes
Stage 3: Cross-Modal Contradiction & Missing-Info Gates
Stage 4: Deterministic Safety Rule Engine Gate (AI CANNOT OVERRIDE)
Stage 5: Evidence-Grounded Institutional SOP Retrieval (RAG)
Stage 6: Human Clinician Review Gate (Preserves qualified doctor authority)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from models import Case
from models.enums import CaseStatus, Priority
from services.clinical_nlp.confidence import (
    estimate_measurement_confidence,
    estimate_symptom_confidence,
)
from services.clinical_nlp.contradictions import detect_cross_modal_contradictions
from services.clinical_nlp.missing_info import detect_syndrome_missing_info
from services.evidence import sync_case_evidence
from services.rag.guidelines import generate_sop_triage_guidance
from services.safety.service import reevaluate_case


@dataclass
class OrchestrationResult:
    case_number: str
    status: CaseStatus
    priority: Priority
    confidence_items: list[dict[str, Any]]
    contradictions: list[dict[str, Any]]
    missing_critical_info: list[dict[str, Any]]
    sop_guidelines: dict[str, Any]
    safety_signals_fired: list[str]
    human_approval_required: bool
    pipeline_stages_completed: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_number": self.case_number,
            "status": self.status.value if self.status else "SUBMITTED",
            "priority": self.priority.value if self.priority else "ROUTINE",
            "confidence_items": self.confidence_items,
            "contradictions": self.contradictions,
            "missing_critical_info": self.missing_critical_info,
            "sop_guidelines": self.sop_guidelines,
            "safety_signals_fired": self.safety_signals_fired,
            "human_approval_required": self.human_approval_required,
            "pipeline_stages_completed": self.pipeline_stages_completed,
        }


def run_constrained_clinical_pipeline(db: Session, case: Case) -> OrchestrationResult:
    """Executes the complete constrained clinical AI pipeline for a given case."""
    stages_done = []

    # Stage 1: Ingestion & Normalization
    stages_done.append("1. MULTI_MODAL_INGESTION")
    patient_text = " ".join(filter(None, [case.chief_concern, case.timeline_text]))
    symptom_terms = [s.term for s in case.symptoms]
    measurements_data = [{"name": m.name, "value": m.value, "unit": m.unit} for m in case.measurements]

    # Collect medications from context or documents
    medications: list[str] = []
    ctx = case.patient_context or {}
    if "medications" in ctx and isinstance(ctx["medications"], list):
        medications.extend([str(m) for m in ctx["medications"]])

    # Stage 2: Confidence-Aware Entity Extraction
    stages_done.append("2. CONFIDENCE_ESTIMATION")
    confidence_items = []
    for s in case.symptoms:
        ci = estimate_symptom_confidence(s.term, context_text=patient_text, provenance=s.source)
        confidence_items.append(ci.to_dict())

    for m in case.measurements:
        mi = estimate_measurement_confidence(
            name=m.name,
            value=m.value,
            unit=m.unit,
            context_text=patient_text,
            provenance=m.source,
        )
        confidence_items.append(mi.to_dict())

    # Stage 2b: Persist traceable evidence ledger (source grounding per fact)
    try:
        with db.begin_nested():
            sync_case_evidence(db, case, commit=False)
    except Exception:  # noqa: BLE001
        # Evidence persistence must never block triage; it is informational.
        pass

    # Stage 3: Contradiction & Missing-Info Detection
    stages_done.append("3. CONTRADICTION_AND_MISSING_INFO_GATE")
    contradictions = detect_cross_modal_contradictions(
        patient_text=patient_text,
        extracted_symptoms=symptom_terms,
        extracted_measurements=measurements_data,
        extracted_medications=medications,
    )
    contradiction_dicts = [c.to_dict() for c in contradictions]

    missing_info = detect_syndrome_missing_info(
        chief_concern=case.chief_concern,
        symptoms=symptom_terms,
        patient_text=patient_text,
    )
    missing_info_dicts = [m.to_dict() for m in missing_info]

    # Update case.missing_information with suggestions if empty
    if missing_info_dicts and not case.missing_information:
        case.missing_information = [m["suggested_clinician_question"] for m in missing_info_dicts]

    # Stage 4: Deterministic Safety Rule Engine Gate (Authoritative)
    stages_done.append("4. DETERMINISTIC_SAFETY_ENGINE_GATE")
    reevaluate_case(db, case, trigger="ai_orchestration")
    db.commit()
    db.refresh(case)

    safety_signals = [sig.label or sig.message for sig in case.safety_signals]

    # Stage 5: Evidence-Grounded SOP Retrieval (RAG)
    stages_done.append("5. EVIDENCE_GROUNDED_SOP_RAG")
    sop_guidance = generate_sop_triage_guidance(
        case_number=case.case_number,
        chief_concern=case.chief_concern,
        symptoms=symptom_terms,
        patient_text=patient_text,
        vitals_summary=measurements_data,
    )

    # Stage 6: Human Clinician Review Gate
    stages_done.append("6. HUMAN_CLINICIAN_REVIEW_GATE")
    # AI never approves or resolves cases autonomously
    human_approval_required = True

    return OrchestrationResult(
        case_number=case.case_number,
        status=case.status,
        priority=case.priority,
        confidence_items=confidence_items,
        contradictions=contradiction_dicts,
        missing_critical_info=missing_info_dicts,
        sop_guidelines=sop_guidance,
        safety_signals_fired=safety_signals,
        human_approval_required=human_approval_required,
        pipeline_stages_completed=stages_done,
    )
