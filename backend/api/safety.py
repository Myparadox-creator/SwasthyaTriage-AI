"""Safety rule configuration endpoints.

Reading rules: any review staff (they explain why a signal fired).
Changing rules: SUPER_ADMIN only, versioned and audited. Rules are
structured patterns/thresholds — the engine never executes user logic.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from auth.dependencies import facility_scope, require_roles
from database.session import get_db
from middleware.errors import AppError, NotFoundError
from models import Facility, SafetyRule, User
from models.enums import Role
from schemas.safety import SafetyRuleCreate, SafetyRuleOut, SafetyRuleUpdate
from services.audit import AuditAction, record_audit

router = APIRouter(prefix="/api/safety", tags=["safety"])

STAFF_ROLES = (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN, Role.SUPER_ADMIN)


@router.get("/rules", response_model=list[SafetyRuleOut])
def list_rules(
    include_inactive: bool = False,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    scope = facility_scope(user)
    stmt = select(SafetyRule)
    if scope is not None:
        stmt = stmt.where(or_(SafetyRule.facility_id.is_(None), SafetyRule.facility_id == scope))
    if not include_inactive:
        stmt = stmt.where(SafetyRule.is_active.is_(True))
    return list(db.scalars(stmt.order_by(SafetyRule.code)).all())


@router.post("/rules", response_model=SafetyRuleOut, status_code=201)
def create_rule(
    payload: SafetyRuleCreate,
    user: User = Depends(require_roles(Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    existing = db.scalar(select(SafetyRule).where(SafetyRule.code == payload.code))
    if existing is not None:
        raise AppError(
            f"Safety rule code '{payload.code}' already exists",
            status_code=409,
            code="duplicate_code",
        )
    if payload.facility_id is not None and db.get(Facility, payload.facility_id) is None:
        raise AppError("Facility not found", status_code=422, code="unknown_facility")

    rule = SafetyRule(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        match_patterns=payload.match_patterns,
        field_condition=payload.field_condition.model_dump(exclude_none=True)
        if payload.field_condition
        else None,
        target_priority=payload.target_priority,
        display_message=payload.display_message,
        is_active=payload.is_active,
        facility_id=payload.facility_id,
        version=1,
        updated_by_user_id=user.id,
    )
    db.add(rule)
    record_audit(
        db,
        AuditAction.SAFETY_RULE_UPDATED,
        user=user,
        facility_id=payload.facility_id,
        metadata={
            "event": "created",
            "rule_code": rule.code,
            "target_priority": rule.target_priority.value,
            "facility_id": rule.facility_id,
        },
    )
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=SafetyRuleOut)
def update_rule(
    rule_id: int,
    payload: SafetyRuleUpdate,
    user: User = Depends(require_roles(Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    rule = db.get(SafetyRule, rule_id)
    if rule is None:
        raise NotFoundError("Safety rule not found")
    if payload.version != rule.version:
        raise AppError(
            "Safety rule was modified by someone else. Reload and try again.",
            status_code=409,
            code="version_conflict",
        )

    changed: list[str] = []
    if payload.name is not None and payload.name != rule.name:
        rule.name = payload.name
        changed.append("name")
    if payload.description is not None and payload.description != rule.description:
        rule.description = payload.description
        changed.append("description")
    if payload.match_patterns is not None:
        rule.match_patterns = payload.match_patterns
        changed.append("match_patterns")
    if payload.clear_field_condition:
        rule.field_condition = None
        changed.append("field_condition")
    elif payload.field_condition is not None:
        rule.field_condition = payload.field_condition.model_dump(exclude_none=True)
        changed.append("field_condition")
    if payload.target_priority is not None and payload.target_priority != rule.target_priority:
        rule.target_priority = payload.target_priority
        changed.append("target_priority")
    if payload.display_message is not None and payload.display_message != rule.display_message:
        rule.display_message = payload.display_message
        changed.append("display_message")
    if payload.is_active is not None and payload.is_active != rule.is_active:
        rule.is_active = payload.is_active
        changed.append("is_active")

    if not changed:
        return rule

    rule.version += 1
    rule.updated_by_user_id = user.id
    record_audit(
        db,
        AuditAction.SAFETY_RULE_UPDATED,
        user=user,
        facility_id=rule.facility_id,
        metadata={
            "event": "updated",
            "rule_code": rule.code,
            "changed": changed,
            "version": rule.version,
            "is_active": rule.is_active,
        },
    )
    db.commit()
    db.refresh(rule)
    return rule
