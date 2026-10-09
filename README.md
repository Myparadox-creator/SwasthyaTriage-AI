# SwasthyaFlow AI (SwasthyaTriage AI) 🏥
> **Multimodal Clinical Triage, Emergency Prioritization & Institutional Handoff Platform**  
> *Aligned with Odisha Public Healthcare, Ayushman Bharat Digital Mission (ABDM), and BPUT HealthTech Innovation.*

---

## 🌟 Overview

**SwasthyaFlow AI** is a state-of-the-art multimodal clinical triage decision-support platform designed to solve emergency overcrowding, diagnostic delay, and rural language barriers in Primary and Community Health Centers (PHCs / CHCs).

It ingests multilingual patient symptom voice recordings (in **Odia**, **Hindi**, and **English**), extracts clinical vitals from prescription slips via OCR, calculates deterministic **ESI (Emergency Severity Index)** priority levels, and routes structured handoffs directly to Medical Officers and District Referral Hospitals.

---

## 🚀 Key Capabilities

1. **Multimodal Clinical Ingestion**
   - Natural voice symptom assessment with real-time translation (Odia, Hindi, English).
   - High-accuracy prescription and lab investigation document OCR.
   - Deterministic red-flag safety rules preventing catastrophic delays.

2. **Role-Based Command Portals**
   - **Citizen Patient Portal**: Voice-guided intake, medical history uploads, nearby pharmacy and clinic locator.
   - **Medical Officer Cockpit**: Real-time ESI emergency alert bar, audio waveform inspection, one-click clinical advice modal.
   - **Facility Admin Console**: OPD queue velocity, staff duty allocation, and official Excel reporting for CMO reviews.
   - **State Health Directorate Command**: Multi-district network oversight, deterministic safety rule tuning, transactional email telemetry.

3. **Enterprise Security & Role Isolation**
   - **Strict Single-Role Policy**: Strict one-email-one-role enforcement across traditional password and Google OAuth authentication.
   - **Transactional Notifications**: Instant welcome and dispatch confirmations via Brevo.
   - **Clinical Audit Trail**: Comprehensive tracking of all assessments, logins, referrals, and clinical reviews.

4. **Resilient Public Health Architecture**
   - Progressive Web App (PWA) with offline assessment queue and background sync.
   - Integrated outbound tele-calling rounds via VideoSDK telephony.
   - Zero autonomous prescriptions: Qualified medical personnel retain ultimate clinical authority.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, i18next, TanStack Query, Zustand |
| **Backend** | Python 3.13, FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Uvicorn |
| **Database** | Serverless PostgreSQL (Neon DB) |
| **AI / Multimodal** | Google Gemini 2.5/3 Flash Multimodal API, OCR Services |
| **Telephony & Realtime** | VideoSDK SIP Telephony |
| **Auth & Security** | JWT Access & Refresh Tokens, Clerk Social OAuth, Role-Based Access Control (RBAC) |
| **Email & Delivery** | Brevo Transactional Email System |

---

## 📂 Repository Structure

```
├── backend/
│   ├── api/             # FastAPI REST endpoints (auth, cases, safety, admin, voice, chat)
│   ├── auth/            # JWT tokens, Clerk exchange, password hashing & dependencies
│   ├── database/        # Database session and connection pooling (Neon PostgreSQL)
│   ├── models/          # SQLAlchemy ORM models (User, Case, Patient, Notification, EmailLog)
│   ├── schemas/         # Pydantic v2 validation models
│   ├── services/        # AI orchestration, Brevo email, OCR, triage engine, telephony
│   ├── tests/           # Comprehensive pytest suite (auth, safety, OCR, emails)
│   └── main.py          # FastAPI application factory
│
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI widgets, layout shells, language picker
│   │   ├── pages/       # Landing page, Auth screens, Patient/HCW/Admin dashboards
│   │   ├── stores/      # Zustand state stores (auth, cases)
│   │   └── lib/         # API fetch client and utility helpers
│   └── vite.config.ts   # Vite bundler & PWA configuration
│
└── .gitignore           # Git ignore rules for Python, Node, and runtime secrets
```

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

## 🧪 Testing

Run backend tests:
```bash
cd backend
pytest -v
```

Run frontend type checks and production build:
```bash
cd frontend
npx tsc --noEmit
npm run build
```

---

## 📜 Clinical Disclaimer
*SwasthyaFlow AI is an AI-assisted clinical information structuring and triage decision-support prototype developed for public healthcare demonstration. Qualified healthcare professionals lead, evaluate, and hold final decision authority. AI does not independently diagnose diseases or prescribe medication dosages.*

---

© 2026 SwasthyaFlow AI · BPUT HealthTech Innovation Lab · All Rights Reserved.
