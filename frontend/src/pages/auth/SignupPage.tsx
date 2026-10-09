import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, Mail, Phone, User, CheckCircle2 } from 'lucide-react'
import { homeForRole, useAuthStore } from '../../stores/auth'
import GoogleSignInButton from '../../components/GoogleSignInButton'

export default function SignupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (form.password !== form.confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const user = await signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      })
      navigate(homeForRole(user.role), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card w-full border border-slate-200/90 bg-white/95 p-5 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-7 md:p-8 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {t('auth.signUp')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{t('auth.signUpBody')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
          Citizen Portal
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <GoogleSignInButton />
        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>{t('auth.orDivider')}</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3.5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="full_name">
            {t('auth.fullName')}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="full_name"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input pl-10 text-sm min-h-[44px]"
              autoComplete="name"
              placeholder="e.g. Ramesh Chandra Patra"
            />
          </div>
        </div>

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
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input pl-10 text-sm min-h-[44px]"
              autoComplete="email"
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="phone">
            {t('auth.phone')}
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input pl-10 text-sm min-h-[44px]"
              autoComplete="tel"
              placeholder="+91 98765 43210"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="password">
              {t('auth.password')}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="password"
                type="password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input pl-10 text-sm min-h-[44px]"
                autoComplete="new-password"
                placeholder="••••••••••••"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="confirm">
              {t('auth.confirmPassword')}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="confirm"
                type="password"
                minLength={8}
                required
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="input pl-10 text-sm min-h-[44px]"
                autoComplete="new-password"
                placeholder="••••••••••••"
              />
            </div>
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
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 px-4 py-3 text-sm font-bold text-white shadow-md shadow-teal-700/20 transition-all disabled:opacity-60"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {t('common.loading')}
            </span>
          ) : (
            <span>{t('auth.createOne')}</span>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-slate-500">
        {t('auth.haveAccount')}{' '}
        <Link to="/auth/login" className="font-bold text-teal-700 hover:underline">
          {t('auth.signInHere')}
        </Link>
      </p>
    </div>
  )
}