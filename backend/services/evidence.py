"""Build, persist, and review traceable clinical evidence.

Design rules:
  * A fact only exists as *evidence* once its source is recorded.
  * Machine-extracted facts are labelled AI_EXTRACTED and start PENDING.
  * A reviewer may CONFIRM, EDIT, or REJECT a fact.
  * Editing preserves the original extracted value (never destroyed).
  * RAW document text never enters the evidence row — only a safe location.
  * The safety engine does not read this table; evidence is informational and
    reviewable, it cannot silently change triage.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from middleware.errors import AppError, ForbiddenError, NotFoundError
from models import Case, Document, FactEvidence, User
from models.enums import Provenance, Role
from models.evidence import (
    REVIEWABLE_STATUSES,
    EvidenceFactType,
    EvidenceReviewStatus,
    EvidenceSourceKind,
)
from services.audit import AuditAction, record_audit
from services.clinical_nlp.confidence import (
    estimate_measurement_confidence,
    estimate_symptom_confidence,
)

_STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)

# Mapping from the intake channel stored on symptoms/measurements.
_CHANNEL_TO_SOURCE_KIND = {
    "VOICE": EvidenceSourceKind.VOICE_TRANSCRIPT,
    "CHAT": EvidenceSourceKind.PATIENT_TEXT,
    "DOCUMENT": EvidenceSourceKind.UPLOADED_REPORT,
    "TELECALL": EvidenceSourceKind.VOICE_TRANSCRIPT,
    "FOLLOW_UP": EvidenceSourceKind.MANUAL_ENTRY,
}


def _source_kind(collected_via: str | None, provenance: Provenance) -> str:
    if collected_via:
        mapped = _CHANNEL_TO_SOURCE_KIND.get(collected_via.upper())
        if mapped:
            return mapped
    if provenance == Provenance.AI_EXTRACTED:
        return EvidenceSourceKind.UPLOADED_REPORT
    if provenance == Provenance.CONFIGURED_RULE:
        return EvidenceSourceKind.CONFIGURED_RULE
    return EvidenceSourceKind.MANUAL_ENTRY


def _patient_text(case: Case) -> str:
    return " ".join(filter(None, [case.chief_concern, case.timeline_text]))


def build_evidence_rows(
    case: Case,
    documents: list[Document] | None = None,
) -> list[dict[str, Any]]:
    """Pure builder: derive evidence rows from a case aggregate.

    No database writes. Safe to unit-test with plain objects.
    """
    text = _patient_text(case)
    rows: list[dict[str, Any]] = []

    for symptom in case.symptoms or []:
        conf = estimate_symptom_confidence(
            symptom.term, context_text=text, provenance=symptom.source
        )
        warnings: list[str] = []
        if conf.tier.value == "LOW":
            warnings.append("Low confidence extraction; reviewer confirmation required.")
        if not symptom.verified:
            warnings.append("Not yet confirmed by a reviewer.")
        rows.append(
            {
                "fact_type": EvidenceFactType.SYMPTOM,
                "fact_ref": f"symptom:{symptom.id}",
                "label": symptom.term,
                "unit": None,
                "normalized_value": symptom.normalized_term or symptom.term,
                "current_value": symptom.term,
                "source_kind": _source_kind(symptom.collected_via, symptom.source),
                "source_provenance": symptom.source.value,
                "source_snippet": conf.evidence_quote,
                "source_ref_id": None,
                "source_timestamp": symptom.created_at,
                "extraction_method": "RULE",
                "model_version": None,
                "confidence": conf.confidence,
                "confidence_tier": conf.tier.value,
                "is_calibrated": conf.is_calibrated,
                "rationale": conf.rationale,
                "validation_warnings": warnings,
            }
        )

    for measurement in case.measurements or []:
        conf = estimate_measurement_confidence(
            name=measurement.name,
            value=measurement.value,
            unit=measurement.unit,
            context_text=text,
            provenance=measurement.source,
        )
        warnings = []
        if conf.tier.value == "LOW":
            warnings.append("Low confidence extraction; reviewer confirmation required.")
        if not measurement.verified:
            warnings.append("Not yet confirmed by a reviewer.")
        rows.append(
            {
                "fact_type": EvidenceFactType.MEASUREMENT,
                "fact_ref": f"measurement:{measurement.id}",
                "label": measurement.name,
                "unit": measurement.unit,
                "normalized_value": measurement.value,
                "current_value": measurement.value,
                "source_kind": _source_kind(measurement.collected_via, measurement.source),
                "source_provenance": measurement.source.value,
                "source_snippet": conf.evidence_quote,
                "source_ref_id": None,
                "source_timestamp": measurement.created_at,
                "extraction_method": "RULE",
                "model_version": None,
                "confidence": conf.confidence,
                "confidence_tier": conf.tier.value,
                "is_calibrated": conf.is_calibrated,
                "rationale": conf.rationale,
                "validation_warnings": warnings,
            }
        )

    if case.timeline_text:
        rows.append(
            {
                "fact_type": EvidenceFactType.TIMELINE,
                "fact_ref": "timeline:reported",
                "label": "Reported timeline",
                "unit": None,
                "normalized_value": case.timeline_text,
                "current_value": case.timeline_text,
                "source_kind": EvidenceSourceKind.PATIENT_TEXT,
                "source_provenance": Provenance.PATIENT_REPORTED.value,
                "source_snippet": case.timeline_text[:280],
                "source_ref_id": None,
                "source_timestamp": case.created_at,
                "extraction_method": "RULE",
                "model_version": None,
                "confidence": None,
                "confidence_tier": None,
                "is_calibrated": False,
                "rationale": "Directly reported by the patient.",
                "validation_warnings": [],
            }
        )

    for document in documents or []:
        for extraction in document.extractions or []:
            structured = extraction.structured or {}
            for field in _iter_document_fields(structured):
                rows.append(
                    {
                        "fact_type": EvidenceFactType.DOCUMENT_FIELD,
                        "fact_ref": f"document:{document.id}:{extraction.id}:{field['key']}",
                        "label": field["label"],
                        "unit": field.get("unit"),
                        "normalized_value": field["value"],
                        "current_value": field["value"],
                        "source_kind": EvidenceSourceKind.UPLOADED_REPORT,
                        "source_provenance": (extraction.source or Provenance.AI_EXTRACTED).value,
                        # Safe location only — never the raw document text.
                        "source_snippet": f"document:{document.id}#extraction:{extraction.id} (method={extraction.method.value})",
                        "source_ref_id": f"document:{document.id}",
                        "source_timestamp": extraction.created_at,
                        "extraction_method": extraction.method.value,
                        "model_version": None,
                        "confidence": None,
                        "confidence_tier": None,
                        "is_calibrated": False,
                        "rationale": "Extracted from an uploaded document; requires human verification.",
                        "validation_warnings": ["Extracted from uploaded document; verify against the source."],
                    }
                )

    return rows


def _iter_document_fields(structured: dict) -> list[dict[str, Any]]:
    """Best-effort extraction of labelled fields from a structured payload."""
    fields: list[dict[str, Any]] = []
    for key, value in (structured or {}).items():
        if isinstance(value, list):
            for idx, item in enumerate(value):
                if isinstance(item, dict):
                    label = str(item.get("name") or item.get("term") or item.get("label") or key)
                    val = item.get("value") or item.get("term") or item.get("name")
                    if val is not None:
                        fields.append(
                            {
                                "key": f"{key}[{idx}]",
                                "label": label,
                                "value": str(val),
                                "unit": item.get("unit"),
                            }
                        )
                elif isinstance(item, (str, int, float)):
                    fields.append({"key": f"{key}[{idx}]", "label": key, "value": str(item)})
        elif isinstance(value, dict):
            for sub_key, sub_val in value.items():
                if sub_val is not None and not isinstance(sub_val, (dict, list)):
                    fields.append(
                        {"key": f"{key}.{sub_key}", "label": sub_key, "value": str(sub_val)}
                    )
        elif value is not None and not isinstance(value, (dict, list)):
            fields.append({"key": key, "label": key, "value": str(value)})
    return fields


def sync_case_evidence(
    db: Session,
    case: Case,
    *,
    actor: User | None = None,
    commit: bool = True,
) -> list[FactEvidence]:
    """Create or refresh evidence rows for a case (idempotent per fact_ref).

    Existing reviewer decisions are preserved: only source/confidence metadata
    is refreshed, never the ``reviewer_status`` or ``current_value`` once a
    human has acted.
    """
    documents = list(
        db.scalars(
            select(Document).where(Document.case_id == case.id, Document.deleted_at.is_(None))
        )
    )
    rows = build_evidence_rows(case, documents)

    existing = {
        ev.fact_ref: ev
        for ev in db.scalars(select(FactEvidence).where(FactEvidence.case_id == case.id))
    }

    created = 0
    refreshed = 0
    for row in rows:
        ev = existing.get(row["fact_ref"])
        if ev is None:
            ev = FactEvidence(
                case_id=case.id,
                extraction_timestamp=datetime.now(UTC),
                original_value=row["current_value"],
                reviewer_status=EvidenceReviewStatus.PENDING,
                **row,
            )
            db.add(ev)
            created += 1
        else:
            # Refresh provenance/confidence but never overwrite a human decision.
            ev.source_kind = row["source_kind"]
            ev.source_provenance = row["source_provenance"]
            ev.source_snippet = row["source_snippet"]
            ev.confidence = row["confidence"]
            ev.confidence_tier = row["confidence_tier"]
            ev.rationale = row["rationale"]
            ev.validation_warnings = row["validation_warnings"]
            if ev.reviewer_status == EvidenceReviewStatus.PENDING:
                ev.current_value = row["current_value"]
            refreshed += 1

    if created or refreshed:
        record_audit(
            db,
            AuditAction.EVIDENCE_GENERATED,
            user=actor,
            case=case,
            metadata={"created": created, "refreshed": refreshed},
            commit=False,
        )
    if commit:
        db.commit()
    else:
        db.flush()

    return list(
        db.scalars(
            select(FactEvidence)
            .where(FactEvidence.case_id == case.id)
            .order_by(FactEvidence.fact_type, FactEvidence.id)
        )
    )


def list_case_evidence(db: Session, case: Case) -> list[FactEvidence]:
    return list(
        db.scalars(
            select(FactEvidence)
            .where(FactEvidence.case_id == case.id)
            .order_by(FactEvidence.fact_type, FactEvidence.id)
        )
    )


def get_evidence_or_404(db: Session, case: Case, evidence_id: int) -> FactEvidence:
    ev = db.scalar(
        select(FactEvidence).where(
            FactEvidence.id == evidence_id, FactEvidence.case_id == case.id
        )
    )
    if ev is None:
        raise NotFoundError("Evidence record not found for this case")
    return ev


def review_evidence(
    db: Session,
    case: Case,
    evidence: FactEvidence,
    *,
    actor: User,
    status: str,
    new_value: str | None = None,
    reason: str | None = None,
    commit: bool = True,
) -> FactEvidence:
    """Apply a reviewer decision. Only staff may review evidence."""
    if actor.role not in _STAFF_ROLES:
        raise ForbiddenError("Only clinical staff may review evidence")
    if status not in REVIEWABLE_STATUSES:
        raise AppError(
            "Invalid review status",
            status_code=422,
            code="invalid_review_status",
            details={"allowed": list(REVIEWABLE_STATUSES)},
        )

    if status == EvidenceReviewStatus.EDITED:
        if new_value is None or not new_value.strip():
            raise AppError(
                "An edited value is required to edit a fact",
                status_code=422,
                code="missing_edited_value",
            )
        if evidence.original_value is None:
            evidence.original_value = evidence.current_value
        evidence.current_value = new_value.strip()
        _apply_edit_to_source(case, evidence, actor)
    elif status == EvidenceReviewStatus.CONFIRMED:
        _mark_source_verified(case, evidence, actor)
    # REJECTED: record the rejection but do not mutate the underlying fact.

    evidence.reviewer_status = status
    evidence.reviewer_user_id = actor.id
    evidence.reviewer_label = actor.full_name
    evidence.reviewed_at = datetime.now(UTC)
    evidence.review_reason = reason

    record_audit(
        db,
        AuditAction.EVIDENCE_REVIEWED,
        user=actor,
        case=case,
        metadata={
            "evidence_id": evidence.id,
            "fact_ref": evidence.fact_ref,
            "status": status,
            "original_value": evidence.original_value,
            "current_value": evidence.current_value,
        },
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(evidence)
    else:
        db.flush()
    return evidence


def _mark_source_verified(case: Case, evidence: FactEvidence, actor: User) -> None:
    """Mark the underlying extracted fact as human-verified."""
    fact_type, _, ref = evidence.fact_ref.partition(":")
    if not ref.isdigit():
        return
    target_id = int(ref)
    if fact_type == "symptom":
        for s in case.symptoms:
            if s.id == target_id:
                s.verified = True
                s.verified_by_user_id = actor.id
                break
    elif fact_type == "measurement":
        for m in case.measurements:
            if m.id == target_id:
                m.verified = True
                m.verified_by_user_id = actor.id
                break


def _apply_edit_to_source(case: Case, evidence: FactEvidence, actor: User) -> None:
    """Apply a corrected value to the underlying fact, preserving the original."""
    fact_type, _, ref = evidence.fact_ref.partition(":")
    if not ref.isdigit():
        return
    target_id = int(ref)
    if fact_type == "symptom":
        for s in case.symptoms:
            if s.id == target_id:
                if evidence.original_value and evidence.original_value != s.term:
                    s.notes = f"{s.notes or ''}\n[reviewer edit] original: {evidence.original_value}".strip()
                s.term = evidence.current_value or s.term
                s.verified = True
                s.verified_by_user_id = actor.id
                break
    elif fact_type == "measurement":
        for m in case.measurements:
            if m.id == target_id:
                m.value = evidence.current_value or m.value
                m.verified = True
                m.verified_by_user_id = actor.id
                break


def evidence_to_dict(evidence: FactEvidence) -> dict[str, Any]:
    return {
        "id": evidence.id,
        "case_id": evidence.case_id,
        "fact_type": evidence.fact_type,
        "fact_ref": evidence.fact_ref,
        "label": evidence.label,
        "unit": evidence.unit,
        "normalized_value": evidence.normalized_value,
        "original_value": evidence.original_value,
        "current_value": evidence.current_value,
        "source_kind": evidence.source_kind,
        "source_provenance": evidence.source_provenance,
        "source_snippet": evidence.source_snippet,
        "source_ref_id": evidence.source_ref_id,
        "source_timestamp": evidence.source_timestamp,
        "extraction_method": evidence.extraction_method,
        "model_version": evidence.model_version,
        "extraction_timestamp": evidence.extraction_timestamp,
        "confidence": evidence.confidence,
        "confidence_tier": evidence.confidence_tier,
        "is_calibrated": evidence.is_calibrated,
        "rationale": evidence.rationale,
        "validation_warnings": evidence.validation_warnings or [],
        "sop_references": evidence.sop_references or [],
        "reviewer_status": evidence.reviewer_status,
        "reviewer_label": evidence.reviewer_label,
        "reviewed_at": evidence.reviewed_at,
        "review_reason": evidence.review_reason,
    }
