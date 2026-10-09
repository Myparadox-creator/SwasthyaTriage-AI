"""Safety rule configuration schemas.

Rules are structured data only: match patterns and validated numeric
conditions. There is no way to submit executable logic.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.enums import Priority

_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")


class FieldCondition(BaseModel):
    """Structured threshold condition evaluated by the deterministic engine."""

    model_config = ConfigDict(extra="forbid")

    measurement: str | None = Field(default=None, max_length=64)
    duration_days_gte: float | None = Field(default=None, ge=0, le=3650)
    gte: float | None = None
    gte_f: float | None = None
    lte: float | None = None

    @model_validator(mode="after")
    def _check_shape(self) -> Self:
        has_measurement = self.measurement is not None
        has_duration = self.duration_days_gte is not None
        if has_measurement == has_duration:
            raise ValueError("Condition must target exactly one of: measurement, duration_days_gte")
        if has_measurement and self.gte is None and self.gte_f is None and self.lte is None:
            raise ValueError("Measurement conditions need at least one of gte, gte_f, lte")
        if has_duration and (
            self.gte is not None or self.gte_f is not None or self.lte is not None
        ):
            raise ValueError("duration_days_gte does not combine with gte/lte thresholds")
        return self


class SafetyRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str | None = None
    match_patterns: list[str]
    field_condition: dict | None = None
    target_priority: Priority
    display_message: str
    is_active: bool
    facility_id: int | None = None
    version: int
    updated_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime


class SafetyRuleCreate(BaseModel):
    code: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    match_patterns: list[str] = Field(default_factory=list, max_length=50)
    field_condition: FieldCondition | None = None
    target_priority: Priority = Priority.REVIEW_REQUIRED
    display_message: str = Field(
        default="Configured safety signal detected.", min_length=5, max_length=1000
    )
    is_active: bool = True
    facility_id: int | None = None  # None = global platform rule

    @field_validator("code")
    @classmethod
    def _code_format(cls, v: str) -> str:
        if not _CODE_RE.match(v):
            raise ValueError("code must be UPPER_SNAKE_CASE, 3-64 characters")
        return v

    @field_validator("match_patterns")
    @classmethod
    def _patterns(cls, v: list[str]) -> list[str]:
        out = [p.strip() for p in v if p and p.strip()]
        for p in out:
            if len(p) > 200:
                raise ValueError("match pattern too long (max 200 chars)")
        return out

    @model_validator(mode="after")
    def _needs_evidence_source(self) -> Self:
        if not self.match_patterns and self.field_condition is None:
            raise ValueError("A rule needs at least one match pattern or a field condition")
        return self


class SafetyRuleUpdate(BaseModel):
    """Partial edit. `version` is required for optimistic concurrency."""

    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    match_patterns: list[str] | None = Field(default=None, max_length=50)
    field_condition: FieldCondition | None = None
    clear_field_condition: bool = False
    target_priority: Priority | None = None
    display_message: str | None = Field(default=None, min_length=5, max_length=1000)
    is_active: bool | None = None

    @field_validator("match_patterns")
    @classmethod
    def _patterns(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [p.strip() for p in v if p and p.strip()]
        for p in out:
            if len(p) > 200:
                raise ValueError("match pattern too long (max 200 chars)")
        return out
