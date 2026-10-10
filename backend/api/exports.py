"""Export endpoints for authorized healthcare staff and administrators."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from database.session import get_db
from models import User
from models.enums import Role
from services.audit import AuditAction, record_audit
from services.exports.excel import (
    generate_patient_details_excel,
    generate_triage_excel,
)

router = APIRouter(prefix="/api/exports", tags=["exports"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


@router.get("/excel")
@router.get("/cases")
def export_cases_excel(
    facility_id: int | None = Query(default=None),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    """Export complete triage data workbook with Patient Details and clinical sheets to Excel (.xlsx)."""
    excel_stream = generate_triage_excel(db=db, user=user, facility_id=facility_id)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"SwasthyaTriage_Export_{timestamp}.xlsx"

    record_audit(
        db,
        AuditAction.EXCEL_EXPORTED,
        user=user,
        metadata={"filename": filename, "type": "ALL_TRIAGE_SHEETS", "facility_id": facility_id or user.facility_id},
    )
    db.commit()

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/patients")
def export_patients_excel(
    facility_id: int | None = Query(default=None),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    """Export dedicated Patient Details workbook to Excel (.xlsx)."""
    excel_stream = generate_patient_details_excel(db=db, user=user, facility_id=facility_id)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"SwasthyaTriage_Patients_{timestamp}.xlsx"

    record_audit(
        db,
        AuditAction.EXCEL_EXPORTED,
        user=user,
        metadata={"filename": filename, "type": "PATIENT_DETAILS", "facility_id": facility_id or user.facility_id},
    )
    db.commit()

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
