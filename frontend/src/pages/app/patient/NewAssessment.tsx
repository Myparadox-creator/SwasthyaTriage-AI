import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, HeartPulse, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '../../../lib/api'
import type { CaseCreateRequest, CaseDetail } from '../../../lib/types'
import i18n from '../../../i18n'

const CONSENT_VERSION = 'v1'

export default function NewAssessment() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!accepted) return
    setSubmitting(true)
    setError(null)
    try {
      const lang = (i18n.language as 'en' | 'hi' | 'od') ?? 'en'
      const payload: CaseCreateRequest = {
        language: lang,
        chief_concern: null,
        consent_accepted: true,
        consent_text_version: CONSENT_VERSION,
      }
      const created = await api<CaseDetail>('/api/cases', { method: 'POST', body: payload })
      navigate(`/app/patient/cases/${created.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={() => navigate('/app/patient/dashboard')} className="btn-ghost px-2 py-1 text-sm">
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </button>

      <div className="card mt-4 p-4 sm:p-6 lg:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('patient.new.title')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('patient.new.subtitle')}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {[
            'patient.new.point1',
            'patient.new.point2',
            'patient.new.point3',
            'patient.new.point4',
          ].map((key) => (
            <div key={key} className="flex items-start gap-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
              <p className="min-w-0 text-sm text-slate-600">{t(key)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
          <HeartPulse className="mb-1 h-4 w-4" />
          {t('patient.new.disclaimer')}
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-700"
          />
          <span className="min-w-0 text-sm text-slate-700">{t('patient.new.consentLabel')}</span>
        </label>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!accepted || submitting}
          onClick={create}
          className="btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('patient.new.start')}
        </button>
      </div>
    </div>
  )
}