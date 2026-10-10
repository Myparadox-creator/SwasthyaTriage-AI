# 🎨 UI/UX Design Brief & Tokens
## SwasthyaFlow AI — Design System, Typography, Voice UI & Accessibility

---

## 1. Brand Identity & Design Philosophy

SwasthyaFlow AI combines the **clinical precision of an institutional healthcare workstation** with the **warm, approachable ergonomics of a friendly village health companion**.

### Core Design Principles
1. **Clinical Calm & High Contrast**: A calming, professional palette built around deep healthcare teal and crisp emerald accents that reduces cognitive strain during long hospital shifts.
2. **Zero Ambiguity for Patients**: Visual elements must be instantly recognizable regardless of literacy levels or linguistic background.
3. **Voice-First Ergonomics**: Audio status (listening, thinking, speaking) must be unmistakably communicated through animated micro-interactions without relying solely on text.
4. **Institutional Accessibility**: High-contrast ratios ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large headings) compliant with WCAG 2.1 AA/AAA standards.

---

## 2. Color Palette & Design Tokens

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRIMARY BRAND PALETTE                           │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ Deep Medical Teal │ Primary 700       │ #0f766e (Main Brand & Headers) │
│ Emerald Accent    │ Success 600       │ #059669 (Status & CTAs)        │
│ Soft Teal Surface │ Teal 50           │ #f0fdfa (Cards & Active Pills) │
│ Dark Slate Navy   │ Slate 950         │ #020617 (Background Contrast)  │
│ Medical Gray Light│ Slate 50          │ #f8fafc (App Background)       │
└───────────────────┴───────────────────┴────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        CLINICAL TRIAGE TOKENS                          │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ EMERGENCY (ESI-1) │ Red 600 / Red 50  │ #dc2626 / #fef2f2 (Immediate)  │
│ URGENT (ESI-2)    │ Orange 600 / 50   │ #ea580c / #fff7ed (<15 mins)   │
│ PRIORITY (ESI-3)  │ Amber 600 / 50    │ #d97706 / #fffbeb (<60 mins)   │
│ ROUTINE (ESI-4/5) │ Emerald 600 / 50  │ #16a34a / #f0fdf4 (Standard)   │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

---

## 3. Typography & Regional Script Hierarchy

The typography stack supports multilingual scripts seamlessly across English, Hindi, and Odia:

- **Primary Latin & UI Font**: `Inter`, system `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`
- **Headings & Display**: `Outfit`, `Inter` (font weights 700, 800)
- **Odia Script**: `Noto Sans Odia`, `Kalinga`, `sans-serif`
- **Devanagari (Hindi) Script**: `Noto Sans Devanagari`, `Mangal`, `sans-serif`

### Type Scale
| Style | Size | Weight | Line Height | Tracking | Usage |
|---|---|---|---|---|---|
| **Display 1** | 2.25rem (36px) | 800 (Bold) | 1.15 | -0.025em | Landing Page Hero, Splash Title |
| **Heading 1** | 1.5rem (24px) | 700 (Bold) | 1.25 | -0.02em | Dashboard Headers, Modal Titles |
| **Heading 2** | 1.125rem (18px) | 600 (Semibold)| 1.3 | -0.01em | Section Titles, Case Cards |
| **Body Large** | 1.0rem (16px) | 400/500 | 1.5 | normal | Primary Instructions, Voice Prompts |
| **Body Base** | 0.875rem (14px) | 400/500 | 1.45 | normal | Table Rows, Clinical Summaries |
| **Caption** | 0.75rem (12px) | 500/600 | 1.4 | +0.01em | Metadata, Timestamps, Badges |
| **Micro** | 0.625rem (10px) | 700 (Bold) | 1.2 | +0.02em | ESI Level Tags, Status Badges |

---

## 4. Voice UI & Assistant Ergonomics (Sonam)

```
┌─────────────────────────────────────────────────────────────┐
│  [👩‍⚕️] Sonam AI  [Voice Intake]                     [HI] [X]│
│  Multimodal Triage · Sends Direct to Doctor                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   (Assistant)                                               │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ नमस्ते! मैं सोनम हूँ, स्वास्थ्यफ्लो एआई की एआई        │ │
│   │ स्वास्थ्य सहायक। आपको क्या समस्या हो रही है?         │ │
│   └───────────────────────────────────────────────────────┘ │
│                                                             │
│                                           (Patient)         │
│                        ┌──────────────────────────────────┐ │
│                        │ मुझे दो दिन से तेज बुखार है।      │ │
│                        └──────────────────────────────────┘ │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ 🟢 Sonam is listening... [  ▂ ▃ ▅ ▃ ▂   ]            │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Captured: [Fever: 2 days] [Severe Headache]               │
├─────────────────────────────────────────────────────────────┤
│   [🎤 Mute]  [📞 End]          [ Send to Doctor Now 🚀 ]   │
│   [ Type health message here...                       ] [>] │
└─────────────────────────────────────────────────────────────┘
```

### Visual States & Micro-Animations
1. **Floating Trigger**: Bottom-right floating badge with shimmering emerald glow (`ring-4 ring-teal-400/30`), expanding on hover.
2. **Listening State**: Glowing emerald radar ring (`animate-ping`) with dynamic audio level meter responding to mic volume.
3. **Processing State**: Smooth spinning dual-ring indicator (`Loader2 animate-spin`) reassuring the patient that their input is being evaluated.
4. **Speaking State**: Gently pulsing speaker wave icon (`Volume2 animate-pulse`) with highlighted assistant speech bubble.
5. **Symptom Pill Cascade**: Extracted symptoms appear with a subtle spring bounce (`scale-95` to `scale-100`) at the bottom of the conversation window.
6. **Doctor Handoff**: Green checkmark burst (`CheckCircle2`) displaying confirmed Case Number (e.g., `#ST-1628`).

---

## 5. Doctor & Healthcare Worker Cockpit

### Layout Principles
- **Left Panel (Triage Queue)**: Compact list ordered strictly by ESI priority. Color-coded side borders indicate urgency at a glance.
- **Center Panel (Clinical Summary)**:
  - Patient demographics & facility badge.
  - Extracted vitals banner with out-of-range alerts highlighted in red.
  - Chief complaint timeline.
  - Evidence citations linking claims to audio or OCR extracts.
- **Right Panel (Action Drawer)**:
  - Doctor review notes input.
  - Priority adjustment dropdown with mandatory clinical reasoning.
  - One-click prescription, referral, or telephonic follow-up triggers.

---

## 6. Accessibility & Touch Standards

- **Minimum Touch Targets**: All interactive buttons, voice toggles, and modal dismiss actions are sized at $\ge 44\text{px} \times 44\text{px}$ (minimum $48\text{px}$ on mobile).
- **Audio Feedback**: Text-to-speech fallback with clearly audible pitch and cadence for low-literacy patients.
- **Keyboard Navigation**: Full focus trap within voice modal, `Esc` key dismiss, and visible focus rings (`focus:ring-2 focus:ring-teal-500`).
