"""Document upload / storage endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from config import settings
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import Document

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


def test_upload_pdf_extracts_text_layer(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "report.pdf", _pdf_bytes(), "application/pdf")
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "PROCESSED"
    assert doc["content_type"] == "application/pdf"
    assert doc["size_bytes"] > 0
    assert len(doc["extractions"]) == 1
    ex = doc["extractions"][0]
    assert ex["method"] == "TEXT_LAYER"
    assert "fever" in ex["raw_text"]
    assert ex["verified"] is False

    with SessionLocal() as db:
        row = db.scalar(select(Document).where(Document.id == doc["id"]))
        assert row is not None and row.storage_path.startswith("uploads/")
        assert (tmp_path / row.storage_path).is_file()


def test_image_without_key_fails_honestly(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "scan.png", PNG_1PX, "image/png")
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "FAILED"
    assert "GEMINI_API_KEY" in doc["error_detail"]
    assert doc["extractions"] == []


def test_upload_rejects_type_mismatch(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    # PNG magic declared as PDF -> sniffed content type disagrees with header.
    res = upload(client, token, case_id, "report.pdf", PNG_1PX, "application/pdf")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "type_mismatch"


def test_upload_rejects_unsupported_file(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    res = upload(client, token, case_id, "notes.txt", b"hello world", "text/plain")
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "unsupported_file_type"


def test_upload_rejects_oversize(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    token = login(client, PATIENT)
    case_id = new_case(client, token)

    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (1024 * 1024 + 10)
    res = upload(client, token, case_id, "big.png", big, "image/png")
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "file_too_large"


def test_other_patient_cannot_upload_or_list(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    upload(client, token, case_id, "report.pdf", _pdf_bytes(), "application/pdf")

    intruder = login(client, INTRUDER)
    res = upload(client, intruder, case_id, "scan.png", PNG_1PX, "image/png")
    assert res.status_code == 403
    res = client.get(f"/api/cases/{case_id}/documents", headers=auth(intruder))
    assert res.status_code == 403


def test_list_and_download_file(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    data = _pdf_bytes("Full blood count report attached.")
    upload(client, token, case_id, "cbc.pdf", data, "application/pdf")

    res = client.get(f"/api/cases/{case_id}/documents", headers=auth(token))
    assert res.status_code == 200
    body = res.json()
    assert body["case_id"] == case_id
    assert body["case_number"].startswith("ST-")
    assert len(body["items"]) == 1
    doc_id = body["items"][0]["id"]

    res = client.get(f"/api/cases/{case_id}/documents/{doc_id}/file", headers=auth(token))
    assert res.status_code == 200
    assert res.content == data
    assert "application/pdf" in res.headers["content-type"]


def test_hcw_can_view_documents(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    upload(client, token, case_id, "report.pdf", _pdf_bytes(), "application/pdf")

    nurse = login(client, NURSE)
    res = client.get(f"/api/cases/{case_id}/documents", headers=auth(nurse))
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


def test_delete_document_is_soft(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_id = new_case(client, token)
    upload(client, token, case_id, "report.pdf", _pdf_bytes(), "application/pdf")

    res = client.get(f"/api/cases/{case_id}/documents", headers=auth(token))
    doc_id = res.json()["items"][0]["id"]

    res = client.delete(f"/api/cases/{case_id}/documents/{doc_id}", headers=auth(token))
    assert res.status_code == 204

    res = client.get(f"/api/cases/{case_id}/documents", headers=auth(token))
    assert res.json()["items"] == []

    res = client.get(f"/api/cases/{case_id}/documents/{doc_id}/file", headers=auth(token))
    assert res.status_code == 404

    res = client.delete(f"/api/cases/{case_id}/documents/{doc_id}", headers=auth(token))
    assert res.status_code == 404

    with SessionLocal() as db:
        row = db.scalar(select(Document).where(Document.id == doc_id))
        assert row is not None and row.deleted_at is not None
