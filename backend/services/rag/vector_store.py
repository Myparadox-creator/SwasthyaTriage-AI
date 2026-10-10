"""Persistent Vector Store and Hybrid Retrieval Engine for SwasthyaTriage AI.

Implements document-level isolation, persistent chunk indexing, and hybrid retrieval
combining dense cosine similarity with BM25 lexical keyword scoring.
"""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import settings
from services.rag.chunking import chunk_document_text
from services.rag.embeddings import EmbeddingService, cosine_similarity

logger = logging.getLogger("swasthyatriage.rag.vector_store")


@dataclass
class RetrievedChunkResult:
    chunk_id: str
    document_id: int
    filename: str
    content: str
    chunk_index: int
    score: float
    semantic_score: float
    lexical_score: float
    section_heading: str | None = None
    metadata: dict[str, Any] | None = None


class RAGVectorStore:
    """Persistent Case-Isolated Hybrid Vector Index."""

    def __init__(self, storage_dir: Path | None = None) -> None:
        self.storage_dir = storage_dir or (settings.storage_root / "rag_index")
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.embedder = EmbeddingService()
        self._memory_index: dict[int, list[dict[str, Any]]] = {}

    def _get_case_index_file(self, case_id: int) -> Path:
        return self.storage_dir / f"case_{case_id}.json"

    def _load_index(self, case_id: int) -> list[dict[str, Any]]:
        """Load stored chunks and embeddings for a case."""
        if case_id in self._memory_index:
            return self._memory_index[case_id]

        file_path = self._get_case_index_file(case_id)
        if file_path.is_file():
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                self._memory_index[case_id] = data
                return data
            except Exception as exc:
                logger.warning("Could not read case index %s: %s", case_id, exc)

        self._memory_index[case_id] = []
        return []

    def _save_index(self, case_id: int, records: list[dict[str, Any]]) -> None:
        """Persist index records to disk."""
        self._memory_index[case_id] = records
        file_path = self._get_case_index_file(case_id)
        try:
            file_path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not save case index %s: %s", case_id, exc)

    def index_document(
        self,
        case_id: int,
        document_id: int,
        filename: str,
        text: str,
        force_reindex: bool = False,
    ) -> int:
        """Chunk, embed, and index a document into the case's vector store."""
        records = self._load_index(case_id)

        # Check if document is already indexed
        already_indexed = [r for r in records if r.get("document_id") == document_id]
        if already_indexed and not force_reindex:
            return len(already_indexed)

        # Remove previous chunks if re-indexing
        records = [r for r in records if r.get("document_id") != document_id]

        # 1. Chunk document
        chunks = chunk_document_text(text, document_id, filename)
        if not chunks:
            self._save_index(case_id, records)
            return 0

        # 2. Embed chunks
        new_records: list[dict[str, Any]] = []
        for ch in chunks:
            vec = self.embedder.get_embedding(ch.content)
            # Token set for BM25/keyword scoring
            tokens = list(set(re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", ch.content.lower())))
            rec = {
                "chunk_id": ch.chunk_id,
                "document_id": ch.document_id,
                "filename": ch.filename,
                "content": ch.content,
                "chunk_index": ch.chunk_index,
                "section_heading": ch.section_heading,
                "embedding": vec,
                "tokens": tokens,
                "metadata": ch.metadata or {},
            }
            new_records.append(rec)

        records.extend(new_records)
        self._save_index(case_id, records)
        return len(new_records)

    def delete_document(self, case_id: int, document_id: int) -> None:
        """Remove all chunks associated with a document."""
        records = self._load_index(case_id)
        filtered = [r for r in records if r.get("document_id") != document_id]
        self._save_index(case_id, filtered)

    def search_hybrid(
        self,
        case_id: int,
        query: str,
        top_k: int = 5,
        alpha: float = 0.65,
    ) -> list[RetrievedChunkResult]:
        """Execute hybrid search combining semantic similarity and keyword BM25 scoring."""
        records = self._load_index(case_id)
        if not records:
            return []

        query_tokens = set(re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", query.lower()))
        query_vec = self.embedder.get_embedding(query)

        scored: list[RetrievedChunkResult] = []

        total_chunks = len(records)
        # Compute doc frequency for tokens
        df: dict[str, int] = {}
        for r in records:
            for t in r.get("tokens", []):
                df[t] = df.get(t, 0) + 1

        for r in records:
            # 1. Semantic score
            chunk_vec = r.get("embedding", [])
            sem_score = cosine_similarity(query_vec, chunk_vec) if chunk_vec else 0.0

            # 2. Lexical score (BM25-style IDF overlap)
            chunk_tokens = set(r.get("tokens", []))
            overlap = query_tokens.intersection(chunk_tokens)
            lex_score = 0.0
            if query_tokens:
                idf_sum = sum(
                    math.log(1.0 + (total_chunks - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
                    for t in overlap
                )
                max_idf = sum(
                    math.log(1.0 + (total_chunks + 0.5) / 0.5) for t in query_tokens
                )
                lex_score = idf_sum / max(1e-5, max_idf)
                lex_score = min(1.0, max(0.0, lex_score))

            # 3. Hybrid combined score
            hybrid_score = round(alpha * sem_score + (1.0 - alpha) * lex_score, 4)

            scored.append(
                RetrievedChunkResult(
                    chunk_id=r["chunk_id"],
                    document_id=r["document_id"],
                    filename=r["filename"],
                    content=r["content"],
                    chunk_index=r["chunk_index"],
                    score=hybrid_score,
                    semantic_score=round(sem_score, 4),
                    lexical_score=round(lex_score, 4),
                    section_heading=r.get("section_heading"),
                    metadata=r.get("metadata"),
                )
            )

        # Sort descending by hybrid score
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:top_k]


# Global singleton instance
vector_store = RAGVectorStore()
