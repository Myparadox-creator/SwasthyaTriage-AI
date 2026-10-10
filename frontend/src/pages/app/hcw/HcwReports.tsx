import { useEffect, useState } from 'react'
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
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import { api, getAccessToken } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import type { FacilityAnalyticsOut } from '../../../lib/types'

const PRIORITY_COLORS = {
  ROUTINE: '#0d9488', // teal-600
  REVIEW_REQUIRED: '#f59e0b', // amber-500
  URGENT_REVIEW: '#ef4444', // red-500
}

export default function HcwReports() {
  const user = useAuthStore((s) => s.user)!
  const [analytics, setAnalytics] = useState<FacilityAnalyticsOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingPatients, setExportingPatients] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchStats = () => {
    setLoading(true)
    api<FacilityAnalyticsOut>('/api/admin/analytics')
      .then(setAnalytics)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleDownloadExcel = async () => {
    setExporting(true)
    setFeedbackMsg(null)
    try {
      const response = await fetch('/api/exports/excel', {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to generate Excel report')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SwasthyaTriage_Full_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setFeedbackMsg({
        type: 'success',
        text: 'Full Triage Multi-Sheet workbook (.xlsx) downloaded successfully with Patient Details.',
      })
      setTimeout(() => setFeedbackMsg(null), 5000)
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Export failed',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadPatientExcel = async () => {
    setExportingPatients(true)
    setFeedbackMsg(null)
    try {
      const response = await fetch('/api/exports/patients', {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to generate Patient Details report')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SwasthyaTriage_PatientDetails_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setFeedbackMsg({
        type: 'success',
        text: 'Patient Details workbook (.xlsx) downloaded successfully.',
      })
      setTimeout(() => setFeedbackMsg(null), 5000)
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Export failed',
      })
    } finally {
      setExportingPatients(false)
    }
  }

  const priorityData = analytics
    ? Object.entries(analytics.priority_distribution).map(([name, value]) => ({
        name,
        value,
      }))
    : []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800">
            <TrendingUp className="h-3.5 w-3.5 text-teal-700" />
            <span>Facility Quality & Triage Reports</span>
          </div>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
            Clinical Triage Reporting & Export
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {user.facility_name ?? 'Primary Health Centre'} · Data sourced from Neon PostgreSQL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchStats}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            disabled={exportingPatients}
            onClick={handleDownloadPatientExcel}
            className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-900 shadow-sm hover:bg-teal-100 disabled:opacity-50 active:scale-95 transition-all"
          >
            {exportingPatients ? (
              <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
            ) : (
              <Users className="h-4 w-4 text-teal-700" />
            )}
            Export Patient Details
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 disabled:opacity-50 active:scale-95 transition-all"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export Full Workbook (.xlsx)
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <span className="break-words">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Summary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Triage Inflow
          </span>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {analytics?.total_cases || 0}
          </p>
          <p className="mt-1 text-xs text-teal-700 font-semibold">
            +{analytics?.cases_today || 0} received today
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            Pending Clinician Review
          </span>
          <p className="mt-2 text-3xl font-black text-amber-900">
            {analytics?.pending_review || 0}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Requires staff verification
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-sm">
          <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider">
            Urgent Review Cases
          </span>
          <p className="mt-2 text-3xl font-black text-red-900">
            {analytics?.urgent_review || 0}
          </p>
          <p className="mt-1 text-xs text-red-700">
            Configured safety signal triggered
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
            Reviewed & Finalized
          </span>
          <p className="mt-2 text-3xl font-black text-emerald-900">
            {analytics?.reviewed_cases || 0}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Human-in-the-loop approved
          </p>
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Triage Trend */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">
            7-Day Patient Triage Inflow Trend
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Daily case assessments completed across voice, chat, and reports
          </p>

          <div className="mt-4 h-64 w-full">
            {analytics?.daily_trend && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.daily_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} name="Cases" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Priority & Source Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">
            Triage Priority Distribution
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Breakdown computed by the deterministic Safety Rule Engine
          </p>

          <div className="mt-4 h-64 w-full flex items-center justify-center">
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {priorityData.map((entry) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS] || '#64748b'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">Loading metrics...</div>
            )}
          </div>
        </div>
      </div>

      {/* Multi-Sheet Excel Export Documentation Section */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-teal-800" />
              <h3 className="min-w-0 break-words text-sm font-bold text-teal-950">
                Official Multi-Sheet Excel Workbook & Patient Registry
              </h3>
            </div>
            <p className="mt-1 break-words text-xs text-teal-800 leading-relaxed">
              Export an authorized, audit-logged spreadsheet compiled directly from PostgreSQL containing 6 structured sheets with frozen headers, zebra-striping, and auto-filters:
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-teal-900">
              <span className="rounded-lg bg-teal-700 text-white px-2.5 py-1 shadow-xs">1. Patient Details</span>
              <span className="rounded-lg bg-white border border-teal-200 px-2.5 py-1">2. Cases</span>
              <span className="rounded-lg bg-white border border-teal-200 px-2.5 py-1">3. Voice Sessions</span>
              <span className="rounded-lg bg-white border border-teal-200 px-2.5 py-1">4. Follow-ups</span>
              <span className="rounded-lg bg-white border border-teal-200 px-2.5 py-1">5. Referrals</span>
              <span className="rounded-lg bg-white border border-teal-200 px-2.5 py-1">6. Audit Summary</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={exportingPatients}
              onClick={handleDownloadPatientExcel}
              className="flex items-center gap-2 rounded-xl border border-teal-300 bg-white px-4 py-2.5 text-xs font-bold text-teal-900 shadow-sm hover:bg-teal-50 disabled:opacity-50 active:scale-95 transition-all"
            >
              {exportingPatients ? (
                <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
              ) : (
                <Users className="h-4 w-4 text-teal-700" />
              )}
              Export Patient Details Only
            </button>

            <button
              type="button"
              disabled={exporting}
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50 active:scale-95 transition-all"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Download Full Report (.xlsx)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
