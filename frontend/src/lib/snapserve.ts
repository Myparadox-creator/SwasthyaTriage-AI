/**
 * SnapServe AI lead capture.
 *
 * Routed through our own backend (`POST /api/patients/callback-requests/snapserve-lead`)
 * so the live SnapServe API key never ships to the browser. The backend forwards
 * the lead to SnapServe server-side.
 */

import { api } from './api'

export interface SnapServeLeadPayload {
  phone: string
  name?: string
  email?: string
  purpose?: string
  language?: string
  source?: string
}

export async function submitSnapServeLead(payload: SnapServeLeadPayload): Promise<boolean> {
  try {
    const res = await api<{ sent: boolean }>('/api/patients/callback-requests/snapserve-lead', {
      method: 'POST',
      body: {
        phone: payload.phone,
        name: payload.name,
        email: payload.email,
        purpose: payload.purpose,
        language: payload.language,
        source: payload.source || 'SwasthyaFlow AI Patient Portal',
      },
    })
    return Boolean(res?.sent)
  } catch (err) {
    console.error('SnapServe lead capture error:', err instanceof Error ? err.message : err)
    return false
  }
}
