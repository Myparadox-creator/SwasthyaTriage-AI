import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  CheckCircle2,
} from 'lucide-react'
import { type Role, homeForRole, useAuthStore } from '../../stores/auth'
import GoogleSignInButton from '../../components/GoogleSignInButton'

interface RoleOption {
  id: Role
  title: string
  subtitle: string
  icon: typeof User
  demoEmail: string
  badge: string
  theme: {
    activeBorder: string
    activeBg: string
    badgeColor: string
    btnGradient: string
    accentColor: string
    iconBg: string
  }
  description: string
}

const ROLES: RoleOption[] = [
  {
    id: 'PATIENT',
    title: 'Patient',
    subtitle: 'Citizen Access',
    icon: User,
    demoEmail: 'patient.ramesh@swasthyatriage.demo',
    badge: 'Citizen',
    theme: {
      activeBorder: 'border-teal-500 ring-2 ring-teal-500/25',
      activeBg: 'bg-teal-50/80',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
      btnGradient: 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-teal-700/20',
      accentColor: 'text-teal-600',
      iconBg: 'bg-teal-100 text-teal-700',
    },
    description: 'Voice symptom triage, medical report upload & preliminary non-diagnostic care guidance.',
  },
  {
    id: 'HEALTHCARE_WORKER',
    title: 'Medical Officer',
    subtitle: 'Doctor / Nurse',
    icon: Stethoscope,
    demoEmail: 'doctor.bbsr@swasthyatriage.demo',
    badge: 'Clinical Staff',
    theme: {
      activeBorder: 'border-blue-500 ring-2 ring-blue-500/25',
      activeBg: 'bg-blue-50/80',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      btnGradient: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-700/20',
      accentColor: 'text-blue-600',
      iconBg: 'bg-blue-100 text-blue-700',
    },
    description: 'Triage prioritization queue, 3-panel transparency verification & tele-calling follow-ups.',
  },
  {
    id: 'FACILITY_ADMIN',
    title: 'Facility Admin',
    subtitle: 'PHC / CHC Incharge',
    icon: Building2,
    demoEmail: 'admin.bbsr@swasthyatriage.demo',
    badge: 'Institutional',
    theme: {
      activeBorder: 'border-indigo-500 ring-2 ring-indigo-500/25',
      activeBg: 'bg-indigo-50/80',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      btnGradient: 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-indigo-700/20',
      accentColor: 'text-indigo-600',
      iconBg: 'bg-indigo-100 text-indigo-700',
    },
    description: 'Caseload telemetry, staff duty allocation, facility-wide export reports & audit trails.',
  },
  {
    id: 'SUPER_ADMIN',
    title: 'Super Admin',
    subtitle: 'State Directorate',
    icon: ShieldCheck,
    demoEmail: 'super@swasthyatriage.demo',
    badge: 'System Admin',
    theme: {
      activeBorder: 'border-purple-500 ring-2 ring-purple-500/25',
      activeBg: 'bg-purple-50/80',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      btnGradient: 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-purple-700/20',
      accentColor: 'text-purple-600',
      iconBg: 'bg-purple-100 text-purple-700',
    },
    description: 'Cross-facility network health, AI model parameters & deterministic safety trigger thresholds.',
  },
]

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const currentUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [selectedRole, setSelectedRole] = useState<Role>('PATIENT')
  const [email, setEmail] = useState<string>(ROLES[0].demoEmail)
  const [password, setPassword] = useState<string>('Swasthya@123')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  const from = (location.state as { from?: string } | null)?.from
  const activeRoleConfig = ROLES.find((r) => r.id === selectedRole) || ROLES[0]

  const isRoleError =
    !!error &&
    (error.toLowerCase().includes('registered as') ||
      error.toLowerCase().includes('access denied') ||
      error.toLowerCase().includes('role_mismatch'))

  const handleRoleChange = (role: RoleOption) => {
    setSelectedRole(role.id)
    setEmail(role.demoEmail)
    setPassword('Swasthya@123')
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const user = await login(email.trim(), password, selectedRole)
      navigate(from ?? homeForRole(user.role), { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handle1ClickLogin = async (role: RoleOption) => {
    if (busy) return
    setSelectedRole(role.id)
    setEmail(role.demoEmail)
    setPassword('Swasthya@123')
    setError(null)
    setBusy(true)
    try {
      const user = await login(role.demoEmail, 'Swasthya@123', role.id)
      navigate(from ?? homeForRole(user.role), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card w-full border border-slate-200/90 bg-white/95 p-5 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-7 md:p-8 transition-all">
      {/* Existing Session Alert Banner (if user already logged in) */}
      {currentUser && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/80 p-3.5 text-xs text-teal-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <div>
              <span className="font-semibold text-slate-800">Active session:</span>{' '}
              <span className="font-bold text-teal-950">{currentUser.full_name}</span>{' '}
              <span className="text-[11px] text-teal-700">({currentUser.role})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(homeForRole(currentUser.role))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-teal-800 transition"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout()
              }}
              className="rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {t('auth.welcomeBack')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Select your account role to sign in to the portal
          </p>
        </div>
        <span
          className={`inline-flex self-start items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:self-auto ${activeRoleConfig.theme.badgeColor}`}
        >
          <activeRoleConfig.icon className="h-3.5 w-3.5" />
          {activeRoleConfig.badge}
        </span>
      </div>

      {/* Role Selection Tabs */}
      <div className="mt-5">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Select Portal Role:
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id
            const Icon = role.icon
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => handleRoleChange(role)}
                className={`relative flex min-h-[76px] flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  isSelected
                    ? `${role.theme.activeBorder} ${role.theme.activeBg} font-semibold shadow-sm`
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${role.theme.accentColor}`} />
                  </span>
                )}
                <div
                  className={`mb-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8 ${
                    isSelected ? role.theme.iconBg : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold leading-tight line-clamp-1">
                  {role.title}
                </span>
                <span className="mt-0.5 text-[10px] text-slate-400 leading-tight">
                  {role.subtitle}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Role Description Banner */}
      <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3 text-xs text-slate-600">
        <activeRoleConfig.icon
          className={`h-4 w-4 mt-0.5 shrink-0 ${activeRoleConfig.theme.accentColor}`}
        />
        <div className="flex-1">
          <p className="font-bold text-slate-800">
            {activeRoleConfig.title} Portal Capabilities
          </p>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 leading-normal">
            {activeRoleConfig.description}
          </p>
        </div>
      </div>

      {/* Fast 1-Click Demo Login Button */}
      <div className="mt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handle1ClickLogin(activeRoleConfig)}
          className={`group flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold shadow-md transition-all active:scale-[0.99] disabled:opacity-60 ${activeRoleConfig.theme.btnGradient}`}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-amber-300 animate-pulse" />
          <span>Quick 1-Click Demo Login as {activeRoleConfig.title}</span>
          <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="mt-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>Or Continue With</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Google Sign-In Button with Selected Role */}
      <div className="mt-4">
        <GoogleSignInButton role={selectedRole} />
      </div>

      {/* Manual Credentials Form */}
      <form onSubmit={submit} className="mt-4 space-y-3.5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="email">
            {t('auth.email')}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10 text-sm min-h-[44px]"
              placeholder={`Enter ${activeRoleConfig.title} email`}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="password">
              {t('auth.password')}
            </label>
            <Link
              to="/auth/forgot-password"
              className="text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-10 pr-10 text-sm min-h-[44px]"
              placeholder="••••••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-3.5 text-xs text-rose-800 shadow-sm animate-shake space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-rose-950 block">
                  {isRoleError ? 'Role Access Blocked' : 'Sign-in Error'}
                </span>
                <span className="leading-relaxed">{error}</span>
              </div>
            </div>
            {isRoleError && (
              <p className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 p-2 rounded-lg">
                🔒 Security Policy: One email cannot access multiple roles. Please select your registered role tab or use a unique email address for this role.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {t('common.loading')}
            </span>
          ) : (
            <span>Sign In with Password</span>
          )}
        </button>
      </form>

      {/* Footer Registration Link */}
      <p className="mt-5 text-center text-xs text-slate-500">
        {t('auth.noAccount')}{' '}
        <Link to="/auth/signup" className="font-bold text-teal-700 hover:underline">
          {t('auth.createOne')}
        </Link>
      </p>
    </div>
  )
}