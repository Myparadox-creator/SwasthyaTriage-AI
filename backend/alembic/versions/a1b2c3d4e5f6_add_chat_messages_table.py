"""add chat_messages table

Revision ID: a1b2c3d4e5f6
Revises: d3eef64b2482
Create Date: 2026-10-08 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "d3eef64b2482"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=40), nullable=False),
        sa.Column("case_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("AI", "PATIENT", "SYSTEM", name="message_role", create_type=False),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=True),
        sa.Column("channel", sa.String(length=16), nullable=False, server_default="CHAT"),
        sa.Column("had_audio", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_chat_messages_public_id", "chat_messages", ["public_id"], unique=True)
    op.create_index("ix_chat_messages_case_id", "chat_messages", ["case_id"])
    op.create_index("ix_chat_messages_role", "chat_messages", ["role"])
    op.create_index("ix_chat_messages_created_at", "chat_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_created_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_role", table_name="chat_messages")
    op.drop_index("ix_chat_messages_case_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_public_id", table_name="chat_messages")
    op.drop_table("chat_messages")