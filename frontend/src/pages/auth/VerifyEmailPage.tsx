import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, Mail, ShieldAlert, ArrowRight } from 'lucide-react'
import { api } from '../../lib/api'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(Boolean(token))
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendEmail, setResendEmail] = useState('')
  const [resendBusy, setResendBusy] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  useEffect(() => {
    if (!token) return
    api('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => {
        setSuccess(true)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Invalid or expired verification link')
        setLoading(false)
      })
  }, [token])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail.trim() || resendBusy) return
    setResendBusy(true)
    try {
      await api('/api/auth/resend-verification', {
        method: 'POST',
        body: { email: resendEmail.trim() },
      })
      setResendDone(true)
    } catch {
      setResendDone(true)
    } finally {
      setResendBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-5 shadow-xl sm:p-8 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-teal-600 mb-4" />
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Verifying Email Address...</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please wait while we validate your security token.
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-5 shadow-xl sm:p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Email Address Verified!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Thank you for verifying your email address on SwasthyaFlow AI. Your account is fully active.
        </p>
        <Link
          to="/auth/login"
          className="mt-6 inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-800"
        >
          <span>Continue to Sign In</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-md mx-auto border border-slate-200/90 bg-white/95 p-5 shadow-xl sm:p-7">
      <div className="text-center mb-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Verification Link Expired</h1>
        <p className="mt-1 text-sm text-slate-600">
          {error || 'This email verification token has expired or is invalid.'}
        </p>
      </div>

      {resendDone ? (
        <div className="rounded-xl bg-teal-50 p-4 text-center text-sm font-medium text-teal-800 border border-teal-200">
          If an account exists for {resendEmail}, a new verification link has been sent. Check your inbox!
        </div>
      ) : (
        <form onSubmit={handleResend} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Enter your email to receive a new link:
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="name@example.com"
                className="input pl-10 text-sm min-h-[44px]"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={resendBusy}
            className="btn-primary w-full min-h-[44px]"
          >
            {resendBusy ? 'Sending...' : 'Resend Verification Link'}
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link to="/auth/login" className="text-xs font-medium text-slate-500 hover:text-slate-800">
          Return to Sign In
        </Link>
      </div>
    </div>
  )
}
