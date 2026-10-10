"""Evidence traceability API.

Exposes the per-fact provenance ledger for a case and the reviewer decision
endpoint. Any case-accessing role may read; only clinical staff may review.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.session import get_db
from models import User
from models.evidence import EvidenceReviewStatus
from repositories.cases import get_case_or_403
from schemas.evidence import EvidenceListOut, EvidenceOut, EvidenceReviewRequest
from services.evidence import (
    evidence_to_dict,
    get_evidence_or_404,
    review_evidence,
    sync_case_evidence,
)

router = APIRouter(prefix="/api/cases", tags=["evidence"])


def _build_list(case, evidence_rows) -> EvidenceListOut:
    pending = sum(
        1 for e in evidence_rows if e.reviewer_status == EvidenceReviewStatus.PENDING
    )
    return EvidenceListOut(
        case_id=case.id,
        case_number=case.case_number,
        total=len(evidence_rows),
        pending_review=pending,
        evidence=[EvidenceOut(**evidence_to_dict(e)) for e in evidence_rows],
    )


@router.get("/{case_id}/evidence")
def get_case_evidence(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceListOut:
    """Return the traceable evidence ledger for a case.

    Evidence is generated lazily and refreshed on read (idempotent), so the
    panel always reflects the latest extracted facts without a separate job.
    """
    case = get_case_or_403(db, current_user, case_id)
    rows = sync_case_evidence(db, case, commit=True)
    return _build_list(case, rows)


@router.post("/{case_id}/evidence/refresh")
def refresh_case_evidence(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceListOut:
    """Explicitly regenerate the evidence ledger for a case."""
    case = get_case_or_403(db, current_user, case_id)
    rows = sync_case_evidence(db, case, actor=current_user, commit=True)
    return _build_list(case, rows)


@router.patch("/{case_id}/evidence/{evidence_id}")
def review_case_evidence(
    case_id: int,
    evidence_id: int,
    payload: EvidenceReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Confirm, edit, or reject a single extracted fact.

    Editing preserves the original extracted value. All decisions are audited.
    """
    case = get_case_or_403(db, current_user, case_id)
    evidence = get_evidence_or_404(db, case, evidence_id)
    updated = review_evidence(
        db,
        case,
        evidence,
        actor=current_user,
        status=payload.status,
        new_value=payload.new_value,
        reason=payload.reason,
        commit=True,
    )
    return evidence_to_dict(updated)
