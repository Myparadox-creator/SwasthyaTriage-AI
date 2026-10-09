import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Loader2, MessageSquareText } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import type { FollowUpListResponse, FollowUpOut } from '../../../lib/types'
import { QC_STATUS_BADGE } from './hcwMeta'
import { FormDialog, LabeledInput } from './ui'

type Mode = 'view' | 'complete' | 'cancel'

export default function Followups() {
  const { t } = useTranslation()
  const [data, setData] = useState<FollowUpListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<FollowUpOut | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadList = useCallback(() => {
    api<FollowUpListResponse>('/api/followups', { params: { page_size: 100 } })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openDetail = useCallback(
    (fu: FollowUpOut) => {
      setSelected(fu)
      setMode('view')
      setAnswers({})
      setSummary('')
      setCancelReason('')
      setActionError(null)
      // Refresh so lifecycle decisions use the latest server state.
      api<FollowUpOut>(`/api/followups/${fu.id}`)
        .then((fresh) => setSelected(fresh))
        .catch(() => {
          /* keep the row data we already have */
        })
    },
    [],
  )

  const refresh = useCallback((updated: FollowUpOut) => {
    setSelected(updated)
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
    )
  }, [])

  const run = useCallback(
    (path: string, body?: unknown) => {
      setSaving(true)
      setActionError(null)
      api<FollowUpOut>(path, { method: 'POST', body })
        .then((res) => {
          refresh(res)
          setMode('view')
        })
        .catch((err) => {
          setActionError(err instanceof ApiError ? err.message : t('common.error'))
        })
        .finally(() => setSaving(false))
    },
    [refresh, t],
  )

  const submitComplete = () => {
    if (!selected) return
    const answerList = selected.items
      .map((item) => ({ item, value: (answers[item] ?? '').trim() }))
      .filter((a) => a.value.length > 0)
      .map((a) => ({ ...a, source: 'staff' }))
    run(`/api/followups/${selected.id}/complete`, {
      answers: answerList,
      summary: summary.trim() || undefined,
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('appShell.nav.followups')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('hcw.followups.subtitle')}</p>
      </div>

      <div className="mt-5">
        {loading && (
          <div className="flex h-40 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <div className="card p-6 text-center text-sm text-red-600">{error}</div>}
        {!loading && !error && (!data || data.items.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-500">{t('hcw.followups.empty')}</p>
          </div>
        )}
        {!loading && !error && data && data.items.length > 0 && (
          <ul className="space-y-2">
            {data.items.map((fu) => (
              <li key={fu.public_id}>
                <button
                  type="button"
                  onClick={() => openDetail(fu)}
                  className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <MessageSquareText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {fu.patient_name ?? fu.case_number} · {fu.case_number}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{fu.reason}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {fu.channel} · {new Date(fu.created_at).toLocaleString()} ·{' '}
                      {fu.requested_by_name ?? '—'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${QC_STATUS_BADGE[fu.status]}`}
                  >
                    {t(`hcw.followupStatus.${fu.status}`)}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <FormDialog
          title={`${selected.case_number ?? ''} · ${t('appShell.nav.followups')}`}
          onClose={() => setSelected(null)}
        >
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${QC_STATUS_BADGE[selected.status]}`}
              >
                {t(`hcw.followupStatus.${selected.status}`)}
              </span>
              <span className="text-[11px] text-slate-400">
                {t(`hcw.channel.${selected.channel}`)}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-700">{selected.reason}</p>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{t('hcw.followups.detail.requestedBy')}</span>
              <span className="text-slate-700">{selected.requested_by_name ?? '—'}</span>
              <span>{t('hcw.followups.detail.created')}</span>
              <span className="text-slate-700">{new Date(selected.created_at).toLocaleString()}</span>
              {selected.completed_at && (
                <>
                  <span>{t('hcw.followups.detail.completed')}</span>
                  <span className="text-slate-700">
                    {new Date(selected.completed_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>

            {selected.items.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-600">{t('hcw.followups.detail.items')}</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                  {selected.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            )}

            {selected.questions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-600">
                  {t('hcw.followups.detail.questions')}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                  {selected.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {selected.result_summary && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">
                  {t('hcw.followups.detail.resultSummary')}
                </p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">
                  {JSON.stringify(selected.result_summary, null, 2)}
                </pre>
              </div>
            )}

            {actionError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
                {actionError}
              </p>
            )}

            {mode === 'complete' && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  {t('hcw.followups.form.title')}
                </p>
                {selected.items.map((item) => (
                  <LabeledInput
                    key={item}
                    label={item}
                    value={answers[item] ?? ''}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [item]: v }))}
                  />
                ))}
                <LabeledInput
                  label={t('hcw.followups.form.summary')}
                  value={summary}
                  onChange={setSummary}
                  placeholder={t('hcw.followups.form.summaryPlaceholder')}
                  textarea
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={saving}
                    onClick={() => setMode('view')}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={submitComplete}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.followups.action.complete')}
                  </button>
                </div>
              </div>
            )}

            {mode === 'cancel' && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  {t('hcw.followups.form.cancelTitle')}
                </p>
                <LabeledInput
                  label={t('hcw.followups.form.cancelReason')}
                  value={cancelReason}
                  onChange={setCancelReason}
                  textarea
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={saving}
                    onClick={() => setMode('view')}
                  >
                    {t('common.back')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={() =>
                      run(`/api/followups/${selected.id}/cancel`, {
                        reason: cancelReason.trim() || undefined,
                      })
                    }
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.followups.action.cancel')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <Link
                to={`/app/hcw/cases/${selected.case_id}`}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {t('hcw.followups.detail.openCase')}
              </Link>
              <div className="flex gap-2">
                {selected.status === 'PENDING' && mode === 'view' && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={() => run(`/api/followups/${selected.id}/start`)}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.followups.action.start')}
                  </button>
                )}
                {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') &&
                  mode === 'view' && (
                    <>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={saving}
                        onClick={() => setMode('complete')}
                      >
                        {t('hcw.followups.action.enterResults')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-red-600"
                        disabled={saving}
                        onClick={() => setMode('cancel')}
                      >
                        {t('hcw.followups.action.cancel')}
                      </button>
                    </>
                  )}
              </div>
            </div>
          </div>
        </FormDialog>
      )}
    </div>
  )
}
