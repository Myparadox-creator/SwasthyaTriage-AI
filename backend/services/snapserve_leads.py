"""Server-side SnapServe lead capture.

SnapServe's browser widget posts leads to ``{base}/webhooks/lead/<api_key>``,
which embeds the live API key in the page. We proxy the same call through the
backend instead, so the key never reaches the browser.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

logger = logging.getLogger("swasthyatriage.snapserve.leads")


def lead_capture_configured() -> bool:
    """True when a SnapServe API key is available for server-side lead capture."""
    return bool((settings.snapserve_api_key or "").strip())


def submit_snapserve_lead(fields: dict[str, Any]) -> bool:
    """Forward a lead to SnapServe on behalf of the browser.

    Best-effort: returns False on any failure and never raises, so lead capture
    can never break the patient-facing flow.
    """
    key = (settings.snapserve_api_key or "").strip()
    if not key:
        logger.warning("SnapServe lead capture skipped: no API key configured")
        return False

    url = f"{settings.snapserve_base_url.rstrip('/')}/webhooks/lead/{key}"
    try:
        resp = httpx.post(url, json=fields, timeout=15.0)
    except httpx.HTTPError as exc:
        logger.warning("SnapServe lead capture unreachable: %s", exc)
        return False

    if resp.status_code not in (200, 201, 202):
        logger.warning(
            "SnapServe lead capture failed (%s): %s",
            resp.status_code,
            (resp.text or "")[:200],
        )
        return False
    return True
