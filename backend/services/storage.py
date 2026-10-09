"""Local file storage for uploaded reports with strict validation.

Files are written to a per-year/month directory under the configured storage
root. The database only stores a relative key — the absolute path is resolved
at read time and is guaranteed to stay inside the storage root.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from config import settings
from middleware.errors import AppError

# accepted content types: {content_type: (allowed extensions, magic bytes)}
ALLOWED_UPLOADS: dict[str, tuple[tuple[str, ...], bytes]] = {
    "application/pdf": ((".pdf",), b"%PDF-"),
    "image/jpeg": ((".jpg", ".jpeg"), b"\xff\xd8\xff"),
    "image/png": ((".png",), b"\x89PNG\r\n\x1a\n"),
}


def detect_magic(data: bytes) -> tuple[str, bytes] | None:
    """Detect the real file type from its magic bytes (never trust the client)."""
    for ctype, (_exts, magic) in ALLOWED_UPLOADS.items():
        if data[: len(magic)] == magic:
            return ctype, magic
    return None


def validate_upload(filename: str, content_type: str | None, data: bytes) -> str:
    """Validate an upload. Returns the normalized content type."""
    if len(data) == 0:
        raise AppError("Uploaded file is empty", status_code=422, code="empty_upload")

    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise AppError(
            f"File exceeds the {settings.max_upload_mb} MB limit",
            status_code=413,
            code="file_too_large",
        )

    detected = detect_magic(data)
    if detected is None:
        raise AppError(
            "Unsupported file type. Upload a PDF, JPG or PNG.",
            status_code=415,
            code="unsupported_file_type",
        )
    ctype, _magic = detected

    if content_type and content_type != ctype:
        raise AppError(
            "File content does not match its declared type",
            status_code=422,
            code="type_mismatch",
        )

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_UPLOADS[ctype][0]:
        raise AppError("Unsupported file extension", status_code=422, code="unsupported_extension")

    return ctype


def save_upload(data: bytes, filename: str) -> str:
    """Persist an upload under the storage root. Returns the relative key."""
    now = datetime.now(UTC)
    year, month = now.strftime("%Y"), now.strftime("%m")
    ext = Path(filename).suffix.lower() or ".bin"
    rel = Path("uploads") / year / month / f"{uuid.uuid4().hex}{ext}"
    target = settings.storage_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return rel.as_posix()


def resolve_storage_path(key: str) -> Path:
    """Resolve a stored key to an absolute path, rejecting path traversal."""
    root = settings.storage_root.resolve()
    candidate = (root / key).resolve()
    if not candidate.is_relative_to(root):
        raise AppError("Invalid storage path", status_code=500, code="invalid_storage_path")
    return candidate
