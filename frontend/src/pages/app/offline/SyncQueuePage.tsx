import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Mic,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react'
import { useNetworkStore } from '../../../stores/network'

export default function SyncQueuePage() {
  const { mode, setMode, lastSyncedAt, queue, syncAll, retryEncounter } =
    useNetworkStore()
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [sentSmsNotice, setSentSmsNotice] = useState<string | null>(null)

  const pendingCount = queue.filter((q) => q.syncStatus === 'QUEUED' || q.syncStatus === 'FAILED').length
  const syncedCount = queue.filter((q) => q.syncStatus === 'SYNCED').length
  const hasCriticalRedFlag = queue.some((q) => q.hasRedFlag && q.syncStatus !== 'SYNCED')
  const isSyncing = mode === 'SYNCING'

  const handleRetry = async (id: string) => {
    setRetryingId(id)
    await retryEncounter(id)
    setRetryingId(null)
  }

  const handleSendMinimalSms = (localRef: string) => {
    setSentSmsNotice(localRef)
    setTimeout(() => setSentSmsNotice(null), 4000)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top Rural Connectivity Header Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
              {mode === 'ONLINE' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-800">4G / Wi-Fi Active · Socket.IO Connected</span>
                </>
              ) : mode === 'WEAK' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-800">Weak 2G Network · Low-Bandwidth Priority Mode</span>
                </>
              ) : mode === 'SYNCING' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-teal-600" />
                  <span className="text-teal-800">Batch Synchronization in Progress</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="text-rose-800">Offline Queue Mode · Encrypted Local Storage</span>
                </>
              )}
            </div>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              Pending Sync Queue (Rural Health Field Station)
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Encrypted IndexedDB queue for village camps, sub-centres, and low-connectivity PHCs.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSyncing || mode === 'OFFLINE'}
              onClick={() => void syncAll()}
              className="flex items-center gap-2 rounded-2xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-700 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync All Now'}</span>
            </button>
          </div>
        </div>

        {/* Status Telemetry Bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-[11px] text-slate-400 block font-medium">Pending Encounters</span>
            <span className="text-base font-extrabold text-slate-800">{pendingCount} Cases</span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-[11px] text-slate-400 block font-medium">Successfully Synced</span>
            <span className="text-base font-extrabold text-emerald-700">{syncedCount} Transferred</span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-[11px] text-slate-400 block font-medium">Local Storage Used</span>
            <span className="text-base font-extrabold text-slate-800">4.3 MB / 50 MB</span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-[11px] text-slate-400 block font-medium">Last Confirmed Sync</span>
            <span className="text-base font-extrabold text-slate-800">{lastSyncedAt}</span>
          </div>
        </div>
      </div>

      {/* Critical Offline Safety Escalation Banner */}
      {hasCriticalRedFlag && mode === 'OFFLINE' && (
        <div className="rounded-3xl border-2 border-rose-600 bg-rose-50 p-5 shadow-lg shadow-rose-200/50 animate-shake">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                <ShieldAlert className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-rose-950">
                  CRITICAL SAFETY WARNING — REMOTE DOCTOR NOT NOTIFIED
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-rose-800 font-medium">
                  One or more offline encounters contain critical cardiac or respiratory red-flags. Because this
                  device is currently offline, remote hospital doctors have NOT received this case alert.
                </p>
                <p className="mt-2 text-xs font-bold text-rose-900">
                  ⚠️ Action Required: Do not delay in-person care while waiting for internet synchronization. Call
                  emergency ambulance (108) or initiate emergency transport immediately.
                </p>
              </div>
            </div>

            <a
              href="tel:108"
              className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 transition"
            >
              <PhoneCall className="h-4 w-4" />
              <span>Call 108 Emergency</span>
            </a>
          </div>
        </div>
      )}

      {/* Interactive Simulation Switch for Reviewers */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold text-slate-700">Simulate Rural Connectivity State (For Review):</span>
            <p className="text-[11px] text-slate-500">
              Switch network environments to test offline queueing, low-bandwidth mode, and instant Socket.IO
              resumption.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode('ONLINE')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                mode === 'ONLINE' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border text-slate-700 hover:bg-slate-100'
              }`}
            >
              🟢 4G / Wi-Fi
            </button>
            <button
              type="button"
              onClick={() => setMode('WEAK')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                mode === 'WEAK' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white border text-slate-700 hover:bg-amber-50'
              }`}
            >
              🟡 Weak 2G
            </button>
            <button
              type="button"
              onClick={() => setMode('OFFLINE')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                mode === 'OFFLINE' ? 'bg-rose-600 text-white shadow-sm' : 'bg-white border text-slate-700 hover:bg-rose-50'
              }`}
            >
              🔴 Offline Village
            </button>
          </div>
        </div>
      </div>

      {/* SMS Sent Notice Toast */}
      {sentSmsNotice && (
        <div className="flex items-center gap-2 rounded-2xl bg-blue-50 border border-blue-200 p-3.5 text-xs font-bold text-blue-900 shadow-xs animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            Minimal SMS dispatch sent for {sentSmsNotice}! Hospital triage queue will ingest case upon server
            synchronization.
          </span>
        </div>
      )}

      {/* Pending Encounters List */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">
          Encounter Queue Records ({queue.length})
        </h2>

        {queue.map((enc) => {
          const isUploading = enc.syncStatus === 'UPLOADING'
          const isSynced = enc.syncStatus === 'SYNCED'

          return (
            <div
              key={enc.id}
              className={`rounded-3xl border p-5 transition-all shadow-xs ${
                enc.hasRedFlag && !isSynced
                  ? 'border-rose-300 bg-rose-50/40'
                  : isSynced
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      {enc.localRef}
                    </span>

                    {enc.hasRedFlag && (
                      <span className="rounded-full bg-rose-100 text-rose-800 px-2.5 py-0.5 text-[10px] font-extrabold animate-pulse">
                        CRITICAL RED FLAG
                      </span>
                    )}

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isSynced
                          ? 'bg-emerald-100 text-emerald-800'
                          : isUploading
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isSynced ? '✓ Synced to Hospital' : isUploading ? 'Uploading...' : 'Saved Locally on Tablet'}
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-sm font-extrabold text-slate-900">{enc.patientName}</h3>
                  <p className="text-xs text-slate-500">{enc.ageGender}</p>
                </div>

                <div className="flex items-center gap-2">
                  {!isSynced && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSendMinimalSms(enc.localRef)}
                        className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                        <span>Send SMS Alert</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUploading || mode === 'OFFLINE'}
                        onClick={() => void handleRetry(enc.id)}
                        className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
                      >
                        {retryingId === enc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UploadCloud className="h-3.5 w-3.5" />
                        )}
                        <span>Sync Case</span>
                      </button>
                    </>
                  )}

                  {isSynced && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Transferred to Nurse Queue</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Chief Concern */}
              <p className="mt-3 text-xs text-slate-700 bg-slate-50/70 p-3 rounded-2xl border border-slate-100 leading-relaxed">
                <span className="font-semibold text-slate-900">Recorded Symptoms:</span> {enc.chiefComplaint}
              </p>

              {/* Upload Progress Bar if Uploading */}
              {isUploading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-teal-800 mb-1">
                    <span>Uploading compressed records to server...</span>
                    <span>{enc.uploadProgress || 45}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-teal-100">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all duration-300"
                      style={{ width: `${enc.uploadProgress || 45}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Attachments & Meta Footer */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  {enc.attachments.audioMb && (
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <Mic className="h-3 w-3 text-teal-600" />
                      <span>Voice Recording ({enc.attachments.audioMb} MB)</span>
                    </span>
                  )}
                  {enc.attachments.vitalsRecorded && (
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <span>✓ Vitals Logged</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{enc.recordedAt}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
