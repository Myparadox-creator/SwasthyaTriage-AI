"""Privacy & data-protection endpoints.

Implements the patient-facing data rights — access (export), erasure, and
consent withdrawal — plus the retention policy view and an admin purge trigger.
All actions are audited.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from config import settings
from database.session import get_db
from middleware.errors import NotFoundError
from models import Consent, Patient, User
from models.enums import ConsentStatus, Role
from schemas.privacy import (
    ConsentListResponse,
    ConsentOut,
    ConsentRevokeResponse,
    DataErasureRequest,
    DataErasureResponse,
    PrivacyPolicyResponse,
    RetentionPurgeResponse,
)
from services.audit import AuditAction, record_audit
from services.privacy.erasure import erase_patient_data
from services.privacy.export import build_patient_export
from services.privacy.redaction import REDACTABLE_PATTERNS_SUMMARY
from services.privacy.retention import purge_expired_data, retention_policy

logger = logging.getLogger("swasthyatriage.privacy")

router = APIRouter(prefix="/api/privacy", tags=["privacy"])


def _get_patient(db: Session, user: User) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.user_id == user.id))
    if patient is None:
        raise NotFoundError("No patient profile is linked to this account")
    return patient


@router.get("/policy", response_model=PrivacyPolicyResponse)
def get_privacy_policy() -> PrivacyPolicyResponse:
    """Public summary of how data is handled — no authentication required."""
    return PrivacyPolicyResponse(
        environment=settings.environment,
        pii_redaction={
            "summary": "Personal identifiers are masked in logs and AI payloads.",
            "patterns": REDACTABLE_PATTERNS_SUMMARY,
        },
        retention=retention_policy(),
        rights={
            "access": "GET /api/privacy/me/export — download all your data as JSON.",
            "erasure": "POST /api/privacy/me/erasure — irreversibly erase your data.",
            "consent_withdrawal": "POST /api/privacy/consents/{id}/revoke",
        },
        controllers={
            "app": settings.app_name,
            "contact": settings.email_reply_to,
        },
    )


@router.get("/me/consents", response_model=ConsentListResponse)
def list_my_consents(
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> ConsentListResponse:
    patient = _get_patient(db, user)
    consents = db.scalars(
        select(Consent)
        .where(Consent.patient_id == patient.id)
        .order_by(Consent.recorded_at.desc())
    ).all()
    items = [ConsentOut.model_validate(c) for c in consents]
    return ConsentListResponse(items=items, total=len(items))


@router.post("/consents/{consent_id}/revoke", response_model=ConsentRevokeResponse)
def revoke_consent(
    consent_id: int,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    patient = _get_patient(db, user)
    consent = db.scalar(
        select(Consent).where(Consent.id == consent_id, Consent.patient_id == patient.id)
    )
    if consent is None:
        raise NotFoundError("Consent record not found")

    if consent.status == ConsentStatus.REVOKED:
        return ConsentRevokeResponse(
            id=consent.id,
            status=ConsentStatus.REVOKED,
            message="This consent was already withdrawn.",
        )

    consent.status = ConsentStatus.REVOKED
    record_audit(
        db,
        AuditAction.CONSENT_REVOKED,
        user=user,
        facility_id=patient.facility_id,
        metadata={"consent_id": consent.id, "case_id": consent.case_id},
    )
    db.commit()
    return ConsentRevokeResponse(
        id=consent.id,
        status=ConsentStatus.REVOKED,
        message="Consent withdrawn. You can re-consent at any time.",
    )


@router.get("/me/export")
def export_my_data(
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    """Download everything held about the signed-in patient as a JSON file."""
    patient = _get_patient(db, user)
    bundle = build_patient_export(db, patient)

    record_audit(
        db,
        AuditAction.DATA_EXPORTED,
        user=user,
        case=None,
        facility_id=patient.facility_id,
        metadata={"patient_id": patient.id, "cases": len(bundle.get("cases", []))},
    )
    db.commit()

    filename = (
        f"swasthyatriage-data-export-{patient.id}-"
        f"{datetime.now(UTC).strftime('%Y%m%d')}.json"
    )
    payload = json.dumps(bundle, ensure_ascii=False, indent=2)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/me/erasure", response_model=DataErasureResponse)
def request_data_erasure(
    payload: DataErasureRequest,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    """Irreversibly erase the patient's personal data (see services.privacy.erasure)."""
    patient = _get_patient(db, user)
    patient_id = patient.id

    report = erase_patient_data(db, patient)
    record_audit(
        db,
        AuditAction.DATA_ERASED,
        user=user,
        facility_id=patient.facility_id,
        metadata=report.as_dict(),
    )
    db.commit()

    logger.info("Patient data erased for patient_id=%s", patient_id)
    return DataErasureResponse(
        ok=True,
        message=(
            "Your personal data has been erased and your account deactivated. "
            "Clinical records required for care and audit are retained in "
            "pseudonymised form."
        ),
        details=report.as_dict(),
    )


@router.get("/me/consents/{consent_id}", response_model=ConsentOut)
def get_consent(
    consent_id: int,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
):
    patient = _get_patient(db, user)
    consent = db.scalar(
        select(Consent).where(Consent.id == consent_id, Consent.patient_id == patient.id)
    )
    if consent is None:
        raise NotFoundError("Consent not found")
    return ConsentOut.model_validate(consent)


@router.post("/admin/retention/purge", response_model=RetentionPurgeResponse)
def run_retention_purge(
    user: User = Depends(require_roles(Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    """Delete expired credentials and stale operational records (idempotent)."""
    report = purge_expired_data(db)
    record_audit(
        db,
        AuditAction.RETENTION_PURGED,
        user=user,
        metadata=report.as_dict(),
        commit=True,
    )
    logger.info("Retention purge completed: removed=%s", report.total)
    return RetentionPurgeResponse(
        ok=True,
        message=f"Retention purge removed {report.total} record(s).",
        removed=report.as_dict(),
    )
