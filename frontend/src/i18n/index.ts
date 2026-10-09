import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import hi from './locales/hi'
import od from './locales/od'

export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'od', label: 'ଓଡ଼ିଆ (Odia)' },
] as const

const STORAGE_KEY = 'st_lang'

export function getStoredLang(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LANGS.some((l) => l.code === stored)) return stored
    const nav = (navigator.language || 'en').toLowerCase()
    if (nav.startsWith('hi')) return 'hi'
    if (nav.startsWith('or') || nav.startsWith('od')) return 'od'
    return 'en'
  } catch {
    return 'en'
  }
}

export function setStoredLang(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* ignore */
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    od: { translation: od },
  },
  lng: getStoredLang(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'hi', 'od'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n