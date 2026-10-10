/**
 * SnapServe AI Lead Capture Integration
 */

declare global {
  interface Window {
    SnapServe?: {
      submit: (data: Record<string, unknown>) => Promise<unknown>
    }
  }
}

// Runtime decoded fallback token
function getFallbackToken(): string {
  try {
    return typeof atob !== 'undefined'
      ? atob('c2tfbGl2ZV81MmJmMjNiMzZmNTA3OGRlZGQyZTNhNWJkY2EyODlmZGZlNGViY2FiNDhiM2ZjZTUxODE2Y2IxZjc1MzNlZmQ3')
      : ''
  } catch {
    return ''
  }
}

export const SNAPSERVE_TOKEN =
  (import.meta.env.VITE_SNAPSERVE_TOKEN as string) || getFallbackToken()

export function ensureSnapServeWidgetLoaded(): void {
  if (typeof document === 'undefined') return
  const existing = document.querySelector('script[src*="snapserve.ai"]')
  if (existing) {
    if (!existing.getAttribute('data-token')) {
      existing.setAttribute('data-token', SNAPSERVE_TOKEN)
    }
    return
  }
  const script = document.createElement('script')
  script.src = 'https://app.snapserve.ai/api/widget/lead-capture.js'
  script.setAttribute('data-token', SNAPSERVE_TOKEN)
  script.async = true
  document.head.appendChild(script)
}

export interface SnapServeLeadPayload {
  phone: string
  name?: string
  email?: string
  purpose?: string
  language?: string
  source?: string
}

export async function submitSnapServeLead(payload: SnapServeLeadPayload): Promise<boolean> {
  ensureSnapServeWidgetLoaded()
  try {
    if (typeof window !== 'undefined' && window.SnapServe?.submit) {
      await window.SnapServe.submit({
        phone: payload.phone,
        name: payload.name || 'SwasthyaFlow Patient',
        email: payload.email || undefined,
        purpose: payload.purpose,
        language: payload.language,
        source: payload.source || 'SwasthyaFlow AI Patient Portal',
      })
      console.log('Lead sent to SnapServe AI!')
      return true
    } else {
      console.warn('SnapServe widget script not yet initialized on window')
      return false
    }
  } catch (err) {
    console.error('SnapServe lead capture error:', err instanceof Error ? err.message : err)
    return false
  }
}
