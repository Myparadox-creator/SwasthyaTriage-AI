import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HeartPulse } from 'lucide-react'
import LanguagePicker from '../LanguagePicker'

export default function PublicLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">{t('appName')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Link to="/auth/login" className="btn-ghost hidden sm:inline-flex">
              {t('auth.signIn')}
            </Link>
            <Link to="/auth/signup" className="btn-primary">
              {t('auth.createOne')}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-6 text-center text-xs text-slate-500">
          <p>
            {t('appName')} — {t('landing.footerTagline')}
          </p>
          <p>SwasthyaTriage AI · prototype · not a medical device</p>
        </div>
      </footer>
    </div>
  )
}