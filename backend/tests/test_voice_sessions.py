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
    assert data["provider"] == "mock"
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
    assert body["provider"] == "mock"

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