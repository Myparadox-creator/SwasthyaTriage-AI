import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { api, ApiError, fetchBlob } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import type {
  ConsentListResponse,
  ConsentOut,
  ConsentRevokeResponse,
  DataErasureResponse,
  PrivacyPolicyResponse,
} from '../../../lib/types'

export default function PrivacyCenterPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const [policy, setPolicy] = useState<PrivacyPolicyResponse | null>(null)
  const [consents, setConsents] = useState<ConsentOut[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [erasing, setErasing] = useState(false)
  const [erasureError, setErasureError] = useState<string | null>(null)
  const [erasureDone, setErasureDone] = useState<DataErasureResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [p, c] = await Promise.all([
        api<PrivacyPolicyResponse>('/api/privacy/policy'),
        api<ConsentListResponse>('/api/privacy/me/consents'),
      ])
      setPolicy(p)
      setConsents(c.items)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your privacy settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleExport = async () => {
    setExporting(true)
    setExportMessage(null)
    try {
      const blob = await fetchBlob('/api/privacy/me/export')
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `swasthyatriage-data-export-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportMessage(`Downloaded your data (${(blob.size / 1024).toFixed(1)} KB).`)
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : 'Could not prepare your data export. Please try again.',
      )
    } finally {
      setExporting(false)
    }
  }

  const handleRevoke = async (consent: ConsentOut) => {
    setRevokingId(consent.id)
    setLoadError(null)
    try {
      const res = await api<ConsentRevokeResponse>(
        `/api/privacy/consents/${consent.id}/revoke`,
        { method: 'POST' },
      )
      setConsents((prev) =>
        prev.map((item) => (item.id === consent.id ? { ...item, status: res.status } : item)),
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not withdraw this consent.')
    } finally {
      setRevokingId(null)
    }
  }

  const handleErase = async () => {
    if (confirmPhrase.trim().toUpperCase() !== 'ERASE') {
      setErasureError('Type ERASE (in capitals) to confirm.')
      return
    }
    setErasing(true)
    setErasureError(null)
    try {
      const res = await api<DataErasureResponse>('/api/privacy/me/erasure', {
        method: 'POST',
        body: { confirm: true, confirm_phrase: 'ERASE' },
      })
      setErasureDone(res)
    } catch (err) {
      setErasureError(
        err instanceof ApiError ? err.message : 'Erasure failed. Please contact support.',
      )
    } finally {
      setErasing(false)
    }
  }

  if (erasureDone) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 pb-12">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Your data has been erased</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{erasureDone.message}</p>
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Erasure summary</p>
            <ul className="mt-2 space-y-1 font-mono">
              <li>Cases pseudonymised: {erasureDone.details.cases_scrubbed}</li>
              <li>Chat messages deleted: {erasureDone.details.chat_messages_deleted}</li>
              <li>Voice messages deleted: {erasureDone.details.voice_messages_deleted}</li>
              <li>Call transcripts deleted: {erasureDone.details.call_transcripts_deleted}</li>
              <li>Documents removed: {erasureDone.details.documents_removed}</li>
              <li>Consents withdrawn: {erasureDone.details.consents_revoked}</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => navigate('/landing'))
            }}
            className="mt-6 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link
          to="/app/patient/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            🔒 Privacy &amp; My Data
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            Your rights over your health information — access, consent and erasure.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Right to access */}
          <section className="rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">Download my data</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Get a portable JSON copy of everything we hold about you: your profile, cases,
                  symptoms, chat and voice transcripts, calls, documents and consents.
                </p>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>{exporting ? 'Preparing your export…' : 'Download my data (JSON)'}</span>
                </button>
                {exportMessage && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{exportMessage}</span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Consents */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">My consents</h2>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </button>
            </div>

            {consents.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center text-xs text-slate-500">
                You have not consented to any health data collection yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {consents.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/30 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                            c.status === 'GRANTED'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.status === 'GRANTED' ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <ShieldAlert className="h-3 w-3" />
                          )}
                          <span>{c.status === 'GRANTED' ? 'Consent given' : 'Withdrawn'}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          {c.consent_text_version} · {c.language.toUpperCase()}
                        </span>
                        {c.case_id && (
                          <span className="text-[11px] text-slate-400">· Case #{c.case_id}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Recorded {new Date(c.recorded_at).toLocaleString()}
                      </p>
                    </div>
                    {c.status === 'GRANTED' && (
                      <button
                        type="button"
                        onClick={() => void handleRevoke(c)}
                        disabled={revokingId !== null}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {revokingId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        <span>Withdraw</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Erasure */}
          <section className="rounded-3xl border border-red-200 bg-gradient-to-b from-red-50/70 to-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-red-950">Erase my personal data</h2>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  This is permanent. Your name, phone, address and login are destroyed, chat, voice
                  and uploaded content are deleted, and every consent is withdrawn. Clinical records
                  needed for your care and audit are kept only in <em>pseudonymised</em> form with no
                  way to identify you. Your account is disabled afterwards.
                </p>

                <label
                  htmlFor="erase-phrase"
                  className="mt-4 block text-xs font-bold uppercase tracking-wider text-red-900"
                >
                  Type ERASE to confirm
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="erase-phrase"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder="ERASE"
                    className="w-full rounded-xl border border-red-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => void handleErase()}
                    disabled={erasing || confirmPhrase.trim().toUpperCase() !== 'ERASE'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {erasing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span>{erasing ? 'Erasing…' : 'Permanently erase my data'}</span>
                  </button>
                </div>
                {erasureError && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{erasureError}</span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Policy details */}
          {policy && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <ShieldCheck className="h-5 w-5 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">How we protect &amp; retain data</h2>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs font-bold text-slate-800">Automatic PII masking</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {policy.pii_redaction.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {policy.pii_redaction.patterns.map((p) => (
                      <span
                        key={p}
                        className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs font-bold text-slate-800">Data retention</p>
                  <ul className="mt-1 space-y-1.5 text-xs text-slate-500">
                    {Object.entries(policy.retention).map(([key, rule]) => (
                      <li key={key} className="leading-relaxed">
                        <span className="font-semibold text-slate-700">
                          {key.replaceAll('_', ' ')}:
                        </span>{' '}
                        {rule.rule}
                        {typeof rule.retention_days === 'number' && (
                          <span className="font-semibold text-slate-700">
                            {' '}
                            · {rule.retention_days} days
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
