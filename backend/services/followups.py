"""Shared follow-up completion path.

One implementation serves the manual `POST /api/followups/{id}/complete`
endpoint and the tele-call provider (Phase 12), so both produce identical
data writes, safety re-evaluation, audits and notifications.

Transaction policy: this module only flushes — the caller owns the commit.

Answer handling is deterministic and non-diagnostic:
- every answer is recorded in `patient_context["answers"][item]`;
- measurement items (temperature, pulse, ...) become CaseMeasurement rows;
- answers matching an existing symptom term update that symptom's notes
  (and severity only when the patient's own words say mild/moderate/severe);
- all other items stay context answers only. Nothing is inferred.
"""

from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from middleware.errors import AppError
from models import Case, CaseMeasurement, CaseSymptom, FollowUp, User
from models.enums import FollowUpStatus, Provenance, Role
from schemas.case import FollowUpAnswer
from services.audit import AuditAction, record_audit
from services.notifications import notify_users
from services.safety.service import reevaluate_case

# item key -> (measurement display name, default unit)
MEASUREMENT_ITEMS: dict[str, tuple[str, str]] = {
    "temperature": ("Temperature", "°F"),
    "pulse": ("Pulse", "bpm"),
    "heart_rate": ("Heart Rate", "bpm"),
    "blood_pressure": ("Blood Pressure", "mmHg"),
    "bp": ("Blood Pressure", "mmHg"),
    "sp_o2": ("SpO2", "%"),
    "spo2": ("SpO2", "%"),
    "oxygen_saturation": ("SpO2", "%"),
}

_SEVERITY_WORDS = {"mild", "moderate", "severe"}


def normalize_item(text: str) -> str:
    """'Current medication' -> 'current_medication' for matching."""
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def _parse_measurement(key: str, raw: str) -> tuple[str, str, str] | None:
    """(name, numeric value, unit) or None when the answer is not numeric."""
    meta = MEASUREMENT_ITEMS.get(key)
    if meta is None:
        return None
    name, unit = meta
    match = re.search(r"-?\d+(?:\.\d+)?", raw)
    if match is None:
        return None
    lowered = raw.lower()
    if "°c" in lowered or re.search(r"\d\s*(c\b|celsius)", lowered):
        unit = "°C"
    elif "°f" in lowered or re.search(r"\d\s*f\b|fahrenheit", lowered):
        unit = "°F"
    return name, match.group(0), unit


def _matching_symptom(case: Case, key: str) -> CaseSymptom | None:
    for symptom in case.symptoms:
        term = normalize_item(symptom.term)
        if term and (key == term or key in term or term in key):
            return symptom
    return None


def apply_answers(db: Session, case: Case, answers: list[FollowUpAnswer]) -> dict[str, str]:
    """Persist follow-up answers on the case. Returns the applied key->value map."""
    ctx = dict(case.patient_context or {})
    answers_map: dict[str, str] = dict(ctx.get("answers") or {})

    for answer in answers:
        key = normalize_item(answer.item)
        if not key:
            continue
        value = answer.value.strip()
        answers_map[key] = value

        parsed = _parse_measurement(key, value)
        if parsed is not None:
            name, numeric, unit = parsed
            existing = next(
                (m for m in case.measurements if normalize_item(m.name) == normalize_item(name)),
                None,
            )
            if existing is not None:
                existing.value = numeric
                existing.unit = unit
            else:
                # Append via the relationship so the in-session collection
                # (used by the safety re-evaluation right after) sees it too.
                case.measurements.append(
                    CaseMeasurement(
                        name=name,
                        value=numeric,
                        unit=unit,
                        source=Provenance.PATIENT_REPORTED,
                        collected_via="FOLLOW_UP",
                    )
                )
            continue

        symptom = _matching_symptom(case, key)
        if symptom is not None:
            note = f"Follow-up: {value}"
            symptom.notes = f"{symptom.notes} | {note}" if symptom.notes else note
            if value.lower().strip() in _SEVERITY_WORDS:
                symptom.severity = value.lower().strip()

    ctx["answers"] = answers_map
    case.patient_context = ctx
    db.flush()
    return answers_map


def recompute_missing_information(case: Case) -> None:
    """Drop items the follow-up answered from the case's missing list."""
    answered = set((case.patient_context or {}).get("answers") or {})
    if not answered:
        return
    kept = []
    for item in case.missing_information or []:
        key = normalize_item(item)
        if key in answered or any(a in key or key in a for a in answered if a):
            continue
        kept.append(item)
    case.missing_information = kept


def complete_followup(
    db: Session,
    followup: FollowUp,
    *,
    answers: list[FollowUpAnswer],
    summary: str | None,
    actor: User,
) -> Case:
    """Complete a follow-up end to end (flush only — caller commits).

    Raises AppError 409 on invalid state, 422 when an answer was never
    requested by this follow-up.
    """
    case = db.get(Case, followup.case_id)
    if case is None:
        raise AppError("Case not found", status_code=404, code="case_not_found")

    if followup.status not in {FollowUpStatus.PENDING, FollowUpStatus.IN_PROGRESS}:
        raise AppError(
            "This follow-up can no longer be completed",
            status_code=409,
            code="invalid_transition",
        )

    if followup.items and answers:
        allowed = [normalize_item(i) for i in followup.items]
        for answer in answers:
            key = normalize_item(answer.item)
            if not any(key == a or key in a or a in key for a in allowed if a):
                raise AppError(
                    f"'{answer.item}' was not requested by this follow-up",
                    status_code=422,
                    code="unexpected_item",
                )

    applied = apply_answers(db, case, answers)
    recompute_missing_information(case)

    now = datetime.now().astimezone()
    followup.status = FollowUpStatus.COMPLETED
    followup.completed_at = now
    followup.result_summary = {
        "answers": applied,
        "answered_items": [normalize_item(a.item) for a in answers],
        "summary": summary,
        "completed_by": actor.full_name,
    }

    record_audit(
        db,
        AuditAction.FOLLOW_UP_COMPLETED,
        user=actor,
        case=case,
        metadata={
            "followup_id": followup.public_id,
            "channel": followup.channel.value,
            "answered_items": [normalize_item(a.item) for a in answers],
            "has_summary": bool(summary),
        },
    )

    reevaluate_case(
        db,
        case,
        trigger="followup",
        actor=actor,
        extra_free_text=" ".join(a.value for a in answers) or None,
    )

    # Requester + assignee + facility staff, never the actor, de-duplicated.
    staff_ids = db.scalars(
        select(User.id).where(
            User.facility_id == case.facility_id,
            User.role.in_((Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN)),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    ).all()
    recipients = {
        followup.requested_by_user_id,
        followup.assigned_to_user_id,
        case.patient.user_id if case.patient else None,
        *staff_ids,
    }
    recipients.discard(None)
    recipients.discard(actor.id)
    notify_users(
        db,
        sorted(recipients),
        type="FOLLOW_UP_COMPLETED",
        title=f"Follow-up completed — {case.case_number}",
        body=(summary or followup.reason)[:500],
        case_id=case.id,
    )
    db.flush()
    return case
