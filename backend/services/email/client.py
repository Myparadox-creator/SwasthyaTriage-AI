"""Email provider selection and metadata helpers.

Chooses the concrete transactional email client (Gmail SMTP or Resend) based on
``settings.email_provider`` so the rest of the app stays provider-agnostic.
"""

from __future__ import annotations

from config import settings
from services.email.gmail import GmailSmtpClient
from services.email.resend import ResendClient


def get_email_client() -> GmailSmtpClient | ResendClient:
    """Returns the configured transactional email client."""
    if settings.email_provider.strip().lower() == "gmail":
        return GmailSmtpClient()
    return ResendClient()


def email_provider_info() -> dict:
    """Returns display/config metadata for the active email provider."""
    provider = settings.email_provider.strip().lower()
    if provider == "gmail":
        sender = settings.gmail_sender_email or settings.gmail_smtp_user
        return {
            "provider": "Gmail SMTP",
            "configured": bool(settings.gmail_smtp_user and settings.gmail_smtp_app_password),
            "sender_email": sender,
            "sender_name": settings.gmail_sender_name,
            "reply_to_email": settings.email_reply_to,
        }
    return {
        "provider": "Resend Transactional Email",
        "configured": bool(settings.resend_api_key),
        "sender_email": settings.resend_sender_email,
        "sender_name": settings.resend_sender_name,
        "reply_to_email": settings.resend_reply_to_email,
    }
