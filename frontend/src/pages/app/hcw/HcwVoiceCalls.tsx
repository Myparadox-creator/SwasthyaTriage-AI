import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { api } from '../../../lib/api'
import type {
  CaseListResponse,
  TeleCallListResponse,
  TeleCallOut,
  TeleCallTurnResponse,
} from '../../../lib/types'

const QUESTION_ITEMS = [
  { id: 'temperature', label: 'Current Body Temperature' },
  { id: 'medication', label: 'Current Medications Taken' },
  { id: 'duration', label: 'Symptom Duration & Onset' },
  { id: 'medical_history', label: 'Past Medical History (BP/Sugar)' },
  { id: 'spo2', label: 'Oxygen Saturation (SpO2) / Pulse' },
]

export default function HcwVoiceCalls() {
  const [calls, setCalls] = useState<TeleCallListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)


  // Modal State for New Tele-call
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cases, setCases] = useState<CaseListResponse | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('+91-9876543210')
  const [reason, setReason] = useState('Verification of acute symptoms and vitals')
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([
    'temperature',
    'medication',
    'duration',
  ])
  const [submitting, setSubmitting] = useState(false)

  // Active Interactive Tele-call Monitoring State
  const [activeCall, setActiveCall] = useState<TeleCallOut | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [stepping, setStepping] = useState(false)
  const [currentTurn, setCurrentTurn] = useState<TeleCallTurnResponse | null>(null)

  const fetchCalls = () => {
    setLoading(true)
    api<TeleCallListResponse>('/api/telecalls', { params: { page_size: 30 } })
      .then(setCalls)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch tele-calls'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCalls()
  }, [])

  // Fetch Cases for the dropdown when opening modal
  const openNewCallModal = () => {
    setIsModalOpen(true)
    api<CaseListResponse>('/api/cases', { params: { page_size: 20 } })
      .then((res) => {
        setCases(res)
        if (res.items.length > 0) {
          setSelectedCaseId(res.items[0].id)
        }
      })
      .catch(() => {})
  }

  const handleStartNewCall = async () => {
    if (!selectedCaseId) return
    setSubmitting(true)
    try {
      // 1. Create telecall
      const created = await api<TeleCallOut>('/api/telecalls', {
        method: 'POST',
        body: {
          case_id: selectedCaseId,
          phone_number: phoneNumber,
          reason,
          questions: selectedQuestions,
        },
      })

      // 2. Start dialing
      const connected = await api<TeleCallOut>(`/api/telecalls/${created.id}/start`, {
        method: 'POST',
      })

      setActiveCall(connected)
      setCallDuration(connected.duration_seconds || 15)
      setIsModalOpen(false)
      fetchCalls()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not initiate tele-call')
    } finally {
      setSubmitting(false)
    }
  }

  // Interactive conversational turn advancement
  const handleNextTurn = async () => {
    if (!activeCall) return
    setStepping(true)
    try {
      const turn = await api<TeleCallTurnResponse>(`/api/telecalls/${activeCall.id}/step`, {
        method: 'POST',
      })
      setCurrentTurn(turn)
      setCallDuration(turn.duration_seconds)

      // Refresh call detail for transcripts
      const updated = await api<TeleCallOut>(`/api/telecalls/${activeCall.id}`)
      setActiveCall(updated)

      if (turn.is_last_question) {
        // Complete call
        await api<TeleCallOut>(`/api/telecalls/${activeCall.id}/complete`, {
          method: 'POST',
        })
        const finalized = await api<TeleCallOut>(`/api/telecalls/${activeCall.id}`)
        setActiveCall(finalized)
        fetchCalls()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Step failed')
    } finally {
      setStepping(false)
    }
  }

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800">
            <PhoneCall className="h-3.5 w-3.5 text-teal-700" />
            <span>AI-Assisted Tele-calling Agent · VideoSDK & Python</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">
            Voice Calls & Tele-calling Center
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Initiate automated outbound follow-up calls to patients with missing intake information.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchCalls}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openNewCallModal}
            className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Start Follow-up Tele-call
          </button>
        </div>
      </div>

      {/* ACTIVE CALL LIVE MONITOR MODAL / DRAWER */}
      {activeCall && (
        <div className="rounded-3xl border-2 border-teal-500/50 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500 text-slate-950 font-black">
                <PhoneCall className="h-5 w-5 animate-pulse" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Active Follow-up Tele-call</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      activeCall.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-teal-500/20 text-teal-400 border border-teal-500/30 animate-pulse'
                    }`}
                  >
                    {activeCall.status === 'COMPLETED' ? 'Call Completed' : '● Patient Connected'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Case: {activeCall.case_number} · Patient: {activeCall.patient_name} · Phone:{' '}
                  {activeCall.phone_number}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Duration</span>
                <p className="font-mono text-base font-bold text-teal-300">
                  {formatSecs(callDuration)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCall(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Live Waveform & Transcripts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Left: Waveform & Speech Tracker */}
            <div className="space-y-4">
              <div className="flex h-20 items-center justify-center gap-1 rounded-2xl bg-slate-950 px-4">
                {[40, 70, 95, 30, 85, 60, 45, 90, 80, 50, 75, 95, 60, 40, 80, 65, 50, 85, 45].map(
                  (h, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-300 ${
                        activeCall.status === 'COMPLETED' ? 'bg-slate-700 h-2' : 'bg-teal-400 animate-pulse'
                      }`}
                      style={{
                        height: activeCall.status === 'COMPLETED' ? '15%' : `${h}%`,
                      }}
                    />
                  )
                )}
              </div>

              {/* Progress control */}
              {activeCall.status !== 'COMPLETED' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-xs font-semibold text-slate-300">
                    Live Question Progression:
                  </p>
                  <p className="mt-1 text-sm font-medium text-teal-200">
                    {currentTurn
                      ? `"${currentTurn.agent_question}"`
                      : '"Namaste, I am calling from SwasthyaTriage AI on behalf of your healthcare team..."'}
                  </p>
                  <button
                    type="button"
                    disabled={stepping}
                    onClick={handleNextTurn}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
                  >
                    {stepping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <PhoneForwarded className="h-4 w-4" />
                        Next Follow-up Question Turn
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                    <CheckCircle2 className="h-5 w-5" />
                    Call Finished & Extracted to Case
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Duration: {formatSecs(callDuration)} · Information appended to case file & re-evaluated by safety engine.
                  </p>
                  <Link
                    to={`/app/hcw/cases/${activeCall.case_id}`}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    View Updated Case <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* Right: Live Transcript Feed & Extracted Data */}
            <div className="space-y-4">
              <div className="max-h-56 overflow-y-auto space-y-2 rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Live Call Transcript:</span>
                {activeCall.transcripts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Connecting audio stream...</p>
                ) : (
                  activeCall.transcripts.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-xl p-2.5 text-xs ${
                        t.role === 'AI'
                          ? 'bg-teal-950/60 border border-teal-500/20 text-teal-200'
                          : 'bg-slate-900 border border-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="font-bold uppercase text-[10px] opacity-75">
                        {t.role === 'AI' ? '🤖 Telephony Agent:' : '👤 Patient:'}
                      </span>
                      <p className="mt-0.5">{t.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Extracted Data Badges */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase">
                  Extracted Clinical Values:
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeCall.extracted_data && Object.keys(activeCall.extracted_data).length > 0 ? (
                    Object.entries(activeCall.extracted_data).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-lg bg-teal-950 border border-teal-500/30 px-2.5 py-1 text-xs text-teal-300 font-medium"
                      >
                        <strong>{k}:</strong> {v}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Asking questions to extract values...</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CALL LOGS TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-800">Tele-call History & Transcripts</h2>
          </div>
          <span className="text-xs text-slate-500">
            Total Calls: {calls?.total || 0}
          </span>
        </div>

        {loading && (
          <div className="flex h-40 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (!calls || calls.items.length === 0) && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <Phone className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No tele-calls initiated yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Trigger follow-up calls above to collect missing information directly from patients.
            </p>
          </div>
        )}

        {!loading && !error && calls && calls.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">Call ID</th>
                  <th className="p-3">Case Number</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Questions</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Initiated</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.items.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-medium text-slate-900">{call.public_id}</td>
                    <td className="p-3 font-semibold text-teal-800">{call.case_number}</td>
                    <td className="p-3">
                      <p className="font-medium text-slate-800">{call.patient_name}</p>
                      <p className="text-[11px] text-slate-400">{call.phone_number}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          call.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : call.status === 'CONNECTED'
                            ? 'bg-teal-100 text-teal-800 animate-pulse'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-600">
                        {call.questions?.join(', ') || 'General Intake'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {call.duration_seconds ? formatSecs(call.duration_seconds) : '--'}
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(call.created_at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveCall(call)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-teal-700 hover:bg-teal-50"
                      >
                        Inspect Call
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW TELE-CALL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <PhoneCall className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Initiate Follow-up Tele-call</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Select Patient Case:</label>
                <select
                  value={selectedCaseId || ''}
                  onChange={(e) => setSelectedCaseId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
                >
                  {cases?.items.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.case_number} - {cs.patient_name} ({cs.chief_concern?.slice(0, 30) || 'Fever'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Patient Phone Number:</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Missing Information to Collect:</label>
                <div className="mt-1.5 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  {QUESTION_ITEMS.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedQuestions.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuestions([...selectedQuestions, item.id])
                          } else {
                            setSelectedQuestions(selectedQuestions.filter((q) => q !== item.id))
                          }
                        }}
                        className="rounded border-slate-300 accent-teal-700"
                      />
                      <span className="text-slate-800 font-medium">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Clinical Reason for Call:</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleStartNewCall}
                className="flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                Dial Patient Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
