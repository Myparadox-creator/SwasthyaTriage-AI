import { useCallback, useEffect, useState } from 'react'
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
import { api } from '../../../lib/api'
import type {
  CaseDetail,
  CaseListItem,
  CaseListResponse,
  CaseStatus,
  ChatHistoryResponse,
  ChatMessageOut,
  MessageRole,
} from '../../../lib/types'
import { useAuthStore } from '../../../stores/auth'
import { useNetworkStore } from '../../../stores/network'

type UiRole = 'DOCTOR' | 'NURSE' | 'ASHA' | 'ADMIN' | 'SYSTEM' | 'PATIENT'

interface Message {
  id: string
  senderId: string
  senderName: string
  senderRole: UiRole
  content: string
  timestamp: string
  status: 'SENT' | 'DELIVERED' | 'READ'
  isSystemEvent?: boolean
  isClarification?: boolean
  isHandoff?: boolean
}

interface ConversationItem {
  id: string
  caseId: number
  facilityId: number
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
    status: CaseStatus
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

function uiRoleFor(role: MessageRole): UiRole {
  if (role === 'PATIENT') return 'PATIENT'
  if (role === 'SYSTEM') return 'DOCTOR'
  return 'SYSTEM'
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function derivePriority(c: CaseListItem): 'ROUTINE' | 'URGENT' | 'CRITICAL' {
  if (c.priority === 'URGENT_REVIEW' || c.signal_count > 0) return 'CRITICAL'
  if (c.priority === 'REVIEW_REQUIRED') return 'URGENT'
  return 'ROUTINE'
}

function deriveCategory(c: CaseListItem): 'ASSIGNED' | 'CLARIFICATION' | 'HANDOFF' {
  if (c.status === 'REFERRED' || c.status === 'ESCALATED') return 'HANDOFF'
  if (c.status === 'DRAFT' || c.status === 'FOLLOW_UP_REQUIRED') return 'CLARIFICATION'
  return 'ASSIGNED'
}

function vitalsFrom(detail: CaseDetail | null): { bp: string; spo2: string; pulse: string; temp: string } {
  const find = (needle: string) => detail?.measurements.find((m) => m.name.toLowerCase().includes(needle))
  const show = (m?: { value: string; unit: string | null }) =>
    m ? `${m.value}${m.unit ? ' ' + m.unit : ''}` : '—'
  return {
    bp: show(find('blood pressure') || find('bp')),
    spo2: show(find('spo2') || find('oxygen')),
    pulse: show(find('pulse') || find('heart')),
    temp: show(find('temp')),
  }
}

export default function CommunicationCentre() {
  const user = useAuthStore((s) => s.user)!
  const { mode } = useNetworkStore()

  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeConvId, setActiveConvId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'ALL' | 'ASSIGNED' | 'CLARIFICATION' | 'HANDOFF'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [inputText, setInputText] = useState('')
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat' | 'context'>('list')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024

  const ownRole: 'DOCTOR' | 'NURSE' | 'ADMIN' =
    user.role === 'HEALTHCARE_WORKER' ? 'DOCTOR' : user.role === 'FACILITY_ADMIN' ? 'ADMIN' : 'NURSE'

  const buildConversation = useCallback(
    (c: CaseListItem, prev?: ConversationItem): ConversationItem => ({
      id: `case-${c.id}`,
      caseId: c.id,
      facilityId: c.facility_id,
      encounterId: c.case_number,
      patientName: c.patient_name || 'Patient',
      title: c.chief_concern || 'Clinical encounter',
      participants: [
        {
          name: c.assigned_reviewer_name || 'Unassigned reviewer',
          role: 'DOCTOR' as const,
          online: Boolean(c.assigned_reviewer_id),
        },
        { name: user.full_name || 'You', role: ownRole, online: true },
      ],
      category: deriveCategory(c),
      priority: derivePriority(c),
      lastMessage: prev?.lastMessage || c.chief_concern || 'No messages yet.',
      lastTimestamp: prev?.lastTimestamp || fmt(c.submitted_at || c.created_at),
      unreadCount: prev?.unreadCount ?? 0,
      context: prev?.context ?? {
        status: c.status,
        assignedNurse: '',
        assignedDoctor: c.assigned_reviewer_name || 'Unassigned',
        assignedAsha: '',
        chiefComplaint: c.chief_concern || 'Not recorded',
        vitals: { bp: '—', spo2: '—', pulse: '—', temp: '—' },
        duration: '—',
        safetyFlag:
          c.signal_count > 0 ? `${c.signal_count} deterministic safety signal(s) detected` : undefined,
        pendingClarifications: [],
        handoffDestination: c.facility_name || undefined,
        handoffAcknowledged: c.status === 'REFERRED' || c.status === 'CLOSED',
      },
      messages: prev?.messages ?? [],
    }),
    [ownRole, user.full_name]
  )

  const loadThread = useCallback(async (caseId: number) => {
    try {
      const [history, detail] = await Promise.all([
        api<ChatHistoryResponse>(`/api/cases/${caseId}/chat`),
        api<CaseDetail>(`/api/cases/${caseId}`).catch(() => null),
      ])
      const messages: Message[] = history.messages.map((m: ChatMessageOut) => ({
        id: m.public_id,
        senderId: m.role,
        senderName: m.role === 'PATIENT' ? 'Patient' : m.role === 'AI' ? 'Sonam AI' : 'Clinical Staff',
        senderRole: uiRoleFor(m.role),
        content: m.content,
        timestamp: fmt(m.created_at),
        status: 'READ' as const,
      }))
      const last = messages[messages.length - 1]
      setConversations((prev) =>
        prev.map((c) =>
          c.id === `case-${caseId}`
            ? {
                ...c,
                messages,
                lastMessage: last ? last.content : c.lastMessage,
                lastTimestamp: last ? last.timestamp : c.lastTimestamp,
                context: {
                  ...c.context,
                  status: history.status,
                  chiefComplaint: detail?.chief_concern || c.context.chiefComplaint,
                  vitals: vitalsFrom(detail),
                  duration: detail?.timeline_text || c.context.duration,
                  safetyFlag: detail?.safety_signals?.length
                    ? detail.safety_signals.map((s) => s.label || s.message).join(' · ')
                    : c.context.safetyFlag,
                  pendingClarifications: history.questions.filter((q) => !q.satisfied).map((q) => q.text),
                  handoffAcknowledged:
                    history.status === 'REFERRED' || history.status === 'CLOSED',
                },
              }
            : c
        )
      )
    } catch {
      /* transient thread error — keep last known state */
    }
  }, [])

  const loadCases = useCallback(async () => {
    try {
      const res = await api<CaseListResponse>('/api/cases', { params: { page_size: 50 } })
      setConversations((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]))
        return res.items.map((c) => buildConversation(c, byId.get(`case-${c.id}`)))
      })
      setLoadError(null)
      setActiveConvId((cur) =>
        cur && res.items.some((c) => `case-${c.id}` === cur)
          ? cur
          : res.items[0]
          ? `case-${res.items[0].id}`
          : ''
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load conversations')
    } finally {
      setLoading(false)
    }
  }, [buildConversation])

  useEffect(() => {
    void loadCases()
    const t = setInterval(() => void loadCases(), 15000)
    return () => clearInterval(t)
  }, [loadCases])

  // Privacy: conversations are scoped to the staff member's own organisation.
  // Only SUPER_ADMINS (or staff without a facility yet) see beyond their facility.
  const visibleConversations =
    user.role === 'SUPER_ADMIN' || !user.facility_id
      ? conversations
      : conversations.filter((c) => c.facilityId === user.facility_id)

  const activeConv: ConversationItem =
    (visibleConversations.find((c) => c.id === activeConvId) ||
      visibleConversations[0]) as ConversationItem

  const activeCaseId = activeConv ? activeConv.caseId : null

  useEffect(() => {
    if (!activeCaseId) return
    void loadThread(activeCaseId)
    const t = setInterval(() => void loadThread(activeCaseId), 10000)
    return () => clearInterval(t)
  }, [activeCaseId, loadThread])

  const filteredConversations = visibleConversations.filter((c) => {
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

  const clarificationCount = visibleConversations.filter((c) => c.category === 'CLARIFICATION').length

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const target = activeConv
    const text = inputText.trim()
    if (!text || !target || sending) return
    setSending(true)
    try {
      await api(`/api/cases/${target.caseId}/reply`, { method: 'POST', body: { message: text } })
      setInputText('')
      await loadThread(target.caseId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const handleAttachSummary = () => {
    if (!activeConv) return
    setInputText(
      `[Encounter Summary]: ${activeConv.encounterId} — Vitals: BP ${activeConv.context.vitals.bp}, SpO2 ${activeConv.context.vitals.spo2}, Pulse ${activeConv.context.vitals.pulse}. Chief concern: ${activeConv.context.chiefComplaint}`
    )
  }

  const handleRequestClarification = () => {
    setInputText('Please verify patient oxygen saturation on room air and confirm time of onset.')
  }

  const handleAcknowledgeHandoff = async () => {
    if (!activeConv || sending) return
    setSending(true)
    try {
      await api(`/api/cases/${activeConv.caseId}/reply`, {
        method: 'POST',
        body: { message: `✅ Clinical handoff for ${activeConv.encounterId} acknowledged by ${user.full_name}.` },
      })
      await loadThread(activeConv.caseId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not acknowledge handoff')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      {/* Offline Alert Bar if system is offline */}
      {mode === 'OFFLINE' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
          <div className="flex min-w-0 items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="break-words">
              Live staff communication is in Offline Queue Mode. Messages will sync once connectivity returns.
            </span>
          </div>
          <Link to="/app/hcw/sync-queue" className="shrink-0 underline hover:text-rose-950 font-bold">
            View Sync Queue
          </Link>
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="break-words">{loadError}</span>
        </div>
      )}

      {/* Main 3-Panel Layout */}
      <div className="grid flex-1 grid-cols-1 grid-rows-[auto_1fr] overflow-hidden lg:grid-cols-12 lg:grid-rows-1">
        {/* Mobile single-panel switcher */}
        <div className="col-span-1 flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {(
            [
              { key: 'list', label: 'Conversations' },
              { key: 'chat', label: 'Chat' },
              { key: 'context', label: 'Context' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMobilePanel(t.key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                mobilePanel === t.key
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="col-span-1 flex min-h-0 items-center justify-center p-6 text-sm font-semibold text-slate-500 lg:col-span-12">
            Loading live conversations…
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="col-span-1 flex min-h-0 flex-col items-center justify-center gap-2 p-6 text-center lg:col-span-12">
            <ShieldAlert className="h-8 w-8 text-teal-600" />
            <p className="text-sm font-bold text-slate-700">No conversations available yet.</p>
            <p className="text-xs text-slate-500">
              Conversations appear here for every case you can access. Staff chats are visible only to users
              working in the same organisation.
            </p>
          </div>
        ) : (
          <>
        {/* LEFT PANEL: Conversations List (col-span-3) */}
        <div className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden border-r-0 border-b border-slate-200 bg-slate-50/50 lg:flex lg:col-span-4 lg:border-r lg:border-b-0 xl:col-span-3`}>
          {/* Header & Search */}
          <div className="p-3.5 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal-600" />
                <span>Staff Conversations</span>
              </h2>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                LIVE
              </span>
            </div>

            {/* Search */}
            <div className="relative mt-2.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search case ID or patient..."
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
                Clarifications ({clarificationCount})
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
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center gap-1 p-6 text-center text-xs text-slate-400">
                <Search className="h-5 w-5 text-slate-300" />
                <span>No conversations from your organisation match.</span>
              </div>
            ) : (
              filteredConversations.map((c) => {
              const isSelected = c.id === activeConv?.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveConvId(c.id)
                    if (isMobile()) setMobilePanel('chat')
                  }}
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
              })
            )}
          </div>
        </div>

        {/* MIDDLE PANEL: Active Conversation & Composer (col-span-5 / 6) */}
        <div className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden bg-white lg:flex lg:col-span-5 lg:border-r lg:border-slate-200 xl:col-span-6`}>
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

            {/* Live Status Indicator */}
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
                <span>{mode === 'OFFLINE' ? 'Queue Local' : 'Live'}</span>
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
            {activeConv.messages.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-xs text-slate-400">
                <MessageSquare className="h-5 w-5 text-slate-300" />
                <span>No messages on this case yet.</span>
              </div>
            ) : (
              activeConv.messages.map((m) => {
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
            })
            )}
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
                    void handleSendMessage()
                  }
                }}
                placeholder="Type a clinical note or reply (Enter to send, Shift+Enter for newline)..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 pr-20 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="absolute right-2.5 bottom-3.5 flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
              >
                <span>{sending ? 'Sending…' : 'Send'}</span>
                <Send className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400 px-1">
              <span className="break-words">🔒 Sent as a clinical reply on the case record. Audited under clinical review protocol.</span>
              <span>{inputText.length} chars</span>
            </div>
          </form>
        </div>

        {/* RIGHT PANEL: Encounter Context & Provenance (col-span-4 / 3) */}
        <div className={`${mobilePanel === 'context' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-4 lg:flex lg:col-span-3 lg:border-t-0 xl:col-span-3 space-y-4`}>
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
                {activeConv?.context.safetyFlag}
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
              <span className="font-semibold text-slate-800">{activeConv.context.handoffDestination || '—'}</span>
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
          </>
        )}
      </div>
    </div>
  )
}
