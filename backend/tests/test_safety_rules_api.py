"""Safety rule configuration API tests: RBAC, validation, versioning, scoping."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, Facility, SafetyRule

NURSE = "nurse.bbsr@swasthyatriage.demo"
DOCTOR_RKL = "doctor.rkl@swasthyatriage.demo"
SUPER_ADMIN = "super@swasthyatriage.demo"
PATIENT = "patient.anita@swasthyatriage.demo"
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


def make_rule_payload(code: str = "TEST_RULE_ONE", **overrides) -> dict:
    payload = {
        "code": code,
        "name": "Test configured rule",
        "match_patterns": ["test symptom phrase"],
        "target_priority": "REVIEW_REQUIRED",
        "display_message": "Configured safety signal detected.",
    }
    payload.update(overrides)
    return payload


def cleanup_rule(code: str) -> None:
    with SessionLocal() as db:
        row = db.scalar(select(SafetyRule).where(SafetyRule.code == code))
        if row is not None:
            db.delete(row)
            db.commit()


def test_rules_require_staff(client: TestClient):
    assert client.get("/api/safety/rules").status_code == 401

    patient = login(client, PATIENT)
    assert client.get("/api/safety/rules", headers=auth(patient)).status_code == 403
    assert (
        client.post(
            "/api/safety/rules", json=make_rule_payload(), headers=auth(patient)
        ).status_code
        == 403
    )

    nurse = login(client, NURSE)
    res = client.get("/api/safety/rules", headers=auth(nurse))
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1  # seeded global rules are visible

    # Read yes, write no for HCW
    res = client.post("/api/safety/rules", json=make_rule_payload(), headers=auth(nurse))
    assert res.status_code == 403


def test_super_admin_creates_rule_with_audit(client: TestClient):
    code = "TEST_RULE_CREATE"
    cleanup_rule(code)
    super_token = login(client, SUPER_ADMIN)
    try:
        res = client.post(
            "/api/safety/rules", json=make_rule_payload(code), headers=auth(super_token)
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["code"] == code
        assert body["version"] == 1
        assert body["is_active"] is True

        # duplicate rejected
        res = client.post(
            "/api/safety/rules", json=make_rule_payload(code), headers=auth(super_token)
        )
        assert res.status_code == 409

        # visible to nurse in list
        nurse = login(client, NURSE)
        res = client.get("/api/safety/rules", headers=auth(nurse))
        assert any(r["code"] == code for r in res.json())

        with SessionLocal() as db:
            logs = db.scalars(
                select(AuditLog).where(
                    AuditLog.action == "SAFETY_RULE_UPDATED", AuditLog.actor_role == "SUPER_ADMIN"
                )
            ).all()
            created = [log for log in logs if (log.metadata_json or {}).get("event") == "created"]
            assert any((log.metadata_json or {}).get("rule_code") == code for log in created)
    finally:
        cleanup_rule(code)


def test_create_rejects_invalid_payloads(client: TestClient):
    super_token = login(client, SUPER_ADMIN)

    bad_payloads = [
        make_rule_payload("lowercase_code"),  # not UPPER_SNAKE
        make_rule_payload("NO_PATTERNS", match_patterns=[]),  # no evidence source
        make_rule_payload("BAD_CONDITION", field_condition={"measurement": "temperature"}),
        make_rule_payload("BAD_COMBO", field_condition={"duration_days_gte": 3, "gte": 100}),
        make_rule_payload("NO_EVIDENCE", match_patterns=[], field_condition=None),
        make_rule_payload("UNKNOWN_FACILITY", facility_id=999999),
    ]
    for payload in bad_payloads:
        res = client.post("/api/safety/rules", json=payload, headers=auth(super_token))
        assert res.status_code == 422, f"{payload['code']}: {res.status_code} {res.text}"


def test_update_requires_matching_version(client: TestClient):
    code = "TEST_RULE_VERSION"
    cleanup_rule(code)
    super_token = login(client, SUPER_ADMIN)
    try:
        created = client.post(
            "/api/safety/rules", json=make_rule_payload(code), headers=auth(super_token)
        ).json()

        # stale version
        res = client.patch(
            f"/api/safety/rules/{created['id']}",
            json={"version": created["version"] + 5, "is_active": False},
            headers=auth(super_token),
        )
        assert res.status_code == 409

        # correct version
        res = client.patch(
            f"/api/safety/rules/{created['id']}",
            json={"version": created["version"], "is_active": False, "name": "Renamed rule"},
            headers=auth(super_token),
        )
        assert res.status_code == 200, res.text
        updated = res.json()
        assert updated["version"] == 2
        assert updated["is_active"] is False
        assert updated["name"] == "Renamed rule"
        assert updated["updated_by_user_id"] is not None

        # deactivated rules hidden by default, visible with include_inactive
        nurse = login(client, NURSE)
        default_list = client.get("/api/safety/rules", headers=auth(nurse)).json()
        assert not any(r["code"] == code for r in default_list)
        with_inactive = client.get(
            "/api/safety/rules?include_inactive=true", headers=auth(nurse)
        ).json()
        assert any(r["code"] == code and r["is_active"] is False for r in with_inactive)

        with SessionLocal() as db:
            logs = db.scalars(
                select(AuditLog).where(AuditLog.action == "SAFETY_RULE_UPDATED")
            ).all()
            updated_logs = [
                log
                for log in logs
                if (log.metadata_json or {}).get("event") == "updated"
                and (log.metadata_json or {}).get("rule_code") == code
            ]
            assert updated_logs
            assert updated_logs[-1].metadata_json["version"] == 2
    finally:
        cleanup_rule(code)


def test_facility_scoped_visibility(client: TestClient):
    code_bbsr = "TEST_RULE_BBSR"
    code_rkl = "TEST_RULE_RKL"
    cleanup_rule(code_bbsr)
    cleanup_rule(code_rkl)
    super_token = login(client, SUPER_ADMIN)
    with SessionLocal() as db:
        facilities = {f.code: f.id for f in db.scalars(select(Facility)).all()}
    bbsr_id = facilities["PHC-OD-BBSR-01"]
    rkl_id = facilities["HOSP-OD-RKL-03"]
    try:
        assert (
            client.post(
                "/api/safety/rules",
                json=make_rule_payload(code_bbsr, facility_id=bbsr_id),
                headers=auth(super_token),
            ).status_code
            == 201
        )
        assert (
            client.post(
                "/api/safety/rules",
                json=make_rule_payload(code_rkl, facility_id=rkl_id),
                headers=auth(super_token),
            ).status_code
            == 201
        )

        nurse = login(client, NURSE)  # BBSR facility
        codes = {r["code"] for r in client.get("/api/safety/rules", headers=auth(nurse)).json()}
        assert code_bbsr in codes
        assert code_rkl not in codes

        doctor_rkl = login(client, DOCTOR_RKL)
        codes = {
            r["code"] for r in client.get("/api/safety/rules", headers=auth(doctor_rkl)).json()
        }
        assert code_rkl in codes
        assert code_bbsr not in codes
    finally:
        cleanup_rule(code_bbsr)
        cleanup_rule(code_rkl)
