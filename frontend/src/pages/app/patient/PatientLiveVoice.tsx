import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Mic,
  PhoneOff,
  Radio,
  Send,
  Volume2,
} from 'lucide-react'
import { api, getAccessToken } from '../../../lib/api'
import type { CaseDetail, VoiceSessionOut } from '../../../lib/types'
import { startLiveVoice, type LiveStatus, type LiveVoiceController } from '../../../lib/liveVoice'

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error'

interface Turn {
  role: 'patient' | 'sonam'
  text: string
}

export default function PatientLiveVoice() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'en' | 'hi' | 'od'>('hi')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [session, setSession] = useState<VoiceSessionOut | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [patientBuffer, setPatientBuffer] = useState('')
  const [sonamBuffer, setSonamBuffer] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const controllerRef = useRef<LiveVoiceController | null>(null)
  const patientBufRef = useRef('')
  const sonamBufRef = useRef('')

  useEffect(() => {
    return () => {
      controllerRef.current?.stop()
    }
  }, [])

  const flushTurn = () => {
    const p = patientBufRef.current.trim()
    const s = sonamBufRef.current.trim()
    if (p || s) {
      setTurns((prev) => [
        ...prev,
        ...(p ? [{ role: 'patient' as const, text: p }] : []),
        ...(s ? [{ role: 'sonam' as const, text: s }] : []),
      ])
    }
    patientBufRef.current = ''
    sonamBufRef.current = ''
    setPatientBuffer('')
    setSonamBuffer('')
  }

  const start = async () => {
    setPhase('connecting')
    setStatus('connecting')
    setErrorMsg(null)
    setTurns([])
    patientBufRef.current = ''
    sonamBufRef.current = ''
    try {
      const newCase = await api<CaseDetail>('/api/cases', {
        method: 'POST',
        body: {
          language: lang,
          chief_concern: null,
          consent_accepted: true,
          consent_text_version: 'v1_live_voice',
        },
      })
      setCaseDetail(newCase)

      const created = await api<VoiceSessionOut>(`/api/cases/${newCase.id}/voice/sessions`, {
        method: 'POST',
        body: { language: lang },
      })
      setSession(created)

      const token = getAccessToken()
      if (!token) throw new Error('Your session has expired. Please sign in again.')

      const controller = startLiveVoice(
        { caseId: newCase.id, sessionId: created.public_id, token },
        {
          onStatus: (next) => {
            setStatus(next)
            if (next === 'listening' || next === 'speaking' || next === 'ready') {
              setPhase('live')
            }
          },
          onInputTranscript: (fragment) => {
            patientBufRef.current += fragment
            setPatientBuffer(patientBufRef.current)
          },
          onOutputTranscript: (fragment) => {
            sonamBufRef.current += fragment
            setSonamBuffer(sonamBufRef.current)
          },
          onTurnComplete: flushTurn,
          onError: (message) => {
            setErrorMsg(message)
            setPhase('error')
          },
        }
      )
      controllerRef.current = controller
    } catch (err) {
      setPhase('error')
      setErrorMsg(err instanceof Error ? err.message : 'Could not start realtime voice session')
    }
  }

  const finalizeCase = async (): Promise<void> => {
    if (!caseDetail) return
    controllerRef.current?.end()
    flushTurn()
    if (session) {
      try {
        await api(`/api/cases/${caseDetail.id}/voice/sessions/${session.public_id}/complete`, {
          method: 'POST',
        })
      } catch {
        /* session may already be closed */
      }
    }
    await api(`/api/cases/${caseDetail.id}/submit`, { method: 'POST' })
  }

  const submitToDoctor = async () => {
    if (!caseDetail) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      await finalizeCase()
      setPhase('ended')
      navigate(`/app/patient/cases/${caseDetail.id}`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send case to the doctor')
    } finally {
      setSubmitting(false)
    }
  }

  const endCall = async () => {
    if (!caseDetail) {
      navigate('/app/patient/dashboard')
      return
    }
    controllerRef.current?.end()
    flushTurn()
    if (session) {
      try {
        await api(`/api/cases/${caseDetail.id}/voice/sessions/${session.public_id}/complete`, {
          method: 'POST',
        })
      } catch {
        /* noop */
      }
    }
    navigate(`/app/patient/cases/${caseDetail.id}`)
  }

  const statusLabel =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'speaking'
      ? 'Sonam is speaking'
      : status === 'listening'
      ? 'Listening — speak naturally'
      : status === 'closed'
      ? 'Call ended'
      : status === 'error'
      ? 'Error'
      : 'Ready'

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/app/patient/dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as 'en' | 'hi' | 'od')}
          disabled={phase === 'live' || phase === 'connecting'}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="en">English</option>
          <option value="od">ଓଡ଼ିଆ (Odia)</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-teal-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <Radio className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900">Realtime Live with Sonam</h1>
              <p className="truncate text-[11px] text-slate-500">
                Full-duplex streaming voice · Gemini Live native audio
              </p>
            </div>
          </div>
          {phase === 'live' || phase === 'connecting' ? (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                status === 'speaking'
                  ? 'bg-blue-100 text-blue-800'
                  : status === 'listening'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {statusLabel}
            </span>
          ) : null}
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {phase === 'idle' && (
            <div className="mx-auto max-w-md space-y-4 py-6 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-100 text-teal-700 shadow-md">
                <Mic className="h-8 w-8" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Start a realtime voice call</h2>
              <p className="text-xs leading-relaxed text-slate-600">
                This opens a live audio stream to Sonam. You can interrupt her at any time — she
                hears you while she speaks. Your conversation is transcribed and sent to the doctor.
              </p>
              <button
                type="button"
                onClick={start}
                className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800 active:scale-95"
              >
                <Radio className="h-4 w-4" />
                Start Realtime Call
              </button>
            </div>
          )}

          {phase !== 'idle' && (
            <>
              <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                {turns.length === 0 && !patientBuffer && !sonamBuffer && (
                  <p className="py-6 text-center text-xs italic text-slate-400">
                    Connecting to Sonam…
                  </p>
                )}
                {turns.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex ${turn.role === 'patient' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        turn.role === 'patient'
                          ? 'bg-teal-700 text-white'
                          : 'border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                        {turn.role === 'patient' ? 'You' : 'Sonam'}
                      </div>
                      {turn.text}
                    </div>
                  </div>
                ))}
                {sonamBuffer && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                        <Volume2 className="h-3 w-3" />
                        Sonam
                      </div>
                      {sonamBuffer}
                    </div>
                  </div>
                )}
                {patientBuffer && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-teal-600 px-3.5 py-2 text-sm text-white shadow-sm opacity-90">
                      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                        You (live)
                      </div>
                      {patientBuffer}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={submitToDoctor}
                  disabled={submitting || phase === 'ended'}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 transition hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit Direct to Doctor
                </button>
                <button
                  type="button"
                  onClick={endCall}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <PhoneOff className="h-4 w-4 text-red-500" />
                  End & View Case
                </button>
              </div>
            </>
          )}

          {errorMsg && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => navigate('/app/patient/voice')}
                className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
              >
                Use turn-based voice
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
