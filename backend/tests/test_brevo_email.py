"""Automated tests for Brevo Transactional Email System.

Covers:
- Template rendering for all 9 healthcare transactional email templates
- Brevo client mock & live request payload structuring
- Password reset token hashing & single-use expiry lifecycle
- Email verification token lifecycle
- Generic password reset endpoint (preventing user enumeration)
- Admin email endpoints RBAC & test email dispatch
- Brevo transactional webhook delivery event processing
"""

from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from auth.password import hash_password
from config import settings
from database.session import SessionLocal
from middleware.ratelimit import limiter
from models import User
from models.email import EmailLog, EmailVerificationToken, PasswordResetToken
from services.email.brevo import BrevoClient
from services.email.service import (
    create_and_send_password_reset_email,
    create_and_send_verification_email,
    mark_password_reset_token_used,
    verify_email_token,
    verify_password_reset_token,
)
from services.email.templates import TEMPLATE_REGISTRY, render_email_template

SUPER_ADMIN = "super@swasthyatriage.demo"
PATIENT = "patient.anita@swasthyatriage.demo"
PASSWORD = "Swasthya@123"


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Ensure mock email mode in test environment."""
    monkeypatch.setattr(settings, "email_delivery_mode", "mock")
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


def login(client: TestClient, email: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ==========================================
# 1. TEMPLATE RENDERING TESTS
# ==========================================


def test_all_templates_render_successfully():
    """Verify all 9 templates render valid HTML and plain text with non-diagnostic disclaimers."""
    assert len(TEMPLATE_REGISTRY) == 9

    test_context = {
        "name": "Dr. Pradhan",
        "app_url": "http://localhost:5173",
        "action_url": "http://localhost:5173/auth/reset-password?token=test12345",
        "token": "test12345",
        "encounter_id": "ENC-OD-2026-0042",
        "workflow_status": "URGENT_REVIEW",
        "action_required": "Review patient symptom history",
        "facility_name": "Puri CHC",
        "role_name": "HEALTHCARE_WORKER",
        "details": "Password updated from Bhubaneswar, Odisha",
    }

    for name in TEMPLATE_REGISTRY:
        subject, html, text = render_email_template(name, test_context)
        assert subject and len(subject) > 5, f"Subject missing for template {name}"
        assert html and "<html" in html, f"HTML incomplete for template {name}"
        assert text and len(text) > 20, f"Plain text incomplete for template {name}"
        assert "SwasthyaFlow AI" in html
        assert "support@swasthyatriage.gov.in" in html or "noreply@" in html
        # Guarantee non-diagnostic disclaimer
        assert "clinical judgment" in html or "non-diagnostic" in html or "confidential" in html


# ==========================================
# 2. BREVO CLIENT UNIT TESTS
# ==========================================


def test_brevo_client_mock_mode():
    """BrevoClient in mock mode simulates delivery without external network."""
    client = BrevoClient(api_key="mock-key", delivery_mode="mock")
    res = client.send_email(
        recipient_email="test.recipient@swasthyaflow.gov.in",
        recipient_name="Test Recipient",
        subject="Welcome Test",
        html_content="<p>Test Content</p>",
        text_content="Test Content",
        tags=["welcome", "test"],
    )
    assert "messageId" in res
    assert res["messageId"].startswith("mock-")


def test_brevo_client_payload_structure(monkeypatch):
    """Brevo client formats JSON payload exactly according to Brevo SMTP API specification."""
    client = BrevoClient(
        api_key="real-simulated-key",
        sender_email="noreply@swasthyaflow.gov.in",
        sender_name="SwasthyaFlow AI",
        reply_to_email="support@swasthyaflow.gov.in",
        delivery_mode="live",
    )

    captured_url = None
    captured_headers = None
    captured_json = None

    class MockResponse:
        status_code = 201

        def json(self):
            return {"messageId": "<202610091200.brevo.test@smtp-relay.brevo.com>"}

    class MockHttpxClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, headers=None, json=None, timeout=None):
            nonlocal captured_url, captured_headers, captured_json
            captured_url = url
            captured_headers = headers
            captured_json = json
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "Client", MockHttpxClient)

    res = client.send_email(
        recipient_email="clinician@health.odisha.gov.in",
        recipient_name="Dr. Sahu",
        subject="Clinical Handoff Review",
        html_content="<h1>Review Required</h1>",
        text_content="Review Required",
        tags=["encounter_assignment"],
    )

    assert "messageId" in res
    assert res["messageId"] == "<202610091200.brevo.test@smtp-relay.brevo.com>"
    assert captured_url == "https://api.brevo.com/v3/smtp/email"
    assert captured_headers["api-key"] == "real-simulated-key"
    assert captured_headers.get("Content-Type") == "application/json"
    assert captured_json["sender"]["email"] == "noreply@swasthyaflow.gov.in"
    assert captured_json["sender"]["name"] == "SwasthyaFlow AI"
    assert captured_json["to"][0]["email"] == "clinician@health.odisha.gov.in"
    assert captured_json["replyTo"]["email"] == "support@swasthyaflow.gov.in"
    assert captured_json["tags"] == ["encounter_assignment"]


# ==========================================
# 3. TOKEN LIFECYCLE & HASHING TESTS
# ==========================================


def test_password_reset_token_hashing_and_consumption():
    """Verify raw tokens are never saved unhashed and single-use expiry is enforced."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == PATIENT))
        assert user is not None

        raw_token = create_and_send_password_reset_email(db, user)
        assert len(raw_token) > 20

        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        stored = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
        assert stored is not None
        assert stored.used_at is None

        # Validate token
        validated_user = verify_password_reset_token(db, raw_token)
        assert validated_user is not None
        assert validated_user.id == user.id

        # Mark token used
        mark_password_reset_token_used(db, raw_token)

        # Second validation should fail (single-use)
        assert verify_password_reset_token(db, raw_token) is None


def test_email_verification_token_lifecycle():
    """Verify email verification token verifies user and invalidates reuse."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == PATIENT))
        assert user is not None

        raw_token = create_and_send_verification_email(db, user)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        stored = db.scalar(select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash))
        assert stored is not None
        assert stored.verified_at is None

        # Consume verification
        verified_user = verify_email_token(db, raw_token)
        assert verified_user is not None
        assert verified_user.id == user.id

        # Check token record is marked verified
        stored_verified = db.scalar(select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash))
        assert stored_verified.verified_at is not None

        # Second consumption fails
        assert verify_email_token(db, raw_token) is None


# ==========================================
# 4. API AUTH & GENERIC PASSWORD RESET TESTS
# ==========================================


def test_login_dispatches_welcome_email(client: TestClient):
    """Successful email login queues a welcome email for the logged-in user."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == PATIENT))
        if user:
            user.password_hash = hash_password(PASSWORD)
            db.commit()

        welcome_count = len(
            db.scalars(
                select(EmailLog).where(
                    EmailLog.recipient_email == PATIENT,
                    EmailLog.template_name == "welcome",
                )
            ).all()
        )

    login(client, PATIENT)

    with SessionLocal() as db:
        logs = db.scalars(
            select(EmailLog).where(
                EmailLog.recipient_email == PATIENT,
                EmailLog.template_name == "welcome",
            )
        ).all()
    assert len(logs) == welcome_count + 1
    assert logs[-1].status in ("SENT", "PENDING")


def test_forgot_password_generic_response_prevents_enumeration(client: TestClient):
    """Both existing and non-existing accounts return identical generic response."""
    # Existing user
    res1 = client.post("/api/auth/forgot-password", json={"email": PATIENT})
    assert res1.status_code == 200
    assert "password reset link" in res1.json()["message"]

    # Non-existing user
    res2 = client.post("/api/auth/forgot-password", json={"email": "nonexistent.user.999@random.gov.in"})
    assert res2.status_code == 200
    assert res2.json() == res1.json()


def test_reset_password_api_flow(client: TestClient):
    """End-to-end reset password API validation."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == PATIENT))
        assert user is not None
        user.password_hash = hash_password(PASSWORD)
        db.commit()
        token = create_and_send_password_reset_email(db, user)

    new_pass = "SwasthyaNew@2026"
    try:
        res = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": new_pass},
        )
        assert res.status_code == 200
        assert "reset successfully" in res.json()["message"]

        # Verify login with new password
        login_res = client.post("/api/auth/login", json={"email": PATIENT, "password": new_pass})
        assert login_res.status_code == 200
    finally:
        # Always restore patient password to baseline
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == PATIENT))
            if user:
                user.password_hash = hash_password(PASSWORD)
                db.commit()


# ==========================================
# 5. ADMIN EMAIL STATUS & TEST DISPATCH RBAC
# ==========================================


def test_admin_email_endpoints_rbac(client: TestClient):
    """Patients cannot access email admin endpoints; Super Admins have full access."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == PATIENT))
        if user:
            user.password_hash = hash_password(PASSWORD)
            db.commit()

    patient_token = login(client, PATIENT)
    super_token = login(client, SUPER_ADMIN)

    # Patient forbidden
    status_forbidden = client.get("/api/admin/email/status", headers=auth(patient_token))
    assert status_forbidden.status_code == 403

    test_forbidden = client.post(
        "/api/admin/email/test",
        headers=auth(patient_token),
        json={"recipient": PATIENT, "template_name": "welcome"},
    )
    assert test_forbidden.status_code == 403

    # Super Admin allowed
    status_ok = client.get("/api/admin/email/status", headers=auth(super_token))
    assert status_ok.status_code == 200
    status_data = status_ok.json()
    assert status_data["provider"] == "Brevo Transactional Email"
    assert "recent_stats" in status_data
    assert len(status_data["templates"]) == 9

    # Super Admin send test email
    test_ok = client.post(
        "/api/admin/email/test",
        headers=auth(super_token),
        json={"recipient": "test.admin@swasthyatriage.gov.in", "template_name": "welcome"},
    )
    assert test_ok.status_code == 200
    assert "successfully" in test_ok.json()["message"]


# ==========================================
# 6. BREVO WEBHOOK DELIVERY EVENTS
# ==========================================


def test_brevo_webhook_event_processing(client: TestClient):
    """Incoming Brevo transactional webhook updates email log state idempotently."""
    import uuid

    unique_msg_id = f"<webhook-test-{uuid.uuid4().hex[:12]}@brevo.com>"
    with SessionLocal() as db:
        log = EmailLog(
            recipient_email="patient.test@swasthyatriage.demo",
            template_name="welcome",
            subject="Welcome to SwasthyaFlow AI",
            brevo_message_id=unique_msg_id,
            status="SENT",
        )
        db.add(log)
        db.commit()
        db.refresh(log)

    # Simulate Brevo delivery webhook event
    payload = {
        "event": "delivered",
        "email": "patient.test@swasthyatriage.demo",
        "message-id": unique_msg_id,
        "date": "2026-10-09 12:00:00",
    }

    res = client.post("/api/webhooks/brevo", json=payload)
    assert res.status_code == 200
    assert res.json()["status"] in ("ok", "processed")

    with SessionLocal() as db:
        updated = db.scalar(select(EmailLog).where(EmailLog.id == log.id))
        assert updated is not None
        assert updated.status == "DELIVERED"
