import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  CheckCheck,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  WifiOff,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/auth'
import { useNetworkStore } from '../../../stores/network'

interface Message {
  id: string
  senderId: string
  senderName: string
  senderRole: 'DOCTOR' | 'NURSE' | 'ASHA' | 'ADMIN' | 'SYSTEM'
  content: string
  timestamp: string
  status: 'SENT' | 'DELIVERED' | 'READ'
  isSystemEvent?: boolean
  isClarification?: boolean
  isHandoff?: boolean
}

interface ConversationItem {
  id: string
  encounterId: string
  patientName: string
  title: string
  participants: { name: string; role: 'DOCTOR' | 'NURSE' | 'ASHA' | 'ADMIN'; online: boolean }[]
  category: 'ASSIGNED' | 'CLARIFICATION' | 'HANDOFF' | 'TEAM'
  priority: 'ROUTINE' | 'URGENT' | 'CRITICAL'
  lastMessage: string
  lastTimestamp: string
  unreadCount: number
  context: {
    status: 'IN_TRIAGE' | 'PENDING_CLARIFICATION' | 'DOCTOR_REVIEW' | 'HANDOFF_READY'
    assignedNurse: string
    assignedDoctor: string
    assignedAsha: string
    chiefComplaint: string
    vitals: { bp: string; spo2: string; pulse: string; temp: string }
    duration: string
    safetyFlag?: string
    pendingClarifications: string[]
    handoffDestination?: string
    handoffAcknowledged?: boolean
  }
  messages: Message[]
}

const INITIAL_CONVERSATIONS: ConversationItem[] = [
  {
    id: 'conv-1042',
    encounterId: 'ENC-DEMO-1042',
    patientName: 'Subhasree Mohapatra (28 F)',
    title: 'Post-Intake Cardiac Distress & Chest Radiance',
    participants: [
      { name: 'Dr. Debasish Mishra', role: 'DOCTOR', online: true },
      { name: 'Nurse Anjali Das', role: 'NURSE', online: true },
      { name: 'Sunita Nayak (ASHA)', role: 'ASHA', online: true },
    ],
    category: 'CLARIFICATION',
    priority: 'CRITICAL',
    lastMessage: 'Vitals re-checked: BP 142/94 mmHg, SpO2 93%. Patient transported to ambulance bay.',
    lastTimestamp: '10:42 AM',
    unreadCount: 2,
    context: {
      status: 'PENDING_CLARIFICATION',
      assignedNurse: 'Nurse Anjali Das',
      assignedDoctor: 'Dr. Debasish Mishra',
      assignedAsha: 'Sunita Nayak (Rampur SC)',
      chiefComplaint: 'Crushing retrosternal chest pain radiating to left arm and jaw for 3 hrs.',
      vitals: { bp: '142/94 mmHg', spo2: '93%', pulse: '112 bpm', temp: '99.1°F' },
      duration: '3 hours',
      safetyFlag: 'CRITICAL RED FLAG — Acute Cardiac Distress / Possible STEMI',
      pendingClarifications: [
        'Confirm if patient has history of angina or diabetes',
        'Has 300mg soluble Aspirin been administered at Sub-Centre?',
      ],
      handoffDestination: 'Capital Hospital Cardiology Ward 4',
      handoffAcknowledged: false,
    },
    messages: [
      {
        id: 'm1',
        senderId: 'asha-1',
        senderName: 'Sunita Nayak (ASHA)',
        senderRole: 'ASHA',
        content: 'Submitted encounter ENC-DEMO-1042 from Rampur village camp. Patient presented with cold sweats and chest pressure.',
        timestamp: '10:35 AM',
        status: 'READ',
      },
      {
        id: 'm2',
        senderId: 'sys',
        senderName: 'Deterministic Safety Engine',
        senderRole: 'SYSTEM',
        content: '🚨 Urgent Red-Flag Triggered: Rule CARDIAC_CHEST_PAIN matched. Triage urgency elevated to RED.',
        timestamp: '10:36 AM',
        status: 'READ',
        isSystemEvent: true,
      },
      {
        id: 'm3',
        senderId: 'nurse-1',
        senderName: 'Nurse Anjali Das',
        senderRole: 'NURSE',
        content: 'Sunita didi, please re-check SpO2 immediately and confirm if she is experiencing shortness of breath while seated.',
        timestamp: '10:38 AM',
        status: 'READ',
        isClarification: true,
      },
      {
        id: 'm4',
        senderId: 'asha-1',
        senderName: 'Sunita Nayak (ASHA)',
        senderRole: 'ASHA',
        content: 'Vitals re-checked: BP 142/94 mmHg, SpO2 93%. Patient transported to ambulance bay.',
        timestamp: '10:42 AM',
        status: 'READ',
      },
      {
        id: 'm5',
        senderId: 'doc-1',
        senderName: 'Dr. Debasish Mishra',
        senderRole: 'DOCTOR',
        content: 'Received notification. Direct ambulance 108 to Capital Hospital CCU directly. Keep 4L O2 mask active.',
        timestamp: '10:44 AM',
        status: 'DELIVERED',
      },
    ],
  },
  {
    id: 'conv-1043',
    encounterId: 'ENC-DEMO-1043',
    patientName: 'Kailash Behera (62 M)',
    title: 'Persistent Febrile Illness & Lab OCR Review',
    participants: [
      { name: 'Dr. Debasish Mishra', role: 'DOCTOR', online: true },
      { name: 'Nurse Anjali Das', role: 'NURSE', online: true },
    ],
    category: 'ASSIGNED',
    priority: 'URGENT',
    lastMessage: 'Lab report OCR extracted: Platelets 85,000 /uL. Dengue NS1 positive.',
    lastTimestamp: '09:15 AM',
    unreadCount: 0,
    context: {
      status: 'DOCTOR_REVIEW',
      assignedNurse: 'Nurse Anjali Das',
      assignedDoctor: 'Dr. Debasish Mishra',
      assignedAsha: 'Puspalata Giri',
      chiefComplaint: 'High-grade fever 103°F with retro-orbital headache for 5 days.',
      vitals: { bp: '110/72 mmHg', spo2: '97%', pulse: '98 bpm', temp: '102.8°F' },
      duration: '5 days',
      safetyFlag: 'URGENT REVIEW — Thrombocytopenia with febrile illness',
      pendingClarifications: [],
      handoffDestination: 'CHC Balipatna Observation Ward',
      handoffAcknowledged: true,
    },
    messages: [
      {
        id: 'm10',
        senderId: 'nurse-1',
        senderName: 'Nurse Anjali Das',
        senderRole: 'NURSE',
        content: 'Lab report OCR extracted: Platelets 85,000 /uL. Dengue NS1 positive.',
        timestamp: '09:15 AM',
        status: 'READ',
      },
    ],
  },
  {
    id: 'conv-1044',
    encounterId: 'ENC-DEMO-1044',
    patientName: 'Anita Sahoo (34 F)',
    title: 'Pediatric Acute Wheeze Consultation',
    participants: [
      { name: 'Dr. Priya Ranjan', role: 'DOCTOR', online: false },
      { name: 'Nurse Anjali Das', role: 'NURSE', online: true },
    ],
    category: 'HANDOFF',
    priority: 'ROUTINE',
    lastMessage: 'Nebulization completed. Respiratory rate stabilized to 22/min.',
    lastTimestamp: 'Yesterday',
    unreadCount: 0,
    context: {
      status: 'HANDOFF_READY',
      assignedNurse: 'Nurse Anjali Das',
      assignedDoctor: 'Dr. Priya Ranjan',
      assignedAsha: 'Sunita Nayak',
      chiefComplaint: 'Mild seasonal wheeze and cough for 2 days.',
      vitals: { bp: '118/76 mmHg', spo2: '99%', pulse: '84 bpm', temp: '98.6°F' },
      duration: '2 days',
      pendingClarifications: [],
      handoffDestination: 'Home Care Guidance',
      handoffAcknowledged: true,
    },
    messages: [
      {
        id: 'm20',
        senderId: 'nurse-1',
        senderName: 'Nurse Anjali Das',
        senderRole: 'NURSE',
        content: 'Nebulization completed. Respiratory rate stabilized to 22/min.',
        timestamp: 'Yesterday',
        status: 'READ',
      },
    ],
  },
]

export default function CommunicationCentre() {
  const user = useAuthStore((s) => s.user)!
  const { mode } = useNetworkStore()

  const [conversations, setConversations] = useState<ConversationItem[]>(INITIAL_CONVERSATIONS)
  const [activeConvId, setActiveConvId] = useState<string>(INITIAL_CONVERSATIONS[0].id)
  const [activeTab, setActiveTab] = useState<'ALL' | 'ASSIGNED' | 'CLARIFICATION' | 'HANDOFF'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [inputText, setInputText] = useState('')

  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0]

  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'ASSIGNED' && c.category !== 'ASSIGNED') return false
    if (activeTab === 'CLARIFICATION' && c.category !== 'CLARIFICATION') return false
    if (activeTab === 'HANDOFF' && c.category !== 'HANDOFF') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        c.encounterId.toLowerCase().includes(q) ||
        c.patientName.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
      )
    }
    return true
  })

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim()) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userRole: 'DOCTOR' | 'NURSE' | 'ASHA' | 'ADMIN' =
      user.role === 'HEALTHCARE_WORKER' ? 'DOCTOR' : user.role === 'FACILITY_ADMIN' ? 'ADMIN' : 'NURSE'

    const newMsg: Message = {
      id: `m-${Date.now()}`,
      senderId: String(user.id),
      senderName: user.full_name || 'Staff Member',
      senderRole: userRole,
      content: inputText.trim(),
      timestamp: now,
      status: mode === 'OFFLINE' ? 'SENT' : 'DELIVERED',
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? {
              ...c,
              lastMessage: newMsg.content,
              lastTimestamp: now,
              messages: [...c.messages, newMsg],
            }
          : c
      )
    )
    setInputText('')
  }

  const handleAttachSummary = () => {
    setInputText(
      `[Encounter Summary Attached]: ${activeConv.encounterId} - Vitals: BP ${activeConv.context.vitals.bp}, SpO2 ${activeConv.context.vitals.spo2}, Pulse ${activeConv.context.vitals.pulse}. Chief Concern: ${activeConv.context.chiefComplaint}`
    )
  }

  const handleRequestClarification = () => {
    setInputText('Please verify patient oxygen saturation on room air and confirm time of onset.')
  }

  const handleAcknowledgeHandoff = () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const ackMsg: Message = {
      id: `m-${Date.now()}`,
      senderId: String(user.id),
      senderName: user.full_name || 'Medical Officer',
      senderRole: 'DOCTOR',
      content: `✅ Clinical Handoff for ${activeConv.encounterId} has been acknowledged and accepted by ${user.full_name}.`,
      timestamp: now,
      status: 'READ',
      isSystemEvent: true,
      isHandoff: true,
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? {
              ...c,
              context: { ...c.context, handoffAcknowledged: true },
              messages: [...c.messages, ackMsg],
            }
          : c
      )
    )
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      {/* Offline Alert Bar if system is offline */}
      {mode === 'OFFLINE' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
          <div className="flex min-w-0 items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="break-words">
              Real-time Socket.IO communication is in Offline Queue Mode. Messages are stored locally on this tablet.
            </span>
          </div>
          <Link to="/app/hcw/sync-queue" className="shrink-0 underline hover:text-rose-950 font-bold">
            View Sync Queue
          </Link>
        </div>
      )}

      {/* Main 3-Panel Layout */}
      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
        {/* LEFT PANEL: Conversations List (col-span-3) */}
        <div className="flex min-h-[45vh] flex-col border-b border-slate-200 bg-slate-50/50 lg:col-span-4 lg:min-h-0 lg:border-b-0 lg:border-r xl:col-span-3 overflow-hidden">
          {/* Header & Search */}
          <div className="p-3.5 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal-600" />
                <span>Staff Conversations</span>
              </h2>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                Socket.IO
              </span>
            </div>

            {/* Search */}
            <div className="relative mt-2.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ENC-ID or staff..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Filter Pills */}
            <div className="mt-2.5 flex items-center gap-1 overflow-x-auto text-[11px] pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition ${
                  activeTab === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CLARIFICATION')}
                className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition ${
                  activeTab === 'CLARIFICATION'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Clarifications (1)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ASSIGNED')}
                className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition ${
                  activeTab === 'ASSIGNED'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Assigned
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('HANDOFF')}
                className={`rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition ${
                  activeTab === 'HANDOFF'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Handoffs
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.map((c) => {
              const isSelected = c.id === activeConv.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveConvId(c.id)}
                  className={`w-full text-left p-3 transition flex flex-col gap-1.5 ${
                    isSelected ? 'bg-teal-50/80 border-l-4 border-l-teal-600 shadow-xs' : 'hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-teal-800 bg-teal-100/80 px-1.5 py-0.5 rounded">
                        {c.encounterId}
                      </span>
                      {c.priority === 'CRITICAL' && (
                        <span className="flex items-center gap-0.5 rounded-full bg-rose-100 text-rose-800 px-1.5 py-0.2 text-[9px] font-extrabold animate-pulse">
                          RED FLAG
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">{c.lastTimestamp}</span>
                  </div>

                  <p className="text-xs font-bold text-slate-800 line-clamp-1">{c.patientName}</p>

                  <p className="text-[11px] text-slate-500 line-clamp-1 leading-normal">{c.lastMessage}</p>

                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {c.participants.map((p) => (
                        <span
                          key={p.name}
                          className={`rounded px-1 text-[9px] font-bold ${
                            p.role === 'DOCTOR'
                              ? 'bg-blue-100 text-blue-800'
                              : p.role === 'NURSE'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.role}
                        </span>
                      ))}
                    </div>

                    {c.unreadCount > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* MIDDLE PANEL: Active Conversation & Composer (col-span-5 / 6) */}
        <div className="flex min-h-[60vh] flex-col bg-white lg:col-span-5 lg:min-h-0 lg:border-r lg:border-slate-200 xl:col-span-6 overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 break-words">{activeConv.title}</h3>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                    {activeConv.encounterId}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Participants:</span>
                  {activeConv.participants.map((p) => (
                    <span key={p.name} className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      />
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Socket Status Indicator */}
            <div className="flex shrink-0 items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                  mode === 'OFFLINE'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    mode === 'OFFLINE' ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                <span>{mode === 'OFFLINE' ? 'Queue Local' : 'Socket.IO Online'}</span>
              </div>
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-3.5 py-1.5 text-xs overflow-x-auto">
            <button
              type="button"
              onClick={handleAttachSummary}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shadow-2xs"
            >
              <Paperclip className="h-3 w-3 text-teal-600" />
              <span>Attach Summary</span>
            </button>
            <button
              type="button"
              onClick={handleRequestClarification}
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap"
            >
              <HelpCircle className="h-3 w-3 text-amber-600" />
              <span>Request Vitals Clarification</span>
            </button>
            {!activeConv.context.handoffAcknowledged && (
              <button
                type="button"
                onClick={handleAcknowledgeHandoff}
                className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Mark Handoff Acknowledged</span>
              </button>
            )}
          </div>

          {/* Message Stream */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 bg-slate-50/30">
            {activeConv.messages.map((m) => {
              if (m.isSystemEvent) {
                return (
                  <div key={m.id} className="flex justify-center my-2">
                    <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-xs">
                      <ShieldAlert className="h-4 w-4 text-rose-600" />
                      <span>{m.content}</span>
                      <span className="text-[10px] text-rose-500 font-mono">{m.timestamp}</span>
                    </div>
                  </div>
                )
              }

              const isMe = String(m.senderId) === String(user.id)
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                    <span className="font-semibold text-slate-700">{m.senderName}</span>
                    <span
                      className={`rounded px-1 text-[9px] font-bold ${
                        m.senderRole === 'DOCTOR'
                          ? 'bg-blue-100 text-blue-800'
                          : m.senderRole === 'NURSE'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {m.senderRole}
                    </span>
                    <span>·</span>
                    <span>{m.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-md rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                      isMe
                        ? 'bg-teal-700 text-white rounded-tr-xs'
                        : m.isClarification
                        ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                    }`}
                  >
                    {m.content}
                  </div>

                  <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-slate-400">
                    {m.status === 'READ' && <CheckCheck className="h-3 w-3 text-teal-600" />}
                    {m.status === 'DELIVERED' && <Check className="h-3 w-3 text-slate-400" />}
                    <span>{m.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Composer */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white">
            <div className="relative">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Type real-time clinical note or clarification (Press Enter to Send)..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 pr-20 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
              />

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="absolute right-2.5 bottom-3.5 flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
              >
                <span>Send</span>
                <Send className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400 px-1">
              <span className="break-words">🔒 Encrypted healthcare staff channel. Audited under clinical review protocol.</span>
              <span>{inputText.length} chars</span>
            </div>
          </form>
        </div>

        {/* RIGHT PANEL: Encounter Context & Provenance (col-span-4 / 3) */}
        <div className="flex flex-col border-t border-slate-200 bg-slate-50/70 p-4 lg:col-span-3 lg:border-t-0 xl:col-span-3 lg:overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Encounter Clinical Context
            </h3>
            <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-800">
              {activeConv.encounterId}
            </span>
          </div>

          {/* Patient Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <p className="text-xs font-bold text-slate-900">{activeConv.patientName}</p>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Workflow State:</span>
              <span className="font-semibold text-teal-700">{activeConv.context.status}</span>
            </div>
          </div>

          {/* Safety Flag Banner */}
          {activeConv.context.safetyFlag && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50/80 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-rose-900">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Deterministic Safety Alert</span>
              </div>
              <p className="mt-1 text-[11px] leading-normal text-rose-700">
                {activeConv.context.safetyFlag}
              </p>
            </div>
          )}

          {/* Vitals Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Verified Intake Vitals
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="text-[10px] text-slate-400 block">Blood Pressure</span>
                <span className="font-bold text-slate-800">{activeConv.context.vitals.bp}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="text-[10px] text-slate-400 block">SpO2 Oxygen</span>
                <span className="font-bold text-teal-700">{activeConv.context.vitals.spo2}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="text-[10px] text-slate-400 block">Pulse Rate</span>
                <span className="font-bold text-slate-800">{activeConv.context.vitals.pulse}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="text-[10px] text-slate-400 block">Duration</span>
                <span className="font-bold text-slate-800">{activeConv.context.duration}</span>
              </div>
            </div>
          </div>

          {/* Chief Complaint */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Chief Concern (Voice Intake)
            </span>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">
              {activeConv.context.chiefComplaint}
            </p>
          </div>

          {/* Pending Clarifications */}
          {activeConv.context.pendingClarifications.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Pending Clarifications</span>
              </div>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-[11px] text-amber-800">
                {activeConv.context.pendingClarifications.map((q, idx) => (
                  <li key={idx} className="leading-normal">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Handoff Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs text-xs space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Clinical Handoff & Referral
            </span>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Destination:</span>
              <span className="font-semibold text-slate-800">{activeConv.context.handoffDestination}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Acknowledgment:</span>
              <span
                className={`font-bold ${
                  activeConv.context.handoffAcknowledged ? 'text-emerald-700' : 'text-amber-600'
                }`}
              >
                {activeConv.context.handoffAcknowledged ? 'Confirmed by Doctor' : 'Pending Reviewer'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
