import { Link, Outlet } from 'react-router-dom'
import {
  Activity,
  HeartPulse,
  Mic,
  ShieldAlert,
  Stethoscope,
  Sparkles,
} from 'lucide-react'
import LanguagePicker from '../../components/LanguagePicker'

export default function AuthLayout() {

  return (
    <div className="flex min-h-[100dvh] w-full flex-col lg:flex-row bg-slate-50 text-slate-900 antialiased">
      {/* Mobile / Tablet Top Bar */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shadow-md shadow-teal-600/20">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-extrabold tracking-tight leading-tight">
              SwasthyaTriage <span className="text-teal-600">AI</span>
            </span>
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Citizen & Clinical Portal
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <LanguagePicker align="end" />
        </div>
      </header>

      {/* Desktop Left Brand & Showcase Column */}
      <div className="relative hidden w-5/12 flex-col justify-between overflow-hidden bg-slate-950 p-8 xl:p-12 text-white lg:flex">
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-cyan-600/10 blur-[100px]" />

        {/* Top Header */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3 font-bold group">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/30 transition-transform group-hover:scale-105">
              <HeartPulse className="h-6 w-6 text-slate-950" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-white">
                  SwasthyaTriage <span className="text-teal-400">AI</span>
                </span>
                <span className="rounded-full bg-teal-500/20 border border-teal-400/30 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Odisha Public Health Tele-Triage System</p>
            </div>
          </Link>
        </div>

        {/* Center Feature Highlights */}
        <div className="relative z-10 my-auto py-8 space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-950/80 border border-teal-500/30 px-3 py-1 text-xs font-semibold text-teal-300 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-teal-400" />
              <span>Smart Multimodal Health Architecture</span>
            </div>
            <h2 className="text-2xl xl:text-3xl font-extrabold leading-snug tracking-tight text-white">
              Intelligent triage support. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300">
                Human-led clinical care.
              </span>
            </h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-md">
              Bridging rural healthcare access with real-time AI symptom assessment, verified triage queues, and instant doctor-nurse collaboration.
            </p>
          </div>

          {/* 3 Value Pillars */}
          <div className="space-y-3 max-w-md">
            <div className="flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 backdrop-blur-md transition hover:border-teal-500/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Mic className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Multilingual Voice Intake
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Natural conversational symptom intake in Odia, Hindi, and English with auto clinical transcription.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 backdrop-blur-md transition hover:border-teal-500/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Deterministic Safety Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hard-coded emergency protocol rules ensure red flags like chest pain or stroke bypass AI to instant alert.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 backdrop-blur-md transition hover:border-teal-500/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Stethoscope className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Doctor-in-the-Loop Transparency
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Full explainability transparency for attending physicians and PHC nurses before final disposition.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Ticker */}
        <div className="relative z-10 border-t border-slate-800/80 pt-4 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-slate-300">Live Health System Pilot</span>
          </div>
          <span className="text-[11px] text-slate-500">Government of Odisha</span>
        </div>
      </div>

      {/* Right Form Container Column */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto">
        {/* Desktop Top Nav */}
        <div className="hidden h-16 items-center justify-between px-8 lg:flex border-b border-slate-200/60 bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Activity className="h-3.5 w-3.5 text-teal-600" />
            <span>Secure Clinical Portal · 256-bit Encrypted</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguagePicker align="end" />
          </div>
        </div>

        {/* Content Outlet with Responsive Centering */}
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 md:px-8 lg:px-10">
          <div className="w-full max-w-md mx-auto">
            <Outlet />
          </div>
        </div>

        {/* Bottom Footer */}
        <footer className="border-t border-slate-200/60 bg-white/50 px-4 py-3 text-center text-xs text-slate-400 backdrop-blur-sm">
          <p>
            Emergency medical support? In acute crisis, immediately dial <strong className="text-slate-700">108</strong> or <strong className="text-slate-700">102</strong>.
          </p>
        </footer>
      </div>
    </div>
  )
}