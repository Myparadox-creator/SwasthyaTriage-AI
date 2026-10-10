"""AI Clinical Decision Support and Evaluation API endpoints.

Surfaces confidence-aware extractions, cross-modal contradictions,
evidence-grounded institutional SOP guidelines, and longitudinal summaries.
Positioning: AI assists. Qualified Healthcare Professionals decide.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.session import get_db
from models import User
from models.enums import Role
from repositories.cases import get_case_or_403
from services.clinical_nlp.confidence import estimate_measurement_confidence, estimate_symptom_confidence
from services.clinical_nlp.contradictions import detect_cross_modal_contradictions
from services.clinical_nlp.missing_info import detect_syndrome_missing_info
from services.longitudinal.summarizer import build_longitudinal_trajectory
from services.orchestration.pipeline import run_constrained_clinical_pipeline
from services.rag.guidelines import generate_sop_triage_guidance

router = APIRouter(prefix="/api/cases", tags=["ai-clinical"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


@router.get("/{case_id}/clinical-analysis")
def get_clinical_analysis(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Returns confidence-aware extraction tiers, contradictions, and missing clinical info.

    Role: HEALTHCARE_WORKER (Medical Officer Cockpit) & Facility Admin.
    """
    case = get_case_or_403(db, current_user, case_id)
    patient_text = " ".join(filter(None, [case.chief_concern, case.timeline_text]))

    # Confidence estimation
    symptom_confidences = [
        estimate_symptom_confidence(s.term, context_text=patient_text, provenance=s.source).to_dict()
        for s in case.symptoms
    ]
    measurement_confidences = [
        estimate_measurement_confidence(
            name=m.name,
            value=m.value,
            unit=m.unit,
            context_text=patient_text,
            provenance=m.source,
        ).to_dict()
        for m in case.measurements
    ]

    # Contradictions
    medications: list[str] = []
    ctx = case.patient_context or {}
    if "medications" in ctx and isinstance(ctx["medications"], list):
        medications.extend([str(m) for m in ctx["medications"]])

    contradictions = [
        c.to_dict()
        for c in detect_cross_modal_contradictions(
            patient_text=patient_text,
            extracted_symptoms=[s.term for s in case.symptoms],
            extracted_measurements=[{"name": m.name, "value": m.value, "unit": m.unit} for m in case.measurements],
            extracted_medications=medications,
        )
    ]

    # Missing clinical questions
    missing = [
        m.to_dict()
        for m in detect_syndrome_missing_info(
            chief_concern=case.chief_concern,
            symptoms=[s.term for s in case.symptoms],
            patient_text=patient_text,
        )
    ]

    return {
        "case_id": case.id,
        "case_number": case.case_number,
        "symptom_confidences": symptom_confidences,
        "measurement_confidences": measurement_confidences,
        "contradictions": contradictions,
        "missing_critical_info": missing,
        "disclaimer": "AI provides decision support only. Qualified healthcare professionals decide.",
    }


@router.get("/{case_id}/sop-guidelines")
def get_sop_guidelines(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieves evidence-grounded institutional SOP recommendations with exact citations."""
    case = get_case_or_403(db, current_user, case_id)
    patient_text = " ".join(filter(None, [case.chief_concern, case.timeline_text]))

    return generate_sop_triage_guidance(
        case_number=case.case_number,
        chief_concern=case.chief_concern,
        symptoms=[s.term for s in case.symptoms],
        patient_text=patient_text,
        vitals_summary=[{"name": m.name, "value": m.value, "unit": m.unit} for m in case.measurements],
    )


@router.get("/{case_id}/longitudinal-history")
def get_case_longitudinal_history(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Returns multi-encounter trajectory and vital progression for this case's patient."""
    case = get_case_or_403(db, current_user, case_id)
    return build_longitudinal_trajectory(db, case.patient_id)


@router.post("/{case_id}/orchestrate")
def orchestrate_case_pipeline(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Runs the constrained multi-step AI orchestration pipeline with safety gates."""
    case = get_case_or_403(db, current_user, case_id)
    res = run_constrained_clinical_pipeline(db, case)
    return res.to_dict()
