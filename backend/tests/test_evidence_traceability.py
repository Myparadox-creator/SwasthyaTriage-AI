"""Tests for clinical evidence traceability (Feature 2).

Unit tests exercise the pure evidence builder with stub aggregates (no DB).
Integration tests exercise the API against the live database.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from middleware.ratelimit import limiter
from models.enums import ExtractionMethod, Provenance
from services.evidence import build_evidence_rows

DOCTOR = "doctor.bbsr@swasthyatriage.demo"
PATIENT = "patient.ramesh@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


def _symptom(sid=1, term="Fever", via="VOICE", verified=False):
    return SimpleNamespace(
        id=sid,
        term=term,
        normalized_term=term.lower(),
        source=Provenance.PATIENT_REPORTED,
        collected_via=via,
        verified=verified,
        created_at=datetime.now(UTC),
    )


def _measurement(mid=1, name="Temperature", value="102", unit="°F", via="VOICE", verified=False):
    return SimpleNamespace(
        id=mid,
        name=name,
        value=value,
        unit=unit,
        source=Provenance.PATIENT_REPORTED,
        collected_via=via,
        verified=verified,
        created_at=datetime.now(UTC),
    )


def _case(**kwargs):
    base = dict(
        id=1,
        case_number="ST-1001",
        chief_concern="Fever with chills for 3 days",
        timeline_text="3 days, worsening",
        created_at=datetime.now(UTC),
        symptoms=[_symptom()],
        measurements=[_measurement()],
        patient_context={},
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_build_evidence_grounds_symptom_and_measurement():
    rows = build_evidence_rows(_case())
    by_ref = {r["fact_ref"]: r for r in rows}

    fever = by_ref["symptom:1"]
    assert fever["fact_type"] == "SYMPTOM"
    assert fever["source_kind"] == "VOICE_TRANSCRIPT"
    assert fever["source_provenance"] == "PATIENT_REPORTED"
    assert fever["source_snippet"] is not None
    assert "fever" in fever["source_snippet"].lower()
    assert any("Not yet confirmed" in w for w in fever["validation_warnings"])

    temp = by_ref["measurement:1"]
    assert temp["fact_type"] == "MEASUREMENT"
    assert temp["confidence"] is not None
    assert temp["unit"] == "°F"


def test_build_evidence_includes_timeline():
    rows = build_evidence_rows(_case())
    timeline = [r for r in rows if r["fact_type"] == "TIMELINE"]
    assert len(timeline) == 1
    assert timeline[0]["source_kind"] == "PATIENT_TEXT"
    assert timeline[0]["source_provenance"] == "PATIENT_REPORTED"


def test_document_evidence_stores_safe_location_not_raw_text():
    raw = "CONFIDENTIAL raw scan text that must never be stored as evidence"
    extraction = SimpleNamespace(
        id=7,
        method=ExtractionMethod.TEXT_LAYER,
        structured={"labs": [{"name": "Hemoglobin", "value": "9.2", "unit": "g/dL"}]},
        source=Provenance.AI_EXTRACTED,
        created_at=datetime.now(UTC),
    )
    document = SimpleNamespace(id=42, extractions=[extraction])

    rows = build_evidence_rows(_case(), documents=[document])
    doc_rows = [r for r in rows if r["fact_type"] == "DOCUMENT_FIELD"]
    assert len(doc_rows) == 1
    row = doc_rows[0]
    assert row["source_kind"] == "UPLOADED_REPORT"
    assert row["source_snippet"] == "document:42#extraction:7 (method=TEXT_LAYER)"
    assert raw not in row["source_snippet"]
    assert row["source_provenance"] == "AI_EXTRACTED"
    assert any("verify against the source" in w for w in row["validation_warnings"])


# --------------------------------------------------------------------------
# Integration tests (live DB)
# --------------------------------------------------------------------------

@pytest.fixture
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


def auth_headers(client: TestClient, email: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _first_case_with_symptoms():
    from database.session import SessionLocal
    from models import Case

    with SessionLocal() as db:
        case = db.query(Case).first()
        return case.id if case else None


def test_get_case_evidence_endpoint(client):
    cid = _first_case_with_symptoms()
    if cid is None:
        pytest.skip("No seed cases in test database")
    headers = auth_headers(client, DOCTOR)
    res = client.get(f"/api/cases/{cid}/evidence", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["case_id"] == cid
    assert "total" in data and "pending_review" in data
    assert isinstance(data["evidence"], list)


def test_review_evidence_confirm_and_edit_preserves_original(client):
    cid = _first_case_with_symptoms()
    if cid is None:
        pytest.skip("No seed cases in test database")
    headers = auth_headers(client, DOCTOR)

    res = client.get(f"/api/cases/{cid}/evidence", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()["evidence"]
    symptom = next((e for e in items if e["fact_type"] == "SYMPTOM"), None)
    if symptom is None:
        pytest.skip("No symptom evidence for this case")

    ev_id = symptom["id"]
    before_current = symptom["current_value"]
    before_original = symptom["original_value"]
    # The original extracted value must never be overwritten once recorded.
    expected_original = before_original if before_original is not None else before_current

    # Confirm
    resp = client.patch(
        f"/api/cases/{cid}/evidence/{ev_id}",
        headers=headers,
        json={"status": "CONFIRMED", "reason": "verified against patient statement"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reviewer_status"] == "CONFIRMED"

    # Edit — original preserved (and stable across repeated edits)
    unique = f"Reviewed value {uuid.uuid4().hex[:8]}"
    resp = client.patch(
        f"/api/cases/{cid}/evidence/{ev_id}",
        headers=headers,
        json={"status": "EDITED", "new_value": unique},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reviewer_status"] == "EDITED"
    assert body["current_value"] == unique
    assert body["original_value"] == expected_original

    # Restore the seed value so repeated runs leave the shared dataset stable.
    client.patch(
        f"/api/cases/{cid}/evidence/{ev_id}",
        headers=headers,
        json={"status": "EDITED", "new_value": expected_original or "Fever"},
    )


def test_review_evidence_rejects_invalid_status(client):
    cid = _first_case_with_symptoms()
    if cid is None:
        pytest.skip("No seed cases in test database")
    headers = auth_headers(client, DOCTOR)
    items = client.get(f"/api/cases/{cid}/evidence", headers=headers).json()["evidence"]
    if not items:
        pytest.skip("No evidence to review")
    resp = client.patch(
        f"/api/cases/{cid}/evidence/{items[0]['id']}",
        headers=headers,
        json={"status": "NOT_A_STATUS"},
    )
    assert resp.status_code == 422


def test_patient_cannot_review_evidence(client):
    cid = _first_case_with_symptoms()
    if cid is None:
        pytest.skip("No seed cases in test database")
    headers = auth_headers(client, PATIENT)
    items = client.get(f"/api/cases/{cid}/evidence", headers=headers)
    if items.status_code == 403:
        # Patient may not access this facility's case at all — still a valid denial.
        return
    evidence = items.json()["evidence"]
    if not evidence:
        pytest.skip("No evidence to review")
    resp = client.patch(
        f"/api/cases/{cid}/evidence/{evidence[0]['id']}",
        headers=headers,
        json={"status": "CONFIRMED"},
    )
    assert resp.status_code in (403, 404)
