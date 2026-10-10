"""rename email_logs.brevo_message_id to provider_message_id

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-10-10 10:30:00.000000

"""

from __future__ import annotations

from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("email_logs", "brevo_message_id", new_column_name="provider_message_id")
    op.execute(
        "ALTER INDEX IF EXISTS ix_email_logs_brevo_message_id "
        "RENAME TO ix_email_logs_provider_message_id"
    )


def downgrade() -> None:
    op.execute(
        "ALTER INDEX IF EXISTS ix_email_logs_provider_message_id "
        "RENAME TO ix_email_logs_brevo_message_id"
    )
    op.alter_column("email_logs", "provider_message_id", new_column_name="brevo_message_id")
