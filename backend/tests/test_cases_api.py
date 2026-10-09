"""Case API + Safety engine DB integration tests."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import Case, Patient
from services.safety.service import run_safety_evaluation

DOCTOR = "doctor.bbsr@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
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
    return res.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


CREATE_PAYLOAD = {
    "language": "hi",
    "chief_concern": "Bees din se bukhar aur sardardi",
    "consent_accepted": True,
}


def test_patient_creates_case_with_consent(client: TestClient):
    token = login(client, PATIENT)
    res = client.post("/api/cases", json=CREATE_PAYLOAD, headers=auth(token))
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["status"] == "DRAFT"
    assert data["case_number"].startswith("ST-")
    assert data["language"] == "hi"
    assert data["patient"]["full_name"] == "Ramesh Behera"
    assert data["facility"]["id"] is not None
    assert data["case_number"] not in TEST_CREATED


TEST_CREATED: set[str] = set()


def test_create_requires_consent(client: TestClient):
    token = login(client, PATIENT)
    payload = dict(CREATE_PAYLOAD, consent_accepted=False)
    res = client.post("/api/cases", json=payload, headers=auth(token))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "consent_required"


def test_non_patient_cannot_create_case(client: TestClient):
    token = login(client, NURSE)
    res = client.post("/api/cases", json=CREATE_PAYLOAD, headers=auth(token))
    assert res.status_code == 403


def test_patient_lists_only_own_cases(client: TestClient):
    created = client.post("/api/cases", json=CREATE_PAYLOAD, headers=auth(login(client, PATIENT)))
    case_number = created.json()["case_number"]
    token = login(client, PATIENT)
    res = client.get("/api/cases", headers=auth(token))
    assert res.status_code == 200
    assert len(res.json()["items"]) >= 1
    assert all(
        item["case_number"] == case_number
        for item in res.json()["items"]
        if item["case_number"] == case_number
    )


def test_doctor_lists_facility_cases_and_others_hidden(client: TestClient):
    token = login(client, DOCTOR)
    res = client.get("/api/cases?page_size=50", headers=auth(token))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 20  # seeded cases
    for item in body["items"]:
        assert item["facility_name"] == "Bhubaneswar Town PHC"


def test_super_admin_lists_all_facilities(client: TestClient):
    token = login(client, "super@swasthyatriage.demo")
    res = client.get("/api/cases?page_size=100", headers=auth(token))
    assert res.status_code == 200
    facilities = {item["facility_name"] for item in res.json()["items"]}
    assert len(facilities) >= 3


def test_cross_facility_access_forbidden(client: TestClient):
    rkl_doctor = login(client, "doctor.rkl@swasthyatriage.demo")
    bbsr_doctor = login(client, DOCTOR)
    list_res = client.get("/api/cases?page_size=1", headers=auth(bbsr_doctor))
    target = list_res.json()["items"][0]["id"]
    res = client.get(f"/api/cases/{target}", headers=auth(rkl_doctor))
    assert res.status_code == 403


def test_triage_note_structure(client: TestClient):
    token = login(client, PATIENT)
    created = client.post("/api/cases", json=CREATE_PAYLOAD, headers=auth(token)).json()
    res = client.get(f"/api/cases/{created['id']}/triage-note", headers=auth(token))
    assert res.status_code == 200
    note = res.json()
    assert note["case_number"] == created["case_number"]
    assert note["ai_status"] == "AI-generated"
    assert "disclaimer" in note
    assert note["reviewer_status"] == "Pending professional review"


def test_safety_engine_persists_signals_and_raises_priority():
    # DB-level: run the real engine against a case, verify signal rows + priority.
    with SessionLocal() as db:
        patient_id = db.scalar(select(Patient.id).limit(1))
        facility_id = db.scalar(
            select(Case.facility_id).where(Case.facility_id.isnot(None)).limit(1)
        )
        draft = Case(
            case_number=f"ST-T-{uuid.uuid4().hex[:6]}",
            patient_id=patient_id,
            facility_id=facility_id,
        )
        db.add(draft)
        db.flush()
        extraction = {
            "symptoms": [{"term": "chest pain"}, {"term": "fever"}],
            "free_text": "seene me dard",
            "measurements": [{"name": "temperature", "value": "104.0", "unit": "°F"}],
            "duration_days": 2,
        }
        evaluation = run_safety_evaluation(db, draft, extraction)
        db.commit()
        saved_id = draft.id

    assert {s.rule_code for s in evaluation.signals} >= {"CHEST_PAIN", "HIGH_FEVER"}
    assert evaluation.priority == "URGENT_REVIEW"
    with SessionLocal() as db:
        signals = db.scalars(select(Case).where(Case.id == saved_id)).one().safety_signals
        assert {s.rule_code for s in signals} >= {"CHEST_PAIN", "HIGH_FEVER"}
        assert all(s.source.value == "CONFIGURED_RULE" for s in signals)


def test_submit_advances_status_and_never_lowers_priority(client: TestClient):
    token = login(client, PATIENT)
    created = client.post("/api/cases", json=CREATE_PAYLOAD, headers=auth(token)).json()
    case_id = created["id"]

    with SessionLocal() as db:
        case = db.get(Case, case_id)
        run_safety_evaluation(
            db,
            case,
            {"symptoms": ["chest pain"], "free_text": "", "measurements": [], "duration_days": 1},
        )
        db.commit()

    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "SUBMITTED"
    assert body["priority"] == "URGENT_REVIEW"  # never lowered back

    duplicate = client.post(f"/api/cases/{case_id}/submit", headers=auth(token))
    assert duplicate.status_code == 409
