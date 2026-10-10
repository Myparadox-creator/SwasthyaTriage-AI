"""Integration tests for AI Decision Support and AI Evaluation endpoints."""

import pytest
from fastapi.testclient import TestClient

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import Case

SUPER = "super@swasthyatriage.demo"
DOCTOR = "doctor.bbsr@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


@pytest.fixture
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


def auth_headers(client: TestClient, email: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_ai_evaluation_report_endpoint(client):
    headers = auth_headers(client, SUPER)
    res = client.get("/api/admin/ai-evaluation/report", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "overall_metrics" in data
    assert "language_breakdown" in data
    assert "od" in data["language_breakdown"]
    assert "hi" in data["language_breakdown"]
    assert "en" in data["language_breakdown"]
    assert "mean_wer" in data["overall_metrics"]
    assert "mean_f1" in data["overall_metrics"]


def test_ai_evaluation_run_endpoint(client):
    headers = auth_headers(client, SUPER)
    res = client.post("/api/admin/ai-evaluation/run", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_test_cases"] >= 3


def test_clinical_analysis_and_sop_guidelines(client):
    headers = auth_headers(client, DOCTOR)
    with SessionLocal() as db:
        case = db.query(Case).first()
        if not case:
            pytest.skip("No seed cases in test database")
        cid = case.id

    # 1. Clinical Analysis
    res_analysis = client.get(f"/api/cases/{cid}/clinical-analysis", headers=headers)
    assert res_analysis.status_code == 200
    analysis = res_analysis.json()
    assert "symptom_confidences" in analysis
    assert "measurement_confidences" in analysis
    assert "contradictions" in analysis
    assert "missing_critical_info" in analysis

    # 2. SOP Guidelines
    res_sop = client.get(f"/api/cases/{cid}/sop-guidelines", headers=headers)
    assert res_sop.status_code == 200
    sop = res_sop.json()
    assert "has_guidance" in sop

    # 3. Longitudinal History
    res_long = client.get(f"/api/cases/{cid}/longitudinal-history", headers=headers)
    assert res_long.status_code == 200
    long_data = res_long.json()
    assert "total_encounters" in long_data
    assert "longitudinal_narrative" in long_data

    # 4. Orchestration Pipeline
    res_orch = client.post(f"/api/cases/{cid}/orchestrate", headers=headers)
    assert res_orch.status_code == 200
    orch_data = res_orch.json()
    assert orch_data["human_approval_required"] is True
    assert len(orch_data["pipeline_stages_completed"]) >= 5
