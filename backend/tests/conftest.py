"""Shared pytest configuration.

Tests must never place real outbound phone calls. Force the deterministic mock
telephony provider for every test regardless of the developer's local ``.env``,
so switching ``TELEPHONY_PROVIDER`` to a live provider (videosdk/snapserve)
cannot turn the test-suite into a real dialer.
"""

from __future__ import annotations

import pytest

from config import settings


@pytest.fixture(autouse=True)
def _force_mock_telephony(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "telephony_provider", "mock")
