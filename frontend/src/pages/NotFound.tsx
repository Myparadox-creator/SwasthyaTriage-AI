import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-5xl font-black text-brand-200 sm:text-6xl">404</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900 sm:text-2xl">{t('notFound')}</h1>
      <Link to="/" className="btn-primary mt-6">
        {t('backHome')}
      </Link>
    </div>
  )
}