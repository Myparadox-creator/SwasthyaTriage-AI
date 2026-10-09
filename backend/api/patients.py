"""Patient management endpoints with automatic PostgreSQL & Excel synchronization."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from auth.dependencies import get_current_user, require_roles
from database.session import get_db
from middleware.errors import ForbiddenError, NotFoundError
from models import Facility, Patient, User
from models.enums import Role
from schemas.patient import (
    PatientCreateRequest,
    PatientListResponse,
    PatientOut,
    PatientUpdateRequest,
)
from services.audit import AuditAction, record_audit
from services.exports.excel import sync_patient_to_persistent_workbook

router = APIRouter(prefix="/api/patients", tags=["patients"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


def _to_patient_out(db: Session, p: Patient) -> PatientOut:
    fac = db.get(Facility, p.facility_id) if p.facility_id else None
    email_val = p.user.email if p.user and p.user.email else None
    return PatientOut(
        id=p.id,
        user_id=p.user_id,
        facility_id=p.facility_id,
        facility_name=fac.name if fac else None,
        full_name=p.full_name,
        phone=p.phone,
        email=email_val,
        age=p.age,
        gender=p.gender,
        language=p.language,
        address=p.address,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=PatientListResponse)
def list_patients(
    q: str | None = Query(default=None),
    facility_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    target_facility_id = user.facility_id if user.role != Role.SUPER_ADMIN else facility_id

    stmt = select(Patient).options(joinedload(Patient.user))
    if target_facility_id:
        stmt = stmt.where(Patient.facility_id == target_facility_id)

    if q:
        query_str = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Patient.full_name.ilike(query_str),
                Patient.phone.ilike(query_str),
            )
        )

    count_stmt = select(func.count(Patient.id))
    if target_facility_id:
        count_stmt = count_stmt.where(Patient.facility_id == target_facility_id)
    if q:
        count_stmt = count_stmt.where(
            or_(
                Patient.full_name.ilike(query_str),
                Patient.phone.ilike(query_str),
            )
        )
    total = db.scalar(count_stmt) or 0

    patients = db.scalars(
        stmt.order_by(Patient.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return PatientListResponse(
        items=[_to_patient_out(db, p) for p in patients],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    payload: PatientCreateRequest,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    facility_id = payload.facility_id if user.role == Role.SUPER_ADMIN else user.facility_id
    if not facility_id:
        first_facility = db.scalar(
            select(Facility).where(Facility.is_active.is_(True)).order_by(Facility.id)
        )
        facility_id = first_facility.id if first_facility else None

    patient = Patient(
        facility_id=facility_id,
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        age=payload.age,
        gender=payload.gender.strip() if payload.gender else None,
        language=payload.language,
        address=payload.address.strip() if payload.address else None,
    )
    db.add(patient)
    db.flush()

    record_audit(
        db,
        AuditAction.USER_CREATED,
        user=user,
        facility_id=facility_id,
        metadata={"entity": "PATIENT", "patient_id": patient.id, "name": patient.full_name},
    )
    db.commit()

    # Automatically synchronize new patient to persistent Excel registry
    sync_patient_to_persistent_workbook(patient.id, db)

    return _to_patient_out(db, patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = db.scalar(
        select(Patient).options(joinedload(Patient.user)).where(Patient.id == patient_id)
    )
    if not patient:
        raise NotFoundError(f"Patient #{patient_id} not found")

    if user.role == Role.PATIENT and patient.user_id != user.id:
        raise ForbiddenError("You can only access your own patient profile")
    if user.role != Role.SUPER_ADMIN and user.role != Role.PATIENT:
        if patient.facility_id and user.facility_id and patient.facility_id != user.facility_id:
            raise ForbiddenError("You cannot access patients belonging to another facility")

    return _to_patient_out(db, patient)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    payload: PatientUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = db.scalar(
        select(Patient).options(joinedload(Patient.user)).where(Patient.id == patient_id)
    )
    if not patient:
        raise NotFoundError(f"Patient #{patient_id} not found")

    if user.role == Role.PATIENT and patient.user_id != user.id:
        raise ForbiddenError("You can only modify your own patient profile")
    if user.role != Role.SUPER_ADMIN and user.role != Role.PATIENT:
        if patient.facility_id and user.facility_id and patient.facility_id != user.facility_id:
            raise ForbiddenError("You cannot modify patients belonging to another facility")

    if payload.full_name is not None:
        patient.full_name = payload.full_name.strip()
    if payload.phone is not None:
        patient.phone = payload.phone.strip()
    if payload.age is not None:
        patient.age = payload.age
    if payload.gender is not None:
        patient.gender = payload.gender.strip()
    if payload.language is not None:
        patient.language = payload.language
    if payload.address is not None:
        patient.address = payload.address.strip()
    if payload.facility_id is not None and user.role in (Role.SUPER_ADMIN, Role.FACILITY_ADMIN):
        patient.facility_id = payload.facility_id

    record_audit(
        db,
        AuditAction.CASE_UPDATED,
        user=user,
        facility_id=patient.facility_id,
        metadata={"entity": "PATIENT", "patient_id": patient.id, "action": "UPDATE_DETAILS"},
    )
    db.commit()

    # Automatically update existing patient row in Excel workbook (no duplicates)
    sync_patient_to_persistent_workbook(patient.id, db)

    return _to_patient_out(db, patient)
