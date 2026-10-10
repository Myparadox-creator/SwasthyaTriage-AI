import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  Building,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquareShare,
  MessageSquareText,
  Mic,
  PhoneCall,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  Upload,
  WifiOff,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import LanguagePicker from '../LanguagePicker'
import NetworkStatusWidget from '../NetworkStatusWidget'
import NotificationCenterDropdown from '../NotificationCenterDropdown'
import AppPermissionsModal from '../AppPermissionsModal'

export default function AppShell() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)!
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)

  const role = user.role

  const navItems = useMemo(() => {
    if (role === 'PATIENT') {
      return [
        { to: '/app/patient/dashboard', label: 'My Dashboard', icon: LayoutDashboard },
        { to: '/app/patient/voice', label: 'Talk to Sonam (Voice)', icon: Mic },
        { to: '/app/patient/callback', label: 'Request Phone Call', icon: PhoneCall },
        { to: '/app/patient/pharmacies', label: 'Clinics, Hospitals & Stores', icon: MapPin },
        { to: '/app/patient/uploads', label: 'Upload Reports', icon: Upload },
      ]
    }

    if (role === 'FACILITY_ADMIN') {
      return [
        { to: '/app/admin/facility', label: '🏢 Facility Incharge Console', icon: LayoutDashboard },
        { to: '/app/hcw/queue', label: 'Clinical Queue Overview', icon: Stethoscope },
        { to: '/app/hcw/pharmacies', label: 'Healthcare & Drug Locator', icon: MapPin },
        { to: '/app/hcw/communication', label: 'Staff Communication', icon: MessageSquareShare },
        { to: '/app/hcw/sync-queue', label: 'Offline Sync Queue', icon: WifiOff },
        { to: '/app/hcw/voice', label: 'Tele-calling Center', icon: PhoneCall },
        { to: '/app/hcw/followups', label: 'Follow-ups Monitor', icon: MessageSquareText },
        { to: '/app/hcw/referrals', label: 'Referrals & Transfers', icon: ClipboardList },
        { to: '/app/hcw/reports', label: 'Facility Reports & Export', icon: BarChart3 },
        { to: '/app/hcw/audit', label: 'Audit Compliance Trail', icon: ScrollText },
      ]
    }

    if (role === 'SUPER_ADMIN') {
      return [
        { to: '/app/admin/super', label: '🛡️ State Directorate Console', icon: LayoutDashboard },
        { to: '/app/admin/facility', label: 'Multi-Facility Network', icon: Building },
        { to: '/app/hcw/queue', label: 'State-wide Clinical Queue', icon: Stethoscope },
        { to: '/app/hcw/pharmacies', label: 'Healthcare & Drug Locator', icon: MapPin },
        { to: '/app/hcw/communication', label: 'Directorate Communication', icon: MessageSquareShare },
        { to: '/app/hcw/sync-queue', label: 'Offline Sync Telemetry', icon: WifiOff },
        { to: '/app/hcw/voice', label: 'Tele-calling Center', icon: PhoneCall },
        { to: '/app/hcw/reports', label: 'State Telemetry Reports', icon: BarChart3 },
        { to: '/app/hcw/audit', label: 'Global Audit Trail', icon: ScrollText },
      ]
    }

    // Default: HEALTHCARE_WORKER (Medical Officer / Doctor / Nurse)
    return [
      { to: '/app/hcw/dashboard', label: '🩺 Medical Officer Console', icon: LayoutDashboard },
      { to: '/app/hcw/queue', label: 'Clinical Triage Queue', icon: Stethoscope },
      { to: '/app/hcw/voice', label: 'Tele-consultations & Calls', icon: PhoneCall },
      { to: '/app/hcw/followups', label: 'Patient Follow-ups', icon: MessageSquareText },
      { to: '/app/hcw/referrals', label: 'Referrals & Escalations', icon: ClipboardList },
      { to: '/app/hcw/communication', label: 'Clinical Collaboration', icon: MessageSquareShare },
      { to: '/app/hcw/pharmacies', label: 'Clinics, Hospitals & Stores', icon: MapPin },
      { to: '/app/hcw/sync-queue', label: 'Offline Sync Queue', icon: WifiOff },
      { to: '/app/hcw/reports', label: 'Clinical Reports', icon: BarChart3 },
      { to: '/app/hcw/audit', label: 'Clinical Audit Trail', icon: ScrollText },
    ]
  }, [role, t])

  const handleLogout = async () => {
    await logout()
    navigate('/landing')
  }

  const Sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4 font-semibold text-brand-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-xs">
          <HeartPulse className="h-5 w-5" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-sm font-bold text-slate-900">{t('appName')}</span>
          <span className="text-[10px] text-teal-600 font-semibold tracking-wide">Socket.IO Clinical AI</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-teal-50 text-teal-800 font-bold shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2 bg-slate-50 border border-slate-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">
            {(user.full_name ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{user.full_name}</p>
            <p className="truncate text-[11px] text-teal-700 font-medium">
              {user.facility_name ?? user.role.replaceAll('_', ' ')}
            </p>
          </div>
        </div>
        <div className="mb-2">
          <LanguagePicker />
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
        >
          <LogOut className="h-4 w-4" />
          <span>{t('common.logout')}</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block">{Sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80vw] overflow-y-auto shadow-xl">{Sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar for Desktop & Mobile */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-3 sm:px-4 lg:px-6 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="flex min-w-0 items-center gap-1.5 font-extrabold text-teal-800 lg:hidden">
              <HeartPulse className="h-5 w-5 shrink-0 text-teal-600" />
              <span className="truncate">{t('appName')}</span>
            </Link>

            {/* Desktop breadcrumb / role indicator */}
            <div className="hidden min-w-0 lg:flex items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Workspace:</span>
              {role === 'HEALTHCARE_WORKER' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-800 shadow-2xs">
                  <Stethoscope className="h-3.5 w-3.5 text-blue-600" />
                  <span>Medical Officer Clinical Console</span>
                </span>
              )}
              {role === 'FACILITY_ADMIN' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800 shadow-2xs">
                  <Building className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Facility Incharge Admin Console</span>
                </span>
              )}
              {role === 'SUPER_ADMIN' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-bold text-purple-800 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                  <span>Odisha State Directorate Console</span>
                </span>
              )}
              {role === 'PATIENT' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800 shadow-2xs">
                  <HeartPulse className="h-3.5 w-3.5 text-teal-600" />
                  <span>Citizen Patient Portal</span>
                </span>
              )}
              {user.facility_name && (
                <span className="min-w-0 truncate text-xs font-medium text-slate-500">· {user.facility_name}</span>
              )}
            </div>
          </div>

          {/* Right Header Utilities: Network Status + Permissions + Notifications */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPermissionsModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-teal-400 hover:bg-teal-50 hover:text-teal-900 transition"
              title="Review Device Permissions (GPS, Alerts, Mic)"
            >
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span className="hidden sm:inline">Permissions</span>
            </button>

            <NetworkStatusWidget />
            {role !== 'PATIENT' && <NotificationCenterDropdown />}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <AppPermissionsModal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
      />
    </div>
  )
}