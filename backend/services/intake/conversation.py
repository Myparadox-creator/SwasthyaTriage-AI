"""Intake conversation service: apply extraction to a case and drive the
controlled question bank.

Questions come from the seeded question_bank; reply text is deterministic.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Case, CaseMeasurement, CaseSymptom, QuestionBankItem
from models.enums import Provenance
from services.intake.fallback import Extraction

# questions collected implicitly from structured signals
_SIGNAL_CODES = {"duration", "temperature", "breathing", "emergency_signs", "severity"}
# questions collected as short free-text answers
_ANSWER_CODES = {
    "current_medication",
    "medical_history",
    "appetite",
    "hydration",
    "prior_care",
    "contact_person",
}

_NEGATION_RE = re.compile(
    r"\b(?:no|not|nope|nahi|nahin|nihi|bilkul nahi|ठीक|ठिक|मुझे नहीं|ନା|ନାଇଁ|ଠିକ)\b", re.IGNORECASE
)
_NUM_RE = re.compile(r"\b(\d{2,3}(?:\.\d)?)\b")


def _ctx(case: Case) -> dict:
    if case.patient_context is None:
        case.patient_context = {}
    return case.patient_context


def apply_extraction(db: Session, case: Case, extraction: Extraction, *, channel: str) -> dict:
    """Persist newly discovered symptoms/measurements/duration. Returns change summary."""
    added_symptoms: list[str] = []
    added_measurement = False

    existing = {s.normalized_term or s.term for s in case.symptoms}
    for canonical in extraction.symptoms:
        if canonical not in existing:
            db.add(
                CaseSymptom(
                    case_id=case.id,
                    term=canonical.title(),
                    normalized_term=canonical,
                    source=Provenance.PATIENT_REPORTED,
                    collected_via=channel,
                    verified=False,
                )
            )
            added_symptoms.append(canonical)

    if extraction.temperature and not any(
        m.name.lower() == "temperature" for m in case.measurements
    ):
        value, unit = extraction.temperature
        db.add(
            CaseMeasurement(
                case_id=case.id,
                name="Temperature",
                value=value,
                unit=unit,
                source=Provenance.PATIENT_REPORTED,
                collected_via=channel,
                verified=False,
            )
        )
        added_measurement = True

    ctx = _ctx(case)
    if extraction.duration_days is not None and "duration_days" not in ctx:
        ctx["duration_days"] = extraction.duration_days
    if extraction.severity and "severity" not in ctx:
        ctx["severity"] = extraction.severity
    return {"added_symptoms": added_symptoms, "added_measurement": added_measurement}


@dataclass
class CachedQuestion:
    """Safe detached representation of a QuestionBankItem."""

    id: int | None
    code: str
    category: str
    target_field: str
    text_en: str
    text_hi: str | None
    text_od: str | None
    required_for_review: bool
    order: int
    is_active: bool = True

    def text_for(self, language: str) -> str:
        if language == "hi" and self.text_hi:
            return self.text_hi
        if language == "od" and self.text_od:
            return self.text_od
        return self.text_en


_QUESTIONS_CACHE: list[CachedQuestion] | None = None
_QUESTIONS_CACHE_TIME: float = 0.0


def clear_questions_cache() -> None:
    global _QUESTIONS_CACHE, _QUESTIONS_CACHE_TIME
    _QUESTIONS_CACHE = None
    _QUESTIONS_CACHE_TIME = 0.0


def active_questions(db: Session) -> list[CachedQuestion]:
    """Retrieve active questions with in-memory TTL caching and safe detached instances."""
    global _QUESTIONS_CACHE, _QUESTIONS_CACHE_TIME
    now = time.time()
    if _QUESTIONS_CACHE is not None and (now - _QUESTIONS_CACHE_TIME) < 60.0:
        return _QUESTIONS_CACHE
    rows = db.scalars(
        select(QuestionBankItem)
        .where(QuestionBankItem.is_active.is_(True))
        .order_by(QuestionBankItem.order)
    ).all()
    items = [
        CachedQuestion(
            id=q.id,
            code=q.code,
            category=q.category,
            target_field=q.target_field,
            text_en=q.text_en,
            text_hi=q.text_hi,
            text_od=q.text_od,
            required_for_review=q.required_for_review,
            order=q.order,
            is_active=q.is_active,
        )
        for q in rows
    ]
    _QUESTIONS_CACHE = items
    _QUESTIONS_CACHE_TIME = now
    return items


def is_satisfied(db: Session, case: Case, q: QuestionBankItem) -> bool:
    ctx = _ctx(case)
    answers = ctx.get("answers") or {}
    code = q.code
    if code in _SIGNAL_CODES:
        if code == "duration":
            return bool(case.timeline_text) or "duration_days" in ctx or code in answers
        if code == "temperature":
            return (
                any(m.name.lower() == "temperature" for m in case.measurements) or code in answers
            )
        if code == "breathing":
            return (
                any(s.normalized_term == "breathing difficulty" for s in case.symptoms)
                or code in answers
            )
        if code == "emergency_signs":
            return bool(case.symptoms) or bool(case.chief_concern) or code in answers
        if code == "severity":
            return "severity" in ctx or code in answers
        return False
    return code in answers


def next_question(db: Session, case: Case) -> QuestionBankItem | None:
    for q in active_questions(db):
        if not is_satisfied(db, case, q):
            return q
    return None


def progress(db: Session, case: Case) -> dict:
    questions = active_questions(db)
    if not questions:
        return {"answered": 0, "total": 0, "percent": 100}
    satisfied = sum(1 for q in questions if is_satisfied(db, case, q))
    return {
        "answered": satisfied,
        "total": len(questions),
        "percent": int(round(satisfied / len(questions) * 100)),
    }


def record_answer_for_question(
    db: Session, case: Case, q: QuestionBankItem, message: str, extraction: Extraction
) -> bool:
    """Record how the current question was answered (signal or short answer)."""
    ctx = _ctx(case)
    answers = ctx.setdefault("answers", {})

    if q.code == "hydration":
        if _NEGATION_RE.search(message) or not extraction.symptoms:
            answers[q.code] = message[:500]
            return True
        return False

    if q.code in _ANSWER_CODES:
        if extraction.symptoms:
            return False
        answers[q.code] = message[:500]
        return True

    if q.code == "temperature":
        if extraction.temperature:
            return True
        if _NEGATION_RE.search(message):
            answers[q.code] = "No"
            return True
        m = _NUM_RE.search(message)
        if m:
            answers[q.code] = m.group(1)
            return True
        return False

    if q.code in ("breathing", "emergency_signs"):
        if q.code == "breathing" and any(
            s.normalized_term == "breathing difficulty" for s in case.symptoms
        ):
            return True
        if _NEGATION_RE.search(message):
            answers[q.code] = "No"
            return True
        if q.code == "breathing" and re.search(
            r"\b(?:yes|yep|haan|han|swas memahami)\b", message, re.IGNORECASE
        ):
            answers[q.code] = "Yes"
            return True
        return False

    if q.code == "severity":
        if extraction.severity:
            answers[q.code] = extraction.severity
            return True
        m = _NUM_RE.search(message)
        if m and m.group(1) in ("5", "6", "7", "8", "9", "10"):
            answers[q.code] = "severe"
            return True
        return False

    # duration — handled via extraction or chief_concern text
    return bool(case.timeline_text) or "duration_days" in ctx


def acknowledgement(extraction: Extraction) -> str | None:
    parts: list[str] = []
    if extraction.symptoms:
        parts.append("you mentioned " + ", ".join(f"'{s}'" for s in extraction.symptoms))
    if extraction.temperature:
        value, unit = extraction.temperature
        parts.append(f"a temperature of {value} {unit}")
    if extraction.severity:
        parts.append(f"that it feels {extraction.severity}")
    if extraction.duration_days:
        parts.append(
            f"for about {extraction.duration_days} day{'s' if extraction.duration_days != 1 else ''}"
        )
    if not parts:
        return None
    return "Thanks — " + ", and ".join(parts) + ". I have noted this."


def build_reply(case: Case, extraction: Extraction, q: QuestionBankItem | None) -> str:
    ack = acknowledgement(extraction)
    language = case.language.value if case.language else "en"
    if q is None:
        base = f"{ack} " if ack else ""
        return (
            base
            + "I have enough from you for now. When you are ready, tap 'Submit assessment' and a "
            "healthcare professional will review it carefully."
        )
    question_text = q.text_for(language)
    if ack:
        return f"{ack} One quick follow-up: {question_text}"
    if not case.chief_concern:
        return (
            "Please tell me in a few words what the main problem is — for example "
            "'fever and cough for 2 days'."
        )
    return f"To help the care team further, one quick question: {question_text}"
