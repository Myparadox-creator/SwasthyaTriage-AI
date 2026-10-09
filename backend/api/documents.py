"""Document upload, storage and retrieval endpoints.

Uploads are validated by magic bytes (never trusted from the client header),
stored under the configured storage root, and their text layer is extracted
immediately for text PDFs. Structured facts are merged into the case with
provenance AI_EXTRACTED. Image/scans run through the configured provider (mock
fails honestly when no GEMINI_API_KEY is set — it never fabricates OCR).
Every access is recorded in the audit log.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from config import settings
from database.session import get_db
from middleware.errors import NotFoundError
from models import Document, DocumentExtraction, User
from models.enums import DocumentStatus, ExtractionMethod, Provenance
from repositories.cases import get_case_or_403
from schemas.documents import DocumentListResponse, DocumentOut
from services.audit import AuditAction, record_audit
from services.gemini import (
    ProviderError,
    ProviderUnavailable,
    get_provider,
    merge_extraction_into_case,
)
from services.ocr.text import extract_pdf_text
from services.safety.service import reevaluate_case
from services.storage import resolve_storage_path, save_upload, validate_upload

router = APIRouter(prefix="/api/cases", tags=["documents"])


def _get_document_or_404(db: Session, case_id: int, document_id: int) -> Document:
    doc = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.case_id == case_id,
            Document.deleted_at.is_(None),
        )
    )
    if doc is None:
        raise NotFoundError("Document not found")
    return doc


@router.post("/{case_id}/documents", status_code=201, response_model=DocumentOut)
def upload_document(
    case_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    data = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    ctype = validate_upload(file.filename or "upload.bin", file.content_type, data)
    rel = save_upload(data, file.filename or "upload.bin")

    doc = Document(
        case_id=case.id,
        uploaded_by_user_id=user.id,
        filename=Path(file.filename or "report").name[:255],
        content_type=ctype,
        size_bytes=len(data),
        storage_path=rel,
        status=DocumentStatus.UPLOADED,
    )
    db.add(doc)
    db.flush()

    text: str | None = None
    error: str | None = None
    structured: dict | None = None
    extraction_method: ExtractionMethod | None = None
    struct_error: str | None = None
    provider_name: str | None = None
    merged = False

    if ctype == "application/pdf":
        text, error = extract_pdf_text(resolve_storage_path(rel))

    if error:
        doc.status = DocumentStatus.FAILED
        doc.error_detail = error[:500]
    elif text:
        # Text layer present: run structured extraction over it (offline mock
        # reuses the keyword extractor; real Gemini calls the API).
        provider = get_provider()
        provider_name = provider.name
        schema = None
        try:
            schema = provider.extract_document(text, filename=doc.filename)
            structured = schema.model_dump()
        except ProviderError as exc:
            # Non-fatal: the raw text is already usable for review.
            struct_error = str(exc)
        extraction_method = ExtractionMethod.TEXT_LAYER
        db.add(
            DocumentExtraction(
                document_id=doc.id,
                method=ExtractionMethod.TEXT_LAYER,
                raw_text=text,
                structured=structured,
                source=Provenance.AI_EXTRACTED,
                verified=False,
            )
        )
        doc.status = DocumentStatus.PROCESSED
        if schema is not None:
            merged = merge_extraction_into_case(case, schema)
        reevaluate_case(db, case, trigger="document", actor=user, extra_free_text=text)
    else:
        # Image or scanned PDF: real provider path when configured; the
        # offline mock fails honestly instead of fabricating OCR.
        try:
            provider = get_provider()
            provider_name = provider.name
            schema = provider.extract_image(data, ctype, filename=doc.filename)
        except ProviderUnavailable as exc:
            doc.status = DocumentStatus.FAILED
            doc.error_detail = str(exc)[:500]
        except ProviderError as exc:
            doc.status = DocumentStatus.FAILED
            doc.error_detail = f"AI extraction failed: {exc}"[:500]
        else:
            structured = schema.model_dump()
            extraction_method = ExtractionMethod.GEMINI_VISION
            db.add(
                DocumentExtraction(
                    document_id=doc.id,
                    method=ExtractionMethod.GEMINI_VISION,
                    raw_text=schema.free_text or None,
                    structured=structured,
                    source=Provenance.AI_EXTRACTED,
                    verified=False,
                )
            )
            doc.status = DocumentStatus.PROCESSED
            merged = merge_extraction_into_case(case, schema)
            reevaluate_case(
                db, case, trigger="document", actor=user, extra_free_text=schema.free_text
            )

    record_audit(
        db,
        AuditAction.REPORT_UPLOADED,
        user=user,
        case=case,
        metadata={
            "document_id": doc.id,
            "content_type": ctype,
            "size_bytes": len(data),
        },
    )
    if extraction_method is not None:
        record_audit(
            db,
            AuditAction.OCR_PROCESSED,
            user=user,
            case=case,
            metadata={
                "document_id": doc.id,
                "method": extraction_method.value,
                "provider": provider_name,
                "structured": structured is not None,
                **({"structured_error": struct_error} if struct_error else {}),
            },
        )
    if merged:
        record_audit(
            db,
            AuditAction.CASE_UPDATED_BY_EXTRACTION,
            user=user,
            case=case,
            metadata={
                "document_id": doc.id,
                "provider": provider_name,
                "method": extraction_method.value if extraction_method else None,
                "symptoms": structured.get("symptoms") if structured else [],
                "measurements": [
                    f"{m.get('name')} {m.get('value')} {m.get('unit') or ''}".strip()
                    for m in (structured.get("measurements") or [])
                ]
                if structured
                else [],
            },
        )
    db.commit()
    db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.get("/{case_id}/documents", response_model=DocumentListResponse)
def list_documents(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    docs = db.scalars(
        select(Document)
        .where(Document.case_id == case.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
    return DocumentListResponse(
        case_id=case.id,
        case_number=case.case_number,
        items=[DocumentOut.model_validate(d) for d in docs],
    )


@router.get("/{case_id}/documents/{document_id}/file")
def download_document(
    case_id: int,
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_case_or_403(db, user, case_id)
    doc = _get_document_or_404(db, case.id, document_id)
    record_audit(
        db,
        AuditAction.DOCUMENT_VIEWED,
        user=user,
        case=case,
        metadata={"document_id": doc.id, "filename": doc.filename},
    )
    db.commit()

    path = resolve_storage_path(doc.storage_path)
    if not path.is_file():
        raise NotFoundError("File not found on storage")
    return FileResponse(
        path=path,
        media_type=doc.content_type,
        filename=doc.filename,
        content_disposition_type="inline",
    )


@router.delete("/{case_id}/documents/{document_id}", status_code=204)
def delete_document(
    case_id: int,
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    case = get_case_or_403(db, user, case_id)
    doc = _get_document_or_404(db, case.id, document_id)
    doc.deleted_at = datetime.now(UTC)
    record_audit(
        db,
        AuditAction.DOCUMENT_DELETED,
        user=user,
        case=case,
        metadata={"document_id": doc.id, "filename": doc.filename},
    )
    db.commit()
