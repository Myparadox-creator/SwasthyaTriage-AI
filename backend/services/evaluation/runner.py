"""Benchmark evaluation runner for Speech Recognition, Clinical NLP, and Calibration.

Executes reproducible evaluations across Odia, Hindi, and English test sets.
Returns structured evaluation payloads for the Super Admin Evaluation Dashboard.
Role: SUPER_ADMIN (State Directorate Command / CMO).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from services.clinical_nlp.confidence import estimate_measurement_confidence, estimate_symptom_confidence
from services.evaluation.benchmark_data import BENCHMARK_CASES
from services.evaluation.history import (
    CONFIG_VERSION,
    DATASET_VERSION,
    UNAVAILABLE_METRICS,
)
from services.evaluation.metrics import (
    calculate_cer,
    calculate_entity_f1,
    calculate_expected_calibration_error,
    calculate_wer,
)
from services.gemini.base import provider_label
from services.intake.fallback import extract_from_message


def run_reproducible_evaluation() -> dict[str, Any]:
    """Executes the full clinical AI evaluation suite and returns metrics."""
    language_metrics: dict[str, dict[str, Any]] = {
        "en": {"wer_list": [], "cer_list": [], "prec_list": [], "rec_list": [], "f1_list": [], "count": 0},
        "hi": {"wer_list": [], "cer_list": [], "prec_list": [], "rec_list": [], "f1_list": [], "count": 0},
        "od": {"wer_list": [], "cer_list": [], "prec_list": [], "rec_list": [], "f1_list": [], "count": 0},
    }

    all_wer: list[float] = []
    all_cer: list[float] = []
    all_prec: list[float] = []
    all_rec: list[float] = []
    all_f1: list[float] = []

    confidences_for_ece: list[float] = []
    correctness_for_ece: list[bool] = []

    case_eval_details: list[dict[str, Any]] = []

    for bcase in BENCHMARK_CASES:
        lang = bcase.language
        # 1. Speech Transcription Metrics (WER / CER)
        wer = calculate_wer(bcase.reference_transcript, bcase.synthetic_asr_hypothesis)
        cer = calculate_cer(bcase.reference_transcript, bcase.synthetic_asr_hypothesis)

        all_wer.append(wer)
        all_cer.append(cer)

        # 2. Entity Extraction Evaluation
        extraction = extract_from_message(bcase.reference_transcript)
        extracted_symptoms = list(extraction.symptoms)

        f1_res = calculate_entity_f1(bcase.reference_symptoms, extracted_symptoms)
        all_prec.append(f1_res["precision"])
        all_rec.append(f1_res["recall"])
        all_f1.append(f1_res["f1"])

        # 3. Confidence & Calibration
        for sym in extracted_symptoms:
            conf_item = estimate_symptom_confidence(sym, bcase.reference_transcript)
            is_correct = any(
                ref_s.lower() in sym.lower() or sym.lower() in ref_s.lower()
                for ref_s in bcase.reference_symptoms
            )
            confidences_for_ece.append(conf_item.confidence)
            correctness_for_ece.append(is_correct)

        if lang in language_metrics:
            lm = language_metrics[lang]
            lm["wer_list"].append(wer)
            lm["cer_list"].append(cer)
            lm["prec_list"].append(f1_res["precision"])
            lm["rec_list"].append(f1_res["recall"])
            lm["f1_list"].append(f1_res["f1"])
            lm["count"] += 1

        case_eval_details.append({
            "case_id": bcase.case_id,
            "language": bcase.language,
            "scenario": bcase.scenario_title,
            "wer": wer,
            "cer": cer,
            "entity_f1": f1_res["f1"],
            "entity_precision": f1_res["precision"],
            "entity_recall": f1_res["recall"],
            "is_emergency": bcase.is_emergency,
        })

    # Aggregate language breakdowns
    language_breakdown = {}
    for lang_code, data in language_metrics.items():
        cnt = max(1, data["count"])
        language_breakdown[lang_code] = {
            "name": {"en": "English", "hi": "Hindi", "od": "Odia"}.get(lang_code, lang_code),
            "sample_count": data["count"],
            "mean_wer": round(sum(data["wer_list"]) / cnt, 4),
            "mean_cer": round(sum(data["cer_list"]) / cnt, 4),
            "entity_precision": round(sum(data["prec_list"]) / cnt, 4),
            "entity_recall": round(sum(data["rec_list"]) / cnt, 4),
            "entity_f1": round(sum(data["f1_list"]) / cnt, 4),
        }

    # Global ECE
    ece = calculate_expected_calibration_error(confidences_for_ece, correctness_for_ece)

    total_samples = len(BENCHMARK_CASES)
    return {
        "timestamp": datetime.now().isoformat(),
        "total_test_cases": total_samples,
        "dataset_version": DATASET_VERSION,
        "model_version": provider_label(),
        "config_version": CONFIG_VERSION,
        "provider": provider_label(),
        "dataset_kind": "synthetic",
        "is_clinical_validation": False,
        "unavailable_metrics": UNAVAILABLE_METRICS,
        "warnings": [
            "This is a small synthetic smoke suite. It is NOT clinical validation "
            "and must never be presented as real-world accuracy on patients.",
        ],
        "overall_metrics": {
            "mean_wer": round(sum(all_wer) / max(1, total_samples), 4),
            "mean_cer": round(sum(all_cer) / max(1, total_samples), 4),
            "mean_precision": round(sum(all_prec) / max(1, total_samples), 4),
            "mean_recall": round(sum(all_rec) / max(1, total_samples), 4),
            "mean_f1": round(sum(all_f1) / max(1, total_samples), 4),
            "expected_calibration_error_ece": ece,
            "calibration_status": "EMPIRICALLY_EVALUATED",
        },
        "language_breakdown": language_breakdown,
        "cases": case_eval_details,
    }
