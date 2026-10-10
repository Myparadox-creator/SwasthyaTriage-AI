"""Evidence-grounded guideline synthesis for clinician review.

Synthesizes case facts with retrieved institutional SOPs, generating
grounded clinical triage recommendations with verifiable source attributions.
"""

from __future__ import annotations

from typing import Any

from services.rag.retriever import retrieve_relevant_sops
from services.rag.sop_repository import SOP_GOVERNANCE_NOTE, governance_summary


def generate_sop_triage_guidance(
    *,
    case_number: str,
    chief_concern: str | None,
    symptoms: list[str],
    patient_text: str | None = None,
    vitals_summary: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Generates source-attributed clinical triage guidance based on approved SOPs."""
    retrieved = retrieve_relevant_sops(
        query_text=patient_text or chief_concern or "",
        symptoms=symptoms,
        chief_concern=chief_concern,
        top_k=2,
    )

    gov = governance_summary()

    if not retrieved:
        return {
            "case_number": case_number,
            "has_guidance": False,
            "message": "No specific institutional SOP triggered for current reported symptoms.",
            "protocols": [],
            "governance": gov,
            "has_unverified_sources": not gov["all_verified"],
            "clinical_disclaimer": "AI provides decision support only. Qualified medical officers retain final clinical authority.",
        }

    protocols_out = []
    for sop in retrieved:
        unverified = not sop.verified
        protocols_out.append(
            {
                "doc_id": sop.doc_id,
                "doc_title": sop.doc_title,
                "section": f"{sop.section_id}: {sop.section_title}",
                "source_citation": f"[{sop.doc_id}, {sop.section_id}]",
                "relevance_score": sop.relevance_score,
                "triage_pathway": sop.triage_pathway,
                "red_flag_criteria": sop.red_flag_criteria,
                "recommended_actions": sop.recommended_doctor_actions,
                "issuing_authority": sop.issuing_authority,
                "source_url": sop.source_url,
                "publication_date": sop.publication_date,
                "version": sop.version,
                "document_hash": sop.document_hash,
                "review_status": sop.review_status,
                "is_verified": sop.verified,
                "governance_warning": SOP_GOVERNANCE_NOTE if unverified else None,
            }
        )

    return {
        "case_number": case_number,
        "has_guidance": True,
        "protocols": protocols_out,
        "governance": gov,
        "has_unverified_sources": not gov["all_verified"],
        "clinical_disclaimer": (
            "Decision support based on *unverified internal draft protocols*. "
            "This is not official policy. Qualified medical professionals lead, evaluate, "
            "and hold final decision authority."
            if not gov["all_verified"]
            else (
                "Evidence-grounded decision support based on approved institutional clinical protocols. "
                "Qualified medical professionals lead, evaluate, and hold final decision authority."
            )
        ),
    }
