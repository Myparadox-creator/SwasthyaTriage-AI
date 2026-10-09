"""Auth + RBAC verification tests."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

import main
from middleware.ratelimit import limiter

DOCTOR = "doctor.bbsr@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
ADMIN = "admin.bbsr@swasthyatriage.demo"
SUPER = "super@swasthyatriage.demo"
PATIENT = "patient.ramesh@swasthyatriage.demo"
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
    return res.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_login_success_resolves_role_and_facility(client: TestClient):
    data = login(client, DOCTOR)
    assert data["user"]["role"] == "HEALTHCARE_WORKER"
    assert data["user"]["facility_name"] == "Bhubaneswar Town PHC"
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0


def test_login_wrong_password_401(client: TestClient):
    res = client.post("/api/auth/login", json={"email": DOCTOR, "password": "WrongPass123"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_login_unknown_email_401(client: TestClient):
    res = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "WrongPass123"}
    )
    assert res.status_code == 401


def test_me_requires_token(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth("garbage.token.here")).status_code == 401


def test_me_returns_current_user(client: TestClient):
    data = login(client, PATIENT)
    me = client.get("/api/auth/me", headers=auth(data["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == PATIENT
    assert me.json()["role"] == "PATIENT"


def test_healthcare_worker_cannot_list_staff(client: TestClient):
    data = login(client, NURSE)
    res = client.get("/api/auth/staff", headers=auth(data["access_token"]))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_patient_cannot_list_staff(client: TestClient):
    data = login(client, PATIENT)
    res = client.get("/api/auth/staff", headers=auth(data["access_token"]))
    assert res.status_code == 403


def test_facility_admin_sees_only_own_facility(client: TestClient):
    data = login(client, ADMIN)
    res = client.get("/api/auth/staff", headers=auth(data["access_token"]))
    assert res.status_code == 200
    staff = res.json()
    assert len(staff) >= 3
    facility_ids = {u["facility_id"] for u in staff}
    assert facility_ids == {data["user"]["facility_id"]}


def test_super_admin_sees_multiple_facilities(client: TestClient):
    data = login(client, SUPER)
    res = client.get("/api/auth/staff", headers=auth(data["access_token"]))
    assert res.status_code == 200
    facility_ids = {u["facility_id"] for u in res.json() if u["facility_id"]}
    assert len(facility_ids) >= 2


def test_signup_patient_and_duplicate_email(client: TestClient):
    unique = uuid.uuid4().hex[:10]
    payload = {
        "email": f"new.patient.{unique}@example.com",
        "password": "NewPatient@123",
        "full_name": "Test Patient",
        "phone": f"+91-9999{uuid.uuid4().hex[:6]}",
        "language": "hi",
    }
    res = client.post("/api/auth/signup", json=payload)
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "PATIENT"

    again = client.post("/api/auth/signup", json=payload)
    assert again.status_code == 409


def test_refresh_and_logout_rotation(client: TestClient):
    client.post("/api/auth/login", json={"email": DOCTOR, "password": PASSWORD})
    assert "st_refresh" in client.cookies

    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert "access_token" in refreshed.json()

    out = client.post("/api/auth/logout")
    assert out.status_code == 200

    after_logout = client.post("/api/auth/refresh")
    assert after_logout.status_code == 401
