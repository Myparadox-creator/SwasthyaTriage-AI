"""Facility Admin and Super Admin management endpoints.

Includes:
- Facility listing, registration, and updating (Super Admin)
- Staff user management (Facility Admin for own facility, Super Admin platform-wide)
- Comprehensive analytics aggregations (Facility and Global)
- System health & AI service configuration check
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_roles
from auth.password import hash_password
from config import settings
from database.session import get_db
from middleware.errors import AppError, ForbiddenError, NotFoundError
from models import Case, Facility, FollowUp, Patient, Referral, User, VoiceSession
from models.enums import CaseSource, CaseStatus, Priority, Role
from services.audit import AuditAction, record_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_ROLES = (Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


# ----------------------------------------------------
# Pydantic Schemas
# ----------------------------------------------------
class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    facility_type: str
    state: str
    district: str
    address: str | None = None
    phone: str | None = None
    is_active: bool
    created_at: datetime


class FacilityCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    facility_type: str = Field(default="PHC", max_length=32)
    state: str = Field(default="Odisha", max_length=64)
    district: str = Field(min_length=2, max_length=64)
    address: str | None = None
    phone: str | None = None


class FacilityUpdateRequest(BaseModel):
    name: str | None = None
    facility_type: str | None = None
    state: str | None = None
    district: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class StaffUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    facility_id: int | None = None
    facility_name: str | None = None
    designation: str | None = None
    phone: str | None = None
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class CreateStaffRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8)
    role: Role = Role.HEALTHCARE_WORKER
    facility_id: int | None = None
    designation: str | None = None
    phone: str | None = None


class UpdateUserRequest(BaseModel):
    role: Role | None = None
    facility_id: int | None = None
    designation: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class FacilityAnalyticsOut(BaseModel):
    facility_id: int | None = None
    facility_name: str | None = None
    total_cases: int
    cases_today: int
    pending_review: int
    urgent_review: int
    reviewed_cases: int
    active_followups: int
    active_referrals: int
    staff_count: int
    priority_distribution: dict[str, int]
    source_distribution: dict[str, int]
    language_distribution: dict[str, int]
    daily_trend: list[dict[str, int | str]]


# ----------------------------------------------------
# Facility Endpoints
# ----------------------------------------------------
@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(
    user: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(Facility).order_by(Facility.name)
    if user.role != Role.SUPER_ADMIN:
        if user.facility_id is None:
            raise ForbiddenError("No facility associated with user")
        stmt = stmt.where(Facility.id == user.facility_id)
    return list(db.scalars(stmt).all())


@router.post("/facilities", response_model=FacilityOut, status_code=201)
def create_facility(
    payload: FacilityCreateRequest,
    user: User = Depends(require_roles(Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    existing = db.scalar(select(Facility).where(Facility.code == payload.code.strip()))
    if existing:
        raise AppError("Facility code already registered", status_code=409, code="duplicate_facility_code")

    fac = Facility(
        code=payload.code.strip(),
        name=payload.name.strip(),
        facility_type=payload.facility_type.strip(),
        state=payload.state.strip(),
        district=payload.district.strip(),
        address=payload.address,
        phone=payload.phone,
        is_active=True,
    )
    db.add(fac)
    db.flush()

    record_audit(
        db,
        AuditAction.FACILITY_CREATED,
        user=user,
        facility_id=fac.id,
        metadata={"facility_code": fac.code, "name": fac.name},
    )
    db.commit()
    db.refresh(fac)
    return fac


@router.patch("/facilities/{facility_id}", response_model=FacilityOut)
def update_facility(
    facility_id: int,
    payload: FacilityUpdateRequest,
    user: User = Depends(require_roles(Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    fac = db.get(Facility, facility_id)
    if fac is None:
        raise NotFoundError("Facility not found")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(fac, field, val)

    db.commit()
    db.refresh(fac)
    return fac


# ----------------------------------------------------
# Users / Staff Management Endpoints
# ----------------------------------------------------
@router.get("/users", response_model=list[StaffUserOut])
def list_users(
    facility_id: int | None = None,
    user: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    stmt = select(User).where(User.deleted_at.is_(None))
    if user.role != Role.SUPER_ADMIN:
        stmt = stmt.where(User.facility_id == user.facility_id)
    elif facility_id:
        stmt = stmt.where(User.facility_id == facility_id)

    users = db.scalars(stmt.order_by(User.full_name)).all()
    results = []
    for u in users:
        fac = db.get(Facility, u.facility_id) if u.facility_id else None
        results.append(
            StaffUserOut(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=u.role,
                facility_id=u.facility_id,
                facility_name=fac.name if fac else None,
                designation=u.designation,
                phone=u.phone,
                is_active=u.is_active,
                last_login_at=u.last_login_at,
                created_at=u.created_at,
            )
        )
    return results


@router.post("/users", response_model=StaffUserOut, status_code=201)
def create_staff_user(
    payload: CreateStaffRequest,
    user: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    existing = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if existing:
        raise AppError("User with this email already exists", status_code=409, code="email_in_use")

    # Facility isolation check
    target_facility_id = payload.facility_id
    if user.role != Role.SUPER_ADMIN:
        target_facility_id = user.facility_id
        if payload.role not in (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN):
            raise ForbiddenError("Facility admins can only create health staff or facility accounts")

    new_user = User(
        email=payload.email.lower().strip(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        facility_id=target_facility_id,
        designation=payload.designation,
        phone=payload.phone,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    record_audit(
        db,
        AuditAction.USER_CREATED,
        user=user,
        facility_id=target_facility_id,
        metadata={"created_user_id": new_user.id, "email": new_user.email, "role": new_user.role.value},
    )
    db.commit()
    db.refresh(new_user)

    fac = db.get(Facility, new_user.facility_id) if new_user.facility_id else None
    return StaffUserOut(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        facility_id=new_user.facility_id,
        facility_name=fac.name if fac else None,
        designation=new_user.designation,
        phone=new_user.phone,
        is_active=new_user.is_active,
        last_login_at=new_user.last_login_at,
        created_at=new_user.created_at,
    )


@router.patch("/users/{user_id}", response_model=StaffUserOut)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    user: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None or target.deleted_at is not None:
        raise NotFoundError("User not found")

    if user.role != Role.SUPER_ADMIN and target.facility_id != user.facility_id:
        raise ForbiddenError("Cannot modify user from another facility")

    for field, val in payload.model_dump(exclude_unset=True).items():
        if user.role != Role.SUPER_ADMIN and field in ("role", "facility_id"):
            continue  # only super admin can modify role or facility reassignments
        setattr(target, field, val)

    db.commit()
    db.refresh(target)

    fac = db.get(Facility, target.facility_id) if target.facility_id else None
    return StaffUserOut(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role,
        facility_id=target.facility_id,
        facility_name=fac.name if fac else None,
        designation=target.designation,
        phone=target.phone,
        is_active=target.is_active,
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )


# ----------------------------------------------------
# Analytics Aggregations Endpoint
# ----------------------------------------------------
@router.get("/analytics", response_model=FacilityAnalyticsOut)
def get_analytics(
    facility_id: int | None = None,
    user: User = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    target_facility_id = user.facility_id if user.role != Role.SUPER_ADMIN else facility_id

    case_stmt = select(Case)
    if target_facility_id:
        case_stmt = case_stmt.where(Case.facility_id == target_facility_id)

    cases = db.scalars(case_stmt).all()

    total_cases = len(cases)
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    cases_today = sum(1 for c in cases if c.created_at and c.created_at >= today_start)

    pending_review = sum(1 for c in cases if c.status in (CaseStatus.SUBMITTED, CaseStatus.IN_REVIEW))
    urgent_review = sum(1 for c in cases if c.priority == Priority.URGENT_REVIEW and c.status != CaseStatus.REVIEWED)
    reviewed_cases = sum(1 for c in cases if c.status == CaseStatus.REVIEWED)

    fu_stmt = select(func.count(FollowUp.id)).where(FollowUp.status != "COMPLETED")
    ref_stmt = select(func.count(Referral.id))
    user_stmt = select(func.count(User.id)).where(User.deleted_at.is_(None))

    if target_facility_id:
        fu_stmt = fu_stmt.join(Case, FollowUp.case_id == Case.id).where(Case.facility_id == target_facility_id)
        ref_stmt = ref_stmt.join(Case, Referral.case_id == Case.id).where(Case.facility_id == target_facility_id)
        user_stmt = user_stmt.where(User.facility_id == target_facility_id)

    active_followups = db.scalar(fu_stmt) or 0
    active_referrals = db.scalar(ref_stmt) or 0
    staff_count = db.scalar(user_stmt) or 0

    priority_distribution: dict[str, int] = {}
    source_distribution: dict[str, int] = {}
    language_distribution: dict[str, int] = {}

    for c in cases:
        p_val = c.priority.value if c.priority else "ROUTINE"
        priority_distribution[p_val] = priority_distribution.get(p_val, 0) + 1

        s_val = c.source.value if c.source else "CHAT"
        source_distribution[s_val] = source_distribution.get(s_val, 0) + 1

        l_val = c.language.value if c.language else "en"
        language_distribution[l_val] = language_distribution.get(l_val, 0) + 1

    # Daily trend for last 7 days
    daily_trend = []
    for day_offset in range(6, -1, -1):
        day_date = (datetime.now(UTC) - timedelta(days=day_offset)).date()
        day_count = sum(1 for c in cases if c.created_at and c.created_at.date() == day_date)
        daily_trend.append({"date": day_date.strftime("%b %d"), "count": day_count})

    fac = db.get(Facility, target_facility_id) if target_facility_id else None

    return FacilityAnalyticsOut(
        facility_id=target_facility_id,
        facility_name=fac.name if fac else ("All Facilities" if user.role == Role.SUPER_ADMIN else None),
        total_cases=total_cases,
        cases_today=cases_today,
        pending_review=pending_review,
        urgent_review=urgent_review,
        reviewed_cases=reviewed_cases,
        active_followups=active_followups,
        active_referrals=active_referrals,
        staff_count=staff_count,
        priority_distribution=priority_distribution,
        source_distribution=source_distribution,
        language_distribution=language_distribution,
        daily_trend=daily_trend,
    )
