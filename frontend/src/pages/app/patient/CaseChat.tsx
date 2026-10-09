import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Radio,
  Send,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react'
import { api } from '../../../lib/api'
import type {
  CaseDetail,
  ChatHistoryResponse,
  ChatMessageOut,
  ChatSendResponse,
  QuestionOut,
  SubmitResponse,
} from '../../../lib/types'

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function CaseChat() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const caseIdNum = caseId && /^\d+$/.test(caseId) ? Number(caseId) : null
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [messages, setMessages] = useState<ChatMessageOut[]>([])
  const [questions, setQuestions] = useState<QuestionOut[]>([])
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 })
  const [canSubmit, setCanSubmit] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const refresh = useCallback(async (cid: number) => {
    const [hist, cs] = await Promise.all([
      api<ChatHistoryResponse>(`/api/cases/${cid}/chat`),
      api<CaseDetail>(`/api/cases/${cid}`),
    ])
    setMessages(hist.messages)
    setQuestions(hist.questions)
    setProgress(hist.progress)
    setCanSubmit(hist.can_submit)
    setDetail(cs)
  }, [])

  useEffect(() => {
    if (!caseIdNum) return
    let active = true
    Promise.all([
      api<ChatHistoryResponse>(`/api/cases/${caseIdNum}/chat`),
      api<CaseDetail>(`/api/cases/${caseIdNum}`),
    ])
      .then(([hist, cs]) => {
        if (!active) return
        setMessages(hist.messages)
        setQuestions(hist.questions)
        setProgress(hist.progress)
        setCanSubmit(hist.can_submit)
        setDetail(cs)
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
  }, [caseIdNum, t])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || !caseIdNum || sending) return
    setSending(true)
    setError(null)
    try {
      const optimistic: ChatMessageOut = {
        id: -1,
        public_id: 'pending',
        role: 'PATIENT',
        content: text,
        language: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])
      setInput('')
      const res = await api<ChatSendResponse>(`/api/cases/${caseIdNum}/chat`, {
        method: 'POST',
        body: { message: text, channel: 'CHAT', is_emergency: submitted },
      })
      await refresh(caseIdNum)
      setProgress(res.progress)
      setCanSubmit(res.can_submit)
    } catch (err) {
      setMessages((prev) => prev.filter((m, i) => !(m.id === -1 && i === prev.length - 1)))
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const submit = async () => {
    if (!caseIdNum || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api<SubmitResponse>(`/api/cases/${caseIdNum}/submit`, { method: 'POST' })
      setSubmitResult(res)
      setCanSubmit(false)
      if (detail) setDetail((d) => (d ? { ...d, status: res.status, ai_summary: d.ai_summary } : d))
      await refresh(caseIdNum)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const pickQuestion = (q: QuestionOut) => {
    setInput((prev) => {
      const base = prev.trim()
      return base ? `${base} ${q.text}` : q.text
    })
    inputRef.current?.focus()
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">{error ?? t('common.error')}</p>
          <button type="button" onClick={() => navigate('/app/patient/dashboard')} className="btn-primary mt-4">
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  const submitted = detail.status === 'SUBMITTED' || detail.status === 'REVIEWED' || !!submitResult

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('/app/patient/dashboard')} className="btn-ghost px-2 py-1 text-sm">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </button>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ClipboardList className="h-4 w-4" />
          <span className="font-medium text-slate-700">{detail.case_number}</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
            {detail.priority}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {submitted && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-brand-900">
            <CheckCircle2 className="h-5 w-5" />
            {t('patient.chat.submittedTitle')}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {t('patient.chat.submittedBody', { caseNumber: detail.case_number })}
          </p>
          {submitResult && submitResult.signals_detected > 0 && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-700">
              <ShieldAlert className="h-4 w-4" />
              {t('patient.chat.signalsNoted', { count: submitResult.signals_detected })}
            </p>
          )}
        </div>
      )}

      {!submitted && (
        <div className="card p-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{t('patient.chat.progress', { count: progress.answered, total: progress.total })}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${Math.max(progress.percent, 4)}%` }}
            />
          </div>
        </div>
      )}

      <div className="card flex h-[480px] flex-col overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
          <Stethoscope className="h-4 w-4 text-brand-700" />
          {t('patient.chat.assistantTitle')}
          <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-500">
            {t('patient.chat.aiLabel')}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
          {messages.map((m) => {
            const isDoctorAdvice = m.role === 'SYSTEM' || m.content.includes('Clinical Advice') || m.content.includes('[👨‍⚕️')
            const isPatient = m.role === 'PATIENT'

            if (isDoctorAdvice) {
              return (
                <div key={m.id} className="flex justify-start w-full animate-fadeIn">
                  <div className="max-w-[90%] rounded-2xl border-2 border-teal-500 bg-gradient-to-r from-teal-50 via-emerald-50 to-white p-4 shadow-md text-slate-900">
                    <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-teal-200">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-white text-xs font-bold">
                        👨‍⚕️
                      </span>
                      <div>
                        <span className="text-xs font-extrabold text-teal-900 block leading-tight">
                          Doctor's Clinical Advice & Prescription Instruction
                        </span>
                        <span className="text-[10px] font-semibold text-teal-700">
                          Verified Medical Team · {detail.facility?.name || 'Assigned Facility'}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-medium whitespace-pre-wrap text-slate-800 leading-relaxed">
                      {m.content.replace(/^\[.*?\]:\s*/, '')}
                    </p>
                    <div className="mt-2 text-right text-[10px] font-bold text-teal-800">
                      {fmtTime(m.created_at)}
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isPatient
                      ? 'rounded-br-sm bg-brand-700 text-white'
                      : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${isPatient ? 'text-white/70' : 'text-slate-400'}`}>
                    {isPatient ? t('patient.chat.you') : t('patient.chat.assistant')}
                  </div>
                  <p>{m.content}</p>
                  <div className={`mt-1 text-[10px] ${isPatient ? 'text-white/60' : 'text-slate-400'}`}>
                    {fmtTime(m.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!submitted && !canSubmit && questions.filter((q) => !q.satisfied).length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-3 py-2">
            {questions
              .filter((q) => !q.satisfied)
              .slice(0, 4)
              .map((q) => (
                <button
                  key={q.code}
                  type="button"
                  onClick={() => pickQuestion(q)}
                  className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-800 hover:bg-brand-100"
                >
                  {q.text.length > 40 ? `${q.text.slice(0, 40)}…` : q.text}
                </button>
              ))}
          </div>
        )}

        {/* Input box is ACTIVE both before and after submission for emergency queries */}
        <div className="border-t border-slate-200 bg-white p-3">
          {submitted && (
            <div className="mb-2 flex items-center justify-between text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
              <span className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="h-3.5 w-3.5 text-teal-700" />
                Emergency & Doctor Query Desk Active
              </span>
              <span className="text-[10px] text-slate-500">Dispatches instantly to on-duty staff</span>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder={
                submitted
                  ? 'Send urgent update or emergency message to doctors & facility staff...'
                  : t('patient.chat.placeholder')
              }
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || input.trim().length === 0}
              className="btn-primary h-11 w-11 shrink-0 !p-0 disabled:opacity-40"
              aria-label={t('patient.chat.send')}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {!submitted && canSubmit && (
        <div className="card flex flex-col items-center gap-3 p-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-brand-700" />
          <div>
            <p className="font-semibold text-slate-800">{t('patient.chat.readyTitle')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('patient.chat.readyBody')}</p>
          </div>
          <button type="button" onClick={submit} disabled={submitting} className="btn-primary w-full sm:w-auto">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('patient.chat.submit')}
          </button>
        </div>
      )}

      {!submitted && detail.symptoms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Radio className="h-3 w-3" />
          <span>{t('patient.chat.collected')}:</span>
          {detail.symptoms.map((s) => (
            <span key={s.id} className="rounded-full bg-slate-100 px-2 py-0.5">
              {s.term}
            </span>
          ))}
          {detail.measurements.map((m) => (
            <span key={m.id} className="rounded-full bg-slate-100 px-2 py-0.5">
              {m.name}: {m.value} {m.unit ?? ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}