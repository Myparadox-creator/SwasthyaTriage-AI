import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  Loader2,
  MessageSquarePlus,
  PhoneCall,
  Save,
  Send,
  Sparkles,
  Stethoscope,
  UserPlus,
} from 'lucide-react'
import { api, fetchBlob } from '../../../lib/api'
import type {
  AiSummaryResponse,
  CaseDetail,
  ChatHistoryResponse,
  ChatMessageOut,
  DocumentExtractionStructured,
  DocumentOut,
  FollowUpOut,
  ReviewNoteOut,
  ReviewOutcome,
} from '../../../lib/types'
import { PROVENANCE_BADGE } from './hcwMeta'
import { FormDialog, LabeledInput } from './ui'

const NO_DATA = '—'

export default function CaseReview() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const caseIdNum = caseId && /^\d+$/.test(caseId) ? Number(caseId) : null
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [messages, setMessages] = useState<ChatMessageOut[] | null>(null)
  const [notes, setNotes] = useState<ReviewNoteOut[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [noteText, setNoteText] = useState('')
  const [showEscalate, setShowEscalate] = useState(false)
  const [showFollowup, setShowFollowup] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  const [aiBox, setAiBox] = useState<AiSummaryResponse | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  const [fuReason, setFuReason] = useState('')
  const [fuItems, setFuItems] = useState('')
  const [fuChannel, setFuChannel] = useState<'TELECALL' | 'CHAT' | 'IN_APP_VOICE'>('TELECALL')
  const [refDestination, setRefDestination] = useState('')
  const [refReason, setRefReason] = useState('')

  const refresh = useCallback(async (cid: number) => {
    const [detail, hist] = await Promise.all([
      api<CaseDetail>(`/api/cases/${cid}`),
      api<ChatHistoryResponse>(`/api/cases/${cid}/chat`),
    ])
    setCaseData(detail)
    setMessages(hist.messages)
    setNotes(detail.review_notes)
  }, [])

  useEffect(() => {
    if (!caseIdNum) return
    let active = true
    Promise.all([
      api<CaseDetail>(`/api/cases/${caseIdNum}`),
      api<ChatHistoryResponse>(`/api/cases/${caseIdNum}/chat`),
    ])
      .then(([detail, hist]) => {
        if (!active) return
        setCaseData(detail)
        setMessages(hist.messages)
        setNotes(detail.review_notes)
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

  const run = useCallback(
    async (action: string, fn: () => Promise<CaseDetail | ReviewOutcome | FollowUpOut>, then?: () => void) => {
      if (!caseIdNum) return
      setBusy(action)
      setActionError(null)
      try {
        await fn()
        await refresh(caseIdNum)
        then?.()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setBusy(null)
      }
    },
    [caseIdNum, refresh, t],
  )

  const addNote = () => {
    const note = noteText.trim()
    if (!note || !caseIdNum || busy) return
    setBusy('note')
    setActionError(null)
    api<ReviewNoteOut>(`/api/cases/${caseIdNum}/notes`, { method: 'POST', body: { note } })
      .then((created) => {
        setNoteText('')
        setNotes((prev) => [...(prev ?? []), created])
        void refresh(caseIdNum)
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setBusy(null))
  }

  const sendDoctorReply = () => {
    const message = noteText.trim()
    if (!message || !caseIdNum || busy) return
    setBusy('reply')
    setActionError(null)
    api(`/api/cases/${caseIdNum}/reply`, { method: 'POST', body: { message } })
      .then(() => {
        setNoteText('')
        void refresh(caseIdNum)
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setBusy(null))
  }

  const generateSummary = () => {
    if (!caseIdNum || aiBusy) return
    setAiBusy(true)
    setActionError(null)
    api<AiSummaryResponse>(`/api/cases/${caseIdNum}/ai-summary`, { method: 'POST' })
      .then((res) => {
        setAiBox(res)
        void refresh(caseIdNum)
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setAiBusy(false))
  }

  const docStructured = (doc: DocumentOut): DocumentExtractionStructured | null =>
    doc.extractions.find((e) => e.structured)?.structured ?? null

  const markReviewed = () => {
    if (!caseIdNum || busy) return
    void run('review', () =>
      api<ReviewOutcome>(`/api/cases/${caseIdNum}/review`, { method: 'POST', body: {} }),
    )
  }

  const requestFollowup = () => {
    if (!caseIdNum || busy || fuReason.trim().length < 3) return
    void run('followup', () =>
      api<FollowUpOut>(`/api/cases/${caseIdNum}/followups`, {
        method: 'POST',
        body: {
          reason: fuReason.trim(),
          items: fuItems.split(',').map((s) => s.trim()).filter(Boolean),
          channel: fuChannel,
        },
      }),
      () => {
        setShowFollowup(false)
        setFuReason('')
        setFuItems('')
      },
    )
  }

  const prepareReferral = () => {
    if (!caseIdNum || busy) return
    void run('referral', () =>
      api(`/api/cases/${caseIdNum}/referral`, {
        method: 'POST',
        body: { destination_facility: refDestination.trim() || undefined, reason_for_referral: refReason.trim() || undefined },
      }),
      () => {
        setShowReferral(false)
        setRefDestination('')
        setRefReason('')
      },
    )
  }

  const escalate = () => {
    if (!caseIdNum || busy) return
    void run('escalate', () =>
      api<CaseDetail>(`/api/cases/${caseIdNum}/escalate`, {
        method: 'POST',
        body: { decision: 'CONFIRM' },
      }),
      () => setShowEscalate(false),
    )
  }

  const assignToMe = () => {
    if (!caseIdNum || busy) return
    void run('assign', () => api<CaseDetail>(`/api/cases/${caseIdNum}/assign`, { method: 'POST', body: {} }))
  }

  const viewDoc = async (doc: DocumentOut) => {
    if (!caseIdNum) return
    try {
      const blob = await fetchBlob(`/api/cases/${caseIdNum}/documents/${doc.id}/file`)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">{error ?? t('common.error')}</p>
          <button type="button" onClick={() => navigate('/app/hcw/queue')} className="btn-primary mt-4">
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  const d = caseData
  const canReview = ['SUBMITTED', 'IN_REVIEW', 'FOLLOW_UP_REQUIRED'].includes(d.status)
  const isActive = ['SUBMITTED', 'IN_REVIEW', 'FOLLOW_UP_REQUIRED', 'REVIEWED'].includes(d.status)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/app/hcw/queue')}
            className="btn-ghost px-2 py-1 text-sm"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ClipboardList className="h-5 w-5 text-brand-700" />
          <span className="text-sm font-bold text-slate-900">{d.case_number}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t(`hcw.status.${d.status}`)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caseData.assigned_reviewer ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <UserPlus className="h-3 w-3" />
              {t('hcw.review.assignedTo')} {caseData.assigned_reviewer.full_name}
            </span>
          ) : canReview ? (
            <button type="button" onClick={assignToMe} disabled={busy === 'assign'} className="btn-ghost px-3 py-1.5 text-xs">
              {busy === 'assign' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {t('hcw.review.assignToMe')}
            </button>
          ) : null}
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {actionError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* LEFT: Original information */}
        <section className="card min-w-0 !p-0 lg:col-span-1">
          <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4 text-brand-700" />
            {t('hcw.review.originalInfo')}
          </header>
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('hcw.review.patient')}</h3>
            <p className="mt-1 text-sm font-medium text-slate-800">{d.patient.full_name ?? NO_DATA}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {d.patient.phone ?? NO_DATA} · {d.patient.age ?? NO_DATA} · {d.patient.gender ?? NO_DATA}
            </p>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('hcw.review.chiefConcern')}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{d.chief_concern ?? NO_DATA}</p>

            {d.timeline_text && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('hcw.review.timeline')}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{d.timeline_text}</p>
              </>
            )}
          </div>

          <div className="border-t border-slate-100 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('hcw.review.chatTranscript')} {d.language && <span className="normal-case">· {d.language}</span>}
            </h3>
            {messages === null ? (
              <div className="flex h-16 items-center justify-center text-slate-300">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">{t('hcw.review.noChat')}</p>
            ) : (
              <ol className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <li key={m.id} className={`flex ${m.role === 'PATIENT' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                        m.role === 'PATIENT'
                          ? 'rounded-br-sm bg-brand-700 text-white'
                          : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div className={`mt-1 text-[10px] ${m.role === 'PATIENT' ? 'text-white/60' : 'text-slate-400'}`}>
                        {m.role === 'PATIENT' ? t('patient.chat.you') : t('patient.chat.assistant')} ·{' '}
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {d.documents.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('patient.uploads.listTitle')}</h3>
              <ul className="mt-2 space-y-1.5">
                {d.documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => void viewDoc(doc)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {t(`patient.uploads.status.${doc.status}`)}
                      </span>
                    </button>
                    {doc.extractions.find((e) => e.raw_text) && (
                      <p className="ml-6 mt-1 line-clamp-2 text-[11px] text-slate-500">
                        {doc.extractions.find((e) => e.raw_text)?.raw_text}
                      </p>
                    )}
                    {docStructured(doc) && (
                      <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5">
                        {docStructured(doc)!.symptoms.map((s) => (
                          <span key={`s-${s}`} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                            {s}
                          </span>
                        ))}
                        {docStructured(doc)!.measurements.map((m) => (
                          <span
                            key={`m-${m.name}-${m.value}`}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                          >
                            {m.name} {m.value} {m.unit ?? ''}
                          </span>
                        ))}
                        {docStructured(doc)!.duration && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {docStructured(doc)!.duration}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* CENTER: AI summary + organized picture */}
        <div className="min-w-0 space-y-4 lg:col-span-1">
          <section className="card min-w-0 !p-0">
            <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              <Sparkles className="h-4 w-4 text-brand-700" />
              {t('hcw.case.aiSummary.title')}
              <span className="ml-auto rounded bg-brand-50 px-2 py-0.5 text-[11px] font-normal text-brand-700">
                {aiBox?.provider ?? t('hcw.case.aiSummary.providerLabel')}
              </span>
            </header>
            <div className="space-y-3 p-4">
              {aiBox ? (
                <>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{aiBox.summary}</p>
                  <p className="text-[11px] text-slate-400">
                    {t('hcw.case.aiSummary.generated', {
                      at: new Date(aiBox.generated_at).toLocaleString(),
                    })}
                  </p>
                  {aiBox.suggested_questions.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {t('hcw.case.aiSummary.questions')}
                      </h4>
                      <ul className="mt-1 space-y-1">
                        {aiBox.suggested_questions.map((q) => (
                          <li
                            key={q.code}
                            className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                          >
                            {q.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">{t('hcw.case.aiSummary.empty')}</p>
              )}
              <button
                type="button"
                onClick={() => void generateSummary()}
                disabled={aiBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-800 disabled:opacity-60"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {t(aiBox ? 'hcw.case.aiSummary.regenerate' : 'hcw.case.aiSummary.generate')}
              </button>
            </div>
          </section>

          <section className="card min-w-0 !p-0">
          <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            <Stethoscope className="h-4 w-4 text-brand-700" />
            {t('hcw.review.organized')}
            <span className="ml-auto rounded bg-brand-50 px-2 py-0.5 text-[11px] font-normal text-brand-700">
              {t('patient.chat.aiLabel')}
            </span>
          </header>

          <div className="space-y-5 p-4">
            <Block label={t('hcw.review.symptoms')}>
              {d.symptoms.length === 0 ? (
                <EmptyLine>{NO_DATA}</EmptyLine>
              ) : (
                <ul className="space-y-1.5">
                  {d.symptoms.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-800">{s.term}</span>
                      <ProvenanceBadge src={s.source} t={t} />
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block label={t('hcw.review.measurements')}>
              {d.measurements.length === 0 ? (
                <EmptyLine>{NO_DATA}</EmptyLine>
              ) : (
                <ul className="space-y-1.5">
                  {d.measurements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-800">
                        {m.name}: {m.value} {m.unit ?? ''}
                      </span>
                      <ProvenanceBadge src={m.source} t={t} />
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block label={t('hcw.review.missingInfo')} muted>
              {d.missing_information.length === 0 ? (
                <EmptyLine>{t('hcw.review.nothingMissing')}</EmptyLine>
              ) : (
                <ul className="space-y-1">
                  {d.missing_information.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block label={t('hcw.review.safetySignals')} danger>
              {d.safety_signals.length === 0 ? (
                <EmptyLine>{t('hcw.review.noSignals')}</EmptyLine>
              ) : (
                <ul className="space-y-1.5">
                  {d.safety_signals.map((sig, i) => (
                    <li key={sig.id ?? i} className="flex items-start gap-2 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{sig.label || sig.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>
        </section>
      </div>

      {/* RIGHT: Actions + Review notes */}
      <section className="card min-w-0 !p-0 lg:col-span-1">
        <header className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {t('hcw.review.actionsTitle')}
        </header>

        <div className="space-y-4 p-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t('hcw.review.addNote')}
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Clinical advice for patient or internal staff note..."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={sendDoctorReply}
                disabled={!noteText.trim() || busy !== null}
                className="btn-primary w-full text-xs py-2 disabled:opacity-40"
                title="Sends official clinical advice to patient chat and alerts all facility staff"
              >
                {busy === 'reply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send Advice to Patient & Org
              </button>
              <button
                type="button"
                onClick={addNote}
                disabled={!noteText.trim() || busy !== null}
                className="btn-secondary w-full text-xs py-2 disabled:opacity-40"
                title="Saves an internal staff note and notifies facility members"
              >
                {busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Internal Note
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={markReviewed}
              disabled={d.status === 'REVIEWED' || !isActive || busy !== null}
              className="btn-primary w-full disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              {d.status === 'REVIEWED' ? t('hcw.review.alreadyReviewed') : t('hcw.review.markReviewed')}
            </button>

            <button
              type="button"
              onClick={() => setShowFollowup(true)}
              disabled={!isActive || busy !== null}
              className="btn-secondary w-full disabled:opacity-40"
            >
              <MessageSquarePlus className="h-4 w-4" />
              {t('hcw.review.requestFollowup')}
            </button>

            <button
              type="button"
              onClick={() => setShowReferral(true)}
              disabled={!isActive || busy !== null}
              className="btn-outline w-full disabled:opacity-40"
            >
              <PhoneCall className="h-4 w-4" />
              {t('hcw.review.prepareReferral')}
            </button>

            <button
              type="button"
              onClick={() => setShowEscalate(true)}
              disabled={d.status === 'ESCALATED' || !isActive || busy !== null}
              className="btn-ghost w-full border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Flag className="h-4 w-4" />
              {d.status === 'ESCALATED' ? t('hcw.review.alreadyEscalated') : t('hcw.review.escalate')}
            </button>
          </div>
        </div>

          <div className="border-t border-slate-100 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('hcw.review.notesTitle')}</h3>
            {notes === null ? (
              <div className="flex h-16 items-center justify-center text-slate-300">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">{t('hcw.review.noNotes')}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{n.note}</p>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {n.author_full_name ?? NO_DATA} · {n.author_role ?? ''} · {new Date(n.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {showEscalate && (
        <ConfirmDialog
          title={t('hcw.review.escalateConfirmTitle')}
          body={t('hcw.review.escalateConfirmBody')}
          confirmLabel={t('hcw.review.escalate')}
          busy={busy === 'escalate'}
          onCancel={() => setShowEscalate(false)}
          onConfirm={escalate}
        />
      )}

      {showFollowup && (
        <FormDialog title={t('hcw.review.requestFollowup')} onClose={() => setShowFollowup(false)}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('hcw.review.fuReason')}</span>
            <textarea
              value={fuReason}
              onChange={(e) => setFuReason(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('hcw.review.fuItems')}</span>
            <input
              value={fuItems}
              onChange={(e) => setFuItems(e.target.value)}
              placeholder={t('hcw.review.fuItemsHint')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('hcw.review.fuChannel')}</span>
            <select
              value={fuChannel}
              onChange={(e) => setFuChannel(e.target.value as 'TELECALL' | 'CHAT' | 'IN_APP_VOICE')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            >
              <option value="TELECALL">{t('hcw.channel.TELECALL')}</option>
              <option value="CHAT">{t('hcw.channel.CHAT')}</option>
              <option value="IN_APP_VOICE">{t('hcw.channel.IN_APP_VOICE')}</option>
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowFollowup(false)} className="btn-ghost px-4 py-2 text-sm">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={requestFollowup}
              disabled={fuReason.trim().length < 3 || busy === 'followup'}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              {busy === 'followup' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.submit')}
            </button>
          </div>
        </FormDialog>
      )}

      {showReferral && (
        <FormDialog title={t('hcw.review.prepareReferral')} onClose={() => setShowReferral(false)}>
          <LabeledInput label={t('hcw.review.refDestination')} value={refDestination} onChange={setRefDestination} placeholder={t('hcw.review.refDestinationHint')} />
          <LabeledInput label={t('hcw.review.refReason')} value={refReason} onChange={setRefReason} placeholder={t('hcw.review.refReasonHint')} textarea />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {t('hcw.review.referralNote')}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowReferral(false)} className="btn-ghost px-4 py-2 text-sm">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={prepareReferral}
              disabled={busy === 'referral'}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              {busy === 'referral' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.submit')}
            </button>
          </div>
        </FormDialog>
      )}
    </div>
  )
}

function Block({ label, children, muted, danger }: { label: string; children: React.ReactNode; muted?: boolean; danger?: boolean }) {
  const tone = danger ? 'text-red-700' : muted ? 'text-slate-400' : 'text-slate-400'
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>
}

function ProvenanceBadge({ src, t }: { src: string; t: (key: string) => string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PROVENANCE_BADGE[src as keyof typeof PROVENANCE_BADGE] ?? 'bg-slate-100 text-slate-600'}`}>
      {t(`hcw.provenance.${src}`)}
    </span>
  )
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="flex items-center gap-2 font-semibold text-red-700">
          <AlertTriangle className="h-5 w-5" />
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2 text-sm">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-primary bg-red-700 px-4 py-2 text-sm hover:bg-red-800 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
