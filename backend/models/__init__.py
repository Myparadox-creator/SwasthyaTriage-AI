"""Import all models so Base.metadata is complete for Alembic."""

from models.case import (  # noqa: F401
    Case,
    CaseMeasurement,
    CaseSymptom,
    CaseTimeline,
    Consent,
    ReviewNote,
)
from models.conversation import ChatMessage  # noqa: F401
from models.documents import Document, DocumentExtraction  # noqa: F401
from models.evaluation import EvaluationRun  # noqa: F401
from models.evidence import FactEvidence  # noqa: F401
from models.safety import SafetyRule, SafetySignal  # noqa: F401
from models.user import Facility, Patient, RefreshToken, User  # noqa: F401
from models.voice import CallTranscript, TeleCall, VoiceMessage, VoiceSession  # noqa: F401
from models.workflow import (  # noqa: F401
    AuditLog,
    FollowUp,
    Notification,
    QuestionBankItem,
    Referral,
)
from models.email import EmailLog, PasswordResetToken, EmailVerificationToken  # noqa: F401

