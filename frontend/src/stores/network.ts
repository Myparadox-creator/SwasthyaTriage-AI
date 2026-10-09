import { create } from 'zustand'

export type NetworkMode = 'ONLINE' | 'WEAK' | 'OFFLINE' | 'SYNCING'

export interface PendingEncounter {
  id: string
  localRef: string
  patientName: string
  ageGender: string
  chiefComplaint: string
  priority: 'ROUTINE' | 'URGENT' | 'CRITICAL'
  hasRedFlag: boolean
  attachments: {
    audioMb?: number
    vitalsRecorded: boolean
    photoMb?: number
  }
  recordedAt: string
  syncStatus: 'QUEUED' | 'UPLOADING' | 'SYNCED' | 'FAILED'
  uploadProgress?: number
  errorMessage?: string
}

const INITIAL_QUEUE: PendingEncounter[] = [
  {
    id: 'enc-local-1042',
    localRef: 'ENC-OFFLINE-7801',
    patientName: 'Subhasree Mohapatra',
    ageGender: '28 F (Pregnant)',
    chiefComplaint: 'Acute lower abdominal pain, BP 142/94 mmHg, dizziness for 6 hrs',
    priority: 'CRITICAL',
    hasRedFlag: true,
    attachments: { audioMb: 1.4, vitalsRecorded: true, photoMb: 2.1 },
    recordedAt: 'Today, 04:30 PM (Rampur Sub-Centre)',
    syncStatus: 'QUEUED',
  },
  {
    id: 'enc-local-1043',
    localRef: 'ENC-OFFLINE-7802',
    patientName: 'Kailash Behera',
    ageGender: '62 M',
    chiefComplaint: 'Persistent cough with blood-tinged sputum, low grade fever 12 days',
    priority: 'URGENT',
    hasRedFlag: false,
    attachments: { vitalsRecorded: true, audioMb: 0.8 },
    recordedAt: 'Today, 05:10 PM (Rampur Sub-Centre)',
    syncStatus: 'QUEUED',
  },
]

interface NetworkState {
  mode: NetworkMode
  lastSyncedAt: string
  queue: PendingEncounter[]
  gsmSignalBars: number
  smsAvailable: boolean
  voiceCallAvailable: boolean
  setMode: (mode: NetworkMode) => void
  addEncounter: (encounter: Omit<PendingEncounter, 'id' | 'localRef' | 'recordedAt' | 'syncStatus'>) => void
  syncAll: () => Promise<void>
  retryEncounter: (id: string) => Promise<void>
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  mode: 'ONLINE',
  lastSyncedAt: 'Today, 05:15 PM',
  queue: INITIAL_QUEUE,
  gsmSignalBars: 3,
  smsAvailable: true,
  voiceCallAvailable: true,

  setMode: (mode) => set({ mode }),

  addEncounter: (encounter) => {
    const newEnc: PendingEncounter = {
      ...encounter,
      id: `enc-local-${Date.now()}`,
      localRef: `ENC-OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`,
      recordedAt: 'Just now (Offline Tablet)',
      syncStatus: 'QUEUED',
    }
    set((s) => ({ queue: [newEnc, ...s.queue] }))
  },

  syncAll: async () => {
    set({ mode: 'SYNCING' })
    const queue = get().queue

    // Step 1: Mark all queued as uploading
    set({
      queue: queue.map((item) =>
        item.syncStatus === 'QUEUED' || item.syncStatus === 'FAILED'
          ? { ...item, syncStatus: 'UPLOADING', uploadProgress: 35 }
          : item
      ),
    })

    // Simulate batch progress
    await new Promise((r) => setTimeout(r, 900))
    set({
      queue: get().queue.map((item) =>
        item.syncStatus === 'UPLOADING' ? { ...item, uploadProgress: 85 } : item
      ),
    })

    await new Promise((r) => setTimeout(r, 800))
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Step 2: Mark all as synced
    set({
      mode: 'ONLINE',
      lastSyncedAt: `Today, ${now}`,
      queue: get().queue.map((item) =>
        item.syncStatus === 'UPLOADING' ? { ...item, syncStatus: 'SYNCED', uploadProgress: 100 } : item
      ),
    })
  },

  retryEncounter: async (id) => {
    set((s) => ({
      queue: s.queue.map((it) => (it.id === id ? { ...it, syncStatus: 'UPLOADING', uploadProgress: 50 } : it)),
    }))
    await new Promise((r) => setTimeout(r, 1000))
    set((s) => ({
      queue: s.queue.map((it) => (it.id === id ? { ...it, syncStatus: 'SYNCED', uploadProgress: 100 } : it)),
    }))
  },
}))
