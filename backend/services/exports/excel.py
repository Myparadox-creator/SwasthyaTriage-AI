"""Excel Export Generator using openpyxl.

Produces structured .xlsx workbooks directly from Neon PostgreSQL records
with role and facility isolation strictly enforced:
- Sheet 1: Patient Details
- Sheet 2: Cases
- Sheet 3: Voice Sessions
- Sheet 4: Follow-ups
- Sheet 5: Referrals
- Sheet 6: Audit Summary
"""

from __future__ import annotations

import io
import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from config import settings
from models import (
    AuditLog,
    Case,
    Facility,
    FollowUp,
    Patient,
    Referral,
    User,
    VoiceSession,
)
from models.enums import Role

logger = logging.getLogger(__name__)
_export_file_lock = threading.Lock()

HEADER_FILL = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
ZEBRA_FILL = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
THIN_BORDER = Border(
    left=Side(style="thin", color="E2E8F0"),
    right=Side(style="thin", color="E2E8F0"),
    top=Side(style="thin", color="E2E8F0"),
    bottom=Side(style="thin", color="E2E8F0"),
)

PATIENT_HEADERS = [
    "Patient ID",
    "Full Name",
    "Age",
    "Gender",
    "Phone Number",
    "Email",
    "Address",
    "Facility",
    "Case ID",
    "Case Number",
    "Chief Concern",
    "Assessment Source",
    "Preferred Language",
    "Triage Priority",
    "Registration Date",
    "Last Updated",
]


def _format_dt(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _sanitize_cell_value(val: Any) -> Any:
    """Neutralize spreadsheet formula injection attacks (=, +, -, @, \\t, \\r)."""
    if isinstance(val, str):
        if val.startswith(("=", "+", "-", "@", "\t", "\r")):
            return "'" + val
    return val


def _style_headers_and_autosize(ws, headers: list[str]) -> None:
    ws.append(headers)
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.row_dimensions[1].height = 26
    ws.freeze_panes = "A2"


def _finalize_sheet(ws) -> None:
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, max_col=ws.max_column):
        is_even = row[0].row % 2 == 0
        for cell in row:
            cell.border = THIN_BORDER
            if is_even:
                cell.fill = ZEBRA_FILL
            cell.alignment = Alignment(vertical="center")

    # Set auto-filter across the populated range
    if ws.max_row >= 1 and ws.max_column >= 1:
        ws.auto_filter.ref = ws.dimensions

    # Autosize columns with safety margins
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)


def build_patient_row_data(
    p: Patient,
    latest_case: Case | None,
    facilities_cache: dict[int, str],
) -> list[Any]:
    fac_id = p.facility_id or (latest_case.facility_id if latest_case else None)
    fac_name = facilities_cache.get(fac_id, "N/A") if fac_id else "N/A"

    email_val = p.user.email if p.user and p.user.email else ""
    pref_lang = (
        p.language.value
        if p.language
        else (latest_case.language.value if latest_case and latest_case.language else "en")
    )

    return [
        p.id,
        _sanitize_cell_value(p.full_name or ""),
        p.age if p.age is not None else "",
        _sanitize_cell_value(p.gender or ""),
        _sanitize_cell_value(p.phone or ""),
        _sanitize_cell_value(email_val),
        _sanitize_cell_value(p.address or ""),
        _sanitize_cell_value(fac_name),
        latest_case.id if latest_case else "",
        latest_case.case_number if latest_case else "",
        _sanitize_cell_value(latest_case.chief_concern or "") if latest_case else "",
        latest_case.source.value if latest_case and latest_case.source else "",
        _sanitize_cell_value(pref_lang),
        latest_case.priority.value if latest_case and latest_case.priority else "",
        _format_dt(p.created_at),
        _format_dt(p.updated_at),
    ]


def build_patient_details_sheet(
    ws,
    db: Session,
    target_facility_id: int | None = None,
    facilities_cache: dict[int, str] | None = None,
) -> None:
    """Populate dedicated Patient Details worksheet from PostgreSQL records."""
    if facilities_cache is None:
        facilities_cache = {}

    _style_headers_and_autosize(ws, PATIENT_HEADERS)

    patient_stmt = select(Patient).options(joinedload(Patient.user))
    if target_facility_id:
        patient_stmt = patient_stmt.where(
            (Patient.facility_id == target_facility_id)
            | (Patient.id.in_(select(Case.patient_id).where(Case.facility_id == target_facility_id)))
        )
    patients = db.scalars(patient_stmt.order_by(Patient.id.asc())).all()

    # Pre-populate facilities cache
    for p in patients:
        if p.facility_id and p.facility_id not in facilities_cache:
            fac = db.get(Facility, p.facility_id)
            facilities_cache[p.facility_id] = fac.name if fac else "N/A"

    for p in patients:
        latest_case = db.scalar(
            select(Case)
            .where(Case.patient_id == p.id)
            .order_by(Case.created_at.desc())
            .limit(1)
        )
        if latest_case and latest_case.facility_id and latest_case.facility_id not in facilities_cache:
            fac = db.get(Facility, latest_case.facility_id)
            facilities_cache[latest_case.facility_id] = fac.name if fac else "N/A"

        row_data = build_patient_row_data(p, latest_case, facilities_cache)
        ws.append(row_data)

    _finalize_sheet(ws)


def generate_triage_excel(
    db: Session,
    user: User,
    facility_id: int | None = None,
) -> io.BytesIO:
    """Generate multi-sheet Excel report respecting user role and facility."""
    target_facility_id = user.facility_id if user.role != Role.SUPER_ADMIN else facility_id

    wb = Workbook()
    wb.remove(wb.active)

    facilities_cache: dict[int, str] = {}
    patients_cache: dict[int, str] = {}

    # ----------------------------------------------------
    # Sheet 1: Patient Details (NEW)
    # ----------------------------------------------------
    ws_patients = wb.create_sheet(title="Patient Details")
    build_patient_details_sheet(
        ws_patients,
        db=db,
        target_facility_id=target_facility_id,
        facilities_cache=facilities_cache,
    )

    # ----------------------------------------------------
    # Sheet 2: Cases
    # ----------------------------------------------------
    ws_cases = wb.create_sheet(title="Cases")
    case_headers = [
        "Case ID",
        "Case Number",
        "Patient Name",
        "Facility",
        "Priority",
        "Status",
        "Source",
        "Language",
        "Chief Concern",
        "Created At",
        "Reviewed At",
    ]
    _style_headers_and_autosize(ws_cases, case_headers)

    case_stmt = select(Case)
    if target_facility_id:
        case_stmt = case_stmt.where(Case.facility_id == target_facility_id)
    cases = db.scalars(case_stmt.order_by(Case.created_at.desc())).all()

    for c in cases:
        if c.facility_id not in facilities_cache:
            fac = db.get(Facility, c.facility_id)
            facilities_cache[c.facility_id] = fac.name if fac else "N/A"
        if c.patient_id not in patients_cache:
            pat = db.get(Patient, c.patient_id)
            patients_cache[c.patient_id] = pat.full_name if pat else "Unknown"

        ws_cases.append([
            c.id,
            c.case_number,
            _sanitize_cell_value(patients_cache.get(c.patient_id, "Unknown")),
            _sanitize_cell_value(facilities_cache.get(c.facility_id, "N/A")),
            c.priority.value if c.priority else "",
            c.status.value if c.status else "",
            c.source.value if c.source else "",
            c.language.value if c.language else "",
            _sanitize_cell_value(c.chief_concern or ""),
            _format_dt(c.created_at),
            _format_dt(c.reviewed_at),
        ])
    _finalize_sheet(ws_cases)

    # ----------------------------------------------------
    # Sheet 3: Voice Sessions
    # ----------------------------------------------------
    ws_voice = wb.create_sheet(title="Voice Sessions")
    voice_headers = [
        "Session Public ID",
        "Case ID",
        "Mode",
        "Status",
        "Language",
        "Provider",
        "Message Count",
        "Started At",
    ]
    _style_headers_and_autosize(ws_voice, voice_headers)

    voice_stmt = select(VoiceSession)
    if target_facility_id:
        voice_stmt = voice_stmt.join(Case, VoiceSession.case_id == Case.id).where(Case.facility_id == target_facility_id)
    voice_sessions = db.scalars(voice_stmt.order_by(VoiceSession.created_at.desc())).all()

    for vs in voice_sessions:
        ws_voice.append([
            vs.public_id,
            vs.case_id or "",
            vs.mode.value if vs.mode else "",
            vs.status.value if vs.status else "",
            vs.language,
            vs.provider,
            len(vs.messages),
            _format_dt(vs.started_at),
        ])
    _finalize_sheet(ws_voice)

    # ----------------------------------------------------
    # Sheet 4: Follow-ups
    # ----------------------------------------------------
    ws_fu = wb.create_sheet(title="Follow-ups")
    fu_headers = [
        "Follow-up ID",
        "Case ID",
        "Channel",
        "Status",
        "Reason",
        "Questions/Items",
        "Result Summary",
        "Completed At",
    ]
    _style_headers_and_autosize(ws_fu, fu_headers)

    fu_stmt = select(FollowUp)
    if target_facility_id:
        fu_stmt = fu_stmt.join(Case, FollowUp.case_id == Case.id).where(Case.facility_id == target_facility_id)
    followups = db.scalars(fu_stmt.order_by(FollowUp.created_at.desc())).all()

    for fu in followups:
        fu_summary_str = ""
        if isinstance(fu.result_summary, dict):
            answers = fu.result_summary.get("answers")
            if isinstance(answers, dict):
                fu_summary_str = ", ".join(f"{k}: {v}" for k, v in answers.items())
            else:
                fu_summary_str = str(fu.result_summary)
        elif fu.result_summary:
            fu_summary_str = str(fu.result_summary)

        ws_fu.append([
            fu.public_id,
            fu.case_id,
            fu.channel.value if fu.channel else "",
            fu.status.value if fu.status else "",
            _sanitize_cell_value(fu.reason or ""),
            _sanitize_cell_value(", ".join(fu.questions or fu.items or [])),
            _sanitize_cell_value(fu_summary_str),
            _format_dt(fu.completed_at),
        ])
    _finalize_sheet(ws_fu)

    # ----------------------------------------------------
    # Sheet 5: Referrals
    # ----------------------------------------------------
    ws_ref = wb.create_sheet(title="Referrals")
    ref_headers = [
        "Referral ID",
        "Case ID",
        "Target Facility",
        "Status",
        "Reason for Referral",
        "Clinical Summary",
        "Created At",
    ]
    _style_headers_and_autosize(ws_ref, ref_headers)

    ref_stmt = select(Referral)
    if target_facility_id:
        ref_stmt = ref_stmt.join(Case, Referral.case_id == Case.id).where(Case.facility_id == target_facility_id)
    referrals = db.scalars(ref_stmt.order_by(Referral.created_at.desc())).all()

    for ref in referrals:
        draft_summary = ""
        if isinstance(ref.draft, dict):
            draft_summary = str(ref.draft.get("reason_for_referral", ref.draft.get("summary", "")))
        elif ref.draft:
            draft_summary = str(ref.draft)

        ws_ref.append([
            ref.public_id,
            ref.case_id,
            _sanitize_cell_value(ref.destination_facility or ""),
            ref.status.value if ref.status else "",
            _sanitize_cell_value(ref.reason_for_referral or ""),
            _sanitize_cell_value(draft_summary),
            _format_dt(ref.created_at),
        ])
    _finalize_sheet(ws_ref)

    # ----------------------------------------------------
    # Sheet 6: Audit Summary
    # ----------------------------------------------------
    ws_audit = wb.create_sheet(title="Audit Summary")
    audit_headers = [
        "Timestamp",
        "Actor",
        "Role",
        "Action",
        "Case Number",
        "Facility ID",
        "Source",
    ]
    _style_headers_and_autosize(ws_audit, audit_headers)

    audit_stmt = select(AuditLog)
    if target_facility_id:
        audit_stmt = audit_stmt.where(AuditLog.facility_id == target_facility_id)
    audits = db.scalars(audit_stmt.order_by(AuditLog.created_at.desc()).limit(500)).all()

    for al in audits:
        ws_audit.append([
            _format_dt(al.created_at),
            _sanitize_cell_value(al.actor_label or (f"User #{al.actor_user_id}" if al.actor_user_id else "System")),
            al.actor_role or "",
            al.action or "",
            al.case_number or "",
            al.facility_id or "",
            al.source or "",
        ])
    _finalize_sheet(ws_audit)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def generate_patient_details_excel(
    db: Session,
    user: User,
    facility_id: int | None = None,
) -> io.BytesIO:
    """Generate a dedicated single-sheet Excel workbook containing only Patient Details."""
    target_facility_id = user.facility_id if user.role != Role.SUPER_ADMIN else facility_id

    wb = Workbook()
    ws_patients = wb.active
    ws_patients.title = "Patient Details"

    build_patient_details_sheet(
        ws_patients,
        db=db,
        target_facility_id=target_facility_id,
    )

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def get_persistent_excel_path(facility_id: int | None = None) -> Path:
    """Configurable path for persistent workbook storage."""
    export_dir = settings.storage_root / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    if facility_id:
        return export_dir / f"patient_registry_facility_{facility_id}.xlsx"
    return export_dir / "patient_registry_master.xlsx"


def sync_patient_to_persistent_workbook(
    patient_id: int,
    db: Session,
) -> Path | None:
    """Thread-safe synchronization of patient details to persistent Excel file.

    - Locates the patient in PostgreSQL.
    - If row exists in worksheet (keyed by stable Patient ID), updates it in-place.
    - If new patient, appends a new row.
    - Atomic file write avoids corruption on crashes.
    - Safely catches and logs errors without rolling back PostgreSQL transactions.
    """
    try:
        p = db.scalar(
            select(Patient).options(joinedload(Patient.user)).where(Patient.id == patient_id)
        )
        if not p:
            return None

        latest_case = db.scalar(
            select(Case)
            .where(Case.patient_id == p.id)
            .order_by(Case.created_at.desc())
            .limit(1)
        )

        facilities_cache: dict[int, str] = {}
        fac_id = p.facility_id or (latest_case.facility_id if latest_case else None)
        if fac_id:
            fac = db.get(Facility, fac_id)
            if fac:
                facilities_cache[fac_id] = fac.name

        row_values = build_patient_row_data(p, latest_case, facilities_cache)

        with _export_file_lock:
            paths_to_sync = [get_persistent_excel_path(None)]
            if p.facility_id:
                paths_to_sync.append(get_persistent_excel_path(p.facility_id))

            for file_path in paths_to_sync:
                if file_path.exists():
                    try:
                        wb = openpyxl.load_workbook(file_path)
                    except Exception:
                        wb = Workbook()
                        wb.remove(wb.active)
                else:
                    wb = Workbook()
                    wb.remove(wb.active)

                if "Patient Details" not in wb.sheetnames:
                    ws = wb.create_sheet(title="Patient Details", index=0)
                    _style_headers_and_autosize(ws, PATIENT_HEADERS)
                else:
                    ws = wb["Patient Details"]

                # Find row by stable Patient ID (Column 1)
                target_row = None
                for r in range(2, ws.max_row + 1):
                    val = ws.cell(row=r, column=1).value
                    if val == p.id or str(val) == str(p.id):
                        target_row = r
                        break

                if target_row:
                    for col_idx, val in enumerate(row_values, start=1):
                        ws.cell(row=target_row, column=col_idx, value=val)
                else:
                    ws.append(row_values)

                _finalize_sheet(ws)

                temp_path = file_path.with_suffix(".tmp")
                wb.save(temp_path)
                if temp_path.exists():
                    os.replace(temp_path, file_path)

        logger.info("Synchronized patient %d to persistent Excel registry", patient_id)
        return get_persistent_excel_path(None)
    except Exception as exc:
        logger.warning("Could not synchronize patient %d to persistent Excel: %s", patient_id, exc)
        return None
