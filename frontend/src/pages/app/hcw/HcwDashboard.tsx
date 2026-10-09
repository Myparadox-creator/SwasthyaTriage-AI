import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Hospital,
  Loader2,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Send,
  ShieldAlert,
  Stethoscope,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/auth'
import { api } from '../../../lib/api'
import type { CaseListItem, CaseListResponse, FollowUpOut, FollowUpListResponse, Priority } from '../../../lib/types'
import { PRIORITY_BADGE } from './hcwMeta'

interface Counts {
  submitted: number
  inReview: number
  followUp: number
  urgent: number
  recent: CaseListResponse | null
}

const PRESET_ADVICE = [
  'Advise immediate OPD evaluation tomorrow at 9:00 AM. Monitor vitals closely.',
  'Prescribed symptomatic care: Adequate oral rehydration, warm fluids, and rest. Return if fever > 101°F.',
  '🚨 URGENT: Symptoms require immediate emergency assessment. Please proceed to the nearest CHC/District Hospital or dial 108 immediately.',
  'Please monitor SpO2 and body temperature twice daily. Keep Paracetamol handy if fever persists.',
]

export default function HcwDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)!

  const [counts, setCounts] = useState<Counts | null>(null)
  const [followups, setFollowups] = useState<FollowUpOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Filter state for queue tab
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | Priority>('ALL')
  const [activeTab, setActiveTab] = useState<'queue' | 'telecalls' | 'signals' | 'handoffs'>('queue')

  // Quick Clinical Advice Modal State
  const [adviceCase, setAdviceCase] = useState<CaseListItem | null>(null)
  const [adviceText, setAdviceText] = useState('')
  const [submittingAdvice, setSubmittingAdvice] = useState(false)
  const [adviceSuccess, setAdviceSuccess] = useState<string | null>(null)

  const docTitle = user.full_name.startsWith('Dr.') ? user.full_name : `Dr. ${user.full_name}`

  useEffect(() => {
    let active = true
    setLoading(true)

    const fetchCount = async (params: { status?: string; priority?: string }) => {
      const res = await api<CaseListResponse>('/api/cases', { params: { page_size: 1, ...params } })
      return res.total
    }

    Promise.all([
      fetchCount({ status: 'SUBMITTED' }),
      fetchCount({ status: 'IN_REVIEW' }),
      fetchCount({ status: 'FOLLOW_UP_REQUIRED' }),
      fetchCount({ priority: 'URGENT_REVIEW' }),
      api<CaseListResponse>('/api/cases', { params: { page_size: 15 } }),
      api<FollowUpListResponse>('/api/followups', { params: { page_size: 10 } }).catch(() => ({ items: [], total: 0 })),
    ])
      .then(([submitted, inReview, followUp, urgent, recent, fuRes]) => {
        if (!active) return
        setCounts({ submitted, inReview, followUp, urgent, recent })
        setFollowups(fuRes.items || [])
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : t('common.error'))
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshKey, t])

  const handleSendAdvice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adviceCase || !adviceText.trim() || submittingAdvice) return
    setSubmittingAdvice(true)
    try {
      await api(`/api/cases/${adviceCase.id}/reply`, {
        method: 'POST',
        body: { message: adviceText.trim() },
      })
      setAdviceSuccess(`Clinical advice dispatched to patient ${adviceCase.patient_name} (Case #${adviceCase.case_number})`)
      setAdviceCase(null)
      setAdviceText('')
      setRefreshKey((k) => k + 1)
      setTimeout(() => setAdviceSuccess(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send clinical advice')
    } finally {
      setSubmittingAdvice(false)
    }
  }

  // Filter cases for the queue tab
  const filteredCases = (counts?.recent?.items || []).filter((c) => {
    if (priorityFilter === 'ALL') return true
    return c.priority === priorityFilter
  })

  // Urgent cases specifically
  const urgentCases = (counts?.recent?.items || []).filter((c) => c.priority === 'URGENT_REVIEW')

  if (loading && !counts) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="text-xs font-semibold text-slate-600">Loading Medical Officer Console…</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* Toast Notification */}
      {adviceSuccess && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-xl shadow-emerald-900/10 animate-slide-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{adviceSuccess}</span>
        </div>
      )}

      {/* Hero Header: Medical Officer Clinical Duty Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-200/90 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl shadow-blue-950/20">
        {/* Glow Effects */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-200 backdrop-blur-md">
                <Stethoscope className="h-3.5 w-3.5 text-blue-300" />
                <span>Medical Officer · Clinical Decision Unit</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>On-Duty Clinical Shift</span>
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl text-white">
              Namaste, {docTitle}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-blue-100/90">
              {user.designation ?? 'Attending Medical Officer'} ·{' '}
              <span className="font-semibold text-teal-300">{user.facility_name ?? 'Designated PHC / CHC'}</span>
            </p>
          </div>

          {/* Quick Doctor Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
              title="Refresh Queue"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>

            <Link
              to="/app/hcw/queue"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-teal-400 px-4 py-2 text-xs sm:text-sm font-bold text-slate-950 shadow-md shadow-blue-500/30 transition hover:brightness-110 active:scale-95"
            >
              <Stethoscope className="h-4 w-4" />
              <span>Open Triage Queue</span>
            </Link>

            <Link
              to="/app/hcw/voice"
              className="inline-flex items-center gap-2 rounded-xl border border-teal-400/40 bg-teal-500/20 px-4 py-2 text-xs sm:text-sm font-bold text-teal-200 backdrop-blur-md transition hover:bg-teal-500/30"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Tele-Consults</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Critical Alert Bar: Urgent Red Flags */}
      {counts && counts.urgent > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-950 shadow-md shadow-red-900/5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm shadow-red-600/30 animate-pulse">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-red-950">
                🚨 High-Priority Clinical Alert: {counts.urgent} Patient(s) Flagged for Urgent Medical Review
              </p>
              <p className="mt-0.5 text-xs text-red-800">
                Safety triggers detected (Chest Pain, Severe Dyspnea, or Critical Vitals). Immediate clinical review & handoff required.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('queue')
              setPriorityFilter('URGENT_REVIEW')
            }}
            className="shrink-0 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 transition active:scale-95"
          >
            Review Urgent Cases ({counts.urgent}) &rarr;
          </button>
        </div>
      )}

      {/* 4 Clinical KPI Workload Stat Cards */}
      {counts && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">Urgent Triage</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700">
                <ShieldAlert className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-red-900">{counts.urgent}</p>
            <p className="mt-0.5 text-[11px] text-red-600 font-medium">Requires immediate doctor sign-off</p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Awaiting Review</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <FileText className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-blue-900">{counts.submitted}</p>
            <p className="mt-0.5 text-[11px] text-blue-600 font-medium">Intake complete, ready for doctor</p>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">In Active Review</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Stethoscope className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-teal-900">{counts.inReview}</p>
            <p className="mt-0.5 text-[11px] text-teal-600 font-medium">Clinical note & assessment draft</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Follow-up</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <MessageSquareText className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-amber-900">{counts.followUp}</p>
            <p className="mt-0.5 text-[11px] text-amber-600 font-medium">Awaiting vitals / patient response</p>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'queue'
              ? 'bg-blue-900 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Stethoscope className="h-3.5 w-3.5" />
          <span>Clinical Triage Queue</span>
          {counts && counts.submitted > 0 && (
            <span className="rounded-full bg-blue-500/30 px-2 py-0.2 text-[10px] text-white">
              {counts.submitted}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telecalls')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'telecalls'
              ? 'bg-blue-900 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <PhoneCall className="h-3.5 w-3.5" />
          <span>Tele-Calling Rounds</span>
          {followups.length > 0 && (
            <span className="rounded-full bg-teal-100 text-teal-800 px-2 py-0.2 text-[10px]">
              {followups.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('signals')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'signals'
              ? 'bg-blue-900 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Safety Signal Monitor</span>
          {urgentCases.length > 0 && (
            <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.2 text-[10px] font-bold">
              {urgentCases.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('handoffs')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'handoffs'
              ? 'bg-blue-900 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Hospital className="h-3.5 w-3.5" />
          <span>Clinical Referrals & Duty</span>
        </button>
      </div>

      {/* TAB 1: Clinical Triage Queue */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Priority Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span>Filter Priority:</span>
              <button
                type="button"
                onClick={() => setPriorityFilter('ALL')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  priorityFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Cases ({counts?.recent?.items.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter('URGENT_REVIEW')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  priorityFilter === 'URGENT_REVIEW'
                    ? 'bg-red-700 text-white'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                🚨 Urgent ({urgentCases.length})
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter('REVIEW_REQUIRED')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  priorityFilter === 'REVIEW_REQUIRED'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Review Required
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter('ROUTINE')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  priorityFilter === 'ROUTINE'
                    ? 'bg-teal-700 text-white'
                    : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                }`}
              >
                Routine
              </button>
            </div>

            <span className="text-xs font-medium text-slate-400">
              Showing {filteredCases.length} assigned patient cases
            </span>
          </div>

          {/* Cases List */}
          {filteredCases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <Stethoscope className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No cases matching this priority filter.</p>
              <p className="mt-1 text-xs text-slate-400">All cases in this category have been triaged or reviewed.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredCases.map((c) => {
                const isUrgent = c.priority === 'URGENT_REVIEW'
                return (
                  <div
                    key={c.id}
                    className={`group rounded-2xl border p-4 sm:p-5 transition hover:shadow-lg bg-white ${
                      isUrgent
                        ? 'border-red-300 ring-1 ring-red-300/40 bg-gradient-to-r from-red-50/30 via-white to-white'
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              PRIORITY_BADGE[c.priority]
                            }`}
                          >
                            {t(`hcw.priority.${c.priority}`)}
                          </span>

                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                            {c.case_number}
                          </span>

                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            Status: {t(`hcw.status.${c.status}`)}
                          </span>

                          {c.signal_count > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                              <AlertCircle className="h-3 w-3" />
                              <span>{c.signal_count} Safety Signal</span>
                            </span>
                          )}

                          {c.has_documents && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                              📎 Medical Reports Attached
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors">
                          {c.chief_concern ?? 'General Assessment Intake'}
                        </h3>

                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>Patient: <strong className="text-slate-800">{c.patient_name}</strong></span>
                          <span>Facility: <span className="text-slate-700">{c.facility_name ?? 'Local PHC'}</span></span>
                          <span>Intake: {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(c.created_at).toLocaleDateString()})</span>
                        </div>
                      </div>

                      {/* Doctor Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setAdviceCase(c)
                            setAdviceText('')
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 transition active:scale-95"
                          title="Send Doctor Clinical Advice to Patient"
                        >
                          <Send className="h-3.5 w-3.5 text-blue-600" />
                          <span>Quick Advice</span>
                        </button>

                        <Link
                          to={`/app/hcw/cases/${c.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-blue-950 transition active:scale-95"
                        >
                          <span>Full 3-Panel Review</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Tele-calling & Voice Consultation Rounds */}
      {activeTab === 'telecalls' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 text-xs text-teal-900">
            <div className="flex items-center gap-2 font-bold text-teal-950 text-sm">
              <PhoneCall className="h-4 w-4 text-teal-700" />
              <span>Attending Doctor Follow-up Queue</span>
            </div>
            <p className="mt-1 text-teal-800">
              Patients requiring missing vital verification, post-intake symptom checks, or direct doctor tele-consultations.
            </p>
          </div>

          {followups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <PhoneCall className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No pending tele-calls scheduled right now.</p>
              <Link to="/app/hcw/voice" className="mt-2 inline-block text-xs font-bold text-blue-600 hover:underline">
                Open Tele-Calling Centre &rarr;
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {followups.map((fu) => (
                <div key={fu.id} className="card flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{fu.patient_name}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                        {fu.case_number}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        {fu.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">Follow-up reason: {fu.reason}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Created: {new Date(fu.created_at).toLocaleString()} · Channel: {fu.channel}
                    </p>
                  </div>

                  <Link
                    to={`/app/hcw/voice`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-teal-800 transition"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span>Dial Patient</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Safety Signal Monitor */}
      {activeTab === 'signals' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-950">
            <h3 className="font-bold text-sm text-red-900">Deterministic Clinical Red Flags in Current Shift</h3>
            <p className="mt-1 text-red-800">
              Signals configured by State Health Directorate (Breathing difficulty, Severe chest tightness, High fever with convulsions).
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4 border-l-4 border-l-red-600">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600" />
                <span className="font-bold text-sm text-slate-900">CHEST_PAIN</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Patient reports chest tightness, crushing discomfort or left arm radiation.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-red-700">Priority: URGENT_REVIEW</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500 font-mono">108 Ambulance Protocol</span>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-red-600">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600" />
                <span className="font-bold text-sm text-slate-900">BREATHING_DIFFICULTY</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Patient reports breathlessness, dyspnea, wheezing or inability to speak in sentences.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-red-700">Priority: URGENT_REVIEW</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500 font-mono">Immediate Oxygen / Triage</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Clinical Referrals & Handoffs */}
      {activeTab === 'handoffs' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            to="/app/hcw/referrals"
            className="card group flex flex-col justify-between p-5 hover:border-blue-400 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 group-hover:scale-105 transition-transform">
                <Hospital className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold text-slate-900">Hospital Referrals</h3>
              <p className="mt-1 text-xs text-slate-500">
                Initiate clinical transfer notes to SCB Medical College, Capital Hospital, or District Hospitals.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-purple-700">
              Manage Referrals &rarr;
            </span>
          </Link>

          <Link
            to="/app/hcw/followups"
            className="card group flex flex-col justify-between p-5 hover:border-blue-400 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 group-hover:scale-105 transition-transform">
                <MessageSquareText className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold text-slate-900">Follow-up Management</h3>
              <p className="mt-1 text-xs text-slate-500">
                Configure patient question banks, schedule automated telephone outreach, and inspect completed calls.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
              Open Follow-ups &rarr;
            </span>
          </Link>

          <Link
            to="/app/hcw/audit"
            className="card group flex flex-col justify-between p-5 hover:border-blue-400 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:scale-105 transition-transform">
                <FileText className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-bold text-slate-900">Clinical Audit Trail</h3>
              <p className="mt-1 text-xs text-slate-500">
                Immutable chronological log of all case reviews, safety reevaluations, and doctor-signed clinical notes.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-slate-700">
              View Audit Logs &rarr;
            </span>
          </Link>
        </div>
      )}

      {/* QUICK CLINICAL ADVICE MODAL */}
      {adviceCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-up">
            <button
              type="button"
              onClick={() => setAdviceCase(null)}
              className="absolute top-5 right-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Stethoscope className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Doctor Clinical Guidance & Advice
                </h2>
                <p className="text-xs text-slate-500">
                  Case #{adviceCase.case_number} · Patient: {adviceCase.patient_name}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
              <p className="font-semibold">Chief Concern:</p>
              <p className="mt-0.5 text-slate-700">{adviceCase.chief_concern ?? 'General Assessment'}</p>
            </div>

            {/* Quick Presets */}
            <div className="mt-3">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Quick Clinical Presets:
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESET_ADVICE.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAdviceText(preset)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition text-left line-clamp-1"
                  >
                    {preset.slice(0, 48)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Advice Input */}
            <form onSubmit={handleSendAdvice} className="mt-3 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Doctor Clinical Note & Patient Guidance:
                </label>
                <textarea
                  required
                  rows={4}
                  value={adviceText}
                  onChange={(e) => setAdviceText(e.target.value)}
                  placeholder="Enter medical instructions, non-diagnostic guidance, or follow-up instructions for the patient..."
                  className="input text-xs w-full leading-relaxed p-3"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAdviceCase(null)}
                  className="btn-outline text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdvice || !adviceText.trim()}
                  className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                >
                  {submittingAdvice ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Send Advice to Patient</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}