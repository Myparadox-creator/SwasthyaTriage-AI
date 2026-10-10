"""AI Evaluation and Quality Benchmarking API endpoints.

Surfaces speech transcription WER/CER, clinical entity extraction F1,
confidence calibration (ECE), and persisted run history for drift monitoring
across Hindi, Odia, and Indian English.
Role: SUPER_ADMIN (State Directorate Command / Chief Medical Officer).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.dependencies import require_roles
from database.session import get_db
from models import User
from models.enums import Role
from services.evaluation.history import (
    compute_trend,
    list_runs,
    persist_evaluation_run,
    run_to_dict,
)
from services.evaluation.runner import run_reproducible_evaluation

router = APIRouter(prefix="/api/admin/ai-evaluation", tags=["ai-evaluation"])

# Cached initial evaluation report
_CACHED_REPORT: dict[str, Any] | None = None


@router.get("/report")
def get_evaluation_report(
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN, Role.FACILITY_ADMIN)),
) -> dict[str, Any]:
    """Returns the reproducible benchmark evaluation report across Odia, Hindi, and English.

    Role: SUPER_ADMIN (State Directorate Command) & Facility Admin.
    """
    global _CACHED_REPORT
    if _CACHED_REPORT is None:
        _CACHED_REPORT = run_reproducible_evaluation()
    return _CACHED_REPORT


@router.post("/run")
def trigger_benchmark_evaluation(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN)),
) -> dict[str, Any]:
    """Executes a fresh evaluation benchmark, persists the run, and returns metric deltas."""
    global _CACHED_REPORT
    previous = _CACHED_REPORT
    _CACHED_REPORT = run_reproducible_evaluation()
    report = dict(_CACHED_REPORT)

    run = persist_evaluation_run(db, report, actor=current_user)
    report["run_id"] = run.id
    report["run_persisted"] = True
    report["thresholds_breached"] = run.thresholds_breached
    if previous is not None:
        report["deltas_vs_previous"] = _metric_deltas(
            previous.get("overall_metrics", {}), report.get("overall_metrics", {})
        )
    return report


@router.get("/history")
def get_evaluation_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN, Role.FACILITY_ADMIN)),
) -> dict[str, Any]:
    """Returns persisted evaluation runs (most recent first)."""
    runs = list_runs(db, limit=max(1, min(limit, 200)))
    return {
        "count": len(runs),
        "runs": [run_to_dict(r) for r in runs],
        "note": (
            "Runs on synthetic smoke data are monitoring signals, not clinical "
            "validation. Only clinician-adjudicated datasets can support clinical claims."
        ),
    }


@router.get("/trend")
def get_evaluation_trend(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN, Role.FACILITY_ADMIN)),
) -> dict[str, Any]:
    """Returns per-metric series and drift flags across persisted runs."""
    runs = list_runs(db, limit=max(1, min(limit, 200)))
    ordered = list(reversed(runs))  # oldest -> newest for trend computation
    payload = [
        {"id": r.id, "created_at": r.created_at, "metrics": r.metrics or {}} for r in ordered
    ]
    return compute_trend(payload)


def _metric_deltas(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    deltas: dict[str, Any] = {}
    for key, value in current.items():
        if isinstance(value, (int, float)) and isinstance(previous.get(key), (int, float)):
            deltas[key] = round(float(value) - float(previous[key]), 4)
    return deltas
