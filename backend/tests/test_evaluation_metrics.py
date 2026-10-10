"""Unit tests for AI evaluation metrics (WER, CER, F1, ECE) and benchmark runner."""

from services.evaluation.metrics import (
    calculate_cer,
    calculate_entity_f1,
    calculate_expected_calibration_error,
    calculate_wer,
)
from services.evaluation.runner import run_reproducible_evaluation


def test_wer_identical():
    ref = "severe fever and dry cough"
    hyp = "severe fever and dry cough"
    assert calculate_wer(ref, hyp) == 0.0


def test_wer_substitution_and_deletion():
    ref = "patient has severe fever"
    hyp = "patient has mild"
    # ref len = 4; hyp has 'mild' (sub for severe) and deletion of 'fever'
    wer = calculate_wer(ref, hyp)
    assert wer > 0.0
    assert wer == 0.5


def test_cer_identical():
    ref = "ଡିଗ୍ରୀ"
    hyp = "ଡିଗ୍ରୀ"
    assert calculate_cer(ref, hyp) == 0.0


def test_entity_f1_perfect():
    res = calculate_entity_f1(["fever", "cough"], ["cough", "fever"])
    assert res["precision"] == 1.0
    assert res["recall"] == 1.0
    assert res["f1"] == 1.0


def test_entity_f1_partial():
    ref = ["fever", "cough", "chest pain"]
    pred = ["fever", "headache"]
    res = calculate_entity_f1(ref, pred)
    assert res["precision"] == 0.5  # 1/2
    assert round(res["recall"], 2) == 0.33  # 1/3
    assert res["f1"] > 0.0


def test_expected_calibration_error():
    confs = [0.9, 0.8, 0.7, 0.6, 0.95]
    corr = [True, True, True, False, True]
    ece = calculate_expected_calibration_error(confs, corr, num_bins=5)
    assert 0.0 <= ece <= 1.0


def test_reproducible_evaluation_runner():
    report = run_reproducible_evaluation()
    assert report["total_test_cases"] >= 3
    assert "overall_metrics" in report
    assert "language_breakdown" in report
    assert "en" in report["language_breakdown"]
    assert "hi" in report["language_breakdown"]
    assert "od" in report["language_breakdown"]
    assert report["overall_metrics"]["expected_calibration_error_ece"] >= 0.0
