"""Idempotent seed for SwasthyaTriage AI.

ALL DATA HERE IS SYNTHETIC. No real patient information is used.

Run from backend/:  .venv/Scripts/python.exe seed.py
"""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from auth.password import hash_password
from database.session import SessionLocal
from models import (
    AuditLog,
    Case,
    CaseMeasurement,
    CaseSymptom,
    CaseTimeline,
    Consent,
    Facility,
    FollowUp,
    Patient,
    QuestionBankItem,
    Referral,
    ReviewNote,
    SafetyRule,
    SafetySignal,
    User,
    VoiceMessage,
    VoiceSession,
)
from models.enums import (
    CaseSource,
    CaseStatus,
    ConsentStatus,
    FollowUpChannel,
    FollowUpStatus,
    Language,
    MessageRole,
    Priority,
    Provenance,
    ReferralStatus,
    Role,
    SessionStatus,
    VoiceSessionMode,
)

rng = random.Random(42)

DEMO_PASSWORD = "Swasthya@123"

FACILITIES = [
    {
        "code": "PHC-OD-BBSR-01",
        "name": "Bhubaneswar Town PHC",
        "facility_type": "PHC",
        "state": "Odisha",
        "district": "Khordha",
        "address": "Unit-IV, Bhubaneswar, Odisha 751004",
        "phone": "+91-674-2000001",
    },
    {
        "code": "CHC-OD-CUT-02",
        "name": "Cuttack District Community Health Centre",
        "facility_type": "CHC",
        "state": "Odisha",
        "district": "Cuttack",
        "address": "Sector A, Cuttack, Odisha 753001",
        "phone": "+91-671-2000002",
    },
    {
        "code": "HOSP-OD-RKL-03",
        "name": "Rourkela Government Hospital",
        "facility_type": "GOVERNMENT_HOSPITAL",
        "state": "Odisha",
        "district": "Sundargarh",
        "address": "Civil Township, Rourkela, Odisha 769004",
        "phone": "+91-661-2000003",
    },
    {
        "code": "CAMP-OD-PPL-04",
        "name": "Paradeep Industrial Estate Health Unit",
        "facility_type": "COMPANY_CLINIC",
        "state": "Odisha",
        "district": "Jagatsinghpur",
        "address": "Industrial Estate, Paradeep, Odisha 754142",
        "phone": "+91-672-2000004",
    },
]

USERS = [
    (
        "super@swasthyatriage.demo",
        "Aparna Mishra",
        Role.SUPER_ADMIN,
        None,
        "Platform Administrator",
    ),
    (
        "admin.bbsr@swasthyatriage.demo",
        "Sasmita Rath",
        Role.FACILITY_ADMIN,
        "PHC-OD-BBSR-01",
        "Facility Administrator",
    ),
    (
        "nurse.bbsr@swasthyatriage.demo",
        "Kabita Pradhan",
        Role.HEALTHCARE_WORKER,
        "PHC-OD-BBSR-01",
        "Staff Nurse",
    ),
    (
        "doctor.bbsr@swasthyatriage.demo",
        "Dr. Rajesh Kumar",
        Role.HEALTHCARE_WORKER,
        "PHC-OD-BBSR-01",
        "Medical Officer",
    ),
    (
        "doctor.rkl@swasthyatriage.demo",
        "Dr. Sunita Sahu",
        Role.HEALTHCARE_WORKER,
        "HOSP-OD-RKL-03",
        "Medical Officer",
    ),
    ("patient.ramesh@swasthyatriage.demo", "Ramesh Behera", Role.PATIENT, "PHC-OD-BBSR-01", None),
    ("patient.anita@swasthyatriage.demo", "Anita Nayak", Role.PATIENT, "PHC-OD-BBSR-01", None),
    ("patient.suresh@swasthyatriage.demo", "Suresh Jena", Role.PATIENT, "CHC-OD-CUT-02", None),
]

SAFETY_RULES = [
    {
        "code": "BREATHING_DIFFICULTY",
        "name": "Breathing difficulty reported",
        "description": "Patient reports breathing difficulty, shortness of breath or breathlessness.",
        "match_patterns": [
            "breathing difficulty",
            "shortness of breath",
            "breathless",
            "saans lene me dikkat",
            "saans phoolna",
            "dyspnea",
            "sweas asuchi",
            "sweas jatra asuchi",
        ],
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: breathing difficulty reported.",
    },
    {
        "code": "CHEST_PAIN",
        "name": "Chest pain reported",
        "description": "Patient reports chest pain or chest tightness.",
        "match_patterns": [
            "chest pain",
            "chest tightness",
            "seene me dard",
            "छाती में दर्द",
            "boka betha",
        ],
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: chest pain reported.",
    },
    {
        "code": "CONFUSION_UNCONSCIOUS",
        "name": "Confusion or reduced consciousness",
        "description": "Patient or family reports confusion, fainting or unresponsiveness.",
        "match_patterns": [
            "unconscious",
            "fainted",
            "confusion",
            "not responding",
            "bahosh",
            "behosh",
        ],
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: altered consciousness reported.",
    },
    {
        "code": "HIGH_FEVER",
        "name": "High measured temperature",
        "description": "Patient-reported temperature at or above 103°F (39.4°C).",
        "match_patterns": [],
        "field_condition": {"measurement": "temperature", "gte_f": 103},
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: high patient-reported temperature.",
    },
    {
        "code": "SEVERE_BLEEDING",
        "name": "Severe bleeding reported",
        "description": "Patient reports heavy or uncontrolled bleeding.",
        "match_patterns": [
            "heavy bleeding",
            "uncontrolled bleeding",
            "blood loss",
            "khun band nahi",
        ],
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: severe bleeding reported.",
    },
    {
        "code": "PREGNANCY_RED_FLAG",
        "name": "Pregnancy-related red flag",
        "description": "Pregnancy with bleeding, severe headache or reduced fetal movement.",
        "match_patterns": [
            "pregnant",
            "pregnancy",
            "गर्भवती",
            "bhabhanta",
            "bleeding during pregnancy",
        ],
        "target_priority": Priority.URGENT_REVIEW,
        "display_message": "Configured safety signal detected: pregnancy-related report.",
    },
    {
        "code": "PERSISTENT_VOMITING",
        "name": "Persistent vomiting / unable to keep fluids down",
        "description": "Vomiting repeatedly or unable to retain fluids.",
        "match_patterns": [
            "repeated vomiting",
            "persistent vomiting",
            "unable to keep",
            "ultimate ulti",
        ],
        "target_priority": Priority.REVIEW_REQUIRED,
        "display_message": "Configured safety signal detected: persistent vomiting reported.",
    },
    {
        "code": "SYMPTOMS_OVER_7_DAYS",
        "name": "Symptoms for more than 7 days",
        "description": "Reported duration exceeding 7 days without improvement.",
        "match_patterns": [],
        "field_condition": {"duration_days_gte": 7},
        "target_priority": Priority.REVIEW_REQUIRED,
        "display_message": "Configured safety signal detected: prolonged symptom duration.",
    },
]

QUESTIONS = [
    (
        "duration",
        "timeline",
        "duration",
        "When did your symptoms start, and how long have they continued?",
        "आपके लक्षण कब शुरू हुए और कितने दिनों से हैं?",
        "ଆପଣଙ୍କ ଲକ୍ଷଣଗୁଡ଼ିକ କେବେ ଆରମ୍ଭ ହେଲା ଏବଂ କେତେ ଦିନ ଧରି ଅଛି?",
        True,
        10,
    ),
    (
        "temperature",
        "measurements",
        "temperature",
        "What was the highest temperature you measured?",
        "आपने सबसे ज़्यादा तापमान कितना मापा?",
        "ଆପଣ ସର୍ବାଧିକ ତାପମାତ୍ରା କେତେ ମାପିଥିଲେ?",
        True,
        20,
    ),
    (
        "breathing",
        "symptoms",
        "breathing",
        "Are you experiencing any breathing difficulty?",
        "क्या आपको साँस लेने में तकलीफ़ हो रही है?",
        "ଆପଣଙ୍କୁ ଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା ହେଉଛି କି?",
        True,
        30,
    ),
    (
        "current_medication",
        "history",
        "medication",
        "Are you currently taking any medication?",
        "क्या आप अभी कोई दवा ले रहे हैं?",
        "ଆପଣ ବର୍ତ୍ତମାନ କିଛି ଔଷଧ ନେଉଛନ୍ତି କି?",
        True,
        40,
    ),
    (
        "medical_history",
        "history",
        "medical_history",
        "Do you have any known medical history such as diabetes, blood pressure or asthma?",
        "क्या आपको मधुमेह, रक्तचाप या दमा जैसी कोई पुरानी बीमारी है?",
        "ଆପଣଙ୍କର ମଧୁମେହ, ରକ୍ତଚାପ କିମ୍ବା ଆସ୍ମା ଭଳି କୌଣସି ପୁରୁଣା ରୋଗ ଅଛି କି?",
        True,
        50,
    ),
    (
        "severity",
        "symptoms",
        "severity",
        "How severe are your symptoms right now — mild, moderate or severe?",
        "अभी आपके लक्षण कितने गंभीर हैं — हल्के, मध्यम या तीव्र?",
        "ବର୍ତ୍ତମାନ ଆପଣଙ୍କ ଲକ୍ଷଣଗୁଡ଼ିକ କେତେ ଗୁରୁତର — ହାଲୁକା, ମଝିରେ କିମ୍ବା ତୀବ୍ର?",
        False,
        60,
    ),
    (
        "appetite",
        "general",
        "appetite",
        "Are you able to eat and drink normally?",
        "क्या आप सामान्य रूप से खा-पी सकते हैं?",
        "ଆପଣ ସ୍ୱାଭାବିକ ଭାବରେ ଖାଇ ପିଇ ପାରୁଛନ୍ତି କି?",
        False,
        70,
    ),
    (
        "hydration",
        "general",
        "hydration",
        "Are you able to keep fluids down, or are you vomiting repeatedly?",
        "क्या आप पानी पी पा रहे हैं या बार-बार उल्टी हो रही है?",
        "ଆପଣ ପାଣି ପିଇ ପାରୁଛନ୍ତି କି, ନା ବାରମ୍ବାର ବିବିକ୍ଷଣ ହେଉଛି?",
        True,
        80,
    ),
    (
        "prior_care",
        "history",
        "prior_care",
        "Have you already visited another doctor or taken treatment for this problem?",
        "क्या आप इस समस्या के लिए पहले किसी डॉक्टर को दिखा चुके हैं?",
        "ଏହି ସମସ୍ୟା ପାଇଁ ଆପଣ ପୂର୍ବରୁ କୌଣସି ଡାକ୍ତରଙ୍କୁ ଦେଖାଇ ସାରିଛନ୍ତି କି?",
        False,
        90,
    ),
    (
        "contact_person",
        "logistics",
        "contact_person",
        "Who should we contact if more information is needed?",
        "अधिक जानकारी के लिए हम किससे संपर्क करें?",
        "ଅଧିକ ସୂଚନା ଆବଶ୍ୟକ ହେଲେ ଆମେ କାହା ସହିତ ோଡ଼ା କରିବୁ?",
        False,
        100,
    ),
    (
        "emergency_signs",
        "triage",
        "emergency_signs",
        "Have you fainted, felt confused, or experienced chest pain?",
        "क्या आप बेहोश हुए, भ्रम महसूस हुआ, या छाती में दर्द हुआ?",
        "ଆପଣ ବେହୋସ ହୋଇଛନ୍ତି, ବିଭ୍ରାନ୍ତି ଅନୁଭବ କରିଛନ୍ତି, କିମ୍ବା ବକାରେ ଯନ୍ତ୍ରଣା ହୋଇଛି କି?",
        True,
        5,
    ),
]

SYMPTOM_POOL = [
    "Fever",
    "Body pain",
    "Fatigue",
    "Headache",
    "Cough",
    "Cold",
    "Sore throat",
    "Nausea",
    "Vomiting",
    "Diarrhoea",
    "Abdominal pain",
    "Dizziness",
    "Skin rash",
    "Joint pain",
    "Back pain",
    "Burning urination",
    "Loss of appetite",
    "Weakness",
    "Runny nose",
    "Watery eyes",
]

CONCERNS = [
    ("Fever and body pain", ["Fever", "Body pain", "Fatigue"], Language.HI),
    ("Fever since two days", ["Fever", "Headache"], Language.EN),
    ("Cough and cold with throat pain", ["Cough", "Cold", "Sore throat"], Language.EN),
    ("Loose motions and vomiting", ["Diarrhoea", "Vomiting", "Nausea"], Language.HI),
    ("Severe headache for three days", ["Headache"], Language.EN),
    ("Stomach pain since last night", ["Abdominal pain", "Nausea"], Language.OD),
    ("Skin rash with itching", ["Skin rash"], Language.EN),
    ("Back pain while working", ["Back pain", "Fatigue"], Language.HI),
    ("Burning sensation while urinating", ["Burning urination", "Fever"], Language.EN),
    ("Weakness and loss of appetite", ["Weakness", "Loss of appetite"], Language.OD),
    ("Body pain and cold after rain", ["Body pain", "Cold", "Runny nose"], Language.HI),
    ("Fever with chills", ["Fever", "Headache", "Fatigue"], Language.EN),
    ("Diarrhoea for two days", ["Diarrhoea", "Weakness"], Language.OD),
    ("Joint pain in both knees", ["Joint pain"], Language.EN),
    ("Dry cough for five days", ["Cough", "Sore throat"], Language.HI),
]

TIMELINES = [
    "Started 2 days ago, gradually increasing.",
    "Began yesterday evening after work.",
    "Present for about 5 days, not improving.",
    "Started this morning, mild so far.",
    "On and off for the last week.",
    "Since 3 days, worsening after fever.",
]

STATUSES = [
    CaseStatus.SUBMITTED,
    CaseStatus.SUBMITTED,
    CaseStatus.SUBMITTED,
    CaseStatus.IN_REVIEW,
    CaseStatus.IN_REVIEW,
    CaseStatus.REVIEWED,
    CaseStatus.REVIEWED,
    CaseStatus.FOLLOW_UP_REQUIRED,
    CaseStatus.DRAFT,
    CaseStatus.ESCALATED,
    CaseStatus.REFERRED,
]


def now() -> datetime:
    return datetime.now(UTC)


def uid() -> str:
    return uuid.uuid4().hex[:24]


def get_or_create_facilities(db) -> dict[str, Facility]:
    out: dict[str, Facility] = {}
    for spec in FACILITIES:
        fac = db.scalar(select(Facility).where(Facility.code == spec["code"]))
        if fac is None:
            fac = Facility(**spec)
            db.add(fac)
            db.flush()
        out[spec["code"]] = fac
    return out


def seed_users(db, facilities) -> dict[str, User]:
    out: dict[str, User] = {}
    for email, name, role, fac_code, designation in USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=name,
                role=role,
                password_hash=hash_password(DEMO_PASSWORD),
                facility_id=facilities[fac_code].id if fac_code else None,
                designation=designation,
                phone="+91-9400000000",
                is_active=True,
            )
            db.add(user)
            db.flush()
        out[email] = user
    return out


def seed_patients(db, users, facilities) -> list[Patient]:
    specs = [
        (
            "Ramesh Behera",
            "+91-9437100001",
            34,
            "Male",
            Language.HI,
            "PHC-OD-BBSR-01",
            "patient.ramesh@swasthyatriage.demo",
        ),
        (
            "Anita Nayak",
            "+91-9437100002",
            28,
            "Female",
            Language.EN,
            "PHC-OD-BBSR-01",
            "patient.anita@swasthyatriage.demo",
        ),
        (
            "Suresh Jena",
            "+91-9437100003",
            52,
            "Male",
            Language.OD,
            "CHC-OD-CUT-02",
            "patient.suresh@swasthyatriage.demo",
        ),
        ("Lakshmi Das", "+91-9437100004", 41, "Female", Language.HI, "PHC-OD-BBSR-01", None),
        ("Prakash Sahoo", "+91-9437100005", 63, "Male", Language.EN, "HOSP-OD-RKL-03", None),
        ("Minati Behera", "+91-9437100006", 19, "Female", Language.OD, "CHC-OD-CUT-02", None),
        ("Bikash Mohanty", "+91-9437100007", 47, "Male", Language.HI, "HOSP-OD-RKL-03", None),
        ("Sunita Giri", "+91-9437100008", 36, "Female", Language.EN, "PHC-OD-BBSR-01", None),
        ("Harish Panda", "+91-9437100009", 58, "Male", Language.OD, "HOSP-OD-RKL-03", None),
        ("Jyoti Sahu", "+91-9437100010", 24, "Female", Language.HI, "PHC-OD-BBSR-01", None),
        ("Debasis Rout", "+91-9437100011", 70, "Male", Language.EN, "CHC-OD-CUT-02", None),
        ("Pinki Maharana", "+91-9437100012", 31, "Female", Language.OD, "PHC-OD-BBSR-01", None),
    ]
    patients: list[Patient] = []
    for name, phone, age, gender, lang, fac_code, user_email in specs:
        patient = db.scalar(select(Patient).where(Patient.phone == phone))
        if patient is None:
            patient = Patient(
                full_name=name,
                phone=phone,
                age=age,
                gender=gender,
                language=lang,
                facility_id=facilities[fac_code].id,
                user_id=users[user_email].id if user_email else None,
                address=f"{fac_code} catchment area, Odisha",
            )
            db.add(patient)
            db.flush()
        patients.append(patient)
    return patients


def seed_safety_rules(db) -> None:
    for spec in SAFETY_RULES:
        existing = db.scalar(select(SafetyRule).where(SafetyRule.code == spec["code"]))
        if existing is None:
            db.add(SafetyRule(**spec))
    db.flush()


def seed_question_bank(db) -> None:
    for code, category, target, en, hi, od, required, order in QUESTIONS:
        existing = db.scalar(select(QuestionBankItem).where(QuestionBankItem.code == code))
        if existing is None:
            db.add(
                QuestionBankItem(
                    code=code,
                    category=category,
                    target_field=target,
                    text_en=en,
                    text_hi=hi,
                    text_od=od,
                    required_for_review=required,
                    order=order,
                )
            )
    db.flush()


def next_case_number(db) -> str:
    count = db.scalar(select(Case.id).order_by(Case.id.desc()).limit(1)) or 1000
    return f"ST-{count + 1}"


def seed_cases(db, facilities, patients, users) -> None:
    if db.scalar(select(Case.id).limit(1)) is not None:
        return  # already seeded

    reviewers = [
        users["nurse.bbsr@swasthyatriage.demo"],
        users["doctor.bbsr@swasthyatriage.demo"],
        users["doctor.rkl@swasthyatriage.demo"],
    ]
    base_time = now() - timedelta(days=21)
    n = 1001

    for i in range(40):
        concern, symptoms, language = CONCERNS[i % len(CONCERNS)]
        patient = patients[i % len(patients)]
        facility = facilities[
            rng.choice(["PHC-OD-BBSR-01", "CHC-OD-CUT-02", "HOSP-OD-RKL-03", "CAMP-OD-PPL-04"])
        ]
        priority = rng.choices(
            [Priority.ROUTINE, Priority.REVIEW_REQUIRED, Priority.URGENT_REVIEW],
            weights=[55, 33, 12],
        )[0]
        status = rng.choice(STATUSES)
        source = rng.choices(
            [CaseSource.VOICE, CaseSource.CHAT, CaseSource.DOCUMENT, CaseSource.MIXED],
            weights=[35, 40, 10, 15],
        )[0]
        created = base_time + timedelta(hours=i * 9 + rng.randint(0, 4))

        case = Case(
            case_number=f"ST-{n}",
            patient_id=patient.id,
            facility_id=facility.id,
            created_by_user_id=patient.user_id,
            assigned_reviewer_id=(
                rng.choice(reviewers).id if status not in (CaseStatus.DRAFT,) else None
            ),
            status=status,
            priority=priority,
            source=source,
            language=language,
            chief_concern=concern,
            timeline_text=rng.choice(TIMELINES),
            patient_context={"age": patient.age, "gender": patient.gender},
            missing_information=[],
            created_at=created,
            submitted_at=created + timedelta(minutes=6) if status != CaseStatus.DRAFT else None,
            reviewed_at=created + timedelta(hours=3)
            if status in (CaseStatus.REVIEWED, CaseStatus.REFERRED)
            else None,
            reviewed_by_user_id=reviewers[0].id
            if status in (CaseStatus.REVIEWED, CaseStatus.REFERRED)
            else None,
        )
        db.add(case)
        db.flush()
        n += 1

        # Symptoms (patient-reported unless doc source)
        for s in symptoms:
            db.add(
                CaseSymptom(
                    case_id=case.id,
                    term=s,
                    normalized_term=s.lower(),
                    source=Provenance.PATIENT_REPORTED
                    if source != CaseSource.DOCUMENT
                    else Provenance.AI_EXTRACTED,
                    collected_via=source.value,
                    verified=status in (CaseStatus.REVIEWED, CaseStatus.REFERRED),
                )
            )

        # Extra symptoms for variety
        for s in rng.sample(SYMPTOM_POOL, rng.randint(0, 2)):
            if s not in symptoms:
                db.add(
                    CaseSymptom(
                        case_id=case.id,
                        term=s,
                        normalized_term=s.lower(),
                        source=Provenance.PATIENT_REPORTED,
                        collected_via=source.value,
                        verified=False,
                    )
                )

        # Measurements
        if "Fever" in symptoms:
            temp = rng.choice([99.1, 100.4, 101.3, 102.1, 103.4, 104.0])
            db.add(
                CaseMeasurement(
                    case_id=case.id,
                    name="Temperature",
                    value=str(temp),
                    unit="°F",
                    source=Provenance.PATIENT_REPORTED,
                    collected_via=source.value,
                    verified=False,
                )
            )
        if rng.random() < 0.3:
            db.add(
                CaseMeasurement(
                    case_id=case.id,
                    name="Blood pressure",
                    value=rng.choice(["140/90", "120/80", "150/95", "110/70"]),
                    unit="mmHg",
                    source=Provenance.PATIENT_REPORTED,
                    collected_via=CaseSource.CHAT.value,
                    verified=False,
                )
            )

        db.add(
            CaseTimeline(
                case_id=case.id,
                onset_text=case.timeline_text,
                duration_text=rng.choice(["2 days", "3 days", "5 days", "1 day", "1 week"]),
                progression=rng.choice(["worsening", "stable", "improving", "worsening"]),
                source=Provenance.PATIENT_REPORTED,
                verified=False,
            )
        )

        # Consent (required before collection)
        db.add(
            Consent(
                patient_id=patient.id,
                case_id=case.id,
                status=ConsentStatus.GRANTED,
                language=language,
                recorded_at=created - timedelta(minutes=2),
            )
        )

        # Safety signals for urgent cases
        if priority == Priority.URGENT_REVIEW:
            rule = db.scalar(
                select(SafetyRule).where(
                    SafetyRule.code.in_(["BREATHING_DIFFICULTY", "CHEST_PAIN", "HIGH_FEVER"])
                )
            )
            db.add(
                SafetySignal(
                    case_id=case.id,
                    rule_id=rule.id if rule else None,
                    rule_code=rule.code if rule else None,
                    label=rule.name if rule else "Configured signal",
                    message=rule.display_message if rule else "Configured safety signal detected.",
                    priority=Priority.URGENT_REVIEW,
                    evidence={"matched": concern},
                    created_at=created + timedelta(minutes=8),
                )
            )

        # AI summary (labeled AI-generated in UI)
        case.ai_summary = (
            f"Patient-reported concern: {concern}. {case.timeline_text} "
            f"Reported symptoms include {', '.join(symptoms)}. "
            "Information provided by patient; healthcare professional verification required."
        )
        case.ai_summary_generated_at = created + timedelta(minutes=7)
        case.missing_information = ["Current medication", "Known medical history"]

        # Voice session for voice/mixed sources
        if source in (CaseSource.VOICE, CaseSource.MIXED):
            session = VoiceSession(
                public_id=uid(),
                case_id=case.id,
                patient_id=patient.id,
                mode=VoiceSessionMode.IN_APP,
                status=SessionStatus.COMPLETED,
                language=language.value,
                provider="gemini_live",
                started_at=created + timedelta(minutes=1),
                ended_at=created + timedelta(minutes=6),
                created_at=created + timedelta(minutes=1),
            )
            db.add(session)
            db.flush()
            db.add(
                VoiceMessage(
                    session_id=session.id,
                    sequence=1,
                    role=MessageRole.AI,
                    content="Namaste. Please tell me what problem you are experiencing.",
                    language=language.value,
                    had_audio=True,
                )
            )
            db.add(
                VoiceMessage(
                    session_id=session.id,
                    sequence=2,
                    role=MessageRole.PATIENT,
                    content=f"{concern} — {case.timeline_text}",
                    language=language.value,
                    had_audio=True,
                )
            )

        # Review note for reviewed cases
        if status in (CaseStatus.REVIEWED, CaseStatus.REFERRED):
            db.add(
                ReviewNote(
                    case_id=case.id,
                    author_user_id=reviewers[0].id,
                    note="Information reviewed against original patient responses. "
                    "No additional concerns found during intake review.",
                    created_at=created + timedelta(hours=3),
                )
            )

        # Follow-ups for some cases
        if status == CaseStatus.FOLLOW_UP_REQUIRED or rng.random() < 0.15:
            db.add(
                FollowUp(
                    public_id=uid(),
                    case_id=case.id,
                    requested_by_user_id=reviewers[0].id,
                    reason="Additional information required before professional review.",
                    items=["temperature", "current_medication", "duration"],
                    questions=[
                        "What was the highest temperature you measured?",
                        "Are you currently taking any medication?",
                    ],
                    channel=FollowUpChannel.TELECALL,
                    status=rng.choice(
                        [
                            FollowUpStatus.PENDING,
                            FollowUpStatus.COMPLETED,
                            FollowUpStatus.IN_PROGRESS,
                        ]
                    ),
                    created_at=created + timedelta(hours=1),
                    completed_at=created + timedelta(hours=2),
                )
            )

        # Referrals for a few
        if status == CaseStatus.REFERRED:
            db.add(
                Referral(
                    public_id=uid(),
                    case_id=case.id,
                    created_by_user_id=reviewers[0].id,
                    verified_by_user_id=reviewers[0].id,
                    finalized_by_user_id=reviewers[0].id,
                    destination_facility="Cuttack District Community Health Centre",
                    reason_for_referral=f"Persistent symptoms requiring further evaluation: {concern}",
                    draft={
                        "reason": concern,
                        "symptoms": symptoms,
                        "timeline": case.timeline_text,
                        "note": "AI-generated draft. Healthcare professional verification required.",
                    },
                    status=ReferralStatus.FINALIZED,
                    created_at=created + timedelta(hours=4),
                    verified_at=created + timedelta(hours=5),
                    finalized_at=created + timedelta(hours=6),
                )
            )

        # Audit trail
        for action, offset in [
            ("CONSENT_RECORDED", -2),
            ("CASE_CREATED", 0),
            ("AI_SUMMARY_GENERATED", 7),
            ("CASE_SUBMITTED", 6),
        ]:
            if action == "CASE_SUBMITTED" and status == CaseStatus.DRAFT:
                continue
            db.add(
                AuditLog(
                    action=action,
                    actor_user_id=patient.user_id,
                    actor_label=patient.full_name,
                    actor_role=Role.PATIENT,
                    case_id=case.id,
                    case_number=case.case_number,
                    facility_id=facility.id,
                    source="WEB",
                    metadata_json={"language": language.value},
                    created_at=created + timedelta(minutes=offset),
                )
            )
        if status in (CaseStatus.REVIEWED, CaseStatus.REFERRED):
            db.add(
                AuditLog(
                    action="CASE_REVIEWED",
                    actor_user_id=reviewers[0].id,
                    actor_label=reviewers[0].full_name,
                    actor_role=Role.HEALTHCARE_WORKER,
                    case_id=case.id,
                    case_number=case.case_number,
                    facility_id=facility.id,
                    source="WEB",
                    created_at=created + timedelta(hours=3),
                )
            )

    db.flush()


def main() -> None:
    db = SessionLocal()
    try:
        facilities = get_or_create_facilities(db)
        users = seed_users(db, facilities)
        patients = seed_patients(db, users, facilities)
        seed_safety_rules(db)
        seed_question_bank(db)
        seed_cases(db, facilities, patients, users)
        db.commit()

        case_count = db.query(Case).count()
        print("Seed complete.")
        print(f"  facilities: {db.query(Facility).count()}")
        print(f"  users:      {db.query(User).count()}")
        print(f"  patients:   {db.query(Patient).count()}")
        print(f"  cases:      {case_count}")
        print(f"  signals:    {db.query(SafetySignal).count()}")
        print(f"  audits:     {db.query(AuditLog).count()}")
        print()
        print("Demo logins (password: Swasthya@123):")
        for email, *_ in USERS:
            print(f"  {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
