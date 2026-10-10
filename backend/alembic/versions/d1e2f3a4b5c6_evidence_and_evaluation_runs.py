"""evidence traceability and evaluation run persistence

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-10-10 09:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fact_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), nullable=False),
        sa.Column("fact_type", sa.String(length=32), nullable=False),
        sa.Column("fact_ref", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("normalized_value", sa.Text(), nullable=True),
        sa.Column("original_value", sa.Text(), nullable=True),
        sa.Column("current_value", sa.Text(), nullable=True),
        sa.Column("source_kind", sa.String(length=32), nullable=False),
        sa.Column("source_provenance", sa.String(length=32), nullable=False),
        sa.Column("source_snippet", sa.Text(), nullable=True),
        sa.Column("source_ref_id", sa.String(length=64), nullable=True),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extraction_method", sa.String(length=32), nullable=False, server_default="RULE"),
        sa.Column("model_version", sa.String(length=64), nullable=True),
        sa.Column("extraction_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("confidence_tier", sa.String(length=16), nullable=True),
        sa.Column("is_calibrated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("validation_warnings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("sop_references", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("reviewer_status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("reviewer_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewer_label", sa.String(length=255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("case_id", "fact_ref", name="uq_fact_evidence_case_ref"),
    )
    op.create_index("ix_fact_evidence_case_id", "fact_evidence", ["case_id"])
    op.create_index("ix_fact_evidence_fact_ref", "fact_evidence", ["fact_ref"])
    op.create_index("ix_fact_evidence_reviewer_status", "fact_evidence", ["reviewer_status"])
    op.create_index("ix_fact_evidence_created_at", "fact_evidence", ["created_at"])

    op.create_table(
        "evaluation_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_label", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="SMOKE"),
        sa.Column("dataset_version", sa.String(length=64), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("config_version", sa.String(length=64), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("dataset_kind", sa.String(length=32), nullable=True),
        sa.Column("is_clinical_validation", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("total_samples", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("language_breakdown", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("unavailable_metrics", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("warnings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("thresholds_breached", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_evaluation_runs_run_label", "evaluation_runs", ["run_label"])
    op.create_index("ix_evaluation_runs_kind", "evaluation_runs", ["kind"])
    op.create_index("ix_evaluation_runs_created_at", "evaluation_runs", ["created_at"])


def downgrade() -> None:
    op.drop_table("evaluation_runs")
    op.drop_table("fact_evidence")
