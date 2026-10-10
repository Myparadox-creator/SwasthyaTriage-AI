import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Loader2, Search, X } from 'lucide-react'
import { api } from '../../../lib/api'
import type { CaseListResponse, CaseSource, CaseStatus, Priority } from '../../../lib/types'
import { PRIORITY_BADGE } from './hcwMeta'

const PAGE_SIZE = 20

interface QueueParams {
  q: string
  status: string
  priority: string
  source: string
  language: string
  page: number
}

const DEFAULT_PARAMS: QueueParams = {
  q: '',
  status: '',
  priority: '',
  source: '',
  language: '',
  page: 1,
}

export default function PatientQueue() {
  const { t } = useTranslation()
  const [params, setParams] = useState<QueueParams>(DEFAULT_PARAMS)
  const [data, setData] = useState<CaseListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    let active = true
    api<CaseListResponse>('/api/cases', {
      params: {
        q: params.q || undefined,
        status: params.status || undefined,
        priority: params.priority || undefined,
        source: params.source || undefined,
        language: params.language || undefined,
        page: params.page,
        page_size: PAGE_SIZE,
      },
    })
      .then((res) => {
        if (!active) return
        setData(res)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : t('common.error'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [params, t])

  const applySearch = useCallback(() => {
    setParams((p) => ({ ...p, q: searchInput.trim(), page: 1 }))
  }, [searchInput])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const sourceOpts: (CaseSource | '')[] = ['', 'CHAT', 'VOICE', 'DOCUMENT', 'TELECALL', 'MIXED']
  const languageOpts: (string | '')[] = ['', 'en', 'hi', 'od']

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('hcw.queue.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('hcw.queue.subtitle')}</p>
      </div>

      <div className="card mt-5 flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-0 flex-1 lg:basis-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch()
            }}
            placeholder={t('hcw.queue.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select
          value={params.status}
          onChange={(e) => setParams((p) => ({ ...p, status: e.target.value, page: 1 }))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t('hcw.queue.allStatus')}</option>
          {(['SUBMITTED', 'IN_REVIEW', 'FOLLOW_UP_REQUIRED', 'REVIEWED', 'ESCALATED', 'REFERRED', 'CLOSED', 'DRAFT'] as CaseStatus[]).map(
            (s) => (
              <option key={s} value={s}>
                {t(`hcw.status.${s}`)}
              </option>
            ),
          )}
        </select>
        <select
          value={params.priority}
          onChange={(e) => setParams((p) => ({ ...p, priority: e.target.value, page: 1 }))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t('hcw.queue.allPriority')}</option>
          {(['ROUTINE', 'REVIEW_REQUIRED', 'URGENT_REVIEW'] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {t(`hcw.priority.${p}`)}
            </option>
          ))}
        </select>
        <select
          value={params.source}
          onChange={(e) => setParams((p) => ({ ...p, source: e.target.value, page: 1 }))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          {sourceOpts.map((s) => (
            <option key={s} value={s}>
              {s ? t(`hcw.source.${s}`) : t('hcw.queue.allSource')}
            </option>
          ))}
        </select>
        <select
          value={params.language}
          onChange={(e) => setParams((p) => ({ ...p, language: e.target.value, page: 1 }))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          {languageOpts.map((l) => (
            <option key={l} value={l}>
              {l ? t(`hcw.language.${l}`) : t('hcw.queue.allLanguage')}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => {
          setParams({ ...DEFAULT_PARAMS, q: '' })
          setSearchInput('')
        }} className="btn-ghost shrink-0 px-3 py-2.5 text-sm">
          <X className="h-4 w-4" />
          {t('common.cancel')}
        </button>
        <button type="button" onClick={applySearch} className="btn-ghost shrink-0 px-3 py-2.5 text-sm">
          <Search className="h-4 w-4" />
          {t('common.search')}
        </button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4">
        {loading && (
          <div className="flex h-40 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && !error && (!data || data.items.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-500">{t('hcw.queue.empty')}</p>
          </div>
        )}

        {!loading && !error && data && data.items.length > 0 && (
          <>
            <div className="card divide-y divide-slate-100 overflow-hidden !p-0">
              {data.items.map((c) => (
                <Link
                  key={c.id}
                  to={`/app/hcw/cases/${c.id}`}
                  className="flex w-full flex-wrap items-center gap-3 p-4 transition hover:bg-brand-50/40"
                >
                  <span className="w-24 shrink-0 sm:w-28">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_BADGE[c.priority]}`}>
                      {t(`hcw.priority.${c.priority}`)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {c.patient_name} · {c.case_number}
                      {c.chief_concern && <span className="text-slate-500"> — {c.chief_concern}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {t(`hcw.status.${c.status}`)} · {t(`hcw.source.${c.source}`)} ·{' '}
                      {new Date(c.created_at).toLocaleString()}
                      {c.submitted_at && ` · ${t('hcw.queue.submitted')}: ${new Date(c.submitted_at).toLocaleString()}`}
                    </span>
                  </span>
                  {c.signal_count > 0 && (
                    <span className="hidden shrink-0 text-xs font-medium text-red-600 sm:inline">
                      {c.signal_count} {t('hcw.dashboard.signals')}
                    </span>
                  )}
                  {c.symptom_count > 0 && (
                    <span className="hidden shrink-0 text-xs text-slate-400 md:inline">
                      {c.symptom_count} {t('hcw.queue.symptomsLower')}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {t('hcw.queue.total', { total: data.total })} · {t('hcw.queue.page', { page: params.page, pages: totalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={params.page <= 1}
                  onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
                  className="btn-outline px-3 py-1.5 disabled:opacity-40"
                >
                  {t('common.back')}
                </button>
                <button
                  type="button"
                  disabled={params.page >= totalPages}
                  onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
                  className="btn-outline px-3 py-1.5 disabled:opacity-40"
                >
                  {t('hcw.queue.next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}