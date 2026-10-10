import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() } })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{t('auth.forgotPassword')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('auth.resetSent')}</p>
        <Link
          to="/auth/login"
          className="mt-6 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('auth.signInHere')}</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {t('auth.forgotPassword')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{t('auth.forgotBody')}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="email">
            {t('auth.email')}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10 text-sm min-h-[44px]"
              autoComplete="email"
              placeholder="name@example.com"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {t('common.loading')}
            </span>
          ) : (
            <span>{t('auth.sendReset')}</span>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-slate-500">
        <Link to="/auth/login" className="inline-flex items-center gap-1.5 font-bold text-teal-700 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('auth.signInHere')}</span>
        </Link>
      </p>
    </div>
  )
}