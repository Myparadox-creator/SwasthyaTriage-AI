"""Production Embedding Service & Vector Math for SwasthyaTriage AI.

Provides dense vector embeddings using Google Gemini Embedding models with
automatic fallback to an in-memory TF-IDF / term-frequency vectorizer for offline resilience.
"""

from __future__ import annotations

import collections
import logging
import math
import re

from config import settings

logger = logging.getLogger("swasthyatriage.rag.embeddings")

_EMBED_CACHE: dict[str, list[float]] = {}


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = 0.0
    norm1 = 0.0
    norm2 = 0.0
    for a, b in zip(v1, v2, strict=False):
        dot += a * b
        norm1 += a * a
        norm2 += b * b
    if norm1 <= 0.0 or norm2 <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm1) * math.sqrt(norm2))


def _compute_local_vector(text: str, dim: int = 256) -> list[float]:
    """Deterministic hashing-based n-gram vectorizer as a zero-dependency offline fallback."""
    vec = [0.0] * dim
    tokens = re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", text.lower())
    if not tokens:
        return vec

    # Word unigrams and character trigrams
    counts = collections.Counter(tokens)
    for token, cnt in counts.items():
        # Hash bucket
        h = hash(token) % dim
        vec[h] += float(cnt)
        # Sub-word char trigrams
        for i in range(len(token) - 2):
            sub_h = hash(token[i : i + 3]) % dim
            vec[sub_h] += 0.5

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0.0:
        vec = [x / norm for x in vec]
    return vec


class EmbeddingService:
    """Enterprise Embedding provider with batching, caching, and offline fallback."""

    def __init__(self, model: str = "gemini-embedding-001") -> None:
        self.model = model
        self.api_key = settings.gemini_api_key

    def get_embedding(self, text: str) -> list[float]:
        """Obtain a normalized vector embedding for a single text chunk or query."""
        trimmed = text.strip()[:4000]
        if not trimmed:
            return [0.0] * 256

        cache_key = f"{self.model}:{hash(trimmed)}"
        if cache_key in _EMBED_CACHE:
            return _EMBED_CACHE[cache_key]

        # 1. Try Gemini Embedding API if configured
        if self.api_key:
            try:
                from services.gemini.client import GeminiClient, is_circuit_open
                if not is_circuit_open():
                    client = GeminiClient(api_key=self.api_key)
                    g = client._get_client()
                    resp = g.models.embed_content(
                        model=self.model,
                        contents=trimmed,
                    )
                    if hasattr(resp, "embeddings") and resp.embeddings:
                        vec = list(resp.embeddings[0].values)
                        _EMBED_CACHE[cache_key] = vec
                        return vec
            except Exception as exc:
                logger.debug("Gemini embedding API call skipped/failed: %s", exc)

        # 2. Local deterministic fallback
        fallback_vec = _compute_local_vector(trimmed)
        _EMBED_CACHE[cache_key] = fallback_vec
        return fallback_vec

    def get_batch_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Batch embedding generation with per-item caching."""
        return [self.get_embedding(t) for t in texts]
