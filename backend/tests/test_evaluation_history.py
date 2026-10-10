"""Tests for evaluation-run persistence and drift monitoring (Feature 3)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from middleware.ratelimit import limiter
from services.evaluation.history import compute_trend, evaluate_thresholds

SUPER = "super@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


# --------------------------------------------------------------------------
# Pure unit tests
# --------------------------------------------------------------------------

def test_evaluate_thresholds_flags_breaches():
    breaches = evaluate_thresholds(
        {"mean_wer": 0.40, "mean_f1": 0.90, "mean_cer": 0.05, "expected_calibration_error_ece": 0.02}
    )
    flagged = {b["metric"] for b in breaches}
    assert "mean_wer" in flagged  # 0.40 > 0.25
    assert "mean_f1" not in flagged  # 0.90 >= 0.75 is fine
    assert "mean_cer" not in flagged


def test_evaluate_thresholds_ignores_missing_and_non_numeric():
    breaches = evaluate_thresholds({"mean_wer": None, "mean_f1": "n/a"})
    assert breaches == []


def _run(rid: int, when: datetime, **metrics):
    full = {"mean_wer": 0.10, "mean_cer": 0.05, "mean_f1": 0.95}
    full.update(metrics)
    return {"id": rid, "created_at": when, "metrics": full}


def test_compute_trend_detects_worsening_drift():
    t = datetime.now(UTC)
    runs = [
        _run(1, t - timedelta(days=2), mean_f1=0.95),
        _run(2, t - timedelta(days=1), mean_f1=0.90),
        _run(3, t, mean_f1=0.70),  # big drop and below limit
    ]
    trend = compute_trend(runs)
    assert trend["run_count"] == 3
    f1 = trend["metrics"]["mean_f1"]
    assert f1["direction"] == "down"
    assert f1["threshold_breached"] is True
    assert f1["drift_detected"] is True
    assert "mean_f1" in trend["drift_metrics"]
    assert trend["drift_detected"] is True
    assert trend["is_clinical_validation"] is False


def test_compute_trend_stable_is_not_drift():
    t = datetime.now(UTC)
    runs = [
        _run(1, t - timedelta(days=1), mean_f1=0.95, mean_wer=0.10),
        _run(2, t, mean_f1=0.94, mean_wer=0.11),
    ]
    trend = compute_trend(runs)
    assert trend["drift_detected"] is False
    assert trend["drift_metrics"] == []


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


def test_run_persists_and_history_lists(client):
    headers = auth_headers(client, SUPER)

    run_res = client.post("/api/admin/ai-evaluation/run", headers=headers)
    assert run_res.status_code == 200, run_res.text
    run_body = run_res.json()
    assert run_body["run_persisted"] is True
    assert isinstance(run_body["run_id"], int)
    assert run_body["is_clinical_validation"] is False
    assert "unavailable_metrics" in run_body

    run_id = run_body["run_id"]

    history = client.get("/api/admin/ai-evaluation/history", headers=headers)
    assert history.status_code == 200, history.text
    ids = [r["id"] for r in history.json()["runs"]]
    assert run_id in ids

    # The persisted run must record the same metrics it reported.
    stored = next(r for r in history.json()["runs"] if r["id"] == run_id)
    assert stored["dataset_kind"] == "synthetic"
    assert stored["is_clinical_validation"] is False
    assert stored["metrics"]["mean_wer"] == run_body["overall_metrics"]["mean_wer"]


def test_trend_endpoint_returns_series(client):
    headers = auth_headers(client, SUPER)
    client.post("/api/admin/ai-evaluation/run", headers=headers)
    client.post("/api/admin/ai-evaluation/run", headers=headers)

    trend = client.get("/api/admin/ai-evaluation/trend", headers=headers)
    assert trend.status_code == 200, trend.text
    body = trend.json()
    assert body["run_count"] >= 2
    assert "mean_wer" in body["metrics"]
    assert len(body["metrics"]["mean_wer"]["series"]) >= 2
    assert body["is_clinical_validation"] is False


def test_history_requires_admin(client):
    res = client.get("/api/admin/ai-evaluation/history")
    assert res.status_code == 401
