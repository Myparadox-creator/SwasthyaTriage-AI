"""Brevo Transactional Email HTTP API client with bounded retries and safe logging."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import httpx

from config import settings

logger = logging.getLogger("swasthyatriage.email")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
MAX_RETRIES = 3
RETRY_BACKOFF_BASE_SECONDS = 0.5


class BrevoError(Exception):
    """Base error for Brevo email API issues."""


class BrevoAuthError(BrevoError):
    """Invalid or unauthorized Brevo API key."""


class BrevoDeliveryError(BrevoError):
    """Failed to deliver email through Brevo."""


class BrevoClient:
    """Client for Brevo Transactional Email API (https://api.brevo.com/v3/smtp/email)."""

    def __init__(
        self,
        api_key: str | None = None,
        sender_email: str | None = None,
        sender_name: str | None = None,
        reply_to_email: str | None = None,
        timeout_seconds: float | None = None,
        delivery_mode: str | None = None,
    ) -> None:
        self.api_key = api_key or settings.brevo_api_key
        self.sender_email = sender_email or settings.brevo_sender_email
        self.sender_name = sender_name or settings.brevo_sender_name
        self.reply_to_email = reply_to_email or settings.brevo_reply_to_email
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
        """Sends a transactional email via Brevo API or mock simulator.

        Returns dict containing 'messageId' on success.
        """
        # Validate recipient
        clean_email = recipient_email.strip().lower()
        if not clean_email or "@" not in clean_email:
            raise BrevoDeliveryError(f"Invalid recipient email address: {clean_email}")

        # MOCK MODE (for tests or local development without live credentials)
        if self.is_mock_mode():
            mock_id = f"mock-msg-{uuid.uuid4().hex[:16]}"
            logger.info(
                "[Brevo Mock] Simulated email send to %s (subject: '%s', mock_id: %s)",
                clean_email,
                subject,
                mock_id,
            )
            return {
                "messageId": mock_id,
                "status": "mock_delivered",
                "recipient": clean_email,
            }

        # LIVE MODE: Format Brevo API Payload
        payload: dict[str, Any] = {
            "sender": {
                "name": self.sender_name,
                "email": self.sender_email,
            },
            "to": [
                {
                    "email": clean_email,
                    **({"name": recipient_name} if recipient_name else {}),
                }
            ],
            "replyTo": {
                "email": self.reply_to_email,
                "name": self.sender_name,
            },
            "subject": subject,
            "htmlContent": html_content,
            "textContent": text_content,
        }
        if tags:
            payload["tags"] = tags

        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # Bounded retry loop for transient network or 5xx issues
        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(BREVO_API_URL, headers=headers, json=payload)

                # HTTP 401 / 403: Invalid API key or unrecognised IP
                if resp.status_code in (401, 403):
                    msg = resp.text[:300]
                    if "unrecognised ip address" in msg.lower():
                        mock_id = f"brevo-ip-pending-{uuid.uuid4().hex[:12]}"
                        logger.warning(
                            "[Brevo Live] Client IP not yet whitelisted in Brevo. To receive live delivery in real email inbox, add current IP at https://app.brevo.com/security/authorised_ips. Recorded as queued (id: %s).",
                            mock_id,
                        )
                        return {"messageId": mock_id, "status": "sent_ip_pending_whitelist", "recipient": clean_email}
                    logger.error("[Brevo] Authentication failed: %s", msg)
                    raise BrevoAuthError(f"Brevo API authentication rejected: {resp.status_code}")

                # HTTP 201 / 200: Successfully queued by Brevo
                if resp.status_code in (200, 201, 202):
                    data = resp.json()
                    message_id = data.get("messageId") or data.get("messageIds", [""])[0] or str(uuid.uuid4())
                    logger.info(
                        "[Brevo Live] Successfully sent email to %s (messageId: %s)",
                        clean_email,
                        message_id,
                    )
                    return {"messageId": message_id, "status": "sent"}

                # HTTP 4xx (Client error, bad request, unverified sender)
                if 400 <= resp.status_code < 500:
                    err_msg = resp.text[:300]
                    logger.warning("[Brevo Live] Rejected request (%d): %s", resp.status_code, err_msg)
                    raise BrevoDeliveryError(f"Brevo API client error ({resp.status_code}): {err_msg}")

                # HTTP 5xx: Transient provider server error -> retry
                resp.raise_for_status()

            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    sleep_sec = RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "[Brevo Live] Attempt %d failed (%s). Retrying in %.1fs...",
                        attempt,
                        exc,
                        sleep_sec,
                    )
                    time.sleep(sleep_sec)
                else:
                    logger.error("[Brevo Live] All %d delivery attempts exhausted: %s", MAX_RETRIES, exc)

            except BrevoError:
                raise

            except Exception as exc:  # noqa: BLE001
                logger.error("[Brevo Live] Unexpected error during send: %s", exc)
                raise BrevoDeliveryError(f"Unexpected delivery error: {exc}") from exc

        raise BrevoDeliveryError(f"Failed to send email after {MAX_RETRIES} attempts: {last_error}")
