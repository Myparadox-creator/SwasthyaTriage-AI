"""PII detection and redaction.

The goal is conservative, high-precision masking of *direct identifiers*
(phone numbers, email addresses and Aadhaar numbers) in free text, log lines
and nested payloads. It deliberately does **not** try to guess human names —
name detection is low-precision and would corrupt clinical text; person names
are handled by explicit pseudonymisation during erasure instead.

Every replacement is a stable, language-neutral token so downstream text stays
readable and comparable:

    +919876543210      -> [phone]
    user@example.com   -> [email]
    1234 5678 9012     -> [aadhaar]
"""

from __future__ import annotations

import re

# --- Patterns ---------------------------------------------------------------

# Email addresses. Deliberately conservative: something@domain.tld
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}\b"
)

# Indian mobile numbers: optional +91 / 91 / 0 prefix, then a 10-digit
# number beginning 6-9. Grouping separators (- . space) are tolerated between
# any digits so both 98765 43210 and 987-654-3210 are caught.
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?91[\-\s.]?|0[\-\s.]?)?[6-9](?:[\-\s.]?\d){9}(?!\d)"
)

# Aadhaar: 12 digits, optionally grouped 4-4-4. Guarded so it does not also
# match a plain 12-digit run that is part of a longer number.
_AADHAAR_RE = re.compile(r"(?<!\d)\d{4}[\s\-]?\d{4}[\s\-]?\d{4}(?!\d)")

_PHONE_MASK = "[phone]"
_EMAIL_MASK = "[email]"
_AADHAAR_MASK = "[aadhaar]"

# Human-readable list of what this module knows how to redact.
REDACTABLE_PATTERNS_SUMMARY = [
    "Indian phone numbers",
    "email addresses",
    "Aadhaar (12-digit government IDs)",
]


class RedactionCounts:
    """Mutable tally of how many identifiers were masked during a redaction pass."""

    def __init__(self) -> None:
        self.phone = 0
        self.email = 0
        self.aadhaar = 0

    @property
    def total(self) -> int:
        return self.phone + self.email + self.aadhaar

    @property
    def any(self) -> bool:
        return self.total > 0

    def merge(self, other: RedactionCounts) -> None:
        self.phone += other.phone
        self.email += other.email
        self.aadhaar += other.aadhaar

    def as_dict(self) -> dict[str, int]:
        return {
            "phone": self.phone,
            "email": self.email,
            "aadhaar": self.aadhaar,
            "total": self.total,
        }


def redact_text(text: str, counts: RedactionCounts | None = None) -> str:
    """Mask phone numbers, emails and Aadhaar numbers in ``text``.

    Order matters: emails first (a phone-like run inside an address is unlikely,
    but an Aadhaar run inside an email is possible), then phones, then Aadhaar.
    """
    if not text:
        return text

    redacted, n = _EMAIL_RE.subn(_EMAIL_MASK, text)
    if counts is not None:
        counts.email += n

    redacted, n = _PHONE_RE.subn(_PHONE_MASK, redacted)
    if counts is not None:
        counts.phone += n

    redacted, n = _AADHAAR_RE.subn(_AADHAAR_MASK, redacted)
    if counts is not None:
        counts.aadhaar += n

    return redacted


def redact_value(value, counts: RedactionCounts | None = None):
    """Redact PII in a single value, recursing through dicts/list/tuples."""
    if isinstance(value, str):
        return redact_text(value, counts)
    if isinstance(value, dict):
        return redact_mapping(value, counts)
    if isinstance(value, (list, tuple)):
        return [redact_value(item, counts) for item in value]
    return value


def redact_mapping(data: dict, counts: RedactionCounts | None = None) -> dict:
    """Return a copy of ``data`` with PII redacted in every nested string value."""
    if not isinstance(data, dict):
        return data
    return {key: redact_value(val, counts) for key, val in data.items()}


def redact_many(*texts: str | None) -> list[str | None]:
    """Redact a positional list of optional strings, preserving ``None``."""
    return [None if t is None else redact_text(t) for t in texts]


__all__ = [
    "REDACTABLE_PATTERNS_SUMMARY",
    "RedactionCounts",
    "redact_many",
    "redact_mapping",
    "redact_text",
    "redact_value",
]
