"""Follow-up lifecycle: start/complete/cancel, data writes, safety re-run, RBAC."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, Case, CaseMeasurement, FollowUp, Notification

PATIENT = "patient.anita@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
DOCTOR_BBSR = "doctor.bbsr@swasthyatriage.demo"
DOCTOR_RKL = "doctor.rkl@swasthyatriage.demo"
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


def make_followup(
    client: TestClient, patient_token: str, nurse_token: str, items: list[str]
) -> tuple[int, int, str]:
    """Returns (case_id, followup_id, case_number)."""
    res = client.post(
        "/api/cases", json={"language": "en", "consent_accepted": True}, headers=auth(patient_token)
    )
    assert res.status_code == 201, res.text
    case_id = res.json()["id"]
    case_number = res.json()["case_number"]
    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(patient_token))
    assert res.status_code == 200, res.text
    res = client.post(
        f"/api/cases/{case_id}/followups",
        json={
            "reason": "Missing temperature and medication history.",
            "items": items,
            "questions": ["What was the highest temperature measured?"],
            "channel": "TELECALL",
        },
        headers=auth(nurse_token),
    )
    assert res.status_code == 201, res.text
    return case_id, res.json()["id"], case_number


def audit_count(case_number: str, action: str) -> int:
    with SessionLocal() as db:
        return len(
            list(
                db.scalars(
                    select(AuditLog).where(
                        AuditLog.case_number == case_number, AuditLog.action == action
                    )
                ).all()
            )
        )


def test_full_followup_lifecycle_with_data_writes(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    doctor = login(client, DOCTOR_BBSR)  # completer differs from requester
    case_id, fu_id, case_number = make_followup(
        client, patient, nurse, ["temperature", "duration", "current_medication"]
    )

    res = client.get(f"/api/followups/{fu_id}", headers=auth(doctor))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PENDING"
    assert res.json()["case_number"] == case_number

    res = client.post(f"/api/followups/{fu_id}/start", headers=auth(doctor))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "IN_PROGRESS"
    assert audit_count(case_number, "FOLLOW_UP_STARTED") == 1

    res = client.post(f"/api/followups/{fu_id}/start", headers=auth(doctor))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "already_started"

    res = client.post(
        f"/api/followups/{fu_id}/complete",
        json={
            "answers": [
                {"item": "temperature", "value": "101.2 F"},
                {"item": "duration", "value": "3 days"},
                {"item": "current_medication", "value": "Amlodipine 5mg"},
            ],
            "summary": "Temperature recorded during call.",
        },
        headers=auth(doctor),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["completed_at"] is not None
    assert body["result_summary"]["answers"]["temperature"] == "101.2 F"
    assert body["result_summary"]["summary"] == "Temperature recorded during call."

    assert audit_count(case_number, "FOLLOW_UP_COMPLETED") == 1

    with SessionLocal() as db:
        fu = db.get(FollowUp, fu_id)
        assert fu is not None and fu.status.value == "COMPLETED"
        assert fu.updated_at is not None

        measurement = db.scalar(
            select(CaseMeasurement).where(
                CaseMeasurement.case_id == case_id, CaseMeasurement.name == "Temperature"
            )
        )
        assert measurement is not None
        assert measurement.value == "101.2"
        assert measurement.unit == "°F"
        assert measurement.source.value == "PATIENT_REPORTED"
        assert measurement.collected_via == "FOLLOW_UP"

        case = db.get(Case, case_id)
        assert case is not None
        assert (case.patient_context or {}).get("answers", {}).get("duration") == "3 days"
        assert (case.patient_context or {}).get("answers", {}).get(
            "current_medication"
        ) == "Amlodipine 5mg"
        # missing-information list drops what the follow-up answered
        assert case.missing_information == ["Known medical history"]

        note = db.scalar(
            select(Notification).where(
                Notification.user_id == fu.requested_by_user_id,
                Notification.type == "FOLLOW_UP_COMPLETED",
                Notification.case_id == case_id,
            )
        )
        assert note is not None

    # completion not allowed twice
    res = client.post(f"/api/followups/{fu_id}/complete", json={}, headers=auth(nurse))
    assert res.status_code == 409
    res = client.post(f"/api/followups/{fu_id}/cancel", headers=auth(nurse))
    assert res.status_code == 409


def test_followup_completion_reruns_safety_engine(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    case_id, fu_id, case_number = make_followup(client, patient, nurse, ["temperature"])

    # Nothing urgent before completion
    with SessionLocal() as db:
        case = db.get(Case, case_id)
        assert case is not None and case.priority.value != "URGENT_REVIEW"

    res = client.post(
        f"/api/followups/{fu_id}/complete",
        json={"answers": [{"item": "temperature", "value": "104 F"}]},
        headers=auth(nurse),
    )
    assert res.status_code == 200, res.text

    with SessionLocal() as db:
        case = db.get(Case, case_id)
        assert case is not None and case.priority.value == "URGENT_REVIEW"
        signals = [s.rule_code for s in case.safety_signals]
        assert "HIGH_FEVER" in signals

    rows = audit_count(case_number, "SAFETY_SIGNAL_GENERATED")
    assert rows >= 1
    with SessionLocal() as db:
        log = db.scalar(
            select(AuditLog).where(
                AuditLog.case_number == case_number,
                AuditLog.action == "SAFETY_SIGNAL_GENERATED",
            )
        )
        assert log is not None
        assert log.metadata_json.get("trigger") == "followup"
        assert log.metadata_json.get("rule_code") == "HIGH_FEVER"


def test_complete_rejects_unrequested_items(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, fu_id, _ = make_followup(client, patient, nurse, ["temperature"])

    res = client.post(
        f"/api/followups/{fu_id}/complete",
        json={"answers": [{"item": "medical_history", "value": "diabetes"}]},
        headers=auth(nurse),
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "unexpected_item"

    with SessionLocal() as db:
        fu = db.get(FollowUp, fu_id)
        assert fu is not None and fu.status.value == "PENDING"


def test_cancel_flow_and_invalid_transitions(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, fu_id, case_number = make_followup(client, patient, nurse, ["temperature"])

    res = client.post(
        f"/api/followups/{fu_id}/cancel",
        json={"reason": "Patient unreachable"},
        headers=auth(nurse),
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "CANCELLED"
    assert audit_count(case_number, "FOLLOW_UP_CANCELLED") == 1

    res = client.post(f"/api/followups/{fu_id}/start", headers=auth(nurse))
    assert res.status_code == 409
    res = client.post(f"/api/followups/{fu_id}/complete", json={}, headers=auth(nurse))
    assert res.status_code == 409


def test_followup_rbac_and_facility_isolation(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, fu_id, _ = make_followup(client, patient, nurse, ["temperature"])

    assert client.get(f"/api/followups/{fu_id}").status_code == 401
    assert client.get(f"/api/followups/{fu_id}", headers=auth(patient)).status_code == 403
    assert client.post(f"/api/followups/{fu_id}/start", headers=auth(patient)).status_code == 403

    rkl = login(client, DOCTOR_RKL)  # different facility
    assert client.get(f"/api/followups/{fu_id}", headers=auth(rkl)).status_code == 403
    assert client.post(f"/api/followups/{fu_id}/start", headers=auth(rkl)).status_code == 403
    assert client.get("/api/followups/99999999", headers=auth(nurse)).status_code == 404
