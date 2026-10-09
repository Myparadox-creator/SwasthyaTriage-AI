"""Provider protocol + factory.

Real Gemini is used iff `GEMINI_API_KEY` is set; otherwise the honest offline
mock. Callers depend only on the protocol, so tests swap providers by
patching `get_provider`.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from config import settings
from services.gemini.errors import ProviderError, ProviderUnavailable  # noqa: F401
from services.gemini.extraction import DocumentExtractionSchema


@runtime_checkable
class GeminiProvider(Protocol):
    name: str

    def extract_document(self, text: str, *, filename: str = "") -> DocumentExtractionSchema: ...

    def extract_image(
        self, image: bytes, mime: str, *, filename: str = ""
    ) -> DocumentExtractionSchema: ...

    def summarize_case(self, payload: dict) -> str: ...

    def suggest_questions(self, *, candidates: list[str]) -> list[str] | None: ...


def get_provider() -> GeminiProvider:
    if settings.gemini_enabled:
        from services.gemini.client import GeminiClient

        return GeminiClient()
    from services.gemini.mock import MockGeminiProvider

    return MockGeminiProvider()


def provider_label() -> str:
    """Badge value: 'gemini' when configured, 'mock' otherwise."""
    return "gemini" if settings.gemini_enabled else "mock"
