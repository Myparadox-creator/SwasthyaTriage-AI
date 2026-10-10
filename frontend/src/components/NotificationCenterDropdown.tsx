import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  ShieldAlert,
  X,
} from 'lucide-react'
import { api } from '../lib/api'

export interface AppNotification {
  id: string
  category: 'SAFETY_ESCALATION' | 'NEW_ENCOUNTER' | 'CLARIFICATION' | 'HANDOFF' | 'REFERRAL' | 'SYSTEM'
  encounterId?: string
  title: string
  description: string
  priority: 'ROUTINE' | 'URGENT' | 'CRITICAL'
  timestamp: string
  read: boolean
  linkTo: string
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    category: 'SAFETY_ESCALATION',
    encounterId: 'ENC-DEMO-1042',
    title: 'Urgent Cardiac Safety Escalation',
    description: 'Crushing chest pain radiating to arm reported. Red-flag protocol active.',
    priority: 'CRITICAL',
    timestamp: '2 mins ago',
    read: false,
    linkTo: '/app/hcw/communication',
  },
  {
    id: 'notif-2',
    category: 'CLARIFICATION',
    encounterId: 'ENC-DEMO-1039',
    title: 'Clarification Responded by ASHA Sunita',
    description: 'Updated vital signs: Pulse 108 bpm, SpO2 94% provided for case review.',
    priority: 'URGENT',
    timestamp: '14 mins ago',
    read: false,
    linkTo: '/app/hcw/communication',
  },
  {
    id: 'notif-3',
    category: 'HANDOFF',
    encounterId: 'ENC-DEMO-1035',
    title: 'Clinical Handoff Acknowledged',
    description: 'Dr. Debasish Mishra acknowledged receipt of CHC referral handoff.',
    priority: 'ROUTINE',
    timestamp: '42 mins ago',
    read: true,
    linkTo: '/app/hcw/referrals',
  },
  {
    id: 'notif-4',
    category: 'NEW_ENCOUNTER',
    encounterId: 'ENC-DEMO-1048',
    title: 'New Encounter Submitted from Triage Desk',
    description: 'Pediatric high fever 103°F intake completed via voice agent.',
    priority: 'URGENT',
    timestamp: '1 hour ago',
    read: true,
    linkTo: '/app/hcw/queue',
  },
]

export default function NotificationCenterDropdown() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'CLARIFICATION'>('ALL')
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS)

  const fetchLiveNotifications = async () => {
    try {
      const res = await api<{
        items: Array<{
          id: number
          type: string
          title: string
          body: string | null
          case_id: number | null
          read_at: string | null
          created_at: string
        }>
        unread_count: number
      }>('/api/notifications', { params: { per_page: 20 } })

      if (res?.items && res.items.length > 0) {
        const liveItems: AppNotification[] = res.items.map((item) => {
          const isCrit =
            item.title.toLowerCase().includes('emergency') ||
            item.title.toLowerCase().includes('critical') ||
            item.title.toLowerCase().includes('red') ||
            (item.body && item.body.toLowerCase().includes('critical'))
          return {
            id: String(item.id),
            category: item.type === 'case_submitted' ? 'NEW_ENCOUNTER' : 'SAFETY_ESCALATION',
            encounterId: item.case_id ? `CASE-${item.case_id}` : undefined,
            title: item.title,
            description: item.body || 'New clinical event recorded.',
            priority: isCrit ? 'CRITICAL' : 'URGENT',
            timestamp: new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            read: Boolean(item.read_at),
            linkTo: item.case_id ? `/app/hcw/cases/${item.case_id}` : '/app/hcw/queue',
          }
        })
        setNotifications(liveItems)
      }
    } catch {
      // Fallback silently to existing list
    }
  }

  useEffect(() => {
    void fetchLiveNotifications()
    const timer = setInterval(() => {
      void fetchLiveNotifications()
    }, 12000)
    return () => clearInterval(timer)
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length
  const criticalCount = notifications.filter((n) => n.priority === 'CRITICAL' && !n.read).length

  const filtered = notifications.filter((n) => {
    if (filter === 'CRITICAL') return n.priority === 'CRITICAL'
    if (filter === 'CLARIFICATION') return n.category === 'CLARIFICATION'
    return true
  })

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await api('/api/notifications/read-all', { method: 'POST' })
    } catch {}
  }

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    if (/^\d+$/.test(id)) {
      try {
        await api(`/api/notifications/${id}/read`, { method: 'POST' })
      } catch {}
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white ${
              criticalCount > 0 ? 'bg-rose-600 animate-bounce' : 'bg-teal-600'
            }`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-88 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40 animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Notification Centre</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="mt-2.5 flex items-center gap-1.5 border-b border-slate-100 pb-2.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('CRITICAL')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filter === 'CRITICAL' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              🚨 Red Flags ({notifications.filter((n) => n.priority === 'CRITICAL').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('CLARIFICATION')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filter === 'CLARIFICATION' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Clarifications
            </button>
          </div>

          {/* Notifications List */}
          <div className="mt-2.5 max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No notifications in this filter</div>
            ) : (
              filtered.map((n) => (
                <Link
                  key={n.id}
                  to={n.linkTo}
                  onClick={() => {
                    markAsRead(n.id)
                    setOpen(false)
                  }}
                  className={`group block rounded-xl border p-2.5 transition-all hover:shadow-xs ${
                    n.priority === 'CRITICAL'
                      ? 'border-rose-300 bg-rose-50/70 hover:bg-rose-50'
                      : !n.read
                      ? 'border-teal-200 bg-teal-50/40 hover:bg-teal-50/70'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {n.priority === 'CRITICAL' && (
                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 animate-pulse" />
                      )}
                      {n.category === 'CLARIFICATION' && (
                        <HelpCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      {n.category === 'HANDOFF' && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      )}
                      {n.category === 'NEW_ENCOUNTER' && (
                        <AlertCircle className="h-4 w-4 shrink-0 text-blue-600" />
                      )}

                      <span
                        className={`text-xs font-bold leading-tight ${
                          n.priority === 'CRITICAL' ? 'text-rose-900' : 'text-slate-900'
                        }`}
                      >
                        {n.title}
                      </span>
                    </div>

                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-600" />}
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600 line-clamp-2">
                    {n.description}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono font-medium text-slate-600">{n.encounterId}</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{n.timestamp}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Footer Link */}
          <div className="mt-3 border-t border-slate-100 pt-2 text-center">
            <Link
              to="/app/hcw/communication"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"
            >
              <span>Open Staff Communication Centre</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
