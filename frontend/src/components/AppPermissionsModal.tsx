import { useState } from 'react'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Compass,
  MapPin,
  Mic,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import {
  getStoredPermissions,
  markPermissionsCompleted,
  requestLocationPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
  type PermissionState,
} from '../lib/permissions'

interface AppPermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: (status: {
    location: PermissionState
    notifications: PermissionState
    microphone: PermissionState
    coords?: [number, number]
  }) => void
}

export default function AppPermissionsModal({
  isOpen,
  onClose,
  onComplete,
}: AppPermissionsModalProps) {
  const initial = getStoredPermissions()
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [locationStatus, setLocationStatus] = useState<PermissionState>(initial.location)
  const [notifStatus, setNotifStatus] = useState<PermissionState>(initial.notifications)
  const [micStatus, setMicStatus] = useState<PermissionState>(initial.microphone)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastCoords, setLastCoords] = useState<[number, number] | undefined>(initial.coords || undefined)

  if (!isOpen) return null

  const handleFinish = (
    loc: PermissionState = locationStatus,
    notif: PermissionState = notifStatus,
    mic: PermissionState = micStatus,
    coords: [number, number] | undefined = lastCoords
  ) => {
    markPermissionsCompleted()
    if (onComplete) {
      onComplete({
        location: loc,
        notifications: notif,
        microphone: mic,
        coords,
      })
    }
    onClose()
  }

  // STEP 1: Allow Location
  const handleAllowLocation = async () => {
    setIsProcessing(true)
    const res = await requestLocationPermission()
    setLocationStatus(res.status)
    if (res.coords) {
      setLastCoords(res.coords)
    }
    setIsProcessing(false)
    setTimeout(() => setCurrentStep(2), 350)
  }

  const handleSkipLocation = () => {
    setCurrentStep(2)
  }

  // STEP 2: Allow Notification
  const handleAllowNotification = async () => {
    setIsProcessing(true)
    const res = await requestNotificationPermission()
    setNotifStatus(res.status)
    setIsProcessing(false)
    setTimeout(() => setCurrentStep(3), 350)
  }

  const handleSkipNotification = () => {
    setCurrentStep(3)
  }

  // STEP 3: Allow Microphone
  const handleAllowMicrophone = async () => {
    setIsProcessing(true)
    const res = await requestMicrophonePermission()
    setMicStatus(res.status)
    setIsProcessing(false)
    setTimeout(() => setCurrentStep(4), 350)
  }

  const handleSkipMicrophone = () => {
    setCurrentStep(4)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-teal-500/30 bg-slate-900 text-slate-100 shadow-2xl shadow-teal-950/80 p-6 sm:p-7 transition-all">
        {/* Glow Ambient Orbs */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />

        {/* Top Dismiss Button */}
        <button
          type="button"
          onClick={() => handleFinish()}
          className="absolute top-5 right-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          aria-label="Skip permissions"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Sequential Step Header & Progress Pills */}
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-950/80 border border-teal-500/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-400">
            <Sparkles className="h-3.5 w-3.5 text-teal-300" />
            <span>
              {currentStep <= 3 ? `Permission ${currentStep} of 3` : 'Setup Complete'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep === step
                    ? 'w-7 bg-teal-400'
                    : currentStep > step
                    ? 'w-3 bg-emerald-500'
                    : 'w-3 bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ================= STEP 1: LOCATION ================= */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-500/10 border-2 border-teal-400/40 text-teal-400 shadow-xl shadow-teal-500/20">
                <MapPin className="h-10 w-10 animate-bounce" />
                <div className="absolute inset-0 rounded-3xl bg-teal-400/20 animate-ping opacity-25" />
              </div>

              <h2 className="text-lg font-black text-white sm:text-xl leading-snug">
                Allow SwasthyaTriage to access this device’s location?
              </h2>

              <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-sm">
                SwasthyaTriage uses your location to discover verified <b>nearby emergency hospitals, clinics, and Jan Aushadhi pharmacies</b> across all of India with live driving distance & ETA.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-3.5 text-[11px] text-slate-400 flex items-start gap-2.5">
              <Compass className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                Coordinates are processed locally on your device to calculate nearest medical help. You can also manually search any city.
              </span>
            </div>

            <div className="mt-6 space-y-2 pt-2">
              <button
                type="button"
                onClick={handleAllowLocation}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/25 hover:opacity-95 transition active:scale-98"
              >
                <Zap className="h-4 w-4 fill-slate-950" />
                <span>While using the app (Allow Location)</span>
              </button>

              <button
                type="button"
                onClick={handleSkipLocation}
                className="w-full flex items-center justify-center rounded-2xl border border-slate-800 py-3 text-xs font-semibold text-slate-400 hover:bg-slate-800/80 hover:text-white transition"
              >
                Don't allow (Search Manually)
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: NOTIFICATIONS ================= */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-500/10 border-2 border-teal-400/40 text-teal-400 shadow-xl shadow-teal-500/20">
                <Bell className="h-10 w-10 animate-pulse" />
              </div>

              <h2 className="text-lg font-black text-white sm:text-xl leading-snug">
                Allow SwasthyaTriage to send notifications?
              </h2>

              <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-sm">
                Receive instant alerts when an attending <b>doctor answers your emergency message</b>, when triage priority updates, or for critical medicine stock notifications.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-3.5 text-[11px] text-slate-400 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                Notifications only deliver critical clinical updates, doctor advice, and emergency hospital responses. No marketing spam.
              </span>
            </div>

            <div className="mt-6 space-y-2 pt-2">
              <button
                type="button"
                onClick={handleAllowNotification}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/25 hover:opacity-95 transition active:scale-98"
              >
                <Bell className="h-4 w-4 fill-slate-950" />
                <span>Allow Notifications</span>
              </button>

              <button
                type="button"
                onClick={handleSkipNotification}
                className="w-full flex items-center justify-center rounded-2xl border border-slate-800 py-3 text-xs font-semibold text-slate-400 hover:bg-slate-800/80 hover:text-white transition"
              >
                Don't allow (Skip)
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: MICROPHONE ================= */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-500/10 border-2 border-teal-400/40 text-teal-400 shadow-xl shadow-teal-500/20">
                <Mic className="h-10 w-10 animate-pulse" />
              </div>

              <h2 className="text-lg font-black text-white sm:text-xl leading-snug">
                Allow SwasthyaTriage to record audio?
              </h2>

              <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-sm">
                Enables hands-free <b>voice triage in regional languages (Hindi, Odia, English)</b> and teleconsultation audio calls with medical officers.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-3.5 text-[11px] text-slate-400 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                Microphone is strictly active only when you tap the voice assessment button or initiate a doctor telecall.
              </span>
            </div>

            <div className="mt-6 space-y-2 pt-2">
              <button
                type="button"
                onClick={handleAllowMicrophone}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/25 hover:opacity-95 transition active:scale-98"
              >
                <Mic className="h-4 w-4 fill-slate-950" />
                <span>While using the app (Allow Audio)</span>
              </button>

              <button
                type="button"
                onClick={handleSkipMicrophone}
                className="w-full flex items-center justify-center rounded-2xl border border-slate-800 py-3 text-xs font-semibold text-slate-400 hover:bg-slate-800/80 hover:text-white transition"
              >
                Don't allow (Text Mode Only)
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4: COMPLETION SUMMARY ================= */}
        {currentStep === 4 && (
          <div className="space-y-4 text-center animate-fadeIn">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">Permissions Configured</h2>
              <p className="mt-1 text-xs text-slate-300">
                You are ready to access SwasthyaTriage AI.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-3 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300">
                  <MapPin className="h-4 w-4 text-teal-400" />
                  GPS Location
                </span>
                <span className={locationStatus === 'granted' ? 'text-emerald-400 font-bold' : 'text-slate-500 font-medium'}>
                  {locationStatus === 'granted' ? 'Granted ✓' : 'Manual Search'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300">
                  <Bell className="h-4 w-4 text-teal-400" />
                  Emergency Alerts
                </span>
                <span className={notifStatus === 'granted' ? 'text-emerald-400 font-bold' : 'text-slate-500 font-medium'}>
                  {notifStatus === 'granted' ? 'Granted ✓' : 'Default'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300">
                  <Mic className="h-4 w-4 text-teal-400" />
                  Voice Triage
                </span>
                <span className={micStatus === 'granted' ? 'text-emerald-400 font-bold' : 'text-slate-500 font-medium'}>
                  {micStatus === 'granted' ? 'Granted ✓' : 'Text Only'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleFinish()}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/25 hover:bg-teal-400 transition"
            >
              <span>Enter Healthcare Portal</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 text-center">
          <p className="text-[10px] text-slate-500">
            Permissions can be reviewed anytime via the top navigation bar.
          </p>
        </div>
      </div>
    </div>
  )
}
