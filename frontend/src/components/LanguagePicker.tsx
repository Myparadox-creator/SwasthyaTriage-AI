import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { SUPPORTED_LANGS, setStoredLang } from '../i18n'

export default function LanguagePicker({ align = 'end' }: { align?: 'start' | 'end' }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const current = SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${
              align === 'end' ? 'right-0' : 'left-0'
            }`}
          >
            {SUPPORTED_LANGS.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  i18n.changeLanguage(lang.code)
                  setStoredLang(lang.code)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50"
              >
                {lang.label}
                {lang.code === i18n.language && <Check className="h-4 w-4 text-brand-700" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}