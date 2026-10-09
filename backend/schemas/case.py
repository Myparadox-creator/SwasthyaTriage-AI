"""Case API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.enums import (
    CaseSource,
    CaseStatus,
    FollowUpChannel,
    FollowUpStatus,
    Language,
    Priority,
    Provenance,
    ReferralStatus,
)
from schemas.documents import DocumentOut


class CaseCreateRequest(BaseModel):
    language: Language = Language.EN
    chief_concern: str | None = Field(default=None, max_length=500)
    consent_accepted: bool
    consent_text_version: str = "v1"
    # Optional identity fields if the patient is not logged in yet
    patient_phone: str | None = Field(default=None, max_length=32)


class SymptomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    term: str
    source: Provenance
    collected_via: str | None
    verified: bool


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    value: str
    unit: str | None
    source: Provenance
    collected_via: str | None
    verified: bool


class SafetySignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_code: str | None
    label: str
    message: str
    priority: Priority
    source: Provenance
    evidence: dict | None
    created_at: datetime


class ReviewNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    note: str
    created_at: datetime
    author_full_name: str | None = None
    author_role: str | None = None


class ReviewNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class CaseListItem(BaseModel):
    id: int
    case_number: str
    status: CaseStatus
    priority: Priority
    source: CaseSource
    language: Language
    chief_concern: str | None
    created_at: datetime
    submitted_at: datetime | None
    reviewed_at: datetime | None
    patient_name: str
    facility_id: int
    facility_name: str | None = None
    assigned_reviewer_id: int | None
    assigned_reviewer_name: str | None
    symptom_count: int
    signal_count: int
    has_documents: bool


class CaseListResponse(BaseModel):
    items: list[CaseListItem]
    total: int
    page: int
    page_size: int


class CaseDetail(BaseModel):
    id: int
    case_number: str
    status: CaseStatus
    priority: Priority
    source: CaseSource
    language: Language
    chief_concern: str | None
    timeline_text: str | None
    ai_summary: str | None
    ai_summary_generated_at: datetime | None
    missing_information: list[str]
    created_at: datetime
    submitted_at: datetime | None
    reviewed_at: datetime | None
    patient: dict
    facility: dict
    assigned_reviewer: dict | None
    symptoms: list[SymptomOut]
    measurements: list[MeasurementOut]
    safety_signals: list[SafetySignalOut]
    review_notes: list[ReviewNoteOut]
    documents: list[DocumentOut]
    voice_session_count: int
    followup_count: int


class ReviewRequest(BaseModel):
    """Body for reviewer actions. All fields optional — endpoints decide what they need."""

    note: str | None = Field(default=None, max_length=4000)
    decision: str | None = Field(default=None, max_length=64)
    reviewer_id: int | None = None


class ReviewOutcome(BaseModel):
    case: CaseDetail
    note: ReviewNoteOut | None = None


class FollowUpCreateRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    items: list[str] = Field(default_factory=list, max_length=50)
    questions: list[str] = Field(default_factory=list, max_length=50)
    channel: FollowUpChannel = FollowUpChannel.TELECALL


class FollowUpOut(BaseModel):
    id: int
    public_id: str
    case_id: int
    case_number: str | None = None
    patient_name: str | None = None
    reason: str
    items: list[str]
    questions: list[str]
    channel: FollowUpChannel
    status: FollowUpStatus
    result_summary: dict | None
    requested_by_user_id: int | None = None
    requested_by_name: str | None = None
    assigned_to_user_id: int | None = None
    created_at: datetime
    updated_at: datetime | None = None
    completed_at: datetime | None


class FollowUpListResponse(BaseModel):
    items: list[FollowUpOut]
    total: int


class FollowUpAnswer(BaseModel):
    item: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=1000)
    source: str | None = Field(default=None, max_length=64)


class FollowUpCompleteRequest(BaseModel):
    answers: list[FollowUpAnswer] = Field(default_factory=list, max_length=50)
    summary: str | None = Field(default=None, max_length=4000)


class FollowUpCancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class ReferralCreateRequest(BaseModel):
    destination_facility: str = Field(default="", max_length=255)
    reason_for_referral: str = Field(default="", max_length=2000)


class ReferralUpdateRequest(BaseModel):
    destination_facility: str | None = Field(default=None, max_length=255)
    reason_for_referral: str | None = Field(default=None, max_length=2000)
    draft: dict | None = None


class ReferralFinalizeRequest(BaseModel):
    """Client must echo the version it reviewed — stale edits get a 409."""

    version: int = Field(ge=1)


class ReferralOut(BaseModel):
    id: int
    public_id: str
    case_id: int
    case_number: str | None = None
    patient_name: str | None = None
    destination_facility: str | None
    reason_for_referral: str | None
    draft: dict
    status: ReferralStatus
    version: int = 1
    supersedes_id: int | None = None
    created_by_user_id: int | None = None
    created_by_name: str | None = None
    created_at: datetime
    verified_at: datetime | None = None
    finalized_at: datetime | None = None


class ReferralListResponse(BaseModel):
    items: list[ReferralOut]
    total: int


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    actor_label: str | None
    actor_role: str | None
    case_id: int | None
    case_number: str | None
    facility_id: int | None
    source: str | None
    metadata_json: dict | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int


class SubmitResponse(BaseModel):
    case_number: str
    status: CaseStatus
    priority: Priority
    signals_detected: int
    message: str


class AISummaryResponse(BaseModel):
    summary: str
    generated_at: datetime
    provider: str
    suggested_questions: list[dict] = []
