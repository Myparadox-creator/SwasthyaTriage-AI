"""Gmail SMTP transactional email client.

Sends via Google's SMTP relay using a Gmail address + App Password. Unlike the
Resend sandbox, Gmail SMTP can deliver to any recipient without a verified
custom domain, which makes it suitable for demos and small deployments.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
import uuid
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Any

from config import settings
from services.email.base import EmailAuthError, EmailDeliveryError, EmailError

logger = logging.getLogger("swasthyatriage.email")

MAX_RETRIES = 3
RETRY_BACKOFF_BASE_SECONDS = 0.5


class GmailError(EmailError):
    """Base error for the Gmail SMTP provider."""


class GmailAuthError(EmailAuthError, GmailError):
    """Gmail rejected the login (bad address or App Password)."""


class GmailDeliveryError(EmailDeliveryError, GmailError):
    """Gmail could not deliver the message."""


class GmailSmtpClient:
    """Client that sends transactional email through smtp.gmail.com."""

    def __init__(
        self,
        username: str | None = None,
        app_password: str | None = None,
        sender_email: str | None = None,
        sender_name: str | None = None,
        host: str | None = None,
        port: int | None = None,
        delivery_mode: str | None = None,
    ) -> None:
        self.username = (username or settings.gmail_smtp_user).strip()
        # Google shows app passwords grouped in 4s; strip whitespace.
        self.app_password = (app_password or settings.gmail_smtp_app_password).replace(" ", "")
        self.sender_email = (sender_email or settings.gmail_sender_email or self.username).strip()
        self.sender_name = sender_name or settings.gmail_sender_name
        self.host = host or settings.gmail_smtp_host
        self.port = port or settings.gmail_smtp_port
        self.delivery_mode = delivery_mode or settings.email_delivery_mode

    def is_mock_mode(self) -> bool:
        """Mock mode when explicitly requested or when credentials are missing."""
        if self.delivery_mode.lower() == "mock":
            return True
        return not (self.username and self.app_password)

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
        """Sends a transactional email via Gmail SMTP, returning a 'messageId'."""
        clean_email = recipient_email.strip().lower()
        if not clean_email or "@" not in clean_email:
            raise GmailDeliveryError(f"Invalid recipient email address: {clean_email}")

        if self.is_mock_mode():
            mock_id = f"mock-msg-{uuid.uuid4().hex[:16]}"
            logger.info(
                "[Gmail Mock] Simulated email send to %s (subject: '%s', mock_id: %s)",
                clean_email,
                subject,
                mock_id,
            )
            return {"messageId": mock_id, "status": "mock_delivered", "recipient": clean_email}

        message = EmailMessage()
        message["From"] = formataddr((self.sender_name, self.sender_email))
        message["To"] = formataddr((recipient_name or "", clean_email))
        message["Subject"] = subject
        message_id = make_msgid(domain=self.sender_email.split("@")[-1] or "swasthyaflow")
        message["Message-ID"] = message_id
        if settings.email_reply_to:
            message["Reply-To"] = settings.email_reply_to
        message.set_content(text_content or "")
        message.add_alternative(html_content or "", subtype="html")

        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                if self.port == 465:
                    with smtplib.SMTP_SSL(
                        self.host, self.port, timeout=settings.email_request_timeout_seconds,
                        context=ssl.create_default_context(),
                    ) as server:
                        server.login(self.username, self.app_password)
                        server.send_message(message)
                else:
                    with smtplib.SMTP(
                        self.host, self.port, timeout=settings.email_request_timeout_seconds
                    ) as server:
                        server.ehlo()
                        server.starttls(context=ssl.create_default_context())
                        server.ehlo()
                        server.login(self.username, self.app_password)
                        server.send_message(message)
                logger.info(
                    "[Gmail Live] Successfully sent email to %s (messageId: %s)",
                    clean_email,
                    message_id,
                )
                return {"messageId": message_id, "status": "sent"}

            except smtplib.SMTPAuthenticationError as exc:
                logger.error("[Gmail Live] Authentication failed for %s: %s", self.username, exc)
                raise GmailAuthError(
                    "Gmail SMTP authentication failed. Check GMAIL_SMTP_USER and "
                    "GMAIL_SMTP_APP_PASSWORD (a 16-character App Password, not your normal password)."
                ) from exc

            except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, TimeoutError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    import time

                    sleep_sec = RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "[Gmail Live] Attempt %d failed (%s). Retrying in %.1fs...",
                        attempt,
                        exc,
                        sleep_sec,
                    )
                    time.sleep(sleep_sec)
                    continue

            except smtplib.SMTPRecipientsRefused as exc:
                raise GmailDeliveryError(f"Gmail refused the recipient {clean_email}: {exc}") from exc

            except smtplib.SMTPException as exc:
                raise GmailDeliveryError(f"Gmail SMTP error: {exc}") from exc

            except OSError as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    import time

                    time.sleep(RETRY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
                    continue

        raise GmailDeliveryError(
            f"Failed to send email after {MAX_RETRIES} attempts: {last_error}"
        )
