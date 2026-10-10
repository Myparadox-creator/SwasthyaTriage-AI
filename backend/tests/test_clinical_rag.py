"""Unit tests for Evidence-Grounded Clinical SOP RAG engine."""

from services.rag.guidelines import generate_sop_triage_guidance
from services.rag.retriever import retrieve_relevant_sops


def test_sop_retrieval_fever_and_malaria():
    results = retrieve_relevant_sops(
        query_text="Patient has high grade fever with chills and vomiting for 3 days in Koraput",
        symptoms=["Fever", "Chills"],
        chief_concern="High grade fever",
        top_k=2,
    )
    assert len(results) > 0
    top = results[0]
    assert top.doc_id == "NHM-ODISHA-AFI-2024"
    assert "fever" in top.triage_pathway.lower()
    assert any("Malaria" in act or "blood smear" in act for act in top.recommended_doctor_actions)
    assert "[NHM-ODISHA-AFI-2024" in f"[{top.doc_id}, {top.section_id}]"


def test_sop_retrieval_chest_pain_emergency():
    results = retrieve_relevant_sops(
        query_text="Severe crushing chest pain with cold sweats radiating to left arm",
        symptoms=["Chest pain", "Sweating"],
        chief_concern="Crushing chest pain",
        top_k=2,
    )
    assert len(results) > 0
    top = results[0]
    assert top.doc_id == "ODISHA-ACS-EMERGENCY-2024"
    assert any("ECG" in act for act in top.recommended_doctor_actions)
    assert "10 minutes" in top.triage_pathway


def test_guideline_synthesis_formatting():
    guidance = generate_sop_triage_guidance(
        case_number="ST-9999",
        chief_concern="Severe breathlessness and wheezing",
        symptoms=["Breathlessness", "Wheezing"],
        patient_text="I am unable to breathe while lying down and hear whistling sounds.",
    )
    assert guidance["has_guidance"] is True
    assert len(guidance["protocols"]) > 0
    proto = guidance["protocols"][0]
    assert "NHM-RESPIRATORY-SOP-2023" in proto["doc_id"]
    assert "source_citation" in proto
    assert proto["source_citation"].startswith("[NHM-RESPIRATORY-SOP-2023")
    assert "Oxygen" in str(proto["recommended_actions"]) or "SpO2" in str(proto["triage_pathway"])
