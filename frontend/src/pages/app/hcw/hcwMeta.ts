import type { CaseStatus, Priority, Provenance } from '../../../lib/types'

export const PRIORITY_BADGE: Record<Priority, string> = {
  ROUTINE: 'bg-slate-100 text-slate-600',
  REVIEW_REQUIRED: 'bg-amber-100 text-amber-700',
  URGENT_REVIEW: 'bg-red-100 text-red-700',
}

export const STATUS_BADGE: Record<CaseStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-indigo-100 text-indigo-700',
  FOLLOW_UP_REQUIRED: 'bg-amber-100 text-amber-700',
  REVIEWED: 'bg-emerald-100 text-emerald-700',
  ESCALATED: 'bg-red-100 text-red-700',
  REFERRED: 'bg-violet-100 text-violet-700',
  CLOSED: 'bg-slate-200 text-slate-500',
}

export const PROVENANCE_BADGE: Record<Provenance, string> = {
  PATIENT_REPORTED: 'bg-slate-100 text-slate-600',
  AI_EXTRACTED: 'bg-brand-100 text-brand-800',
  AI_GENERATED: 'bg-brand-100 text-brand-800',
  REVIEWER_VERIFIED: 'bg-emerald-100 text-emerald-700',
  CONFIGURED_RULE: 'bg-amber-100 text-amber-700',
}

export const QC_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-500',
  DRAFT: 'bg-slate-100 text-slate-600',
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  FINALIZED: 'bg-brand-100 text-brand-800',
}

export function humanGender(g: string | null): string {
  if (!g) return '—'
  const map: Record<string, string> = {
    MALE: 'Male',
    FEMALE: 'Female',
    OTHER: 'Other',
    male: 'Male',
    female: 'Female',
  }
  return map[g] ?? g
}