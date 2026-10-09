"""Document-AI and ai-summary endpoint integration tests.

Provider is swapped for an offline stub (no network): image extraction must
merge structured facts into the case, re-run the safety engine, and persist
audits. The ai-summary endpoint is tested with both the honest mock (no key)
and the stub, plus cross-account RBAC.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import api.documents as documents_api
import main
from config import settings
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog
from services.gemini.extraction import DocumentExtractionSchema, ExtractedMeasurement
from services.gemini.summary import render_mock_summary

PATIENT = "patient.anita@swasthyatriage.demo"
INTRUDER = "patient.suresh@swasthyatriage.demo"
NURSE = "nurse.bbsr@swasthyatriage.demo"
PASSWORD = "Swasthya@123"

PNG_1PX = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
    "0000000D49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
)


def _pdf_bytes(text: str = "This is a medical report: fever since two days.") -> bytes:
    stream = f"BT /F1 14 Tf 72 720 Td ({text}) Tj ET".encode("ascii")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R"
        b" /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, obj in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode("ascii")
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode("ascii")
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode(
        "ascii"
    )
    return bytes(out)


class StubProvider:
    name = "stub"

    def extract_document(self, text: str, *, filename: str = "") -> DocumentExtractionSchema:
        return DocumentExtractionSchema(
            symptoms=["fever"],
            measurements=[ExtractedMeasurement(name="Temperature", value="104", unit="°F")],
            free_text=text.strip(),
        )

    def extract_image(
        self, image: bytes, mime: str, *, filename: str = ""
    ) -> DocumentExtractionSchema:
        return DocumentExtractionSchema(
            symptoms=["fever"],
            measurements=[ExtractedMeasurement(name="Temperature", value="104", unit="°F")],
            duration="2 days",
            free_text="Verified by stub extraction.",
        )

    def summarize_case(self, payload: dict) -> str:
        return render_mock_summary(payload)

    def suggest_questions(self, *, candidates: list[str]) -> list[str] | None:
        return None


@pytest.fixture()
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


@pytest.fixture()
def stub_provider(monkeypatch):
    provider = StubProvider()
    monkeypatch.setattr(documents_api, "get_provider", lambda: provider)
    import api.cases as cases_api

    monkeypatch.setattr(cases_api, "get_provider", lambda: provider)
    return provider


def login(client: TestClient, email: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def new_case(client: TestClient, token: str) -> int:
    res = client.post(
        "/api/cases",
        json={"language": "en", "consent_accepted": True},
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def upload(client: TestClient, token: str, case_id: int, filename: str, data: bytes, ctype: str):
    return client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": (filename, data, ctype)},
        headers=auth(token),
    )


def _epoch(dt_str: str) -> float:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).timestamp()


def audit_rows(case_number: str, action: str) -> list[AuditLog]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.case_number == case_number, AuditLog.action == action
                )
            ).all()
        )


def test_image_without_key_fails_honestly(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "scan.png", PNG_1PX, "image/png")
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "FAILED"
    assert "GEMINI_API_KEY" in res.json()["error_detail"]


def test_stub_image_extraction_merges_and_reruns_safety(
    client: TestClient, tmp_path, monkeypatch, stub_provider
):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "scan.png", PNG_1PX, "image/png")
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "PROCESSED"
    assert len(doc["extractions"]) == 1
    ex = doc["extractions"][0]
    assert ex["method"] == "GEMINI_VISION"
    assert ex["structured"]["measurements"][0]["name"] == "Temperature"
    assert ex["structured"]["symptoms"] == ["fever"]

    detail = client.get(f"/api/cases/{case_id}", headers=auth(token)).json()
    assert any(m["name"] == "Temperature" and m["value"] == "104" for m in detail["measurements"])
    assert any(s["rule_code"] == "HIGH_FEVER" for s in detail["safety_signals"])
    assert any(m["source"] == "AI_EXTRACTED" for m in detail["measurements"])

    merged = audit_rows(detail["case_number"], "CASE_UPDATED_BY_EXTRACTION")
    assert len(merged) == 1
    assert merged[0].metadata_json.get("provider") == "stub"
    assert (
        audit_rows(detail["case_number"], "OCR_PROCESSED")[0].metadata_json.get("method")
        == "GEMINI_VISION"
    )


def test_stub_pdf_extraction_writes_structured_extraction(
    client: TestClient, tmp_path, monkeypatch, stub_provider
):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "report.pdf", _pdf_bytes(), "application/pdf")
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "PROCESSED"
    ex = doc["extractions"][0]
    assert ex["method"] == "TEXT_LAYER"
    assert ex["structured"]["symptoms"] == ["fever"]
    assert ex["structured"]["free_text"].startswith("This is a medical report")


def test_ai_summary_mock_persists_and_suggests_questions(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = client.post(f"/api/cases/{case_id}/ai-summary", headers=auth(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["provider"] == "mock"
    assert "mock provider" in body["summary"]
    assert body["generated_at"]
    assert len(body["suggested_questions"]) >= 1

    detail = client.get(f"/api/cases/{case_id}", headers=auth(token)).json()
    assert detail["ai_summary"] == body["summary"]
    assert _epoch(detail["ai_summary_generated_at"]) == _epoch(body["generated_at"])
    assert audit_rows(detail["case_number"], "AI_SUMMARY_GENERATED")


def test_ai_summary_regeneration_with_stub(
    client: TestClient, tmp_path, monkeypatch, stub_provider
):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = client.post(f"/api/cases/{case_id}/ai-summary", headers=auth(token))
    assert res.status_code == 200, res.text
    assert res.json()["provider"] == "stub"

    first = client.post(f"/api/cases/{case_id}/ai-summary", headers=auth(token))
    assert first.status_code == 200, first.text
    assert first.json()["provider"] == "stub"
    assert "Not a diagnosis" in first.json()["summary"]


def test_ai_summary_rbac(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    owner = login(client, PATIENT)
    case_id = new_case(client, owner)

    intruder = login(client, INTRUDER)
    res = client.post(f"/api/cases/{case_id}/ai-summary", headers=auth(intruder))
    assert res.status_code == 403

    nurse = login(client, NURSE)
    res = client.post(f"/api/cases/{case_id}/ai-summary", headers=auth(nurse))
    assert res.status_code == 200
    assert res.json()["provider"] == "mock"
