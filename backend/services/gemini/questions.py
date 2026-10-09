"""Question suggestion from the controlled question bank.

Suggestions are always bank items (codes) — never free-form LLM questions.
Deterministic fallback: match the case's missing_information against bank
items, then include required-for-review questions the case has not answered.
A real provider may only reorder/filter within this candidate set; anything
outside the bank is discarded and the deterministic order is used.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Case, QuestionBankItem
from services.intake.conversation import active_questions, is_satisfied


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def match_bank_for_missing(
    bank: list[QuestionBankItem], missing: list[str]
) -> list[QuestionBankItem]:
    """Match free-form missing_information labels to bank items."""
    matched: list[QuestionBankItem] = []
    for label in missing:
        target = _norm(label)
        if not target:
            continue
        for item in bank:
            if item in matched:
                continue
            haystacks = {_norm(item.code), _norm(item.target_field), _norm(item.text_en)}
            if any(target in h or h in target for h in haystacks if h):
                matched.append(item)
                break
    return matched


def deterministic_candidates(db: Session, case: Case) -> list[QuestionBankItem]:
    """Bank items to ask about: missing-information matches first, then
    required-for-review questions the case has not satisfied yet."""
    bank = list(active_questions(db))
    missing = list(case.missing_information or [])
    chosen = match_bank_for_missing(bank, missing)
    for item in bank:
        if item not in chosen and item.required_for_review and not is_satisfied(db, case, item):
            chosen.append(item)
    return chosen


def suggest_questions(
    db: Session,
    case: Case,
    provider,
) -> list[dict]:
    """Localized suggestions: [{code, text}]. Provider may only filter the
    deterministic candidate set; failures fall back to it."""
    candidates = deterministic_candidates(db, case)
    if not candidates:
        return []

    codes = [c.code for c in candidates]
    provider_pick: list[str] | None = None
    if provider.name != "mock":
        try:
            provider_pick = provider.suggest_questions(candidates=codes)
        except Exception:  # noqa: BLE001 - suggestion is best-effort by design
            provider_pick = None

    if provider_pick:
        allowed = [c for c in provider_pick if c in codes]
        # keep bank order regardless of provider ordering
        ordered = [c for c in codes if c in allowed]
        chosen_codes = ordered or codes
    else:
        chosen_codes = codes

    language = case.language.value if case.language else "en"
    chosen = [c for c in candidates if c.code in chosen_codes]
    return [{"code": c.code, "text": c.text_for(language)} for c in chosen]


def all_bank_codes(db: Session) -> list[str]:
    rows = db.scalars(select(QuestionBankItem).where(QuestionBankItem.is_active.is_(True))).all()
    return [r.code for r in rows]
