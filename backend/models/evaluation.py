"""Persisted AI evaluation runs for drift monitoring.

Each run records the dataset version, model/prompt version, configuration,
the measured metrics, the metrics that were *not* available (so the
dashboard never fabricates a baseline), and any configurable warning
thresholds that were breached.

Runs are produced only by an authorized operator or the deterministic
evaluation runner. Nothing here retrains or deploys a model.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class EvaluationRunKind:
    # A small synthetic smoke test — NOT proof of clinical accuracy.
    SMOKE = "SMOKE"
    # A larger, governed run (de-identified or specialist-reviewed data).
    GUARDED = "GUARDED"


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_label: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default=EvaluationRunKind.SMOKE, index=True
    )

    dataset_version: Mapped[str] = mapped_column(String(64), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    config_version: Mapped[str | None] = mapped_column(String(64))
    provider: Mapped[str | None] = mapped_column(String(64))

    dataset_kind: Mapped[str | None] = mapped_column(String(32))  # synthetic | de_identified
    is_clinical_validation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    total_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    language_breakdown: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Metrics the run could not honestly compute (empty datasets, no references)
    unavailable_metrics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    thresholds_breached: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
