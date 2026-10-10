<div align="center">

# 🏥 SwasthyaFlow AI (SwasthyaTriage AI)
### Intelligent Multimodal Clinical Triage, Emergency Prioritization & Institutional Handoff Platform

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![PostgreSQL Neon](https://img.shields.io/badge/Neon_PostgreSQL-Serverless-00E599?style=for-the-badge&logo=postgresql&logoColor=black)](https://neon.tech)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-2.5%20%2F%203.0_Flash-8E75C2?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Email Providers](https://img.shields.io/badge/Transactional_Email-Gmail_SMTP%20%7C%20Resend-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](https://resend.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Live Deployment](https://img.shields.io/badge/Production_Live-swasthyatriage--ai--azure.vercel.app-0070F3?style=for-the-badge&logo=vercel&logoColor=white)](https://swasthyatriage-ai-azure.vercel.app)

*Developed for Primary Healthcare Centers (PHCs), Community Health Centers (CHCs), and District Headquarters Hospitals (DHHs).*  
*Aligned with Odisha Public Healthcare, Ayushman Bharat Digital Mission (ABDM), and BPUT HealthTech Innovation.*

🌐 **Production Application**: [https://swasthyatriage-ai-azure.vercel.app](https://swasthyatriage-ai-azure.vercel.app)

---

### 📚 Master Architectural Documentation
| Document | File Link | Focus Area |
|---|---|---|
| **Product Requirements Document (PRD)** | [PRD.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/PRD.md) | Vision, Personas, Functional Scope, Emergency Escalation, KPIs |
| **Technical Requirements Document (TRD)** | [TRD.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/TRD.md) | FastAPI, React 19, VAD Audio Pipeline, Telephony Architecture |
| **Application Flow & State Machines** | [APP_FLOW.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/APP_FLOW.md) | User Journeys, Voice FSM, Case Lifecycle FSM, Telephony FSM |
| **UI/UX Design Brief & Tokens** | [UIUX_DESIGN_BRIEF.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/UIUX_DESIGN_BRIEF.md) | Color Tokens, Indian Typography, Voice UI Micro-animations |
| **Backend Database Schema** | [BACKEND_SCHEMA.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/BACKEND_SCHEMA.md) | PostgreSQL ERD, Tables, Constraints, Indexes, Enums, Pydantic DTOs |
| **Implementation & Verification Plan** | [IMPLEMENTATION_PLAN.md](file:///e:/New%20folder%20(2)/BPUT%20PROJECT/IMPLEMENTATION_PLAN.md) | Milestones, Incident Resolutions, Quality Assurance Matrix |

</div>

---

## 📋 Table of Contents
- [Executive Overview](#-executive-overview)
- [Master Documentation Links](#-master-architectural-documentation)
- [Sonam AI Voice Assistant & Multimodal Intake](#-sonam-ai-voice-assistant--multimodal-intake)
- [The Healthcare Problem & Our Solution](#-the-healthcare-problem--our-solution)
- [Core Architecture & System Diagrams](#-core-architecture--system-diagrams)
  - [1. High-Level System Architecture](#1-high-level-system-architecture)
  - [2. Constrained 6-Stage Clinical AI Orchestration Pipeline](#2-constrained-6-stage-clinical-ai-orchestration-pipeline)
  - [3. End-to-End Multimodal Triage Lifecycle](#3-end-to-end-multimodal-triage-lifecycle)
  - [4. Deterministic Emergency Severity Index (ESI) Flowchart](#4-deterministic-emergency-severity-index-esi-flowchart)
  - [5. Clinical RAG & SOP Governance Decision Flow](#5-clinical-rag--sop-governance-decision-flow)
  - [6. Evidence Traceability Ledger & Clinician Audit Sequence](#6-evidence-traceability-ledger--clinician-audit-sequence)
  - [7. AI Evaluation Benchmark & Drift Monitoring Harness](#7-ai-evaluation-benchmark--drift-monitoring-harness)
  - [8. Multi-Provider Transactional Email Dispatch Pipeline](#8-multi-provider-transactional-email-dispatch-pipeline)
  - [9. Resilient Offline PWA Sync Queue Engine](#9-resilient-offline-pwa-sync-queue-engine)
  - [10. Relational Database Schema (ERD)](#10-relational-database-schema-erd)
- [Key Modules & Platform Capabilities](#-key-modules--platform-capabilities)
  - [Constrained 6-Stage AI Orchestration Pipeline](#-constrained-6-stage-ai-orchestration-pipeline)
  - [AI Clinical NLP Suite: Confidence, Contradictions & Missing Info](#-ai-clinical-nlp-suite-confidence-contradictions--missing-info)
  - [Clinical Document RAG & SOP Governance Repository](#-clinical-document-rag--sop-governance-repository)
  - [Clinical Evidence Traceability Ledger](#-clinical-evidence-traceability-ledger)
  - [AI Evaluation Benchmark & Quality Drift Harness](#-ai-evaluation-benchmark--quality-drift-harness)
  - [Multi-Provider Transactional Email Architecture (Gmail SMTP & Resend)](#-multi-provider-transactional-email-architecture-gmail-smtp--resend)
  - [Deterministic Emergency Severity Index (ESI) Engine](#-deterministic-emergency-severity-index-esi-engine)
  - [Multimodal Ingestion (Odia, Hindi, English Voice & Document OCR)](#-multimodal-ingestion-odia-hindi-english-voice--document-ocr)
  - [Healthcare Worker Cockpit & Rapid Review](#-healthcare-worker-cockpit--rapid-review)
  - [Odisha Healthcare Directory & Jan Aushadhi Locator](#-odisha-healthcare-directory--jan-aushadhi-locator)
  - [Offline Sync Queue for Remote Sub-Centres](#-offline-sync-queue-for-remote-sub-centres)
  - [CDMO Multi-Sheet Excel Reporting Engine](#-cdmo-multi-sheet-excel-reporting-engine)
  - [Strict Single-Role Isolation & Enterprise Security](#-strict-single-role-isolation--enterprise-security)
- [Repository Structure](#-repository-structure)
- [Technology Stack Matrix](#-technology-stack-matrix)
- [Quickstart & Setup Guide](#-quickstart--setup-guide)
  - [Prerequisites](#prerequisites)
  - [Backend Setup (FastAPI + Neon PostgreSQL)](#backend-setup-fastapi--neon-postgresql)
  - [Frontend Setup (React 19 + Vite PWA)](#frontend-setup-react-19--vite-pwa)
  - [Single-Project Vercel Serverless Deployment](#single-project-vercel-serverless-deployment)
- [Demo Credentials & Role Matrix](#-demo-credentials--role-matrix)
- [Environment Variables Reference](#-environment-variables-reference)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Clinical Ethics, Safety Net & Disclaimer](#-clinical-ethics-safety-net--disclaimer)
- [License & Acknowledgements](#-license--acknowledgements)

---

## 🌟 Executive Overview

In peripheral public health facilities across India (such as Sub-Centres, PHCs, and CHCs), attending Medical Officers face intense daily OPD volumes exceeding 150–250 patients per shift. Frontline staff must rapidly distinguish between non-urgent complaints and time-critical medical emergencies under extreme constraints:

1. **Rural Linguistic Diversity**: Patients describe complex symptoms in regional dialects (**Odia**, **Hindi**, regional vernacular) that non-native or overburdened doctors struggle to transcribe quickly.
2. **Delayed Emergency Escalation**: Heart attacks, hypertensive crises, acute pediatric dehydration, and respiratory failure languish in standard first-come-first-served queues.
3. **Fragmented Health Records & Unverifiable AI Claims**: Paper slips, handwritten prescriptions, and diagnostic reports lack structured digitization, while naive generative AI systems hallucinate clinical advice without source traceability.
4. **Intermittent Rural Connectivity**: Unstable 2G/3G mobile connectivity in tribal and rural areas prevents cloud-only systems from functioning reliably.

**SwasthyaFlow AI (SwasthyaTriage AI)** bridges this gap as an **intelligent clinical decision-support copilot**. It ingests multilingual patient voice descriptions and prescription images, extracts standardized clinical vitals and symptoms, grounds every extracted clinical claim into an **Evidence Traceability Ledger**, checks for cross-modal contradictions and missing clinical info, validates case urgency against a **Deterministic Emergency Severity Index (ESI)** safety engine, matches cases against **Standard Operating Procedures (SOPs)**, and prepares structured pre-encounter summaries for immediate doctor sign-off.

> **Clinical Operating Principle**:  
> *AI assists and structures. Qualified healthcare professionals decide.*  
> SwasthyaFlow AI is non-diagnostic by design and does not replace registered medical practitioners.

---

## 🎙️ Sonam AI Voice Assistant & Multimodal Intake

**Sonam AI** is SwasthyaFlow AI's empathetic, multilingual clinical intake assistant designed for rural and semi-urban patients:

- **Natural Speech in Indian Dialects**: Full natural conversation support in **Odia (`od`)**, **Hindi (`hi`)**, and **English (`en`)**.
- **Voice Activity Detection (VAD)**: Dynamic Web Audio API RMS monitoring with automated 1.4-second silence detection for effortless turn-taking.
- **Barge-In Affordance**: Patients can speak at any time during Sonam's response; the audio stream cuts off instantly to prioritize the patient.
- **Visual Symptom Extraction**: Real-time extraction pills that catalog fever duration, pain scales, vitals, and chief complaints dynamically.
- **Direct Physician Queue Handoff**: Dedicated **"Send to Doctor Now"** button forwards structured intake summaries directly to the Medical Officer's review queue (`POST /api/cases/{caseId}/submit`).
- **Outbound Tele-Calling & Callback Automation**: Integrated patient callback scheduler with backend SnapServe and VideoSDK telephony integrations for dial-up phone follow-up.
- **Emergency Safety Net**: Instant visual and audio escalation to national ambulances (**112** / **108**) and hospital emergency desk (**6370659934**) whenever acute red flags are detected.

---

## 🎯 The Healthcare Problem & Our Solution

```
┌────────────────────────────────────────────────────────┐
│           CURRENT PERIPHERAL HOSPITAL REALITY          │
├────────────────────────────────────────────────────────┤
│ • Chaotic 200+ patient queues with zero triage         │
│ • Critical emergencies wait behind routine colds       │
│ • Dialect & language barriers delay rapid assessment   │
│ • Unreadable handwritten prescription history          │
│ • Black-box AI advice with zero source traceability    │
│ • Undetected contradictions between vitals & meds      │
│ • Paper referral slips lost during transport           │
│ • Zero outbox notifications for patients & families    │
└───────────────────────────┬────────────────────────────┘
                            │
                    TRANSFORMED BY
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│              SWASTHYAFLOW AI SOLUTION ENGINE           │
├────────────────────────────────────────────────────────┤
│ 1. Voice Ingestion in Odia / Hindi / English (Gemini)  │
│ 2. Vitals & Rx slip OCR extraction (Vision AI)         │
│ 3. Clinical NLP: Confidence & Contradiction Detectors  │
│ 4. Evidence Traceability Ledger with source grounding  │
│ 5. Clinical RAG & SOP Knowledge Repository (NHM SOPs)  │
│ 6. Deterministic ESI 5-Level priority scoring          │
│ 7. Immediate siren alert for ESI 1 & 2 emergencies     │
│ 8. Offline PWA Queue with background sync for ANMs     │
│ 9. Multi-Provider Email (Gmail SMTP / Resend / Mock)   │
│ 10. Verified Directory of Jan Aushadhi & 24/7 Hospitals│
│ 11. Automated AI Evaluation & Quality Drift Harness    │
│ 12. One-click CDMO Excel handoff analytics             │
└────────────────────────────────────────────────────────┘
```

---

## 🏗️ Core Architecture & System Diagrams

### 1. High-Level System Architecture

The following diagram illustrates the modern hybrid architecture of SwasthyaFlow AI, spanning client PWAs, the FastAPI application gateway, serverless PostgreSQL, AI foundation models, transactional communication networks, and geospatial services:

```mermaid
flowchart TD
    subgraph CLIENT_TIER["Frontend Client Tier (React 19 PWA)"]
        PATIENT_PORTAL["Patient Portal (Voice / Chat / Rx OCR / Document RAG)"]
        HCW_PORTAL["Medical Officer Cockpit (ESI Queue / Evidence Ledger / Waveforms)"]
        ADMIN_PORTAL["Facility & State Admin Dashboard (CDMO Excel / AI Evaluation Runs)"]
        OFFLINE_CACHE["PWA Service Worker & IndexedDB Queue"]
    end

    subgraph GATEWAY_TIER["Application Gateway & Runtime Shim"]
        VERCEL_SHIM["Vercel ASGI Serverless Shim (server.py)"]
        FASTAPI_CORE["FastAPI Core Application Gateway (Uvicorn / ASGI)"]
        RATE_LIMITER["SlowAPI Rate Limiter & Security Guard"]
        AUTH_MIDDLEWARE["JWT Auth & Role-Based Access Control (RBAC)"]
    end

    subgraph DATA_TIER["Persistent Data Tier"]
        NEON_DB[("Serverless PostgreSQL (Neon DB / SQLAlchemy 2.0)")]
        LOCAL_STORAGE["Encrypted Document & Vector RAG Index Storage"]
    end

    subgraph AI_PIPELINE["Constrained Clinical AI & NLP Tier"]
        ORCHESTRATOR["Master 6-Stage AI Orchestrator (pipeline.py)"]
        CLINICAL_NLP["Clinical NLP Engine (Confidence / Contradictions / Missing Info)"]
        RAG_ENGINE["Clinical Document RAG & SOP Knowledge Base (guidelines.py)"]
        EVIDENCE_LEDGER["Evidence Traceability Ledger (services/evidence.py)"]
        EVAL_HARNESS["AI Evaluation & Drift Monitoring Harness (runner.py)"]
        SAFETY_ENGINE["Deterministic Safety Rule Engine (Odisha Health Rules)"]
    end

    subgraph EXTERNAL_TIER["External Services & Communication Gateway"]
        EMAIL_GATEWAY["Transactional Email Engine (Gmail SMTP / Resend / Mock)"]
        VIDEOSDK_API["VideoSDK Realtime Telephony & SIP Gateway"]
        OSM_GIS["OpenStreetMap Overpass & Nominatim GIS Locator"]
        GEMINI_MODELS["Google Gemini 2.5 / 3.0 Flash & Live Native Audio"]
    end

    PATIENT_PORTAL -->|HTTPS / WSS| VERCEL_SHIM
    HCW_PORTAL -->|HTTPS / WSS| VERCEL_SHIM
    ADMIN_PORTAL -->|HTTPS| VERCEL_SHIM
    OFFLINE_CACHE <-->|Background Sync| PATIENT_PORTAL

    VERCEL_SHIM --> FASTAPI_CORE
    FASTAPI_CORE --> RATE_LIMITER
    RATE_LIMITER --> AUTH_MIDDLEWARE

    AUTH_MIDDLEWARE -->|SQLAlchemy 2.0| NEON_DB
    AUTH_MIDDLEWARE -->|Secure I/O| LOCAL_STORAGE

    FASTAPI_CORE --> ORCHESTRATOR
    ORCHESTRATOR --> CLINICAL_NLP
    ORCHESTRATOR --> RAG_ENGINE
    ORCHESTRATOR --> EVIDENCE_LEDGER
    ORCHESTRATOR --> SAFETY_ENGINE
    FASTAPI_CORE --> EVAL_HARNESS

    ORCHESTRATOR -->|API Calls| GEMINI_MODELS
    FASTAPI_CORE -->|SMTP / REST API| EMAIL_GATEWAY
    FASTAPI_CORE -->|SIP / WebRTC| VIDEOSDK_API
    FASTAPI_CORE -->|Geospatial Queries| OSM_GIS
```

---

### 2. Constrained 6-Stage Clinical AI Orchestration Pipeline

All patient encounters pass through an immutable, strictly bounded 6-stage clinical pipeline (`backend/services/orchestration/pipeline.py`), guaranteeing that generative models can never bypass deterministic safety constraints:

```mermaid
flowchart TD
    INPUT(["Patient Encounter Ingested (Voice / Text / Document OCR)"]) --> STAGE_1["Stage 1: Multi-Modal Ingestion & Normalization<br/>• Convert Odia / Hindi to standardized English<br/>• Extract chief complaint & duration"]

    STAGE_1 --> STAGE_2["Stage 2: Confidence-Aware Entity Extraction<br/>• Calculate calibration tier (HIGH >= 0.85, MED, LOW)<br/>• Detect hedging phrases (e.g., 'sambhabata', 'lag raha hai')<br/>• Sync to Clinical Evidence Ledger with verbatim quotes"]

    STAGE_2 --> STAGE_3["Stage 3: Cross-Modal Contradiction & Missing-Info Gates<br/>• Check Negation Conflicts (e.g. denies diabetes but takes Metformin)<br/>• Check Vital Discordance (e.g. claims 'fine' but SpO2 < 90%)<br/>• Check Syndrome-Specific Missing Information"]

    STAGE_3 --> STAGE_4{"Stage 4: Deterministic Safety Rule Engine Gate<br/>Authoritative Odisha Public Health Safety Rules<br/>(AI CANNOT OVERRIDE)"}

    STAGE_4 -- "Red Flag / Life Threat" --> OVERRIDE_URGENT["🚨 Force Priority: URGENT_REVIEW<br/>ESI Level 1 / 2 Assigned<br/>Sound Cockpit Siren & Push Email Alert"]
    STAGE_4 -- "Within Thresholds" --> STAGE_5["Stage 5: Evidence-Grounded SOP Retrieval (RAG)<br/>• Match applicable clinical syndromes against NHM SOPs<br/>• Surface guideline criteria, triage pathway & red flags"]

    OVERRIDE_URGENT --> STAGE_6["Stage 6: Human Clinician Review Gate<br/>• Medical Officer inspects waveforms, OCR & Evidence Ledger<br/>• Approves, edits, or rejects extractions<br/>• Zero autonomous prescriptions or diagnoses"]
    STAGE_5 --> STAGE_6

    STAGE_6 --> SIGN_OFF(["Doctor Signs Off Case & Formulates Plan"])
```

---

### 3. End-to-End Multimodal Triage Lifecycle

The patient journey through SwasthyaFlow AI, from initial multilingual intake to finalized physician sign-off and institutional referral:

```mermaid
sequenceDiagram
    autonumber
    actor Patient as 🧑‍🌾 Rural Patient (ASHA Assisted)
    participant UI as 📱 SwasthyaFlow PWA
    participant API as ⚡ FastAPI Backend
    participant Gemini as 🧠 Gemini Multimodal AI
    participant Orchestrator as ⚙️ Orchestration Pipeline
    participant Evidence as 📑 Evidence Ledger
    participant Safety as 🛡️ Deterministic Safety Rules
    participant Email as ✉️ Email Engine (Gmail/Resend)
    actor Doctor as 👨‍⚕️ Attending Medical Officer
    participant Hospital as 🏥 Referral Center (DHH / SCB)

    Patient->>UI: Speaks symptoms in Odia / Hindi or uploads Rx slip
    UI->>API: POST /api/cases (Audio PCM / Multipart Document)
    API->>Gemini: Normalize dialect & extract structured clinical entities
    Gemini-->>API: Normalized complaints, vitals, timeline & medications
    API->>Orchestrator: run_constrained_clinical_pipeline(db, case)
    Orchestrator->>Evidence: Bind claims to verbatim quotes & source snippets
    Orchestrator->>Safety: Evaluate vitals against deterministic threshold rules
    Safety-->>Orchestrator: Calculate ESI Score (Level 1-5) & flag red alerts

    alt ESI Level 1 or 2 (Life-Threatening Emergency)
        API->>Doctor: 🚨 Trigger real-time siren & urgent queue escalation
        API->>Email: Dispatch instant high-priority emergency email alert
        Email-->>Doctor: Push emergency dispatch card to inbox
    else ESI Level 3, 4, or 5 (Urgent / Routine)
        API->>Doctor: Enqueue in prioritized OPD review queue
    end

    Doctor->>UI: Inspects audio waveforms, Evidence Ledger, & extracted vitals
    Doctor->>UI: Approves triage note with 1-click clinical advice
    UI->>API: POST /api/reviews/{caseId} (Doctor Signature)

    opt Requires Tertiary Specialization
        Doctor->>UI: Creates institutional referral handoff
        UI->>API: POST /api/referrals (Selects Capital Hospital / SCB Cuttack)
        API->>Email: Dispatches referral transfer record to recipient DHH
        API->>Hospital: Updates inter-facility transfer registry
    end

    API-->>Patient: Delivers structured case receipt, care advice & nearby pharmacies
```

---

### 4. Deterministic Emergency Severity Index (ESI) Flowchart

SwasthyaFlow AI enforces a **zero-hallucination deterministic safety net**. Generative AI assists with entity extraction, but patient severity categorization is strictly evaluated using the **Emergency Severity Index (ESI 5-Level Algorithm)** and Odisha Public Health Safety Rules:

```mermaid
flowchart TD
    START(["Patient Ingested: Voice / Vitals / Symptoms"]) --> STEP_1{"ESI Decision Point A:<br/>Immediate Resuscitation Required?<br/>(Cardiac arrest, unresponsiveness, severe apnea)"}

    STEP_1 -- YES --> ESI_1["🚨 ESI LEVEL 1: RESUSCITATION<br/>Immediate life-saving intervention needed<br/>Trigger sirens + Immediate ER notification"]
    STEP_1 -- NO --> STEP_2{"ESI Decision Point B:<br/>High-Risk Situation or Severe Distress?<br/>(Chest pain, stroke signs, acute SpO2 < 90%,<br/>severe lethargy, acute bleeding)"}

    STEP_2 -- YES --> ESI_2["🔴 ESI LEVEL 2: EMERGENT<br/>High-risk assessment within 10 minutes<br/>Send Emergency Alert Email + Priority queue banner"]
    STEP_2 -- NO --> STEP_3{"ESI Decision Point C:<br/>How many medical resources needed?<br/>(Labs, ECG, IV fluids, X-ray, nebulization)"}

    STEP_3 -- "Two or More Resources" --> VITAL_CHECK{"Check Vital Signs:<br/>HR > 120, RR > 28, Temp > 103°F,<br/>or abnormal pediatric vitals?"}
    VITAL_CHECK -- "Severely Abnormal" --> ESI_2
    VITAL_CHECK -- "Normal / Mild" --> ESI_3["🟡 ESI LEVEL 3: URGENT<br/>Requires full workup & multi-resource diagnostic<br/>Target physician review < 30-45 minutes"]

    STEP_3 -- "One Resource" --> ESI_4["🔵 ESI LEVEL 4: LESS URGENT<br/>Simple diagnostic or single procedure<br/>(e.g., Simple suture, single plain X-ray)"]
    STEP_3 -- "Zero Resources" --> ESI_5["🟢 ESI LEVEL 5: NON-URGENT<br/>Routine outpatient consult, med refill, rash review<br/>Handled through regular OPD sequence"]

    ESI_1 --> ALERT_BUS["📡 Notification Engine & Dispatcher"]
    ESI_2 --> ALERT_BUS
    ESI_3 --> AUDIT_LOG["📝 Neon PostgreSQL Audit Trail"]
    ESI_4 --> AUDIT_LOG
    ESI_5 --> AUDIT_LOG

    ALERT_BUS --> EMAIL_OUTBOX["✉️ Transactional Email Dispatch (Gmail / Resend)"]
    ALERT_BUS --> SOUND_SIREN["🔊 HCW Cockpit Audio Siren & Screen Flash"]
    ALERT_BUS --> AUDIT_LOG
```

---

### 5. Clinical RAG & SOP Governance Decision Flow

How uploaded clinical documents and Standard Operating Procedures (SOPs) are indexed and queried across 6 specialized clinical reasoning modes:

```mermaid
flowchart LR
    subgraph INGESTION["Document Ingestion & Chunking"]
        DOCS["Uploaded Patient Files<br/>(Prescriptions, PDFs, Labs, Clinical Notes)"] --> CHUNKER["Intelligent Clinical Chunking<br/>(chunking.py)"]
        CHUNKER --> EMBEDDINGS["Embeddings Engine & Vector Index<br/>(embeddings.py / vector_store.py)"]
    end

    subgraph SOP_BASE["SOP Knowledge Repository (sop_repository.py)"]
        NHM_SOP["Odisha NHM Clinical SOPs<br/>(AFI, ACS, Respiratory, Snakebite, Maternal)"]
        GOVERNANCE{"Governance Status Check<br/>review_status = 'UNVERIFIED'<br/>until signed by clinical authority"}
        NHM_SOP --> GOVERNANCE
    end

    subgraph QUERY_MODES["6 Clinical Reasoning Modes (document_rag.py)"]
        USER_QUERY["Clinician / Patient Query"] --> ROUTER{"Select Reasoning Mode"}
        ROUTER --> M_SUM["1. Summarize: Clinical synthesis"]
        ROUTER --> M_KEY["2. Key Points: Actionable takeaways"]
        ROUTER --> M_EXP["3. Explain: Patient-friendly terms"]
        ROUTER --> M_CMP["4. Compare: Multi-visit trajectory"]
        ROUTER --> M_QTE["5. Quotes: Exact cited excerpts"]
        ROUTER --> M_DVE["6. Deep Dive: Pathophysiology & diff"]
    end

    EMBEDDINGS --> ROUTER
    GOVERNANCE --> ROUTER
    M_SUM --> OUTPUT["Grounded Response with Document Citations & Page References"]
    M_KEY --> OUTPUT
    M_EXP --> OUTPUT
    M_CMP --> OUTPUT
    M_QTE --> OUTPUT
    M_DVE --> OUTPUT
```

---

### 6. Evidence Traceability Ledger & Clinician Audit Sequence

Every single clinical claim is bound to an audit trail connecting facts to raw sources and doctor decisions:

```mermaid
sequenceDiagram
    autonumber
    actor Patient as 🧑‍🌾 Patient
    participant System as ⚙️ Clinical NLP & OCR
    participant Ledger as 📑 FactEvidence Table (PostgreSQL)
    actor Doctor as 👨‍⚕️ Attending Medical Officer

    Patient->>System: "ମୋ ଛାତିରେ ବହୁତ ଯନ୍ତ୍ରଣା ହେଉଛି ୩ ଘଣ୍ଟା ହେଲା" (Severe chest pain for 3 hours)
    System->>System: Extract: Symptom="Chest Pain", Duration="3 hours", Confidence=0.92 (HIGH)
    System->>Ledger: INSERT INTO fact_evidence (fact_type='SYMPTOM', source_kind='VOICE_TRANSCRIPT', source_snippet='ମୋ ଛାତିରେ ବହୁତ ଯନ୍ତ୍ରଣା...', review_status='PENDING')

    Doctor->>Ledger: GET /api/cases/{caseId}/evidence
    Ledger-->>Doctor: Display Evidence Ledger with verbatim quote, audio timestamp & tier badge
    
    alt Clinician Confirms Fact
        Doctor->>Ledger: PATCH /api/cases/{caseId}/evidence/{id} (status='CONFIRMED')
        Ledger-->>Doctor: Status updated to 'CONFIRMED' with Doctor ID & Timestamp
    else Clinician Edits Fact
        Doctor->>Ledger: PATCH /api/cases/{caseId}/evidence/{id} (status='EDITED', corrected_value='...')
        Ledger-->>Doctor: Recorded with audit diff
    else Clinician Rejects False Extraction
        Doctor->>Ledger: PATCH /api/cases/{caseId}/evidence/{id} (status='REJECTED')
        Ledger-->>Doctor: Fact excluded from active clinical summary
    end
```

---

### 7. AI Evaluation Benchmark & Drift Monitoring Harness

SwasthyaFlow AI includes an automated testing and drift monitoring harness (`backend/services/evaluation/`) to ensure continuous model quality:

```mermaid
flowchart LR
    GOLD_SET["Gold-Standard Clinical Benchmark Set<br/>(40+ curated cases across Odia, Hindi, English)"] --> RUNNER["Evaluation Runner<br/>(services/evaluation/runner.py)"]
    
    RUNNER --> PIPELINE["Target AI Models & Prompts<br/>(Gemini 2.5 / 3.0 Flash)"]
    PIPELINE --> METRICS["Metrics Computation Engine<br/>(services/evaluation/metrics.py)"]
    
    METRICS --> ACC["Triage Accuracy (%)"]
    METRICS --> CONC["ESI Concordance Rate (%)"]
    METRICS --> RED_REC["Red-Flag Recall / Sensitivity (%)"]
    METRICS --> HAL["Hallucination / Over-triage Rate (%)"]
    METRICS --> LANG["Language Breakdown (Odia / Hindi / English)"]
    
    ACC --> PERSIST[("Persist to evaluation_runs Table<br/>Neon PostgreSQL")]
    CONC --> PERSIST
    RED_REC --> PERSIST
    HAL --> PERSIST
    LANG --> PERSIST
    
    PERSIST --> DASHBOARD["Super Admin Quality Dashboard<br/>Threshold Alerts & Model Drift Graphs"]
```

---

### 8. Multi-Provider Transactional Email Dispatch Pipeline

SwasthyaFlow AI features a pluggable multi-provider email architecture (`backend/services/email/`) supporting Gmail SMTP, Resend API, and Mock simulators:

```mermaid
sequenceDiagram
    autonumber
    participant App as 🖥️ Event Trigger (Welcome / Intake / Emergency Alert)
    participant Service as ⚙️ Email Service (service.py)
    participant Client as 🏭 Email Client Factory (client.py)
    participant DB as 🗄️ Neon DB (email_logs)
    participant Provider as 🌐 Active Provider (Gmail SMTP / Resend)

    App->>Service: dispatch_email(recipient, template, context)
    Service->>Service: Render HTML & plain text template
    Service->>DB: INSERT INTO email_logs (status='PENDING', attempts=0)
    Service->>Client: get_email_client()
    
    alt email_provider == 'gmail'
        Client->>Provider: Connect to smtp.gmail.com:587 via TLS
        Provider-->>Client: Message Accepted (250 OK)
    else email_provider == 'resend'
        Client->>Provider: POST https://api.resend.com/emails
        Provider-->>Client: HTTP 200 OK (id: "re_123...")
    else email_delivery_mode == 'mock'
        Client->>Client: Simulate delivery & log mock messageId
    end

    Client-->>Service: Return provider_message_id
    Service->>DB: UPDATE email_logs SET status='SENT', provider_message_id=id, sent_at=NOW()
```

---

### 9. Resilient Offline PWA Sync Queue Engine

Healthcare workers in rural Odisha sub-centres frequently encounter zero-connectivity dead zones. SwasthyaFlow AI operates as an **offline-first Progressive Web App (PWA)**:

```mermaid
flowchart LR
    subgraph FIELD_OFFLINE["Field Sub-Centre (Offline / No GSM)"]
        ASHA_WORKER["👩‍⚕️ ASHA / ANM Worker"] --> FORM_INTAKE["Take Patient Voice & Vitals"]
        FORM_INTAKE --> LOCAL_INDEXED_DB[("Local Storage & IndexedDB Queue")]
        LOCAL_INDEXED_DB --> PENDING_BADGE["Network Widget: '2 Encounters Queued'"]
    end

    subgraph NETWORK_DETECTOR["Resilience Engine (network.ts)"]
        HEARTBEAT{"Heartbeat Ping<br/>/api/health"}
        PENDING_BADGE --> HEARTBEAT
        HEARTBEAT -- "Offline" --> BACKOFF["Exponential Backoff Retry (5s, 15s, 30s)"]
        BACKOFF --> HEARTBEAT
    end

    subgraph FIELD_ONLINE["Network Restored (3G / 4G / Wi-Fi)"]
        HEARTBEAT -- "Online" --> SYNC_EXEC["Execute syncAll() in Background"]
        SYNC_EXEC --> BATCH_POST["POST /api/cases (Batch Synchronize)"]
        BATCH_POST --> CLOUD_BACKEND["⚡ FastAPI + Neon PostgreSQL"]
        CLOUD_BACKEND --> CONFIRMATION["Return Cloud IDs & Clear Local Queue"]
        CONFIRMATION --> DISPATCH_EMAIL["Trigger Confirmation Receipts via Email"]
    end
```

---

### 10. Relational Database Schema (ERD)

The complete PostgreSQL relational data model designed with SQLAlchemy 2.0 and managed via Alembic:

```mermaid
erDiagram
    users ||--o{ cases : "creates / assigned"
    users ||--o{ review_notes : "authors"
    users ||--o{ email_logs : "receives"
    users }o--|| facilities : "belongs to"
    users ||--o{ refresh_tokens : "owns"
    users ||--o{ password_reset_tokens : "requests"
    users ||--o{ email_verification_tokens : "requests"
    users ||--o{ evaluation_runs : "runs"

    facilities ||--o{ cases : "registered at"
    facilities ||--o{ referrals : "originates / receives"

    patients ||--o{ cases : "has"
    
    cases ||--o{ case_measurements : "contains"
    cases ||--o{ case_symptoms : "contains"
    cases ||--o{ case_timelines : "records"
    cases ||--o{ chat_messages : "contains"
    cases ||--o{ documents : "attaches"
    cases ||--o{ safety_signals : "triggers"
    cases ||--o{ review_notes : "reviewed by"
    cases ||--o{ referrals : "generates"
    cases ||--o{ followups : "schedules"
    cases ||--o{ voice_sessions : "captures"
    cases ||--o{ fact_evidence : "traceable evidence"

    safety_rules ||--o{ safety_signals : "evaluates"

    documents ||--o{ document_extractions : "yields"
    voice_sessions ||--o{ voice_messages : "contains"
    voice_sessions ||--o{ tele_calls : "dials"
    tele_calls ||--o{ call_transcripts : "transcribes"

    users {
        int id PK
        string email UK
        string hashed_password
        string full_name
        string role
        int facility_id FK
        string designation
        boolean is_active
        datetime created_at
    }

    facilities {
        int id PK
        string name
        string facility_code UK
        string facility_type
        string district
        float latitude
        float longitude
        string contact_phone
        boolean is_referral_hub
    }

    patients {
        int id PK
        string abha_id UK
        string full_name
        int age
        string gender
        string phone
        string address_district
        datetime registered_at
    }

    cases {
        int id PK
        string case_number UK
        int patient_id FK
        int facility_id FK
        string status
        string priority
        string source
        string primary_language
        string chief_complaint_raw
        string clinical_summary
        string red_flag_summary
        datetime created_at
    }

    fact_evidence {
        int id PK
        int case_id FK
        string fact_type
        string fact_name
        string fact_value
        string source_kind
        string source_snippet
        float confidence
        string confidence_tier
        string review_status
        int reviewed_by_user_id FK
        datetime created_at
    }

    evaluation_runs {
        int id PK
        string run_label
        string kind
        string dataset_version
        string model_version
        int total_samples
        json metrics
        json language_breakdown
        json warnings
        datetime created_at
    }

    safety_rules {
        int id PK
        string rule_code UK
        string name
        string description
        string trigger_condition
        string priority_override
        boolean is_active
    }

    safety_signals {
        int id PK
        int case_id FK
        int rule_id FK
        string severity
        string rationale
        datetime triggered_at
    }

    email_logs {
        int id PK
        string recipient_email
        string recipient_name
        string template_name
        string subject
        string status
        string provider_message_id UK
        int attempts
        text error_detail
        json metadata
        datetime created_at
        datetime sent_at
    }

    referrals {
        int id PK
        int case_id FK
        int from_facility_id FK
        int to_facility_id FK
        string status
        string clinical_reason
        string urgency
        datetime created_at
    }
```

---

## 🚀 Key Modules & Platform Capabilities

### ⚙️ Constrained 6-Stage AI Orchestration Pipeline
- **Bounded Multi-Step Architecture**: Ingests, normalizes, scores confidence, executes cross-modal contradiction checks, evaluates deterministic safety rules, and retrieves SOP guidance.
- **Clinician Override Authority**: Generative outputs can suggest questions or highlight red flags, but the deterministic safety engine has ultimate priority escalation power, and human clinicians retain final sign-off.

### 🧠 AI Clinical NLP Suite: Confidence, Contradictions & Missing Info
- **Confidence Calibration & Tiering**: Assigns explicit empirical confidence tiers (`HIGH >= 0.85`, `MEDIUM 0.60–0.84`, `LOW < 0.60`). Recognizes clinical hedging expressions in English, Odia (`sambhabata`, `kichi kichi`), and Hindi (`lag raha hai`, `ho sakti hai`).
- **Cross-Modal Contradiction Detector**: Detects discrepancies between self-reported statements, vital sign readings, and prescription scans (e.g., patient denies diabetes while active prescription lists Metformin 500mg).
- **Syndrome-Specific Missing Information**: Flags missing critical facets for high-risk syndromes (e.g. for chest pain, checks if radiation to jaw/arm, diaphoresis, or dyspnea have been investigated).

### 📚 Clinical Document RAG & SOP Governance Repository
- **6 Specialized Reasoning Modes**:
  1. `summarize`: Comprehensive synthesis of patient reports.
  2. `key_points`: Actionable takeaways and key findings.
  3. `explain`: Patient-friendly translation of medical terms and lab tests.
  4. `compare`: Multi-document trajectory and cross-visit changes.
  5. `quotes`: Verbatim grounded citations with source coordinates.
  6. `deep_dive`: Pathophysiology and differential diagnostic context.
- **SOP Governance Framework**: Built-in Standard Operating Procedures for Acute Febrile Illness, Acute Coronary Syndrome, Respiratory Distress, Snakebite Envenomation, and Maternal Emergencies. All protocols include transparent governance tracking (`review_status="UNVERIFIED"` until signed off by a named clinical authority).

### 📑 Clinical Evidence Traceability Ledger
- **Verbatim Grounding**: Every extracted symptom, vital measurement, and timeline fact links back to its exact source snippet, audio transcript token, or document coordinate.
- **Interactive Review UI**: Attending medical officers can verify, edit, or reject individual facts in the `EvidenceLedger` interface embedded in [`CaseReview.tsx`](file:///d:/Downloads2/BPUT%20PROJECT%20%283%29/BPUT%20PROJECT/frontend/src/pages/app/hcw/CaseReview.tsx).

### 🧪 AI Evaluation Benchmark & Quality Drift Harness
- **Automated Drift Detection**: Runs standardized evaluation runs against gold-standard synthetic clinical datasets across Odia, Hindi, and English.
- **Key Quality Metrics**: Triage accuracy, ESI classification concordance, red-flag detection sensitivity/recall, and hallucination rate.

### ✉️ Multi-Provider Transactional Email Architecture (Gmail SMTP & Resend)
- **Pluggable Architecture**: Supports direct Gmail SMTP (zero domain verification needed for production deployment) and modern developer-first Resend API.
- **Automated Clinical Triggers**: Welcome onboarding emails, intake confirmation receipts, high-priority emergency sirens (`ESI-1` and `ESI-2`), referral handoff dispatches, and cryptographic password reset tokens.

### 🚨 Deterministic Emergency Severity Index (ESI) Engine
- **Non-Stochastic Safety**: Critical decisions do not rely purely on LLM probability. A deterministic rule engine checks vital sign thresholds against clinical ranges (HR, SpO2, Systolic/Diastolic BP, Temperature, Respiratory Rate).
- **5 ESI Triage Categories**:
  - **ESI 1 (Resuscitation)**: Immediate life threats (apnea, cardiac arrest, profound shock).
  - **ESI 2 (Emergent)**: High-risk conditions (unstable vitals, acute coronary syndromes, severe stroke signs).
  - **ESI 3 (Urgent)**: Multiple diagnostic resources required with stable vitals.
  - **ESI 4 (Less Urgent)**: Single resource needed (e.g., standard suture, single X-ray).
  - **ESI 5 (Non-Urgent)**: Examination only, routine prescription refill.

### 🎙️ Multimodal Ingestion (Odia, Hindi, English Voice & Document OCR)
- **Natural Voice Intake**: Speaks naturally in local dialects. Automatically converts and translates audio into clinical English while preserving verbatim patient statements for forensic accuracy.
- **Document OCR & Prescription Extraction**: Uses Google Gemini Vision paired with PyMuPDF to extract handwritten prescriptions, previous medicine dosages, and diagnostic lab tables.

### 🩺 Healthcare Worker Cockpit & Rapid Review
- **Audio Waveform Inspection**: Doctors can play original voice recordings directly within the case review page to listen to respiratory sounds, wheezing, or emotional distress.
- **Interactive Vitals Monitor**: Color-coded cards highlight abnormal vitals (e.g., SpO2 < 92% flashes crimson; heart rate > 110 bpm flashes amber).
- **One-Click Clinical Advice Modals**: Fast pre-built clinical templates allow doctors to append instant discharge notes, medication advice, or immediate escalation directives in under 5 seconds.

### 🗺️ Odisha Healthcare Directory & Jan Aushadhi Locator
- **Universal Facility Finder**: Real-time integration with OpenStreetMap (Nominatim & Overpass APIs) covering all districts across Odisha.
- **Jan Aushadhi Kendra Directory**: Locates government generic medicine dispensaries offering essential medicines at subsidized rates (e.g., Paracetamol 650mg, ORS sachets, Metformin, Amoxicillin).
- **24/7 Emergency Hospital Stock**: Identifies 24/7 casualty dispensaries carrying critical emergency stocks (Anti-Snake Venom - ASV, Anti-Rabies Vaccine - ARV, IV fluids).

### 📶 Offline Sync Queue for Remote Sub-Centres
- **Resilient Mobile Operation**: Designed for frontline ASHA and ANM workers in areas with zero or unstable mobile signals.
- **Encounters Outbox**: Stores audio recordings, patient demographics, and vitals in local client storage.
- **Background Sync Engine**: Periodically monitors network reachability. Once 3G/4G or Wi-Fi reconnects, queued cases upload automatically with collision-free handling.

### 📊 CDMO Multi-Sheet Excel Reporting Engine
- **One-Click Official Reporting**: Generates formatted `.xlsx` workbooks for Chief District Medical Officers (CDMO) using `openpyxl`.
- **6 Comprehensive Worksheets**:
  1. *Patient Details*: Demographics, ABHA identifiers, registration dates.
  2. *Cases*: Intake source, ESI priority, clinical summary, assigned staff.
  3. *Voice Sessions*: Duration, audio files, language detected, transcript status.
  4. *Follow-ups*: Due dates, channel used (telecall/chat), completion outcomes.
  5. *Referrals*: Origin facility, destination hospital, urgency, handoff status.
  6. *Audit Summary*: Detailed chronological audit records with IP addresses and timestamps.

### 🔒 Strict Single-Role Isolation & Enterprise Security
- **Strict Role Enforcement**: A single email address is strictly bound to one role (`PATIENT`, `HEALTHCARE_WORKER`, `FACILITY_ADMIN`, or `SUPER_ADMIN`).
- **OAuth & Native Parity**: Unified authentication logic across both email/password credentials and Google OAuth via Clerk.
- **Defense in Depth**: Password hashing via Argon2id, signed short-lived JWT access tokens (15m), secure HTTP-only refresh tokens (7d), and SlowAPI rate limiting.

---

## 📂 Repository Structure

```
├── backend/
│   ├── alembic/                     # Database migrations
│   │   └── versions/                # Schema changes (evidence ledger, evaluation runs, email)
│   ├── api/                         # FastAPI REST Route Handlers
│   │   ├── admin.py                 # System administration & user provisioning
│   │   ├── ai_clinical.py           # Clinical NLP (confidence, contradictions, missing info)
│   │   ├── ai_evaluation.py         # AI benchmark runs, metrics & model drift
│   │   ├── auth.py                  # Login, registration, token refresh & OAuth exchange
│   │   ├── cases.py                 # Case creation, queue queries & status changes
│   │   ├── chat.py                  # Real-time patient & staff conversational intake
│   │   ├── documents.py             # Prescription & lab document uploads with OCR
│   │   ├── email_admin.py           # Email telemetry, delivery stats & retry outbox
│   │   ├── evidence.py              # Evidence ledger API (view, edit, confirm facts)
│   │   ├── exports.py               # Excel and CSV reporting endpoints
│   │   ├── facilities.py            # Healthcare & pharmacy locator (OpenStreetMap GIS)
│   │   ├── followups.py             # Scheduled post-discharge follow-ups
│   │   ├── notifications.py         # In-app notification center alerts
│   │   ├── patients.py              # Patient profile & ABHA identity management
│   │   ├── referrals.py             # Inter-facility hospital transfer handoffs
│   │   ├── reviews.py               # Doctor clinical review & triage sign-off
│   │   ├── safety.py                # Deterministic safety rule management
│   │   ├── telecalls.py             # Outbound telephony & VideoSDK session hooks
│   │   └── voice.py                 # Multimodal voice intake & audio playback
│   ├── auth/                        # Security & Token Infrastructure
│   │   ├── clerk.py                 # Clerk Social OAuth bridge & JWT verification
│   │   ├── dependencies.py          # Fast-fail RBAC route dependency injections
│   │   └── jwt.py                   # PyJWT creation, validation & token rotation
│   ├── database/                    # Persistence Engine
│   │   ├── session.py               # SQLAlchemy 2.0 engine & connection pooling
│   │   └── seed.py                  # Realistic Odisha healthcare synthetic seeder
│   ├── middleware/                  # Request Interceptors
│   │   ├── errors.py                # Standardized JSON error response formatting
│   │   └── ratelimit.py             # SlowAPI IP rate limiting
│   ├── models/                      # SQLAlchemy 2.0 ORM Declarations
│   │   ├── case.py                  # Cases, measurements, symptoms, timelines, review notes
│   │   ├── conversation.py          # Real-time chat messages
│   │   ├── documents.py             # Uploaded files and OCR extractions
│   │   ├── email.py                 # EmailLog, PasswordResetToken, EmailVerificationToken
│   │   ├── enums.py                 # Role, Priority, CaseStatus, ESI, Provenance enums
│   │   ├── evaluation.py            # EvaluationRun table (model drift tracking)
│   │   ├── evidence.py              # FactEvidence table (provenance & source quotes)
│   │   ├── safety.py                # SafetyRule and SafetySignal tables
│   │   ├── user.py                  # User, Patient, Facility, RefreshToken
│   │   ├── voice.py                 # VoiceSession, TeleCall, CallTranscript
│   │   └── workflow.py              # Referral, FollowUp, Notification, AuditLog
│   ├── schemas/                     # Pydantic v2 Request/Response Contracts
│   │   ├── auth.py, case.py, chat.py, documents.py, evidence.py, patient.py, voice.py
│   ├── services/                    # Business Logic & Integrations
│   │   ├── clinical_nlp/            # Clinical NLP Engine
│   │   │   ├── confidence.py        # Calibration tiering & hedging detection
│   │   │   ├── contradictions.py    # Cross-modal clinical contradiction detector
│   │   │   └── missing_info.py      # Syndrome-specific missing info questions
│   │   ├── email/                   # Multi-Provider Transactional Email Engine
│   │   │   ├── base.py              # Base email provider protocol
│   │   │   ├── client.py            # Email client provider factory
│   │   │   ├── gmail.py             # Gmail SMTP provider implementation
│   │   │   ├── resend.py            # Resend REST API provider implementation
│   │   │   ├── service.py           # High-level dispatching & token generator
│   │   │   └── templates.py         # Responsive HTML email templates
│   │   ├── evaluation/              # AI Evaluation & Drift Harness
│   │   │   ├── benchmark_data.py    # Gold-standard clinical benchmark cases
│   │   │   ├── history.py           # Historical run queries & drift detection
│   │   │   ├── metrics.py           # Accuracy, ESI concordance & recall metrics
│   │   │   └── runner.py            # Benchmark execution runner
│   │   ├── exports/                 # Multi-sheet Excel generator (openpyxl)
│   │   ├── gemini/                  # Google Gemini 2.5/3 multimodal integration
│   │   ├── longitudinal/            # Cross-visit patient trajectory summarizer
│   │   ├── ocr/                     # Prescription & lab report text extraction
│   │   ├── orchestration/           # Master 6-Stage Constrained AI Pipeline
│   │   │   └── pipeline.py          # Constrained multi-step pipeline runner
│   │   ├── rag/                     # Clinical Document RAG & SOP Repository
│   │   │   ├── chunking.py          # Clinical semantic text chunker
│   │   │   ├── document_rag.py      # 6 reasoning modes over patient files
│   │   │   ├── embeddings.py        # Dense text vector embeddings
│   │   │   ├── engine.py            # Core RAG retrieval orchestration
│   │   │   ├── guidelines.py        # SOP clinical guidance generator
│   │   │   ├── retriever.py         # Semantic similarity vector search
│   │   │   ├── sop_repository.py    # Odisha NHM clinical protocols with governance
│   │   │   └── vector_store.py      # Local JSON/vector persistent storage
│   │   ├── safety/                  # Deterministic clinical safety rule evaluator
│   │   ├── storage.py               # Local encrypted file storage manager
│   │   ├── telephony/               # VideoSDK and Twilio telephony service
│   │   ├── triage/                  # ESI triage scoring calculator
│   │   └── voice/                   # Gemini Live audio streaming agent
│   ├── tests/                       # Pytest Suite (30 Comprehensive Test Modules)
│   │   ├── test_ai_endpoints.py     # AI Clinical NLP & RAG endpoint tests
│   │   ├── test_auth_rbac.py        # Strict role isolation & JWT verification tests
│   │   ├── test_clinical_nlp.py     # Confidence, contradiction & missing info tests
│   │   ├── test_clinical_rag.py     # Clinical document RAG tests
│   │   ├── test_document_rag.py     # 6 clinical reasoning modes test suite
│   │   ├── test_email_system.py     # Multi-provider email dispatch & retry tests
│   │   ├── test_evaluation_history.py # Evaluation run persistence tests
│   │   ├── test_evaluation_metrics.py # Accuracy & ESI concordance metrics tests
│   │   ├── test_evidence_traceability.py # Evidence ledger source grounding tests
│   │   ├── test_facilities.py       # Healthcare locator GIS & helpline tests
│   │   ├── test_longitudinal.py     # Multi-encounter patient history tests
│   │   ├── test_patient_excel.py    # CDMO multi-sheet Excel generator tests
│   │   ├── test_production_rag.py   # Production RAG vector store tests
│   │   ├── test_safety_engine.py    # Deterministic ESI rule & vitals tests
│   │   ├── test_sop_governance.py   # SOP governance & review status tests
│   │   └── ...                      # 15 additional domain test modules
│   ├── config.py                    # Pydantic BaseSettings environment loader
│   ├── main.py                      # FastAPI application factory & SPA fallback
│   ├── pyproject.toml               # Python dependencies and packaging configuration
│   └── requirements.txt             # Production Python package manifest
│
├── frontend/
│   ├── public/                      # Static assets, icons, manifest.webmanifest
│   ├── src/
│   │   ├── components/              # Modular UI Components
│   │   │   ├── AppPermissionsModal.tsx     # Mic, camera, location permission helper
│   │   │   ├── GoogleSignInButton.tsx      # Social OAuth sign-in button
│   │   │   ├── guards.tsx                  # Role-based route protection guards
│   │   │   ├── LanguagePicker.tsx          # English, Hindi, Odia language selector
│   │   │   ├── NetworkStatusWidget.tsx     # Offline queue indicator & manual sync
│   │   │   ├── NotificationCenterDropdown.tsx # Real-time alerts drop-down
│   │   │   └── Layout/                     # AppShell and PublicLayout wrappers
│   │   ├── i18n/                           # Internationalization Locales (en, hi, od)
│   │   ├── lib/                            # Helpers & External Clients
│   │   │   ├── api.ts                      # Axios/Fetch client with token auto-refresh
│   │   │   ├── facilities.ts               # OpenStreetMap GIS directory queries
│   │   │   ├── pharmacies.ts               # Jan Aushadhi & 24/7 pharmacy directory
│   │   │   ├── time.ts                     # Relative & localized time formatting
│   │   │   └── types.ts                    # TypeScript domain interfaces
│   │   ├── pages/                          # Application Screen Views
│   │   │   ├── LandingPage.tsx             # Interactive landing page with live demo
│   │   │   ├── SplashPage.tsx              # Mobile pre-app splash screen
│   │   │   ├── auth/                       # Login, Signup, Reset Password, Email Verify
│   │   │   ├── app/patient/                # Patient Dashboard, Voice Intake, Rx Upload
│   │   │   ├── app/hcw/                    # HCW Dashboard, Queue, Case Review, EvidenceLedger
│   │   │   ├── app/admin/                  # Facility Admin & Super Admin Dashboards
│   │   │   ├── app/communication/          # Multichannel Communication Centre
│   │   │   ├── app/offline/                # SyncQueuePage for offline-queued encounters
│   │   │   └── app/pharmacies/             # NearbyPharmaciesPage locator
│   │   ├── stores/                         # State Management (Zustand)
│   │   │   ├── auth.ts                     # User identity, tokens & role state
│   │   │   └── network.ts                  # Offline queue, GSM signal & sync state
│   │   ├── App.tsx                         # Client-side React routing configuration
│   │   └── main.tsx                        # Application mount entrypoint
│   ├── package.json                        # Frontend dependencies & scripts
│   └── vite.config.ts                      # Vite build configuration & PWA setup
│
├── build_frontend.py                # Cloud build hook to compile Vite SPA
├── server.py                        # Root ASGI shim for single-project Vercel deployment
├── .env.example                     # Environment template with all required keys
└── .vercelignore                    # Deployment hygiene rules for serverless output
```

---

## 🛠️ Technology Stack Matrix

| Domain | Technology / Library | Version | Purpose & Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | `19.2.x` | Modern reactive UI, concurrent rendering, and hooks architecture |
| **Build Tooling** | **Vite** | `8.3.x` | Ultra-fast HMR and optimized production asset bundling |
| **Language** | **TypeScript** | `5.7+` | Strict static typing across all APIs, states, and data models |
| **Styling** | **Tailwind CSS** | `v4.0` | Utility-first styling with modern CSS variables |
| **Icons** | **Lucide React** | `^1.16` | Clean, accessible clinical iconography |
| **Client State** | **Zustand** | `5.0.x` | Lightweight state management for authentication and offline sync |
| **Server State** | **TanStack React Query** | `5.x` | Intelligent data caching, automatic refetching, and query invalidation |
| **Localization (i18n)** | **i18next** | `^24.x` | Multilingual support for English, Hindi, and Odia (`en`, `hi`, `od`) |
| **PWA & Offline** | **Vite-Plugin-PWA** | `^0.21` | Service Worker caching and offline application shell |
| **Backend Framework** | **FastAPI** | `0.115+` | High-performance asynchronous REST API framework |
| **ASGI Server** | **Uvicorn** | `^0.34` | Production ASGI web server with worker scaling |
| **Database** | **PostgreSQL** | `16+` | Production relational database (Serverless via Neon DB) |
| **ORM** | **SQLAlchemy** | `2.0+` | Type-safe asynchronous/synchronous database ORM |
| **DB Migrations** | **Alembic** | `1.14+` | Automated schema version control and migration tracking |
| **Data Validation** | **Pydantic** | `v2.10+` | Fast runtime schema validation and serialization |
| **Multimodal LLM** | **Google Gemini Flash** | `2.5 / 3.0` | Clinical entity extraction, voice translation, and summarization |
| **Live Audio** | **Gemini Live Audio** | `Native Preview`| Low-latency bidirectional conversational symptom intake |
| **Transactional Email**| **Gmail SMTP / Resend** | `Pluggable` | Multi-provider delivery for alerts, intakes, and tokens |
| **GIS & Geocoding** | **OpenStreetMap** | `Overpass API` | Live hospital, clinic, and Jan Aushadhi Kendra directory locator |
| **Telephony** | **VideoSDK** | `REST / SIP` | In-app teleconsultations and outbound telephony rounds |
| **Excel Generation** | **openpyxl** | `^3.1` | Multi-sheet styled CDMO analytics reporting generator |
| **Password Hashing** | **Argon2id (passlib)** | `^1.7` | Memory-hard cryptographic password hashing |
| **Testing** | **pytest** | `8.3+` | 30 comprehensive test suites covering NLP, RAG, safety, and RBAC |

---

## 🚦 Quickstart & Setup Guide

### Prerequisites
Make sure the following runtimes are installed on your workstation:
* **Python**: `3.11` or higher (`python --version`)
* **Node.js**: `20.x` or higher (`node --version`) and `npm`
* **PostgreSQL**: A running PostgreSQL instance or a free serverless database on [Neon.tech](https://neon.tech)
* **Google Gemini API Key**: *(Optional for full AI features; offline deterministic mocks are built-in)*
* **Email Configuration**: *(Optional; defaults to `mock` mode for local dev, or Gmail SMTP for zero-config production)*

---

### Backend Setup (FastAPI + Neon PostgreSQL)

1. **Navigate to the backend directory and set up a virtual environment**:
   ```bash
   # On Windows (PowerShell)
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # On macOS / Linux
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` from the project root to `backend/.env`:
   ```bash
   cp ../.env.example .env
   ```
   *Edit `.env` to specify your `DATABASE_URL` (Neon PostgreSQL), `JWT_SECRET`, and optional API keys.*

4. **Apply Database Migrations & Seed Synthetic Healthcare Data**:
   ```bash
   alembic upgrade head
   python database/seed.py
   ```
   *The seeder populates sample Odisha facilities, demo clinical users, realistic patient cases, and safety rules.*

5. **Start the FastAPI Development Server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The backend API is now running at: `http://127.0.0.1:8000`  
   Interactive OpenAPI / Swagger docs: `http://127.0.0.1:8000/docs`

---

### Frontend Setup (React 19 + Vite PWA)

1. **Open a new terminal and navigate to `frontend/`**:
   ```bash
   cd frontend
   npm install
   ```

2. **Start the Vite Development Server**:
   ```bash
   npm run dev
   ```
   The application is accessible at: `http://localhost:5173`

---

### Single-Project Vercel Serverless Deployment

SwasthyaFlow AI includes a root **`server.py`** entrypoint shim and **`build_frontend.py`** cloud hook, allowing both the FastAPI backend and React SPA to deploy as a unified single project on Vercel:

1. **Configure Environment Variables in Vercel**:
   Add `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, and email variables under *Project Settings -> Environment Variables*.
2. **Deploy via Vercel CLI**:
   ```bash
   npm install -g vercel
   vercel
   ```
   *The root `server.py` automatically resolves the backend package on `sys.path` and serves both the API endpoints (`/api/*`) and built SPA frontend.*

---

## 👥 Demo Credentials & Role Matrix

For testing and demonstration, use the pre-configured credentials generated by `database/seed.py`:

> **Default Password for all demo accounts**: `Swasthya@123`

| Role | Email Address | Designation | Facility / Jurisdiction |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `super@swasthyatriage.demo` | State Health Director | Odisha State Directorate |
| **Facility Admin** | `admin.bbsr@swasthyatriage.demo` | Medical Superintendent | Bhubaneswar Town PHC |
| **Healthcare Worker** | `doctor.bbsr@swasthyatriage.demo` | Attending Medical Officer | Bhubaneswar Town PHC |
| **Healthcare Worker** | `nurse.bbsr@swasthyatriage.demo` | Staff Triage Nurse | Bhubaneswar Town PHC |
| **Healthcare Worker** | `doctor.rkl@swasthyatriage.demo` | Casualty Medical Officer | Rourkela Govt Hospital (DHH) |
| **Patient** | `patient.ramesh@swasthyatriage.demo` | Registered Citizen | Bhubaneswar Town PHC |
| **Patient** | `patient.anita@swasthyatriage.demo` | Registered Citizen | Bhubaneswar Town PHC |

*One-click instant login buttons are also available directly on the public [Landing Page](http://localhost:5173/landing).*

---

## ⚙️ Environment Variables Reference

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+psycopg://...` | Connection URI for Neon PostgreSQL database |
| `JWT_SECRET` | *random string* | Secret key used to sign and verify JSON Web Tokens |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Access token lifetime in minutes |
| `JWT_REFRESH_TTL_DAYS` | `7` | Refresh token lifetime in days |
| `COOKIE_SECURE` | `false` | Set to `true` in production with SSL / HTTPS |
| `GEMINI_API_KEY` | `""` | Google Gemini API key *(falls back to deterministic mock if omitted)* |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model for multimodal clinical entity extraction |
| `GEMINI_LIVE_MODEL` | `gemini-2.5-flash-native-audio...` | Gemini model for bidirectional live voice interaction |
| `EMAIL_PROVIDER` | `gmail` | Pluggable email backend: `gmail` or `resend` |
| `EMAIL_DELIVERY_MODE` | `mock` | `live` for real dispatches, or `mock` for local simulation |
| `EMAIL_REPLY_TO` | `support@swasthyatriage.gov.in`| Reply-to email destination |
| `GMAIL_SMTP_USER` | `""` | Gmail address for production SMTP sending |
| `GMAIL_SMTP_APP_PASSWORD`| `""` | Google App Password (16 characters) |
| `GMAIL_SENDER_NAME` | `SwasthyaFlow AI` | Sender name on Gmail emails |
| `RESEND_API_KEY` | `""` | Resend REST API key |
| `RESEND_SENDER_EMAIL` | `onboarding@resend.dev` | Verified custom domain sender email on Resend |
| `APP_BASE_URL` | `http://localhost:5173` | Public base URL used in generated email links |
| `TELEPHONY_PROVIDER` | `mock` | Telephony backend: `mock` or `videosdk` |
| `VIDEOSDK_API_KEY` | `""` | VideoSDK API key for real telecalls |
| `VIDEOSDK_SECRET_KEY` | `""` | VideoSDK secret key for dynamic token generation |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated list of allowed CORS origins |
| `MAX_UPLOAD_MB` | `20` | Maximum allowed file upload size (MB) |

---

## 🧪 Testing & Quality Assurance

### Comprehensive Backend Pytest Suite
The backend includes **30 test modules** covering security, deterministic ESI logic, Clinical NLP, Document RAG, Evidence Traceability, Evaluation runs, and multi-provider email:

```bash
cd backend
# On Windows PowerShell:
$env:PYTHONPATH='.'
pytest -v

# Run targeted test suites:
pytest tests/test_clinical_nlp.py -v          # Confidence & contradiction tests
pytest tests/test_evidence_traceability.py -v # Source provenance ledger tests
pytest tests/test_document_rag.py -v          # 6 clinical reasoning modes tests
pytest tests/test_evaluation_metrics.py -v    # Accuracy & ESI concordance tests
pytest tests/test_email_system.py -v          # Multi-provider email tests
pytest tests/test_safety_engine.py -v         # Deterministic ESI triage tests
```

**Key Test Suites**:
- `test_clinical_nlp.py`: Verifies confidence scoring, hedging detection, and cross-modal contradiction detection.
- `test_evidence_traceability.py`: Tests the Evidence Ledger, verifying that every extracted claim maps to its source quote.
- `test_document_rag.py`: Tests the 6 clinical reasoning modes (`summarize`, `key_points`, `explain`, `compare`, `quotes`, `deep_dive`).
- `test_sop_governance.py`: Validates the SOP repository governance metadata and unverified draft warnings.
- `test_evaluation_history.py` & `test_evaluation_metrics.py`: Tests automated benchmark quality metrics and drift monitoring.
- `test_email_system.py`: Tests Gmail SMTP, Resend, and Mock delivery pipelines with failure retries.
- `test_auth_rbac.py`: Validates strict single-role isolation and token authentication.
- `test_safety_engine.py`: Tests deterministic ESI triage logic and vital sign threshold rules.
- `test_patient_excel.py`: Verifies multi-sheet CDMO Excel generator output and styling.
- `test_facilities.py`: Tests OpenStreetMap GIS facility queries and helpline lookup.

### Frontend Verification & Static Analysis
```bash
cd frontend
# Run TypeScript compilation check
npx tsc --noEmit

# Run high-speed Oxlint check
npm run lint

# Validate production bundle compilation
npm run build
```

---

## 🛡️ Clinical Ethics, Safety Net & Disclaimer

1. **Non-Diagnostic Decision Support**:  
   SwasthyaFlow AI is designed as a clinical information organization and prioritization copilot. It **does not independently diagnose illnesses or prescribe medication**. All triage recommendations, priority categorizations, and clinical notes require explicit review and authorization by a qualified, registered medical practitioner.
2. **Deterministic Safety Override**:  
   Critical vital signs and red-flag symptoms are evaluated using deterministic clinical rules. Emergency escalations (ESI Levels 1 and 2) trigger immediate visual and acoustic alerts without relying on probabilistic model outputs.
3. **Data Provenance & Evidence Grounding**:  
   Every piece of information in the medical record is tagged with its provenance (`PATIENT_REPORTED`, `AI_EXTRACTED`, `CONFIGURED_RULE`, `REVIEWER_VERIFIED`) and logged in the immutable **Evidence Ledger**, ensuring complete auditability for attending physicians.
4. **Audit Trail**:  
   Every user action, clinical note modification, referral dispatch, and security event is recorded in the `audit_logs` table with timestamps, IP addresses, and user identifiers.
5. **ABDM Alignment**:  
   The data models adhere to Ayushman Bharat Digital Mission (ABDM) standards, supporting Ayushman Bharat Health Account (ABHA) patient identifiers and structured health record exchanges.

---

## 📜 License & Acknowledgements

Developed with ❤️ for frontline healthcare workers and underserved rural communities.  
Licensed under the [MIT License](LICENSE).

*Special thanks to the open-source community, BPUT HealthTech Innovation Lab, Odisha Public Healthcare practitioners, and the engineers behind FastAPI, React, Neon DB, and Google Gemini.*
