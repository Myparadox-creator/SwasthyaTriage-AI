"""Document text extraction.

PDFs with a real text layer are extracted locally with pypdf. Image/scan
documents have no text layer — they are stored as-is and flagged for the
Gemini Vision pipeline (Phase 6 AI services) when a key is configured.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("swasthyatriage.ocr")

MAX_EXTRACTED_CHARS = 200_000


def extract_pdf_text(path: Path) -> tuple[str | None, str | None]:
    """Extract a PDF's text layer.

    Returns (text, error). ``text`` is None when the page has no extractable
    text (a scan); ``error`` is set when the PDF cannot be read at all.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text)
        combined = "\n".join(parts).strip()
        if not combined:
            return None, None
        return combined[:MAX_EXTRACTED_CHARS], None
    except Exception as exc:  # pypdf is best-effort; failure means unreadable
        logger.warning("PDF text extraction failed: %s", exc)
        return None, f"Could not read PDF text layer: {exc}"
