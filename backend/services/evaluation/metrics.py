"""Reproducible AI/ML evaluation metrics for speech transcription, clinical NER, and confidence calibration.

Implements exact standard formulations:
- Word Error Rate (WER) via Wagner-Fischer dynamic programming
- Character Error Rate (CER) via character Levenshtein distance
- Precision, Recall, and F1 for clinical entity extraction
- Expected Calibration Error (ECE) across confidence bins
"""

from __future__ import annotations

import re
from typing import Sequence


def compute_levenshtein_distance(seq_ref: Sequence[str], seq_hyp: Sequence[str]) -> tuple[int, int, int, int]:
    """Computes substitutions, deletions, insertions, and total reference length.

    Returns (substitutions, deletions, insertions, ref_len).
    """
    n = len(seq_ref)
    m = len(seq_hyp)

    if n == 0:
        return 0, 0, m, 0
    if m == 0:
        return 0, n, 0, n

    # DP matrix: dp[i][j] = (cost, s, d, ins)
    dp = [[(0, 0, 0, 0) for _ in range(m + 1)] for _ in range(n + 1)]

    for i in range(1, n + 1):
        dp[i][0] = (i, 0, i, 0)
    for j in range(1, m + 1):
        dp[0][j] = (j, 0, 0, j)

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if seq_ref[i - 1] == seq_hyp[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                sub_cost = dp[i - 1][j - 1][0] + 1
                del_cost = dp[i - 1][j][0] + 1
                ins_cost = dp[i][j - 1][0] + 1

                min_cost = min(sub_cost, del_cost, ins_cost)
                if min_cost == sub_cost:
                    prev = dp[i - 1][j - 1]
                    dp[i][j] = (sub_cost, prev[1] + 1, prev[2], prev[3])
                elif min_cost == del_cost:
                    prev = dp[i - 1][j]
                    dp[i][j] = (del_cost, prev[1], prev[2] + 1, prev[3])
                else:
                    prev = dp[i][j - 1]
                    dp[i][j] = (ins_cost, prev[1], prev[2], prev[3] + 1)

    _, s, d, ins = dp[n][m]
    return s, d, ins, n


def calculate_wer(reference_text: str, hypothesis_text: str) -> float:
    """Calculates Word Error Rate (WER) between reference and hypothesis text."""
    ref_words = re.findall(r"\S+", reference_text.strip().lower())
    hyp_words = re.findall(r"\S+", hypothesis_text.strip().lower())

    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    s, d, ins, ref_len = compute_levenshtein_distance(ref_words, hyp_words)
    wer = (s + d + ins) / float(ref_len)
    return round(wer, 4)


def calculate_cer(reference_text: str, hypothesis_text: str) -> float:
    """Calculates Character Error Rate (CER) between reference and hypothesis."""
    ref_chars = list(reference_text.strip().lower())
    hyp_chars = list(hypothesis_text.strip().lower())

    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0

    s, d, ins, ref_len = compute_levenshtein_distance(ref_chars, hyp_chars)
    cer = (s + d + ins) / float(ref_len)
    return round(cer, 4)


def calculate_entity_f1(
    reference_entities: list[str],
    predicted_entities: list[str],
) -> dict[str, float]:
    """Calculates Precision, Recall, and F1-score for clinical entity extraction."""
    ref_set = {re.sub(r"\s+", " ", e.strip().lower()) for e in reference_entities if e.strip()}
    pred_set = {re.sub(r"\s+", " ", e.strip().lower()) for e in predicted_entities if e.strip()}

    if not ref_set and not pred_set:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    if not ref_set or not pred_set:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    true_positives = len(ref_set.intersection(pred_set))
    precision = true_positives / float(len(pred_set)) if pred_set else 0.0
    recall = true_positives / float(len(ref_set)) if ref_set else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def calculate_expected_calibration_error(
    confidences: list[float],
    correctness: list[bool],
    num_bins: int = 10,
) -> float:
    """Computes Expected Calibration Error (ECE).

    Divides confidences into M equally spaced bins, computes accuracy
    and average confidence within each bin, and takes weighted absolute difference.
    """
    if not confidences or len(confidences) != len(correctness):
        return 0.0

    n = len(confidences)
    bin_boundaries = [i / num_bins for i in range(num_bins + 1)]
    ece = 0.0

    for i in range(num_bins):
        low = bin_boundaries[i]
        high = bin_boundaries[i + 1]

        # Items in this bin
        bin_indices = [
            idx for idx, conf in enumerate(confidences)
            if (low <= conf < high) or (i == num_bins - 1 and conf == high)
        ]

        if not bin_indices:
            continue

        bin_size = len(bin_indices)
        bin_acc = sum(1 for idx in bin_indices if correctness[idx]) / float(bin_size)
        bin_conf = sum(confidences[idx] for idx in bin_indices) / float(bin_size)

        ece += (bin_size / float(n)) * abs(bin_acc - bin_conf)

    return round(ece, 4)
