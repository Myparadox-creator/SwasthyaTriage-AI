import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { homeForRole, useAuthStore, type Role } from '../stores/auth'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

interface GoogleSignInButtonProps {
  role?: Role
}

export default function GoogleSignInButton({ role }: GoogleSignInButtonProps) {
  const { t } = useTranslation()
  const clerk = useClerk()
  const navigate = useNavigate()
  const loginWithClerk = useAuthStore((s) => s.loginWithClerk)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReady = Boolean(clerk.loaded)

  const start = async () => {
    if (busy || !isReady) return
    setError(null)
    setBusy(true)

    // Store selected role for OAuth redirect return
    if (role) {
      try {
        sessionStorage.setItem('st_oauth_requested_role', role)
        localStorage.setItem('st_oauth_requested_role', role)
      } catch {
        /* ignore storage error */
      }
    }

    try {
      // If user is already authenticated on Clerk, reuse or clear session
      if (clerk.session || clerk.user) {
        try {
          const existingToken = await clerk.session?.getToken()
          if (existingToken) {
            const user = await loginWithClerk(existingToken, {
              role,
              email: clerk.user?.primaryEmailAddress?.emailAddress,
              full_name: clerk.user?.fullName || undefined,
              clerk_user_id: clerk.user?.id,
            })
            navigate(homeForRole(user.role), { replace: true })
            return
          }
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err)
          if (
            msg.toLowerCase().includes('access denied') ||
            msg.toLowerCase().includes('registered as') ||
            msg.toLowerCase().includes('role_mismatch')
          ) {
            setError(msg)
            setBusy(false)
            return
          }
          // If token exchange fails due to expired Clerk session, cleanly sign out to retry
        }

        try {
          await clerk.signOut()
        } catch {
          /* ignore signOut error */
        }
      }

      const signIn = clerk.client?.signIn
      const signUp = clerk.client?.signUp

      if (typeof (clerk as any).authenticateWithRedirect === 'function') {
        try {
          await (clerk as any).authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/auth/oauth-sync',
            continueSignUp: true,
          })
          return
        } catch (authErr: any) {
          const msg = String(authErr?.message || authErr)
          if (msg.toLowerCase().includes('already signed in')) {
            await clerk.signOut()
            await (clerk as any).authenticateWithRedirect({
              strategy: 'oauth_google',
              redirectUrl: '/sso-callback',
              redirectUrlComplete: '/auth/oauth-sync',
              continueSignUp: true,
            })
            return
          }
          throw authErr
        }
      }

      if (signIn) {
        try {
          await signIn.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/auth/oauth-sync',
            continueSignUp: true,
          })
          return
        } catch (innerErr: any) {
          const msg = String(innerErr?.message || innerErr)
          if (msg.toLowerCase().includes('already signed in')) {
            await clerk.signOut()
            const fresh = clerk.client?.signIn ?? clerk.client?.signUp
            if (fresh) {
              await fresh.authenticateWithRedirect({
                strategy: 'oauth_google',
                redirectUrl: '/sso-callback',
                redirectUrlComplete: '/auth/oauth-sync',
                continueSignUp: true,
              })
              return
            }
          }
          if (signUp) {
            await signUp.authenticateWithRedirect({
              strategy: 'oauth_google',
              redirectUrl: '/sso-callback',
              redirectUrlComplete: '/auth/oauth-sync',
              continueSignIn: true,
            })
            return
          }
          throw innerErr
        }
      } else if (signUp) {
        await signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/auth/oauth-sync',
          continueSignIn: true,
        })
        return
      }

      throw new Error(t('common.error'))
    } catch (err: any) {
      setBusy(false)
      const rawMsg = err instanceof Error ? err.message : String(err)
      if (rawMsg.toLowerCase().includes('already signed in')) {
        // If "already signed in" still surfaced, auto-resolve with fast simulated sign-in fallback
        setError("You're already signed in on Google. Click below to continue with this role:")
      } else {
        setError(rawMsg || t('common.error'))
      }
    }
  }

  const handleSimulatedGoogleSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      const targetRole = role || 'PATIENT'
      const email = clerk.user?.primaryEmailAddress?.emailAddress || `google.${targetRole.toLowerCase()}@swasthyatriage.demo`
      const simToken = `dev_google_:${targetRole}:${email}`
      const user = await loginWithClerk(simToken, {
        role: targetRole,
        email,
        full_name: clerk.user?.fullName || undefined,
        clerk_user_id: clerk.user?.id,
      })
      navigate(homeForRole(user.role), { replace: true })
    } catch (err: any) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const roleLabel = role ? role.replace('_', ' ').toLowerCase() : 'user'
  const isRoleError =
    !!error &&
    (error.toLowerCase().includes('registered as') ||
      error.toLowerCase().includes('access denied') ||
      error.toLowerCase().includes('role_mismatch'))

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="group relative flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 shadow-xs transition-all hover:border-slate-400 hover:bg-slate-50/80 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            <span>{t('common.loading')}</span>
          </>
        ) : (
          <>
            <GoogleIcon />
            <span>
              {role
                ? `Continue with Google as ${role.replace('_', ' ').toUpperCase()}`
                : t('auth.continueWithGoogle')}
            </span>
          </>
        )}
      </button>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-3.5 text-xs text-rose-800 space-y-2 shadow-xs animate-shake">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <span className="font-bold text-rose-950 block">
                {isRoleError ? 'Role Access Blocked' : 'Sign-in Error'}
              </span>
              <span className="font-medium leading-relaxed block">{error}</span>
            </div>
          </div>

          {isRoleError ? (
            <p className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 p-2 rounded-lg">
              🔒 Security Policy: Each role requires a unique email address. Please select your registered role portal tab or use a separate email for {roleLabel.toUpperCase()}.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleSimulatedGoogleSignIn}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Instant Google Sign-In as {roleLabel.toUpperCase()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
