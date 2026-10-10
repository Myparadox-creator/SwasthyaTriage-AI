"""Unit tests for Clinical Document RAG Engine (/api/cases/{case_id}/documents/rag)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from database.session import SessionLocal
from middleware.ratelimit import limiter
import uuid
from models import Case, Document, DocumentExtraction, Patient, User
from models.enums import CaseSource, CaseStatus, DocumentStatus, ExtractionMethod, Language, Priority, Provenance, Role

PATIENT_EMAIL = "patient.anita@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


def _login(client: TestClient) -> str:
    res = client.post("/api/auth/login", json={"email": PATIENT_EMAIL, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _setup_case_with_document(db) -> int:
    user = db.query(User).filter(User.email == PATIENT_EMAIL).first()
    assert user is not None

    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not patient:
        patient = Patient(user_id=user.id, full_name=user.full_name)
        db.add(patient)
        db.flush()

    from repositories.cases import next_case_number

    case = Case(
        case_number=next_case_number(db),
        patient_id=patient.id,
        facility_id=user.facility_id or 1,
        created_by_user_id=user.id,
        status=CaseStatus.DRAFT,
        priority=Priority.ROUTINE,
        source=CaseSource.CHAT,
        language=Language.EN,
        chief_concern="High fever and severe body ache for 3 days",
    )
    db.add(case)
    db.flush()

    doc = Document(
        case_id=case.id,
        uploaded_by_user_id=user.id,
        filename="Lab_Report_CBC_2026.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        storage_path="uploads/test/report.pdf",
        status=DocumentStatus.PROCESSED,
    )
    db.add(doc)
    db.flush()

    ext = DocumentExtraction(
        document_id=doc.id,
        method=ExtractionMethod.TEXT_LAYER,
        raw_text=(
            "PATIENT LAB REPORT: Hemoglobin 11.2 g/dL (normal 12-16). "
            "WBC Count: 13,500 /uL (elevated, indicates acute bacterial infection). "
            "Platelets: 180,000 /uL. Temperature recorded: 102.5°F. "
            "Doctor advice: Paracetamol 650mg TDS, Amoxicillin 500mg BD. Re-evaluate if fever >103°F."
        ),
        structured={
            "symptoms": ["fever", "body ache"],
            "measurements": [
                {"name": "WBC", "value": "13500", "unit": "/uL"},
                {"name": "Hemoglobin", "value": "11.2", "unit": "g/dL"},
            ],
            "medications": ["Paracetamol 650mg", "Amoxicillin 500mg"],
        },
        source=Provenance.AI_EXTRACTED,
        verified=False,
    )
    db.add(ext)
    db.commit()
    return case.id


def test_document_rag_all_modes(monkeypatch):
    limiter.enabled = False
    with TestClient(main.app) as client:
        token = _login(client)
        headers = {"Authorization": f"Bearer {token}"}

        with SessionLocal() as db:
            case_id = _setup_case_with_document(db)

        # 1. Mode: summarize
        res_sum = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "Summarize my medical report", "mode": "summarize"},
        )
        assert res_sum.status_code == 200, res_sum.text
        data_sum = res_sum.json()
        assert "Lab_Report_CBC_2026.pdf" in data_sum["answer"] or "Summary" in data_sum["answer"]
        assert len(data_sum["citations"]) > 0
        assert data_sum["citations"][0]["filename"] == "Lab_Report_CBC_2026.pdf"

        # 2. Mode: key_points
        res_pts = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "Give me the key points", "mode": "key_points"},
        )
        assert res_pts.status_code == 200
        assert "key" in res_pts.json()["answer"].lower()

        # 3. Mode: explain
        res_exp = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "Explain WBC and Hemoglobin", "mode": "explain"},
        )
        assert res_exp.status_code == 200
        assert "wbc" in res_exp.json()["answer"].lower() or "white blood cells" in res_exp.json()["answer"].lower()

        # 4. Mode: quotes
        res_quotes = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "fever infection", "mode": "quotes"},
        )
        assert res_quotes.status_code == 200
        assert len(res_quotes.json()["citations"]) > 0

        # 5. Mode: deep_dive
        res_dive = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "Deep dive into diagnosis", "mode": "deep_dive"},
        )
        assert res_dive.status_code == 200
        assert len(res_dive.json()["answer"]) > 50

        # 6. Mode: general question answering
        res_gen = client.post(
            f"/api/cases/{case_id}/documents/rag",
            headers=headers,
            json={"query": "What medications were prescribed for me?", "mode": "general"},
        )
        assert res_gen.status_code == 200
        assert len(res_gen.json()["citations"]) > 0
