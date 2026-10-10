"""Privacy & data-protection layer.

Central helpers for the guarantees this system makes about patient data:

- ``redaction`` — detect and mask personal identifiers (phone, email, Aadhaar)
  in free text, log records and nested payloads.
- ``logging_filter`` — a logging filter that redacts PII before it is emitted.
- ``retention`` — the data-retention policy and the routine that purges expired
  credentials and stale operational records.
- ``erasure`` — irreversible pseudonymisation of a patient's data (right to
  erasure) while preserving the clinical/audit record.
- ``export`` — a machine-readable copy of everything held about a patient
  (right to access / data portability).
"""

from services.privacy.redaction import (
    RedactionCounts,
    redact_mapping,
    redact_text,
    redact_value,
)
from services.privacy.retention import (
    RetentionReport,
    purge_expired_data,
    retention_policy,
)

__all__ = [
    "RedactionCounts",
    "RetentionReport",
    "purge_expired_data",
    "redact_mapping",
    "redact_text",
    "redact_value",
    "retention_policy",
]
