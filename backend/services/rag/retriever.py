"""Retrieval engine for evidence-grounded Clinical SOP matching.

Performs lexical and semantic keyword scoring across the approved
institutional SOP repository, ranking protocols relevant to a patient's case.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from services.rag.sop_repository import SOP_COLLECTION

# Phrases that indicate an attempt (in retrieved document text) to instruct the
# model to override safety rules or system behaviour. Retrieved content is
# advisory data, never instructions, so these are neutralized before display/use.
_OVERRIDE_PATTERNS = [
    r"ignore (?:all |the |any )?(?:previous|prior|above|safety)[^\n.]*",
    r"disregard (?:all |the |any )?(?:previous|prior|above|safety|rules)[^\n.]*",
    r"override (?:the |all |any )?(?:safety|rules|system|instructions)[^\n.]*",
    r"system\s*prompt",
    r"you are (?:now )?(?:an?|the)\b[^\n.]*",
    r"assistant\s*:",
    r"\bdo not (?:follow|obey) (?:the )?(?:safety|system)[^\n.]*",
]


def sanitize_retrieved_text(text: str | None) -> str | None:
    """Neutralize instruction-like content in retrieved documents.

    Retrieved SOP text is data, not a command. Any span that tries to instruct
    the model to ignore/override safety is replaced with a neutral marker.
    """
    if not text:
        return text
    cleaned = text
    for pattern in _OVERRIDE_PATTERNS:
        cleaned = re.sub(pattern, "[redacted: non-advisory content]", cleaned, flags=re.IGNORECASE)
    return cleaned



@dataclass
class RetrievedSOPResult:
    doc_id: str
    doc_title: str
    section_id: str
    section_title: str
    relevance_score: float
    matched_terms: list[str]
    triage_pathway: str
    red_flag_criteria: list[str]
    recommended_doctor_actions: list[str]
    source_attribution: str
    # Governance metadata
    issuing_authority: str | None = None
    source_url: str | None = None
    publication_date: str | None = None
    version: str = "0.0-draft"
    review_status: str = "UNVERIFIED"
    document_hash: str | None = None
    verified: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "doc_title": self.doc_title,
            "section_id": self.section_id,
            "section_title": self.section_title,
            "relevance_score": round(self.relevance_score, 3),
            "matched_terms": self.matched_terms,
            "triage_pathway": self.triage_pathway,
            "red_flag_criteria": self.red_flag_criteria,
            "recommended_doctor_actions": self.recommended_doctor_actions,
            "source_attribution": self.source_attribution,
            "issuing_authority": self.issuing_authority,
            "source_url": self.source_url,
            "publication_date": self.publication_date,
            "version": self.version,
            "review_status": self.review_status,
            "document_hash": self.document_hash,
            "is_verified": self.verified,
        }


def retrieve_relevant_sops(
    query_text: str,
    symptoms: list[str] | None = None,
    chief_concern: str | None = None,
    top_k: int = 3,
) -> list[RetrievedSOPResult]:
    """Retrieves top-k relevant institutional SOPs based on case narrative and symptoms."""
    symptoms = symptoms or []
    terms_to_match = set()

    # Collect tokens
    for text in [query_text, chief_concern or "", " ".join(symptoms)]:
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
        terms_to_match.update(words)

    results: list[RetrievedSOPResult] = []

    for sop in SOP_COLLECTION:
        matched: list[str] = []
        score = 0.0

        # Check syndrome matches (high weight: +3.0)
        for syn in sop.applicable_syndromes:
            if syn.lower() in terms_to_match or any(syn.lower() in s.lower() for s in symptoms):
                score += 3.0
                matched.append(f"Syndrome: {syn}")

        # Check keyword matches (+1.0)
        for kw in sop.keywords:
            if kw.lower() in terms_to_match:
                score += 1.0
                matched.append(kw)

        if score > 0.0:
            results.append(
                RetrievedSOPResult(
                    doc_id=sop.doc_id,
                    doc_title=sanitize_retrieved_text(sop.doc_title) or sop.doc_title,
                    section_id=sop.section_id,
                    section_title=sanitize_retrieved_text(sop.section_title) or sop.section_title,
                    relevance_score=score,
                    matched_terms=list(set(matched)),
                    triage_pathway=sanitize_retrieved_text(sop.triage_pathway) or sop.triage_pathway,
                    red_flag_criteria=[
                        sanitize_retrieved_text(c) or c for c in sop.red_flag_criteria
                    ],
                    recommended_doctor_actions=[
                        sanitize_retrieved_text(a) or a for a in sop.recommended_doctor_actions
                    ],
                    source_attribution=sop.source_attribution,
                    issuing_authority=sop.issuing_authority,
                    source_url=sop.source_url,
                    publication_date=sop.publication_date,
                    version=sop.version,
                    review_status=sop.review_status,
                    document_hash=sop.document_hash,
                    verified=sop.verified,
                )
            )

    results.sort(key=lambda r: r.relevance_score, reverse=True)
    return results[:top_k]
