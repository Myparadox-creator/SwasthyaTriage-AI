"""Right-to-erasure: irreversible pseudonymisation of a patient's data.

Clinical and audit records are preserved for care and accountability, but every
direct identifier is destroyed and all raw conversational/uploaded content is
deleted:

- the patient's login user is anonymised and deactivated (email, name, phone);
- the patient profile loses name, phone, address, gender;
- raw free text (chat, voice messages, call transcripts, document text) is
  deleted; uploaded files are removed from storage;
- residual PII patterns in remaining clinical text are redacted;
- every consent is marked REVOKED.

The operation is idempotent and returns counts so the caller can audit it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from models import (
    CallTranscript,
    Case,
    CaseSymptom,
    CaseTimeline,
    ChatMessage,
    Consent,
    Document,
    DocumentExtraction,
    Patient,
    ReviewNote,
    TeleCall,
    User,
    VoiceMessage,
    VoiceSession,
)
from models.enums import ConsentStatus
from services.privacy.redaction import redact_mapping, redact_text
from services.storage import delete_upload


@dataclass
class ErasureReport:
    patient_id: int
    user_anonymised: bool = False
    cases_scrubbed: int = 0
    chat_messages_deleted: int = 0
    voice_messages_deleted: int = 0
    call_transcripts_deleted: int = 0
    documents_removed: int = 0
    consents_revoked: int = 0
    text_fields_redacted: int = 0

    def as_dict(self) -> dict:
        return {
            "patient_id": self.patient_id,
            "user_anonymised": self.user_anonymised,
            "cases_scrubbed": self.cases_scrubbed,
            "chat_messages_deleted": self.chat_messages_deleted,
            "voice_messages_deleted": self.voice_messages_deleted,
            "call_transcripts_deleted": self.call_transcripts_deleted,
            "documents_removed": self.documents_removed,
            "consents_revoked": self.consents_revoked,
            "text_fields_redacted": self.text_fields_redacted,
        }


def _scrub(value: str | None, report: ErasureReport) -> str | None:
    """Redact residual PII in a free-text field and tally when something changed."""
    if not value:
        return value
    redacted = redact_text(value)
    if redacted != value:
        report.text_fields_redacted += 1
    return redacted


def erase_patient_data(db: Session, patient: Patient) -> ErasureReport:
    """Irreversibly pseudonymise ``patient`` and destroy their raw content.

    The caller is responsible for committing and for writing the audit entry.
    """
    now = datetime.now(UTC)
    report = ErasureReport(patient_id=patient.id)

    # 1) Deactivate + anonymise the login user.
    if patient.user_id:
        user = db.get(User, patient.user_id)
        if user is not None:
            user.email = f"erased-user-{user.id}@erased.invalid"
            user.full_name = "Erased User"
            user.phone = None
            user.designation = None
            user.password_hash = "!"
            user.must_change_password = False
            user.is_active = False
            user.deleted_at = now
            report.user_anonymised = True

    # 2) Anonymise the patient profile.
    patient.full_name = "Erased Patient"
    patient.phone = None
    patient.address = None
    patient.gender = None

    case_ids = list(db.scalars(select(Case.id).where(Case.patient_id == patient.id)).all())

    if case_ids:
        # Raw conversation content is deleted outright.
        report.chat_messages_deleted = (
            db.execute(delete(ChatMessage).where(ChatMessage.case_id.in_(case_ids))).rowcount or 0
        )

        # Residual PII in surviving free text is redacted.
        for note in db.scalars(select(ReviewNote).where(ReviewNote.case_id.in_(case_ids))).all():
            note.note = _scrub(note.note, report) or note.note

        for sym in db.scalars(select(CaseSymptom).where(CaseSymptom.case_id.in_(case_ids))).all():
            sym.notes = _scrub(sym.notes, report)

        for tl in db.scalars(select(CaseTimeline).where(CaseTimeline.case_id.in_(case_ids))).all():
            tl.onset_text = _scrub(tl.onset_text, report)
            tl.progression = _scrub(tl.progression, report)

        # Uploaded documents: delete the file and its extracted text; keep a
        # tombstone row for the audit trail.
        for doc in db.scalars(select(Document).where(Document.case_id.in_(case_ids))).all():
            delete_upload(doc.storage_path)
            db.execute(
                delete(DocumentExtraction).where(DocumentExtraction.document_id == doc.id)
            )
            doc.filename = "erased"
            doc.deleted_at = now
            report.documents_removed += 1

        # Calls: drop phone + extracted data, delete transcripts.
        calls = db.scalars(select(TeleCall).where(TeleCall.case_id.in_(case_ids))).all()
        call_ids = [c.id for c in calls]
        if call_ids:
            report.call_transcripts_deleted = (
                db.execute(
                    delete(CallTranscript).where(CallTranscript.call_id.in_(call_ids))
                ).rowcount
                or 0
            )
        for call in calls:
            call.phone_number = None
            call.extracted_data = None
            call.reason = _scrub(call.reason, report)
            call.error_detail = _scrub(call.error_detail, report)

        # Case free text + structured patient context.
        for case in db.scalars(select(Case).where(Case.id.in_(case_ids))).all():
            case.chief_concern = _scrub(case.chief_concern, report)
            case.timeline_text = _scrub(case.timeline_text, report)
            case.ai_summary = _scrub(case.ai_summary, report)
            if case.patient_context:
                case.patient_context = redact_mapping(case.patient_context)
            report.cases_scrubbed += 1

    # Voice sessions for this patient: delete utterances, drop metadata.
    sessions = db.scalars(
        select(VoiceSession).where(VoiceSession.patient_id == patient.id)
    ).all()
    session_ids = [s.id for s in sessions]
    if session_ids:
        report.voice_messages_deleted = (
            db.execute(
                delete(VoiceMessage).where(VoiceMessage.session_id.in_(session_ids))
            ).rowcount
            or 0
        )
    for session in sessions:
        session.error_detail = _scrub(session.error_detail, report)
        session.metadata_json = None

    # Withdraw every consent on record.
    for consent in db.scalars(select(Consent).where(Consent.patient_id == patient.id)).all():
        consent.status = ConsentStatus.REVOKED
        report.consents_revoked += 1

    db.flush()
    return report


__all__ = ["ErasureReport", "erase_patient_data"]
