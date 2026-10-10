import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Loader2,
  MapPin,
  MessageSquareText,
  Mic,
  PhoneCall,
  PlusCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import SonamFloatingAssistant from '../../../components/voice/SonamFloatingAssistant'
import { useAuthStore } from '../../../stores/auth'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import { indianGreeting } from '../../../lib/time'
import type { CaseListResponse, CaseStatus, Priority } from '../../../lib/types'

const PRIORITY_STYLE: Record<Priority, string> = {
  ROUTINE: 'bg-slate-100 text-slate-700 border-slate-200',
  REVIEW_REQUIRED: 'bg-amber-50 text-amber-800 border-amber-200',
  URGENT_REVIEW: 'bg-red-50 text-red-800 border-red-200 font-semibold',
}

const STATUS_BADGE: Record<CaseStatus, { label: string; style: string }> = {
  DRAFT: { label: 'Intake in progress', style: 'bg-slate-100 text-slate-600' },
  SUBMITTED: { label: 'Waiting for Review', style: 'bg-blue-50 text-blue-700' },
  IN_REVIEW: { label: 'Doctor Reviewing', style: 'bg-teal-50 text-teal-800 font-medium' },
  FOLLOW_UP_REQUIRED: { label: 'Information Requested', style: 'bg-amber-50 text-amber-800' },
  REVIEWED: { label: 'Review Completed', style: 'bg-emerald-50 text-emerald-800' },
  ESCALATED: { label: 'Escalated', style: 'bg-red-50 text-red-800' },
  REFERRED: { label: 'Referred to Facility', style: 'bg-purple-50 text-purple-800' },
  CLOSED: { label: 'Case Closed', style: 'bg-slate-100 text-slate-500' },
}

export default function PatientDashboard() {
  const user = useAuthStore((s) => s.user)!
  const [cases, setCases] = useState<CaseListResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const { i18n } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Keep clock and greeting fresh on mount and when language changes
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [i18n?.language])

  const greeting = indianGreeting(now, i18n?.language)

  useEffect(() => {
    api<CaseListResponse>('/api/cases', { params: { page_size: 15 } })
      .then(setCases)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cases'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Friendly Patient Greeting */}
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-white p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-100/70 px-3 py-1 text-xs font-semibold text-teal-800">
              <HeartPulse className="h-3.5 w-3.5 text-teal-700" />
              <span>Namaste · Swasthya Care Portal</span>
            </div>
            <h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {greeting}, {user.full_name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Facility: <span className="font-semibold text-slate-800">{user.facility_name ?? 'Local Primary Health Centre'}</span>
            </p>
          </div>
          <Link
            to="/app/patient/new"
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 active:scale-95 sm:w-auto"
          >
            <PlusCircle className="h-4 w-4" />
            Start Assessment
          </Link>
        </div>
      </div>

      {/* Featured AI Voice Intake Assistant — Sonam */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-teal-500 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 p-5 text-white shadow-xl shadow-teal-950/20 sm:p-6">
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-bold text-teal-200 border border-teal-400/30">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
              <span>Sonam AI Healthcare Intake Assistant</span>
            </div>
            <h2 className="text-xl font-extrabold sm:text-2xl text-white">
              Speak with Sonam in Hindi, Odia, or English
            </h2>
            <p className="text-xs text-teal-100/90 leading-relaxed sm:text-sm">
              Sonam organizes your symptoms, duration, and vitals into a structured clinical note and delivers it straight to your doctor for review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/app/patient/voice"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-xs font-extrabold text-teal-950 shadow-md transition hover:bg-teal-300 active:scale-95 sm:text-sm"
            >
              <Mic className="h-4 w-4" />
              <span>Talk to Sonam Now</span>
            </Link>
            <Link
              to="/app/patient/callback"
              className="inline-flex items-center gap-2 rounded-xl border border-teal-300/40 bg-teal-800/60 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-95 sm:text-sm"
            >
              <PhoneCall className="h-4 w-4 text-teal-200" />
              <span>Get a Phone Call</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Question & 4 Primary Intake Modes */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
          How would you like to share your health information?
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Select your preferred method. All responses are summarized for authorized healthcare review.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Talk to Sonam (Website Voice Chat) */}
          <Link
            to="/app/patient/voice"
            className="group relative flex flex-col justify-between rounded-2xl border-2 border-teal-300 bg-gradient-to-b from-teal-50 via-teal-50/40 to-white p-4 transition hover:border-teal-600 hover:shadow-lg hover:shadow-teal-100 sm:p-5"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/30 group-hover:scale-105 transition-transform">
                <Mic className="h-6 w-6" />
              </span>
              <div className="mt-4 flex items-center gap-1.5">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-700">
                  🎙️ Talk to Sonam
                </h3>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  Live Voice
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Speak directly in Hindi, Odia, or English. Sonam listens, clarifies symptoms, and sends notes straight to the doctor.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <span>Start Voice Intake</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Card 2: Get a Phone Call (Outbound Callback) */}
          <Link
            to="/app/patient/callback"
            className="group relative flex flex-col justify-between rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/60 to-white p-4 transition hover:border-blue-500 hover:shadow-lg hover:shadow-blue-100 sm:p-5"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30 group-hover:scale-105 transition-transform">
                <PhoneCall className="h-6 w-6" />
              </span>
              <div className="mt-4 flex items-center gap-1.5">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                  📞 Phone Callback
                </h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  Tele-triage
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Enter your mobile number to get a telephone call from Sonam. She records your answers for doctor review.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <span>Request Phone Call</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Card 3: Chat with AI */}
          <Link
            to="/app/patient/new"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-md sm:p-5"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-white group-hover:scale-105 transition-transform">
                <MessageSquareText className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-slate-800">
                💬 Chat with AI
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Answer structured health questions in text at your own pace with multilingual auto-complete.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <span>Start Chat Intake</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Card 4: Upload Report */}
          <Link
            to="/app/patient/uploads"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-md sm:p-5"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-700 text-white group-hover:scale-105 transition-transform">
                <Upload className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-cyan-800">
                📄 Upload Report
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Upload prescription photos, blood test PDFs, or hospital slips. AI extracts key values for doctor review.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-cyan-800">
              <span>Upload Document</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* Nearby Medical Stores & Jan Aushadhi Kendra Quick Action */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <MapPin className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Nearby Clinics, Hospitals & Medicine Stores
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live GIS Radar
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 max-w-xl leading-relaxed">
                Locate verified emergency hospitals, OPD clinics, 24/7 pharmacies & Jan Aushadhi generic stores across all of India with real contact phone numbers and GPS directions.
              </p>
            </div>
          </div>
          <Link
            to="/app/patient/pharmacies"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-xs font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 active:scale-95"
          >
            <span>Open Healthcare Radar</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Non-Diagnostic Safety Callout */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
        <ShieldCheck className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Medical Disclaimer:</span> This prototype gathers information to help healthcare workers review cases faster. It does not provide medical diagnoses or prescriptions. In an emergency, please visit the nearest hospital casualty immediately.
        </div>
      </div>

      {/* Recent Assessments Section */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-800">Recent Assessments & Status</h2>
          </div>
          <Link to="/app/patient/new" className="text-xs font-medium text-teal-700 hover:underline">
            + New Assessment
          </Link>
        </div>

        {loading && (
          <div className="flex h-32 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (!cases || cases.items.length === 0) && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center sm:p-8">
            <p className="text-sm font-medium text-slate-700">No assessments submitted yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Use voice or chat above to share your health concern for healthcare review.
            </p>
            <Link
              to="/app/patient/voice"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Mic className="h-3.5 w-3.5" />
              Try Voice Assessment
            </Link>
          </div>
        )}

        {!loading && !error && cases && cases.items.length > 0 && (
          <div className="space-y-2.5">
            {cases.items.map((c) => {
              const badge = STATUS_BADGE[c.status] || { label: c.status, style: 'bg-slate-100 text-slate-700' }
              return (
                <Link
                  key={c.id}
                  to={`/app/patient/cases/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-400 hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-xs font-bold text-slate-900">{c.case_number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${PRIORITY_STYLE[c.priority]}`}>
                        {c.priority}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.style}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-slate-700">
                      {c.chief_concern || 'Intake conversation in progress'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Source: {c.source} · Language: {c.language.toUpperCase()} · Submitted: {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 ml-3" />
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Sonam Voice Assistant Drawer */}
      <SonamFloatingAssistant />
    </div>
  )
}