"""Right-to-access: build a portable copy of everything held about a patient.

The bundle is JSON and contains the patient's own profile, their cases (with
symptoms, measurements, timeline, AI summaries), consents, voice/call records
with transcripts, uploaded-document metadata, chat messages, and the audit
entries that reference them. This is the data-subject access / portability
counterpart to :mod:`services.privacy.erasure`.

Queries are batched (one per relation, filtered by ``IN (...)``) so the export
costs a fixed number of round-trips regardless of how many cases the patient
has, rather than one query per case.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import (
    AuditLog,
    CallTranscript,
    Case,
    CaseMeasurement,
    CaseSymptom,
    CaseTimeline,
    ChatMessage,
    Consent,
    Document,
    Patient,
    TeleCall,
    VoiceMessage,
    VoiceSession,
)

EXPORT_FORMAT_VERSION = "1.0"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _enum_value(value) -> object:
    return value.value if hasattr(value, "value") else value


def _group_by(rows, key) -> dict:
    grouped: dict = defaultdict(list)
    for row in rows:
        grouped[getattr(row, key)].append(row)
    return grouped


def build_patient_export(db: Session, patient: Patient) -> dict:
    """Return a JSON-serialisable dict of all personal data held for ``patient``."""
    cases = list(
        db.scalars(select(Case).where(Case.patient_id == patient.id).order_by(Case.created_at))
    )
    case_ids = [c.id for c in cases]

    # Batch-fetch every case-scoped relation in a single query each.
    if case_ids:
        symptoms_by_case = _group_by(
            db.scalars(select(CaseSymptom).where(CaseSymptom.case_id.in_(case_ids))), "case_id"
        )
        measurements_by_case = _group_by(
            db.scalars(
                select(CaseMeasurement).where(CaseMeasurement.case_id.in_(case_ids))
            ),
            "case_id",
        )
        timelines_by_case = _group_by(
            db.scalars(select(CaseTimeline).where(CaseTimeline.case_id.in_(case_ids))), "case_id"
        )
        chats_by_case = _group_by(
            db.scalars(
                select(ChatMessage)
                .where(ChatMessage.case_id.in_(case_ids))
                .order_by(ChatMessage.created_at)
            ),
            "case_id",
        )
        documents_by_case = _group_by(
            db.scalars(select(Document).where(Document.case_id.in_(case_ids))), "case_id"
        )
        calls = list(db.scalars(select(TeleCall).where(TeleCall.case_id.in_(case_ids))))
        audit = list(
            db.scalars(
                select(AuditLog)
                .where(AuditLog.case_id.in_(case_ids))
                .order_by(AuditLog.created_at)
            )
        )
    else:
        symptoms_by_case = measurements_by_case = timelines_by_case = {}
        chats_by_case = documents_by_case = {}
        calls = []
        audit = []

    transcripts_by_call: dict = defaultdict(list)
    call_ids = [c.id for c in calls]
    if call_ids:
        transcripts_by_call = _group_by(
            db.scalars(
                select(CallTranscript)
                .where(CallTranscript.call_id.in_(call_ids))
                .order_by(CallTranscript.sequence)
            ),
            "call_id",
        )

    case_payload = [
        {
            "case_number": case.case_number,
            "status": _enum_value(case.status),
            "priority": _enum_value(case.priority),
            "source": _enum_value(case.source),
            "language": _enum_value(case.language),
            "chief_concern": case.chief_concern,
            "timeline_text": case.timeline_text,
            "patient_context": case.patient_context,
            "ai_summary": case.ai_summary,
            "missing_information": case.missing_information,
            "created_at": _iso(case.created_at),
            "submitted_at": _iso(case.submitted_at),
            "symptoms": [
                {
                    "term": s.term,
                    "severity": s.severity,
                    "notes": s.notes,
                    "collected_via": s.collected_via,
                    "verified": s.verified,
                }
                for s in symptoms_by_case.get(case.id, [])
            ],
            "measurements": [
                {"name": m.name, "value": m.value, "unit": m.unit}
                for m in measurements_by_case.get(case.id, [])
            ],
            "timeline": [
                {
                    "onset_text": t.onset_text,
                    "duration_text": t.duration_text,
                    "progression": t.progression,
                }
                for t in timelines_by_case.get(case.id, [])
            ],
            "chat_messages": [
                {
                    "role": _enum_value(c.role),
                    "content": c.content,
                    "language": c.language,
                    "created_at": _iso(c.created_at),
                }
                for c in chats_by_case.get(case.id, [])
            ],
            "documents": [
                {
                    "filename": d.filename,
                    "content_type": d.content_type,
                    "size_bytes": d.size_bytes,
                    "status": _enum_value(d.status),
                    "uploaded_at": _iso(d.created_at),
                }
                for d in documents_by_case.get(case.id, [])
            ],
        }
        for case in cases
    ]

    consents = list(
        db.scalars(
            select(Consent).where(Consent.patient_id == patient.id).order_by(Consent.recorded_at)
        )
    )

    sessions = list(
        db.scalars(select(VoiceSession).where(VoiceSession.patient_id == patient.id))
    )
    messages_by_session: dict = defaultdict(list)
    session_ids = [s.id for s in sessions]
    if session_ids:
        messages_by_session = _group_by(
            db.scalars(
                select(VoiceMessage)
                .where(VoiceMessage.session_id.in_(session_ids))
                .order_by(VoiceMessage.sequence)
            ),
            "session_id",
        )
    voice_payload = [
        {
            "mode": _enum_value(session.mode),
            "status": _enum_value(session.status),
            "language": session.language,
            "provider": session.provider,
            "started_at": _iso(session.started_at),
            "ended_at": _iso(session.ended_at),
            "messages": [
                {
                    "role": _enum_value(m.role),
                    "content": m.content,
                    "created_at": _iso(m.created_at),
                }
                for m in messages_by_session.get(session.id, [])
            ],
        }
        for session in sessions
    ]

    call_payload = [
        {
            "public_id": call.public_id,
            "direction": call.direction,
            "status": _enum_value(call.status),
            "provider": call.provider,
            "phone_number": call.phone_number,
            "reason": call.reason,
            "duration_seconds": call.duration_seconds,
            "created_at": _iso(call.created_at),
            "transcripts": [
                {
                    "role": _enum_value(t.role),
                    "content": t.content,
                    "created_at": _iso(t.created_at),
                }
                for t in transcripts_by_call.get(call.id, [])
            ],
        }
        for call in calls
    ]

    return {
        "export_format_version": EXPORT_FORMAT_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "subject": {
            "patient_id": patient.id,
            "full_name": patient.full_name,
            "phone": patient.phone,
            "age": patient.age,
            "gender": patient.gender,
            "language": _enum_value(patient.language),
            "address": patient.address,
        },
        "cases": case_payload,
        "consents": [
            {
                "status": _enum_value(c.status),
                "consent_text_version": c.consent_text_version,
                "language": _enum_value(c.language),
                "recorded_at": _iso(c.recorded_at),
            }
            for c in consents
        ],
        "voice_sessions": voice_payload,
        "telecalls": call_payload,
        "audit_trail": [
            {
                "action": a.action,
                "actor_label": a.actor_label,
                "source": a.source,
                "case_number": a.case_number,
                "created_at": _iso(a.created_at),
            }
            for a in audit
        ],
    }


__all__ = ["EXPORT_FORMAT_VERSION", "build_patient_export"]
