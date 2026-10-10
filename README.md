# SwasthyaFlow AI (SwasthyaTriage AI) 🏥
> **Multimodal Clinical Triage, Grounded Document RAG, Sub-5s Voice Assistant & Emergency Prioritization Platform**  
> *Aligned with Odisha Public Healthcare, Ayushman Bharat Digital Mission (ABDM), and BPUT HealthTech Innovation.*

---

## 🌟 Overview

**SwasthyaFlow AI** is a state-of-the-art multimodal clinical triage decision-support platform designed to solve emergency overcrowding, diagnostic delay, and rural language barriers in Primary and Community Health Centers (PHCs / CHCs).

It ingests multilingual patient symptom voice recordings (in **Odia**, **Hindi**, and **English**), extracts clinical vitals from prescription slips via OCR, calculates deterministic **ESI (Emergency Severity Index)** priority levels, runs evidence-grounded **Clinical Document RAG** over patient medical files, and routes structured handoffs directly to Medical Officers and District Referral Hospitals with instant notifications.

---

## 🚀 Key Capabilities

### 1. 📄 InsightRAG — Evidence-Grounded Medical Document Reasoning
- **Multi-Format Ingestion**: Ingests PDFs, DOCX, TXT, CSV, prescription scans, and lab reports up to 20MB with magic-byte validation and OCR support.
- **Production 13-Step RAG Architecture**:
  1. *Ingestion & Validation*: Multi-format parsing, corrupt/duplicate handling.
  2. *Text Preprocessing*: Structural cleanup, heading and table extraction.
  3. *Semantic Chunking*: 500-token chunks with 80-token overlap, unique chunk IDs (`doc_{id}_c{idx}`).
  4. *Embeddings*: 3072-dimensional vector embeddings with zero-dependency local TF-IDF fallback.
  5. *Vector Store*: Case-isolated persistent index (`rag_index/case_{id}.json`).
  6. *Hybrid Retrieval*: Combines dense cosine similarity with BM25 lexical keyword ranking.
  7. *Strict Grounding*: Zero hallucinations. Accurately identifies technical/academic documents (e.g. Automata manuals, project reports) without forcing fake medical/prescription templates.
  8. *Honest Unanswerable Query Handling*: Explicitly acknowledges when information is missing from documents.
  9. *Verbatim Citations*: Cites exact source files and sections (`[Doc: filename]`).
- **Resilient Model Cascade**: Gemini 3 Flash / Flash-Latest with automatic waterfall routing and zero quota lockouts.
- **Dedicated Consultation Sidebar**: Filters out draft voice triage clutter and presents only verified Document Consultation cases with auto-selection of active files.
- **Native Healthcare Theme**: Tailored to Swasthya's clean clinical teal/emerald design system with clean user profile footers and dark mode toggle.

### 2. 👨‍⚕️ Direct "Submit to Doctor" with Accurate Date & Time Tracking
- **One-Click Clinical Dispatch**: Patients can directly send their case, uploaded files, and RAG analysis to the clinical queue.
- **Precise Submission Date & Time**: Submissions record exact timestamps (e.g. `10 Oct 2026, 12:22 PM`), rendered prominently across patient confirmation modals, live chat timelines, and doctor notification payloads.
- **System-Wide & Facility Staff Routing**: Guaranteed notification delivery ensuring duty doctors and healthcare workers are alerted immediately with case priority and submission timestamp.
- **Live Notification Center**: In-app doctor notification dropdown with polling, unread count badges, priority alerts (Routine / Urgent / Critical), and one-click triage queue review.
- **Patient Confirmation**: Instant modal confirmation displaying Case Reference Number, Triage Priority, and exact formatted Submission Date & Time.

### 3. 🎙️ High-Speed Voice Assistant with Auto-Intake & Direct Send
- **Sub-5s Voice Response**: Sentence-by-sentence streaming TTS targeting 1–3s response-start time.
- **Voice Activity Detection (VAD)**: Automatic 1.3s silence detection for natural turn-taking.
- **Automated Clinical Fact Gathering**: Automatically captures reported symptoms, duration, and vitals.
- **Direct Send to Doctor Button**: Allows patient to dispatch case directly from the voice session with spoken audio confirmations in Hindi, Odia, or English.
- **Telemetry Diagnostics**: Real-time turn breakdown (STT, LLM TTFT, TTS prep, playback start latency).

### 4. 📍 Multi-Tier Live GPS & Facility Locator
- **3-Tier Geolocation Engine**:
  - *Tier 1*: High-accuracy satellite GPS (5s timeout).
  - *Tier 2*: Standard Wi-Fi / Cell tower triangulation (6s timeout).
  - *Tier 3*: Multi-provider network IP geolocation fallback.
- **Reverse Geocoding**: OpenStreetMap Nominatim integration converts coordinates into human-readable area and district names.
- **Nearby Medical Map**: Real-time distance calculation and map fly-to for nearby PHCs, CHCs, hospitals, and pharmacies across Odisha.

### 5. 🛡️ Role-Based Command Portals & Enterprise Security
- **Citizen Patient Portal**: Voice assessment, document RAG, emergency guidance, and case tracking.
- **Medical Officer Cockpit**: Real-time ESI emergency alert bar, audio waveform review, and clinical advice modals.
- **Facility Admin Console**: OPD queue velocity, staff duty allocation, and official Excel reporting for CMO reviews.
- **State Health Directorate Command**: Multi-district network oversight, deterministic safety rule tuning, and transactional email telemetry.
- **Strict Role Isolation**: One-email-one-role enforcement across traditional password and Google OAuth authentication.
- **Clinical Audit Trail**: Comprehensive tracking of all assessments, logins, referrals, and document access.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, i18next, TanStack Query, Zustand |
| **Backend** | Python 3.13, FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Uvicorn |
| **Database** | Serverless PostgreSQL (Neon DB) |
| **AI / RAG / Multimodal** | Google Gemini 2.5/3 Flash API, Clinical NLP Extractor, SOP Retriever |
| **Telephony & Realtime** | VideoSDK SIP Telephony |
| **Auth & Security** | JWT Access & Refresh Tokens, Clerk Social OAuth, Role-Based Access Control (RBAC) |
| **Email & Delivery** | Gmail SMTP / Resend Transactional Email System |
| **Geolocation & Maps** | HTML5 Geolocation API, OpenStreetMap Nominatim, Leaflet |

---

## 📂 Repository Structure

```
├── backend/
│   ├── api/             # FastAPI REST endpoints
│   │   ├── cases.py     # Case lifecycle, triage note, submission
│   │   ├── documents.py # Document upload, OCR, and Document RAG endpoint
│   │   ├── voice.py     # SSE turn streaming, sessions, audio turns
│   │   ├── facilities.py# Medical locator and reverse geocoding
│   │   ├── notifications.py # Self-scoped in-app notifications
│   │   └── auth.py      # Authentication & Clerk OAuth bridge
│   ├── models/          # SQLAlchemy ORM models (Case, Document, Notification, User)
│   ├── schemas/         # Pydantic v2 request/response schemas
│   ├── services/
│   │   ├── rag/         # Clinical Document RAG & Institutional SOP retriever
│   │   ├── notifications.py # System-wide staff notification dispatcher
│   │   ├── gemini/      # Gemini client, circuit breaker, structured extraction
│   │   ├── safety/      # Deterministic ESI safety engine & rule evaluator
│   │   └── storage.py   # Secure file storage & magic-byte upload validation
│   ├── tests/           # Pytest suite (Document RAG, cases, safety, notifications)
│   └── main.py          # FastAPI application factory
│
├── frontend/
│   ├── src/
│   │   ├── components/  # Notification center, Layout shell, language picker
│   │   ├── pages/app/
│   │   │   ├── patient/ # InsightRAG Uploads, Voice Assessment, Dashboard
│   │   │   └── hcw/     # Clinical Queue, Communications, Reports
│   │   ├── stores/      # Zustand auth & cases state stores
│   │   └── lib/         # API fetch client, permissions, multi-tier geolocation
│   └── vite.config.ts   # Vite bundler & PWA configuration
│
└── README.md            # Comprehensive project documentation
```

---

## 🔌 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/cases` | Create new triage intake record |
| `POST` | `/api/cases/{id}/documents` | Upload PDF, DOCX, TXT, CSV or prescription image |
| `POST` | `/api/cases/{id}/documents/rag` | Query Document RAG (summarize, key_points, explain, compare, quotes, deep_dive) |
| `POST` | `/api/cases/{id}/submit` | Submit case to doctor & trigger instant staff notification |
| `GET` | `/api/notifications` | Fetch real-time notifications with unread count |
| `POST` | `/api/notifications/{id}/read` | Mark individual notification as read |
| `POST` | `/api/cases/{id}/voice/sessions/{sid}/turns/stream` | Stream voice turn response via Server-Sent Events (SSE) |
| `GET` | `/api/facilities/nearby` | Find nearest healthcare centers & pharmacies with reverse geocoding |

---

## ⚡ Getting Started

### 1. Prerequisites
- **Node.js** (v18+) & **npm**
- **Python** (v3.11+)
- **PostgreSQL** database (e.g. Neon serverless DB)

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
Copy `.env.example` to `backend/.env` and configure your credentials:
```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

Run backend unit and RAG integration tests:
```bash
cd backend
$env:PYTHONPATH='.'  # PowerShell
pytest tests/test_document_rag.py -v
pytest tests/test_documents_api.py -v
```

Run frontend type checks and production build:
```bash
cd frontend
npm run build
```

---

## 📧 Transactional Email & Password Reset System

SwasthyaFlow AI includes a production-grade transactional email subsystem supporting both **Gmail SMTP (TLS/587)** and **Resend API**:

- **Real-Time Delivery:** Dispatches branded, responsive HTML notifications with fallback plain text.
- **Supported Workflows:**
  - `welcome`: Sent upon new account registration or Google OAuth login.
  - `email_verification`: 24-hour cryptographic token verification.
  - `password_reset`: 30-minute time-bounded reset link (`/auth/reset-password?token=...`).
  - `password_changed`: Real-time security alert sent immediately when password hash updates.
- **Security & Replay Protection:**
  - Plaintext tokens are never stored in the database; only SHA-256 token hashes are persisted.
  - Reset links are single-use (`used_at` timestamp recorded upon redemption).
  - All existing user sessions/refresh tokens are automatically revoked upon successful password reset.
  - Passwords are encrypted using Argon2id with adaptive memory-cost controls.

---

## 📜 Clinical Disclaimer
*SwasthyaFlow AI is an AI-assisted clinical information structuring and triage decision-support prototype developed for public healthcare demonstration. Qualified healthcare professionals lead, evaluate, and hold final decision authority. AI does not independently diagnose diseases or prescribe medication dosages.*

---

© 2026 SwasthyaFlow AI · BPUT HealthTech Innovation Lab · All Rights Reserved.
