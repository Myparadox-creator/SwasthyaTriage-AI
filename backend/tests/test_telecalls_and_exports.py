"""Tests for tele-calling, Excel exports, and administrative endpoints."""

from __future__ import annotations

import io

import openpyxl
import pytest
from fastapi.testclient import TestClient

import main
from middleware.ratelimit import limiter

SUPER_ADMIN = "super@swasthyatriage.demo"
DOCTOR = "doctor.bbsr@swasthyatriage.demo"
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


def test_excel_export_generation(client: TestClient):
    """Excel export should return a valid multi-sheet .xlsx stream."""
    token = login(client, DOCTOR)
    res = client.get("/api/exports/excel", headers=auth(token))
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]

    # Verify Excel workbook structure with openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    expected_sheets = {"Cases", "Voice Sessions", "Follow-ups", "Referrals", "Audit Summary"}
    assert expected_sheets.issubset(set(wb.sheetnames))


def test_telecall_lifecycle(client: TestClient):
    """Healthcare worker should create, start, step, and complete an outbound telecall."""
    token = login(client, DOCTOR)

    # 1. Fetch an existing case
    case_res = client.get("/api/cases", headers=auth(token))
    assert case_res.status_code == 200
    cases = case_res.json()["items"]
    assert len(cases) > 0
    case_id = cases[0]["id"]

    # 2. Create outbound tele-call
    create_res = client.post(
        "/api/telecalls",
        json={
            "case_id": case_id,
            "phone_number": "+91-9876543210",
            "reason": "Test Follow-up",
            "questions": ["temperature", "medication"],
        },
        headers=auth(token),
    )
    assert create_res.status_code == 201
    call_data = create_res.json()
    call_id = call_data["id"]
    assert call_data["status"] == "REQUESTED"

    # 3. Start call
    start_res = client.post(f"/api/telecalls/{call_id}/start", headers=auth(token))
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "CONNECTED"

    # 4. Run turn
    step_res = client.post(f"/api/telecalls/{call_id}/step", json={}, headers=auth(token))
    assert step_res.status_code == 200
    turn_data = step_res.json()
    assert turn_data["agent_question"]
    assert turn_data["patient_response"]

    # 5. Complete call
    comp_res = client.post(f"/api/telecalls/{call_id}/complete", headers=auth(token))
    assert comp_res.status_code == 200
    assert comp_res.json()["status"] == "COMPLETED"


def test_admin_facilities_and_analytics(client: TestClient):
    """Super Admin should list facilities and retrieve analytics."""
    token = login(client, SUPER_ADMIN)

    fac_res = client.get("/api/admin/facilities", headers=auth(token))
    assert fac_res.status_code == 200
    assert len(fac_res.json()) > 0

    analytics_res = client.get("/api/admin/analytics", headers=auth(token))
    assert analytics_res.status_code == 200
    data = analytics_res.json()
    assert "total_cases" in data
    assert "priority_distribution" in data
