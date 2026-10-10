"""Production Document Chunking and Preprocessing Engine for SwasthyaTriage AI.

Splits ingested document text into semantically cohesive, overlapping chunks
while preserving document structure, headings, and paragraph boundaries.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class DocumentChunk:
    chunk_id: str
    document_id: int
    filename: str
    content: str
    chunk_index: int
    char_start: int
    char_end: int
    section_heading: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


def preprocess_document_text(text: str) -> str:
    """Clean redundant whitespace, extraction artifacts, and normalize line breaks."""
    if not text:
        return ""
    # Normalize carriage returns and form feeds
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x0c", "\n\n")
    # Collapse 3 or more newlines into double newlines (paragraphs)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    # Collapse multiple spaces or tabs into a single space within lines
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.split("\n")]
    # Reassemble paragraphs
    reassembled = "\n".join(lines).strip()
    return reassembled


def _extract_likely_heading(paragraph: str) -> str | None:
    """Identify if the paragraph begins with a clear section heading or experiment label."""
    first_line = paragraph.strip().split("\n")[0].strip()
    if len(first_line) < 80 and (
        re.match(r"^(?:experiment|chapter|section|part|unit|module|table|lab)\s*[-:#\d]", first_line, re.IGNORECASE)
        or re.match(r"^#{1,4}\s+", first_line)
        or (first_line.isupper() and len(first_line) > 3)
    ):
        return first_line.lstrip("#").strip()
    return None


def chunk_document_text(
    text: str,
    document_id: int,
    filename: str,
    target_words: int = 400,
    overlap_words: int = 60,
) -> list[DocumentChunk]:
    """Chunk preprocessed text using sliding-window paragraph and sentence boundaries.

    Ensures natural semantic boundaries instead of naive character slicing,
    preserving headings and experiment/section contexts.
    """
    clean_text = preprocess_document_text(text)
    if not clean_text:
        return []

    # Split into paragraphs
    raw_paragraphs = [p.strip() for p in clean_text.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [clean_text]

    chunks: list[DocumentChunk] = []
    current_words: list[str] = []
    current_char_start = 0
    current_heading: str | None = None
    chunk_index = 0

    running_char_offset = 0

    for para in raw_paragraphs:
        para_heading = _extract_likely_heading(para)
        if para_heading:
            current_heading = para_heading

        para_words = para.split()
        if not para_words:
            continue

        # If adding this paragraph exceeds target words and we already have content:
        if len(current_words) + len(para_words) > target_words and current_words:
            content_str = " ".join(current_words)
            char_end = current_char_start + len(content_str)
            chunk_id = f"doc_{document_id}_c{chunk_index}"

            chunks.append(
                DocumentChunk(
                    chunk_id=chunk_id,
                    document_id=document_id,
                    filename=filename,
                    content=content_str,
                    chunk_index=chunk_index,
                    char_start=current_char_start,
                    char_end=char_end,
                    section_heading=current_heading,
                    metadata={"word_count": len(current_words)},
                )
            )
            chunk_index += 1

            # Sliding window overlap
            if overlap_words > 0 and len(current_words) > overlap_words:
                overlap = current_words[-overlap_words:]
            else:
                overlap = []

            current_words = overlap + para_words
            current_char_start = max(0, char_end - len(" ".join(overlap)))
        else:
            current_words.extend(para_words)

        running_char_offset += len(para) + 2

    # Emit trailing chunk
    if current_words:
        content_str = " ".join(current_words)
        char_end = current_char_start + len(content_str)
        chunk_id = f"doc_{document_id}_c{chunk_index}"
        chunks.append(
            DocumentChunk(
                chunk_id=chunk_id,
                document_id=document_id,
                filename=filename,
                content=content_str,
                chunk_index=chunk_index,
                char_start=current_char_start,
                char_end=char_end,
                section_heading=current_heading,
                metadata={"word_count": len(current_words)},
            )
        )

    return chunks
