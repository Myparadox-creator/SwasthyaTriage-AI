"""Tests for patient-facing Sonam callbacks and telephony webhooks."""

from __future__ import annotations

import hashlib
import hmac
import uuid
import pytest
from fastapi.testclient import TestClient

import main
from config import settings
from middleware.ratelimit import limiter

DOCTOR = "doctor.bbsr@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


@pytest.fixture(autouse=True)
def setup_test_env():
    prev_mode = settings.email_delivery_mode
    settings.email_delivery_mode = "mock"
    limiter.enabled = False
    yield
    settings.email_delivery_mode = prev_mode
    limiter.enabled = True


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


def login(client: TestClient, email: str, pwd: str = PASSWORD) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def create_fresh_patient(client: TestClient) -> tuple[str, str]:
    tag = uuid.uuid4().hex[:8]
    email = f"patient.sonam.{tag}@test.demo"
    pwd = "PatientTest@123"
    res = client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "password": pwd,
            "full_name": f"Sonam Patient {tag}",
            "language": "hi",
            "phone": f"+9198{uuid.uuid4().int % 100000000:08d}",
        },
    )
    assert res.status_code == 201, res.text
    token = login(client, email, pwd)
    return email, token


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_callback_consent_required(client: TestClient):
    """Callback creation must reject requests without explicit consent."""
    _, token = create_fresh_patient(client)
    res = client.post(
        "/api/patients/callback-requests",
        json={
            "phone_number": "+919876543210",
            "language": "hi",
            "consent_ai": False,
        },
        headers=auth(token),
    )
    assert res.status_code == 422


def test_callback_invalid_phone_rejected(client: TestClient):
    """Invalid or foreign phone numbers are rejected with 422."""
    _, token = create_fresh_patient(client)
    res = client.post(
        "/api/patients/callback-requests",
        json={
            "phone_number": "12345",
            "language": "hi",
            "consent_ai": True,
        },
        headers=auth(token),
    )
    assert res.status_code == 422


def test_callback_creation_and_listing(client: TestClient):
    """Patient creates a callback request and views it in the list."""
    _, token = create_fresh_patient(client)
    test_phone = f"98{uuid.uuid4().int % 100000000:08d}"

    # 1. Create callback request
    res = client.post(
        "/api/patients/callback-requests",
        json={
            "phone_number": test_phone,
            "language": "hi",
            "purpose": "Mild fever and sore throat for 2 days",
            "consent_ai": True,
        },
        headers=auth(token),
    )
    assert res.status_code == 201
    data = res.json()
    assert data["phone_masked"].endswith(test_phone[-4:])
    assert data["language"] == "hi"
    assert data["status"] == "REQUESTED"
    assert data["consent_ai"] is True
    call_id = data["id"]
    public_id = data["public_id"]

    # 2. Get specific callback request
    get_res = client.get(
        f"/api/patients/callback-requests/{call_id}",
        headers=auth(token),
    )
    assert get_res.status_code == 200
    assert get_res.json()["public_id"] == public_id

    # 3. List callback requests
    list_res = client.get(
        "/api/patients/callback-requests",
        headers=auth(token),
    )
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(it["id"] == call_id for it in items)

    # 4. Duplicate prevention: cannot queue a second active call while one is open
    dup_res = client.post(
        "/api/patients/callback-requests",
        json={
            "phone_number": f"98{uuid.uuid4().int % 100000000:08d}",
            "language": "hi",
            "consent_ai": True,
        },
        headers=auth(token),
    )
    assert dup_res.status_code == 409


def test_callback_forbidden_for_doctor(client: TestClient):
    """Doctors / HCWs cannot call the patient-only callback endpoint."""
    doc_token = login(client, DOCTOR)
    res = client.get(
        "/api/patients/callback-requests",
        headers=auth(doc_token),
    )
    assert res.status_code == 403


def test_telephony_webhook_signature_verification(client: TestClient):
    """Webhook verifies HMAC signature and safely updates call status."""
    prev_secret = settings.telephony_webhook_secret
    settings.telephony_webhook_secret = "test-webhook-secret-key-12345"

    try:
        _, token = create_fresh_patient(client)
        test_phone = f"98{uuid.uuid4().int % 100000000:08d}"
        create_res = client.post(
            "/api/patients/callback-requests",
            json={
                "phone_number": test_phone,
                "language": "hi",
                "consent_ai": True,
            },
            headers=auth(token),
        )
        assert create_res.status_code == 201
        call_public_id = create_res.json()["public_id"]

        payload_bytes = f'{{"call_public_id":"{call_public_id}","status":"CONNECTED"}}'.encode("utf-8")
        valid_sig = hmac.new(b"test-webhook-secret-key-12345", payload_bytes, hashlib.sha256).hexdigest()

        # 1. Invalid signature should be rejected with 401
        bad_res = client.post(
            "/api/telephony/webhooks/mock",
            content=payload_bytes,
            headers={"x-telephony-signature": "sha256=invalid-signature-hex"},
        )
        assert bad_res.status_code == 401

        # 2. Valid signature should be accepted
        good_res = client.post(
            "/api/telephony/webhooks/mock",
            content=payload_bytes,
            headers={"x-telephony-signature": valid_sig},
        )
        assert good_res.status_code == 200
        assert good_res.json()["status"] == "ok"

        # 3. Duplicate should be idempotent
        repeat_res = client.post(
            "/api/telephony/webhooks/mock",
            content=payload_bytes,
            headers={"x-telephony-signature": valid_sig},
        )
        assert repeat_res.status_code == 200
        assert repeat_res.json()["status"] == "ignored"

    finally:
        settings.telephony_webhook_secret = prev_secret
