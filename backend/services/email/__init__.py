"""Transactional email system for SwasthyaFlow AI.

Supports two interchangeable providers:
- Gmail SMTP (``gmail``) — sends to any recipient, no verified domain required.
- Resend API (``resend``) — requires a verified sender domain for real recipients.
"""

from services.email.base import EmailAuthError, EmailDeliveryError, EmailError
from services.email.client import email_provider_info, get_email_client
from services.email.gmail import (
    GmailAuthError,
    GmailDeliveryError,
    GmailError,
    GmailSmtpClient,
)
from services.email.resend import (
    ResendAuthError,
    ResendClient,
    ResendDeliveryError,
    ResendError,
)
from services.email.service import (
    create_and_send_password_reset_email,
    create_and_send_verification_email,
    dispatch_email,
    mark_password_reset_token_used,
    retry_failed_email,
    send_clarification_request_email,
    send_encounter_assignment_email,
    send_password_changed_email,
    send_referral_status_email,
    send_security_alert_email,
    send_staff_invitation_email,
    send_welcome_email,
    verify_email_token,
    verify_password_reset_token,
)
from services.email.templates import render_email_template

__all__ = [
    "EmailError",
    "EmailAuthError",
    "EmailDeliveryError",
    "get_email_client",
    "email_provider_info",
    "GmailSmtpClient",
    "GmailError",
    "GmailAuthError",
    "GmailDeliveryError",
    "ResendClient",
    "ResendError",
    "ResendAuthError",
    "ResendDeliveryError",
    "render_email_template",
    "dispatch_email",
    "create_and_send_verification_email",
    "verify_email_token",
    "create_and_send_password_reset_email",
    "verify_password_reset_token",
    "mark_password_reset_token_used",
    "send_welcome_email",
    "send_password_changed_email",
    "send_staff_invitation_email",
    "send_encounter_assignment_email",
    "send_clarification_request_email",
    "send_referral_status_email",
    "send_security_alert_email",
    "retry_failed_email",
]
