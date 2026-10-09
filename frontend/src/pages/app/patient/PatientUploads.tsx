import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eye,
  FileText,
  Image,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
  UploadCloud,
} from 'lucide-react'
import { api, fetchBlob } from '../../../lib/api'
import type { CaseListItem, DocumentListResponse, DocumentOut, DocumentStatus } from '../../../lib/types'

const MAX_MB = 20
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png'])

const STATUS_STYLE: Record<DocumentStatus, string> = {
  UPLOADED: 'bg-slate-100 text-slate-600',
  PROCESSING: 'bg-amber-100 text-amber-700',
  PROCESSED: 'bg-brand-100 text-brand-800',
  FAILED: 'bg-red-100 text-red-700',
}

export default function PatientUploads() {
  const { t } = useTranslation()
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [caseId, setCaseId] = useState<number | null>(null)
  const [docs, setDocs] = useState<DocumentOut[] | null>(null)
  const [loadingCases, setLoadingCases] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    api<{ items: CaseListItem[] }>('/api/cases', { params: { page_size: 100 } })
      .then((res) => {
        if (!active) return
        setCases(res.items)
        if (res.items.length > 0) setCaseId(res.items[0].id)
        setLoadingCases(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : t('common.error'))
        setLoadingCases(false)
      })
    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    if (!caseId) return
    let active = true
    api<DocumentListResponse>(`/api/cases/${caseId}/documents`)
      .then((res) => {
        if (!active) return
        setDocs(res.items)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : t('common.error'))
        setDocs([])
      })
    return () => {
      active = false
    }
  }, [caseId, t])

  const createCaseAndUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setError(null)
      try {
        let activeCaseId = caseId
        if (!activeCaseId) {
          const newCase = await api<{ id: number; case_number: string; chief_concern: string | null; created_at: string }>('/api/cases', {
            method: 'POST',
            body: {
              language: 'en',
              consent_accepted: true,
              chief_concern: `Medical Report: ${file.name.slice(0, 50)}`,
            },
          })
          activeCaseId = newCase.id
          setCaseId(newCase.id)
          setCases((prev) => [newCase as CaseListItem, ...prev])
        }

        const form = new FormData()
        form.append('file', file)
        await api<DocumentOut>(`/api/cases/${activeCaseId}/documents`, { method: 'POST', body: form })
        const res = await api<DocumentListResponse>(`/api/cases/${activeCaseId}/documents`)
        setDocs(res.items)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setUploading(false)
      }
    },
    [caseId, t],
  )

  const setFromInput = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      const okType = ALLOWED.has(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name)
      if (!okType) {
        setError(t('patient.uploads.typeError'))
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(t('patient.uploads.sizeError', { mb: MAX_MB }))
        return
      }
      void createCaseAndUpload(file)
    },
    [createCaseAndUpload, t],
  )

  const view = async (doc: DocumentOut) => {
    if (!caseId) return
    setBusyId(doc.id)
    try {
      const blob = await fetchBlob(`/api/cases/${caseId}/documents/${doc.id}/file`)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (doc: DocumentOut) => {
    if (!caseId) return
    setBusyId(doc.id)
    setError(null)
    try {
      await api<void>(`/api/cases/${caseId}/documents/${doc.id}`, { method: 'DELETE' })
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== doc.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const extractionPreview = (doc: DocumentOut): string | null => {
    const ex = doc.extractions.find((e) => e.raw_text)
    if (!ex) return null
    const text = ex.raw_text!.trim()
    return text.length > 340 ? `${text.slice(0, 340)}…` : text
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('patient.uploads.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('patient.uploads.subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loadingCases ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-6">
          {cases.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              <UploadCloud className="mx-auto h-12 w-12 text-teal-600" />
              <p className="mt-3 text-base font-semibold text-slate-800">No medical assessments yet</p>
              <p className="mt-1 text-xs text-slate-500">
                You can upload your prescription, lab report, or scan directly. A medical record will be created automatically.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) setFromInput(file)
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                role="button"
                tabIndex={0}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                  dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-300'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    setFromInput(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                ) : (
                  <UploadCloud className="h-8 w-8 text-teal-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700">{t('patient.uploads.drop')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t('patient.uploads.formats')} · {t('patient.uploads.max', { mb: MAX_MB })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">
                  {t('patient.uploads.chooseCase')}
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setUploading(true)
                      const newCase = await api<{ id: number; case_number: string; chief_concern: string | null; created_at: string }>('/api/cases', {
                        method: 'POST',
                        body: {
                          language: 'en',
                          consent_accepted: true,
                          chief_concern: 'New Document Consultation',
                        },
                      })
                      setCases((prev) => [newCase as CaseListItem, ...prev])
                      setCaseId(newCase.id)
                      setDocs([])
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t('common.error'))
                    } finally {
                      setUploading(false)
                    }
                  }}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                >
                  + Start New Assessment Record
                </button>
              </div>
              <select
                value={caseId ?? ''}
                onChange={(e) => {
                    setCaseId(Number(e.target.value))
                    setDocs(null)
                  }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} · {c.chief_concern ?? t('patient.list.noConcern')} ·{' '}
                    {new Date(c.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) setFromInput(file)
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                role="button"
                tabIndex={0}
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                  dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-300'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    setFromInput(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                ) : (
                  <UploadCloud className="h-8 w-8 text-brand-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700">{t('patient.uploads.drop')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t('patient.uploads.formats')} · {t('patient.uploads.max', { mb: MAX_MB })}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Upload className="h-4 w-4 text-brand-700" />
                  {t('patient.uploads.listTitle')}
                </div>

                {docs === null ? (
                  <div className="flex h-24 items-center justify-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="card p-6 text-center text-sm text-slate-400">{t('patient.uploads.empty')}</div>
                ) : (
                  <ul className="space-y-3">
                    {docs.map((doc) => {
                      const preview = extractionPreview(doc)
                      return (
                        <li key={doc.id} className="card p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              {doc.content_type === 'application/pdf' ? (
                                <FileText className="h-5 w-5" />
                              ) : (
                                <Image className="h-5 w-5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-slate-800">{doc.filename}</p>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    STATUS_STYLE[doc.status] ?? 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {t(`patient.uploads.status.${doc.status}`)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleString()}
                              </p>
                              {preview && (
                                <div className="mt-2 rounded-xl bg-slate-50 p-3">
                                  <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                    <ShieldAlert className="h-3 w-3" />
                                    {t('patient.uploads.aiExtracted')}
                                  </p>
                                  <p className="text-xs leading-relaxed text-slate-600">{preview}</p>
                                </div>
                              )}
                              {doc.status === 'UPLOADED' && (
                                <p className="mt-1.5 text-[11px] text-amber-600">{t('patient.uploads.pendingNote')}</p>
                              )}
                              {doc.status === 'FAILED' && doc.error_detail && (
                                <p className="mt-1.5 text-[11px] text-red-600">
                                  {doc.error_detail.includes('GEMINI_API_KEY')
                                    ? t('patient.uploads.extractNeedsKey')
                                    : doc.error_detail}
                                </p>
                              )}
                            </div>

                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                title={t('patient.uploads.view')}
                                onClick={() => void view(doc)}
                                disabled={busyId === doc.id}
                                className="btn-ghost h-9 w-9 !p-0 disabled:opacity-40"
                              >
                                {busyId === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                title={t('patient.uploads.delete')}
                                onClick={() => void remove(doc)}
                                disabled={busyId === doc.id}
                                className="btn-ghost h-9 w-9 !p-0 text-red-600 disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}