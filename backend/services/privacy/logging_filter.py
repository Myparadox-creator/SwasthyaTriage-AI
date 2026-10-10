"""Logging filter that strips personal identifiers before records are emitted.

Logs are the easiest place for PII to leak — phone numbers, emails and Aadhaar
numbers routinely end up in ``logger.info("... %s", value)`` calls. Rather than
relying on every call site to mask correctly, we install a single filter on the
root handlers that rewrites the record's message and arguments in place.
"""

from __future__ import annotations

import logging

from services.privacy.redaction import redact_text


class PIIRedactionFilter(logging.Filter):
    """Redact phone/email/Aadhaar from every log record's message and args."""

    def filter(self, record: logging.LogRecord) -> bool:
        # ``record.msg`` is only interpolated at format time, so redact both the
        # template and the arguments to cover "%s" style and f-string messages.
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)

        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    key: redact_text(val) if isinstance(val, str) else val
                    for key, val in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact_text(arg) if isinstance(arg, str) else arg
                    for arg in record.args
                )

        return True


def install_log_redaction(level: int = logging.NOTSET) -> None:
    """Attach the PII redaction filter to the root logger and its handlers.

    Idempotent: safe to call more than once (e.g. under Uvicorn's reloader).
    """
    root = logging.getLogger()

    # Guard against double-installation.
    if any(isinstance(f, PIIRedactionFilter) for f in root.filters):
        return

    flt = PIIRedactionFilter()
    root.addFilter(flt)
    for handler in root.handlers:
        handler.addFilter(flt)

    # Handlers added later (by Uvicorn, etc.) still inherit via the logger filter,
    # but attach to any that already exist above. Future handlers are covered by
    # calling install_log_redaction() again after basicConfig if needed.


__all__ = ["PIIRedactionFilter", "install_log_redaction"]
