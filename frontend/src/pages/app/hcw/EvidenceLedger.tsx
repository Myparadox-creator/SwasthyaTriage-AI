import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, FileSearch, Loader2, Pencil, ShieldQuestion, X } from 'lucide-react'
import { api } from '../../../lib/api'
import type { EvidenceListResponse, EvidenceRecord, EvidenceReviewStatus } from '../../../lib/types'

const FACT_LABEL: Record<string, string> = {
  SYMPTOM: 'Symptom',
  MEASUREMENT: 'Measurement',
  TIMELINE: 'Timeline',
  CONTEXT: 'Context',
  DOCUMENT_FIELD: 'Document field',
}

const SOURCE_LABEL: Record<string, string> = {
  PATIENT_TEXT: 'Patient text',
  VOICE_TRANSCRIPT: 'Voice transcript',
  UPLOADED_REPORT: 'Uploaded report',
  MANUAL_ENTRY: 'Manual entry',
  APPROVED_EXTERNAL_SOURCE: 'Approved external source',
  CONFIGURED_RULE: 'Configured rule',
}

const STATUS_BADGE: Record<EvidenceReviewStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EDITED: 'bg-brand-100 text-brand-800 border-brand-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

function tierClass(tier: string | null): string {
  if (tier === 'HIGH') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (tier === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (tier === 'LOW') return 'bg-rose-50 text-rose-700 border-rose-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

export default function EvidenceLedger({ caseId }: { caseId: number }) {
  const [data, setData] = useState<EvidenceListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api<EvidenceListResponse>(`/api/cases/${caseId}/evidence`)
      setData(res)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load evidence ledger')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    void load()
  }, [load])

  const review = useCallback(
    async (record: EvidenceRecord, status: EvidenceReviewStatus, newValue?: string) => {
      setBusy(record.id)
      try {
        await api(`/api/cases/${caseId}/evidence/${record.id}`, {
          method: 'PATCH',
          body: { status, new_value: newValue ?? null },
        })
        setEditing(null)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Review action failed')
      } finally {
        setBusy(null)
      }
    },
    [caseId, load],
  )

  if (loading) {
    return (
      <section className="card !p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading evidence ledger…
        </div>
      </section>
    )
  }

  if (error && !data) {
    return (
      <section className="card !p-4">
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      </section>
    )
  }

  if (!data) return null

  return (
    <section className="card min-w-0 !p-0">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
        <FileSearch className="h-4 w-4 text-brand-700" />
        Evidence Ledger
        <span className="ml-auto flex items-center gap-2 text-[11px] font-normal">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{data.total} facts</span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">{data.pending_review} pending</span>
        </span>
      </header>

      <div className="space-y-3 p-4">
        {data.evidence.length === 0 && (
          <p className="text-sm text-slate-400 italic">No extracted facts to trace for this case yet.</p>
        )}

        {data.evidence.map((ev) => {
          const unverified = ev.reviewer_status === 'PENDING'
          const isEditing = editing === ev.id
          return (
            <div key={ev.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {ev.label}
                  {ev.current_value && ev.current_value !== ev.label ? `: ${ev.current_value}` : ''}
                  {ev.unit ? ` ${ev.unit}` : ''}
                </span>
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {FACT_LABEL[ev.fact_type] ?? ev.fact_type}
                </span>
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {SOURCE_LABEL[ev.source_kind] ?? ev.source_kind}
                </span>
                {ev.confidence_tier && (
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${tierClass(ev.confidence_tier)}`}>
                    {ev.confidence_tier}
                    {ev.confidence != null ? ` (${Math.round(ev.confidence * 100)}%)` : ''}
                  </span>
                )}
                <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[ev.reviewer_status]}`}>
                  {ev.reviewer_status}
                </span>
              </div>

              {ev.source_snippet ? (
                <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs italic text-slate-600">
                  “{ev.source_snippet}”
                </p>
              ) : (
                <p className="mt-2 text-xs italic text-slate-400">No verbatim source span captured.</p>
              )}

              <p className="mt-1 text-[11px] text-slate-500">
                Source: <span className="font-medium">{ev.source_provenance}</span>
                {ev.source_ref_id ? ` · ${ev.source_ref_id}` : ''}
                {ev.extraction_method ? ` · ${ev.extraction_method}` : ''}
                {ev.rationale ? ` · ${ev.rationale}` : ''}
              </p>

              {ev.original_value != null && ev.original_value !== ev.current_value && (
                <p className="mt-1 text-[11px] text-brand-700">
                  Original extracted value preserved: <span className="font-medium">{ev.original_value}</span>
                </p>
              )}

              {ev.validation_warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {ev.validation_warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                      <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              {isEditing ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Corrected value"
                  />
                  <button
                    className="rounded bg-brand-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                    disabled={busy === ev.id || !editValue.trim()}
                    onClick={() => void review(ev, 'EDITED', editValue.trim())}
                  >
                    Save
                  </button>
                  <button
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-50"
                    disabled={busy === ev.id || ev.reviewer_status === 'CONFIRMED'}
                    onClick={() => void review(ev, 'CONFIRMED')}
                  >
                    <Check className="h-3 w-3" /> Confirm
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 disabled:opacity-50"
                    disabled={busy === ev.id}
                    onClick={() => {
                      setEditing(ev.id)
                      setEditValue(ev.current_value ?? '')
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-50"
                    disabled={busy === ev.id || ev.reviewer_status === 'REJECTED'}
                    onClick={() => void review(ev, 'REJECTED')}
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                  {unverified && <span className="text-[10px] text-slate-400">Awaiting reviewer confirmation</span>}
                  {busy === ev.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
              )}
            </div>
          )
        })}

        <p className="text-[10px] italic text-slate-400">{data.disclaimer}</p>
      </div>
    </section>
  )
}
