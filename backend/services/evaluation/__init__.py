"""AI Evaluation and Benchmarking package for SwasthyaFlow AI."""

from services.evaluation.benchmark_data import BENCHMARK_CASES
from services.evaluation.metrics import (
    calculate_cer,
    calculate_entity_f1,
    calculate_expected_calibration_error,
    calculate_wer,
)
from services.evaluation.runner import run_reproducible_evaluation

__all__ = [
    "BENCHMARK_CASES",
    "calculate_cer",
    "calculate_entity_f1",
    "calculate_expected_calibration_error",
    "calculate_wer",
    "run_reproducible_evaluation",
]
