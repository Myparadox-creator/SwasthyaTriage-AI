"""Resend Transactional Email HTTP API client with bounded retries and safe logging."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import httpx

from config import settings
from services.email.base import EmailError

logger = logging.getLogger("swasthyatriage.email")

RESEND_API_URL = "https://api.resend.com/emails"
MAX_RETRIES = 3
RETRY_BACKOFF_BASE_SECONDS = 0.5


class ResendError(EmailError):
    """Base error for Resend email API issues."""


class ResendAuthError(ResendError):
    """Invalid or unauthorized Resend API key."""


class ResendDeliveryError(ResendError):
    """Failed to deliver email through Resend."""


def _format_sender(name: str, email: str) -> str:
    """Resend expects a single ``Name <email>`` from field."""
    clean_name = (name or "").strip()
    return f"{clean_name} <{email}>" if clean_name else email


class ResendClient:
    """Client for the Resend Email API (https://api.resend.com/emails)."""

    def __init__(
        self,
        api_key: str | None = None,
        sender_email: str | None = None,
        sender_name: str | None = None,
        reply_to_email: str | None = None,
        timeout_seconds: float | None = None,
        delivery_mode: str | None = None,
    ) -> None:
        self.api_key = api_key or settings.resend_api_key
        self.sender_email = sender_email or settings.resend_sender_email
        self.sender_name = sender_name or settings.resend_sender_name
        self.reply_to_email = reply_to_email or settings.resend_reply_to_email
        self.timeout = timeout_seconds or settings.email_request_timeout_seconds
        self.delivery_mode = delivery_mode or settings.email_delivery_mode

    def is_mock_mode(self) -> bool:
        """Determines if email service should operate in mock mode."""
        return self.delivery_mode.lower() == "mock" or not self.api_key

    def send_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str | None,
        subject: str,
        html_content: str,
        text_content: str,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Sends a transactional email via Resend API or mock simulator.

        Returns dict containing 'messageId' on success.
        """
        # Validate recipient
        clean_email = recipient_email.strip().lower()
        if not clean_email or "@" not in clean_email:
            raise ResendDeliveryError(f"Invalid recipient email address: {clean_email}")

        # MOCK MODE (for tests or local development without live credentials)
        if self.is_mock_mode():
            mock_id = f"mock-msg-{uuid.uuid4().hex[:16]}"
            logger.info(
                "[Resend Mock] Simulated email send to %s (subject: '%s', mock_id: %s)",
                clean_email,
                subject,
                mock_id,
            )
            return {
                "messageId": mock_id,
                "status": "mock_delivered",
                "recipient": clean_email,
            }

        # LIVE MODE: Build Resend API payload
        payload: dict[str, Any] = {
            "from": _format_sender(self.sender_name, self.sender_email),
            "to": [clean_email],
            "subject": subject,
            "html": html_content,
            "text": text_content,
        }
        if self.reply_to_email:
            payload["reply_to"] = self.reply_to_email
        if tags:
            # Resend tags must be objects with ASCII name/value strings.
            payload["tags"] = [{"name": "category", "value": t} for t in tags]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # Bounded retry loop for transient network or 5xx issues
        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(RESEND_API_URL, headers=headers, json=payload)

                # HTTP 401 / 403: Invalid API key or unauthorized domain
                if resp.status_code in (401, 403):
                    msg = resp.text[:300]
                    logger.error("[Resend] Authentication failed: %s", msg)
                    raise ResendAuthError(f"Resend API authentication rejected: {resp.status_code}")

                # HTTP 200 / 201 / 202: Accepted by Resend
                if resp.status_code in (200, 201, 202):
                    data = resp.json()
                    message_id = data.get("id") or str(uuid.uuid4())
                    logger.info(
                        "[Resend Live] Successfully sent email to %s (messageId: %s)",
                        clean_email,
                        message_id,
                    )
                    return {"messageId": message_id, "status": "sent"}

                # HTTP 429: Rate limited -> retry with backoff
                if resp.status_code == 429:
                    last_error = ResendDeliveryError("Resend API rate limit exceeded (429)")
                    if attempt < MAX_RETRIES:
                        sleep_sec = RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                        logger.warning(
                            "[Resend Live] Rate limited. Retrying in %.1fs...", sleep_sec
                        )
                        time.sleep(sleep_sec)
                        continue
                    raise last_error

                # HTTP 4xx (Client error, bad request, unverified sender/domain)
                if 400 <= resp.status_code < 500:
                    err_msg = resp.text[:300]
                    logger.warning("[Resend Live] Rejected request (%d): %s", resp.status_code, err_msg)
                    raise ResendDeliveryError(
                        f"Resend API client error ({resp.status_code}): {err_msg}"
                    )

                # HTTP 5xx: Transient provider server error -> retry
                resp.raise_for_status()

            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    sleep_sec = RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "[Resend Live] Attempt %d failed (%s). Retrying in %.1fs...",
                        attempt,
                        exc,
                        sleep_sec,
                    )
                    time.sleep(sleep_sec)
                else:
                    logger.error("[Resend Live] All %d delivery attempts exhausted: %s", MAX_RETRIES, exc)

            except ResendError:
                raise

            except Exception as exc:  # noqa: BLE001
                logger.error("[Resend Live] Unexpected error during send: %s", exc)
                raise ResendDeliveryError(f"Unexpected delivery error: {exc}") from exc

        raise ResendDeliveryError(f"Failed to send email after {MAX_RETRIES} attempts: {last_error}")
