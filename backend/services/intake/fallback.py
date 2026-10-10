"""Deterministic multilingual intake engine (fallback / no-Gemini mode).

Purpose: demonstrate the full patient experience without needing API keys,
and provide a deterministic baseline that can be fuzz-tested. Phase 6 swaps
in Gemini extraction behind the same interface; this module stays as a
fully-offline fallback and for tests.

This module never interprets in a clinical sense: canonical symptom labels
are surfaced to professionals as "patient-reported + keyword-matched", and
the fallback reply text is controlled (no symptom-to-condition reasoning).
"""

from __future__ import annotations

import re

# canonical term -> aliases across en/hi/od (matched case-insensitively, substring)
VOCAB: dict[str, list[str]] = {
    "fever": ["fever", "bukhar", "bukhar hai", "jvar", "ताप", "ज्वर", "ଜ୍ୱର", "ତାପ"],
    "cough": ["cough", "khansi", "khasi", "kasad", "कास", "खांसी", "କାଶ"],
    "cold": ["cold", "jukaam", "sardi", "zukaam", "nasal congestion", "बदन दर्द", "ନାକ ବନ୍ଦ"],
    "headache": [
        "headache",
        "sardardi",
        "sir dard",
        "seer dard",
        "माथेदर्द",
        "सिरदर्द",
        "ମୁଣ୍ଡ ଯନ୍ତ୍ରଣା",
        "ମୁଣ୍ଡ ବଥ",
    ],
    "body ache": ["body pain", "body ache", "sarir dard", "jor jor dard", "शरीर दर्द", "ଶରୀର ଯନ୍ତ୍ରଣା"],
    "fatigue": ["fatigue", "weakness", "kamjori", "thakaan", "thakavat", "कमजोरी", "ଦୁର୍ବଳତା", "ଥକାପଣ"],
    "nausea": ["nausea", "vomiting", "ulti aana", "ulti", "banti", "उल्टी", "ବାନ୍ତି", "ଉଲଟୀ"],
    "breathing difficulty": [
        "breathing difficulty",
        "shortness of breath",
        "breathless",
        "saans lene me dikkat",
        "saans phoolna",
        "swasa kashta",
        "sweas asuchi",
        "dyspnea",
        "सांस लेने में तकलीफ",
        "ଶ୍ୱାସ ଅସୁବିଧା",
        "ଶ୍ୱାସ ଜଟିଳ",
    ],
    "chest pain": [
        "chest pain",
        "chest tightness",
        "seene me dard",
        "chhati me dard",
        "boka betha",
        "छाती में दर्द",
        "ଛାତି ଯନ୍ତ୍ରଣା",
        "ବକା ବଥ",
    ],
    "dizziness": ["dizziness", "chakkar", "giddiness", "chakkar aana", "चक्कर", "ମୁଣ୍ଡ ଘୂରିବା"],
    "diarrhea": ["diarrhea", "loose motion", "dast", "paatla", "दस्त", "ଝାଡ଼ା"],
    "abdominal pain": [
        "abdominal pain",
        "stomach pain",
        "pet dard",
        "pet me dard",
        "पेट दर्द",
        "ପେଟ ଯନ୍ତ୍ରଣା",
        "ପେଟ ବଥ",
    ],
    "bleeding": ["bleeding", "blood loss", "khun", "raktsrav", "रक्तस्राव", "ରକ୍ତସ୍ରାବ"],
    "rash": ["rash", "skin rash", "daane", "chickenpox", "दाने", "ଦାଗ"],
    "joint pain": ["joint pain", "jodo me dard", "jodo ka dard", "जोड़ों में दर्द", "ଗଣ୍ଠି ଯନ୍ତ୍ରଣା"],
    "sore throat": [
        "sore throat",
        "throat pain",
        "gale me kharaash",
        "gala kharaab",
        "गले में खराश",
        "ଗଳା ଯନ୍ତ୍ରଣା",
    ],
    "runny nose": ["runny nose", "nak behna", "बहती नाक", "ନାକରୁ ପାଣି"],
    "loss of appetite": ["loss of appetite", "no appetite", "bhook nahi", "भूख नहीं", "ଭୋକ ନାହିଁ"],
    "back pain": ["back pain", "kamar dard", "peeth dard", "पीठ दर्द", "ପିଠି ଯନ୍ତ୍ରଣା"],
}

_TEMP_RE = re.compile(
    r"(?:temp\w*|temperature|bukhar|taap|tap|jvar|ତାପ|ज्वर)?[:\s]*(\d{2,3}(?:\.\d)?)\s*"
    r"(°\s*[fFcC]|degree\s*[fF]?|°?\s*[fFcC]|fahrenheit|celsius)?",
    re.IGNORECASE,
)
_DURATION_RE = re.compile(r"(\d+)\s*(?:din|days?|day|saptaha|days se|ଦିନ|दिन)\b", re.IGNORECASE)
_DURATION_WORDS_RE = re.compile(
    r"(two|three|four|five|six|seven|eight|ten)\s+(?:din|days?|ଦିନ)\b", re.IGNORECASE
)

_SEVERITY = {
    "mild": ["mild", "halka", "halki", "हल्का", "ହାଲୁକା", "ହାଲୁକା"],
    "moderate": ["moderate", "madhyam", "मध्यम", "ମଝି"],
    "severe": ["severe", "very bad", "teevra", "bahut zyada", "तीव्र", "ତୀବ୍ର"],
}

_DURATION_LITERAL = {
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "ten": 10,
    "dui": 2,
    "dwi": 2,
    "tini": 3,
    "char": 4,
    "chaari": 4,
    "panch": 5,
    "chha": 6,
    "सात": 7,
    "ଦୁଇ": 2,
    "ତିନି": 3,
    "ଚାରି": 4,
    "ପାଞ୍ଚ": 5,
}


class Extraction:
    def __init__(
        self,
        *,
        symptoms: list[str],
        temperature_c: float | None = None,
        temperature_f: float | None = None,
        duration_days: int | None = None,
        severity: str | None = None,
    ):
        self.symptoms = symptoms
        self.temperature_c = temperature_c
        self.temperature_f = temperature_f
        self.duration_days = duration_days
        self.severity = severity

    @property
    def temperature(self) -> tuple[str, str] | None:
        if self.temperature_f is not None:
            return (f"{self.temperature_f:.1f}", "°F")
        if self.temperature_c is not None:
            return (f"{self.temperature_c:.1f}", "°C")
        return None

    @property
    def is_empty(self) -> bool:
        return not (self.symptoms or self.duration_days or self.temperature or self.severity)


def _match_symptoms(message: str) -> list[str]:
    text = re.sub(r"[।|,;.!?,]+", " ", message.lower())
    found: list[str] = []
    for canonical, aliases in VOCAB.items():
        for alias in aliases:
            if alias and alias.lower() in text:
                found.append(canonical)
                break
    # Flexible multi-word patterns for conversational Hindi/Odia/English
    if re.search(r"\b(?:seene|chhati)\s+(?:me|mein|re)\b.*?\bdard\b", text) or re.search(r"\bchest\s+(?:pain|tightness|pressure|discomfort)\b", text):
        found.append("chest pain")
    if re.search(r"\bsaans\s+lene\s+(?:me|mein)\b.*?\b(?:takleef|dikkat|pareshani|kashta)\b", text) or re.search(r"\b(?:breathless|shortness\s+of\s+breath|difficulty\s+breathing)\b", text):
        found.append("breathing difficulty")
    if re.search(r"\b(?:baayein|left)\s+(?:haath|arm|shoulder)\b", text) and "chest pain" in found:
        found.append("chest pain")
    # stable, deduped
    return list(dict.fromkeys(found))


def _match_temperature(message: str) -> tuple[float | None, float | None]:
    text = message.lower()
    for match in _TEMP_RE.finditer(text):
        raw = match.group(1)
        unit = (match.group(2) or "").strip()
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        unit_norm = unit.replace("°", "").lower()
        if unit_norm.startswith("c") or "celsius" in unit_norm or unit_norm == "degree":
            if 34.0 <= value <= 43.0:
                return value, None
            continue
        if unit_norm.startswith("f") or "fahrenheit" in unit_norm:
            if 90.0 <= value <= 110.0:
                return None, value
            continue
        # no unit on the first capture: assume Fahrenheit if 97+, else Celsius
        if value >= 97:
            if value <= 110.0:
                return None, value
        elif 34.0 <= value <= 43.0:
            return value, None
    return None, None


def _match_duration(message: str) -> int | None:
    text = message.lower()
    m = _DURATION_RE.search(text)
    if m:
        return int(m.group(1))
    m = _DURATION_WORDS_RE.search(text)
    if m:
        return _DURATION_LITERAL.get(m.group(1))
    for word, days in _DURATION_LITERAL.items():
        if re.search(rf"(?:last|pichhle|previous|binia|from|purna)\s+{word}\b", text):
            return days
    if re.search(r"a (few|couple of) days", text):
        return 2
    return None


def _match_severity(message: str) -> str | None:
    text = message.lower()
    for label, aliases in _SEVERITY.items():
        for alias in aliases:
            if alias.lower() in text:
                return label
    return None


def extract_from_message(message: str) -> Extraction:
    symptoms = _match_symptoms(message)
    temp_c, temp_f = _match_temperature(message)
    return Extraction(
        symptoms=symptoms,
        temperature_c=temp_c,
        temperature_f=temp_f,
        duration_days=_match_duration(message),
        severity=_match_severity(message),
    )
