"""Gemini/AI provider services (real client + honest offline mock)."""

from services.gemini.base import GeminiProvider, get_provider, provider_label
from services.gemini.errors import ProviderError, ProviderUnavailable
from services.gemini.extraction import DocumentExtractionSchema, normalize
from services.gemini.merge import merge_extraction_into_case

__all__ = [
    "DocumentExtractionSchema",
    "GeminiProvider",
    "ProviderError",
    "ProviderUnavailable",
    "get_provider",
    "merge_extraction_into_case",
    "normalize",
    "provider_label",
]
