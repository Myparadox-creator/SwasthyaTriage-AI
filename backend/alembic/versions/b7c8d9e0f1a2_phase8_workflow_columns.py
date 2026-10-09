"""phase 8 workflow columns: referral versioning, followup assignment, rule versioning

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-10-08 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "referrals",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("referrals", sa.Column("supersedes_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_referrals_supersedes_id",
        "referrals",
        "referrals",
        ["supersedes_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "safety_rules",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("safety_rules", sa.Column("updated_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_safety_rules_updated_by_user_id",
        "safety_rules",
        "users",
        ["updated_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("followups", sa.Column("assigned_to_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_followups_assigned_to_user_id",
        "followups",
        "users",
        ["assigned_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "followups",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("followups", "updated_at")
    op.drop_constraint("fk_followups_assigned_to_user_id", "followups", type_="foreignkey")
    op.drop_column("followups", "assigned_to_user_id")

    op.drop_constraint("fk_safety_rules_updated_by_user_id", "safety_rules", type_="foreignkey")
    op.drop_column("safety_rules", "updated_by_user_id")
    op.drop_column("safety_rules", "version")

    op.drop_constraint("fk_referrals_supersedes_id", "referrals", type_="foreignkey")
    op.drop_column("referrals", "supersedes_id")
    op.drop_column("referrals", "version")
