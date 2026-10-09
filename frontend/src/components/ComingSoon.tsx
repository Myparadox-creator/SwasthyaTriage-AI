import { useTranslation } from 'react-i18next'
import { Construction } from 'lucide-react'

export function ComingSoon({ title }: { title?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="card max-w-sm p-10 text-center">
        <Construction className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{t('comingSoon')}</p>
      </div>
    </div>
  )
}