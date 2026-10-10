"""Test end-to-end Gemini Voice Agent and VideoSDK Telephony integration."""

import pytest

from database.session import SessionLocal
from models import Case, Facility, Patient, User
from models.enums import CaseStatus, Language, Priority, Role
from services.telephony.service import get_telephony_provider
from services.voice.agent import GeminiVoiceAgent, get_voice_agent


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def test_videosdk_provider_room_provisioning(db_session):
    provider = get_telephony_provider("videosdk")
    assert provider.name == "videosdk"
    assert provider._has_credentials() is True
    token = provider.get_auth_token()
    assert token is not None and len(token) > 20

    patient = db_session.query(Patient).first()
    facility = db_session.query(Facility).first()
    user = db_session.query(User).filter(User.role == Role.HEALTHCARE_WORKER).first()

    case = Case(
        case_number="VSDK-TEST-01",
        patient_id=patient.id,
        facility_id=facility.id,
        status=CaseStatus.SUBMITTED,
        priority=Priority.URGENT_REVIEW,
        language=Language.HI,
        chief_concern="Follow-up call test",
    )
    db_session.add(case)
    db_session.flush()

    call = provider.create_outbound_call(
        db=db_session,
        case=case,
        phone_number="+91-9876543210",
        reason="Follow up on symptoms",
        questions=["temperature", "duration"],
        requested_by=user,
    )

    assert call.id is not None
    assert call.provider == "videosdk"
    assert call.room_id is not None
    assert call.external_call_id is not None


def test_gemini_voice_agent_normal_turn(db_session):
    agent = get_voice_agent()
    assert isinstance(agent, GeminiVoiceAgent)

    patient = db_session.query(Patient).first()
    facility = db_session.query(Facility).first()

    case = Case(
        case_number="TEST-VOICE-01",
        patient_id=patient.id,
        facility_id=facility.id,
        status=CaseStatus.DRAFT,
        priority=Priority.ROUTINE,
        language=Language.HI,
        chief_concern="",
    )
    db_session.add(case)
    db_session.flush()

    # Normal Hindi symptom
    turn = agent.respond(
        db=db_session,
        case=case,
        user_text="Mujhe 2 din se halka bukhar hai aur thodi thakan lag rahi hai",
    )

    assert turn.text is not None and len(turn.text) > 0
    assert len(turn.added_symptoms) > 0
    assert any("fever" in s.lower() or "bukhar" in s.lower() for s in turn.added_symptoms)
    assert turn.is_emergency is False


def test_gemini_voice_agent_emergency_difficult_situation(db_session):
    agent = get_voice_agent()

    patient = db_session.query(Patient).first()
    facility = db_session.query(Facility).first()

    case = Case(
        case_number="EMERG-TEST-01",
        patient_id=patient.id,
        facility_id=facility.id,
        status=CaseStatus.DRAFT,
        priority=Priority.ROUTINE,
        language=Language.HI,
        chief_concern="",
    )
    db_session.add(case)
    db_session.flush()

    # Red flag emergency: severe crushing chest pain + breathlessness
    turn = agent.respond(
        db=db_session,
        case=case,
        user_text="Mujhe seene me bohot tez dard ho raha hai jo baayein haath me ja raha hai aur saans lene me bohot takleef ho rahi hai",
    )

    # Must detect emergency and provide immediate hospital/ambulance advice
    assert turn.is_emergency is True or case.priority == Priority.URGENT_REVIEW
    assert "108" in turn.text or "112" in turn.text or "emergency" in turn.text.lower() or "aspatal" in turn.text.lower() or "hospital" in turn.text.lower()
    assert case.priority == Priority.URGENT_REVIEW
