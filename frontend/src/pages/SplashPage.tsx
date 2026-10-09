import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, HeartPulse, ShieldCheck, Sparkles } from 'lucide-react'
import AppPermissionsModal from '../components/AppPermissionsModal'

export default function SplashPage() {
  const navigate = useNavigate()
  const [fading, setFading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)

  const proceedToLogin = () => {
    setFading(true)
    setTimeout(() => {
      navigate('/auth/login', { replace: true })
    }, 240)
  }

  const handleFinishSplash = () => {
    // Show permissions modal step-by-step as requested:
    // "splash karne ke baad notification ak ak karke aana chahiye then login page khulna chahiye"
    if (showPermissionsModal) return
    setShowPermissionsModal(true)
  }

  useEffect(() => {
    // Clean, app-like loading: fill progress, then move to permissions step
    if (showPermissionsModal) return
    const start = Date.now()
    const total = 2200
    const id = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / total) * 100))
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(id)
        handleFinishSplash()
      }
    }, 40)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPermissionsModal])

  return (
    <div
      onClick={() => {
        if (!showPermissionsModal) handleFinishSplash()
      }}
      className="fixed inset-0 z-50 h-dvh w-dvw cursor-pointer overflow-hidden bg-slate-950 text-slate-100 select-none [color-scheme:dark]"
      title="Click or tap to proceed to setup"
    >
      {/* Single soft ambient glow (no clutter) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 8%, rgba(20,184,166,0.20), transparent 55%), radial-gradient(90% 60% at 50% 118%, rgba(16,185,129,0.12), transparent 60%)',
        }}
      />

      <div
        className={`relative z-10 mx-auto flex h-full w-full max-w-md flex-col px-6 py-8 transition-all duration-300 ${
          fading ? 'pointer-events-none scale-[1.02] opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* CENTERED BRAND */}
        <main className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="animate-fadeInUp relative">
            <div className="absolute -inset-4 rounded-[40px] bg-teal-500/20 blur-2xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-teal-400 to-emerald-500 shadow-2xl shadow-teal-500/40">
              <HeartPulse className="h-12 w-12 text-slate-950" />
            </div>
          </div>

          <h1
            className="animate-fadeInUp mt-8 text-3xl font-black tracking-tight text-white"
            style={{ animationDelay: '70ms' }}
          >
            SwasthyaFlow <span className="text-teal-400">AI</span>
          </h1>

          <p
            className="animate-fadeInUp mt-2 text-[11px] font-bold uppercase tracking-[0.28em] text-teal-300"
            style={{ animationDelay: '120ms' }}
          >
            Clinical Triage
          </p>

          <p
            className="animate-fadeInUp mt-5 max-w-xs text-sm leading-relaxed text-slate-400"
            style={{ animationDelay: '170ms' }}
          >
            AI-assisted care that understands you — in your own language, with a clear summary for a
            qualified healthcare professional.
          </p>

          <span
            className="animate-fadeInUp mt-6 inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-800"
            style={{ animationDelay: '220ms' }}
          >
            <Sparkles className="h-3 w-3 text-teal-400" />
            AI-assisted · Humans decide
          </span>
        </main>

        {/* BOTTOM: progress + CTA */}
        <footer className="flex flex-col items-center gap-4">
          <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleFinishSplash()
            }}
            className="group flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 px-5 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-teal-500/30 transition hover:brightness-105 active:scale-[0.99]"
          >
            <span>Get started</span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
            <span>Non-diagnostic support for PHCs &amp; Citizens</span>
          </div>
        </footer>
      </div>

      {/* Sequential App Permission Consent Modal:
          Location -> Notifications -> Microphone -> Summary -> Login */}
      <AppPermissionsModal
        isOpen={showPermissionsModal}
        onClose={proceedToLogin}
        onComplete={proceedToLogin}
      />
    </div>
  )
}
