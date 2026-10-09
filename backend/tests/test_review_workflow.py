"""Review workflow endpoint tests: RBAC, facility isolation, state machine, audit."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, FollowUp, Referral, ReviewNote

PATIENT = "patient.anita@swasthyatriage.demo"
PATIENT_OTHER = "patient.suresh@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
DOCTOR_RKL = "doctor.rkl@swasthyatriage.demo"  # different facility
SUPER_ADMIN = "super@swasthyatriage.demo"
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


def create_submitted_case(client: TestClient, token: str) -> tuple[str, int]:
    """Create a case as the patient then submit it. Returns (case_number, case_id)."""
    res = client.post(
        "/api/cases", json={"language": "en", "consent_accepted": True}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    case_id = res.json()["id"]
    case_number = res.json()["case_number"]
    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(token))
    assert res.status_code == 200, res.text
    return case_number, case_id


def audit_rows(case_number: str, action: str) -> list[AuditLog]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.case_number == case_number, AuditLog.action == action
                )
            ).all()
        )


def test_unauthenticated_review_actions_rejected(client: TestClient):
    for path, body in [
        ("/api/cases/1/notes", {"note": "x"}),
        ("/api/cases/1/review", {}),
        ("/api/cases/1/escalate", {}),
        ("/api/cases/1/followups", {"reason": "x"}),
        ("/api/cases/1/referral", {}),
    ]:
        res = client.post(path, json=body)
        assert res.status_code == 401
    assert client.get("/api/followups").status_code == 401


def test_patient_cannot_perform_review_actions(client: TestClient):
    token = login(client, PATIENT)
    _, case_id = create_submitted_case(client, token)

    paths = [
        ("POST", "/notes", {"note": "patient note"}),
        ("POST", "/review", {}),
        ("POST", "/followups", {"reason": "needs info"}),
        ("POST", "/referral", {}),
        ("POST", "/assign", {}),
        ("POST", "/escalate", {"decision": "CONFIRM"}),
    ]
    for method, suffix, body in paths:
        res = client.request(
            method, f"/api/cases/{case_id}{suffix}", json=body, headers=auth(token)
        )
        assert res.status_code == 403, f"{suffix}: {res.status_code}"


def test_hcw_adds_review_note_with_audit(client: TestClient):
    patient = login(client, PATIENT)
    _, case_id = create_submitted_case(client, patient)
    nurse = login(client, NURSE)

    res = client.post(
        f"/api/cases/{case_id}/notes",
        json={"note": "Verified against original patient responses."},
        headers=auth(nurse),
    )
    assert res.status_code == 201, res.text
    note = res.json()
    assert note["note"] == "Verified against original patient responses."
    assert note["author_full_name"]

    detail = client.get(f"/api/cases/{case_id}", headers=auth(nurse))
    assert detail.status_code == 200
    assert any(n["id"] == note["id"] for n in detail.json()["review_notes"])

    with SessionLocal() as db:
        row = db.scalar(select(ReviewNote).where(ReviewNote.id == note["id"]))
        assert row is not None


def test_cross_facility_staff_blocked(client: TestClient):
    patient = login(client, PATIENT)  # BBSR facility
    case_number, case_id = create_submitted_case(client, patient)

    rkl = login(client, DOCTOR_RKL)  # Rourkela facility
    res = client.post(
        f"/api/cases/{case_id}/notes",
        json={"note": "cross facility attempt"},
        headers=auth(rkl),
    )
    assert res.status_code == 403
    res = client.get(f"/api/cases/{case_id}", headers=auth(rkl))
    assert res.status_code == 403

    # Rourkela doctor's queue must not include the BBSR case
    res = client.get("/api/cases?status=SUBMITTED", headers=auth(rkl))
    assert res.status_code == 200
    assert all(c["case_number"] != case_number for c in res.json()["items"])


def test_other_patient_blocked(client: TestClient):
    anita = login(client, PATIENT)
    _, case_id = create_submitted_case(client, anita)
    suresh = login(client, PATIENT_OTHER)
    res = client.get(f"/api/cases/{case_id}", headers=auth(suresh))
    assert res.status_code == 403


def test_mark_reviewed_transitions_and_audits(client: TestClient):
    patient = login(client, PATIENT)
    case_number, case_id = create_submitted_case(client, patient)
    nurse = login(client, NURSE)

    res = client.post(
        f"/api/cases/{case_id}/review",
        json={"note": "Reviewed — no urgent concerns.", "decision": "REVIEWED"},
        headers=auth(nurse),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["case"]["status"] == "REVIEWED"
    assert body["case"]["reviewed_at"] is not None
    assert body["note"] is not None
    assert len(audit_rows(case_number, "CASE_REVIEWED")) == 1

    # double review rejected
    res = client.post(f"/api/cases/{case_id}/review", json={}, headers=auth(nurse))
    assert res.status_code == 409


def test_request_followup_sets_status(client: TestClient):
    patient = login(client, PATIENT)
    case_number, case_id = create_submitted_case(client, patient)
    nurse = login(client, NURSE)

    res = client.post(
        f"/api/cases/{case_id}/followups",
        json={
            "reason": "Temperature not recorded at onset.",
            "items": ["temperature", "duration"],
            "questions": ["What was the highest temperature?"],
            "channel": "TELECALL",
        },
        headers=auth(nurse),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["case_id"] == case_id
    assert body["status"] == "PENDING"

    detail = client.get(f"/api/cases/{case_id}", headers=auth(nurse))
    assert detail.json()["status"] == "FOLLOW_UP_REQUIRED"
    assert detail.json()["followup_count"] >= 1
    assert len(audit_rows(case_number, "FOLLOW_UP_REQUESTED")) == 1

    with SessionLocal() as db:
        row = db.scalar(select(FollowUp).where(FollowUp.public_id == body["public_id"]))
        assert row is not None and row.items == ["temperature", "duration"]


def test_prepare_referral_preserves_case_status(client: TestClient):
    patient = login(client, PATIENT)
    case_number, case_id = create_submitted_case(client, patient)
    nurse = login(client, NURSE)

    res = client.post(
        f"/api/cases/{case_id}/referral",
        json={
            "destination_facility": "Cuttack District Community Health Centre",
            "reason_for_referral": "Further evaluation recommended.",
        },
        headers=auth(nurse),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "DRAFT"
    assert body["destination_facility"].startswith("Cuttack")
    assert body["draft"]["case_number"] == case_number

    detail = client.get(f"/api/cases/{case_id}", headers=auth(nurse))
    assert detail.json()["status"] == "SUBMITTED"  # status preserved
    assert len(audit_rows(case_number, "REFERRAL_GENERATED")) == 1

    with SessionLocal() as db:
        row = db.scalar(select(Referral).where(Referral.public_id == body["public_id"]))
        assert row is not None and row.status.value == "DRAFT"


def test_escalate_requires_confirmation(client: TestClient):
    patient = login(client, PATIENT)
    case_number, case_id = create_submitted_case(client, patient)
    nurse = login(client, NURSE)

    res = client.post(
        f"/api/cases/{case_id}/escalate",
        json={"note": "escalating"},
        headers=auth(nurse),
    )
    assert res.status_code == 422  # confirmation missing

    res = client.post(
        f"/api/cases/{case_id}/escalate",
        json={"decision": "CONFIRM", "note": "Escalated due to worsening symptoms."},
        headers=auth(nurse),
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ESCALATED"
    assert len(audit_rows(case_number, "CASE_ESCALATED")) == 1


def test_list_followups_facility_scoped(client: TestClient):
    nurse = login(client, NURSE)
    res = client.get("/api/followups", headers=auth(nurse))
    assert res.status_code == 200
    assert "items" in res.json()

    rkl = login(client, DOCTOR_RKL)
    res = client.get("/api/followups", headers=auth(rkl))
    assert res.status_code == 200

    patient = login(client, PATIENT)
    res = client.get("/api/followups", headers=auth(patient))
    assert res.status_code == 403


def test_referrals_and_audit_logs_endpoints(client: TestClient):
    nurse = login(client, NURSE)
    res = client.get("/api/referrals", headers=auth(nurse))
    assert res.status_code == 200
    assert "items" in res.json()

    res = client.get("/api/audit-logs?action=CASE_REVIEWED", headers=auth(nurse))
    assert res.status_code == 200
    assert "items" in res.json()
    assert "total" in res.json()

    super_token = login(client, SUPER_ADMIN)
    res = client.get("/api/audit-logs", headers=auth(super_token))
    assert res.status_code == 200
