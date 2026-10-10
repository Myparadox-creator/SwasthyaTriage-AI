import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Loader2, PhoneCall } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import type { ReferralListResponse, ReferralOut } from '../../../lib/types'
import { QC_STATUS_BADGE } from './hcwMeta'
import { FormDialog } from './ui'

export default function Referrals() {
  const { t } = useTranslation()
  const [data, setData] = useState<ReferralListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<ReferralOut | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadList = useCallback(() => {
    api<ReferralListResponse>('/api/referrals', { params: { page_size: 100 } })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openDetail = useCallback((ref: ReferralOut) => {
    setSelected(ref)
    setActionError(null)
    api<ReferralOut>(`/api/referrals/${ref.id}`)
      .then((fresh) => setSelected(fresh))
      .catch(() => {
        /* keep the row data we already have */
      })
  }, [])

  const upsert = useCallback((updated: ReferralOut) => {
    setSelected(updated)
    setData((prev) => {
      if (!prev) return prev
      const exists = prev.items.some((i) => i.id === updated.id)
      return {
        ...prev,
        items: exists
          ? prev.items.map((i) => (i.id === updated.id ? updated : i))
          : [updated, ...prev.items],
      }
    })
  }, [])

  const run = useCallback(
    (path: string, body?: unknown) => {
      setSaving(true)
      setActionError(null)
      api<ReferralOut>(path, { method: 'POST', body })
        .then(upsert)
        .catch((err) => {
          if (err instanceof ApiError && err.code === 'version_conflict') {
            // Someone else changed the referral — reload everything.
            loadList()
            setActionError(t('hcw.referrals.action.reload'))
            api<ReferralOut>(`/api/referrals/${selected?.id ?? 0}`)
              .then((fresh) => setSelected(fresh))
              .catch(() => undefined)
          } else {
            setActionError(err instanceof ApiError ? err.message : t('common.error'))
          }
        })
        .finally(() => setSaving(false))
    },
    [loadList, selected, t, upsert],
  )

  const draftEntries = selected
    ? Object.entries(selected.draft ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : []

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('appShell.nav.referrals')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('hcw.referrals.subtitle')}</p>
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
            <p className="text-sm text-slate-500">{t('hcw.referrals.empty')}</p>
          </div>
        )}
        {!loading && !error && data && data.items.length > 0 && (
          <ul className="space-y-2">
            {data.items.map((ref) => (
              <li key={ref.public_id}>
                <button
                  type="button"
                  onClick={() => openDetail(ref)}
                  className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <PhoneCall className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {ref.patient_name ?? ref.case_number} · {ref.case_number}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {ref.destination_facility ?? t('hcw.referrals.noDestination')} ·{' '}
                      {ref.reason_for_referral ?? t('hcw.referrals.noReason')}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {new Date(ref.created_at).toLocaleString()} · {ref.created_by_name ?? '—'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${QC_STATUS_BADGE[ref.status]}`}
                  >
                    {t(`hcw.referralStatus.${ref.status}`)}
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
          title={`${selected.case_number ?? ''} · ${t('appShell.nav.referrals')}`}
          onClose={() => setSelected(null)}
        >
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${QC_STATUS_BADGE[selected.status]}`}
              >
                {t(`hcw.referralStatus.${selected.status}`)}
              </span>
              <span className="text-[11px] text-slate-400">
                {t('hcw.referrals.detail.version', { n: selected.version })}
                {selected.supersedes_id
                  ? ` · ${t('hcw.referrals.detail.supersedes', { id: selected.supersedes_id })}`
                  : ''}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{t('hcw.referrals.detail.destination')}</span>
              <span className="break-words text-slate-700">
                {selected.destination_facility ?? t('hcw.referrals.noDestination')}
              </span>
              <span>{t('hcw.referrals.detail.reason')}</span>
              <span className="break-words text-slate-700">
                {selected.reason_for_referral ?? t('hcw.referrals.noReason')}
              </span>
              <span>{t('hcw.referrals.detail.created')}</span>
              <span className="break-words text-slate-700">
                {new Date(selected.created_at).toLocaleString()}
              </span>
              {selected.verified_at && (
                <>
                  <span>{t('hcw.referrals.detail.verified')}</span>
                  <span className="break-words text-slate-700">
                    {new Date(selected.verified_at).toLocaleString()}
                  </span>
                </>
              )}
              {selected.finalized_at && (
                <>
                  <span>{t('hcw.referrals.detail.finalized')}</span>
                  <span className="break-words text-slate-700">
                    {new Date(selected.finalized_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>

            {draftEntries.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">
                  {t('hcw.referrals.detail.draft')}
                </p>
                <dl className="mt-1 space-y-1 text-[11px]">
                  {draftEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{k}</dt>
                      <dd className="break-words text-right text-slate-700">
                        {typeof v === 'string' ? v : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {actionError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
                {actionError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <Link
                to={`/app/hcw/cases/${selected.case_id}`}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {t('hcw.referrals.detail.openCase')}
              </Link>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'DRAFT' && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={() => run(`/api/referrals/${selected.id}/verify`)}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.referrals.action.verify')}
                  </button>
                )}
                {selected.status === 'VERIFIED' && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={() =>
                      run(`/api/referrals/${selected.id}/finalize`, { version: selected.version })
                    }
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.referrals.action.finalize')}
                  </button>
                )}
                {selected.status !== 'DRAFT' && (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={saving}
                    onClick={() => run(`/api/referrals/${selected.id}/revise`)}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('hcw.referrals.action.revise')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </FormDialog>
      )}
    </div>
  )
}
