"""Brevo Transactional Email System for SwasthyaFlow AI."""

from services.email.brevo import BrevoAuthError, BrevoClient, BrevoDeliveryError, BrevoError
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
    "BrevoClient",
    "BrevoError",
    "BrevoAuthError",
    "BrevoDeliveryError",
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
