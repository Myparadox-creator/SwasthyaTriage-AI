"""In-app voice session endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from types import SimpleNamespace

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, VoiceMessage, VoiceSession

PATIENT = "patient.anita@swasthyatriage.demo"
INTRUDER = "patient.suresh@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


@pytest.fixture()
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


def login(client: TestClient, email: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def new_case(client: TestClient, token: str) -> int:
    res = client.post(
        "/api/cases",
        json={"language": "en", "consent_accepted": True},
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def session_for(client: TestClient, token: str, case_id: int) -> str:
    res = client.post(f"/api/cases/{case_id}/voice/sessions", json={}, headers=auth(token))
    assert res.status_code == 201, res.text
    return res.json()["public_id"]


def test_voice_session_lifecycle(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = client.post(f"/api/cases/{case_id}/voice/sessions", json={}, headers=auth(token))
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["status"] == "IDLE"
    assert data["mode"] == "IN_APP"
    assert data["provider"] in ("mock", "gemini")
    sid = data["public_id"]

    turn = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"text": "fever since two days"},
        headers=auth(token),
    )
    assert turn.status_code == 200, turn.text
    body = turn.json()
    assert body["status"] == "SPEAKING"
    assert body["reply"]
    assert "fever" in body["added_symptoms"]
    assert body["can_submit"] is False
    assert body["provider"] in ("mock", "gemini")

    hist = client.get(f"/api/cases/{case_id}/voice/sessions/{sid}", headers=auth(token))
    assert hist.status_code == 200
    msgs = hist.json()["messages"]
    assert [m["role"] for m in msgs] == ["PATIENT", "AI"]
    assert msgs[1]["content"] == body["reply"]
    assert msgs[0]["had_audio"] is False

    done = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/complete", headers=auth(token)
    )
    assert done.status_code == 200
    assert done.json()["status"] == "COMPLETED"
    assert done.json()["ended_at"] is not None

    blocked = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"text": "one more thing"},
        headers=auth(token),
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "voice_session_completed"

    with SessionLocal() as db:
        session = db.scalar(select(VoiceSession).where(VoiceSession.public_id == sid))
        assert session is not None and session.status.value == "COMPLETED"
        assert db.scalar(
            select(AuditLog).where(
                AuditLog.action == "VOICE_SESSION_STARTED",
                AuditLog.case_id == case_id,
            )
        )
        assert db.scalar(
            select(AuditLog).where(
                AuditLog.action == "VOICE_SESSION_COMPLETED",
                AuditLog.case_id == case_id,
            )
        )
        messages = db.scalars(
            select(VoiceMessage).where(VoiceMessage.session_id == session.id)
        ).all()
        assert len(messages) == 2


def test_voice_audio_without_key_rejected(client: TestClient, monkeypatch):
    from services.voice import agent as voice_agent

    monkeypatch.setattr(voice_agent, "settings", SimpleNamespace(gemini_enabled=False))
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    turn = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"audio_b64": "QUJDRA==", "audio_mime": "audio/webm"},
        headers=auth(token),
    )
    assert turn.status_code == 422
    assert turn.json()["error"]["code"] == "voice_audio_unavailable"
    assert "GEMINI_API_KEY" in turn.json()["error"]["message"]

    hist = client.get(f"/api/cases/{case_id}/voice/sessions/{sid}", headers=auth(token))
    assert hist.status_code == 200
    assert hist.json()["status"] == "ERROR"
    assert "GEMINI_API_KEY" in hist.json()["error_detail"]


def test_voice_turn_requires_input(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    res = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns", json={}, headers=auth(token)
    )
    assert res.status_code == 422


def test_voice_rbac_and_notfound(client: TestClient):
    owner = login(client, PATIENT)
    case_id = new_case(client, owner)
    sid = session_for(client, owner, case_id)

    intruder = login(client, INTRUDER)
    own = client.post(
        f"/api/cases/{case_id}/voice/sessions",
        json={},
        headers=auth(intruder),
    )
    assert own.status_code == 403

    ext = client.get(f"/api/cases/{case_id}/voice/sessions/{sid}", headers=auth(intruder))
    assert ext.status_code == 403

    nf = client.get(
        f"/api/cases/{case_id}/voice/sessions/doesnotexist123", headers=auth(owner)
    )
    assert nf.status_code == 404
    assert nf.json()["error"]["code"] == "voice_session_not_found"


def test_voice_complete_idempotent(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    first = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/complete", headers=auth(token)
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/complete", headers=auth(token)
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "voice_session_completed"


def test_voice_turn_streaming_sse(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    res = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns/stream",
        json={"text": "I have had a mild cough for three days"},
        headers=auth(token),
    )
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    body = res.text
    assert "data: " in body
    assert '"type": "start"' in body
    assert '"type": "sentence"' in body
    assert '"type": "complete"' in body
    assert '"diagnostics"' in body


def test_voice_turn_emergency_instant_escalation(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    # Cardiac emergency in Hindi / Hinglish
    res = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"text": "Mujhe seene me bohot tez dard ho raha hai aur baayein haath me jaa raha hai"},
        headers=auth(token),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["can_submit"] is True
    assert "108" in body["reply"] or "112" in body["reply"]
    assert body["diagnostics"] is not None
    assert body["diagnostics"]["is_emergency"] is True


def test_voice_multilingual_and_length_turns(client: TestClient):
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    sid = session_for(client, token, case_id)

    # 1. Short Hindi turn
    turn1 = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"text": "mujhe bukhar hai"},
        headers=auth(token),
    )
    assert turn1.status_code == 200
    assert turn1.json()["diagnostics"]["processing_ms"] < 5000

    # 2. Long English turn with duration and measurements
    turn2 = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={
            "text": "I have been experiencing a persistent dry cough along with body aches and a high fever of 102 degrees for the past 4 days."
        },
        headers=auth(token),
    )
    assert turn2.status_code == 200
    assert turn2.json()["diagnostics"] is not None
    assert turn2.json()["diagnostics"]["processing_ms"] < 5000

    # 3. Odia symptom turn
    turn3 = client.post(
        f"/api/cases/{case_id}/voice/sessions/{sid}/turns",
        json={"text": "Mora 2 dina hela munda bindha o jwara heuchi"},
        headers=auth(token),
    )
    assert turn3.status_code == 200
    assert turn3.json()["reply"]