"""Shared error hierarchy for transactional email providers."""

from __future__ import annotations


class EmailError(Exception):
    """Base error for all transactional email provider issues."""


class EmailAuthError(EmailError):
    """Provider rejected the credentials (invalid API key / app password)."""


class EmailDeliveryError(EmailError):
    """Provider failed to deliver the email (bad recipient, quota, 5xx, etc.)."""
