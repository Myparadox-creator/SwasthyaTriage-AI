"""Referral lifecycle: patch/verify/finalize/revise, version conflicts, RBAC."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, Case, Notification, Referral

PATIENT = "patient.anita@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
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


def make_draft_referral(
    client: TestClient, patient_token: str, nurse_token: str
) -> tuple[int, int, str]:
    """Returns (case_id, referral_id, case_number) — referral in DRAFT."""
    res = client.post(
        "/api/cases", json={"language": "en", "consent_accepted": True}, headers=auth(patient_token)
    )
    assert res.status_code == 201, res.text
    case_id = res.json()["id"]
    case_number = res.json()["case_number"]
    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(patient_token))
    assert res.status_code == 200, res.text
    res = client.post(
        f"/api/cases/{case_id}/referral",
        json={
            "destination_facility": "Cuttack District Hospital",
            "reason_for_referral": "Further evaluation recommended.",
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


def test_verify_finalize_with_version_conflict(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    case_id, ref_id, case_number = make_draft_referral(client, patient, nurse)

    res = client.get(f"/api/referrals/{ref_id}", headers=auth(nurse))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "DRAFT"
    assert res.json()["version"] == 1

    # finalize before verify -> 409
    res = client.post(f"/api/referrals/{ref_id}/finalize", json={"version": 1}, headers=auth(nurse))
    assert res.status_code == 409

    res = client.post(f"/api/referrals/{ref_id}/verify", headers=auth(nurse))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "VERIFIED"
    assert body["verified_at"] is not None
    assert audit_count(case_number, "REFERRAL_VERIFIED") == 1

    res = client.post(f"/api/referrals/{ref_id}/verify", headers=auth(nurse))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "already_verified"

    # stale version rejected
    res = client.post(
        f"/api/referrals/{ref_id}/finalize", json={"version": 99}, headers=auth(nurse)
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "version_conflict"

    res = client.post(f"/api/referrals/{ref_id}/finalize", json={"version": 1}, headers=auth(nurse))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "FINALIZED"
    assert res.json()["finalized_at"] is not None
    assert audit_count(case_number, "REFERRAL_FINALIZED") == 1

    with SessionLocal() as db:
        case = db.get(Case, case_id)
        assert case is not None and case.status.value == "REFERRED"

        ref = db.get(Referral, ref_id)
        assert ref is not None and ref.finalized_by_user_id is not None

        # patient got the in-app notification
        note = db.scalar(
            select(Notification).where(
                Notification.type == "REFERRAL_FINALIZED",
                Notification.case_id == case_id,
            )
        )
        assert note is not None

    # double finalize rejected
    res = client.post(f"/api/referrals/{ref_id}/finalize", json={"version": 1}, headers=auth(nurse))
    assert res.status_code == 409


def test_revise_creates_new_draft_version_chain(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, ref_id, case_number = make_draft_referral(client, patient, nurse)

    # revise on a DRAFT is rejected — edit it directly instead
    res = client.post(f"/api/referrals/{ref_id}/revise", headers=auth(nurse))
    assert res.status_code == 409

    res = client.post(f"/api/referrals/{ref_id}/verify", headers=auth(nurse))
    assert res.status_code == 200, res.text

    res = client.post(f"/api/referrals/{ref_id}/revise", headers=auth(nurse))
    assert res.status_code == 201, res.text
    revision = res.json()
    assert revision["status"] == "DRAFT"
    assert revision["version"] == 2
    assert revision["supersedes_id"] == ref_id
    assert revision["destination_facility"] == "Cuttack District Hospital"
    assert audit_count(case_number, "REFERRAL_REVISED") == 1

    with SessionLocal() as db:
        original = db.get(Referral, ref_id)
        assert original is not None
        assert original.status.value == "VERIFIED"  # untouched
        assert original.version == 1

    # patch works on the revision (DRAFT), not on the verified original
    res = client.patch(
        f"/api/referrals/{ref_id}",
        json={"destination_facility": "Should Not Apply"},
        headers=auth(nurse),
    )
    assert res.status_code == 409
    res = client.patch(
        f"/api/referrals/{revision['id']}",
        json={"destination_facility": "Rourkela District Hospital"},
        headers=auth(nurse),
    )
    assert res.status_code == 200, res.text
    assert res.json()["destination_facility"] == "Rourkela District Hospital"
    assert res.json()["version"] == 2  # PATCH does not bump version
    assert audit_count(case_number, "REFERRAL_UPDATED") == 1


def test_patch_validates_and_audits(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, ref_id, _ = make_draft_referral(client, patient, nurse)

    res = client.patch(f"/api/referrals/{ref_id}", json={}, headers=auth(nurse))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "no_changes"

    res = client.patch(
        f"/api/referrals/{ref_id}",
        json={"reason_for_referral": "Updated clinical reasoning."},
        headers=auth(nurse),
    )
    assert res.status_code == 200
    assert res.json()["reason_for_referral"] == "Updated clinical reasoning."


def test_referral_rbac_and_facility_isolation(client: TestClient):
    patient = login(client, PATIENT)
    nurse = login(client, NURSE)
    _, ref_id, _ = make_draft_referral(client, patient, nurse)

    assert client.get(f"/api/referrals/{ref_id}").status_code == 401
    assert client.get(f"/api/referrals/{ref_id}", headers=auth(patient)).status_code == 403
    assert client.post(f"/api/referrals/{ref_id}/verify", headers=auth(patient)).status_code == 403

    rkl = login(client, DOCTOR_RKL)
    assert client.get(f"/api/referrals/{ref_id}", headers=auth(rkl)).status_code == 403
    assert client.post(f"/api/referrals/{ref_id}/verify", headers=auth(rkl)).status_code == 403
    assert client.get("/api/referrals/99999999", headers=auth(nurse)).status_code == 404
