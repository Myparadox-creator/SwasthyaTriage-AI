"""Shared enumerations for SwasthyaTriage AI."""

import enum


class Role(str, enum.Enum):
    PATIENT = "PATIENT"
    HEALTHCARE_WORKER = "HEALTHCARE_WORKER"
    FACILITY_ADMIN = "FACILITY_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class Priority(str, enum.Enum):
    ROUTINE = "ROUTINE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    URGENT_REVIEW = "URGENT_REVIEW"


class CaseStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    IN_REVIEW = "IN_REVIEW"
    FOLLOW_UP_REQUIRED = "FOLLOW_UP_REQUIRED"
    REVIEWED = "REVIEWED"
    ESCALATED = "ESCALATED"
    REFERRED = "REFERRED"
    CLOSED = "CLOSED"


class CaseSource(str, enum.Enum):
    VOICE = "VOICE"
    CHAT = "CHAT"
    DOCUMENT = "DOCUMENT"
    TELECALL = "TELECALL"
    MIXED = "MIXED"


class Provenance(str, enum.Enum):
    """Where a piece of information came from. Displayed as a badge in the UI."""

    PATIENT_REPORTED = "PATIENT_REPORTED"
    AI_EXTRACTED = "AI_EXTRACTED"
    AI_GENERATED = "AI_GENERATED"
    REVIEWER_VERIFIED = "REVIEWER_VERIFIED"
    CONFIGURED_RULE = "CONFIGURED_RULE"


class VoiceSessionMode(str, enum.Enum):
    IN_APP = "IN_APP"
    TELECALL = "TELECALL"


class SessionStatus(str, enum.Enum):
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    LISTENING = "LISTENING"
    PROCESSING = "PROCESSING"
    SPEAKING = "SPEAKING"
    ERROR = "ERROR"
    COMPLETED = "COMPLETED"


class MessageRole(str, enum.Enum):
    AI = "AI"
    PATIENT = "PATIENT"
    SYSTEM = "SYSTEM"


class DocumentStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class ExtractionMethod(str, enum.Enum):
    TEXT_LAYER = "TEXT_LAYER"
    GEMINI_VISION = "GEMINI_VISION"
    OCR = "OCR"


class CallStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    DIALING = "DIALING"
    RINGING = "RINGING"
    CONNECTED = "CONNECTED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    NO_ANSWER = "NO_ANSWER"
    CANCELLED = "CANCELLED"


class FollowUpStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class FollowUpChannel(str, enum.Enum):
    CHAT = "CHAT"
    IN_APP_VOICE = "IN_APP_VOICE"
    TELECALL = "TELECALL"


class ReferralStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    VERIFIED = "VERIFIED"
    FINALIZED = "FINALIZED"


class ConsentStatus(str, enum.Enum):
    GRANTED = "GRANTED"
    REVOKED = "REVOKED"


class Language(str, enum.Enum):
    """Initial supported languages. Architecture allows adding more."""

    EN = "en"
    HI = "hi"
    OD = "od"
