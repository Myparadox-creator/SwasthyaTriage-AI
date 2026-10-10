"""Unit tests for the privacy redaction layer (no DB, no network).

These guard the guarantees the system makes about personal identifiers: phone
numbers, email addresses and Aadhaar numbers must be masked, ordinary clinical
text must pass through untouched.
"""

from services.privacy.redaction import (
    RedactionCounts,
    redact_many,
    redact_mapping,
    redact_text,
    redact_value,
)


def test_redact_phone_number_with_country_code():
    counts = RedactionCounts()
    out = redact_text("Call me on +91 98765 43210 after 6pm.", counts)
    assert "[phone]" in out
    assert "98765" not in out
    assert counts.phone == 1


def test_redact_plain_ten_digit_mobile():
    assert redact_text("Mobile 9876543210 works") == "Mobile [phone] works"


def test_redact_email():
    assert redact_text("Email ramesh.test@example.com now") == "Email [email] now"


def test_redact_aadhaar_grouped_and_plain():
    assert redact_text("Aadhaar 1234 5678 9012 on file") == "Aadhaar [aadhaar] on file"
    assert redact_text("id 123456789012 verified") == "id [aadhaar] verified"


def test_redact_multiple_kinds_in_one_string():
    text = "Reach +919876543210 or ramesh@example.com, Aadhaar 1111 2222 3333"
    counts = RedactionCounts()
    out = redact_text(text, counts)
    assert out == "Reach [phone] or [email], Aadhaar [aadhaar]"
    assert counts.total == 3
    assert counts.any is True


def test_redaction_counters_merge():
    a = RedactionCounts()
    redact_text("9876543210", a)
    b = RedactionCounts()
    redact_text("a@b.com", b)
    a.merge(b)
    assert a.phone == 1
    assert a.email == 1
    assert a.total == 2


def test_clinical_text_without_pii_is_untouched():
    text = "Patient has high fever and dry cough for three days."
    assert redact_text(text) == text


def test_redact_value_walks_nested_structures():
    payload = {
        "contact": "+91 98765 43210",
        "notes": ["call 9876543210", "no pii here"],
        "nested": {"email": "a@b.com"},
        "age": 42,
        "flag": True,
    }
    out = redact_value(payload)
    assert out["contact"] == "[phone]"
    assert out["notes"][0] == "call [phone]"
    assert out["notes"][1] == "no pii here"
    assert out["nested"]["email"] == "[email]"
    assert out["age"] == 42
    assert out["flag"] is True


def test_redact_mapping_returns_copy():
    original = {"phone": "9876543210"}
    out = redact_mapping(original)
    assert out == {"phone": "[phone]"}
    assert original == {"phone": "9876543210"}


def test_redact_many_preserves_none():
    assert redact_many("9876543210", None) == ["[phone]", None]
