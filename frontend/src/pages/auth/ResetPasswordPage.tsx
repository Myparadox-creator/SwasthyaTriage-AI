import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Lock, ArrowLeft, ShieldAlert } from 'lucide-react'
import { api } from '../../lib/api'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (password.length < 8) {
      setError(t('auth.passwordTooShort', 'Password must be at least 8 characters long.'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch', 'Passwords do not match.'))
      return
    }

    setBusy(true)
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: password },
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Missing Reset Token</h1>
        <p className="mt-2 text-sm text-slate-600">
          The password reset link is invalid or has expired. Please request a new link.
        </p>
        <Link
          to="/auth/forgot-password"
          className="mt-6 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Request New Reset Link</span>
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Password Reset Complete</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your password has been reset successfully. All active sessions have been revoked.
        </p>
        <Link
          to="/auth/login"
          className="mt-6 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-800"
        >
          <span>Sign In to SwasthyaFlow AI</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-6 md:p-8">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
          Set New Password
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
          Please enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="password">
            New Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-10 text-sm min-h-[44px]"
              placeholder="Minimum 8 characters"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="confirm">
            Confirm New Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input pl-10 text-sm min-h-[44px]"
              placeholder="Re-type new password"
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
              Updating...
            </span>
          ) : (
            <span>Update Password</span>
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/auth/login" className="text-xs font-medium text-slate-500 hover:text-slate-800">
          Back to Sign In
        </Link>
      </div>
    </div>
  )
}
