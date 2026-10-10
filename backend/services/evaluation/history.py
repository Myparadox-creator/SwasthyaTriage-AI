"""Persist evaluation runs and monitor metric drift over time.

This is monitoring only. It never retrains, deploys, or claims clinical
validity. A breach or drift flag means a human must investigate.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import EvaluationRun, User
from models.evaluation import EvaluationRunKind
from services.audit import AuditAction, record_audit

# Configurable warning thresholds. "limit" is the boundary a metric must not
# cross; "drift_delta" is the change between consecutive runs that is flagged.
DEFAULT_THRESHOLDS: dict[str, dict[str, Any]] = {
    "mean_wer": {"better": "lower", "limit": 0.25, "drift_delta": 0.05},
    "mean_cer": {"better": "lower", "limit": 0.20, "drift_delta": 0.05},
    "mean_f1": {"better": "higher", "limit": 0.75, "drift_delta": 0.05},
    "mean_precision": {"better": "higher", "limit": 0.75, "drift_delta": 0.05},
    "mean_recall": {"better": "higher", "limit": 0.75, "drift_delta": 0.05},
    "expected_calibration_error_ece": {"better": "lower", "limit": 0.15, "drift_delta": 0.05},
}

DATASET_VERSION = "synthetic-smoke-v1"
CONFIG_VERSION = "ai-eval-v1"

# Honestly unavailable: we have no de-identified reference corpus or
# clinician-adjudicated labels in this environment.
UNAVAILABLE_METRICS = [
    "human_correction_rate",
    "clinician_agreement_rate",
    "real_world_asr_wer",
    "demographic_subgroup_breakdowns",
]


def evaluate_thresholds(
    overall_metrics: dict[str, Any],
    thresholds: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return the list of threshold limit violations (pure function)."""
    thresholds = thresholds or DEFAULT_THRESHOLDS
    breaches: list[dict[str, Any]] = []
    for metric, rule in thresholds.items():
        value = overall_metrics.get(metric)
        if value is None:
            continue
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        limit = rule["limit"]
        if rule["better"] == "lower" and numeric > limit:
            breaches.append(
                {"metric": metric, "value": numeric, "limit": limit, "direction": "higher_is_worse"}
            )
        elif rule["better"] == "higher" and numeric < limit:
            breaches.append(
                {"metric": metric, "value": numeric, "limit": limit, "direction": "lower_is_worse"}
            )
    return breaches


def compute_trend(
    runs: list[dict[str, Any]],
    thresholds: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compute per-metric series, deltas, and drift flags (pure function).

    ``runs`` must be ordered oldest -> newest, each with keys:
    ``id``, ``created_at``, ``metrics`` (overall_metrics dict).
    """
    thresholds = thresholds or DEFAULT_THRESHOLDS
    metrics_out: dict[str, Any] = {}
    drift_metrics: list[str] = []

    for metric, rule in thresholds.items():
        points = [
            {
                "run_id": r["id"],
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "value": float(r["metrics"][metric]),
            }
            for r in runs
            if r.get("metrics", {}).get(metric) is not None
        ]
        if not points:
            continue
        latest = points[-1]["value"]
        previous = points[-2]["value"] if len(points) >= 2 else None
        delta = None if previous is None else round(latest - previous, 4)

        breach = False
        if rule["better"] == "lower" and latest > rule["limit"]:
            breach = True
        elif rule["better"] == "higher" and latest < rule["limit"]:
            breach = True

        delta_flagged = (
            previous is not None
            and abs(delta or 0.0) > rule["drift_delta"]
            and _worsened(rule["better"], delta)
        )
        drift = breach or delta_flagged
        if drift:
            drift_metrics.append(metric)

        if delta is None:
            direction = "flat"
        elif delta > 0:
            direction = "up"
        elif delta < 0:
            direction = "down"
        else:
            direction = "flat"

        metrics_out[metric] = {
            "series": points,
            "latest": latest,
            "previous": previous,
            "delta": delta,
            "direction": direction,
            "limit": rule["limit"],
            "better": rule["better"],
            "threshold_breached": breach,
            "drift_detected": drift,
        }

    return {
        "run_count": len(runs),
        "metrics": metrics_out,
        "drift_detected": len(drift_metrics) > 0,
        "drift_metrics": drift_metrics,
        "thresholds": thresholds,
        "is_clinical_validation": False,
        "note": (
            "Drift monitoring flags statistical movement in the synthetic smoke "
            "suite only. It is not evidence of clinical performance."
        ),
    }


def _worsened(better: str, delta: float) -> bool:
    # delta = latest - previous.
    if better == "lower":
        return delta > 0
    return delta < 0


def persist_evaluation_run(
    db: Session,
    report: dict[str, Any],
    *,
    actor: User | None = None,
    kind: str = EvaluationRunKind.SMOKE,
    run_label: str | None = None,
    notes: str | None = None,
    commit: bool = True,
) -> EvaluationRun:
    """Persist a completed evaluation report as a comparable run."""
    overall = report.get("overall_metrics", {})
    breaches = evaluate_thresholds(overall)

    run = EvaluationRun(
        run_label=run_label or f"{report.get('dataset_version', DATASET_VERSION)}@{datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}",
        kind=kind,
        dataset_version=report.get("dataset_version", DATASET_VERSION),
        model_version=report.get("model_version", "unknown"),
        config_version=report.get("config_version", CONFIG_VERSION),
        provider=report.get("provider"),
        dataset_kind=report.get("dataset_kind", "synthetic"),
        is_clinical_validation=bool(report.get("is_clinical_validation", False)),
        total_samples=int(report.get("total_test_cases", 0) or 0),
        metrics=overall,
        language_breakdown=report.get("language_breakdown", {}),
        unavailable_metrics=report.get("unavailable_metrics", UNAVAILABLE_METRICS),
        warnings=report.get("warnings", []),
        thresholds_breached=breaches,
        created_by_user_id=actor.id if actor else None,
        notes=notes,
    )
    db.add(run)
    db.flush()
    record_audit(
        db,
        AuditAction.EVALUATION_RUN_RECORDED,
        user=actor,
        metadata={
            "run_id": run.id,
            "dataset_version": run.dataset_version,
            "model_version": run.model_version,
            "thresholds_breached": [b["metric"] for b in breaches],
        },
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(run)
    return run


def list_runs(db: Session, *, limit: int = 50) -> list[EvaluationRun]:
    return list(
        db.scalars(
            select(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit)
        )
    )


def run_to_dict(run: EvaluationRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "run_label": run.run_label,
        "kind": run.kind,
        "dataset_version": run.dataset_version,
        "model_version": run.model_version,
        "config_version": run.config_version,
        "provider": run.provider,
        "dataset_kind": run.dataset_kind,
        "is_clinical_validation": run.is_clinical_validation,
        "total_samples": run.total_samples,
        "metrics": run.metrics or {},
        "language_breakdown": run.language_breakdown or {},
        "unavailable_metrics": run.unavailable_metrics or [],
        "warnings": run.warnings or [],
        "thresholds_breached": run.thresholds_breached or [],
        "created_at": run.created_at,
        "notes": run.notes,
    }
