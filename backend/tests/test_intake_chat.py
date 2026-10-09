"""Fallback intake engine + chat endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import Case, ChatMessage
from services.intake.fallback import extract_from_message

PATIENT = "patient.anita@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


@pytest.fixture()
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


def login(client: TestClient, email: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- extraction unit tests -------------------------------------------------


def test_extract_symptoms_multilingual_english():
    ex = extract_from_message("I have fever and a bad cough since 3 days")
    assert "fever" in ex.symptoms
    assert "cough" in ex.symptoms
    assert ex.duration_days == 3


def test_extract_symptoms_hindi():
    ex = extract_from_message("mujhe bukhar aur khansi hai, sir dard bhi")
    assert ex.symptoms == ["fever", "cough", "headache"]


def test_extract_symptoms_odia():
    ex = extract_from_message("ମତେ ଜ୍ୱର ଏବଂ କାଶ ହେଉଛି")
    assert "fever" in ex.symptoms
    assert "cough" in ex.symptoms


def test_extract_temperature_fahrenheit_and_celsius():
    ex = extract_from_message("temperature 100 F hai")
    value, unit = ex.temperature
    assert unit == "°F"
    assert abs(float(value) - 100.0) < 0.01

    ex2 = extract_from_message("taap 38.5 degree hai")
    value2, unit2 = ex2.temperature
    assert unit2 == "°C"
    assert abs(float(value2) - 38.5) < 0.01


def test_extract_duration_words():
    assert extract_from_message("two din se bukhar").duration_days == 2
    assert extract_from_message("dryness for five days").duration_days == 5
    assert extract_from_message("a few days").duration_days == 2


def test_extract_severity():
    assert extract_from_message("bahut teevra dard hai").severity == "severe"
    assert extract_from_message("mild halka sa bukhar").severity == "mild"


def test_extract_phone_number_not_temperature():
    ex = extract_from_message("call me at 9876543210")
    assert ex.temperature is None


# --- API chat flow ---------------------------------------------------------


def _new_draft_case(client: TestClient, token: str) -> int:
    res = client.post(
        "/api/cases",
        json={
            "language": "hi",
            "chief_concern": "pichhle kaafi din se bukhar",
            "consent_accepted": True,
        },
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _send(client: TestClient, token: str, case_id: int, message: str) -> dict:
    res = client.post(
        f"/api/cases/{case_id}/chat",
        json={"message": message, "channel": "CHAT"},
        headers=auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_simple_chat_flow_reaches_completion(client: TestClient):
    token = login(client, PATIENT)
    case_id = _new_draft_case(client, token)

    r1 = _send(client, token, case_id, "mujhe bukhar aur khansi hai")
    assert "fever" in r1["reply"]
    assert r1["added_symptoms"] == ["fever", "cough"]
    assert r1["can_submit"] is False

    _send(client, token, case_id, "pichhle 2 din se")
    _send(client, token, case_id, "mujhe 100 F taap hai")
    r = _send(client, token, case_id, "nahe, saans me koi dikkat nahi")
    assert r["progress"]["answered"] >= 4

    _send(client, token, case_id, "koi dawai nahi le rahi")
    _send(client, token, case_id, "koi bimari ka history nahi hai")
    _send(client, token, case_id, "mild")
    _send(client, token, case_id, "han, thik se kha rahi hu")
    _send(client, token, case_id, "nahi, ulti nahi aa rahi")
    _send(client, token, case_id, "koi doctor ko nahi dikhaya")
    final = _send(client, token, case_id, "mera beta, Rohan, kolabb kolabb")

    assert final["progress"]["answered"] == final["progress"]["total"]
    assert final["progress"]["percent"] == 100
    assert final["can_submit"] is True

    with SessionLocal() as db:
        case = db.get(Case, case_id)
        terms = sorted(s.normalized_term for s in case.symptoms)
        assert "fever" in terms and "cough" in terms
        assert any(m.name.lower() == "temperature" for m in case.measurements)
        msgs = db.scalars(
            select(ChatMessage)
            .where(ChatMessage.case_id == case_id)
            .order_by(ChatMessage.created_at)
        ).all()
        assert len(msgs) >= 2
        assert msgs[0].role.value == "PATIENT"
        assert msgs[-1].role.value == "AI"


def test_chat_history_and_questions(client: TestClient):
    token = login(client, PATIENT)
    case_id = _new_draft_case(client, token)
    _send(client, token, case_id, "sir dard aur bukhar hai")

    res = client.get(f"/api/cases/{case_id}/chat", headers=auth(token))
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "DRAFT"
    assert len(data["messages"]) == 2
    codes = [q["code"] for q in data["questions"]]
    assert "temperature" in codes
    # symptoms present -> emergency_signs satisfied; duration not yet answered
    satisfied = {q["code"] for q in data["questions"] if q["satisfied"]}
    assert "emergency_signs" in satisfied


def test_chat_blocked_after_submit(client: TestClient):
    token = login(client, PATIENT)
    case_id = _new_draft_case(client, token)
    _send(client, token, case_id, "mujhe bukhar hai")

    res = client.post(
        f"/api/cases/{case_id}/submit",
        headers=auth(token),
    )
    assert res.status_code == 200, res.text

    res = client.post(
        f"/api/cases/{case_id}/chat",
        json={"message": "aur khansi bhi", "channel": "CHAT"},
        headers=auth(token),
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "already_submitted"


def test_emergency_chat_allowed_after_submit(client: TestClient):
    token = login(client, PATIENT)
    case_id = _new_draft_case(client, token)
    _send(client, token, case_id, "mujhe bukhar hai")

    res = client.post(
        f"/api/cases/{case_id}/submit",
        headers=auth(token),
    )
    assert res.status_code == 200, res.text

    # Urgent emergency message post-submit is accepted and prioritized
    res = client.post(
        f"/api/cases/{case_id}/chat",
        json={"message": "Emergency! Chhati me bahut tej dard hai, help!", "channel": "CHAT"},
        headers=auth(token),
    )
    assert res.status_code == 200


def test_other_patient_cannot_view_chat(client: TestClient):
    owner = login(client, PATIENT)
    case_id = _new_draft_case(client, owner)
    _send(client, owner, case_id, "mujhe bukhar hai")

    intruder = login(client, "patient.suresh@swasthyatriage.demo")
    res = client.get(f"/api/cases/{case_id}/chat", headers=auth(intruder))
    assert res.status_code == 403
