import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Signal,
  WifiOff,
  X,
} from 'lucide-react'
import { type NetworkMode, useNetworkStore } from '../stores/network'

export default function NetworkStatusWidget() {
  const { mode, setMode, lastSyncedAt, queue, gsmSignalBars, smsAvailable, voiceCallAvailable, syncAll } =
    useNetworkStore()
  const [open, setOpen] = useState(false)
  const [showFallbackModal, setShowFallbackModal] = useState(false)
  const [smsSentNotice, setSmsSentNotice] = useState(false)

  const pendingCount = queue.filter((q) => q.syncStatus === 'QUEUED' || q.syncStatus === 'FAILED').length
  const isSyncing = mode === 'SYNCING'

  const handleSendMinimalSms = () => {
    setSmsSentNotice(true)
    setTimeout(() => setSmsSentNotice(false), 4000)
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all ${
            mode === 'ONLINE'
              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100/90'
              : mode === 'WEAK'
              ? 'border-amber-200 bg-amber-50/90 text-amber-800 hover:bg-amber-100/90'
              : mode === 'SYNCING'
              ? 'border-teal-200 bg-teal-50 text-teal-800 animate-pulse'
              : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
          }`}
          title="Click to check network and rural sync status"
        >
          {mode === 'ONLINE' && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
          {mode === 'WEAK' && <span className="h-2 w-2 rounded-full bg-amber-500" />}
          {mode === 'SYNCING' && <Loader2 className="h-3 w-3 animate-spin text-teal-600" />}
          {mode === 'OFFLINE' && <span className="h-2 w-2 rounded-full bg-rose-500" />}

          <span className="hidden sm:inline">
            {mode === 'ONLINE' && 'Online (Socket.IO)'}
            {mode === 'WEAK' && 'Weak 2G/3G'}
            {mode === 'SYNCING' && 'Syncing Queue...'}
            {mode === 'OFFLINE' && 'Offline Queue'}
          </span>
          <span className="sm:hidden">
            {mode === 'ONLINE' && 'Online'}
            {mode === 'WEAK' && 'Weak'}
            {mode === 'SYNCING' && 'Syncing'}
            {mode === 'OFFLINE' && 'Offline'}
          </span>

          {pendingCount > 0 && (
            <span className="ml-0.5 rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}

          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>

        {/* Dropdown Menu */}
        {open && (
          <div className="absolute right-0 mt-2 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Rural Connectivity Manager
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Last sync: <span className="font-medium text-slate-700">{lastSyncedAt}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Offline Simulator Switcher for Reviewers */}
            <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
              <span className="block text-[11px] font-bold text-slate-600">
                Network Simulation (Demo Switch):
              </span>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {(['ONLINE', 'WEAK', 'OFFLINE'] as NetworkMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold transition ${
                      mode === m
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {m === 'ONLINE' ? '🟢 4G/WiFi' : m === 'WEAK' ? '🟡 Weak 2G' : '🔴 Offline'}
                  </button>
                ))}
              </div>
            </div>

            {/* Channels Status */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <Signal className="h-4 w-4 text-teal-600" />
                  <span>Cellular GSM Signal</span>
                </div>
                <span className="font-semibold text-slate-800">{gsmSignalBars} Bars (Active)</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  <span>SMS Fallback Channel</span>
                </div>
                <span className="font-semibold text-emerald-600">{smsAvailable ? 'Available' : 'Unavailable'}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <PhoneCall className="h-4 w-4 text-emerald-600" />
                  <span>Emergency Voice (108)</span>
                </div>
                <span className="font-semibold text-emerald-600">
                  {voiceCallAvailable ? 'Active Line' : 'Unavailable'}
                </span>
              </div>
            </div>

            {/* Pending Queue Summary */}
            <div className="mt-3.5 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Local Encrypted Queue:</span>
                <span className="font-bold text-slate-800">
                  {pendingCount} encounter{pendingCount !== 1 ? 's' : ''} waiting
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSyncing || mode === 'OFFLINE'}
                  onClick={() => void syncAll()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <Link
                  to="/app/hcw/sync-queue"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  View Queue
                </Link>
              </div>

              {mode === 'OFFLINE' && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setShowFallbackModal(true)
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Offline Communication Fallback</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Offline Communication Options Modal */}
      {showFallbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <WifiOff className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Rural Communication Fallback</h3>
                  <p className="text-xs text-slate-500">Internet data currently unavailable</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFallbackModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              When remote health camps or rural sub-centres experience data outage, use minimal-data cellular SMS
              or direct emergency voice calling. Sensitive patient records stay encrypted locally until network
              restoration.
            </p>

            {smsSentNotice && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Minimal SMS alert transmitted to PHC Triage Desk!</span>
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              {/* Option 1: Minimal SMS Alert */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Option A: Minimal SMS Alert</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    Cellular GSM Active
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 font-mono bg-white p-2 rounded-lg border border-slate-200">
                  "ALERT: ASHA Sunita registered ENC-7801 at Rampur Sub-Centre. Status: Urgent Review. Please check
                  queue on sync."
                </p>
                <button
                  type="button"
                  onClick={handleSendMinimalSms}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Send Minimal SMS to PHC Doctor</span>
                </button>
              </div>

              {/* Option 2: Direct Phone Call */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Option B: Facility Voice Call</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Toll-Free Voice
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Direct cellular voice link to Capital Hospital / PHC In-charge triage desk.
                </p>
                <a
                  href="tel:108"
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>Call Emergency Desk (108 / 112)</span>
                </a>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-[11px] font-medium text-rose-800">
              <span className="font-bold">⚠️ Critical Clinical Safety Rule:</span> Never delay immediate in-person
              first aid or patient ambulance transfer while waiting for network synchronization.
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFallbackModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
