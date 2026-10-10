# 🔄 Application Flow & State Machines (APP_FLOW)
## SwasthyaFlow AI — Interactive Clinical Journeys, State Transitions & Protocols

---

## 1. End-to-End User Journeys

### 1.1 Patient Journey: AI Voice Intake to Doctor Handoff

```mermaid
sequenceDiagram
    autonumber
    actor Patient as 🧑‍🦰 Patient
    participant UI as 💻 Portal UI (React 19)
    participant Voice as 🎙️ Sonam Assistant
    participant API as ⚡ Backend API
    participant Doc as 🩺 Doctor Queue

    Patient->>UI: Visits Portal / Dashboard
    alt Voice Chat Requested
        Patient->>Voice: Clicks "Talk to Sonam Now"
        Voice->>API: POST /api/cases (Create Draft Case)
        API-->>Voice: Case Created (e.g. ST-1628)
        Voice->>API: POST /api/cases/{id}/voice/sessions
        API-->>Voice: Session Initialized
        Voice->>Patient: Plays Multilingual Greeting (Odia/Hindi/EN)
        loop Multi-Turn Symptom Conversation
            Patient->>Voice: Speaks Symptoms (VAD auto-detects silence)
            Voice->>API: POST /api/cases/{id}/voice/sessions/{sid}/turns
            API-->>Voice: AI Reply + Extracted Symptoms Pills
            Voice->>Patient: Speaks Response & Re-opens Mic
        end
        Patient->>Voice: Clicks "Send to Doctor Now"
        Voice->>API: POST /api/cases/{id}/submit
        API->>Doc: Pushes Case to Doctor Queue (Status: SUBMITTED)
        API-->>Voice: Case Delivered (Case # confirmed)
        Voice->>Patient: Confirms Physician Queue Delivery
    else Phone Callback Requested
        Patient->>UI: Clicks "Get a Phone Call"
        UI->>API: POST /api/patients/callback-requests
        API-->>UI: Callback Recorded / Dispatched
        UI->>Patient: Confirmation Screen & Telephony Status
    end
```

---

### 1.2 Healthcare Worker & Doctor Clinical Review Journey

```mermaid
sequenceDiagram
    autonumber
    actor Doc as 🩺 Attending Medical Officer
    participant UI as 🖥️ Doctor Cockpit
    participant API as ⚡ Backend API
    participant DB as 🗄️ PostgreSQL

    Doc->>UI: Logs in as Healthcare Worker
    UI->>API: GET /api/cases (Filter: SUBMITTED, Order: Priority DESC)
    API-->>UI: Prioritized Triage Queue (ESI-1 to ESI-5)
    Doc->>UI: Selects Patient Case
    UI->>API: GET /api/cases/{caseId}
    API-->>UI: Case Details + Symptoms + Vitals + Evidence Citations
    
    rect rgb(240, 253, 244)
    Note over Doc,UI: Clinician Review Phase
    Doc->>UI: Inspects AI Summary, Contradiction Flags & SOP Citations
    Doc->>UI: Submits Clinical Review Note / Confirms Diagnosis
    UI->>API: POST /api/cases/{caseId}/review-notes
    end

    alt Direct Prescription / Resolution
        Doc->>UI: Finalizes Case & Issues Digital Prescription
        UI->>API: POST /api/cases/{caseId}/close
    else Requires Escalation / Specialist
        Doc->>UI: Dispatches Referral to CHC / DHH
        UI->>API: POST /api/cases/{caseId}/referrals
    else Requires Telephonic Follow-Up
        Doc->>UI: Schedules Automated Tele-Call Follow-up
        UI->>API: POST /api/cases/{caseId}/followups
    end
    API-->>Doc: Action Logged to Immutable Audit Ledger
```

---

## 2. Finite State Machines (FSM)

### 2.1 Voice Assistant Session State Machine (`AssistantState`)

```mermaid
stateDiagram-v2
    [*] --> IDLE
    
    IDLE --> CONNECTING: User clicks "Start Voice Chat"
    CONNECTING --> SPEAKING: Greeting received from server
    CONNECTING --> ERROR: Network / Database failure
    
    SPEAKING --> LISTENING: TTS speech finishes / Barge-in
    
    LISTENING --> PROCESSING: Silence detected (>1400ms) or Send clicked
    LISTENING --> ERROR: Microphone access denied
    
    PROCESSING --> SPEAKING: Turn reply received from Gemini
    PROCESSING --> COMPLETED: Case submitted to Doctor
    PROCESSING --> ERROR: Processing exception
    
    ERROR --> IDLE: User dismisses or retries
    
    SPEAKING --> COMPLETED: Session manually ended
    LISTENING --> COMPLETED: "Send to Doctor Now" clicked
    
    COMPLETED --> [*]
```

#### State Definitions:
- **`IDLE`**: Initial floating pill state; microphone is inactive.
- **`CONNECTING`**: Drafting case and acquiring public session identifier.
- **`SPEAKING`**: Audio synthesis is actively playing Sonam's response.
- **`LISTENING`**: Microphone is open, AnalyserNode evaluates RMS loudness.
- **`PROCESSING`**: Audio buffer uploaded, Gemini clinical NLP extraction active.
- **`COMPLETED`**: Intake delivered to doctor; final confirmation displayed.
- **`ERROR`**: Exception encountered (displayed with actionable fallback).

---

### 2.2 Case Lifecycle State Machine (`CaseStatus`)

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Patient / HCW initiates intake
    
    DRAFT --> SUBMITTED: Patient clicks "Send to Doctor"
    DRAFT --> CLOSED: Intake cancelled
    
    SUBMITTED --> IN_REVIEW: Doctor opens case in cockpit
    
    IN_REVIEW --> TRIAGED: Priority confirmed & review note saved
    
    TRIAGED --> CLOSED: Encounter complete / discharged
    TRIAGED --> REFERRED: Transferred to higher facility (CHC/DHH)
    
    REFERRED --> CLOSED: Referral acknowledged & resolved
    CLOSED --> [*]
```

---

### 2.3 Tele-Call Lifecycle State Machine (`CallStatus`)

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: Callback requested by patient or doctor
    
    REQUESTED --> DIALING: Telephony provider places outbound call
    REQUESTED --> CANCELLED: Request cancelled before dialing
    
    DIALING --> RINGING: Carrier reports remote handset ringing
    DIALING --> FAILED: Invalid phone number / Trunk error
    
    RINGING --> CONNECTED: Patient answers handset
    RINGING --> NO_ANSWER: Call timed out / declined
    
    CONNECTED --> COMPLETED: Dialogue concludes & data extracted
    CONNECTED --> FAILED: Call drops mid-conversation
    
    COMPLETED --> [*]
    NO_ANSWER --> [*]
    FAILED --> [*]
```

---

## 3. Emergency Red Flag Escalation Protocol

```
                        [Symptom Extracted]
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
[Cardiac / Respiratory Signs]                [Severe Pediatric / Trauma]
 • Chest pain radiating to left arm           • Lethargy with sunken eyes
 • Resting SpO2 < 90%                         • Continuous seizures
 • Severe stridor / cyanosis                  • Active arterial bleed
          │                                           │
          └─────────────────────┬─────────────────────┘
                                │
                                ▼
                     [CRITICAL RED FLAG DETECTED]
                                │
       ┌────────────────────────┴────────────────────────┐
       ▼                                                 ▼
[Patient Portal UI]                              [Doctor Review Queue]
 1. Flash High-Contrast Red Alert                 1. Escalate Case to Priority: EMERGENCY
 2. Prominent Ambulance Links:                    2. Pin Case to #1 Position in Queue
    • 112 (National Emergency)                    3. Trigger Audio Chime in Doctor Cockpit
    • 108 (State Ambulance)                       4. Highlight Immediate Life Support Protocol
 3. Supplementary Desk: 6370659934
```

---

## 4. Offline Synchronization Protocol

1. **Local Mutation**: Frontline worker submits vitals while offline $\rightarrow$ Action saved to IndexedDB table `sync_mutations` with timestamp and unique UUID.
2. **Connectivity Listener**: Window listener monitors `online` event and periodic heartbeat ping to `/api/health`.
3. **Sequential Replay**: Upon network restoration, requests are drained FIFO from IndexedDB and submitted to backend with `X-Idempotency-Key`.
4. **Conflict Resolution**: Server applies Last-Write-Wins (LWW) based on server-verified timestamps; errors are moved to the user's manual review drawer.
