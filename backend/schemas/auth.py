"""Auth request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from models.enums import Language, Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role | None = None


class SignupRequest(BaseModel):
    """Self-signup is intentionally limited to the PATIENT role."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    language: Language = Language.EN


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ClerkExchangeRequest(BaseModel):
    """A Clerk session token obtained by the client after a social sign-in."""

    token: str = Field(min_length=1, max_length=8192)
    role: Role | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    clerk_user_id: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: Role
    facility_id: int | None
    facility_name: str | None = None
    designation: str | None = None
    phone: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class AdminEmailTestRequest(BaseModel):
    subject: str | None = Field(default=None, max_length=200)
    message: str | None = Field(default=None, max_length=1000)


class MessageResponse(BaseModel):
    message: str


class PatientProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str | None
    age: int | None
    gender: str | None
    language: Language
    created_at: datetime
