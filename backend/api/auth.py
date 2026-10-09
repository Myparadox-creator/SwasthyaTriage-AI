"""Auth endpoints: login, refresh, logout, signup, me, forgot password."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.clerk import ClerkError, display_name, fetch_clerk_user, primary_email
from auth.dependencies import (
    facility_scope,
    get_current_user,
    load_user_facility,
    require_roles,
    touch_last_login,
)
from auth.jwt import consume_refresh_token, create_access_token, create_refresh_token
from auth.password import hash_password, verify_password
from config import settings
from database.session import get_db
from middleware.errors import AppError, UnauthorizedError
from middleware.ratelimit import limiter
from models import Notification, Patient, RefreshToken, User
from models.enums import Language, Role
from schemas.auth import (
    ClerkExchangeRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from services.audit import AuditAction, record_audit
from services.email import (
    create_and_send_password_reset_email,
    create_and_send_verification_email,
    mark_password_reset_token_used,
    send_password_changed_email,
    send_welcome_email,
    verify_email_token,
    verify_password_reset_token,
)
from services.exports.excel import sync_patient_to_persistent_workbook

logger = logging.getLogger("swasthyatriage")

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "st_refresh"


def _user_out(db: Session, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        facility_id=user.facility_id,
        facility_name=load_user_facility(db, user),
        designation=user.designation,
        phone=user.phone,
    )


def _set_refresh_cookie(response: Response, raw_token: str, max_age: int) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth",
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
):
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if (
        user is None
        or user.deleted_at is not None
        or not verify_password(user.password_hash, payload.password)
    ):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated. Contact your facility administrator.")

    # Strict single-role verification: block cross-role access for unique email accounts
    if payload.role is not None and user.role != payload.role:
        logger.warning(
            "[Auth] Role mismatch: user %s has role %s, attempted login as %s",
            user.email,
            user.role,
            payload.role,
        )
        raise AppError(
            f"Access Denied: The account '{user.email}' is registered as {user.role.value.replace('_', ' ')}. "
            f"It cannot be used to log in to the {payload.role.value.replace('_', ' ')} portal. "
            "Each portal role requires a unique email address.",
            status_code=403,
            code="role_mismatch",
        )

    touch_last_login(db, user)
    access_token, expires_in = create_access_token(user)
    raw_refresh, expires_at = create_refresh_token(db, user)
    _set_refresh_cookie(
        response, raw_refresh, int((expires_at - datetime.now(UTC)).total_seconds())
    )
    record_audit(db, AuditAction.USER_LOGIN, user=user, source="WEB")
    db.commit()

    # Dispatched welcome email on every login
    try:
        send_welcome_email(db, user)
    except Exception as exc:
        logger.warning("[Auth] Failed to send welcome email on login: %s", exc)

    # In-app welcome notification
    try:
        db.add(
            Notification(
                user_id=user.id,
                type="USER_LOGIN",
                title=f"Welcome to SwasthyaFlow AI, {user.full_name}!",
                body=f"Signed in to {user.role.value.replace('_', ' ')} portal. Session confirmation email dispatched to {user.email}.",
            )
        )
        db.commit()
    except Exception as exc:
        logger.warning("[Auth] Failed to create welcome notification on login: %s", exc)

    return TokenResponse(access_token=access_token, expires_in=expires_in, user=_user_out(db, user))


@router.post("/refresh", response_model=RefreshResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise UnauthorizedError("No refresh session")
    user = consume_refresh_token(db, raw)
    if user is None:
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        db.commit()
        raise UnauthorizedError("Session expired. Please sign in again.")

    access_token, expires_in = create_access_token(user)
    new_raw, expires_at = create_refresh_token(db, user)
    _set_refresh_cookie(response, new_raw, int((expires_at - datetime.now(UTC)).total_seconds()))
    db.commit()
    return RefreshResponse(access_token=access_token, expires_in=expires_in)


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        consume_refresh_token(db, raw)
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    db.commit()
    return MessageResponse(message="Signed out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(db, user)


@router.post("/clerk", response_model=TokenResponse)
@limiter.limit("20/minute")
def login_with_clerk(
    payload: ClerkExchangeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Exchange a verified Clerk session (e.g. Google) for an app session.

    One account has exactly one role. First-time Google users are provisioned
    with the requested role (default PATIENT); existing accounts always keep
    their registered role and are signed in as-is — role switching is refused.
    """
    try:
        profile = fetch_clerk_user(
            payload.token,
            client_email=str(payload.email) if payload.email else None,
            client_name=payload.full_name,
            client_user_id=payload.clerk_user_id,
        )
    except ClerkError as exc:
        raise UnauthorizedError(str(exc)) from exc

    email = primary_email(profile)
    if not email:
        raise UnauthorizedError("This social account has no email address")

    user = db.scalar(select(User).where(User.email == email))
    if user is not None and (user.deleted_at is not None or not user.is_active):
        raise UnauthorizedError("Account is deactivated. Contact your facility administrator.")

    target_role = payload.role or Role.PATIENT
    default_fac_id = 5 if target_role in (Role.HEALTHCARE_WORKER, Role.FACILITY_ADMIN) else None
    is_new_user = user is None

    if user is None:
        full_name = display_name(profile, email.split("@")[0])
        designation = None
        if target_role == Role.HEALTHCARE_WORKER:
            designation = "Medical Officer"
        elif target_role == Role.FACILITY_ADMIN:
            designation = "Facility Administrator"

        user = User(
            email=email,
            full_name=full_name,
            role=target_role,
            facility_id=default_fac_id,
            designation=designation,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_active=True,
        )
        db.add(user)
        db.flush()
        if target_role == Role.PATIENT:
            new_patient = Patient(user_id=user.id, full_name=full_name, language=Language.EN)
            db.add(new_patient)
            db.flush()
        record_audit(
            db,
            AuditAction.USER_CREATED,
            user=user,
            source="GOOGLE",
            metadata={"role": target_role.value, "provider": "GOOGLE"},
        )
    else:
        # Strict single-role verification: an existing user's role is fixed for life
        # and cannot be accessed or switched by requesting a different role at sign-in.
        if payload.role and payload.role != user.role:
            logger.warning(
                "[Auth] Google OAuth role mismatch for %s: account is %s, requested %s",
                user.email,
                user.role,
                payload.role,
            )
            raise AppError(
                f"Access Denied: The Google account '{user.email}' is registered as {user.role.value.replace('_', ' ')}. "
                f"It cannot be used to access the {payload.role.value.replace('_', ' ')} portal. "
                "Each role requires a unique email address.",
                status_code=403,
                code="role_mismatch",
            )

    touch_last_login(db, user)
    access_token, expires_in = create_access_token(user)
    raw_refresh, expires_at = create_refresh_token(db, user)
    _set_refresh_cookie(
        response, raw_refresh, int((expires_at - datetime.now(UTC)).total_seconds())
    )
    record_audit(db, AuditAction.USER_LOGIN, user=user, source="GOOGLE")
    db.commit()
    if "new_patient" in locals():
        sync_patient_to_persistent_workbook(new_patient.id, db)

    # Dispatched welcome email on every Google login
    try:
        send_welcome_email(db, user)
    except Exception as exc:
        logger.warning("[Auth] Failed to send welcome email for social user: %s", exc)

    # In-app welcome notification
    try:
        db.add(
            Notification(
                user_id=user.id,
                type="USER_LOGIN",
                title=f"Welcome to SwasthyaFlow AI, {user.full_name}!",
                body=f"Google sign-in active as {user.role.value.replace('_', ' ')}. Confirmation dispatched to {user.email}.",
            )
        )
        db.commit()
    except Exception as exc:
        logger.warning("[Auth] Failed to create welcome notification for social user: %s", exc)

    return TokenResponse(access_token=access_token, expires_in=expires_in, user=_user_out(db, user))


@router.post("/signup", response_model=TokenResponse, status_code=201)
@limiter.limit("10/minute")
def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Self-registration is only available for the PATIENT role."""
    email = payload.email.lower().strip()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(
            "An account with this email already exists",
            status_code=409,
            code="email_taken",
        )

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        role=Role.PATIENT,
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        is_active=True,
    )
    db.add(user)
    db.flush()

    new_patient = Patient(
        user_id=user.id,
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        language=payload.language,
    )
    db.add(new_patient)
    db.flush()

    access_token, expires_in = create_access_token(user)
    raw_refresh, expires_at = create_refresh_token(db, user)
    _set_refresh_cookie(
        response, raw_refresh, int((expires_at - datetime.now(UTC)).total_seconds())
    )
    record_audit(
        db, AuditAction.USER_CREATED, user=user, source="WEB", metadata={"role": "PATIENT"}
    )
    db.commit()
    sync_patient_to_persistent_workbook(new_patient.id, db)

    # Trigger transactional Welcome and Verification emails
    try:
        send_welcome_email(db, user)
        create_and_send_verification_email(db, user)
    except Exception as exc:
        logger.warning("[Auth] Email dispatch on signup failed: %s", exc)

    return TokenResponse(access_token=access_token, expires_in=expires_in, user=_user_out(db, user))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Always returns the same generic message — never reveals whether an email exists."""
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if user is not None and user.is_active and user.deleted_at is None:
        try:
            create_and_send_password_reset_email(db, user)
        except Exception as exc:
            logger.warning("[Auth] Failed to queue password reset email: %s", exc)
    return MessageResponse(
        message="If an account exists for this email, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validates single-use reset token and updates password hash."""
    user = verify_password_reset_token(db, payload.token)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise AppError(
            "Invalid or expired password reset link",
            status_code=400,
            code="invalid_reset_token",
        )

    user.password_hash = hash_password(payload.new_password)
    # Revoke all active refresh sessions
    now = datetime.now(UTC)
    active_tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    ).all()
    for rt in active_tokens:
        rt.revoked_at = now

    mark_password_reset_token_used(db, payload.token)
    record_audit(db, AuditAction.USER_PASSWORD_RESET, user=user)
    db.commit()

    try:
        send_password_changed_email(db, user)
    except Exception as exc:
        logger.warning("[Auth] Failed to send password changed confirmation: %s", exc)

    return MessageResponse(
        message="Your password has been reset successfully. Please sign in with your new password."
    )


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Validates single-use email verification token."""
    user = verify_email_token(db, payload.token)
    if user is None:
        raise AppError(
            "Invalid or expired email verification link",
            status_code=400,
            code="invalid_verification_token",
        )
    record_audit(db, AuditAction.USER_UPDATED, user=user, metadata={"action": "email_verified"})
    return MessageResponse(message="Your email address has been verified successfully.")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Resends email verification token if user exists."""
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if user is not None and user.is_active and user.deleted_at is None:
        try:
            create_and_send_verification_email(db, user)
        except Exception as exc:
            logger.warning("[Auth] Failed to resend verification email: %s", exc)
    return MessageResponse(
        message="If an unverified account exists for this email, a new verification link has been sent."
    )


@router.get("/staff", response_model=list[UserOut])
def list_staff(
    actor: User = Depends(require_roles(Role.FACILITY_ADMIN, Role.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    """Facility admins see their own staff; super admins see everyone."""
    scope = facility_scope(actor)
    stmt = select(User).where(User.deleted_at.is_(None)).order_by(User.full_name)
    if scope is not None:
        stmt = stmt.where(User.facility_id == scope)
    users = db.scalars(stmt).all()
    return [_user_out(db, u) for u in users]
