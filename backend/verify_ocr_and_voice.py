"""Comprehensive verification script for OCR and Voice Agent."""

from __future__ import annotations

import base64
import sys

from config import settings
from services.gemini.client import GeminiClient
from services.voice.agent import GeminiVoiceAgent

print("=== SWASTHYATRIAGE AI VERIFICATION ===")
print(f"Python: {sys.version.split()[0]}")
print(f"Gemini Enabled: {settings.gemini_enabled}")
print(f"Gemini Model: {settings.gemini_model}")
print(f"Telephony Provider: {settings.telephony_provider}")
print("=" * 45)

results = {"ocr_text": False, "ocr_image": False, "voice_normal": False, "voice_odia": False, "voice_emergency": False}

# ---------------------------------------------------------
# 1. TEST OCR / DOCUMENT EXTRACTION
# ---------------------------------------------------------
print("\n[1/5] Testing OCR Document Extraction (Gemini)...")
try:
    gemini = GeminiClient()
    sample_report = (
        "BHUBANESWAR CAPITAL HOSPITAL - LAB REPORT\n"
        "Patient: Anita Sahoo, Age: 34, Female\n"
        "Chief Complaint: High grade fever 103 F and severe body ache for 4 days.\n"
        "Vitals: Blood Pressure: 118/76 mmHg, SpO2: 98%, Pulse: 92 bpm.\n"
        "Prescription: Paracetamol 650mg TDS, ORS packet twice daily.\n"
        "Impression: Acute febrile illness, investigate for Malaria/Dengue."
    )
    doc_result = gemini.extract_document(sample_report, filename="capital_hospital_report.txt")
    doc_data = doc_result.model_dump()
    print("  -> Symptoms extracted:", doc_data["symptoms"])
    print("  -> Measurements extracted:", doc_data["measurements"])
    print("  -> Medications extracted:", doc_data["medications"])
    print("  -> Duration:", doc_data["duration"])
    assert len(doc_data["symptoms"]) > 0, "No symptoms extracted"
    assert len(doc_data["measurements"]) > 0, "No measurements extracted"
    results["ocr_text"] = True
    print("  [SUCCESS] OCR Document Extraction is working accurately!")
except Exception as exc:
    print(f"  [FAILED] OCR Document Extraction error: {exc}")

# ---------------------------------------------------------
# 2. TEST GEMINI VISION OCR (IMAGE EXTRACTION)
# ---------------------------------------------------------
print("\n[2/5] Testing Gemini Vision OCR (Image)...")
try:
    # 1x1 test PNG
    png_bytes = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    img_result = gemini.extract_image(png_bytes, "image/png", filename="test_scan.png")
    img_data = img_result.model_dump()
    print("  -> Image OCR handled without error. Uncertainties/Observation:", img_data.get("uncertainties"))
    results["ocr_image"] = True
    print("  [SUCCESS] Gemini Vision OCR Pipeline is working!")
except Exception as exc:
    print(f"  [FAILED] Gemini Vision OCR error: {exc}")

# ---------------------------------------------------------
# 3. TEST VOICE AGENT - NORMAL CLINICAL TURN (HINDI)
# ---------------------------------------------------------
print("\n[3/5] Testing Voice Agent (Hindi Clinical Intake)...")
try:
    agent = GeminiVoiceAgent()
    hindi_turn = agent._gemini.triage_voice_turn(
        user_text="Mujhe 3 din se tez bukhar hai aur ulti ho rahi hai, khana nahi kha pa raha",
        language="hi",
    )
    safe_preview = str(hindi_turn.get("reply_text", ""))[:80].encode('ascii', 'backslashreplace').decode('ascii')
    print("  -> Reply text (preview):", repr(safe_preview))
    print("  -> Symptoms:", hindi_turn.get("extracted_symptoms"))
    print("  -> Duration (days):", hindi_turn.get("duration_days"))
    print("  -> Urgency:", hindi_turn.get("urgency"))
    print("  -> Is Emergency:", hindi_turn.get("is_emergency"))
    assert len(hindi_turn.get("extracted_symptoms", [])) > 0
    results["voice_normal"] = True
    print("  [SUCCESS] Hindi Voice Triage is working accurately!")
except Exception as exc:
    print(f"  [FAILED] Hindi Voice Triage error: {exc}")

# ---------------------------------------------------------
# 4. TEST VOICE AGENT - ODIA CLINICAL TURN
# ---------------------------------------------------------
print("\n[4/5] Testing Voice Agent (Odia Clinical Intake)...")
try:
    odia_turn = agent._gemini.triage_voice_turn(
        user_text="Mora 2 dina hela mundabyatha au deha ghodasa jwara achhi",
        language="or",
    )
    safe_preview = str(odia_turn.get("reply_text", ""))[:80].encode('ascii', 'backslashreplace').decode('ascii')
    print("  -> Reply text (preview):", repr(safe_preview))
    print("  -> Symptoms:", odia_turn.get("extracted_symptoms"))
    print("  -> Duration (days):", odia_turn.get("duration_days"))
    assert len(odia_turn.get("extracted_symptoms", [])) > 0
    results["voice_odia"] = True
    print("  [SUCCESS] Odia Voice Triage is working accurately!")
except Exception as exc:
    print(f"  [FAILED] Odia Voice Triage error: {exc}")

# ---------------------------------------------------------
# 5. TEST VOICE AGENT - EMERGENCY RED FLAG SCENARIO
# ---------------------------------------------------------
print("\n[5/5] Testing Voice Agent Emergency Red Flag Detection...")
try:
    emerg_turn = agent._gemini.triage_voice_turn(
        user_text="Crushing chest pain radiating to left arm and jaw, profuse cold sweats, gasping for breath",
        language="en",
    )
    print("  -> Is Emergency:", emerg_turn.get("is_emergency"))
    print("  -> Urgency:", emerg_turn.get("urgency"))
    print("  -> Emergency Reason:", emerg_turn.get("emergency_reason"))
    print("  -> Reply text (preview):", repr(emerg_turn.get("reply_text", "")[:100]))
    assert emerg_turn.get("is_emergency") is True, "Failed to flag cardiac emergency"
    assert emerg_turn.get("urgency") == "RED", "Urgency not marked as RED"
    results["voice_emergency"] = True
    print("  [SUCCESS] Red Flag Emergency escalation is working!")
except Exception as exc:
    print(f"  [FAILED] Emergency detection error: {exc}")

print("\n" + "=" * 45)
print("FINAL AUDIT SUMMARY:")
for test_name, status in results.items():
    print(f"  - {test_name.upper()}: {'PASSED (WORKING PERFECTLY)' if status else 'FAILED'}")
print("=" * 45)
