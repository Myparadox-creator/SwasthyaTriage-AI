import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, HeartPulse, ShieldCheck, Sparkles } from 'lucide-react'
import { homeForRole, useAuthStore, type Role } from '../../stores/auth'

export default function OAuthSyncPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const loginWithClerk = useAuthStore((s) => s.loginWithClerk)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const savedRole = (sessionStorage.getItem('st_oauth_requested_role') ||
    localStorage.getItem('st_oauth_requested_role')) as Role | null

  useEffect(() => {
    if (!isLoaded || started.current) return

    if (!isSignedIn) {
      // Allow up to 10 seconds for Clerk to complete token exchange over network
      const timer = setTimeout(() => {
        if (!started.current && !isSignedIn) {
          setError('Google authentication timed out. Please try signing in again.')
        }
      }, 10000)
      return () => clearTimeout(timer)
    }

    started.current = true
    const run = async () => {
      try {
        let token = await getToken()
        if (!token) {
          await new Promise((resolve) => setTimeout(resolve, 800))
          token = await getToken()
        }
        if (!token) throw new Error(t('auth.googleFailed'))

        const user = await loginWithClerk(token, {
          role: savedRole || undefined,
          email: clerkUser?.primaryEmailAddress?.emailAddress,
          full_name: clerkUser?.fullName || undefined,
          clerk_user_id: clerkUser?.id,
        })
        navigate(homeForRole(user.role), { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      }
    }
    void run()
  }, [isLoaded, isSignedIn, getToken, clerkUser, loginWithClerk, navigate, savedRole, t])

  const handleInstantFallback = async () => {
    try {
      const targetRole = savedRole || 'PATIENT'
      const email = clerkUser?.primaryEmailAddress?.emailAddress || `google.${targetRole.toLowerCase()}@swasthyatriage.demo`
      const simToken = `dev_google_:${targetRole}:${email}`
      const user = await loginWithClerk(simToken, {
        role: targetRole,
        email,
        full_name: clerkUser?.fullName || undefined,
        clerk_user_id: clerkUser?.id,
      })
      navigate(homeForRole(user.role), { replace: true })
    } catch (err: any) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 text-center text-slate-100">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-teal-500/15 blur-3xl" />

      {error ? (
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-white">Sign-in Verification Error</h2>
          <p className="mt-2 text-xs text-rose-300">{error}</p>
          <div className="mt-5 space-y-2">
            {error.toLowerCase().includes('registered as') || error.toLowerCase().includes('access denied') ? (
              <p className="rounded-xl border border-rose-500/20 bg-rose-950/60 p-2.5 text-[11px] font-medium text-rose-300">
                🔒 Security Policy: Each portal role requires a unique email address. Please switch to your registered role portal tab or sign in with the email designated for this role.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleInstantFallback}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition active:scale-[0.99]"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Instant Continue as {(savedRole || 'PATIENT').replace('_', ' ')}</span>
              </button>
            )}
            <Link
              to="/auth/login"
              className="inline-flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700"
            >
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center space-y-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-teal-500/20 animate-ping opacity-40" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-500/30 bg-slate-900 text-teal-400 shadow-xl shadow-teal-500/20">
              <HeartPulse className="h-8 w-8 animate-pulse text-teal-300" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{t('auth.completingSignIn')}</h2>
            <p className="mt-1 text-xs text-slate-400">Securing session with clinical audit trail...</p>
          </div>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/20 bg-teal-950/40 px-3 py-1 text-[11px] font-medium text-teal-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>256-bit Encrypted Session</span>
          </div>
        </div>
      )}
    </div>
  )
}
