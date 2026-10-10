"""Unit tests for Longitudinal Multi-Encounter Summarization."""

import pytest

from database.session import SessionLocal
from models import Case
from services.longitudinal.summarizer import build_longitudinal_trajectory


def test_longitudinal_trajectory_on_existing_patient():
    with SessionLocal() as db:
        case = db.query(Case).first()
        if not case:
            pytest.skip("No cases found in DB")
        pid = case.patient_id

        res = build_longitudinal_trajectory(db, pid)
        assert res["patient_id"] == pid
        assert "patient_name" in res
        assert res["total_encounters"] >= 1
        assert "longitudinal_narrative" in res
        assert len(res["encounters"]) >= 1
        first_enc = res["encounters"][0]
        assert "source_attribution" in first_enc
        assert first_enc["source_attribution"].startswith("[")
