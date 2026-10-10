"""Local file storage for uploaded reports with strict validation.

Files are written to a per-year/month directory under the configured storage
root. The database only stores a relative key — the absolute path is resolved
at read time and is guaranteed to stay inside the storage root.
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

from config import settings
from middleware.errors import AppError

logger = logging.getLogger("swasthyatriage.storage")

# accepted content types: {content_type: (allowed extensions, magic bytes)}
ALLOWED_UPLOADS: dict[str, tuple[tuple[str, ...], bytes]] = {
    "application/pdf": ((".pdf",), b"%PDF-"),
    "image/jpeg": ((".jpg", ".jpeg"), b"\xff\xd8\xff"),
    "image/png": ((".png",), b"\x89PNG\r\n\x1a\n"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ((".docx",), b"PK\x03\x04"),
}


def detect_magic(data: bytes, filename: str = "") -> tuple[str, bytes] | None:
    """Detect the real file type from its magic bytes or safe text inspection."""
    for ctype, (_exts, magic) in ALLOWED_UPLOADS.items():
        if data[: len(magic)] == magic:
            return ctype, magic

    ext = Path(filename).suffix.lower()
    if ext in (".txt", ".csv"):
        try:
            head = data[:4096].decode("utf-8")
            if "\x00" not in head:
                ctype = "text/csv" if ext == ".csv" else "text/plain"
                return ctype, b""
        except UnicodeDecodeError:
            pass

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

    detected = detect_magic(data, filename)
    if detected is None:
        raise AppError(
            "Unsupported file type. Upload a PDF, DOCX, TXT, CSV, JPG or PNG.",
            status_code=415,
            code="unsupported_file_type",
        )
    ctype, _magic = detected

    if content_type and content_type != ctype:
        # Allow generic text/plain or octet-stream from clients for txt/csv/docx
        if not (
            (ctype in ("text/plain", "text/csv") and content_type in ("text/plain", "text/csv", "application/octet-stream"))
            or (ctype == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and "word" in content_type)
        ):
            raise AppError(
                "File content does not match its declared type",
                status_code=422,
                code="type_mismatch",
            )

    ext = Path(filename).suffix.lower()
    if ctype in ALLOWED_UPLOADS and ext not in ALLOWED_UPLOADS[ctype][0]:
        raise AppError("Unsupported file extension", status_code=422, code="unsupported_extension")

    return ctype


def _s3_client():
    """Return a boto3 S3 client when the s3 backend is configured, else None.

    Gracefully degrades to local disk (with a warning) when boto3 is missing,
    so a misconfigured deployment still accepts uploads instead of erroring.
    """
    if (settings.storage_backend or "local").lower() != "s3":
        return None
    try:
        import boto3
    except ImportError:  # pragma: no cover - depends on deployment
        logger.warning(
            "STORAGE_BACKEND=s3 but boto3 is not installed; falling back to local disk storage"
        )
        return None
    if not settings.s3_bucket:
        logger.warning("STORAGE_BACKEND=s3 but S3_BUCKET is empty; falling back to local disk")
        return None
    kwargs: dict = {"region_name": settings.s3_region or "us-east-1"}
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    if settings.s3_access_key_id:
        kwargs["aws_access_key_id"] = settings.s3_access_key_id
        kwargs["aws_secret_access_key"] = settings.s3_secret_access_key
    return boto3.client("s3", **kwargs)


def storage_backend_active() -> str:
    return "s3" if _s3_client() is not None else "local"


def _object_key(rel: str) -> str:
    prefix = (settings.s3_prefix or "").strip("/")
    return f"{prefix}/{rel}" if prefix else rel


def save_upload(data: bytes, filename: str) -> str:
    """Persist an upload. Returns the storage key (local path or object key)."""
    now = datetime.now(UTC)
    year, month = now.strftime("%Y"), now.strftime("%m")
    ext = Path(filename).suffix.lower() or ".bin"
    rel = (Path("uploads") / year / month / f"{uuid.uuid4().hex}{ext}").as_posix()

    client = _s3_client()
    if client is not None:
        client.put_object(Bucket=settings.s3_bucket, Key=_object_key(rel), Body=data)
        return rel

    target = settings.storage_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return rel


def resolve_storage_path(key: str) -> Path:
    """Resolve a stored key to an absolute local path, rejecting path traversal."""
    root = settings.storage_root.resolve()
    candidate = (root / key).resolve()
    if not candidate.is_relative_to(root):
        raise AppError("Invalid storage path", status_code=500, code="invalid_storage_path")
    return candidate


def materialize_upload(key: str) -> Path:
    """Return a readable local path for a stored key.

    Local backend returns the on-disk path directly. The s3 backend downloads
    the object to a temporary file so callers that need a Path (e.g. PDF text
    extraction) work unchanged.
    """
    client = _s3_client()
    if client is None:
        return resolve_storage_path(key)
    body = client.get_object(Bucket=settings.s3_bucket, Key=_object_key(key))["Body"].read()
    suffix = Path(key).suffix or ".bin"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(body)
    finally:
        tmp.close()
    return Path(tmp.name)


def read_upload_bytes(key: str) -> bytes:
    """Read an upload's bytes from whichever backend is active."""
    client = _s3_client()
    if client is None:
        return resolve_storage_path(key).read_bytes()
    return client.get_object(Bucket=settings.s3_bucket, Key=_object_key(key))["Body"].read()

