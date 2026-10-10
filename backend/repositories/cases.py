"""Case queries with strict role + facility scoping."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, joinedload

from middleware.errors import ForbiddenError, NotFoundError
from models import Case, Document, Facility, Patient, ReviewNote, User
from models.enums import CaseStatus, Priority, Role
from schemas.case import ReviewNoteOut


def can_access_case(actor: User, case: Case) -> bool:
    if actor.role == Role.SUPER_ADMIN:
        return True
    if actor.role == Role.PATIENT:
        return case.patient is not None and case.patient.user_id == actor.id
    # Staff: same facility only
    return actor.facility_id is not None and case.facility_id == actor.facility_id


def get_case_or_403(db: Session, actor: User, case_id: int) -> Case:
    case = db.scalar(
        select(Case)
        .options(
            joinedload(Case.symptoms),
            joinedload(Case.measurements),
            joinedload(Case.safety_signals),
            joinedload(Case.review_notes),
        )
        .where(Case.id == case_id, Case.deleted_at.is_(None))
    )
    if case is None:
        raise NotFoundError("Case not found")
    if not can_access_case(actor, case):
        raise ForbiddenError("You do not have access to this case")
    return case


def list_cases(
    db: Session,
    actor: User,
    *,
    priority: Priority | None = None,
    status: CaseStatus | None = None,
    language: str | None = None,
    source: str | None = None,
    assigned_reviewer_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[int, list[Case]]:
    stmt = select(Case).where(Case.deleted_at.is_(None))

    if actor.role == Role.PATIENT:
        stmt = stmt.join(Patient, Case.patient_id == Patient.id).where(Patient.user_id == actor.id)
    elif actor.role != Role.SUPER_ADMIN:
        if actor.facility_id is None:
            raise ForbiddenError("No facility assigned to this account")
        stmt = stmt.where(Case.facility_id == actor.facility_id)

    if priority is not None:
        stmt = stmt.where(Case.priority == priority)
    if status is not None:
        stmt = stmt.where(Case.status == status)
    if language is not None:
        stmt = stmt.where(cast(Case.language, String) == language)
    if source is not None:
        stmt = stmt.where(cast(Case.source, String) == source)
    if assigned_reviewer_id is not None:
        stmt = stmt.where(Case.assigned_reviewer_id == assigned_reviewer_id)
    if date_from is not None:
        stmt = stmt.where(Case.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Case.created_at <= date_to)
    if q:
        needle = f"%{q.strip()}%"
        stmt = stmt.join(Patient, Case.patient_id == Patient.id, isouter=True).where(
            or_(
                Case.case_number.ilike(needle),
                Case.chief_concern.ilike(needle),
                Patient.full_name.ilike(needle),
                Patient.phone.ilike(needle),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    stmt = (
        stmt.options(
            joinedload(Case.patient),
            joinedload(Case.symptoms),
            joinedload(Case.safety_signals),
        )
        .order_by(
            # Cases already submitted for review surface above in-progress drafts,
            # then newest submissions first (urgent remains flagged via badge/filter).
            (Case.status == CaseStatus.DRAFT).asc(),
            func.coalesce(Case.submitted_at, Case.created_at).desc(),
            Case.created_at.desc(),
        )
        .offset(max(page - 1, 0) * page_size)
        .limit(page_size)
    )
    rows = db.scalars(stmt).unique().all()
    return total, list(rows)


def next_case_number(db: Session) -> str:
    max_id = db.scalar(select(func.max(Case.id))) or 0
    return f"ST-{1000 + max_id + 1}"


def facility_name(db: Session, facility_id: int | None) -> str | None:
    if facility_id is None:
        return None
    fac = db.get(Facility, facility_id)
    return fac.name if fac else None


def user_name(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    user = db.get(User, user_id)
    return user.full_name if user else None


def document_counts(db: Session, case_ids: list[int]) -> dict[int, int]:
    """Map case_id -> number of live documents (soft-deleted excluded)."""
    if not case_ids:
        return {}
    rows = db.execute(
        select(Document.case_id, func.count())
        .where(Document.case_id.in_(case_ids), Document.deleted_at.is_(None))
        .group_by(Document.case_id)
    ).all()
    return {case_id: count for case_id, count in rows}


def review_note_out(db: Session, note: ReviewNote) -> ReviewNoteOut:
    author = db.get(User, note.author_user_id) if note.author_user_id else None
    return ReviewNoteOut(
        id=note.id,
        note=note.note,
        created_at=note.created_at,
        author_full_name=author.full_name if author else None,
        author_role=author.role.value if author else None,
    )
