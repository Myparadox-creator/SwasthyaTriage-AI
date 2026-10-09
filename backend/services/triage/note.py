"""Triage note builder — deterministic, template-driven (§26).

Every note is AI-status labeled and always carries the review disclaimer.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Case, Document, SafetySignal

DISCLAIMER = "AI-generated summary. Requires qualified healthcare review."
AI_STATUS = "AI-generated"
REVIEW_STATUS_PENDING = "Pending professional review"
REVIEW_STATUS_REVIEWED = "Reviewed by healthcare professional"


def build_triage_note(db: Session, case: Case) -> dict:
    symptoms = sorted({s.term for s in case.symptoms})
    measurements = [
        {
            "name": m.name,
            "value": m.value,
            "unit": m.unit,
            "source": m.source.value,
            "verified": m.verified,
        }
        for m in case.measurements
    ]
    documents = db.scalars(
        select(Document).where(Document.case_id == case.id, Document.deleted_at.is_(None))
    ).all()
    signals = db.scalars(select(SafetySignal).where(SafetySignal.case_id == case.id)).all()

    missing = case.missing_information or []
    reviewed = case.reviewed_at is not None

    sources: list[str] = []
    if case.source.value in ("VOICE", "MIXED"):
        sources.append("Patient voice assessment")
    if case.source.value in ("CHAT", "MIXED"):
        sources.append("Patient chat assessment")
    if documents:
        sources.append("Uploaded report")

    return {
        "case_number": case.case_number,
        "generated_at": datetime.now(UTC).isoformat(),
        "chief_concern": case.chief_concern or "Not yet recorded",
        "timeline": case.timeline_text or "Not yet recorded",
        "patient_reported_symptoms": symptoms,
        "patient_reported_measurements": measurements,
        "relevant_uploaded_information": [
            {"filename": d.filename, "status": d.status.value} for d in documents
        ],
        "information_not_yet_collected": missing,
        "configured_safety_signals": [
            {
                "label": s.label,
                "message": s.message,
                "priority": s.priority.value,
                "source": s.source.value,
            }
            for s in signals
        ]
        or ["No configured signal reported during intake."],
        "source": " + ".join(sources) if sources else "Patient-provided information",
        "language": case.language.value,
        "ai_summary": case.ai_summary,
        "ai_status": AI_STATUS,
        "reviewer_status": REVIEW_STATUS_REVIEWED if reviewed else REVIEW_STATUS_PENDING,
        "priority": case.priority.value,
        "status": case.status.value,
        "disclaimer": DISCLAIMER,
    }
