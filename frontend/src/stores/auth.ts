/**
 * Session/auth state. The access token is persisted separately (lib/api.ts);
 * this store tracks the current user and login lifecycle.
 */

import { create } from 'zustand'
import { ApiError, api, setAccessToken, getAccessToken } from '../lib/api'

export type Role = 'PATIENT' | 'HEALTHCARE_WORKER' | 'FACILITY_ADMIN' | 'SUPER_ADMIN'

export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: Role
  facility_id: number | null
  facility_name: string | null
  designation: string | null
  language: string
  phone?: string | null
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous'

export interface ClerkLoginMetadata {
  role?: Role
  email?: string
  full_name?: string
  clerk_user_id?: string
}

interface AuthState {
  user: AuthUser | null
  status: AuthStatus
  initialize: () => Promise<void>
  login: (email: string, password: string, role?: Role) => Promise<AuthUser>
  signup: (payload: Record<string, string | undefined>) => Promise<AuthUser>
  loginWithClerk: (token: string, meta?: Role | ClerkLoginMetadata) => Promise<AuthUser>
  logout: () => Promise<void>
}

function applySession(token: string, user: AuthUser) {
  setAccessToken(token)
  useAuthStore.setState({ user, status: 'authenticated' })
  try {
    sessionStorage.setItem('st_logged_in', '1')
  } catch {
    /* ignore */
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  initialize: async () => {
    const token = getAccessToken()
    if (!token) {
      set({ status: 'anonymous', user: null })
      return
    }
    set({ status: 'loading' })
    try {
      const me = await api<AuthUser>('/api/auth/me')
      set({ user: me, status: 'authenticated' })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAccessToken(null)
      }
      set({ user: null, status: 'anonymous' })
    }
  },

  login: async (email, password, role) => {
    const res = await api<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password, role },
    })
    applySession(res.access_token, res.user)
    return res.user
  },

  signup: async (payload) => {
    const res = await api<TokenResponse>('/api/auth/signup', {
      method: 'POST',
      body: payload,
    })
    applySession(res.access_token, res.user)
    return res.user
  },

  loginWithClerk: async (token, meta) => {
    const payload =
      typeof meta === 'string'
        ? { token, role: meta }
        : {
            token,
            role: meta?.role,
            email: meta?.email,
            full_name: meta?.full_name,
            clerk_user_id: meta?.clerk_user_id,
          }
    const res = await api<TokenResponse>('/api/auth/clerk', {
      method: 'POST',
      body: payload,
    })
    applySession(res.access_token, res.user)
    return res.user
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      /* keep going even if server rejects */
    }
    setAccessToken(null)
    set({ user: null, status: 'anonymous' })
    try {
      sessionStorage.removeItem('st_logged_in')
    } catch {
      /* ignore */
    }
  },
}))

export function isStaffRole(role: Role): boolean {
  return role === 'HEALTHCARE_WORKER' || role === 'FACILITY_ADMIN' || role === 'SUPER_ADMIN'
}

export function homeForRole(role: Role): string {
  if (role === 'PATIENT') return '/app/patient/dashboard'
  if (role === 'SUPER_ADMIN') return '/app/admin/super'
  if (role === 'FACILITY_ADMIN') return '/app/admin/facility'
  return '/app/hcw/dashboard'
}