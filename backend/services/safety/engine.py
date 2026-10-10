"""Deterministic safety rule engine.

IMPORTANT: This engine never calls an LLM. It evaluates configured rules
against structured, already-extracted patient information and produces
"configured safety signals" — never diagnoses.

Independently testable: no database, no network.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re

from models import SafetyRule
from models.enums import Priority

# Priority ladder for roll-up
_LADDER = [Priority.ROUTINE, Priority.REVIEW_REQUIRED, Priority.URGENT_REVIEW]


@dataclass
class RuleSpec:
    """A safety rule in evaluation-ready form."""

    code: str
    name: str
    match_patterns: list[str]
    target_priority: Priority
    display_message: str
    field_condition: dict | None = None
    rule_id: int | None = None

    @classmethod
    def from_rule(cls, rule: SafetyRule) -> RuleSpec:
        return cls(
            code=rule.code,
            name=rule.name,
            match_patterns=list(rule.match_patterns or []),
            target_priority=rule.target_priority,
            display_message=rule.display_message,
            field_condition=rule.field_condition,
            rule_id=getattr(rule, "id", None),
        )


@dataclass
class MatchedSignal:
    rule_code: str
    label: str
    message: str
    priority: Priority
    evidence: dict = field(default_factory=dict)
    rule_id: int | None = None


@dataclass
class SafetyEvaluation:
    signals: list[MatchedSignal]
    priority: Priority
    rules_evaluated: int

    @property
    def has_urgent(self) -> bool:
        return self.priority == Priority.URGENT_REVIEW


def _to_fahrenheit(value: float, unit: str | None) -> float:
    unit_norm = (unit or "°F").strip().lower().replace(" ", "")
    if unit_norm in {"c", "°c", "degc", "celsius"}:
        return (value * 9 / 5) + 32
    return value


def _haystack(extraction: dict) -> str:
    parts: list[str] = []
    for symptom in extraction.get("symptoms") or []:
        if isinstance(symptom, dict):
            parts.append(str(symptom.get("term", "")))
        else:
            parts.append(str(symptom))
    parts.append(str(extraction.get("free_text") or ""))
    for answer in (extraction.get("answers") or {}).values():
        parts.append(str(answer))
    return " \n ".join(parts).lower()


def _measurements(extraction: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for m in extraction.get("measurements") or []:
        name = str(m.get("name", "")).strip().lower()
        try:
            raw = float(str(m.get("value")).strip())
        except (TypeError, ValueError):
            continue
        unit = m.get("unit")
        if "temp" in name:
            out["temperature"] = _to_fahrenheit(raw, unit)
            out["temperature_f"] = _to_fahrenheit(raw, unit)
        elif "blood" in name and "pressure" in name:
            systolic = str(m.get("value", "")).split("/")[0]
            try:
                out["bp_systolic"] = float(systolic)
            except ValueError:
                pass
        else:
            out[name.replace(" ", "_")] = raw
    return out


def _condition_holds(condition: dict, extraction: dict, measurements: dict) -> tuple[bool, dict]:
    evidence: dict = {}

    if "measurement" in condition:
        target = str(condition["measurement"]).strip().lower()
        key = "temperature_f" if "temp" in target else target
        value = measurements.get(key)
        if value is None:
            return False, evidence
        if "gte_f" in condition and value >= float(condition["gte_f"]):
            evidence = {"measurement": key, "value": value, "threshold": condition["gte_f"]}
            return True, evidence
        if "gte" in condition and value >= float(condition["gte"]):
            evidence = {"measurement": key, "value": value, "threshold": condition["gte"]}
            return True, evidence
        if "lte" in condition and value <= float(condition["lte"]):
            evidence = {"measurement": key, "value": value, "threshold": condition["lte"]}
            return True, evidence
        return False, evidence

    if "duration_days_gte" in condition:
        duration = extraction.get("duration_days")
        if duration is None:
            return False, evidence
        try:
            days = float(duration)
        except (TypeError, ValueError):
            return False, evidence
        if days >= float(condition["duration_days_gte"]):
            evidence = {"duration_days": days, "threshold": condition["duration_days_gte"]}
            return True, evidence
        return False, evidence

    return False, evidence


def evaluate_safety(rules: list[RuleSpec], extraction: dict) -> SafetyEvaluation:
    """Evaluate configured rules against structured patient information."""
    haystack = _haystack(extraction)
    measurements = _measurements(extraction)
    matched: list[MatchedSignal] = []

    for rule in rules:
        evidence: dict | None = None

        for pattern in rule.match_patterns:
            needle = pattern.strip().lower()
            if needle and needle in haystack:
                evidence = {"matched_pattern": pattern}
                break

        # Clinical regex matching for complex conversational statements
        if evidence is None and rule.code == "CHEST_PAIN":
            if (
                re.search(r"\b(?:seene|chhati)\s+(?:me|mein|re)\b.*?\bdard\b", haystack)
                or re.search(r"\bchest\s+(?:pain|tightness|pressure)\b", haystack)
                or "chest pain" in haystack
            ):
                evidence = {"matched_pattern": "chest pain / seene me dard"}
        elif evidence is None and rule.code == "BREATHING_DIFFICULTY":
            if (
                re.search(r"\bsaans\s+lene\s+(?:me|mein)\b.*?\b(?:takleef|dikkat|pareshani|kashta)\b", haystack)
                or re.search(r"\b(?:breathless|shortness\s+of\s+breath)\b", haystack)
                or "breathing difficulty" in haystack
            ):
                evidence = {"matched_pattern": "breathing difficulty / saans lene me takleef"}

        if evidence is None and rule.field_condition:
            holds, cond_evidence = _condition_holds(rule.field_condition, extraction, measurements)
            if holds:
                evidence = cond_evidence

        if evidence is not None:
            matched.append(
                MatchedSignal(
                    rule_code=rule.code,
                    label=rule.name,
                    message=rule.display_message,
                    priority=rule.target_priority,
                    evidence=evidence,
                    rule_id=rule.rule_id,
                )
            )

    rollup = Priority.ROUTINE
    for signal in matched:
        if _LADDER.index(signal.priority) > _LADDER.index(rollup):
            rollup = signal.priority

    return SafetyEvaluation(signals=matched, priority=rollup, rules_evaluated=len(rules))
