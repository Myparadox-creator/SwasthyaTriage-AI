import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, ScrollText } from 'lucide-react'
import { api } from '../../../lib/api'
import type { AuditLogListResponse } from '../../../lib/types'

export default function AuditCenter() {
  const { t } = useTranslation()
  const [data, setData] = useState<AuditLogListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api<AuditLogListResponse>('/api/audit-logs', { params: { page_size: 100 } })
      .then((res) => {
        if (active) setData(res)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('common.error'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [t])

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('appShell.nav.audit')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('hcw.audit.subtitle')}</p>
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
            <p className="text-sm text-slate-500">{t('hcw.audit.empty')}</p>
          </div>
        )}
        {!loading && !error && data && data.items.length > 0 && (
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('hcw.audit.time')}</th>
                  <th className="px-4 py-3 font-semibold">{t('hcw.audit.actor')}</th>
                  <th className="px-4 py-3 font-semibold">{t('hcw.audit.actionHeader')}</th>
                  <th className="px-4 py-3 font-semibold">{t('hcw.audit.case')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">{a.actor_label ?? '—'}</p>
                      {a.actor_role && <p className="text-[11px] text-slate-400">{a.actor_role.replaceAll('_', ' ')}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        <ScrollText className="h-3 w-3" />
                        {t(`hcw.audit.action.${a.action}`, { defaultValue: a.action })}
                      </span>
                      {a.metadata_json && Object.keys(a.metadata_json).length > 0 && (
                        <p className="mt-1 max-w-md truncate text-[11px] text-slate-400">
                          {JSON.stringify(a.metadata_json)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.case_id ? (
                        <Link to={`/app/hcw/cases/${a.case_id}`} className="text-brand-700 hover:underline">
                          {a.case_number ?? a.case_id}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}