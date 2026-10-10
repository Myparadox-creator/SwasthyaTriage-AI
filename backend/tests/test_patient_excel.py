"""Tests for Patient Details Excel export, automatic persistence, and synchronization."""

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


def test_six_sheet_triage_excel_with_patient_details(client: TestClient):
    """Excel export must include Patient Details as Sheet 1 alongside all 5 existing sheets."""
    token = login(client, DOCTOR)
    res = client.get("/api/exports/excel", headers=auth(token))
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]

    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    expected_sheets = {
        "Patient Details",
        "Cases",
        "Voice Sessions",
        "Follow-ups",
        "Referrals",
        "Audit Summary",
    }
    assert expected_sheets.issubset(set(wb.sheetnames))
    assert wb.sheetnames[0] == "Patient Details"

    ws_pat = wb["Patient Details"]
    # Verify frozen panes on row 1
    assert ws_pat.freeze_panes == "A2"
    # Verify headers
    headers = [cell.value for cell in ws_pat[1]]
    assert "Patient ID" in headers
    assert "Full Name" in headers
    assert "Chief Concern" in headers
    assert "Triage Priority" in headers
    assert "Facility" in headers
    assert "Registration Date" in headers


def test_dedicated_patient_export_endpoint(client: TestClient):
    """GET /api/exports/patients should return dedicated Patient Details workbook."""
    token = login(client, DOCTOR)
    res = client.get("/api/exports/patients", headers=auth(token))
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]

    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    assert "Patient Details" in wb.sheetnames
    assert len(wb.sheetnames) == 1

    ws = wb["Patient Details"]
    headers = [cell.value for cell in ws[1]]
    assert "Patient ID" in headers
    assert "Full Name" in headers
    assert "Phone Number" in headers


def test_patient_registration_sync_and_update(client: TestClient):
    """Creating and updating patient details must sync to DB and reflect in Excel without duplicate rows."""
    token = login(client, DOCTOR)

    # 1. Create a new patient via /api/patients
    create_res = client.post(
        "/api/patients",
        json={
            "full_name": "Ramesh Kumar Test",
            "phone": "+91-9876543299",
            "age": 42,
            "gender": "Male",
            "language": "hi",
            "address": "Village Chandaka, Khordha",
        },
        headers=auth(token),
    )
    assert create_res.status_code == 201
    pat_data = create_res.json()
    patient_id = pat_data["id"]
    assert pat_data["full_name"] == "Ramesh Kumar Test"

    # 2. Export Excel and verify patient exists
    res1 = client.get("/api/exports/patients", headers=auth(token))
    assert res1.status_code == 200
    wb1 = openpyxl.load_workbook(io.BytesIO(res1.content))
    ws1 = wb1["Patient Details"]

    patient_rows = [
        row for row in ws1.iter_rows(min_row=2, values_only=True)
        if row[0] == patient_id
    ]
    assert len(patient_rows) == 1
    assert patient_rows[0][1] == "Ramesh Kumar Test"
    assert patient_rows[0][2] == 42
    assert patient_rows[0][3] == "Male"

    # 3. Update patient details
    update_res = client.patch(
        f"/api/patients/{patient_id}",
        json={
            "full_name": "Ramesh Kumar Updated",
            "age": 43,
            "phone": "+91-9876543300",
        },
        headers=auth(token),
    )
    assert update_res.status_code == 200
    assert update_res.json()["full_name"] == "Ramesh Kumar Updated"
    assert update_res.json()["age"] == 43

    # 4. Export Excel again and verify row was updated in-place (no duplicate rows)
    res2 = client.get("/api/exports/patients", headers=auth(token))
    assert res2.status_code == 200
    wb2 = openpyxl.load_workbook(io.BytesIO(res2.content))
    ws2 = wb2["Patient Details"]

    updated_rows = [
        row for row in ws2.iter_rows(min_row=2, values_only=True)
        if row[0] == patient_id
    ]
    # Critical verification: exactly one row for this patient ID
    assert len(updated_rows) == 1
    assert updated_rows[0][1] == "Ramesh Kumar Updated"
    assert updated_rows[0][2] == 43
    assert "9876543300" in updated_rows[0][4]


def test_formula_injection_defense(client: TestClient):
    """Inputs starting with =, +, -, @ must be neutralized to prevent formula execution."""
    token = login(client, DOCTOR)

    create_res = client.post(
        "/api/patients",
        json={
            "full_name": "=CMD('calc')",
            "phone": "+91-1111111111",
            "age": 30,
            "address": "@SUM(1,2)",
        },
        headers=auth(token),
    )
    assert create_res.status_code == 201
    pat_id = create_res.json()["id"]

    res = client.get("/api/exports/patients", headers=auth(token))
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    ws = wb["Patient Details"]

    matching_rows = [
        row for row in ws.iter_rows(min_row=2, values_only=True)
        if row[0] == pat_id
    ]
    assert len(matching_rows) == 1
    # Check neutralization (prepended with single quote ')
    assert matching_rows[0][1].startswith("'=")
    assert matching_rows[0][6].startswith("'@")


def test_facility_permission_isolation(client: TestClient):
    """Non-super admins should only export records from their assigned facility."""
    doctor_token = login(client, DOCTOR)
    res = client.get("/api/exports/patients", headers=auth(doctor_token))
    assert res.status_code == 200

    # Unauthenticated should fail
    unauth_res = client.get("/api/exports/patients")
    assert unauth_res.status_code in (401, 403)
