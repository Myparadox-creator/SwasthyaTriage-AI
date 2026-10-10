import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import { submitSnapServeLead } from '../../../lib/snapserve'
import type { CallbackListResponse, CallbackRequestOut, CallStatus } from '../../../lib/types'

const STATUS_CONFIG: Record<
  CallStatus,
  { label: string; bg: string; text: string; icon: typeof PhoneCall }
> = {
  REQUESTED: {
    label: 'Queued for Outbound Call',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: Clock,
  },
  DIALING: {
    label: 'Dialing Your Phone...',
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: PhoneForwarded,
  },
  RINGING: {
    label: 'Ringing Your Phone',
    bg: 'bg-indigo-50 border-indigo-200',
    text: 'text-indigo-800',
    icon: PhoneCall,
  },
  CONNECTED: {
    label: 'In Conversation with Sonam',
    bg: 'bg-teal-50 border-teal-200',
    text: 'text-teal-800',
    icon: PhoneCall,
  },
  COMPLETED: {
    label: 'Call Completed & Sent to Doctor',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Call Could Not Connect',
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: PhoneOff,
  },
  NO_ANSWER: {
    label: 'No Answer on Phone',
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-800',
    icon: PhoneOff,
  },
  CANCELLED: {
    label: 'Request Cancelled',
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-600',
    icon: PhoneOff,
  },
}

export default function VoiceCallbackPage() {
  const user = useAuthStore((s) => s.user)!
  const [phoneNumber, setPhoneNumber] = useState(user.phone || '')
  const [language, setLanguage] = useState<'hi' | 'od' | 'en'>('hi')
  const [purpose, setPurpose] = useState('Patient requested a Sonam callback for health information')
  const [consentAi, setConsentAi] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<CallbackRequestOut | null>(null)

  const [recentCalls, setRecentCalls] = useState<CallbackRequestOut[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const loadHistory = async () => {
    try {
      setLoadingHistory(true)
      const res = await api<CallbackListResponse>('/api/patients/callback-requests')
      setRecentCalls(res.items || [])
    } catch {
      // ignore history load errors silently
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!consentAi) {
      setSubmitError('Please agree to receive the AI call before submitting.')
      return
    }

    const clean = phoneNumber.replace(/[\s\-()]/g, '')
    if (!clean || clean.length < 10) {
      setSubmitError('Please enter a valid 10-digit Indian mobile number.')
      return
    }

    setSubmitting(true)
    try {
      const res = await api<CallbackRequestOut>('/api/patients/callback-requests', {
        method: 'POST',
        body: {
          phone_number: clean,
          language,
          purpose: purpose.trim() || undefined,
          consent_ai: true,
        },
      })
      setSubmitSuccess(res)

      // Send lead to SnapServe AI
      void submitSnapServeLead({
        phone: clean,
        name: user.full_name,
        email: user.email,
        purpose,
        language,
        source: 'SwasthyaFlow Voice Callback',
      })

      // Refresh recent calls list
      void loadHistory()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to schedule callback. Please try again shortly.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Back button and Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/app/patient/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            📞 Get a Phone Call from Sonam
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            AI Voice Triage on your phone · Summarized directly for doctor review
          </p>
        </div>
      </div>

      {/* Emergency Guidance Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 via-rose-50/70 to-white p-4 shadow-xs sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/30">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 text-xs sm:text-sm text-red-900">
            <p className="font-bold">🚨 Emergency Red Flag Notice:</p>
            <p className="mt-1 leading-relaxed text-red-800">
              Sonam is an AI health intake assistant, not an emergency service. If you or someone nearby is experiencing
              severe breathing difficulty, persistent chest pain, loss of consciousness, uncontrolled bleeding, or stroke signs,
              <strong className="mx-1 underline">call 112 / 108 immediately</strong>
              or reach your nearest hospital emergency department. Supplementary hospital desk:{' '}
              <span className="font-mono font-bold">6370659934</span>. Do not wait for Sonam to call.
            </p>
          </div>
        </div>
      </div>

      {/* Main Request Card */}
      <div className="rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Sparkles className="h-3.5 w-3.5 text-teal-600" />
              <span>Step-by-step Telephone Triage</span>
            </div>
            <h2 className="mt-2 text-lg font-bold text-slate-900 sm:text-xl">
              Request an Outbound AI Call
            </h2>
          </div>
          <div className="text-xs text-slate-500 sm:text-right">
            <span>Facility: </span>
            <span className="font-semibold text-slate-700">
              {user.facility_name ?? 'Local Primary Health Centre'}
            </span>
          </div>
        </div>

        {submitSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-emerald-950 sm:text-lg">
              Callback Request Submitted!
            </h3>
            <p className="mt-2 text-xs text-emerald-900 sm:text-sm max-w-md mx-auto leading-relaxed">
              {submitSuccess.message}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-mono text-emerald-800 border border-emerald-200 shadow-2xs">
              <span>Request ID:</span>
              <span className="font-bold">{submitSuccess.public_id}</span>
              <span>·</span>
              <span>Phone:</span>
              <span className="font-bold">{submitSuccess.phone_masked}</span>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSubmitSuccess(null)
                  setConsentAi(false)
                }}
                className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-50 transition"
              >
                Schedule Another Call
              </button>
              <Link
                to="/app/patient/dashboard"
                className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 transition"
              >
                Back to Patient Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {submitError && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Mobile Number Field */}
            <div>
              <label htmlFor="callback-phone" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Your Mobile Number <span className="text-red-500">*</span>
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Sonam will dial this Indian mobile number directly.
              </p>
              <div className="relative mt-2">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 text-xs font-bold">
                  +91
                </div>
                <input
                  id="callback-phone"
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={phoneNumber.replace(/^\+91/, '')}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-3 pl-12 pr-4 text-sm font-medium text-slate-900 transition focus:border-teal-600 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            {/* Preferred Language */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Preferred Language for the Call <span className="text-red-500">*</span>
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Sonam speaks fluently in Hindi, Odia, and English.
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-3">
                {[
                  { id: 'hi', label: 'हिंदी', desc: 'Hindi (Primary)' },
                  { id: 'od', label: 'ଓଡ଼ିଆ', desc: 'Odia' },
                  { id: 'en', label: 'English', desc: 'English' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLanguage(item.id as 'hi' | 'od' | 'en')}
                    className={`flex flex-col items-center justify-center rounded-2xl border p-3.5 text-center transition ${
                      language === item.id
                        ? 'border-teal-600 bg-teal-50/70 text-teal-900 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-slate-50/40 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base font-bold">{item.label}</span>
                    <span className="mt-1 text-[11px] text-slate-500">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason / Chief Health Concern */}
            <div>
              <label htmlFor="callback-purpose" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Brief Health Concern (Optional)
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Help Sonam prepare the relevant questions for you.
              </p>
              <textarea
                id="callback-purpose"
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Fever for 2 days, body ache, mild cough..."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 transition focus:border-teal-600 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {/* AI Assistant Disclosure & Consent */}
            <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <input
                  id="callback-consent"
                  type="checkbox"
                  checked={consentAi}
                  onChange={(e) => setConsentAi(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="callback-consent" className="text-xs text-slate-700 leading-relaxed cursor-pointer select-none">
                  <strong className="text-slate-900">Mandatory Consent & AI Disclosure: </strong>
                  I understand that Sonam is an artificial intelligence assistant, not a doctor. I consent to receiving an automated phone call from SwasthyaFlow AI and agree that my reported symptoms and information will be collected and organized into a triage summary for review by a qualified healthcare professional.
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !consentAi}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3.5 text-sm font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting Callback Request...</span>
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  <span>Request Call from Sonam</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Callback History / Tracker */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-900">Your Callback Requests & Status</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loadingHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3 w-3 ${loadingHistory ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="mt-4">
          {loadingHistory && recentCalls.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
              No callback requests yet. Use the form above to request an automated call from Sonam.
            </div>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => {
                const conf = STATUS_CONFIG[call.status] || {
                  label: call.status,
                  bg: 'bg-slate-50 border-slate-200',
                  text: 'text-slate-700',
                  icon: PhoneCall,
                }
                const Icon = conf.icon
                return (
                  <div
                    key={call.id}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/30 p-4 transition sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${conf.bg} ${conf.text}`}>
                          <Icon className="h-3 w-3" />
                          <span>{conf.label}</span>
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {call.phone_masked}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          · {call.language.toUpperCase()} · Mode: {call.mode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {call.message}
                      </p>
                      {call.case_number && (
                        <p className="mt-0.5 text-[11px] text-teal-700 font-semibold">
                          Linked Case: {call.case_number}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-400">
                      {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
