# SwasthyaFlow AI / SwasthyaTriage AI — Master Figma UI/UX Design Prompt

> **Project Context**: AI-assisted Multimodal Healthcare Intake & Triage Platform for India (supporting English, Hindi, and Odia).  
> **Aesthetic & Theme**: Professional clinical healthcare system with high contrast, calm palette (Medical Navy `#0F172A`, Slate `#334155`, Clinical Cyan/Teal `#0D9488`, Amber `#D97706` for alerts, Crimson `#DC2626` for emergency red flags). Modern typography, accessible touch targets, and clear role-based separation.

---

*(Sections 1–13 cover: System Overview, Design System & Tokens, Patient Voice Intake, Multilingual Speech Waveform, OCR & Lab Report Ingestion, Deterministic Safety Interruption Protocol, Healthcare Worker Triage Queue, Doctor Case Review & Provenance Viewer, Referral Management, Audit Trail & Compliance, Facility & Super Admin Dashboards, Mobile & Low-Literacy Responsive Views, and Component Library)*

---

## 14. Real-Time Role-Based Communication — Socket.IO

Design a complete real-time communication and notification experience for SwasthyaFlow AI using **Socket.IO** as the intended real-time communication technology.

The goal is to allow authorized healthcare staff to exchange encounter information, receive case updates, coordinate patient handoffs, and respond to safety escalations in real time.

This is a healthcare staff communication feature, not a general-purpose social chat application.

---

### A. Role-Based Communication

Design communication experiences tailored specifically for each clinical and administrative role:

1. **ASHA Worker / Health Worker**
   - Submit a patient encounter to the nurse or doctor queue.
   - Send additional patient-reported information.
   - Receive clarification requests from reviewing clinicians.
   - View the status of submitted encounters in real time.

2. **Triage Nurse**
   - Receive new encounter notifications instantaneously.
   - Send clarification requests directly to the assigned health worker.
   - Share reviewed intake information with the authorized doctor.
   - Notify the doctor when a case requires urgent clinical review.

3. **Doctor / Medical Officer**
   - Receive priority and safety escalation notifications.
   - Review assigned encounters with evidence provenance side-by-side.
   - Send clarification requests to nurses or health workers.
   - Share reviewer comments and referral status updates.
   - Confirm receipt of a clinical handoff.

4. **System Administrator**
   - View system-level connection status and communication errors.
   - Manage authorized users and role permissions (RBAC).
   - Access audit information according to administrator permissions.
   - *Security Rule*: Do not automatically grant access to clinical messages or encounter details merely because a user is an administrator.

---

### B. Real-Time Communication Centre

Create a dedicated **Communication Centre** accessible from the main sidebar navigation.

Design a structured three-panel desktop layout:

#### Left panel — Conversations & Queues (Width: 320px)
- **Filters/Tabs**:
  - My Conversations
  - Assigned Cases
  - Team Messages
  - Clarification Requests (with badge count)
  - Handoff Updates
  - Unread Messages filter
- **Search bar**: Search by synthetic encounter ID (`ENC-XXXX`) or authorized staff member name.
- **Conversation list items**: Display encounter ID, primary clinician/sender, last message snippet, timestamp, and unread pill.

#### Middle panel — Active Conversation (Flexible Width)
- **Header**:
  - Conversation title and assigned encounter ID tag.
  - Active participant badges (Name, Role, Online indicator).
  - Socket.IO connection status indicator (`Connected`, `Reconnecting...`, `Offline`).
  - Action buttons: `Request Clarification`, `Attach Summary`, `Mark as Acknowledged`.
- **Message Stream**:
  - Sender name, avatar, and distinct role badge (`Doctor`, `Nurse`, `ASHA`, `Admin`).
  - Formatted message bubbles with exact timestamp.
  - Read/delivered status ticks.
  - System event cards (e.g., "Safety rule triggered", "Encounter assigned to Dr. Sharma").
- **Composer**:
  - Text input area with character count and medical disclaimer.
  - Quick action pills: `Attach Encounter Summary`, `Request Vitals Clarification`, `Mark Handoff Complete`.
  - Send button with offline disabled state.

#### Right panel — Encounter Context (Width: 340px)
- **Synthetic Encounter ID**: High-visibility pill (e.g., `ENC-DEMO-1042`).
- **Workflow Status**: e.g., `IN_TRIAGE`, `PENDING_CLARIFICATION`, `DOCTOR_REVIEW`, `HANDOFF_READY`.
- **Assigned Team**: Assigned Nurse and Doctor details.
- **Safety Flags & Triage Tier**: Distinct visual treatment (e.g., Amber for moderate, Red banner for severe red flags).
- **Verified Intake Summary**: Chief concern, vitals, reported duration.
- **Pending Clarification Questions**: List of unanswered clinical clarification items.
- **Handoff Status**: Status of clinical handover and referral destination.

*Note: Enforce strict role-based visibility — only display data the authenticated user has explicit permissions to see.*

---

### C. Socket.IO Event Experience

Design intuitive UI states and animations corresponding to these real-time events:

| Event Name | UI Behavior / Visual State |
| :--- | :--- |
| `message:send` | Message appears with optimistic pending delivery status. |
| `message:new` | Real-time message bubble insertion, subtle sound/flash, unread count badge increment. |
| `message:read` | Read receipt ticks update when confirmed by the server. |
| `encounter:created` | Slide-in toast notification and instant queue list refresh. |
| `encounter:updated` | Context panel updates live without requiring page reload. |
| `encounter:assigned` | Notification to the assigned healthcare professional with quick navigation button. |
| `clarification:requested` | High-visibility amber clarification badge on case row and middle panel card. |
| `clarification:responded` | Clarification banner changes from pending to resolved with green indicator. |
| `safety:escalation` | Urgent pulsating crimson banner across top of workspace; chime audio cue. |
| `handoff:requested` | Handoff pending card requiring receiving clinician confirmation. |
| `handoff:acknowledged` | Green verified handoff badge with timestamp and receiving clinician signature. |
| `notification:new` | Bell icon badge count increment + dropdown preview. |
| `connection:status` | Subtle indicator in header (`🟢 Online`, `🟡 Reconnecting...`, `🔴 Offline - Reconnect`). |

---

### D. Notification Centre

Design both a **quick-access dropdown** in the app header and a **full-page Notification Centre** view (`/app/notifications`).

#### Notification Categories:
1. New encounter submitted
2. Encounter assigned
3. Clarification requested
4. Clarification answered
5. Safety escalation (High Priority)
6. Referral awaiting approval
7. Handoff acknowledged
8. System connection issue

#### Card Structure:
- Category icon with role color coding.
- Encounter ID tag (clickable).
- Timestamp (e.g., `2m ago`, formatted ISO).
- Priority label: `ROUTINE`, `URGENT`, `CRITICAL`.
- Short, privacy-conscious description (no patient names or sensitive medical details).
- Action button: `Review Case`, `Respond`, `View Handoff`.
- Read / Unread toggle state.

*Urgent Safety Escalation Rule*: Critical safety notifications must use a high-contrast amber/crimson background, remain pinned to the top, and require explicit acknowledgment so they are never lost.

---

### E. Example End-to-End Workflow Prototype

Create an interactive Figma prototype demonstrating this end-to-end clinical communication flow:

1. **Intake Submission**: ASHA worker submits encounter `ENC-DEMO-1042`.
2. **Real-time Alert**: Assigned nurse receives a real-time `encounter:created` toast.
3. **Clarification Needed**: Nurse opens the case, notes incomplete vitals, and triggers `clarification:requested`.
4. **Health Worker Response**: ASHA worker receives the notification on mobile/tablet, submits updated oxygen/pulse values.
5. **Context Auto-update**: Middle conversation and right context panel update live in the nurse's view.
6. **Doctor Escalation**: Nurse reviews updated information and forwards encounter to the Doctor queue.
7. **Doctor Review**: Doctor receives case notification, opens encounter context, and reviews extracted symptoms and OCR reports.
8. **Safety Interruption**: If a deterministic safety rule triggers, an urgent banner pauses routine intake and prompts priority escalation.
9. **Clinical Decision**: Doctor confirms clinical plan and initiates specialist referral.
10. **Handoff Coordination**: Receiving hospital clinician receives `handoff:requested` and clicks `handoff:acknowledged`.
11. **Immutable Audit**: The entire conversation and handoff lifecycle is automatically recorded in the case audit timeline.

*(All mockups must use synthetic demo data only).*

---

### F. Security and Privacy UI States

Design explicit, professional UI states for all edge cases:
- **Unauthorized Recipient**: Warning notice explaining the user cannot be messaged directly.
- **Insufficient Role Permissions**: Clean fallback screen explaining permission requirements.
- **Expired Session**: Inline authentication renewal modal preserving draft message text.
- **Failed Message Delivery**: Red retry icon next to the message bubble with `Retry` / `Cancel` actions.
- **Disconnected Socket.IO Connection**: Yellow warning banner at top: *"Live updates paused. Reconnecting to communication server..."*
- **Access Denied**: Clear state when a clinician attempts to view an unassigned or restricted encounter.
- **Privacy Protection**: Generic push notifications must display minimal information (e.g., *"New update for ENC-1042"*) rather than exposing clinical observations or patient names.

---

### G. Reusable UI Components in Figma

Build these components into the Figma Design System component library:
1. `Nav / CommunicationCentreItem` (with unread badge)
2. `List / ConversationItem` (states: Default, Active, Unread, Escalated)
3. `Chat / MessageBubble` (states: Sent, Received, SystemEvent, Failed)
4. `Chat / MessageComposer` (states: Normal, Disabled/Offline, Sending)
5. `Badge / RoleBadge` (`ASHA`, `Nurse`, `Doctor`, `Admin`)
6. `Status / OnlineIndicator` (`Online`, `Away`, `Offline`)
7. `Card / EncounterContext` (includes vitals, chief complaint, triage level)
8. `Card / ClarificationRequest` (states: Pending, Answered)
9. `Card / HandoffStatus` (states: Requested, Acknowledged)
10. `Toast / RealtimeNotification` (variants: Info, Warning, Urgent)
11. `Banner / UrgentSafetyEscalation`
12. `Status / SocketConnectionBar`

---

### H. Design Requirements & Visual Language

- **Design System Consistency**: Match the existing SwasthyaFlow AI healthcare theme.
- **Palette**: Medical Deep Blue (`#0F172A`), Crisp White/Slate background (`#F8FAFC`), Muted Borders (`#E2E8F0`), Clinical Teal (`#0D9488`), Amber Warning (`#F59E0B`), Emergency Red (`#EF4444`).
- **Tone**: Functional, calm, high legibility, and distraction-free.
- **Layouts**: Responsive breakpoints for Desktop (3-panel, 1440px), Tablet (collapsible panels, 1024px), and Mobile (tabbed view for ASHA workers in the field, 375px).
- **Separation of Concerns**: Strict visual distinction between **staff-to-staff clinical coordination** and **patient-facing AI voice intake**.

---

## 15. Offline-First Rural Healthcare Experience & Resilient Fallback Communication

Design a comprehensive **offline-first and resilient communication experience** for SwasthyaFlow AI, specifically tailored for rural Indian villages, sub-centres, remote Primary Health Centres (PHCs), low-connectivity hilly/tribal areas, and community health camps.

This design acknowledges the reality of intermittent or absent rural cellular internet, ensuring patient care and triage documentation never stall while upholding strict medical safety protocols.

---

### A. Fallback Communication Modality Matrix (When Internet is Unavailable)

| Channel | Availability Condition | Data Transmitted | Privacy & Safety Guardrail | Figma UX Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Encrypted Offline Queue (Must-Have)** | Zero connectivity / Airplane mode | Symptoms, triage form, consent, vitals, structured notes | Stored encrypted in local browser storage (IndexedDB/PWA); expires after retention threshold | Status pill: `⚠️ Saved on this device — Not sent to hospital`. Explicit `Pending Sync Queue` screen. |
| **Option B: Cellular SMS Fallback** | Cellular 2G/GSM active, No packet data | Minimal alert token only (e.g. `New encounter pending. Ref: ENC-1042. Priority: URGENT`) | **Zero sensitive clinical data, names, or OCR images in SMS.** Minimal synthetic ID only. | SMS trigger button with preview modal: *"Send minimal dispatch alert to PHC on-duty phone?"* |
| **Option C: Direct Cellular Voice Call** | Cellular voice active, No data | Real-time verbal report from ASHA to PHC Medical Officer | Follows facility emergency escalation SOP; does not wait for digital triage | Quick-action button: `Call On-Duty Medical Officer (108 / PHC Hotline)`. |
| **Option D: Local Mesh / Device-to-Device (Future)** | Local Wi-Fi / Bluetooth peer | Encrypted package handoff to health worker vehicle or PHC hub | Authenticated device pairing; mutual encryption | Displayed in prototype as *"Peer Device Relay (Coming Soon)"*. |

---

### B. Architecture: Socket.IO Integration with Offline-First Queue

```
[ ASHA Worker PWA in Rural Sub-Centre ]
     │
     ▼
[ Connectivity Manager ] 
     ├── ONLINE  ──► HTTPS REST API + Socket.IO Gateway ──► Real-Time Server (Doctor/Nurse notified instantly)
     └── OFFLINE ──► AES-256 Encrypted IndexedDB Queue ──► Status: "Pending Sync"
                          │
                          ├── SMS Minimal Alert (if 2G GSM available)
                          └── Cellular Phone Call Fallback (if urgent/emergency)
```

#### Core Implementation & Protocol Rules:
1. **Idempotency & Collision Prevention**: Every offline encounter generates a cryptographically random client UUID (`ENC-LOCAL-XXXX`) and idempotency key so repeat synchronization attempts never create duplicate records.
2. **Deterministic Confirmation**: A case is marked `Synced` (Green) **only** after the backend returns a 201 Created/200 OK with the permanent server encounter ID and audit signature.
3. **No Fake Offline AI**: Never claim that server-grade LLM triage, cloud OCR, or remote voice recognition ran offline. The UI must explicitly state: *"Recorded offline — Preliminary structuring and doctor review will occur upon synchronization."*
4. **Primary Medical Safety Rule**: **Never wait for internet synchronization if the patient has red-flag emergency symptoms.** The offline interface must immediately display: *"Hospital has not received this case. Immediate in-person medical attention or ambulance dispatch required."*

---

### C. Figma UI/UX Screens & Interaction States

Design the following screens and interaction flows:

#### 1. Global Connectivity Status Header Bar
- **5 States**:
  - `🟢 Online` (Full Socket.IO active)
  - `🟡 Weak Connection` (Low bandwidth mode active; media uploads deferred)
  - `🟠 Syncing... (3 cases pending)` (Active animated upload indicator)
  - `🔴 Offline` (Local queue active)
  - `❌ Sync Failed` (Actionable retry button)
- **Metadata**: Shows *"Last synced: Today, 10:42 AM at Rampur Sub-Centre"*.
- **Channels Indicator**: Separate sub-icons showing `Data: Disconnected`, `GSM/SMS: 3 Bars`, `Voice: Available`.

#### 2. Offline Patient Intake Experience
- **Form Interactivity**: Full offline operation of intake questionnaires, vitals input, consent acceptance, and localized voice audio recording.
- **Top Notice Banner**: High-contrast slate/amber badge:
  > *"⚠️ Offline Mode: Data will be stored securely on this tablet and uploaded when network is available."*
- **Action Button**: `Save to Offline Queue` (instead of `Submit to Hospital Queue`).
- **Confirmation Modal**: Displays synthetic local ID (e.g. `ENC-OFFLINE-7801`) and reminder that hospital review is pending.

#### 3. Dedicated Pending Sync Queue (`/app/sync-queue`)
- **Queue Overview**:
  - Total items pending, total synced today, storage used (e.g., `4.2 MB / 50 MB`).
  - `Sync All Now` primary action button.
- **Encounter Sync Cards**:
  - Encounter ID, patient age/gender initials, recorded timestamp, priority tier (`Routine`, `Urgent`, `Critical`).
  - Attachment badges (e.g., `Audio: 1.2MB`, `Vitals: OK`).
  - State pill: `Waiting for Network`, `Uploading (45%)`, `Sync Complete`, `Error: Connection Timeout`.
  - Inline retry action button.

#### 4. Rural Communication Fallback Drawer / Modal
- Appears when user taps **"Offline Communication Options"**:
  - **Option 1 — Send Minimal SMS Alert**: Generates non-sensitive template: *"ASHA Sunita submitted ENC-7801 at Rampur. Status: Urgent. Please check queue upon sync."*
  - **Option 2 — Direct Voice Call**: One-tap call button dialing PHC emergency triage desk.
  - **Option 3 — Emergency 108/112 Escalation**: High-contrast emergency dispatch shortcut.

#### 5. Role-Based Synchronization & Reconnection Animation
- When the device transitions from `Offline` to `Online`:
  1. Top bar smoothly transitions from red to amber (`Syncing 2 encounters...`).
  2. Background batch upload with progress bar.
  3. Server assigns permanent `ENC-2026-XXXX` IDs.
  4. Instant Socket.IO event `encounter:created` fires to the assigned on-duty Nurse and Doctor dashboard.
  5. Notification toast on ASHA tablet: *"2 encounters successfully transferred to PHC Medical Team"*.

#### 6. Urgent Offline Safety Escalation Screen
- If red-flag symptoms are recorded offline (e.g. severe chest pain, postpartum hemorrhage, unresponsiveness):
  - Screen shifts to a high-contrast crimson emergency border.
  - Bold alert text: **"CRITICAL SAFETY WARNING — REMOTE DOCTOR NOT NOTIFIED"**.
  - Instruction: *"Do not wait for internet connection. Follow emergency protocol immediately. Call ambulance (108) or transport patient to nearest Community Health Centre."*
  - Prominent emergency call action button.

#### 7. Low-Bandwidth Optimizations
- **Text-First Prioritization**: Vitals, structured symptom checkboxes, and text descriptions sync immediately; heavy voice audio recordings and report camera photos stay queued until steady 4G/Wi-Fi is detected.
- **Visual Progress & Resumable Uploads**: Progress indicator per attachment with pause/resume capability.

---

### D. Reusable Figma Design System Components for Offline UI

Add these reusable components to the Figma library:
1. `Bar / NetworkConnectivityHeader` (variants: Online, Weak, Offline, Syncing, Error)
2. `Banner / OfflineLocalWarning` (`"Saved locally — Not sent to hospital"`)
3. `Modal / PendingSyncQueue`
4. `Card / PendingSyncEncounterCard` (states: Queued, Syncing, Synced, Failed)
5. `Button / SyncNowButton` (with spinning refresh animation)
6. `Card / MultiChannelStatus` (shows Internet Data, Cellular SMS, Cellular Voice)
7. `Modal / FallbackCommunication` (SMS dispatcher, Direct call trigger)
8. `Banner / OfflineEmergencyEscalation` (High-visibility red warning banner)
9. `Pill / SyncStateBadge` (`Pending`, `Syncing`, `Success`, `Conflict`)

---

### E. Practical Hackathon Implementation Recommendation

For high-impact hackathon presentation and clinical evaluation:
1. **Interactive Demo Priority 1**: Offline Patient Intake with local IndexedDB storage banner.
2. **Interactive Demo Priority 2**: Clickable Pending Sync Queue showing `Sync Now` triggering simulated network recovery.
3. **Interactive Demo Priority 3**: Seamless transition to Socket.IO real-time notification on the Doctor/Nurse dashboard once synced.
4. **Interactive Demo Priority 4**: Rural SMS & Voice Call fallback modal proving field feasibility in Indian healthcare setups.

