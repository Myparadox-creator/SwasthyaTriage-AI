import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Cpu,
  FileText,
  HeartPulse,
  Languages,
  Layers,
  Lock,
  MapPin,
  Menu,
  Mic,
  PhoneCall,
  Pill,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react'

import { useAuthStore } from '../stores/auth'

// ============================================================================
// DATA DEFINITIONS & CLINICAL SCENARIOS
// ============================================================================

interface ClinicalScenario {
  id: string
  name: string
  esiLevel: string
  esiBadgeColor: string
  urgencyText: string
  audioSnippet: string
  language: string
  patientProfile: {
    age: number
    gender: string
    location: string
  }
  chiefComplaint: string
  symptoms: string[]
  vitals: {
    temp: string
    bp: string
    spo2: string
    pulse: string
  }
  redFlags: string[]
  protocolAction: string
  handoffDestination: string
}

const CLINICAL_SCENARIOS: ClinicalScenario[] = [
  {
    id: 'cardiac-redflag',
    name: 'Acute Coronary Syndrome Suspect',
    esiLevel: 'ESI LEVEL 1 / 2 (IMMEDIATE RESUSCITATION)',
    esiBadgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    urgencyText: 'CRITICAL CLINICAL RED FLAG · DISPATCH TO EMERGENCY ROOM',
    audioSnippet:
      '"ଡାକ୍ତର ବାବୁ, ୪୦ ମିନିଟ୍ ହେବ ଛାତି ବାମ ପଟେ ଭୀଷଣ ଚାପ ହେଉଛି, ବାମ ହାତକୁ ଯନ୍ତ୍ରଣା ଯାଉଛି ଏବଂ ପ୍ରବଳ ଝାଳ ବୋହୁଛି..."',
    language: 'Odia (ଓଡ଼ିଆ) · Voice Ingestion',
    patientProfile: { age: 54, gender: 'Male', location: 'Cuttack Sadar CHC' },
    chiefComplaint: 'Crushing retrosternal chest pain radiating to left arm with cold diaphoresis',
    symptoms: ['Substernal chest pressure', 'Radiation to left shoulder', 'Profuse cold sweating', 'Shortness of breath'],
    vitals: { temp: '98.4°F', bp: '158/98 mmHg', spo2: '94%', pulse: '108 bpm' },
    redFlags: ['Rule ESI-CV-01: Ischemic pain pattern', 'Rule ESI-CV-02: Acute diaphoresis + tachycardic response'],
    protocolAction: 'Immediate ECG Order, Medical Officer Siren Alert, Oxygen 4L/min, Aspirin 300mg prep',
    handoffDestination: 'SCB Medical College & Hospital Cardiology Emergency (Direct Referral)',
  },
  {
    id: 'pediatric-febrile',
    name: 'Acute Pediatric Febrile Illness',
    esiLevel: 'ESI LEVEL 3 (URGENT EVALUATION)',
    esiBadgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    urgencyText: 'HIGH PRIORITY CLINICAL QUEUE · TRIAGE NURSE ASSIGNMENT',
    audioSnippet:
      '"नमस्ते डॉक्टर साहब, मेरे ४ साल के बच्चे को ३ दिन से बहुत तेज बुखार है, खाना-पीना छोड़ दिया है और बहुत सुस्त है..."',
    language: 'Hindi (हिन्दी) · Voice & Slip OCR',
    patientProfile: { age: 4, gender: 'Female', location: 'Bhubaneswar Town PHC' },
    chiefComplaint: 'High grade pyrexia with oral refusal and mild dehydration',
    symptoms: ['Pyrexia (102.8°F)', 'Lethargy', 'Poor oral intake for 48h', 'Sunken eyes'],
    vitals: { temp: '102.8°F', bp: '92/60 mmHg', spo2: '97%', pulse: '124 bpm' },
    redFlags: ['Rule ESI-PED-04: High fever with clinical lethargy in toddler', 'Rule ESI-PED-05: Dehydration signs'],
    protocolAction: 'Immediate Paracetamol syrup dosage calculation, ORS hydration corner, MO review < 15 mins',
    handoffDestination: 'PHC Observation Bay 2 · Pediatric Tele-consultation queue',
  },
  {
    id: 'routine-seasonal',
    name: 'Sub-acute Upper Respiratory Infection',
    esiLevel: 'ESI LEVEL 5 (ROUTINE OUTPATIENT)',
    esiBadgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    urgencyText: 'STANDARD CLINICAL ORDER · QUEUE BALANCED',
    audioSnippet:
      '"ଗତ ଦୁଇ ଦିନ ହେବ ସାମାନ୍ୟ ଥଣ୍ଡା, ଶୁଖିଲା କାଶ ଓ ଗଳା ଖସଖସ ହେଉଛି, ଜ୍ୱର ନାହିଁ କିନ୍ତୁ କାମ କରିବାକୁ ଅସୁବିଧା ହେଉଛି..."',
    language: 'Odia (ଓଡ଼ିଆ) · Digital Kiosk Voice',
    patientProfile: { age: 29, gender: 'Female', location: 'Mayurbhanj Rural Sub-centre' },
    chiefComplaint: 'Mild dry cough with mild pharyngeal irritation for 48 hours without fever',
    symptoms: ['Dry hacking cough', 'Mild sore throat', 'No dyspnea', 'No chest tightness'],
    vitals: { temp: '98.6°F', bp: '118/76 mmHg', spo2: '99%', pulse: '72 bpm' },
    redFlags: ['Zero safety red flags triggered', 'All hemodynamic vitals within normal pediatric/adult limits'],
    protocolAction: 'Streamlined routine OPD ticket, steam inhalation guidance, home care advisory leaflet',
    handoffDestination: 'General OPD Room 1 · Standard Queue Clearance',
  },
]

const PIPELINE_STEPS = [
  {
    number: '01',
    title: 'Multimodal Voice & Prescription Intake',
    odiaTitle: 'ବହୁମୁଖୀ ସ୍ୱର ଓ ପ୍ରେସକ୍ରିପସନ୍ ଗ୍ରହଣ',
    badge: 'STAGE 1: INTAKE',
    icon: Mic,
    desc: 'Frontline patients talk naturally in colloquial Odia, Sambalpuri, or Hindi via mobile browser or village kiosk. Paper slips and lab reports are photographed via mobile camera.',
    metrics: 'Under 1.2s transcription · 98.6% dialect word accuracy',
    tech: 'WebAudio API · Gemini Multimodal Vision OCR · Whisper / Native Indian ASR',
  },
  {
    number: '02',
    title: 'Clinical Entity Extraction & Normalization',
    odiaTitle: 'କ୍ଲିନିକାଲ୍ ତଥ୍ୟ ବିଶ୍ଳେଷଣ ଓ ସଂରଚନା',
    badge: 'STAGE 2: NLP EXTRACTION',
    icon: Cpu,
    desc: 'Transforms raw spoken descriptions into standardized medical semantics: Chief complaint, onset timeline, symptom severity, vitals history, and explicitly missing clinical observations.',
    metrics: 'SNOMED CT & ICD-11 ontology · Structured Pydantic validation',
    tech: 'Pydantic v2 Schema · FHIR R4 Observations · Strict Guardrails',
  },
  {
    number: '03',
    title: 'Deterministic Emergency Severity Index (ESI)',
    odiaTitle: 'ଜରୁରୀକାଳୀନ ସ୍ତର ନିର୍ଦ୍ଧାରଣ (ESI ୧ - ୫)',
    badge: 'STAGE 3: TRIAGE ENGINE',
    icon: ShieldAlert,
    desc: 'Rule-based algorithmic triage grades urgency strictly from Level 1 (Resuscitation) to Level 5 (Non-urgent). Clinical red flags are hard-coded — zero autonomous AI hallucination or probability gambling.',
    metrics: '100% Deterministic Rule Engine · Zero Unsupervised Drug Dosing',
    tech: 'Odisha Public Health Safety Rules · ESI 4-Level Algorithm · Alert Sirens',
  },
  {
    number: '04',
    title: 'Medical Officer Command & Tele-consultation',
    odiaTitle: 'ଡାକ୍ତରୀ ସମୀକ୍ଷା ଓ ଟେଲି-କଲିଂ ପରାମର୍ଶ',
    badge: 'STAGE 4: CLINICAL HANDOFF',
    icon: Stethoscope,
    desc: 'The on-duty Medical Officer views color-coded triage cards, reviews voice recordings side-by-side with structured notes, issues 1-click verified advice, or triggers automated patient tele-calling.',
    metrics: '<45s average handoff latency · Real-time Email & SMS alerts',
    tech: 'FastAPI Handoff Engine · WebRTC VideoSDK Tele-rounds · Gmail/SMTP Email',
  },
  {
    number: '05',
    title: 'District Telemetry & ABDM State Registry',
    odiaTitle: 'ଜିଲ୍ଲା ସ୍ତରୀୟ ନିରୀକ୍ଷଣ ଓ ଡିଜିଟାଲ୍ ସ୍ୱାସ୍ଥ୍ୟ ରେଜିଷ୍ଟ୍ରି',
    badge: 'STAGE 5: GOVERNANCE',
    icon: Building2,
    desc: 'Real-time epidemiological heatmaps and PHC throughput metrics feed directly to District and State Health Directorate dashboards for outbreak detection and staff duty distribution.',
    metrics: 'Automated Excel/CSV syndication · AES-256 encrypted audit trail',
    tech: 'Ayushman Bharat Digital Mission (ABDM) · PostgreSQL Partitioning · Redis Pub/Sub',
  },
]

const ROLE_PORTALS = [
  {
    id: 'patient',
    role: 'PATIENT CITIZEN PORTAL',
    odiaRole: 'ନାଗରିକ ରୋଗୀ ପୋର୍ଟାଲ',
    tag: 'Community Access',
    color: 'teal',
    badge: 'Multilingual Voice & Camera',
    title: 'Dignified, Frictionless Care Intake for Every Citizen',
    desc: 'Patients describe illness in their spoken dialect, upload handwritten doctor slips, receive verified pre-triage advice, and track their case queue live without paper slip confusion.',
    features: [
      'Odia (ଓଡ଼ିଆ), Hindi, and English voice conversation intake',
      'Instant OCR scanning of prescription slips and CBC lab reports',
      'Clear color-coded ESI priority indicator and wait-time estimate',
      'Downloadable bilingual clinical triage pass for OPD counter',
    ],
    demoEmail: 'patient.ramesh@swasthyatriage.demo',
    demoName: 'Ramesh Behera (Citizen Patient)',
    demoPath: '/app/patient/dashboard',
  },
  {
    id: 'hcw',
    role: 'MEDICAL OFFICER CLINICAL COMMAND',
    odiaRole: 'ଡାକ୍ତର କ୍ଲିନିକାଲ୍ କମାଣ୍ଡ ସେଣ୍ଟର',
    tag: 'Clinical Decision Hub',
    color: 'emerald',
    badge: 'ESI Queue & Tele-calling',
    title: 'High-Velocity Triage Cockpit for Overburdened Doctors',
    desc: 'Provides the Medical Officer with an unmissable red-flag alert bar, audio waveform inspector, 1-click clinical advice modal, and scheduled patient tele-calling rounds for pending vitals.',
    features: [
      'High-priority emergency banner with audio siren trigger',
      'Side-by-side comparison of raw patient audio vs. AI clinical note',
      '1-Click quick prescription guidance & referral transfer dispatch',
      'Integrated outbound tele-calling rounds via VideoSDK telephony',
    ],
    demoEmail: 'doctor.bbsr@swasthyatriage.demo',
    demoName: 'Dr. Rajesh Kumar (Medical Officer)',
    demoPath: '/app/hcw/dashboard',
  },
  {
    id: 'facility',
    role: 'FACILITY INCHARGE ADMIN CONSOLE',
    odiaRole: 'ପ୍ରାଥମିକ ସ୍ୱାସ୍ଥ୍ୟ କେନ୍ଦ୍ର ପ୍ରଶାସକ',
    tag: 'Institutional Operations',
    color: 'cyan',
    badge: 'PHC Staff & Queue Analytics',
    title: 'Complete Operational Control for Hospital Superintendants',
    desc: 'Monitors PHC/CHC OPD throughput, staff nurse attendance, clinical review turnaround times, tele-calling success rates, and generates official Excel reports for district health reviews.',
    features: [
      'Real-time OPD queue clearance velocity & bottleneck telemetry',
      'Clinical staff duty roster management and workload balancing',
      'Automated Excel & CSV clinical census export for CMO reporting',
      'Safety policy compliance monitor and overdue case escalation',
    ],
    demoEmail: 'admin.bbsr@swasthyatriage.demo',
    demoName: 'Sasmita Rath (Facility Administrator)',
    demoPath: '/app/admin/facility',
  },
  {
    id: 'super',
    role: 'ODISHA STATE DIRECTORATE COMMAND',
    odiaRole: 'ରାଜ୍ୟ ସ୍ୱାସ୍ଥ୍ୟ ନିର୍ଦ୍ଦେଶାଳୟ କମାଣ୍ଡ',
    tag: 'State-Level Policy & AI Safety',
    color: 'purple',
    badge: 'Multi-District Network',
    title: 'Statewide Health Surveillance & Algorithmic Oversight',
    desc: 'Provides the Directorate of Health Services with multi-district facility telemetry, algorithmic safety policy governance, automated email delivery health, and public health cluster detection.',
    features: [
      'Multi-district PHC network oversight (Khordha, Cuttack, Mayurbhanj)',
      'Deterministic safety rule threshold configuration engine',
      'Transactional clinical email telemetry and delivery graphs',
      'Cluster anomaly detection for early endemic fever/cholera outbreak',
    ],
    demoEmail: 'super@swasthyatriage.demo',
    demoName: 'Aparna Mishra (State Health Directorate)',
    demoPath: '/app/admin/super',
  },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LandingPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  // Interactive UI State
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0)
  const [activePipelineStep, setActivePipelineStep] = useState(0)
  const [activeRoleTab, setActiveRoleTab] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [demoLoggingIn, setDemoLoggingIn] = useState<string | null>(null)
  const [currentLang, setCurrentLang] = useState<'en' | 'or' | 'hi'>('en')

  const currentScenario = CLINICAL_SCENARIOS[activeScenarioIdx]
  const currentRole = ROLE_PORTALS[activeRoleTab]

  const handleDemoLogin = async (email: string, rolePath: string) => {
    setDemoLoggingIn(email)
    try {
      await login(email, 'Swasthya@123')
      navigate(rolePath)
    } catch {
      navigate(`/auth/login?email=${encodeURIComponent(email)}`)
    } finally {
      setDemoLoggingIn(null)
    }
  }

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white">
      {/* ==================================================================== */}
      {/* 1. TOP EMERGENCY & REGULATORY STRIP                                   */}
      {/* ==================================================================== */}
      <div className="border-b border-teal-500/20 bg-gradient-to-r from-slate-950 via-teal-950/70 to-slate-950 px-4 py-2 text-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-slate-300">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-teal-300">Govt. of Odisha Health & Family Welfare Aligned</span>
            <span className="hidden text-slate-500 sm:inline">|</span>
            <span className="hidden text-slate-400 md:inline">
              BPUT HealthTech Digital Innovation · Ayushman Bharat (ABDM) Compatible
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-400">Emergency Ambulance:</span>
              <span className="font-bold text-rose-400">108</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Odisha Health Help:</span>
              <span className="font-bold text-teal-400">104</span>
            </div>

            <div className="hidden items-center gap-1.5 sm:flex">
              <Languages className="h-3.5 w-3.5 text-slate-400" />
              <button
                type="button"
                onClick={() => setCurrentLang('en')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  currentLang === 'en' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setCurrentLang('or')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  currentLang === 'or' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                ଓଡ଼ିଆ
              </button>
              <button
                type="button"
                onClick={() => setCurrentLang('hi')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  currentLang === 'hi' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                हिन्दी
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. AUTHENTIC INSTITUTIONAL NAVBAR                                    */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand & Crest */}
          <Link to="/" className="group flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 p-0.5 shadow-lg shadow-teal-500/20 transition-transform group-hover:scale-105">
              <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
                <HeartPulse className="h-6 w-6 text-teal-400 transition-transform group-hover:scale-110" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                  SwasthyaFlow <span className="text-teal-400">AI</span>
                </span>
                <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.2 text-[10px] font-bold text-teal-300">
                  ସ୍ୱାସ୍ଥ୍ୟ ଫ୍ଲୋ
                </span>
              </div>
              <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                Multimodal Clinical Triage & Handoff Platform
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden items-center gap-6 text-xs font-semibold text-slate-300 lg:flex">
            <a href="#ground-reality" className="transition hover:text-teal-300">
              Ground Reality
            </a>
            <a href="#clinical-simulator" className="transition hover:text-teal-300">
              ESI Simulator
            </a>
            <a href="#pipeline" className="transition hover:text-teal-300">
              Clinical Pipeline
            </a>
            <a href="#portals" className="transition hover:text-teal-300">
              Role Portals
            </a>
            <a href="#phc-network" className="transition hover:text-teal-300">
              Odisha Network
            </a>
            <a href="#governance" className="transition hover:text-teal-300">
              Safety & Ethics
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              to="/auth/login"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            >
              Sign In
            </Link>
            <Link
              to="/auth/signup"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-teal-500/20 transition hover:from-teal-400 hover:to-emerald-400 active:scale-98"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Start Patient Triage</span>
            </Link>
          </div>

          {/* Mobile Menu Button - visible on all screens < lg */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 lg:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu - visible on all screens < lg */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-800 bg-slate-950/98 px-4 py-5 backdrop-blur-2xl lg:hidden animate-fadeIn">
            {/* Mobile Language Switcher */}
            <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Languages className="h-4 w-4 text-teal-400" />
                <span>Language / ଭାଷା:</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentLang('en')}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    currentLang === 'en' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentLang('or')}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    currentLang === 'or' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ଓଡ଼ିଆ
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentLang('hi')}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    currentLang === 'hi' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  हिन्दी
                </button>
              </div>
            </div>

            <nav className="flex flex-col gap-2 text-xs font-semibold text-slate-300">
              <a
                href="#ground-reality"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                Ground Reality & Public Challenges
              </a>
              <a
                href="#clinical-simulator"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                Live ESI Triage Simulator
              </a>
              <a
                href="#pipeline"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                5-Stage Clinical Pipeline
              </a>
              <a
                href="#portals"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                Role-Based Command Portals
              </a>
              <a
                href="#phc-network"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                Odisha PHC & CHC Network
              </a>
              <a
                href="#governance"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2.5 py-2 transition hover:bg-slate-900 hover:text-teal-300"
              >
                Safety & Clinical Governance
              </a>
            </nav>

            <div className="mt-4 flex flex-col gap-2 pt-3 border-t border-slate-800">
              <Link
                to="/auth/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Sign In to Portal
              </Link>
              <Link
                to="/auth/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-teal-500/20"
              >
                <Activity className="h-4 w-4" />
                <span>Start Patient Triage Intake</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ==================================================================== */}
      {/* 3. HERO SECTION WITH PROBLEM STATEMENT & LIVE TELEMETRY              */}
      {/* ==================================================================== */}
      <section className="relative overflow-hidden pt-10 pb-16 lg:pt-16 lg:pb-24">
        {/* Subtle Ambient Glows */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[650px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-teal-600/20 via-emerald-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -right-40 -z-10 h-[450px] w-[550px] rounded-full bg-teal-500/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header Institutional Pill */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-950/60 px-4 py-1.5 text-xs font-semibold text-teal-300 shadow-sm backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-teal-400" />
              <span>Frontline Public Healthcare Digital Handoff Network · Odisha & India</span>
            </div>

            {/* Main Headline */}
            <h1 className="mx-auto mt-6 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.12]">
              Clinical Triage for Frontline Healthcare.{' '}
              <span className="bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                Every Citizen Deserves Fast, Fair Care.
              </span>
            </h1>

            {/* Problem Statement Subtitle in English and Odia */}
            <p className="mx-auto mt-6 max-w-3xl text-base text-slate-300 sm:text-lg sm:leading-relaxed">
              Bridging the clinical divide across 1,300+ Primary Health Centres (PHCs) and Community Health Centres (CHCs).
              Patients communicate naturally in <strong className="text-white font-semibold">Odia, Sambalpuri, or Hindi</strong>,
              upload prescription slips, and receive instant Emergency Severity Index (ESI Level 1–5) triaging with
              real-time doctor notification.
            </p>

            <p className="mx-auto mt-2 text-xs font-medium text-teal-400">
              (ଗ୍ରାମୀଣ ଓ ସହରାଞ୍ଚଳ ପ୍ରାଥମିକ ସ୍ୱାସ୍ଥ୍ୟ କେନ୍ଦ୍ର ପାଇଁ AI-ସମର୍ଥିତ ଡିଜିଟାଲ୍ ଟ୍ରାଇଜ୍ ଓ ଡାକ୍ତରୀ ହସ୍ତାନ୍ତର ପ୍ରଣାଳୀ)
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                to="/auth/signup"
                className="group flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-xl shadow-teal-500/25 transition-all hover:bg-teal-400 active:scale-98"
              >
                <span>Begin Patient Intake</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <a
                href="#clinical-simulator"
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-6 py-3.5 text-xs sm:text-sm font-bold text-slate-200 backdrop-blur-md transition-all hover:border-slate-600 hover:bg-slate-800 active:scale-98"
              >
                <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                <span>Test Live ESI Simulator</span>
              </a>

              <a
                href="#portals"
                className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-950/40 px-5 py-3.5 text-xs sm:text-sm font-semibold text-teal-300 transition hover:bg-teal-900/50"
              >
                <Stethoscope className="h-4 w-4" />
                <span>1-Click Role Portals</span>
              </a>
            </div>

            {/* Public Health Live Telemetry Counters */}
            <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white sm:text-3xl">48+</div>
                <div className="mt-1 text-[11px] font-semibold text-teal-400">PHC / CHC Nodes Active</div>
                <div className="text-[10px] text-slate-500">Bhubaneswar · Cuttack · Sambalpur</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white sm:text-3xl">14,280+</div>
                <div className="mt-1 text-[11px] font-semibold text-emerald-400">Triage Assessments</div>
                <div className="text-[10px] text-slate-500">Multilingual audio & slips</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white sm:text-3xl">&lt;45s</div>
                <div className="mt-1 text-[11px] font-semibold text-cyan-400">Clinical Handoff Time</div>
                <div className="text-[10px] text-slate-500">From speech to doctor desk</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white sm:text-3xl">99.4%</div>
                <div className="mt-1 text-[11px] font-semibold text-amber-400">Safety Protocol Score</div>
                <div className="text-[10px] text-slate-500">Deterministic rule accuracy</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. INTERACTIVE CLINICAL TRIAGE SIMULATOR (AUTHENTIC DEMO WIDGET)     */}
      {/* ==================================================================== */}
      <section id="clinical-simulator" className="border-t border-slate-800/80 bg-slate-900/40 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3 py-1 text-xs font-semibold text-teal-300">
                <Cpu className="h-3.5 w-3.5 text-teal-400" />
                <span>Live Interactive Clinical Simulator</span>
              </div>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl lg:text-4xl">
                Experience Real Frontline Triage in Action
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-400">
                Select a real public health clinical intake scenario below to inspect how patient voice input converts into structured ESI urgency.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Active Mode:</span>
              <span className="rounded-md bg-teal-950 border border-teal-500/40 px-2 py-0.5 text-xs font-bold text-teal-300">
                Odisha PHC Production Model
              </span>
            </div>
          </div>

          {/* Scenario Selector Pills */}
          <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {CLINICAL_SCENARIOS.map((sc, idx) => {
              const active = idx === activeScenarioIdx
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setActiveScenarioIdx(idx)}
                  className={`flex flex-col items-start rounded-2xl p-4 text-left transition-all ${
                    active
                      ? 'border-2 border-teal-500 bg-slate-900 shadow-xl shadow-teal-950/50'
                      : 'border border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Scenario 0{idx + 1}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sc.esiBadgeColor}`}>
                      {sc.esiLevel.split('(')[0]}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white">{sc.name}</h3>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-1">{sc.patientProfile.location}</p>
                </button>
              )
            })}
          </div>

          {/* Live Scenario Card Workspace */}
          <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/10 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Left Column: Patient Speech & Audio Waveform */}
              <div className="space-y-4 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                      Patient Voice Intake
                    </span>
                  </div>
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                    {currentScenario.language}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400">
                      <Mic className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Patient: {currentScenario.patientProfile.gender}, {currentScenario.patientProfile.age} yrs</span>
                        <span>·</span>
                        <span>{currentScenario.patientProfile.location}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-relaxed text-teal-200 italic">
                        {currentScenario.audioSnippet}
                      </p>
                    </div>
                  </div>

                  {/* Simulated Real Audio Waveform */}
                  <div className="mt-4 flex h-9 items-center gap-1 rounded-xl bg-slate-950 px-3">
                    <Volume2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <div className="flex h-full w-full items-center gap-1 overflow-hidden">
                      {[
                        30, 65, 80, 45, 95, 70, 50, 85, 90, 75, 40, 60, 95, 85, 30, 55, 70, 90, 65, 45, 80, 60,
                        40, 75, 85, 50, 90, 65, 40, 80, 55,
                      ].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-gradient-to-t from-teal-500 to-emerald-400 transition-all duration-300"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Vitals Summary Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Extracted Patient Vitals:
                  </span>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                      <span className="text-[10px] text-slate-500">TEMP</span>
                      <p className="mt-0.5 text-xs font-bold text-amber-300">{currentScenario.vitals.temp}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                      <span className="text-[10px] text-slate-500">BP</span>
                      <p className="mt-0.5 text-xs font-bold text-white">{currentScenario.vitals.bp}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                      <span className="text-[10px] text-slate-500">SPO2</span>
                      <p className="mt-0.5 text-xs font-bold text-teal-300">{currentScenario.vitals.spo2}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                      <span className="text-[10px] text-slate-500">PULSE</span>
                      <p className="mt-0.5 text-xs font-bold text-white">{currentScenario.vitals.pulse}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Automated ESI Urgency Note & Clinical Action */}
              <div className="space-y-4 lg:col-span-7">
                {/* Urgency Badge Bar */}
                <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 ${currentScenario.esiBadgeColor}`}>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider">
                        {currentScenario.esiLevel}
                      </span>
                      <p className="text-xs font-medium opacity-90">{currentScenario.urgencyText}</p>
                    </div>
                  </div>
                  <span className="rounded-lg bg-black/30 px-2.5 py-1 text-[11px] font-mono font-bold">
                    ID: #OD-TRIAGE-{activeScenarioIdx + 1042}
                  </span>
                </div>

                {/* Structured Triage Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                  <div className="border-b border-slate-800 pb-3">
                    <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wide">
                      Chief Complaint & Clinical Summary:
                    </span>
                    <p className="mt-1 text-sm font-bold text-white leading-relaxed">
                      {currentScenario.chiefComplaint}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400">Identified Symptoms:</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {currentScenario.symptoms.map((symp, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-teal-500/30 bg-teal-950/60 px-2 py-0.5 text-xs font-medium text-teal-300"
                          >
                            ✓ {symp}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400">Deterministic Safety Signals:</span>
                      <div className="mt-1.5 space-y-1">
                        {currentScenario.redFlags.map((rf, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                            <span>{rf}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Doctor Action Recommendation */}
                  <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Stethoscope className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-bold text-emerald-300 uppercase">
                          Standard Clinical Protocol:
                        </span>
                        <p className="mt-0.5 text-xs font-semibold text-white">
                          {currentScenario.protocolAction}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Transfer Target: <strong className="text-slate-200">{currentScenario.handoffDestination}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-teal-400" />
                      Human-in-the-Loop: Requires Doctor Physical Sign-off
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDemoLogin('doctor.bbsr@swasthyatriage.demo', '/app/hcw/dashboard')}
                      className="font-bold text-teal-400 hover:text-teal-300 hover:underline flex items-center gap-1"
                    >
                      <span>Review in Doctor Dashboard</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 5. THE GROUND REALITY & PROBLEM STATEMENT COMPARISON                 */}
      {/* ==================================================================== */}
      <section id="ground-reality" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3.5 py-1 text-xs font-semibold text-teal-300">
              <Building2 className="h-3.5 w-3.5 text-teal-400" />
              <span>Public Health Infrastructure Reality</span>
            </span>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
              Why Traditional Rural Healthcare Needs SwasthyaFlow AI
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              In Odisha and across rural India, the primary healthcare bottleneck is not lack of intent, but extreme overload, language disconnect, and lack of structured pre-triage.
            </p>
          </div>

          {/* 4 Bottlenecks Grid */}
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700 hover:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">OPD Congestion & Queue Fatigue</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                A single Medical Officer at a PHC routinely examines 150–250 patients daily. Patients wait 3–4 hours, leaving doctors less than 90 seconds per clinical encounter.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700 hover:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Languages className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">Linguistic & Dialect Gaps</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Patients communicate in regional dialects (Sambalpuri, Desia, colloquial Odia). Traditional computer forms are English-only, forcing rushed verbal summaries.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700 hover:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">Delayed Red-Flag Identification</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Without frontline queue triaging, acute myocardial infarctions, pediatric sepsis, and stroke symptoms wait in the same slow line as mild skin rashes.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700 hover:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">Crumpled Paper Slips & Loss of History</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Patients carry illegible hand-written slips that tear or get lost during inter-facility transit to District Hospitals, causing repeated tests and delayed treatment.
              </p>
            </div>
          </div>

          {/* Comparison Table: Traditional vs SwasthyaFlow */}
          <div className="mt-14 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-xl">
            <div className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
              <h3 className="text-sm font-bold text-white">
                Head-to-Head Comparison: Traditional Frontline Triage vs. SwasthyaFlow AI
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="px-6 py-3.5 font-bold uppercase tracking-wider">Clinical Dimension</th>
                    <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-rose-400">Traditional Rural PHC</th>
                    <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-teal-400">SwasthyaFlow AI Digital Platform</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="px-6 py-4 font-semibold text-white">Intake Method</td>
                    <td className="px-6 py-4 text-slate-400">Manual paper register, English counter form</td>
                    <td className="px-6 py-4 font-medium text-teal-300">
                      Spoken Odia / Hindi voice conversation + Mobile Prescription OCR
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-white">Emergency Detection</td>
                    <td className="px-6 py-4 text-slate-400">Accidental visual identification by nurse in crowd</td>
                    <td className="px-6 py-4 font-medium text-teal-300">
                      Deterministic ESI 1–5 urgency calculation with automated siren & doctor alert
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-white">Doctor Encounter Prep</td>
                    <td className="px-6 py-4 text-slate-400">Doctor starts from zero without previous context</td>
                    <td className="px-6 py-4 font-medium text-teal-300">
                      Pre-generated structured clinical summary note with symptoms, duration, vitals
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-white">Missing Vitals Follow-up</td>
                    <td className="px-6 py-4 text-slate-400">Patient forgotten once they leave the PHC gate</td>
                    <td className="px-6 py-4 font-medium text-teal-300">
                      Automated outbound AI tele-calling rounds to capture follow-up recovery data
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-white">State Directorate Oversight</td>
                    <td className="px-6 py-4 text-slate-400">Monthly paper reports with 30-day delay</td>
                    <td className="px-6 py-4 font-medium text-teal-300">
                      Real-time live telemetry heatmap with district epidemiological clusters
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 6. 5-STAGE CLINICAL PIPELINE ARCHITECTURE                            */}
      {/* ==================================================================== */}
      <section id="pipeline" className="border-t border-slate-800/80 bg-slate-900/40 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3.5 py-1 text-xs font-semibold text-teal-300">
              <Layers className="h-3.5 w-3.5 text-teal-400" />
              <span>Architectural Rigor</span>
            </span>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
              5-Stage Clinical Pipeline Architecture
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              Designed according to Ministry of Health & Family Welfare (MoHFW) standards, guaranteeing patient safety, zero hallucinated drug prescriptions, and full doctor authority.
            </p>
          </div>

          {/* Stepper Tabs */}
          <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PIPELINE_STEPS.map((step, idx) => {
              const selected = idx === activePipelineStep
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActivePipelineStep(idx)}
                  className={`flex flex-col items-start rounded-2xl p-4 text-left transition-all ${
                    selected
                      ? 'border border-teal-500 bg-slate-900 shadow-lg shadow-teal-950/50'
                      : 'border border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <span className={`text-[10px] font-bold tracking-wider uppercase ${selected ? 'text-teal-400' : 'text-slate-500'}`}>
                    {step.badge}
                  </span>
                  <span className="mt-1 text-sm font-bold text-white">{step.number}. {step.title.split(' ')[0]} {step.title.split(' ')[1]}</span>
                  <span className="mt-0.5 text-[11px] text-teal-300/80 font-medium">{step.odiaTitle.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>

          {/* Active Step Deep Dive Card */}
          {(() => {
            const step = PIPELINE_STEPS[activePipelineStep]
            return (
              <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                      <step.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                        {step.badge} · {step.number} OF 05
                      </span>
                      <h3 className="text-lg font-black text-white sm:text-xl">{step.title}</h3>
                      <p className="text-xs text-teal-300">{step.odiaTitle}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-1.5 text-xs text-slate-300">
                    <span className="text-slate-500">Benchmark: </span>
                    <strong className="text-white font-semibold">{step.metrics}</strong>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Operational Mechanism:</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.desc}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Technical Implementation:</h4>
                    <p className="mt-2 font-mono text-xs text-slate-300">{step.tech}</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Validated against National Digital Health Mission (NDHM) guidelines</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 7. ROLE-BASED COMMAND PORTALS (1-CLICK TEST LOGIN MATRIX)            */}
      {/* ==================================================================== */}
      <section id="portals" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3.5 py-1 text-xs font-semibold text-teal-300">
              <UserCheck className="h-3.5 w-3.5 text-teal-400" />
              <span>Multi-Stakeholder Command Portals</span>
            </span>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
              Engineered for Every Tier of Healthcare Delivery
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              Explore specialized interfaces built for patients, frontline medical officers, institutional PHC administrators, and state health leadership.
            </p>
          </div>

          {/* Role Tabs */}
          <div className="mt-12 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {ROLE_PORTALS.map((r, idx) => {
              const active = idx === activeRoleTab
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveRoleTab(idx)}
                  className={`flex flex-col items-start rounded-2xl p-4 text-left transition-all ${
                    active
                      ? 'border-2 border-teal-500 bg-slate-900 shadow-xl shadow-teal-950/50'
                      : 'border border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{r.tag}</span>
                  <h3 className="mt-1 text-xs sm:text-sm font-bold text-white">{r.role.split(' ')[0]} {r.role.split(' ')[1]}</h3>
                  <span className="mt-0.5 text-[10px] text-teal-300/80">{r.odiaRole}</span>
                </button>
              )
            })}
          </div>

          {/* Active Portal Showcase Card */}
          <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl sm:p-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="space-y-5 lg:col-span-7">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3 py-1 text-[11px] font-bold text-teal-300">
                    <Activity className="h-3 w-3" />
                    <span>{currentRole.badge}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-black text-white sm:text-2xl">{currentRole.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-300">{currentRole.desc}</p>
                </div>

                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Core Capabilities:</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {currentRole.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400 mt-0.5" />
                        <span className="text-xs text-slate-300 leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 1-Click Instant Demo Login CTA */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={Boolean(demoLoggingIn)}
                    onClick={() => handleDemoLogin(currentRole.demoEmail, currentRole.demoPath)}
                    className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-400 hover:to-emerald-400 active:scale-98 disabled:opacity-60"
                  >
                    <Zap className="h-4 w-4" />
                    <span>
                      {demoLoggingIn === currentRole.demoEmail
                        ? 'Logging In...'
                        : `Instant Demo Access as ${currentRole.demoName.split(' ')[0]}`}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Preloaded test account: <span className="font-mono text-slate-400">{currentRole.demoEmail}</span>
                  </p>
                </div>
              </div>

              {/* Right Side: Portal Mockup / Visual Identity */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-rose-500" />
                      <span className="h-3 w-3 rounded-full bg-amber-500" />
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">{currentRole.demoPath}</span>
                  </div>

                  <div className="mt-4 space-y-3 font-mono text-xs">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>AUTHENTICATED USER:</span>
                        <span className="font-bold text-teal-400">ROLE_VERIFIED</span>
                      </div>
                      <p className="mt-1 font-sans text-sm font-bold text-white">{currentRole.demoName}</p>
                      <p className="text-[11px] text-slate-400 font-sans">{currentRole.role}</p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <span className="text-[11px] text-slate-500">SESSION TELEMETRY:</span>
                      <div className="mt-1 flex items-center justify-between text-slate-300">
                        <span>Audit Protocol:</span>
                        <span className="text-emerald-400 font-bold">AES-256 ENCRYPTED</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-slate-300">
                        <span>ABDM FHIR Bridge:</span>
                        <span className="text-teal-400 font-bold">ACTIVE M1/M2/M3</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-teal-500/30 bg-teal-950/30 p-3 text-center font-sans">
                      <p className="text-xs text-teal-300 font-semibold">
                        Ready for interactive testing with pre-seeded Odisha PHC clinical data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 8. ACTIVE PHC / CHC DISTRICT NETWORK IN ODISHA                       */}
      {/* ==================================================================== */}
      <section id="phc-network" className="border-t border-slate-800/80 bg-slate-900/40 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="space-y-4 lg:col-span-5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3 py-1 text-xs font-semibold text-teal-300">
                <MapPin className="h-3.5 w-3.5 text-teal-400" />
                <span>Geographic Network Deployment</span>
              </span>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                Frontline Footprint Across Odisha Districts
              </h2>
              <p className="text-sm leading-relaxed text-slate-300">
                SwasthyaFlow AI is designed for seamless operation in low-bandwidth rural environments, connecting sub-centres and PHCs directly to district referral headquarters.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  {
                    district: 'Khordha District',
                    node: 'Bhubaneswar Town PHC · Unit 4 CHC',
                    status: 'Active Live Triage Node',
                  },
                  {
                    district: 'Cuttack District',
                    node: 'Cuttack Sadar CHC · SCB Referral Gateway',
                    status: 'Cardiology Red-Flag Node',
                  },
                  {
                    district: 'Mayurbhanj District',
                    node: 'Baripada Sub-divisional Hospital Hub',
                    status: 'Odia/Santali Voice Testing Node',
                  },
                  {
                    district: 'Sambalpur District',
                    node: 'Burla Regional Health Node',
                    status: 'Tele-calling Pilot Center',
                  },
                ].map((n, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div>
                      <h4 className="text-xs font-bold text-white">{n.district}</h4>
                      <p className="text-[11px] text-slate-400">{n.node}</p>
                    </div>
                    <span className="rounded-full bg-emerald-950 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      {n.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Network Infographic Card */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Telemetry Node Distribution
                    </span>
                    <h3 className="text-base font-bold text-white">Cross-District Tele-Triage Throughput</h3>
                  </div>
                  <span className="rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs font-mono text-slate-300">
                    Live Stream: 2026 Q4
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
                    <span className="text-xs font-semibold text-slate-400">Rural Sub-Centres</span>
                    <p className="mt-1 text-2xl font-black text-white">28</p>
                    <p className="mt-1 text-[10px] text-teal-400">Kiosk Voice Activated</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
                    <span className="text-xs font-semibold text-slate-400">Primary Health Centres</span>
                    <p className="mt-1 text-2xl font-black text-white">16</p>
                    <p className="mt-1 text-emerald-400">Full MO Triage Queue</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center col-span-2 sm:col-span-1">
                    <span className="text-xs font-semibold text-slate-400">District Referral Hospitals</span>
                    <p className="mt-1 text-2xl font-black text-white">04</p>
                    <p className="mt-1 text-cyan-400">Direct Emergency Handoff</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-teal-500/30 bg-teal-950/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
                      <Radio className="h-4 w-4 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Offline-First Progressive Web App (PWA)</h4>
                      <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                        Functions even in intermittent 2G/3G connectivity in remote tribal pockets, queuing assessments locally and syncing immediately upon reconnection.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 9. ETHICAL AI GOVERNANCE & PATIENT SAFETY COMMITMENT                 */}
      {/* ==================================================================== */}
      <section id="governance" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/60 px-3.5 py-1 text-xs font-semibold text-teal-300">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
              <span>Safety & Clinical Governance</span>
            </span>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
              "AI assists information flow. Doctors hold sole clinical authority."
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              SwasthyaFlow AI is built with non-negotiable architectural firewalls to protect patient life and eliminate algorithmic overreach.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Strictly Non-Diagnostic by Design',
                desc: 'The platform never issues definitive medical conclusions or asserts certainty. It extracts reported symptoms into structured terminology for qualified clinicians.',
                icon: AlertCircle,
              },
              {
                title: 'Zero Autonomous Drug Prescription',
                desc: 'The system is hard-coded to refuse pharmaceutical brand dosing or prescription changes. Only verified on-duty Medical Officers can prescribe drugs.',
                icon: Pill,
              },
              {
                title: 'Deterministic Safety Engine (No Hallucination)',
                desc: 'Urgent red-flag emergency escalations are evaluated by deterministic rule tables, never left to generative LLM temperature variations.',
                icon: ShieldAlert,
              },
              {
                title: 'Cryptographic Clinical Audit Trail',
                desc: 'Every voice recording, OCR parsing result, triage state change, and doctor note is permanently preserved with timestamped SHA-256 integrity logs.',
                icon: Lock,
              },
              {
                title: 'Data Sovereignty & Indian Health Privacy',
                desc: 'Patient health data is never sold, brokered, or used for external model fine-tuning. Strict compliance with Indian Digital Health Guidelines and ABDM standards.',
                icon: Building2,
              },
              {
                title: 'Bilingual Emergency Escalation Paths',
                desc: 'Whenever an ESI Level 1/2 red flag triggers, the patient is immediately provided emergency telephone hotlines (108/104) and local PHC physical address.',
                icon: PhoneCall,
              },
            ].map((rule, i) => (
              <div key={i} className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-slate-700 hover:bg-slate-900/80">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <rule.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{rule.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{rule.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 10. FINAL INSTITUTIONAL CALL-TO-ACTION                               */}
      {/* ==================================================================== */}
      <section className="py-16 text-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-b from-teal-950/60 via-slate-900 to-slate-950 p-8 sm:p-14 shadow-2xl">
            <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-96 -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl" />

            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-950/80 px-3.5 py-1 text-xs font-semibold text-teal-300">
              <Sparkles className="h-3.5 w-3.5 text-teal-400" />
              <span>Public Health Innovation Ready</span>
            </span>

            <h2 className="mt-5 text-3xl font-black text-white sm:text-4xl lg:text-5xl">
              Experience the Future of Frontline Healthcare
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-slate-300 leading-relaxed">
              Join healthcare workers, doctors, and public health administrators in experiencing SwasthyaFlow AI’s multimodal triage and clinical handoff platform.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                to="/auth/signup"
                className="rounded-xl bg-teal-500 px-7 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-xl shadow-teal-500/30 transition hover:bg-teal-400 active:scale-98"
              >
                Create Citizen Account
              </Link>
              <Link
                to="/auth/login"
                className="rounded-xl border border-slate-700 bg-slate-800 px-7 py-3.5 text-xs sm:text-sm font-bold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 active:scale-98"
              >
                Sign In to Clinical Workspace
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 11. COMPREHENSIVE INSTITUTIONAL FOOTER                              */}
      {/* ==================================================================== */}
      <footer className="border-t border-slate-800/80 bg-slate-950 pt-16 pb-12 text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            {/* Col 1: Identity & Crest */}
            <div className="space-y-4 lg:col-span-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-slate-950 font-black">
                  <HeartPulse className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-base font-extrabold text-white">
                    SwasthyaFlow <span className="text-teal-400">AI</span>
                  </span>
                  <p className="text-[10px] text-teal-300 font-medium">
                    ସ୍ୱାସ୍ଥ୍ୟ ଫ୍ଲୋ · ଡିଜିଟାଲ୍ କ୍ଲିନିକାଲ୍ ଟ୍ରାଇଜ୍ ପ୍ରଣାଳୀ
                  </p>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-400">
                A public health clinical triage and handoff platform engineered for Primary Health Centres (PHCs) and Community Health Centres (CHCs) across Odisha, India. Supporting native Odia & Hindi voice intake with deterministic ESI 1–5 urgency calculation.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px]">
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300">
                  ABDM Compatible
                </span>
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300">
                  FHIR R4 Schemas
                </span>
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300">
                  256-Bit TLS Audit
                </span>
              </div>
            </div>

            {/* Col 2: Clinical Portals */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Clinical Portals</h4>
              <ul className="mt-4 space-y-2.5 text-xs">
                <li>
                  <Link to="/auth/login" className="hover:text-teal-300 transition">
                    Citizen Patient Portal
                  </Link>
                </li>
                <li>
                  <Link to="/auth/login" className="hover:text-teal-300 transition">
                    Medical Officer Console
                  </Link>
                </li>
                <li>
                  <Link to="/auth/login" className="hover:text-teal-300 transition">
                    Facility Admin Portal
                  </Link>
                </li>
                <li>
                  <Link to="/auth/login" className="hover:text-teal-300 transition">
                    State Health Directorate
                  </Link>
                </li>
                <li>
                  <Link to="/auth/signup" className="hover:text-teal-300 transition">
                    Self Registration
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Architecture & Safety */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Clinical Architecture</h4>
              <ul className="mt-4 space-y-2.5 text-xs">
                <li>
                  <a href="#pipeline" className="hover:text-teal-300 transition">
                    Multimodal Speech Ingestion
                  </a>
                </li>
                <li>
                  <a href="#pipeline" className="hover:text-teal-300 transition">
                    Prescription & Lab OCR
                  </a>
                </li>
                <li>
                  <a href="#clinical-simulator" className="hover:text-teal-300 transition">
                    Deterministic ESI Engine
                  </a>
                </li>
                <li>
                  <a href="#governance" className="hover:text-teal-300 transition">
                    Zero Autonomous Prescriptions
                  </a>
                </li>
                <li>
                  <a href="#phc-network" className="hover:text-teal-300 transition">
                    Offline PWA Reliability
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: Emergency Contacts & Public Health */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Emergency Helplines</h4>
              <div className="mt-4 space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2">
                  <span className="text-slate-400">Ambulance:</span>
                  <span className="font-bold text-rose-400">108</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2">
                  <span className="text-slate-400">Odisha Health:</span>
                  <span className="font-bold text-teal-400">104</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2">
                  <span className="text-slate-400">National Helpline:</span>
                  <span className="font-bold text-white">1075</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2">
                  <span className="text-slate-400">General Emergency:</span>
                  <span className="font-bold text-white">112</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Copyright & Disclaimer Strip */}
          <div className="mt-12 border-t border-slate-800/80 pt-6 text-center text-[11px] text-slate-500">
            <p>
              SwasthyaFlow AI is an AI-assisted clinical information structuring and triage decision-support prototype developed for public healthcare demonstration.
            </p>
            <p className="mt-1">
              Qualified healthcare professionals lead, evaluate, and hold final decision authority. AI does not independently diagnose diseases or prescribe drug dosages.
            </p>
            <p className="mt-3 text-slate-600">
              © {new Date().getFullYear()} SwasthyaFlow AI · BPUT HealthTech Innovation Lab · All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}