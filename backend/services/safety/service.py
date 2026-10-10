"""Safety engine DB integration: load configured rules, persist signals."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Case, SafetyRule, SafetySignal
from models.enums import Priority, Provenance
from services.audit import AuditAction, record_audit
from services.notifications import NotificationType, notify_facility_staff
from services.safety.engine import RuleSpec, SafetyEvaluation, evaluate_safety

if TYPE_CHECKING:
    from models import User


import time

_RULES_CACHE: dict[int | None, tuple[float, list[RuleSpec]]] = {}


def clear_rules_cache() -> None:
    global _RULES_CACHE
    _RULES_CACHE.clear()


def load_rule_specs(db: Session, facility_id: int | None = None) -> list[RuleSpec]:
    """Global rules + facility-specific rules with in-memory TTL caching."""
    global _RULES_CACHE
    now = time.time()
    cached = _RULES_CACHE.get(facility_id)
    if cached and (now - cached[0]) < 60.0:
        return cached[1]

    stmt = select(SafetyRule).where(SafetyRule.is_active.is_(True))
    if facility_id is not None:
        stmt = stmt.where(
            SafetyRule.facility_id.is_(None) | (SafetyRule.facility_id == facility_id)
        )
    rules = db.scalars(stmt).all()
    specs = [RuleSpec.from_rule(r) for r in rules]
    _RULES_CACHE[facility_id] = (now, specs)
    return specs


def run_safety_evaluation(
    db: Session,
    case: Case,
    extraction: dict,
    *,
    existing_rule_codes: set[str] | None = None,
) -> SafetyEvaluation:
    """Evaluate rules for this case and persist any new signals without duplicate DB queries."""
    specs = load_rule_specs(db, case.facility_id)
    evaluation = evaluate_safety(specs, extraction)

    existing = (
        existing_rule_codes
        if existing_rule_codes is not None
        else {
            s.rule_code
            for s in db.scalars(select(SafetySignal).where(SafetySignal.case_id == case.id)).all()
        }
    )

    new_signals = [s for s in evaluation.signals if s.rule_code not in existing]
    for signal in new_signals:
        db.add(
            SafetySignal(
                case_id=case.id,
                rule_id=signal.rule_id,
                rule_code=signal.rule_code,
                label=signal.label,
                message=signal.message,
                priority=signal.priority,
                source=Provenance.CONFIGURED_RULE,
                evidence=signal.evidence,
            )
        )

    # Case priority is never lowered automatically — only raised by signals.
    ladder = [Priority.ROUTINE, Priority.REVIEW_REQUIRED, Priority.URGENT_REVIEW]
    if ladder.index(evaluation.priority) > ladder.index(case.priority):
        case.priority = evaluation.priority

    if new_signals:
        db.flush()
    return evaluation


def build_case_extraction(case: Case, *, extra_free_text: str | None = None) -> dict:
    """Consolidate everything persisted on a case into one evaluation input.

    Used by submit, chat, document processing and follow-up completion so the
    engine always sees the full structured picture, not a single message.
    """
    ctx = case.patient_context or {}
    free_text = " ".join(filter(None, [case.chief_concern, case.timeline_text, extra_free_text]))
    return {
        "symptoms": [s.term for s in case.symptoms],
        "free_text": free_text,
        "measurements": [
            {"name": m.name, "value": m.value, "unit": m.unit} for m in case.measurements
        ],
        "duration_days": _duration_days(case),
        "answers": dict(ctx.get("answers") or {}),
    }


def _duration_days(case: Case) -> float | None:
    # Follow-up answers recorded in patient_context are checked first so a
    # tele-call answer like "since 3 days" drives duration rules too.
    answer = str(((case.patient_context or {}).get("answers") or {}).get("duration") or "")
    for text in (answer, case.timeline_text or ""):
        if not text:
            continue
        weeks = re.search(r"(\d+)\s*week", text, flags=re.IGNORECASE)
        if weeks:
            return float(weeks.group(1)) * 7
        days = re.search(r"(\d+)\s*day", text, flags=re.IGNORECASE)
        if days:
            return float(days.group(1))
        if "week" in text.lower():
            return 7.0
    return None


def reevaluate_case(
    db: Session,
    case: Case,
    *,
    trigger: str,
    actor: User | None = None,
    extra_free_text: str | None = None,
) -> SafetyEvaluation:
    """Re-run configured rules after new information arrived.

    Persists any newly matched signals, raises case priority when a higher
    configured tier matched, and audits each NEW signal with its trigger.
    Idempotent: re-running the same state produces no duplicate signals.
    """
    existing = {
        s.rule_code
        for s in db.scalars(select(SafetySignal).where(SafetySignal.case_id == case.id)).all()
    }
    extraction = build_case_extraction(case, extra_free_text=extra_free_text)
    evaluation = run_safety_evaluation(db, case, extraction, existing_rule_codes=existing)

    for signal in evaluation.signals:
        if signal.rule_code in existing:
            continue
        record_audit(
            db,
            AuditAction.SAFETY_SIGNAL_GENERATED,
            user=actor,
            case=case,
            metadata={
                "rule_code": signal.rule_code,
                "priority": signal.priority.value,
                "trigger": trigger,
                "evidence": signal.evidence,
            },
        )
        notify_facility_staff(
            db,
            facility_id=case.facility_id,
            type=NotificationType.SAFETY_SIGNAL,
            title=f"New safety signal: {signal.label}",
            body=signal.message,
            case_id=case.id,
            exclude_user_id=actor.id if actor else None,
        )
    return evaluation
