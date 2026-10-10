"""Schemas for patient registration, update, and retrieval."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.enums import Language


class PatientCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, max_length=16)
    language: Language = Language.EN
    address: str | None = None
    facility_id: int | None = None


class PatientUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, max_length=16)
    language: Language | None = None
    address: str | None = None
    facility_id: int | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None = None
    facility_id: int | None = None
    facility_name: str | None = None
    full_name: str
    phone: str | None = None
    email: str | None = None
    age: int | None = None
    gender: str | None = None
    language: Language
    address: str | None = None
    created_at: datetime
    updated_at: datetime


class PatientListResponse(BaseModel):
    items: list[PatientOut]
    total: int
    page: int
    page_size: int
