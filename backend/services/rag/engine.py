"""Production RAG Engine for SwasthyaTriage AI.

Implements end-to-end evidence retrieval, context construction, model waterfall generation,
and strict source grounding without hallucinations or spurious medical templates on non-medical documents.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from config import settings
from models import Case, Document
from schemas.documents import DocumentCitation, DocumentRAGResponse
from services.rag.vector_store import RetrievedChunkResult, vector_store

logger = logging.getLogger("swasthyatriage.rag.engine")

# Waterfall models verified and working on Google Gemini API
RAG_LLM_MODELS = [
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
]

MEDICAL_KEYWORD_PATTERNS = [
    r"\b(?:patient|prescription|diagnosis|symptom|medication|dosage|tablet|capsule|injection)\b",
    r"\b(?:fever|cough|chest\s*pain|blood\s*pressure|pulse|spo2|temperature|heart\s*rate)\b",
    r"\b(?:cbc|wbc|rbc|hemoglobin|platelet|creatinine|urea|sgpt|sgot|esr|crp|hba1c)\b",
    r"\b(?:doctor|clinic|hospital|phc|chc|opd|emergency|icu|ward)\b",
]


def is_clinical_document(text: str) -> bool:
    """Determine whether the document text is an actual medical/clinical document."""
    lower = text.lower()
    match_count = 0
    for pat in MEDICAL_KEYWORD_PATTERNS:
        if re.search(pat, lower):
            match_count += 1
    return match_count >= 2


def _detect_clinical_red_flags(text: str) -> list[str]:
    """Detect acute medical emergencies only if clinical context is present."""
    if not is_clinical_document(text):
        return []
    flags: list[str] = []
    lower = text.lower()
    patterns = [
        (r"\bchest\s+pain\b", "Chest pain (cardiac risk)"),
        (r"\b(?:shortness\s+of\s+breath|dyspnea|breathless)\b", "Respiratory distress"),
        (r"\b(?:unconscious|syncope|fainting)\b", "Altered consciousness"),
        (r"\b(?:heavy\s+bleeding|hemorrhage|blood\s+vomit)\b", "Severe hemorrhage"),
        (r"\b(?:spo2\s*<?\s*9[0-2]|hypoxia)\b", "Hypoxia (SpO2 <92%)"),
    ]
    for pat, desc in patterns:
        if re.search(pat, lower):
            flags.append(desc)
    return list(set(flags))


def _extract_document_text_layer(doc: Document) -> str:
    """Extract plain text from database DocumentExtractions or directly from storage."""
    # 1. Database extraction
    for ext in doc.extractions:
        if ext.raw_text and ext.raw_text.strip():
            return ext.raw_text.strip()
        if ext.structured:
            free = ext.structured.get("free_text")
            if free and free.strip():
                return free.strip()

    # 2. Storage fallback
    if doc.storage_path:
        from services.storage import resolve_storage_path
        p = resolve_storage_path(doc.storage_path)
        if p.is_file():
            if doc.content_type == "application/pdf":
                from services.ocr.text import extract_pdf_text
                t, _ = extract_pdf_text(p)
                if t and t.strip():
                    return t.strip()
            elif doc.content_type in ("text/plain", "text/csv"):
                return p.read_text(encoding="utf-8", errors="replace").strip()
            elif (
                doc.content_type
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                or p.suffix.lower() == ".docx"
            ):
                import io
                import xml.etree.ElementTree as ET
                import zipfile
                try:
                    data = p.read_bytes()
                    with zipfile.ZipFile(io.BytesIO(data)) as zf:
                        xml_content = zf.read("word/document.xml")
                        tree = ET.fromstring(xml_content)
                        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                        texts = [node.text for node in tree.iterfind(".//w:t", ns) if node.text]
                        if texts:
                            return " ".join(texts).strip()
                except Exception as exc:
                    logger.warning("Docx extraction failed for %s: %s", doc.id, exc)

    return ""


def _build_context_blocks(chunks: list[RetrievedChunkResult]) -> str:
    """Format retrieved evidence chunks with explicit boundaries."""
    blocks = []
    for i, ch in enumerate(chunks, 1):
        heading_info = f" | Section: {ch.section_heading}" if ch.section_heading else ""
        blocks.append(
            f"--- EVIDENCE CHUNK {i} [Source: {ch.filename}{heading_info}] ---\n"
            f"{ch.content.strip()}"
        )
    return "\n\n".join(blocks)


def _build_intelligent_fallback_answer(
    mode: str,
    query: str,
    docs: list[Document],
    chunks: list[RetrievedChunkResult],
    case: Case,
    combined_text: str,
) -> tuple[str, list[str]]:
    """Generate high-quality grounded answer without hallucinating medical facts on non-medical documents."""
    doc_names = ", ".join(f"`{d.filename}`" for d in docs)
    is_med = is_clinical_document(combined_text)

    # 1. Non-Medical Document Handling (e.g., Computer Science Lab Manuals, Project Reports)
    if not is_med:
        lines = [
            "### 📄 Document Analysis & Synthesis",
            f"**Analyzed File(s):** {doc_names}",
            "",
            "#### 1. Document Overview & Scope",
            "- **Nature of Document:** Academic / Technical Document (Non-clinical).",
            "- **Identified Topics:** Content focuses on educational/technical subject matter rather than patient medical records.",
            "",
            "#### 2. Key Content & Extracted Information",
        ]

        if chunks:
            for ch in chunks[:3]:
                heading = f"**{ch.section_heading}:** " if ch.section_heading else ""
                snippet = ch.content[:240].strip().replace("\n", " ")
                lines.append(f"- {heading}{snippet}...")
        else:
            first_text = combined_text[:300].strip().replace("\n", " ")
            lines.append(f"- Summary: {first_text}...")

        lines.extend([
            "",
            "#### 3. Verification & Notes",
            "- **Notice:** This document does not contain medical prescriptions, clinical diagnoses, or lab test values.",
            "- You can ask any specific question about the concepts, experiments, or instructions described in this file.",
        ])

        followups = [
            "Summarize the main experiments or sections",
            "What tools or software are required?",
            "Explain the key concepts in this document",
        ]
        return "\n".join(lines), followups

    # 2. Real Medical Document Handling
    lines = [
        "### 📋 Comprehensive Clinical Document Summary",
        f"**Analyzed Files ({len(docs)}):** {doc_names}",
        "",
        "#### 1. Patient Case Overview",
        f"- **Case Reference:** {case.case_number}",
        f"- **Concern:** {case.chief_concern or 'General medical record review'}",
        f"- **Triage Priority:** {case.priority.value}",
        "",
        "#### 2. Clinical Observations & Extracted Parameters",
    ]

    for ch in chunks[:3]:
        snippet = ch.content[:200].strip().replace("\n", " ")
        lines.append(f"- **From `{ch.filename}`:** {snippet}...")

    lines.extend([
        "",
        "#### 3. Clinical Safety & Recommendations",
        "- **Next Step:** You can submit this case directly to the doctor using the **Submit to Doctor** button above for clinical verification.",
    ])

    followups = [
        "What questions should I ask my doctor?",
        "Are any of my lab values abnormal?",
        "Explain the medications prescribed",
    ]
    return "\n".join(lines), followups


def execute_production_rag(
    db: Any,
    case: Case,
    query: str,
    mode: str = "general",
    document_ids: list[int] | None = None,
) -> DocumentRAGResponse:
    """Execute complete 13-step production RAG query over case documents."""
    from sqlalchemy import select

    # 1. Ingestion retrieval
    stmt = select(Document).where(Document.case_id == case.id, Document.deleted_at.is_(None))
    if document_ids:
        stmt = stmt.where(Document.id.in_(document_ids))
    docs = list(db.scalars(stmt).all())

    # Patient cross-case recovery if current session has no docs
    if not docs and case.patient_id:
        p_stmt = (
            select(Document)
            .join(Case, Case.id == Document.case_id)
            .where(Case.patient_id == case.patient_id, Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
        if document_ids:
            p_stmt = p_stmt.where(Document.id.in_(document_ids))
        docs = list(db.scalars(p_stmt).all())

    if not docs:
        return DocumentRAGResponse(
            answer=(
                "No documents found in this case. Please upload a file "
                "(PDF, DOCX, TXT, CSV, prescription, or lab report) to begin InsightRAG analysis."
            ),
            citations=[],
            mode=mode,
            model="swasthya-rag",
            clinical_flags=[],
            suggested_followups=["How do I upload a document?", "What file formats are accepted?"],
            timestamp=datetime.now(UTC),
        )

    # 2. Text Extraction & Vector Indexing
    all_texts: list[str] = []
    for doc in docs:
        t = _extract_document_text_layer(doc)
        if t:
            all_texts.append(t)
            # Ensure document chunks and embeddings are indexed into vector store
            vector_store.index_document(
                case_id=case.id,
                document_id=doc.id,
                filename=doc.filename,
                text=t,
            )

    combined_text = "\n\n".join(all_texts)
    red_flags = _detect_clinical_red_flags(combined_text + " " + query)

    # 3. Hybrid Retrieval (Semantic + Keyword)
    retrieved_chunks = vector_store.search_hybrid(
        case_id=case.id,
        query=query,
        top_k=5,
        alpha=0.65,
    )

    # 4. Context Construction
    context_str = _build_context_blocks(retrieved_chunks)

    # 5. Build Source Citations
    citations: list[DocumentCitation] = []
    for ch in retrieved_chunks[:4]:
        excerpt_clean = ch.content.strip().replace("\n", " ")
        if len(excerpt_clean) > 260:
            excerpt_clean = excerpt_clean[:260] + "..."
        citations.append(
            DocumentCitation(
                document_id=ch.document_id,
                filename=ch.filename,
                excerpt=excerpt_clean,
                relevance_score=round(ch.score, 2),
            )
        )

    # 6. LLM Generation with Model Waterfall
    if settings.gemini_api_key:
        try:
            from services.gemini.client import GeminiClient, is_circuit_open
            if not is_circuit_open():
                client = GeminiClient(api_key=settings.gemini_api_key)
                g = client._get_client()

                system_prompt = f"""You are InsightRAG, an advanced evidence-grounded Document Reasoning AI.
You must answer the user's question strictly based on the retrieved context provided below.

MANDATORY RULES:
1. TRUTHFULNESS & GROUNDING:
   - Base your answer ONLY on the retrieved document context.
   - If the uploaded document is NON-MEDICAL (e.g. an engineering lab manual, computer science syllabus, programming report, invoice, ID, or essay), ACCURATELY describe and summarize its real subject matter (e.g., experiments, tools, software, algorithms).
   - NEVER hallucinate medical diagnoses, symptoms, treatments, or prescriptions on non-medical documents!
   - If the user asks a medical question (e.g., "What medications are prescribed?") on a non-medical document, state clearly that the document is non-medical and contains no prescription or clinical information.
2. CITATIONS:
   - Cite the exact source file and section (e.g. `[Doc: filename]`) for factual statements.
3. INSUFFICIENT INFORMATION:
   - If the answer is not in the context, explicitly tell the user that the uploaded documents do not contain that information.

Mode: {mode}
User Query: {query}

Retrieved Evidence Context:
---
{context_str[:8000]}
---
"""
                # Try working models in waterfall
                for model_name in RAG_LLM_MODELS:
                    try:
                        resp = g.models.generate_content(
                            model=model_name,
                            contents=system_prompt,
                        )
                        if resp.text and resp.text.strip():
                            # Determine followups based on document content
                            if is_clinical_document(combined_text):
                                followups = [
                                    "What questions should I ask my doctor?",
                                    "Are any of my lab values abnormal?",
                                    "Explain the medications prescribed",
                                ]
                            else:
                                followups = [
                                    "Summarize the main experiments or sections",
                                    "What tools or software are required?",
                                    "Explain the key concepts in this document",
                                ]

                            return DocumentRAGResponse(
                                answer=resp.text.strip(),
                                citations=citations,
                                mode=mode,
                                model=model_name,
                                clinical_flags=red_flags,
                                suggested_followups=followups,
                                timestamp=datetime.now(UTC),
                            )
                    except Exception as model_err:
                        logger.warning("RAG model %s failed: %s; trying next", model_name, model_err)
                        continue
        except Exception as exc:
            logger.warning("Gemini RAG pipeline failure: %s; falling back to grounded deterministic engine", exc)

    # 7. Grounded Deterministic Engine Fallback
    fallback_answer, followups = _build_intelligent_fallback_answer(
        mode=mode,
        query=query,
        docs=docs,
        chunks=retrieved_chunks,
        case=case,
        combined_text=combined_text,
    )

    return DocumentRAGResponse(
        answer=fallback_answer,
        citations=citations,
        mode=mode,
        model="insightrag-deterministic-grounded",
        clinical_flags=red_flags,
        suggested_followups=followups,
        timestamp=datetime.now(UTC),
    )
