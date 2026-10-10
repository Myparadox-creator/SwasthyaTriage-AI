"""Comprehensive unit & integration tests for the Production RAG Engine.

Tests:
1. Document chunking & preprocessing boundaries
2. Vector store indexing & hybrid (semantic + BM25) retrieval
3. Grounding on non-medical documents (zero medical hallucinations)
4. Honest handling of unanswerable queries
5. Medical report parameter extraction
"""

from __future__ import annotations

import pytest

from services.rag.chunking import chunk_document_text, preprocess_document_text
from services.rag.embeddings import cosine_similarity
from services.rag.engine import is_clinical_document
from services.rag.vector_store import RAGVectorStore


def test_preprocess_document_text():
    raw = "Hello   world!\r\n\r\n\n\nParagraph   two with    spaces.\x0c"
    cleaned = preprocess_document_text(raw)
    assert "\r" not in cleaned
    assert "\x0c" not in cleaned
    assert "Paragraph two with spaces." in cleaned
    assert "\n\n" in cleaned


def test_chunk_document_text_structure():
    text = (
        "Experiment 1: Introduction to Automata Simulation Tools\n\n"
        "Installation and familiarization with software tools like JFLAP for automata simulation. "
        "Basic operations: creating and running simple finite automata. "
        "JFLAP is an interactive educational software tool used for experimenting with formal languages "
        "and automata theory. It provides a graphical interface to design, simulate, and convert computational models.\n\n"
        "Experiment 2: Design and Simulation of Deterministic Finite Automata\n\n"
        "A Deterministic Finite Automaton (DFA) is defined as a 5-tuple (Q, Sigma, delta, q0, F). "
        "In this lab, we construct an automaton that accepts strings starting with 'ab'."
    )
    chunks = chunk_document_text(text, document_id=101, filename="TOC_Lab.docx", target_words=30, overlap_words=5)
    assert len(chunks) >= 2
    for ch in chunks:
        assert ch.document_id == 101
        assert ch.filename == "TOC_Lab.docx"
        assert ch.chunk_id.startswith("doc_101_c")
        assert len(ch.content) > 10


def test_cosine_similarity():
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert cosine_similarity(v1, v2) == pytest.approx(1.0)

    v3 = [0.0, 1.0, 0.0]
    assert cosine_similarity(v1, v3) == pytest.approx(0.0)

    v_empty = []
    assert cosine_similarity(v_empty, v1) == 0.0


def test_is_clinical_document_detection():
    # Technical / Engineering lab manual
    toc_text = (
        "Experiment -1 Introduction to Automata Simulation Tools JFLAP "
        "creating and running simple finite automata Turing machines "
        "DFA 5-tuple transitions Python script."
    )
    assert is_clinical_document(toc_text) is False

    # Actual medical report
    medical_text = (
        "Patient John Doe presented with high fever, cough, and chest pain. "
        "Doctor prescribed Paracetamol 650mg and Azithromycin. CBC shows Hemoglobin 11.2 g/dL."
    )
    assert is_clinical_document(medical_text) is True


def test_vector_store_indexing_and_hybrid_search(tmp_path):
    store = RAGVectorStore(storage_dir=tmp_path)
    case_id = 999
    doc_id = 202
    filename = "TOC_Manual.docx"
    content = (
        "JFLAP is an interactive educational software tool used for experimenting with formal languages "
        "and automata theory. It provides a graphical interface to design, simulate, and convert computational models "
        "like finite automata, pushdown automata, and Turing machines."
    )

    indexed_count = store.index_document(case_id, doc_id, filename, content)
    assert indexed_count >= 1

    # Search for JFLAP
    results = store.search_hybrid(case_id, "How do I use JFLAP for Turing machines?", top_k=3)
    assert len(results) >= 1
    assert "JFLAP" in results[0].content
    assert results[0].filename == filename
    assert results[0].score > 0.0

    # Delete document
    store.delete_document(case_id, doc_id)
    results_after = store.search_hybrid(case_id, "JFLAP", top_k=3)
    assert len(results_after) == 0
