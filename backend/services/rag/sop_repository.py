"""Clinical SOP repository for SwasthyaFlow AI.

GOVERNANCE STATUS: The protocol texts in this repository are **internal draft
content**. They have NOT been verified against an official published source,
carry no issuing-authority signature, and must NOT be cited as official NHM /
State guidance. Every entry is therefore marked ``review_status="UNVERIFIED"``
and ``verified=False`` until a named clinical authority records the issuing
authority, a resolvable source URL, publication date, version, and document
hash through the SOP governance workflow.

The retrieval engine surfaces this status to clinicians so no unverified text
can present itself as approved policy. Retrieved SOP content is advisory only
and can never override the deterministic safety engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SOPSection:
    doc_id: str
    doc_title: str
    section_id: str
    section_title: str
    applicable_syndromes: list[str]
    keywords: list[str]
    triage_pathway: str
    red_flag_criteria: list[str]
    recommended_doctor_actions: list[str]
    source_attribution: str
    # --- Governance metadata (defaults = UNVERIFIED internal draft) ---
    issuing_authority: str | None = None
    source_url: str | None = None
    publication_date: str | None = None
    effective_date: str | None = None
    review_date: str | None = None
    version: str = "0.0-draft"
    review_status: str = "UNVERIFIED"
    document_hash: str | None = None
    verified: bool = False


SOP_GOVERNANCE_NOTE = (
    "Internal draft protocol. Not verified against an official published source. "
    "Do not cite as official guidance until a named clinical authority signs off "
    "on issuing authority, source URL, version, and document hash."
)


SOP_COLLECTION: list[SOPSection] = [
    SOPSection(
        doc_id="NHM-ODISHA-AFI-2024",
        doc_title="Odisha NHM Standard Operating Procedure for Acute Febrile Illness",
        section_id="Sec-3.1",
        section_title="Initial Triage & Warning Signs in Acute Febrile Illness",
        applicable_syndromes=["fever", "malaria", "dengue", "pyrexia", "chills"],
        keywords=["fever", "pyrexia", "jaro", "bukhar", "chills", "rigors", "headache", "dengue", "malaria"],
        triage_pathway=(
            "In patients presenting with acute fever (>100.4°F) in endemic Odisha districts: "
            "perform rapid blood smear / RDT for Malaria and NS1 antigen if fever >48h. "
            "Examine for petechiae, gum bleeding, and abdominal tenderness."
        ),
        red_flag_criteria=[
            "Temperature >= 104°F unresponsive to initial antipyresis",
            "Petechiae, purpura, or spontaneous mucosal hemorrhage",
            "Altered sensorium, seizures, or neck stiffness",
            "Persistent vomiting with signs of clinical dehydration",
        ],
        recommended_doctor_actions=[
            "Order urgent peripheral blood smear for MP and Rapid Diagnostic Test (RDT)",
            "Screen platelet count and hematocrit if Dengue suspected",
            "Initiate oral rehydration therapy (ORS) and monitor urine output hourly",
            "If hemorrhagic signs or shock present: immediate referral to District Hospital with IV access",
        ],
        source_attribution="Odisha NHM Acute Febrile Illness Protocol (2024), Sec 3.1",
    ),
    SOPSection(
        doc_id="ODISHA-ACS-EMERGENCY-2024",
        doc_title="Odisha Health Directorate Acute Coronary Syndrome & Chest Pain SOP",
        section_id="Sec-2.2",
        section_title="Emergency Triage of Acute Chest Pain in Peripheral Health Units",
        applicable_syndromes=["chest pain", "angina", "myocardial infarction", "cardiac"],
        keywords=["chest pain", "chhati betha", "seene mein dard", "angina", "sweating", "left arm", "diaphoresis"],
        triage_pathway=(
            "Every patient presenting with acute chest discomfort or epigastric pain with sweating "
            "must receive a 12-lead ECG within 10 minutes of arrival. "
            "Continuous SpO2 and blood pressure monitoring mandatory."
        ),
        red_flag_criteria=[
            "Crushing retrosternal pain radiating to left arm, neck, or jaw",
            "Accompanying diaphoresis, pallor, or acute breathlessness",
            "Systolic blood pressure < 90 mmHg or pulse > 120 bpm",
            "ECG displaying ST-segment elevation or new LBBB",
        ],
        recommended_doctor_actions=[
            "Acquire 12-lead ECG immediately (within 10 minutes)",
            "Maintain SpO2 > 94% with supplemental oxygen if hypoxemic",
            "Consult Medical Officer for loading dose protocol evaluation if indicated",
            "Activate 108 emergency referral to nearest PCI-capable District Headquarter Hospital",
        ],
        source_attribution="Odisha Emergency Cardiac Care Guidelines (2024), Sec 2.2",
    ),
    SOPSection(
        doc_id="NHM-RESPIRATORY-SOP-2023",
        doc_title="National Health Mission Clinical Triage for Acute Respiratory Distress",
        section_id="Sec-4.3",
        section_title="Acute Dyspnea, Asthma & COPD Exacerbation Triage",
        applicable_syndromes=["breathlessness", "dyspnea", "asthma", "copd", "respiratory"],
        keywords=["breathless", "short of breath", "sans fula", "swasa kasta", "spo2", "wheeze", "stridor"],
        triage_pathway=(
            "Measure respiratory rate and pulse oximetry immediately. "
            "Identify signs of severe respiratory fatigue: use of accessory muscles, "
            "inability to complete full sentences, or SpO2 < 92% on room air."
        ),
        red_flag_criteria=[
            "SpO2 < 90% on room air (or < 88% in chronic COPD)",
            "Respiratory rate > 30 breaths/min or paradoxical thoracoabdominal breathing",
            "Central cyanosis (blue lips or tongue)",
            "Stridor or upper airway swelling",
        ],
        recommended_doctor_actions=[
            "Administer humidified oxygen targeting SpO2 94-98% (88-92% if known COPD)",
            "Prepare nebulization with Salbutamol/Ipratropium under physician supervision",
            "Auscultate for bilateral crepitations or silent chest",
            "Prepare emergency institutional handoff if refractory to initial bronchodilation",
        ],
        source_attribution="NHM Emergency Respiratory Management SOP (2023), Sec 4.3",
    ),
    SOPSection(
        doc_id="ODISHA-MATERNAL-EMERGENCY-2024",
        doc_title="Odisha Health Directorate Maternal & Obstetric Triage Protocol",
        section_id="Sec-1.4",
        section_title="Maternal Warning Signs & Severe Pre-Eclampsia Triage",
        applicable_syndromes=["pregnancy", "maternal", "pre-eclampsia", "obstetric"],
        keywords=["pregnant", "pregnancy", "garbhabati", "labor", "bp", "bleeding", "swelling", "headache"],
        triage_pathway=(
            "In any pregnant patient (>20 weeks gestation) presenting with headache, visual blurring, "
            "or severe epigastric pain: measure BP twice 15 minutes apart and perform dipstick for proteinuria."
        ),
        red_flag_criteria=[
            "Blood pressure >= 160/110 mmHg with hyperreflexia or severe headache",
            "Active vaginal bleeding (Antepartum Hemorrhage)",
            "Generalized tonic-clonic convulsions (Eclampsia)",
            "Loss of fetal movements or severe persistent abdominal rigidity",
        ],
        recommended_doctor_actions=[
            "Immediately measure bilateral blood pressure and assess patellar reflexes",
            "Administer Magnesium Sulfate loading dose per state protocol if eclampsia/impending eclampsia",
            "Establish wide-bore IV access (16G or 18G cannula)",
            "Immediate coordinated referral via 108/102 Janani Express to District Hospital",
        ],
        source_attribution="Odisha Maternal Emergency Care Protocol (2024), Sec 1.4",
    ),
    SOPSection(
        doc_id="ODISHA-SNAKEBITE-PROTOCOL-2023",
        doc_title="Odisha State Health Protocol for Snakebite Envenomation",
        section_id="Sec-5.1",
        section_title="Snakebite Rapid Triage & 20-Minute Whole Blood Clotting Test (20WBCT)",
        applicable_syndromes=["snakebite", "envenomation", "bite"],
        keywords=["snake", "snakebite", "sarpa", "saanp", "fang mark", "swelling", "ptosis"],
        triage_pathway=(
            "Do NOT apply arterial tourniquets or incisions. Immobilize the bitten limb. "
            "Perform bedside 20-minute Whole Blood Clotting Test (20WBCT) in a clean dry glass tube. "
            "Examine for neurotoxicity: bilateral ptosis, diplopia, difficulty swallowing."
        ),
        red_flag_criteria=[
            "Non-clotting blood at 20 minutes (20WBCT positive - hemotoxicity)",
            "Bilateral ptosis, facial muscle weakness, or respiratory depression (neurotoxicity)",
            "Rapidly progressing limb swelling extending beyond a major joint within 2 hours",
            "Spontaneous mucosal bleeding or hematuria",
        ],
        recommended_doctor_actions=[
            "Keep limb immobilized; remove tight bands or rings immediately",
            "Perform baseline 20WBCT; repeat every 30 minutes for 3 hours if initially normal",
            "Keep Polyvalent Anti-Snake Venom (ASV) ready per institutional stocking protocol",
            "If respiratory muscle weakness appears, support ventilation and prepare emergency transfer",
        ],
        source_attribution="Odisha Snakebite Management Protocol (2023), Sec 5.1",
    ),
]


def list_sop_sources() -> list[dict[str, Any]]:
    """Return the governance registry for every SOP document."""
    return [
        {
            "doc_id": s.doc_id,
            "doc_title": s.doc_title,
            "section_id": s.section_id,
            "section_title": s.section_title,
            "issuing_authority": s.issuing_authority,
            "source_url": s.source_url,
            "publication_date": s.publication_date,
            "effective_date": s.effective_date,
            "review_date": s.review_date,
            "version": s.version,
            "review_status": s.review_status,
            "document_hash": s.document_hash,
            "verified": s.verified,
            "governance_note": SOP_GOVERNANCE_NOTE if not s.verified else None,
        }
        for s in SOP_COLLECTION
    ]


def governance_summary() -> dict[str, Any]:
    total = len(SOP_COLLECTION)
    verified = sum(1 for s in SOP_COLLECTION if s.verified)
    return {
        "total_documents": total,
        "verified_documents": verified,
        "unverified_documents": total - verified,
        "all_verified": verified == total and total > 0,
        "governance_note": SOP_GOVERNANCE_NOTE,
    }

