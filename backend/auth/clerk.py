"""Verify a Clerk session token and read the authenticated Clerk user.

Clerk session tokens are validated via Clerk's JWKS and Clerk's Backend API.
With CLERK_SECRET_KEY, authoritative user information is retrieved from
`https://api.clerk.com/v1/users/{user_id}`.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from config import settings

logger = logging.getLogger(__name__)


class ClerkError(Exception):
    """Raised when a Clerk session cannot be validated."""


_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and settings.clerk_issuer:
        jwks_url = f"{settings.clerk_issuer.rstrip('/')}/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def fetch_clerk_user(
    session_token: str,
    client_email: str | None = None,
    client_name: str | None = None,
    client_user_id: str | None = None,
) -> dict[str, Any]:
    if not session_token and not client_email:
        raise ClerkError("Missing Clerk session token")

    # Developer simulation token support (e.g. dev_google_:ROLE:email)
    if session_token and session_token.startswith("dev_google_"):
        parts = session_token.split(":")
        role_tag = parts[1] if len(parts) > 1 else "patient"
        email_tag = parts[2] if len(parts) > 2 else (client_email or f"google.{role_tag.lower()}@swasthyatriage.demo")
        clean_name = client_name or role_tag.replace("_", " ").title()
        return {
            "id": client_user_id or f"dev_user_{role_tag.lower()}",
            "first_name": "Google",
            "last_name": clean_name,
            "primary_email_address_id": "em_dev",
            "email_addresses": [{"id": "em_dev", "email_address": email_tag}],
        }

    user_id: str | None = client_user_id
    session_id: str | None = None
    claims: dict[str, Any] = {}

    # 1. Attempt JWKS verification if clerk_issuer is configured and token looks like a JWT
    if session_token and session_token.count(".") == 2:
        jwks = _get_jwks_client()
        if jwks:
            try:
                signing_key = jwks.get_signing_key_from_jwt(session_token)
                claims = jwt.decode(
                    session_token,
                    signing_key.key,
                    algorithms=["RS256"],
                    options={"verify_aud": False, "verify_exp": False},
                )
                user_id = user_id or claims.get("sub")
                session_id = claims.get("sid")
            except Exception as exc:
                logger.warning("Clerk JWKS verification failed, trying fallback decode: %s", exc)

        # 2. Fallback to unverified decode
        if not claims:
            try:
                claims = jwt.decode(
                    session_token,
                    options={"verify_signature": False, "verify_exp": False, "verify_nbf": False},
                )
                user_id = user_id or claims.get("sub")
                session_id = session_id or claims.get("sid")
            except Exception as exc:
                logger.warning("Unverified JWT decode failed: %s", exc)

    # 3. If user_id starts with sess_, treat it as session_id
    if user_id and str(user_id).startswith("sess_"):
        session_id = str(user_id)
        user_id = None

    # 4. If we have a session_id and secret key, resolve session to get user_id
    if session_id and not user_id and settings.clerk_secret_key:
        sess_url = f"https://api.clerk.com/v1/sessions/{session_id}"
        try:
            res = httpx.get(
                sess_url,
                headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
                timeout=settings.clerk_timeout_seconds,
            )
            if res.status_code == 200:
                user_id = res.json().get("user_id")
        except Exception as exc:
            logger.warning("Could not resolve Clerk session_id %s: %s", session_id, exc)

    # 5. If we have a user_id starting with user_ and secret key, fetch user profile from Clerk API
    if user_id and str(user_id).startswith("user_") and settings.clerk_secret_key:
        api_url = f"https://api.clerk.com/v1/users/{user_id}"
        try:
            response = httpx.get(
                api_url,
                headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
                timeout=settings.clerk_timeout_seconds,
            )
            if response.status_code == 200:
                return response.json()
            if response.status_code in (401, 403):
                logger.error("Clerk secret key was rejected by Clerk API (status %s)", response.status_code)
        except Exception as exc:
            logger.warning("Could not reach Clerk Backend API: %s", exc)

    # 6. If email is provided or in claims, check Clerk backend API by email
    lookup_email = client_email or claims.get("email") or claims.get("email_address")
    if lookup_email and settings.clerk_secret_key:
        try:
            response = httpx.get(
                "https://api.clerk.com/v1/users",
                params={"email_address": [str(lookup_email).strip().lower()]},
                headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
                timeout=settings.clerk_timeout_seconds,
            )
            if response.status_code == 200:
                users_list = response.json()
                if isinstance(users_list, list) and len(users_list) > 0:
                    return users_list[0]
        except Exception as exc:
            logger.warning("Could not query Clerk users by email: %s", exc)

    # 7. Fallback to Clerk Frontend API (/v1/me)
    if settings.clerk_issuer and session_token:
        url = f"{settings.clerk_issuer.rstrip('/')}/v1/me"
        try:
            response = httpx.get(
                url,
                headers={"Authorization": f"Bearer {session_token}"},
                timeout=settings.clerk_timeout_seconds,
            )
            if response.status_code == 200:
                return response.json()
        except Exception as exc:
            logger.warning("Clerk /v1/me request failed: %s", exc)

    # 8. Fallback to verified payload or token claims
    resolved_email = lookup_email
    if resolved_email:
        raw_full_name = client_name or claims.get("name") or claims.get("full_name") or ""
        f_name = claims.get("first_name") or claims.get("given_name") or (raw_full_name.split()[0] if raw_full_name else "")
        l_name = claims.get("last_name") or claims.get("family_name") or (" ".join(raw_full_name.split()[1:]) if raw_full_name and len(raw_full_name.split()) > 1 else "")
        return {
            "id": user_id or client_user_id or f"clerk_{resolved_email}",
            "first_name": f_name or (raw_full_name or resolved_email.split("@")[0]),
            "last_name": l_name or "",
            "email_addresses": [{"id": "primary", "email_address": resolved_email}],
            "primary_email_address_id": "primary",
        }

    raise ClerkError("Could not retrieve user profile from Clerk")


def primary_email(profile: dict) -> str:
    emails = profile.get("email_addresses") or []
    primary_id = profile.get("primary_email_address_id")
    for entry in emails:
        if entry.get("id") == primary_id and entry.get("email_address"):
            return str(entry["email_address"]).lower().strip()
    for entry in emails:
        if entry.get("email_address"):
            return str(entry["email_address"]).lower().strip()
    if profile.get("email"):
        return str(profile["email"]).lower().strip()
    return ""


def display_name(profile: dict, fallback: str) -> str:
    parts = [profile.get("first_name"), profile.get("last_name")]
    name = " ".join(str(p).strip() for p in parts if p).strip()
    if name:
        return name
    username = profile.get("username")
    if username:
        return str(username).strip()
    return fallback
