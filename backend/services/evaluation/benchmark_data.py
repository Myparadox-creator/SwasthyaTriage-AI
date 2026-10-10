"""Permitted multi-lingual clinical benchmark evaluation dataset for SwasthyaFlow AI.

Covers Odia (od), Hindi (hi), and Indian English (en) speech transcripts,
clinical entity extractions, and document OCR test specimens.
Synthetic clinical narratives strictly adhering to public health scenarios.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class MultilingualBenchmarkCase:
    case_id: str
    language: str
    scenario_title: str
    reference_transcript: str
    synthetic_asr_hypothesis: str
    reference_symptoms: list[str]
    reference_measurements: list[dict[str, str]]
    reference_medications: list[str]
    is_emergency: bool
    gold_urgency: str


BENCHMARK_CASES: list[MultilingualBenchmarkCase] = [
    # 1. Odia Acute Febrile Illness Case
    MultilingualBenchmarkCase(
        case_id="EVAL-OD-001",
        language="od",
        scenario_title="Odia High Grade Fever & Myalgia (PHC Koraput)",
        reference_transcript="ମୋର ୪ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର ଏବଂ ଦେହ ହାତ ଘୋଳାବିନ୍ଧା ହେଉଛି। ତାପମାତ୍ରା ୧୦୩ ଡିଗ୍ରୀ ଅଛି।",
        synthetic_asr_hypothesis="ମୋର ୪ ଦିନ ହେଲା ପ୍ରବଳ ଜ୍ୱର ଏବଂ ଦେହ ହାତ ଘୋଳାବିନ୍ଧା ହେଉଛି। ତାପମାତ୍ରା ୧୦୩ ଡିଗ୍ରୀ ଅଛି।",
        reference_symptoms=["ଜ୍ୱର", "ଦେହ ହାତ ଘୋଳାବିନ୍ଧା", "fever", "body ache"],
        reference_measurements=[{"name": "Temperature", "value": "103", "unit": "F"}],
        reference_medications=["Paracetamol"],
        is_emergency=False,
        gold_urgency="YELLOW",
    ),
    # 2. Hindi Acute Chest Pain / Cardiac Emergency Case
    MultilingualBenchmarkCase(
        case_id="EVAL-HI-002",
        language="hi",
        scenario_title="Hindi Acute Retrosternal Chest Pain with Diaphoresis (CHC Khordha)",
        reference_transcript="मुझे पिछले दो घंटे से सीने में बहुत तेज दर्द हो रहा है और ठंडा पसीना आ रहा है। सांस लेने में भी तकलीफ है।",
        synthetic_asr_hypothesis="मुझे पिछले दो घंटे से सीने में बहुत तेज दर्द हो रहा है और ठंडा पसीना आ रहा है। सांस लेने में भी तकलीफ है।",
        reference_symptoms=["सीने में दर्द", "ठंडा पसीना", "सांस लेने में तकलीफ", "chest pain", "sweating", "dyspnea"],
        reference_measurements=[{"name": "Duration", "value": "2", "unit": "hours"}],
        reference_medications=[],
        is_emergency=True,
        gold_urgency="RED",
    ),
    # 3. Indian English Acute Dehydration / Gastroenteritis
    MultilingualBenchmarkCase(
        case_id="EVAL-EN-003",
        language="en",
        scenario_title="English Acute Gastroenteritis with Hypotension (Capital Hospital BBSR)",
        reference_transcript="Patient experiencing continuous watery diarrhea and persistent vomiting for twenty-four hours, feeling severe dizziness, blood pressure ninety over sixty mmHg, pulse one hundred ten bpm.",
        synthetic_asr_hypothesis="Patient experiencing continuous watery diarrhea and persistent vomiting for 24 hours, feeling severe dizziness, blood pressure 90/60 mmHg, pulse 110 bpm.",
        reference_symptoms=["watery diarrhea", "persistent vomiting", "severe dizziness", "dehydration"],
        reference_measurements=[
            {"name": "Blood Pressure", "value": "90/60", "unit": "mmHg"},
            {"name": "Pulse", "value": "110", "unit": "bpm"},
        ],
        reference_medications=["ORS", "Zinc"],
        is_emergency=True,
        gold_urgency="RED",
    ),
    # 4. Odia Respiratory Distress / Bronchospasm Case
    MultilingualBenchmarkCase(
        case_id="EVAL-OD-004",
        language="od",
        scenario_title="Odia Acute Dyspnea with Wheezing (CHC Aska)",
        reference_transcript="ମୋତେ କାଲି ରାତିରୁ ଶ୍ୱାସକଷ୍ଟ ହେଉଛି ଏବଂ ଛାତିରୁ ଶୁ-ଶୁ ଶବ୍ଦ ଆସୁଛି। ଅକ୍ସିଜେନ ୯୧ ପ୍ରତିଶତ ଅଛି।",
        synthetic_asr_hypothesis="ମୋତେ କାଲି ରାତିରୁ ଶ୍ୱାସକଷ୍ଟ ହେଉଛି ଏବଂ ଛାତିରୁ ଶୁ-ଶୁ ଶବ୍ଦ ଆସୁଛି। ଅକ୍ସିଜେନ ୯୧ ପ୍ରତିଶତ ଅଛି।",
        reference_symptoms=["ଶ୍ୱାସକଷ୍ଟ", "wheezing", "breathlessness"],
        reference_measurements=[{"name": "SpO2", "value": "91", "unit": "%"}],
        reference_medications=["Salbutamol"],
        is_emergency=True,
        gold_urgency="RED",
    ),
]
