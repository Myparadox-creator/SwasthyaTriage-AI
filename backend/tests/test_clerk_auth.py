"""Tests for Clerk/Google authentication bridge."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main
from auth.clerk import display_name, primary_email
from middleware.ratelimit import limiter


@pytest.fixture()
def client():
    limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    limiter.enabled = True


def test_primary_email_helpers():
    # Primary email matching primary_email_address_id
    profile_full = {
        "primary_email_address_id": "em_2",
        "email_addresses": [
            {"id": "em_1", "email_address": "secondary@example.com"},
            {"id": "em_2", "email_address": "PRIMARY@EXAMPLE.COM"},
        ],
    }
    assert primary_email(profile_full) == "primary@example.com"

    # Fallback to first available email
    profile_no_match = {
        "primary_email_address_id": "em_999",
        "email_addresses": [{"id": "em_1", "email_address": "first@example.com"}],
    }
    assert primary_email(profile_no_match) == "first@example.com"

    # Direct email field fallback
    profile_direct = {"email": "direct@example.com"}
    assert primary_email(profile_direct) == "direct@example.com"

    # Empty
    assert primary_email({}) == ""


def test_display_name_helpers():
    assert display_name({"first_name": "Ramesh", "last_name": "Patra"}, "User") == "Ramesh Patra"
    assert display_name({"first_name": "Pooja", "last_name": ""}, "User") == "Pooja"
    assert display_name({"username": "dr_odisha"}, "User") == "dr_odisha"
    assert display_name({}, "DefaultName") == "DefaultName"


def test_clerk_login_flow(client: TestClient):
    unique_email = f"google_user_{uuid.uuid4().hex[:8]}@example.com"
    mock_profile = {
        "id": "user_clerk_test_123",
        "first_name": "Google",
        "last_name": "Patient",
        "primary_email_address_id": "em_1",
        "email_addresses": [{"id": "em_1", "email_address": unique_email}],
    }

    with patch("api.auth.fetch_clerk_user", return_value=mock_profile):
        res = client.post("/api/auth/clerk", json={"token": "mock.clerk.jwt.token"})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["user"]["email"] == unique_email
        assert data["user"]["role"] == "PATIENT"
        assert data["user"]["full_name"] == "Google Patient"
        assert data["token_type"] == "bearer"
        assert "access_token" in data
        assert data["expires_in"] > 0

    # Second login with same account signs in as existing user
    with patch("api.auth.fetch_clerk_user", return_value=mock_profile):
        res2 = client.post("/api/auth/clerk", json={"token": "mock.clerk.jwt.token"})
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["user"]["id"] == data["user"]["id"]
        assert data2["user"]["email"] == unique_email


def test_clerk_login_role_based(client: TestClient):
    unique_email = f"dr_google_{uuid.uuid4().hex[:8]}@example.com"
    mock_profile = {
        "id": "user_clerk_doctor_456",
        "first_name": "Dr.",
        "last_name": "Sahu",
        "primary_email_address_id": "em_1",
        "email_addresses": [{"id": "em_1", "email_address": unique_email}],
    }

    with patch("api.auth.fetch_clerk_user", return_value=mock_profile):
        res = client.post(
            "/api/auth/clerk",
            json={"token": "mock.clerk.jwt.token", "role": "HEALTHCARE_WORKER"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["user"]["email"] == unique_email
        assert data["user"]["role"] == "HEALTHCARE_WORKER"
        assert data["user"]["facility_id"] == 5
        assert "Doctor" in data["user"]["designation"] or "Medical Officer" in data["user"]["designation"]


def test_clerk_existing_user_role_is_fixed(client: TestClient):
    """An account has exactly one role: requesting a different role must not switch it."""
    unique_email = f"fixed_role_{uuid.uuid4().hex[:8]}@example.com"
    mock_profile = {
        "id": "user_clerk_fixed_789",
        "first_name": "Fixed",
        "last_name": "Role",
        "primary_email_address_id": "em_1",
        "email_addresses": [{"id": "em_1", "email_address": unique_email}],
    }

    with patch("api.auth.fetch_clerk_user", return_value=mock_profile):
        first = client.post("/api/auth/clerk", json={"token": "mock.clerk.jwt.token", "role": "PATIENT"})
        assert first.status_code == 200, first.text
        assert first.json()["user"]["role"] == "PATIENT"

        # Attempt to access a different role with the same email account — strictly blocked with 403.
        second = client.post(
            "/api/auth/clerk",
            json={"token": "mock.clerk.jwt.token", "role": "HEALTHCARE_WORKER"},
        )
        assert second.status_code == 403, second.text
        assert "Access Denied" in second.json()["error"]["message"]
        assert second.json()["error"]["code"] == "role_mismatch"


def test_clerk_login_with_client_metadata(client: TestClient):
    unique_email = f"meta_user_{uuid.uuid4().hex[:8]}@example.com"
    res = client.post(
        "/api/auth/clerk",
        json={
            "token": "opaque_session_token_123",
            "email": unique_email,
            "full_name": "Metadata User",
            "clerk_user_id": "user_mock_meta_99",
            "role": "PATIENT",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["user"]["email"] == unique_email
    assert data["user"]["full_name"] == "Metadata User"
    assert data["user"]["role"] == "PATIENT"



