"""Self-scoped notification endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from middleware.ratelimit import limiter

PATIENT = "patient.anita@swasthyatriage.demo"
INTRUDER = "patient.suresh@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
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


def unread(client: TestClient, token: str) -> int:
    res = client.get("/api/notifications/unread-count", headers=auth(token))
    assert res.status_code == 200, res.text
    return res.json()["unread_count"]


def test_notify_staff_on_case_submit(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)
    before = unread(client, nurse)

    case_id = new_case(client, anita)
    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(anita))
    assert res.status_code == 200, res.text

    after = unread(client, nurse)
    assert after == before + 1

    lst = client.get("/api/notifications?unread_only=true", headers=auth(nurse))
    assert lst.status_code == 200
    data = lst.json()
    assert data["unread_count"] == after
    submitted = [
        n for n in data["items"] if n["type"] == "case_submitted" and n["case_id"] == case_id
    ]
    assert len(submitted) == 1
    assert "ready for review" in submitted[0]["title"] or "New assessment" in submitted[0]["title"]


def test_mark_read_self_scoped_and_idempotent(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)

    case_id = new_case(client, anita)
    assert client.post(f"/api/cases/{case_id}/submit", headers=auth(anita)).status_code == 200
    lst = client.get("/api/notifications?unread_only=true", headers=auth(nurse)).json()
    notification = next(
        n for n in lst["items"] if n["type"] == "case_submitted" and n["case_id"] == case_id
    )
    nid = notification["id"]

    read = client.post(f"/api/notifications/{nid}/read", headers=auth(nurse))
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    again = client.post(f"/api/notifications/{nid}/read", headers=auth(nurse))
    assert again.status_code == 200

    cross = client.post(f"/api/notifications/{nid}/read", headers=auth(anita))
    assert cross.status_code == 404
    assert cross.json()["error"]["code"] == "notification_not_found"


def test_read_all(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)
    before = unread(client, nurse)

    case_id = new_case(client, anita)
    assert client.post(f"/api/cases/{case_id}/submit", headers=auth(anita)).status_code == 200
    created = unread(client, nurse)
    assert created == before + 1

    res = client.post("/api/notifications/read-all", headers=auth(nurse))
    assert res.status_code == 200
    assert res.json()["updated"] == created

    assert unread(client, nurse) == 0


def test_notify_patient_on_review(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)

    case_id = new_case(client, anita)
    assert client.post(f"/api/cases/{case_id}/submit", headers=auth(anita)).status_code == 200

    review = client.post(
        f"/api/cases/{case_id}/review",
        json={"decision": "REVIEWED"},
        headers=auth(nurse),
    )
    assert review.status_code == 200, review.text

    lst = client.get("/api/notifications?unread_only=true", headers=auth(anita))
    data = lst.json()
    assert any(
        n["type"] == "case_reviewed" and n["case_id"] == case_id for n in data["items"]
    )


def test_notify_patient_and_staff_on_followup(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)
    doctor = login(client, "doctor.bbsr@swasthyatriage.demo")

    case_id = new_case(client, anita)
    assert client.post(f"/api/cases/{case_id}/submit", headers=auth(anita)).status_code == 200

    anita_before = unread(client, anita)
    doctor_before = unread(client, doctor)

    fu = client.post(
        f"/api/cases/{case_id}/followups",
        json={"reason": "Need temperature readings", "channel": "CHAT"},
        headers=auth(nurse),
    )
    assert fu.status_code == 201, fu.text

    assert unread(client, anita) == anita_before + 1
    assert unread(client, doctor) >= doctor_before + 1
    staff = client.get("/api/notifications?unread_only=true", headers=auth(doctor)).json()
    assert any(
        n["type"] == "follow_up_requested" and n["case_id"] == case_id for n in staff["items"]
    )


def test_cross_user_isolation(client: TestClient):
    anita = login(client, PATIENT)
    nurse = login(client, NURSE)
    intruder = login(client, INTRUDER)

    case_id = new_case(client, anita)
    assert client.post(f"/api/cases/{case_id}/submit", headers=auth(anita)).status_code == 200

    nurse_list = client.get("/api/notifications", headers=auth(nurse)).json()
    some_id = nurse_list["items"][0]["id"]

    intruder_list = client.get("/api/notifications", headers=auth(intruder))
    assert intruder_list.status_code == 200
    ids = {n["id"] for n in intruder_list.json()["items"]}
    assert some_id not in ids

    res = client.post(f"/api/notifications/{some_id}/read", headers=auth(intruder))
    assert res.status_code == 404