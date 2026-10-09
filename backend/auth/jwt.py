"""JWT access tokens + rotating refresh tokens (hashed at rest)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from models import RefreshToken, User

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


class TokenError(Exception):
    pass


def _encode(payload: dict, ttl: timedelta) -> str:
    body = dict(payload)
    body["exp"] = datetime.now(UTC) + ttl
    body["iat"] = datetime.now(UTC)
    return jwt.encode(body, settings.jwt_secret, algorithm=ALGORITHM)


def create_access_token(user: User) -> tuple[str, int]:
    ttl = timedelta(minutes=settings.jwt_access_ttl_minutes)
    token = _encode(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "facility_id": user.facility_id,
            "type": ACCESS_TOKEN_TYPE,
        },
        ttl,
    )
    return token, int(ttl.total_seconds())


def create_refresh_token(db: Session, user: User) -> tuple[str, datetime]:
    raw = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw)
    expires_at = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_ttl_days)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    db.flush()
    return raw, expires_at


def verify_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid token") from exc
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise TokenError("Wrong token type")
    return payload


def consume_refresh_token(db: Session, raw_token: str) -> User | None:
    """Validate + revoke (rotate) a refresh token. Returns the user on success."""
    token_hash = _hash_token(raw_token)
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        return None
    row.revoked_at = datetime.now(UTC)
    user = db.get(User, row.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    db.flush()
    return user


def revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    from sqlalchemy import update

    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    db.flush()


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
