import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../../stores/auth'
import { ComingSoon } from '../../../components/ComingSoon'

export default function AdminDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)!
  return (
    <div>
      <div className="card mb-6 p-6">
        <h1 className="text-xl font-bold text-slate-900">Welcome, {user.full_name}</h1>
        <p className="mt-1 text-sm text-slate-500">Super Admin · {t('appName')}</p>
      </div>
      <ComingSoon title={t('appShell.nav.dashboard')} />
    </div>
  )
}