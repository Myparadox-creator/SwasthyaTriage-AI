"""Indian phone number normalization and masking for patient callbacks.

Deliberately dependency-free: accepts the common Indian input shapes and
normalizes them to E.164 (+91XXXXXXXXXX). Anything that cannot be normalized
is rejected rather than guessed at.
"""

from __future__ import annotations

import re

_STRIP_RE = re.compile(r"[\s\-().]")
_E164_IN = re.compile(r"^\+91[6-9]\d{9}$")
_BARE_IN = re.compile(r"^[6-9]\d{9}$")


def normalize_indian_phone(raw: str | None) -> str | None:
    """Return an E.164 Indian mobile number, or None when the input is not a valid one.

    Accepts (with optional spaces/dashes/parens):
      9876543210, 09876543210, +919876543210, 919876543210
    Rejects anything else (no silent truncation or country-code guessing).
    """
    digits = _STRIP_RE.sub("", (raw or "").strip())
    if not digits:
        return None

    if digits.startswith("0091"):
        digits = "91" + digits[4:]
    elif digits.startswith("00"):
        digits = digits[2:]

    if digits.startswith("+"):
        return digits if _E164_IN.match(digits) else None

    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    if _BARE_IN.match(digits):
        return f"+91{digits}"
    return None


def mask_phone(phone: str | None) -> str:
    """Mask a phone number, keeping only the last 4 digits for display."""
    if not phone or len(phone) < 4:
        return "****"
    return f"{'*' * (len(phone) - 4)}{phone[-4:]}"
