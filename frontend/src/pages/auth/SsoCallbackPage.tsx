import { AuthenticateWithRedirectCallback } from '@clerk/react'
import { useTranslation } from 'react-i18next'
import { HeartPulse } from 'lucide-react'

export default function SsoCallbackPage() {
  const { t } = useTranslation()

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 text-center text-slate-100">
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="relative z-10 flex flex-col items-center space-y-4">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-teal-500/20 animate-ping opacity-40" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-500/30 bg-slate-900 text-teal-400 shadow-xl shadow-teal-500/20">
            <HeartPulse className="h-8 w-8 animate-pulse text-teal-300" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{t('auth.completingSignIn')}</h2>
          <p className="mt-1 text-xs text-slate-400">Verifying Google authentication with Clerk...</p>
        </div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" />
        </div>
      </div>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/auth/oauth-sync"
        signUpForceRedirectUrl="/auth/oauth-sync"
        signInFallbackRedirectUrl="/auth/oauth-sync"
        signUpFallbackRedirectUrl="/auth/oauth-sync"
        continueSignUpUrl="/auth/oauth-sync"
      />
    </div>
  )
}
