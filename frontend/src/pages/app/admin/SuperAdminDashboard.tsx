import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Building,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  ScrollText,
  Send,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import type {
  AiEvaluationReport,
  AuditLogListResponse,
  EvaluationHistoryResponse,
  EvaluationTrendResponse,
  FacilityAnalyticsOut,
  FacilityOut,
  StaffUserOut,
} from '../../../lib/types'

interface HealthState {
  status: string
  app: string
  environment: string
  db: string
  storage: string
  providers: {
    gemini: string
    telephony: string
    email?: string
  }
}

interface SafetyRuleItem {
  id: number
  code: string
  name: string
  description: string
  match_patterns: string[]
  target_priority: string
  display_message: string
  is_active: boolean
}

interface EmailLogItem {
  id: number
  recipient: string
  template_name: string
  status: string
  subject: string
  provider_message_id?: string
  error_message?: string
  retry_count: number
  created_at: string
}

interface EmailStatusState {
  status: string
  provider: string
  configured: boolean
  delivery_mode: string
  sender_name: string
  sender_email: string
  reply_to: string
  recent_stats: {
    total: number
    sent: number
    delivered: number
    failed: number
  }
  recent_logs: EmailLogItem[]
  templates: Array<{
    name: string
    description: string
    purpose: string
  }>
}

const TABS = [
  { id: 'health', label: 'System Health & Overview', icon: Server },
  { id: 'email', label: 'Email System', icon: Mail },
  { id: 'facilities', label: 'Facilities Management', icon: Building },
  { id: 'users', label: 'Platform Users', icon: Users },
  { id: 'ai', label: 'AI Configuration', icon: Sparkles },
  { id: 'safety', label: 'Safety Rules Engine', icon: ShieldAlert },
  { id: 'analytics', label: 'Platform Analytics', icon: TrendingUp },
  { id: 'audit', label: 'Global Audit Logs', icon: ScrollText },
] as const

const PIE_COLORS = ['#0f766e', '#0284c7', '#f59e0b', '#ef4444', '#8b5cf6']

export default function SuperAdminDashboard() {
  const user = useAuthStore((s) => s.user)!
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('health')

  const [health, setHealth] = useState<HealthState | null>(null)
  const [facilities, setFacilities] = useState<FacilityOut[]>([])
  const [users, setUsers] = useState<StaffUserOut[]>([])
  const [rules, setRules] = useState<SafetyRuleItem[]>([])
  const [analytics, setAnalytics] = useState<FacilityAnalyticsOut | null>(null)
  const [audits, setAudits] = useState<AuditLogListResponse | null>(null)
  const [emailStatus, setEmailStatus] = useState<EmailStatusState | null>(null)
  const [aiReport, setAiReport] = useState<AiEvaluationReport | null>(null)
  const [aiHistory, setAiHistory] = useState<EvaluationHistoryResponse | null>(null)
  const [aiTrend, setAiTrend] = useState<EvaluationTrendResponse | null>(null)
  const [runningBenchmark, setRunningBenchmark] = useState(false)
  const [loading, setLoading] = useState(true)

  // Test Email state
  const [testRecipient, setTestRecipient] = useState(user.email || '')
  const [testTemplate, setTestTemplate] = useState('welcome')
  const [sendingTest, setSendingTest] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ success: boolean; msg: string } | null>(null)
  const [retryingId, setRetryingId] = useState<number | null>(null)

  // Add Facility Modal
  const [isAddFacilityOpen, setIsAddFacilityOpen] = useState(false)
  const [facCode, setFacCode] = useState('')
  const [facName, setFacName] = useState('')
  const [facType, setFacType] = useState('PHC')
  const [facDistrict, setFacDistrict] = useState('Khordha')
  const [facPhone, setFacPhone] = useState('')
  const [submittingFac, setSubmittingFac] = useState(false)

  // Edit Facility Modal
  const [editFacility, setEditFacility] = useState<FacilityOut | null>(null)
  const [efName, setEfName] = useState('')
  const [efType, setEfType] = useState('PHC')
  const [efState, setEfState] = useState('Odisha')
  const [efDistrict, setEfDistrict] = useState('')
  const [efAddress, setEfAddress] = useState('')
  const [efPhone, setEfPhone] = useState('')
  const [efActive, setEfActive] = useState(true)
  const [savingFacility, setSavingFacility] = useState(false)

  // Add User Modal
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [usrName, setUsrName] = useState('')
  const [usrEmail, setUsrEmail] = useState('')
  const [usrPassword, setUsrPassword] = useState('Swasthya@123')
  const [usrRole, setUsrRole] = useState('HEALTHCARE_WORKER')
  const [usrFacility, setUsrFacility] = useState<number | ''>('')
  const [usrDesignation, setUsrDesignation] = useState('')
  const [usrPhone, setUsrPhone] = useState('')
  const [submittingUser, setSubmittingUser] = useState(false)

  // Edit User Modal
  const [editUser, setEditUser] = useState<StaffUserOut | null>(null)
  const [euRole, setEuRole] = useState('HEALTHCARE_WORKER')
  const [euFacility, setEuFacility] = useState<number | ''>('')
  const [euDesignation, setEuDesignation] = useState('')
  const [euPhone, setEuPhone] = useState('')
  const [euActive, setEuActive] = useState(true)
  const [savingUser, setSavingUser] = useState(false)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      api<HealthState>('/api/health').catch(() => null),
      api<FacilityOut[]>('/api/admin/facilities').catch(() => []),
      api<StaffUserOut[]>('/api/admin/users').catch(() => []),
      api<SafetyRuleItem[]>('/api/safety/rules?include_inactive=true').catch(() => []),
      api<FacilityAnalyticsOut>('/api/admin/analytics').catch(() => null),
      api<AuditLogListResponse>('/api/audit-logs', { params: { page_size: 30 } }).catch(() => null),
      api<EmailStatusState>('/api/admin/email/status').catch(() => null),
      api<AiEvaluationReport>('/api/admin/ai-evaluation/report').catch(() => null),
      api<EvaluationHistoryResponse>('/api/admin/ai-evaluation/history', { params: { limit: 20 } }).catch(() => null),
      api<EvaluationTrendResponse>('/api/admin/ai-evaluation/trend', { params: { limit: 20 } }).catch(() => null),
    ])
      .then(([hRes, fRes, uRes, rRes, anRes, auRes, eRes, aiRes, hiRes, trRes]) => {
        setHealth(hRes)
        setFacilities(fRes)
        setUsers(uRes)
        setRules(rRes)
        setAnalytics(anRes)
        setAudits(auRes)
        setEmailStatus(eRes)
        setAiReport(aiRes)
        setAiHistory(hiRes)
        setAiTrend(trRes)
      })
      .finally(() => setLoading(false))
  }

  const handleRunBenchmark = async () => {
    setRunningBenchmark(true)
    try {
      const res = await api<AiEvaluationReport>('/api/admin/ai-evaluation/run', { method: 'POST' })
      setAiReport(res)
      const [hiRes, trRes] = await Promise.all([
        api<EvaluationHistoryResponse>('/api/admin/ai-evaluation/history', { params: { limit: 20 } }).catch(() => null),
        api<EvaluationTrendResponse>('/api/admin/ai-evaluation/trend', { params: { limit: 20 } }).catch(() => null),
      ])
      setAiHistory(hiRes)
      setAiTrend(trRes)
    } catch {
      //
    } finally {
      setRunningBenchmark(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!facCode || !facName) return
    setSubmittingFac(true)
    try {
      await api<FacilityOut>('/api/admin/facilities', {
        method: 'POST',
        body: {
          code: facCode.trim(),
          name: facName.trim(),
          facility_type: facType,
          district: facDistrict.trim(),
          state: 'Odisha',
          phone: facPhone.trim() || null,
        },
      })
      setIsAddFacilityOpen(false)
      setFacCode('')
      setFacName('')
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create facility')
    } finally {
      setSubmittingFac(false)
    }
  }

  const openEditFacility = (f: FacilityOut) => {
    setEditFacility(f)
    setEfName(f.name)
    setEfType(f.facility_type)
    setEfState(f.state)
    setEfDistrict(f.district)
    setEfAddress(f.address ?? '')
    setEfPhone(f.phone ?? '')
    setEfActive(f.is_active)
  }

  const handleUpdateFacility = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editFacility) return
    setSavingFacility(true)
    try {
      await api<FacilityOut>(`/api/admin/facilities/${editFacility.id}`, {
        method: 'PATCH',
        body: {
          name: efName.trim(),
          facility_type: efType,
          state: efState.trim(),
          district: efDistrict.trim(),
          address: efAddress.trim() || null,
          phone: efPhone.trim() || null,
          is_active: efActive,
        },
      })
      setEditFacility(null)
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update facility')
    } finally {
      setSavingFacility(false)
    }
  }

  const handleDeleteFacility = async (f: FacilityOut) => {
    if (!window.confirm(`Delete facility "${f.name}" (${f.code})? This cannot be undone.`)) return
    try {
      await api(`/api/admin/facilities/${f.id}`, { method: 'DELETE' })
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete facility')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usrEmail || !usrName || !usrPassword) return
    setSubmittingUser(true)
    try {
      await api<StaffUserOut>('/api/admin/users', {
        method: 'POST',
        body: {
          email: usrEmail.trim(),
          full_name: usrName.trim(),
          password: usrPassword,
          role: usrRole,
          facility_id: usrFacility === '' ? null : usrFacility,
          designation: usrDesignation.trim() || null,
          phone: usrPhone.trim() || null,
        },
      })
      setIsAddUserOpen(false)
      setUsrName('')
      setUsrEmail('')
      setUsrPassword('Swasthya@123')
      setUsrDesignation('')
      setUsrPhone('')
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmittingUser(false)
    }
  }

  const openEditUser = (u: StaffUserOut) => {
    setEditUser(u)
    setEuRole(u.role)
    setEuFacility(u.facility_id ?? '')
    setEuDesignation(u.designation ?? '')
    setEuPhone(u.phone ?? '')
    setEuActive(u.is_active)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    setSavingUser(true)
    try {
      await api<StaffUserOut>(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        body: {
          role: euRole,
          facility_id: euFacility === '' ? null : euFacility,
          designation: euDesignation.trim() || null,
          phone: euPhone.trim() || null,
          is_active: euActive,
        },
      })
      setEditUser(null)
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSavingUser(false)
    }
  }

  const toggleUserActive = async (u: StaffUserOut) => {
    try {
      await api<StaffUserOut>(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: { is_active: !u.is_active },
      })
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user status')
    }
  }

  const handleDeleteUser = async (u: StaffUserOut) => {
    if (!window.confirm(`Remove user "${u.full_name}" (${u.email})? Their access will be revoked immediately.`))
      return
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  const priorityData = analytics
    ? Object.entries(analytics.priority_distribution).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Top Header: Odisha State Health Directorate Platform Command */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-r from-purple-950 via-slate-950 to-slate-900 p-6 sm:p-8 text-white shadow-2xl shadow-purple-950/40">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-400 text-slate-950 shadow-lg shadow-purple-500/30">
              <Server className="h-7 w-7 text-slate-950" />
            </span>
            <div className="min-w-0">
              <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-200 backdrop-blur-md">
                <span>🛡️ State Health Directorate · Global Platform Control</span>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight break-words">
                Odisha Tele-Triage Platform Command Center
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-purple-200/80 break-words">
                Super Administrator: <strong className="text-white">{user.full_name}</strong> · Multi-Tenant Odisha Health Network · AI Safety Rules & Email Infrastructure
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Poll Cluster
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-2 text-xs font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Cluster Healthy
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex overflow-x-auto border-t border-slate-800 pt-3 gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TAB 1: SYSTEM HEALTH */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Neon PostgreSQL</span>
                <Database className="h-4 w-4 text-teal-400" />
              </div>
              <p className="mt-3 text-2xl font-black text-white">
                {health?.db === 'ok' ? 'Connected' : 'Offline'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-400">
                ✓ Serverless connection pooling active
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Gemini AI Engine</span>
                <Sparkles className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="mt-3 text-2xl font-black text-white capitalize">
                {health?.providers?.gemini || 'Gemini 2.5'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan-400">
                Structured clinical extraction service
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Telephony Engine</span>
                <Activity className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-3 text-2xl font-black text-white capitalize">
                {health?.providers?.telephony || 'VideoSDK'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400">
                Outbound speech follow-up agent
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Medical Storage</span>
                <HardDrive className="h-4 w-4 text-purple-400" />
              </div>
              <p className="mt-3 text-2xl font-black text-white">
                {health?.storage === 'ok' ? 'Online' : 'Degraded'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-purple-400">
                Encrypted uploads probe passed
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Email Delivery</span>
                <Mail className="h-4 w-4 text-sky-400" />
              </div>
              <p className="mt-3 text-2xl font-black text-white">
                {emailStatus?.configured ? 'Active' : 'Offline'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400">
                Mode: {emailStatus?.delivery_mode || 'live'} · {emailStatus?.provider || 'Email'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-white space-y-3">
            <h3 className="text-sm font-bold text-teal-300">Cluster Architecture & High Availability</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              SwasthyaTriage AI leverages a decoupled microservices architecture: FastAPI ASGI engine running asynchronously with Pydantic validation, Neon PostgreSQL providing instant branch replication and automated backup, a configurable transactional email engine (Gmail SMTP or Resend) for secure clinical notifications, and stateless Gemini AI service wrappers guaranteeing deterministic failover.
            </p>
          </div>
        </div>
      )}

      {/* TAB: EMAIL SYSTEM */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          {/* Email Provider Status Banner */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-white shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400">
                  <Mail className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white break-words">{emailStatus?.provider || 'Transactional Email'} System</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        emailStatus?.configured
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {emailStatus?.configured ? 'API Connected' : 'Configuration Pending'}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
                      Mode: {emailStatus?.delivery_mode || 'live'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Sender: <span className="font-semibold text-slate-200">{emailStatus?.sender_name}</span> &lt;{emailStatus?.sender_email}&gt; · Reply-to: {emailStatus?.reply_to}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadData}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase">Total Dispatched</span>
                <Send className="h-4 w-4 text-sky-400" />
              </div>
              <p className="mt-3 text-3xl font-black text-white">
                {emailStatus?.recent_stats?.total ?? 0}
              </p>
              <span className="mt-1 text-[11px] text-slate-400">Across all healthcare events</span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase">Delivered</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-3 text-3xl font-black text-emerald-400">
                {emailStatus?.recent_stats?.delivered ?? 0}
              </p>
              <span className="mt-1 text-[11px] text-emerald-400/80">Confirmed provider acceptance</span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase">In-Transit / Sent</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-3 text-3xl font-black text-amber-400">
                {emailStatus?.recent_stats?.sent ?? 0}
              </p>
              <span className="mt-1 text-[11px] text-amber-400/80">Queued & dispatched</span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase">Failed / Bounced</span>
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
              <p className="mt-3 text-3xl font-black text-red-400">
                {emailStatus?.recent_stats?.failed ?? 0}
              </p>
              <span className="mt-1 text-[11px] text-red-400/80">Automatic retry available</span>
            </div>
          </div>

          {/* Test Email Dispatch Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="h-4 w-4 text-teal-400" />
                Send Diagnostic Transactional Email
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dispatch an authentic transactional email through the configured provider using any system template to verify template rendering and inbox deliverability.
              </p>
            </div>

            {testFeedback && (
              <div
                className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-2 ${
                  testFeedback.success
                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                    : 'border-red-500/30 bg-red-950/40 text-red-300'
                }`}
              >
                <span className="min-w-0 break-words">{testFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setTestFeedback(null)}
                  className="text-slate-400 hover:text-white shrink-0 text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!testRecipient) return
                setSendingTest(true)
                setTestFeedback(null)
                try {
                  const res = await api<{ success: boolean; provider_message_id?: string; detail?: string }>(
                    '/api/admin/email/test',
                    {
                      method: 'POST',
                      body: {
                        recipient: testRecipient,
                        template_name: testTemplate,
                      },
                    },
                  )
                  setTestFeedback({
                    success: true,
                    msg: `Email successfully dispatched! Message ID: ${res.provider_message_id || 'Accepted by provider'}`,
                  })
                  loadData()
                } catch (err) {
                  setTestFeedback({
                    success: false,
                    msg: err instanceof Error ? err.message : 'Failed to send test email',
                  })
                } finally {
                  setSendingTest(false)
                }
              }}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Recipient Address:</label>
                <input
                  type="email"
                  required
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="admin@swasthyatriage.gov.in"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Template:</label>
                <select
                  value={testTemplate}
                  onChange={(e) => setTestTemplate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-teal-400 focus:outline-none"
                >
                  <option value="welcome">Welcome to SwasthyaFlow AI</option>
                  <option value="email_verification">Verify Email Address</option>
                  <option value="password_reset">Reset Password</option>
                  <option value="password_changed">Password Changed Confirmation</option>
                  <option value="staff_invitation">Staff Invitation</option>
                  <option value="encounter_assignment">Encounter Assignment</option>
                  <option value="clarification_request">Clarification Request</option>
                  <option value="referral_status">Referral Status</option>
                  <option value="security_alert">Important Security Alert</option>
                </select>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
                >
                  {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Test Email
                </button>
              </div>
            </form>
          </div>

          {/* Email Template Inventory */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <h3 className="text-sm font-bold text-white">System Email Templates</h3>
            <p className="text-xs text-slate-400">
              Responsive SaaS HTML + plaintext templates compliant with healthcare privacy regulations (non-diagnostic, no raw symptoms in unauthenticated email bodies).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'welcome', label: 'Welcome to SwasthyaFlow', purpose: 'Account onboarding & welcome' },
                { name: 'email_verification', label: 'Email Verification', purpose: 'Account security & verification CTA' },
                { name: 'password_reset', label: 'Password Reset', purpose: 'Time-limited SHA-256 token reset link' },
                { name: 'password_changed', label: 'Password Changed', purpose: 'Account security notification' },
                { name: 'staff_invitation', label: 'Staff Invitation', purpose: 'Facility clinician onboard invitation' },
                { name: 'encounter_assignment', label: 'Encounter Assigned', purpose: 'Clinician triage review assignment' },
                { name: 'clarification_request', label: 'Clarification Required', purpose: 'Follow-up query notification' },
                { name: 'referral_status', label: 'Referral Status', purpose: 'Clinical handoff workflow update' },
                { name: 'security_alert', label: 'Security Alert', purpose: 'Account change or security warning' },
              ].map((t) => (
                <div key={t.name} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{t.label}</span>
                    <span className="font-mono text-[10px] text-teal-400">HTML+Text</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{t.purpose}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Dispatch Logs */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Recent Transactional Email Logs</h3>
                <p className="text-xs text-slate-400 break-words">Audit trail of all transactional notifications dispatched by backend triggers.</p>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="text-xs text-teal-400 hover:underline flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="h-3 w-3" /> Refresh Logs
              </button>
            </div>

            {(!emailStatus?.recent_logs || emailStatus.recent_logs.length === 0) ? (
              <p className="text-xs text-slate-500 py-4 text-center">No email dispatches recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Recipient</th>
                      <th className="p-3">Template</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Message ID / Detail</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {emailStatus.recent_logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/50">
                        <td className="p-3 font-mono text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                        <td className="p-3 font-medium text-white">{log.recipient}</td>
                        <td className="p-3">
                          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                            {log.template_name}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 max-w-[200px] truncate">{log.subject}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              log.status === 'delivered'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : log.status === 'sent'
                                ? 'bg-sky-500/20 text-sky-400'
                                : log.status === 'failed'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400 max-w-[200px] truncate">
                          {log.provider_message_id || log.error_message || '--'}
                        </td>
                        <td className="p-3 text-right">
                          {log.status === 'failed' && (
                            <button
                              type="button"
                              disabled={retryingId === log.id}
                              onClick={async () => {
                                setRetryingId(log.id)
                                try {
                                  await api(`/api/admin/email/retry/${log.id}`, { method: 'POST' })
                                  loadData()
                                } catch {
                                  //
                                } finally {
                                  setRetryingId(null)
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-teal-300 hover:bg-slate-700"
                            >
                              <RotateCw className={`h-3 w-3 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FACILITIES MANAGEMENT */}
      {activeTab === 'facilities' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white break-words">Registered Healthcare Facilities</h2>
              <p className="text-xs text-slate-400 break-words">
                Manage PHCs, CHCs, Government Hospitals, and Industrial Clinics.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddFacilityOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Register New Facility
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                <tr>
                  <th className="p-3">Facility Code</th>
                  <th className="p-3">Facility Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">District & State</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {facilities.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-teal-400">{f.code}</td>
                    <td className="p-3 font-semibold text-white">{f.name}</td>
                    <td className="p-3">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                        {f.facility_type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{f.district}, {f.state}</td>
                    <td className="p-3 text-slate-400">{f.phone || '--'}</td>
                    <td className="p-3">
                      {f.is_active ? (
                        <span className="rounded-full bg-emerald-950 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-800 border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditFacility(f)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-teal-300 hover:bg-slate-700"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFacility(f)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-950/60 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-900/60"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PLATFORM USERS */}
      {activeTab === 'users' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Platform Users Directory</h2>
              <p className="text-xs text-slate-400">Total accounts across all facilities: {users.length}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddUserOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              Add New User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                <tr>
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">System Role</th>
                  <th className="p-3">Assigned Facility</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/50">
                    <td className="p-3 font-semibold text-white">{u.full_name}</td>
                    <td className="p-3 text-slate-300">{u.email}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-amber-950 border border-amber-500/40 text-amber-300'
                            : u.role === 'FACILITY_ADMIN'
                            ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-300'
                            : u.role === 'HEALTHCARE_WORKER'
                            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{u.facility_name || 'Global / Platform'}</td>
                    <td className="p-3">
                      {u.is_active ? (
                        <span className="rounded-full bg-emerald-950 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 font-bold">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-800 border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400 font-bold">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-teal-300 hover:bg-slate-700"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleUserActive(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-slate-700"
                        >
                          <Power className="h-3 w-3" /> {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-950/60 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-900/60"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: AI CONFIGURATION & EVALUATION BENCHMARK DASHBOARD */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* Top Bar: Benchmarking Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-400 shrink-0" />
                <h2 className="text-base font-bold text-white break-words">Multilingual AI Quality & Evaluation Benchmark</h2>
                <span className="rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 text-[10px] font-mono font-bold">
                  {aiReport?.overall_metrics?.calibration_status || 'EMPIRICALLY_EVALUATED'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Rigorous, reproducible speech transcription (WER/CER), clinical extraction (Precision/Recall/F1), and ECE calibration metrics across Odia, Hindi, and English.
              </p>
              {aiReport?.timestamp && (
                <p className="mt-1 text-[11px] font-mono text-slate-500">
                  Last benchmark run: {new Date(aiReport.timestamp).toLocaleString()} · {aiReport.total_test_cases} test cases evaluated
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRunBenchmark}
              disabled={runningBenchmark}
              className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-teal-400 disabled:opacity-50 shrink-0"
            >
              <RotateCw className={`h-4 w-4 ${runningBenchmark ? 'animate-spin' : ''}`} />
              {runningBenchmark ? 'Evaluating Live Models...' : 'Run Live Benchmark'}
            </button>
          </div>

          {/* Metric Overview Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <span className="text-xs font-bold text-slate-400 uppercase">Word Error Rate (WER)</span>
              <p className="mt-2 text-2xl font-black text-teal-400 font-mono">
                {aiReport ? `${(aiReport.overall_metrics.mean_wer * 100).toFixed(1)}%` : '--'}
              </p>
              <span className="mt-1 block text-[11px] text-slate-400">
                Speech recognition accuracy across all 3 languages
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <span className="text-xs font-bold text-slate-400 uppercase">Character Error Rate (CER)</span>
              <p className="mt-2 text-2xl font-black text-cyan-400 font-mono">
                {aiReport ? `${(aiReport.overall_metrics.mean_cer * 100).toFixed(1)}%` : '--'}
              </p>
              <span className="mt-1 block text-[11px] text-slate-400">
                Sub-word Levenshtein distance on Odia/Devanagari scripts
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <span className="text-xs font-bold text-slate-400 uppercase">Clinical Entity F1-Score</span>
              <p className="mt-2 text-2xl font-black text-emerald-400 font-mono">
                {aiReport ? `${(aiReport.overall_metrics.mean_f1 * 100).toFixed(1)}%` : '--'}
              </p>
              <span className="mt-1 block text-[11px] text-slate-400">
                Harmonic mean of precision ({aiReport ? (aiReport.overall_metrics.mean_precision * 100).toFixed(0) : '--'}%) & recall ({aiReport ? (aiReport.overall_metrics.mean_recall * 100).toFixed(0) : '--'}%)
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <span className="text-xs font-bold text-slate-400 uppercase">Expected Calibration (ECE)</span>
              <p className="mt-2 text-2xl font-black text-amber-400 font-mono">
                {aiReport ? `${(aiReport.overall_metrics.expected_calibration_error_ece * 100).toFixed(2)}%` : '--'}
              </p>
              <span className="mt-1 block text-[11px] text-slate-400">
                Binned confidence vs empirical accuracy deviation
              </span>
            </div>
          </div>

          {/* Metric Drift Monitoring & Run History (Feature: drift monitoring) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  Metric Drift Monitoring & Run History
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Persisted benchmark runs compared over time. Monitoring signals only — not clinical validation.
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
                  aiTrend?.drift_detected
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {aiTrend?.drift_detected ? `Drift Detected: ${aiTrend.drift_metrics.join(', ')}` : 'No Drift Detected'}
              </span>
            </div>

            {aiTrend && aiTrend.run_count > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-3">Metric</th>
                      <th className="p-3">Latest</th>
                      <th className="p-3">Previous</th>
                      <th className="p-3">Delta</th>
                      <th className="p-3">Limit</th>
                      <th className="p-3">Trend</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {Object.entries(aiTrend.metrics).map(([metric, m]) => (
                      <tr key={metric} className="hover:bg-slate-800/50">
                        <td className="p-3 font-mono text-slate-300">{metric}</td>
                        <td className="p-3 font-mono text-white">{m.latest.toFixed(4)}</td>
                        <td className="p-3 font-mono text-slate-400">{m.previous != null ? m.previous.toFixed(4) : '--'}</td>
                        <td className={`p-3 font-mono ${m.drift_detected ? 'text-red-300' : 'text-slate-400'}`}>
                          {m.delta != null ? `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(4)}` : '--'}
                        </td>
                        <td className="p-3 font-mono text-slate-500">{m.limit} ({m.better})</td>
                        <td className="p-3 text-slate-300 capitalize">{m.direction}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              m.drift_detected
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {m.threshold_breached ? 'BREACH' : m.drift_detected ? 'DRIFT' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">
                No persisted evaluation runs yet. Run a live benchmark to start tracking drift.
              </p>
            )}

            {aiHistory && aiHistory.runs.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Runs</h4>
                <div className="space-y-1.5">
                  {aiHistory.runs.slice(0, 8).map((run) => (
                    <div
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-teal-400">#{run.id}</span>
                        <span className="text-slate-300">{new Date(run.created_at).toLocaleString()}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          {run.dataset_version} · {run.model_version}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {run.thresholds_breached.length > 0 ? (
                          <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-bold text-red-300">
                            {run.thresholds_breached.length} breach
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                            within limits
                          </span>
                        )}
                        <span className="text-slate-500">{run.total_samples} samples</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiHistory?.note && <p className="text-[10px] italic text-slate-500">{aiHistory.note}</p>}
          </div>

          {/* Multilingual Breakdown Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Language-Wise Quality Breakdown (Odia · Hindi · Indian English)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                  <tr>
                    <th className="p-3">Language</th>
                    <th className="p-3">Test Cases</th>
                    <th className="p-3">Speech WER</th>
                    <th className="p-3">Speech CER</th>
                    <th className="p-3">NER Precision</th>
                    <th className="p-3">NER Recall</th>
                    <th className="p-3">Clinical F1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {aiReport && Object.entries(aiReport.language_breakdown).map(([code, lData]) => (
                    <tr key={code} className="hover:bg-slate-800/50">
                      <td className="p-3 font-semibold text-white">
                        {lData.name} <span className="font-mono text-[10px] text-slate-400 uppercase">({code})</span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{lData.sample_count}</td>
                      <td className="p-3 font-mono text-teal-400">{(lData.mean_wer * 100).toFixed(1)}%</td>
                      <td className="p-3 font-mono text-cyan-400">{(lData.mean_cer * 100).toFixed(1)}%</td>
                      <td className="p-3 font-mono text-slate-300">{(lData.entity_precision * 100).toFixed(1)}%</td>
                      <td className="p-3 font-mono text-slate-300">{(lData.entity_recall * 100).toFixed(1)}%</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">{(lData.entity_f1 * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Case Scenarios */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Validated Benchmark Scenarios (Permitted Synthetic Cohort)
            </h3>
            <div className="space-y-2">
              {aiReport?.cases.map((cs) => (
                <div key={cs.case_id} className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-400">{cs.case_id}</span>
                      <span className="font-semibold text-white">{cs.scenario}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 uppercase">
                        {cs.language}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
                    <span className="text-slate-400">WER: <strong className="text-teal-300">{(cs.wer * 100).toFixed(1)}%</strong></span>
                    <span className="text-slate-400">CER: <strong className="text-cyan-300">{(cs.cer * 100).toFixed(1)}%</strong></span>
                    <span className="text-slate-400">Entity F1: <strong className="text-emerald-300">{(cs.entity_f1 * 100).toFixed(1)}%</strong></span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cs.is_emergency ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {cs.is_emergency ? 'EMERGENCY' : 'TRIAGE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Underlying Model Config Box */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-white">Google Gemini Model Parameters</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Generative Triage Model:</label>
                <input
                  type="text"
                  disabled
                  value="gemini-2.5-flash / gemini-3-flash-preview"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-teal-400 font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-300">Extraction Temperature:</label>
                  <input
                    type="text"
                    disabled
                    value="0.1 (Strict Deterministic)"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Fallback Strategy:</label>
                  <input
                    type="text"
                    disabled
                    value="Keyword & RegEx Banking"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-300"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 text-xs text-teal-300">
                ℹ️ Strict Output Enforcement: All LLM responses serialize into Pydantic models with pre-defined schema validation. Free-form clinical speculation is prohibited.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SAFETY RULES ENGINE */}
      {activeTab === 'safety' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Configured Deterministic Safety Rules</h2>
            <p className="text-xs text-slate-400">
              Evaluated on every intake turn without relying solely on LLM probability.
            </p>
          </div>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4 transition hover:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs font-bold text-teal-400">{rule.code}</span>
                    <span className="text-xs font-bold text-white break-words">— {rule.name}</span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      rule.target_priority === 'URGENT_REVIEW'
                        ? 'bg-red-950 border border-red-500/40 text-red-300'
                        : 'bg-amber-950 border border-amber-500/40 text-amber-300'
                    }`}
                  >
                    Priority: {rule.target_priority}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-400">{rule.description}</p>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
                    Match Patterns:
                  </span>
                  {rule.match_patterns?.map((pat, i) => (
                    <span
                      key={i}
                      className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300"
                    >
                      "{pat}"
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: PLATFORM ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <h3 className="text-sm font-bold text-white">Cross-Facility Intake Volume</h3>
              <div className="mt-4 h-64 w-full">
                {analytics?.daily_trend && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                      <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-white">
              <h3 className="text-sm font-bold text-white">Global Priority Ratio</h3>
              <div className="mt-4 h-64 w-full flex items-center justify-center">
                {priorityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-xs text-slate-500">Loading...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: GLOBAL AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-white space-y-4">
          <h2 className="text-base font-bold text-white">Cross-Facility Global Audit Registry</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Facility ID</th>
                  <th className="p-3">Case</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {audits?.items.map((al) => (
                  <tr key={al.id} className="hover:bg-slate-800/50">
                    <td className="p-3 font-mono text-slate-400">{new Date(al.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium text-white">{al.actor_label || 'System'}</td>
                    <td className="p-3 text-slate-300">{al.actor_role}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-teal-300">
                        {al.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{al.facility_id || 'Global'}</td>
                    <td className="p-3 font-mono text-teal-400">{al.case_number || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD FACILITY MODAL */}
      {isAddFacilityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateFacility}
            className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Register New Healthcare Facility</h3>
              <button
                type="button"
                onClick={() => setIsAddFacilityOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Facility Code:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PHC-OD-PURI-05"
                  value={facCode}
                  onChange={(e) => setFacCode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Facility Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Puri Town Primary Health Centre"
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Facility Type:</label>
                <select
                  value={facType}
                  onChange={(e) => setFacType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                >
                  <option value="PHC">Primary Health Centre (PHC)</option>
                  <option value="CHC">Community Health Centre (CHC)</option>
                  <option value="GOVERNMENT_HOSPITAL">Government Hospital</option>
                  <option value="COMPANY_CLINIC">Company / Industrial Clinic</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300">District (Odisha):</label>
                <input
                  type="text"
                  required
                  value={facDistrict}
                  onChange={(e) => setFacDistrict(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Phone Number:</label>
                <input
                  type="text"
                  value={facPhone}
                  onChange={(e) => setFacPhone(e.target.value)}
                  placeholder="+91-674-2000005"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddFacilityOpen(false)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingFac}
                className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
              >
                {submittingFac ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building className="h-4 w-4" />}
                Save Facility
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT FACILITY MODAL */}
      {editFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleUpdateFacility}
            className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit Facility · {editFacility.code}</h3>
              <button
                type="button"
                onClick={() => setEditFacility(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Facility Name:</label>
                <input
                  type="text"
                  required
                  value={efName}
                  onChange={(e) => setEfName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Facility Type:</label>
                <select
                  value={efType}
                  onChange={(e) => setEfType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                >
                  <option value="PHC">Primary Health Centre (PHC)</option>
                  <option value="CHC">Community Health Centre (CHC)</option>
                  <option value="GOVERNMENT_HOSPITAL">Government Hospital</option>
                  <option value="COMPANY_CLINIC">Company / Industrial Clinic</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300">State:</label>
                  <input
                    type="text"
                    value={efState}
                    onChange={(e) => setEfState(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">District:</label>
                  <input
                    type="text"
                    value={efDistrict}
                    onChange={(e) => setEfDistrict(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-300">Address:</label>
                <input
                  type="text"
                  value={efAddress}
                  onChange={(e) => setEfAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Phone Number:</label>
                <input
                  type="text"
                  value={efPhone}
                  onChange={(e) => setEfPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={efActive}
                  onChange={(e) => setEfActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-teal-500"
                />
                Facility is active (accepting patients)
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditFacility(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingFacility}
                className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
              >
                {savingFacility ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD USER MODAL */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Add New Platform User</h3>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Full Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Sasmita Mohanty"
                  value={usrName}
                  onChange={(e) => setUsrName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Email Address:</label>
                <input
                  type="email"
                  required
                  placeholder="user@swasthyatriage.demo"
                  value={usrEmail}
                  onChange={(e) => setUsrEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Temporary Password:</label>
                <input
                  type="text"
                  required
                  value={usrPassword}
                  onChange={(e) => setUsrPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">System Role:</label>
                <select
                  value={usrRole}
                  onChange={(e) => setUsrRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                >
                  <option value="HEALTHCARE_WORKER">Healthcare Worker (Doctor / Nurse)</option>
                  <option value="FACILITY_ADMIN">Facility Administrator</option>
                  <option value="SUPER_ADMIN">Super Administrator (State Directorate)</option>
                </select>
              </div>
              {usrRole !== 'SUPER_ADMIN' && (
                <div>
                  <label className="font-semibold text-slate-300">Assigned Facility:</label>
                  <select
                    required
                    value={usrFacility}
                    onChange={(e) => setUsrFacility(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                  >
                    <option value="">Select a facility…</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="font-semibold text-slate-300">Designation:</label>
                <input
                  type="text"
                  placeholder="Medical Officer, Staff Nurse, Health Worker"
                  value={usrDesignation}
                  onChange={(e) => setUsrDesignation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Phone Number:</label>
                <input
                  type="text"
                  placeholder="+91-9876543210"
                  value={usrPhone}
                  onChange={(e) => setUsrPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingUser}
                className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
              >
                {submittingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleUpdateUser}
            className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit User · {editUser.full_name}</h3>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-400">{editUser.email}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300">System Role:</label>
                <select
                  value={euRole}
                  onChange={(e) => setEuRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                >
                  <option value="HEALTHCARE_WORKER">Healthcare Worker (Doctor / Nurse)</option>
                  <option value="FACILITY_ADMIN">Facility Administrator</option>
                  <option value="SUPER_ADMIN">Super Administrator (State Directorate)</option>
                </select>
              </div>
              {euRole !== 'SUPER_ADMIN' && (
                <div>
                  <label className="font-semibold text-slate-300">Assigned Facility:</label>
                  <select
                    value={euFacility}
                    onChange={(e) => setEuFacility(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="font-semibold text-slate-300">Designation:</label>
                <input
                  type="text"
                  value={euDesignation}
                  onChange={(e) => setEuDesignation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-300">Phone Number:</label>
                <input
                  type="text"
                  value={euPhone}
                  onChange={(e) => setEuPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={euActive}
                  onChange={(e) => setEuActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-teal-500"
                />
                Account active (can sign in)
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingUser}
                className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-teal-400 disabled:opacity-50"
              >
                {savingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
