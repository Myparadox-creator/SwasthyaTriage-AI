import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Building,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  ScrollText,
  Settings,
  UserCheck,
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
import { api, getAccessToken } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import type {
  AuditLogListResponse,
  CaseListResponse,
  FacilityAnalyticsOut,
  FollowUpListResponse,
  StaffUserOut,
} from '../../../lib/types'


const TABS = [
  { id: 'overview', label: 'Overview & Analytics', icon: BarChart3 },
  { id: 'staff', label: 'Staff Management', icon: Users },
  { id: 'cases', label: 'Facility Cases', icon: FileText },
  { id: 'followups', label: 'Follow-ups', icon: Activity },
  { id: 'reports', label: 'Excel Reports', icon: FileSpreadsheet },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  { id: 'settings', label: 'Facility Settings', icon: Settings },
] as const

const PIE_COLORS = ['#0f766e', '#0284c7', '#f59e0b', '#ef4444', '#8b5cf6']

export default function FacilityAdminDashboard() {
  const user = useAuthStore((s) => s.user)!
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('overview')

  // Tab Data States
  const [analytics, setAnalytics] = useState<FacilityAnalyticsOut | null>(null)
  const [staff, setStaff] = useState<StaffUserOut[]>([])
  const [cases, setCases] = useState<CaseListResponse | null>(null)
  const [followups, setFollowups] = useState<FollowUpListResponse | null>(null)
  const [audits, setAudits] = useState<AuditLogListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Add Staff Modal
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [newStaffEmail, setNewStaffEmail] = useState('')
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<'HEALTHCARE_WORKER' | 'FACILITY_ADMIN'>('HEALTHCARE_WORKER')
  const [newStaffDesignation, setNewStaffDesignation] = useState('Staff Nurse')
  const [newStaffPhone, setNewStaffPhone] = useState('')
  const [submittingStaff, setSubmittingStaff] = useState(false)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      api<FacilityAnalyticsOut>('/api/admin/analytics').catch(() => null),
      api<StaffUserOut[]>('/api/admin/users').catch(() => []),
      api<CaseListResponse>('/api/cases', { params: { page_size: 20 } }).catch(() => null),
      api<FollowUpListResponse>('/api/followups', { params: { page_size: 20 } }).catch(() => null),
      api<AuditLogListResponse>('/api/audit-logs', { params: { page_size: 25 } }).catch(() => null),
    ])
      .then(([anRes, staffRes, casesRes, fuRes, auditRes]) => {
        setAnalytics(anRes)
        setStaff(staffRes)
        setCases(casesRes)
        setFollowups(fuRes)
        setAudits(auditRes)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStaffEmail || !newStaffName) return
    setSubmittingStaff(true)
    try {
      await api<StaffUserOut>('/api/admin/users', {
        method: 'POST',
        body: {
          email: newStaffEmail,
          full_name: newStaffName,
          password: 'Swasthya@123',
          role: newStaffRole,
          designation: newStaffDesignation,
          phone: newStaffPhone || null,
        },
      })
      setIsAddStaffOpen(false)
      setNewStaffEmail('')
      setNewStaffName('')
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create staff user')
    } finally {
      setSubmittingStaff(false)
    }
  }

  const [exportingPatients, setExportingPatients] = useState(false)

  const handleDownloadExcel = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/exports/excel', {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Facility_Report_${user.facility_name ?? 'PHC'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadPatientExcel = async () => {
    setExportingPatients(true)
    try {
      const response = await fetch('/api/exports/patients', {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      if (!response.ok) throw new Error('Failed to export patient registry')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Patient_Registry_${user.facility_name ?? 'PHC'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingPatients(false)
    }
  }

  const languageChartData = analytics
    ? Object.entries(analytics.language_distribution).map(([name, value]) => ({
        name: name.toUpperCase(),
        value,
      }))
    : []


  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Top Header: Facility Incharge Operational Console */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-200/90 bg-gradient-to-r from-indigo-900 via-slate-900 to-teal-950 p-6 sm:p-8 text-white shadow-xl shadow-indigo-950/20">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-teal-400 text-slate-950 shadow-lg shadow-indigo-500/30">
              <Building className="h-7 w-7 text-slate-950" />
            </span>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-200 backdrop-blur-md">
                <span>🏢 Facility Administration Console · Institutional Incharge</span>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight">
                {user.facility_name ?? 'Primary Health Centre'}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-indigo-100/80">
                Facility Administrator: <strong className="text-white">{user.full_name}</strong> · Staff Duty & Roster, Operational Telemetry & Caseload Export
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync Data
            </button>
            <button
              type="button"
              disabled={exportingPatients}
              onClick={handleDownloadPatientExcel}
              className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-900 shadow-xs hover:bg-teal-100 disabled:opacity-50 active:scale-95 transition-all"
            >
              {exportingPatients ? (
                <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
              ) : (
                <Users className="h-4 w-4 text-teal-700" />
              )}
              Export Patients (.xlsx)
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50 active:scale-95 transition-all"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Full Report
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <div className="mt-6 flex overflow-x-auto border-t border-slate-100 pt-3 gap-1">
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
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Intake Cases</span>
              <p className="mt-2 text-3xl font-black text-slate-900">{analytics?.total_cases || 0}</p>
              <span className="text-[11px] text-teal-700 font-semibold">+{analytics?.cases_today || 0} today</span>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
              <span className="text-[11px] font-bold text-amber-800 uppercase">Pending Review</span>
              <p className="mt-2 text-3xl font-black text-amber-900">{analytics?.pending_review || 0}</p>
              <span className="text-[11px] text-amber-700">Awaiting clinician</span>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
              <span className="text-[11px] font-bold text-red-800 uppercase">Urgent Review</span>
              <p className="mt-2 text-3xl font-black text-red-900">{analytics?.urgent_review || 0}</p>
              <span className="text-[11px] text-red-700">Safety flag triggered</span>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
              <span className="text-[11px] font-bold text-blue-800 uppercase">Active Follow-ups</span>
              <p className="mt-2 text-3xl font-black text-blue-900">{analytics?.active_followups || 0}</p>
              <span className="text-[11px] text-blue-700">Tele-calls in progress</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Facility Staff</span>
              <p className="mt-2 text-3xl font-black text-slate-900">{staff.length}</p>
              <span className="text-[11px] text-slate-500">Active medical officers & nurses</span>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">7-Day Triage Volume Trend</h3>
              <div className="mt-4 h-64 w-full">
                {analytics?.daily_trend && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} name="Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Language Intake Distribution</h3>
              <div className="mt-4 h-64 w-full flex items-center justify-center">
                {languageChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={languageChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {languageChartData.map((entry, index) => (
                          <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-xs text-slate-400">Loading...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STAFF MANAGEMENT */}
      {activeTab === 'staff' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Facility Healthcare Staff</h2>
              <p className="text-xs text-slate-500">
                Authorize doctors, staff nurses, and facility admins for {user.facility_name}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddStaffOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-teal-800"
            >
              <UserPlus className="h-4 w-4" />
              Add Staff Member
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Email Address</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-semibold text-slate-900">{s.full_name}</td>
                    <td className="p-3 text-slate-600">{s.email}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                        {s.role}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">{s.designation || 'Healthcare Staff'}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Active
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">
                      {s.last_login_at ? new Date(s.last_login_at).toLocaleDateString() : 'Recent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: FACILITY CASES */}
      {activeTab === 'cases' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Facility Patient Cases</h2>
            <Link
              to="/app/hcw/queue"
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              Open Full Clinical Queue →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">Case ID</th>
                  <th className="p-3">Patient Name</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Primary Concern</th>
                  <th className="p-3 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases?.items.map((cs) => (
                  <tr key={cs.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-mono font-medium text-slate-900">{cs.case_number}</td>
                    <td className="p-3 font-medium text-slate-800">{cs.patient_name}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          cs.priority === 'URGENT_REVIEW'
                            ? 'bg-red-100 text-red-800'
                            : cs.priority === 'REVIEW_REQUIRED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {cs.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                        {cs.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{cs.source}</td>
                    <td className="p-3 text-slate-700">{cs.chief_concern?.slice(0, 45) || 'Intake in progress'}</td>
                    <td className="p-3 text-right">
                      <Link
                        to={`/app/hcw/cases/${cs.id}`}
                        className="rounded-lg bg-teal-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-800"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FOLLOW-UPS */}
      {activeTab === 'followups' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Follow-up Tasks & Tele-calls</h2>
            <Link
              to="/app/hcw/voice"
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              Open Tele-calling Center →
            </Link>
          </div>

          <div className="space-y-2">
            {followups?.items.map((fu) => (
              <div
                key={fu.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{fu.case_number}</span>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                      Channel: {fu.channel}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                      Status: {fu.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Reason: {fu.reason} · Requested items: {fu.items?.join(', ') || 'Vitals'}
                  </p>
                </div>
                <Link
                  to={`/app/hcw/cases/${fu.case_id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View Case
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: REPORTS & EXCEL EXPORT */}
      {activeTab === 'reports' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-100 text-teal-800">
            <FileSpreadsheet className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Download Authorized Facility Excel</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Generates the official multi-sheet workbook containing Cases, Voice Sessions, Follow-ups, Referrals, and Audit logs specifically scoped to {user.facility_name}.
          </p>
          <button
            type="button"
            disabled={exporting}
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Download Excel Spreadsheet
          </button>
        </div>
      )}

      {/* TAB 6: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900">Facility Audit Trail</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Case</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audits?.items.map((al) => (
                  <tr key={al.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-mono text-slate-500">
                      {new Date(al.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-slate-800">{al.actor_label || 'System'}</td>
                    <td className="p-3 text-slate-600">{al.actor_role}</td>
                    <td className="p-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-700">
                        {al.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-teal-800">{al.case_number || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">Facility Configuration</h2>
            <p className="text-xs text-slate-500">Operational metadata for this healthcare unit.</p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700">Facility Name:</label>
              <input
                type="text"
                disabled
                value={user.facility_name ?? 'Bhubaneswar Town PHC'}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700 font-medium"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700">State:</label>
                <input
                  type="text"
                  disabled
                  value="Odisha"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">District:</label>
                <input
                  type="text"
                  disabled
                  value="Khordha"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700">Triage Escalation Target:</label>
              <input
                type="text"
                disabled
                value="Cuttack District Community Health Centre / Capital Hospital"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* ADD STAFF MODAL */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateStaff}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Register Healthcare Staff</h3>
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Full Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ramesh Pattnaik"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Email Address:</label>
                <input
                  type="email"
                  required
                  placeholder="staff@swasthyatriage.demo"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Role:</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:border-teal-500 focus:outline-none"
                >
                  <option value="HEALTHCARE_WORKER">Healthcare Worker (Doctor / Nurse)</option>
                  <option value="FACILITY_ADMIN">Facility Administrator</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Clinical Designation:</label>
                <input
                  type="text"
                  value={newStaffDesignation}
                  onChange={(e) => setNewStaffDesignation(e.target.value)}
                  placeholder="Medical Officer, Staff Nurse, Health Worker"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Phone Number:</label>
                <input
                  type="text"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="+91-9876543210"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingStaff}
                className="flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50"
              >
                {submittingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Save Staff Account
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
