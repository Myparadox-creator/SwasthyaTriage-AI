"""Unit tests for the Gemini provider services (offline paths).

No network: the factory resolves to the offline mock because GEMINI_API_KEY is
unset, and the client helpers are exercised directly.
"""

from __future__ import annotations

import pytest

from models import QuestionBankItem
from services.gemini import get_provider
from services.gemini.client import GeminiClient
from services.gemini.errors import ProviderError, ProviderUnavailable
from services.gemini.extraction import DocumentExtractionSchema, ExtractedMeasurement, normalize
from services.gemini.mock import IMAGE_UNAVAILABLE, KEYWORD_NOTE, MockGeminiProvider
from services.gemini.questions import match_bank_for_missing
from services.gemini.summary import render_mock_summary

PNG_1PX = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
    "0000000D49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
)


def test_factory_returns_mock_without_api_key(monkeypatch):
    monkeypatch.setattr("config.settings.gemini_api_key", None)
    assert get_provider().name == "mock"


def test_mock_extracts_from_free_text():
    schema = MockGeminiProvider().extract_document(
        "Fever and cough since two days. Temperature 101 degree F.", filename="report.txt"
    )
    assert "fever" in schema.symptoms
    assert "cough" in schema.symptoms
    assert schema.duration == "2 days"
    assert any(
        m.name == "Temperature" and m.value == "101" and m.unit == "°F" for m in schema.measurements
    )
    assert schema.free_text == "Fever and cough since two days. Temperature 101 degree F."
    assert schema.low_confidence == []
    assert KEYWORD_NOTE in schema.uncertainties


def test_mock_extract_blank_frees_text():
    schema = MockGeminiProvider().extract_document("   ")
    assert schema.symptoms == []
    assert schema.free_text == ""
    assert schema.duration is None


def test_mock_image_fails_honestly():
    with pytest.raises(ProviderUnavailable) as exc_info:
        MockGeminiProvider().extract_image(PNG_1PX, "image/png", filename="scan.png")
    assert str(exc_info.value) == IMAGE_UNAVAILABLE


def test_mock_summary_is_deterministic_and_disclaimers():
    payload = {
        "case_number": "ST-1001",
        "language": "en",
        "status": "IN_REVIEW",
        "priority": "HIGH",
        "chief_concern": "Fever",
        "timeline_text": "since two days",
        "symptoms": [
            {
                "term": "fever",
                "severity": "HIGH",
                "source": "PATIENT_REPORTED",
                "collected_via": "INTELLIGENT",
            }
        ],
        "measurements": [
            {"name": "Temperature", "value": "104", "unit": "°F", "source": "PATIENT_REPORTED"}
        ],
        "answers": [],
        "missing_information": ["Current medication"],
        "submitted_at": "2026-01-01T10:00:00+05:30",
    }
    out = render_mock_summary(payload)
    assert "mock" in out.lower()
    assert "Chief concern" in out
    assert "Not a diagnosis" in out
    assert render_mock_summary(payload) == out


def _bank() -> list[QuestionBankItem]:
    return [
        QuestionBankItem(
            code="medical_history",
            category="history",
            target_field="medical_history",
            text_en="Known medical history?",
        ),
        QuestionBankItem(
            code="current_medication",
            category="medication",
            target_field="current_medication",
            text_en="Current medication?",
        ),
        QuestionBankItem(
            code="duration", category="history", target_field="duration", text_en="How long?"
        ),
    ]


def test_match_bank_for_missing():
    bank = _bank()
    assert [q.code for q in match_bank_for_missing(bank, ["Known medical history"])] == [
        "medical_history"
    ]
    assert [q.code for q in match_bank_for_missing(bank, ["Current medication"])] == [
        "current_medication"
    ]
    assert match_bank_for_missing(bank, ["unknown gap"]) == []
    assert match_bank_for_missing(bank, []) == []


def test_normalize_dedupes_and_caps():
    data = DocumentExtractionSchema(
        symptoms=[" Fever ", "fever", ""],
        measurements=[
            ExtractedMeasurement(name="Temperature", value="101", unit="°F"),
            ExtractedMeasurement(name="Temperature", value="101", unit="°F"),
        ],
    )
    out = normalize(data)
    assert out.symptoms == ["Fever"]
    assert len(out.measurements) == 1
    long = DocumentExtractionSchema(symptoms=["a" * 300], free_text="x" * 9000)
    cleaned = normalize(long)
    assert cleaned.symptoms and len(cleaned.symptoms[0]) <= 120
    assert len(cleaned.free_text) <= 4000


def test_normalize_rejects_bad_input():
    with pytest.raises(ProviderError):
        normalize("not a structure")
    with pytest.raises(ProviderError):
        normalize({"symptoms": "fever"})


def test_client_parse_json_fixing_fences():
    assert GeminiClient._parse_json('{"a": 1}') == {"a": 1}
    assert GeminiClient._parse_json('```json\n{"ok": true}\n```') == {"ok": True}
    with pytest.raises(ProviderError):
        GeminiClient._parse_json("not json at all")
    with pytest.raises(ProviderError):
        GeminiClient._parse_json("[1, 2]")
