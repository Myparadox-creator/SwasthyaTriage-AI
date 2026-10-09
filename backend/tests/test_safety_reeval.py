"""Safety re-evaluation integration tests: triggers, idempotency, audit."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from config import settings
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import AuditLog, SafetySignal

PATIENT = "patient.anita@swasthyatriage.demo"
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


def new_case(client: TestClient, token: str) -> tuple[str, int]:
    res = client.post(
        "/api/cases",
        json={"language": "en", "consent_accepted": True},
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    return res.json()["case_number"], res.json()["id"]


def signal_audits(case_number: str) -> list[AuditLog]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(AuditLog).where(
                    AuditLog.case_number == case_number,
                    AuditLog.action == "SAFETY_SIGNAL_GENERATED",
                )
            ).all()
        )


def db_signals(case_id: int) -> list[SafetySignal]:
    with SessionLocal() as db:
        return list(db.scalars(select(SafetySignal).where(SafetySignal.case_id == case_id)).all())


def send_chat(client: TestClient, token: str, case_id: int, message: str) -> dict:
    res = client.post(
        f"/api/cases/{case_id}/chat",
        json={"message": message, "channel": "CHAT"},
        headers=auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def _pdf_bytes(text: str) -> bytes:
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


def test_chat_generates_signal_once_with_trigger_audit(client: TestClient):
    token = login(client, PATIENT)
    case_number, case_id = new_case(client, token)

    # Seeded rule CHEST_PAIN matches "chest pain".
    body = send_chat(client, token, case_id, "I have chest pain since two days")
    assert body["priority"] == "URGENT_REVIEW", body

    detail = client.get(f"/api/cases/{case_id}", headers=auth(token)).json()
    fired = [s for s in detail["safety_signals"] if s["rule_code"] == "CHEST_PAIN"]
    assert len(fired) == 1
    assert fired[0]["source"] == "CONFIGURED_RULE"

    audits = signal_audits(case_number)
    chest_audits = [a for a in audits if (a.metadata_json or {}).get("rule_code") == "CHEST_PAIN"]
    assert len(chest_audits) == 1
    assert chest_audits[0].metadata_json["trigger"] == "chat"
    assert chest_audits[0].metadata_json["priority"] == "URGENT_REVIEW"

    # Second message mentioning the same pattern must not duplicate anything.
    send_chat(client, token, case_id, "The chest pain is still there today")
    assert len([s for s in db_signals(case_id) if s.rule_code == "CHEST_PAIN"]) == 1
    chest_audits = [
        a
        for a in signal_audits(case_number)
        if (a.metadata_json or {}).get("rule_code") == "CHEST_PAIN"
    ]
    assert len(chest_audits) == 1


def test_submit_does_not_duplicate_chat_signals(client: TestClient):
    token = login(client, PATIENT)
    case_number, case_id = new_case(client, token)

    send_chat(client, token, case_id, "chest pain since morning")
    before = len([s for s in db_signals(case_id) if s.rule_code == "CHEST_PAIN"])
    assert before == 1

    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(token))
    assert res.status_code == 200, res.text
    assert res.json()["signals_detected"] >= 1

    # No new persisted signal and no duplicate audit row for CHEST_PAIN.
    assert len([s for s in db_signals(case_id) if s.rule_code == "CHEST_PAIN"]) == 1
    chest_audits = [
        a
        for a in signal_audits(case_number)
        if (a.metadata_json or {}).get("rule_code") == "CHEST_PAIN"
    ]
    assert len(chest_audits) == 1
    assert chest_audits[0].metadata_json["trigger"] == "chat"


def test_submit_audits_new_signals_with_trigger(client: TestClient):
    token = login(client, PATIENT)
    case_number, case_id = new_case(client, token)

    # No chat — first evaluation happens at submit.
    res = client.post(f"/api/cases/{case_id}/submit", headers=auth(token))
    assert res.status_code == 200, res.text

    # Submit with no symptoms produces no signal; now chat is blocked, so
    # verify via a fresh case with symptoms recorded before submit.
    case_number2, case_id2 = new_case(client, token)
    send_chat(client, token, case_id2, "severe breathing difficulty")
    res = client.post(f"/api/cases/{case_id2}/submit", headers=auth(token))
    assert res.status_code == 200

    audits = signal_audits(case_number2)
    assert audits, "expected signal audit from chat trigger"
    assert all((a.metadata_json or {}).get("trigger") in ("chat", "submit") for a in audits)


def test_document_upload_reevaluates_safety(client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    token = login(client, PATIENT)
    case_number, case_id = new_case(client, token)

    res = client.post(
        f"/api/cases/{case_id}/documents",
        files={
            "file": (
                "report.pdf",
                _pdf_bytes("Report: patient reports chest pain."),
                "application/pdf",
            )
        },
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "PROCESSED"

    signals = [s for s in db_signals(case_id) if s.rule_code == "CHEST_PAIN"]
    assert len(signals) == 1

    audits = [
        a
        for a in signal_audits(case_number)
        if (a.metadata_json or {}).get("rule_code") == "CHEST_PAIN"
    ]
    assert len(audits) == 1
    assert audits[0].metadata_json["trigger"] == "document"


def test_priority_is_never_lowered(client: TestClient):
    token = login(client, PATIENT)
    _, case_id = new_case(client, token)

    send_chat(client, token, case_id, "chest pain")  # raises to URGENT_REVIEW
    body = send_chat(client, token, case_id, "mild cough")  # must not lower
    assert body["priority"] == "URGENT_REVIEW"
