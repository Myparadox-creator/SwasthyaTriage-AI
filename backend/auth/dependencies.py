"""Server-side authentication + authorization dependencies.

NEVER trust role information sent by the client. Roles are resolved
from the validated JWT and re-loaded from the database on every request.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.jwt import TokenError, verify_access_token
from database.session import get_db
from middleware.errors import ForbiddenError, UnauthorizedError
from models import Facility, Patient, User
from models.enums import Role

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Missing access token")
    try:
        payload = verify_access_token(credentials.credentials)
    except TokenError as exc:
        raise UnauthorizedError(str(exc)) from exc

    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("Account is not active")
    if payload.get("role") != user.role.value:
        raise UnauthorizedError("Session no longer valid")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        return get_current_user(credentials=credentials, db=db)
    except UnauthorizedError:
        return None


def require_roles(*roles: Role) -> Callable[..., User]:
    allowed = set(roles)

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise ForbiddenError(
                f"This action requires one of: {', '.join(r.value for r in allowed)}"
            )
        return user

    return dependency


def facility_scope(user: User) -> int | None:
    """Facility isolation: None means 'all facilities' (super admin only)."""
    if user.role == Role.SUPER_ADMIN:
        return None
    if user.facility_id is None:
        raise ForbiddenError("No facility assigned to this account")
    return user.facility_id


def touch_last_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(UTC)
    db.flush()


def load_user_facility(db: Session, user: User) -> str | None:
    if user.facility_id is None:
        return None
    facility = db.get(Facility, user.facility_id)
    return facility.name if facility else None


def get_patient_for_user(db: Session, user: User) -> Patient | None:
    return db.scalar(select(Patient).where(Patient.user_id == user.id))
