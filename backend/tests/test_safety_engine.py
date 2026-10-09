"""Deterministic Safety Engine — pure unit tests (no DB, no network, no LLM)."""

from __future__ import annotations

from models.enums import Priority
from services.safety.engine import RuleSpec, evaluate_safety


def make_rule(
    code: str,
    patterns: list[str] | None = None,
    condition: dict | None = None,
    priority: Priority = Priority.REVIEW_REQUIRED,
) -> RuleSpec:
    return RuleSpec(
        code=code,
        name=f"Rule {code}",
        match_patterns=patterns or [],
        target_priority=priority,
        display_message=f"Configured signal: {code}.",
        field_condition=condition,
    )


def test_matches_symptom_term_case_insensitive():
    rule = make_rule("CHEST_PAIN", ["chest pain", "seene me dard"], priority=Priority.URGENT_REVIEW)
    result = evaluate_safety([rule], {"symptoms": [{"term": "Chest Pain"}], "free_text": ""})
    assert len(result.signals) == 1
    assert result.signals[0].rule_code == "CHEST_PAIN"
    assert result.priority == Priority.URGENT_REVIEW


def test_matches_free_text_in_odiya():
    rule = make_rule("BREATHING_DIFFICULTY", ["sweas asuchi"], priority=Priority.URGENT_REVIEW)
    result = evaluate_safety([rule], {"symptoms": [], "free_text": "dui dina se sweas asuchi"})
    assert result.signals[0].rule_code == "BREATHING_DIFFICULTY"


def test_no_match_when_absent():
    rule = make_rule("CHEST_PAIN", ["chest pain"])
    result = evaluate_safety([rule], {"symptoms": [{"term": "fever"}], "free_text": "body ache"})
    assert result.signals == []
    assert result.priority == Priority.ROUTINE


def test_temperature_celsius_converted_and_threshold():
    rule = make_rule(
        "HIGH_FEVER",
        condition={"measurement": "temperature", "gte_f": 103},
        priority=Priority.URGENT_REVIEW,
    )
    result = evaluate_safety(
        [rule],
        {"symptoms": [], "measurements": [{"name": "temperature", "value": "39.6", "unit": "°C"}]},
    )
    assert result.signals[0].rule_code == "HIGH_FEVER"
    assert result.signals[0].evidence["measurement"] == "temperature_f"

    ok = evaluate_safety(
        [rule],
        {"symptoms": [], "measurements": [{"name": "temperature", "value": "100", "unit": "°F"}]},
    )
    assert ok.signals == []


def test_duration_days_condition():
    rule = make_rule("SYMPTOMS_OVER_7_DAYS", condition={"duration_days_gte": 7})
    hit = evaluate_safety([rule], {"symptoms": [], "duration_days": 10})
    assert hit.signals[0].rule_code == "SYMPTOMS_OVER_7_DAYS"
    miss = evaluate_safety([rule], {"symptoms": [], "duration_days": 2})
    assert miss.signals == []


def test_missing_measurement_does_not_fire():
    rule = make_rule("HIGH_FEVER", condition={"measurement": "temperature", "gte_f": 103})
    result = evaluate_safety([rule], {"symptoms": [{"term": "fever"}]})
    assert result.signals == []


def test_rollup_urgent_wins_over_review():
    rules = [
        make_rule("PERSISTENT_VOMITING", ["vomiting"], Priority.REVIEW_REQUIRED),
        make_rule("CHEST_PAIN", ["chest pain"], priority=Priority.URGENT_REVIEW),
    ]
    result = evaluate_safety([rule for rule in rules], {"symptoms": ["vomiting", "chest pain"]})
    assert {s.rule_code for s in result.signals} == {"PERSISTENT_VOMITING", "CHEST_PAIN"}
    assert result.priority == Priority.URGENT_REVIEW


def test_multiple_hits_and_counted_rules():
    rules = [
        make_rule("A", ["a"], Priority.REVIEW_REQUIRED),
        make_rule("B", ["b"]),
        make_rule("C", ["zzz not present"]),
    ]
    result = evaluate_safety(rules, {"symptoms": ["a", "b"]})
    assert len(result.signals) == 2
    assert result.rules_evaluated == 3
