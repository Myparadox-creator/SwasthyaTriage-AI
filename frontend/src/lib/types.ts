/**
 * API types mirroring the backend schemas (schemas/case.py, schemas/chat.py).
 */

export type CaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'FOLLOW_UP_REQUIRED'
  | 'REVIEWED'
  | 'ESCALATED'
  | 'REFERRED'
  | 'CLOSED'
export type Priority = 'ROUTINE' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
export type CaseSource = 'VOICE' | 'CHAT' | 'DOCUMENT' | 'TELECALL' | 'MIXED'
export type Language = 'en' | 'hi' | 'od'
export type MessageRole = 'AI' | 'PATIENT' | 'SYSTEM'
export type FollowUpStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type FollowUpChannel = 'CHAT' | 'IN_APP_VOICE' | 'TELECALL'
export type ReferralStatus = 'DRAFT' | 'VERIFIED' | 'FINALIZED'
export type Provenance = 'PATIENT_REPORTED' | 'AI_EXTRACTED' | 'AI_GENERATED' | 'REVIEWER_VERIFIED' | 'CONFIGURED_RULE'

export interface ReviewNoteOut {
  id: number
  note: string
  created_at: string
  author_full_name: string | null
  author_role: string | null
}

export interface Symptom {
  id: number
  term: string
  source: Provenance
  collected_via: string | null
  verified: boolean
}

export interface Measurement {
  id: number
  name: string
  value: string
  unit: string | null
  source: Provenance
  collected_via: string | null
  verified: boolean
}

export interface SafetySignal {
  id: number
  rule_code: string | null
  label: string
  message: string
  priority: Priority
  source: Provenance
  evidence: Record<string, unknown> | null
  created_at: string
}

export interface CaseDetail {
  id: number
  case_number: string
  status: CaseStatus
  priority: Priority
  source: CaseSource
  language: Language
  chief_concern: string | null
  timeline_text: string | null
  ai_summary: string | null
  ai_summary_generated_at: string | null
  missing_information: string[]
  created_at: string
  submitted_at: string | null
  reviewed_at: string | null
  patient: {
    id: number | null
    full_name: string
    phone: string | null
    age: number | null
    gender: string | null
    language: string | null
  }
  facility: { id: number | null; name: string | null }
  assigned_reviewer: { id: number; full_name: string; designation: string | null } | null
  symptoms: Symptom[]
  measurements: Measurement[]
  safety_signals: SafetySignal[]
  review_notes: ReviewNoteOut[]
  documents: DocumentOut[]
  voice_session_count: number
  followup_count: number
}

export interface CaseListItem {
  id: number
  case_number: string
  status: CaseStatus
  priority: Priority
  source: CaseSource
  language: Language
  chief_concern: string | null
  created_at: string
  submitted_at: string | null
  reviewed_at: string | null
  patient_name: string
  facility_id: number
  facility_name: string | null
  assigned_reviewer_id: number | null
  assigned_reviewer_name: string | null
  symptom_count: number
  signal_count: number
  has_documents: boolean
}

export interface CaseListResponse {
  items: CaseListItem[]
  total: number
  page: number
  page_size: number
}

export interface ChatMessageOut {
  id: number
  public_id: string
  role: MessageRole
  content: string
  language: string | null
  created_at: string
}

export interface QuestionOut {
  code: string
  category: string
  text: string
  required: boolean
  satisfied: boolean
}

export interface ChatHistoryResponse {
  case_id: number
  case_number: string
  status: CaseStatus
  priority: Priority
  messages: ChatMessageOut[]
  questions: QuestionOut[]
  progress: { answered: number; total: number; percent: number }
  can_submit: boolean
}

export interface ChatSendResponse {
  reply: string
  priority: Priority
  progress: { answered: number; total: number; percent: number }
  can_submit: boolean
  added_symptoms: string[]
  added_measurement: boolean
}

export interface SubmitResponse {
  case_number: string
  status: CaseStatus
  priority: Priority
  signals_detected: number
  message: string
}

export interface CaseCreateRequest {
  language: Language
  chief_concern: string | null
  consent_accepted: boolean
  consent_text_version: string
}

export interface TriageNote {
  [key: string]: unknown
}

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
export type ExtractionMethod = 'TEXT_LAYER' | 'GEMINI_VISION' | 'OCR'

export interface DocumentExtractionStructured {
  symptoms: string[]
  measurements: { name: string; value: string; unit?: string | null }[]
  medications: string[]
  duration: string | null
  free_text: string | null
  uncertainties: string[]
  low_confidence: string[]
}

export interface DocumentExtractionOut {
  id: number
  method: ExtractionMethod
  raw_text: string | null
  structured: DocumentExtractionStructured | null
  source: string
  verified: boolean
  created_at: string
}

export interface AiSummaryResponse {
  summary: string
  generated_at: string
  provider: string
  suggested_questions: { code: string; text: string }[]
}

export interface DocumentOut {
  id: number
  case_id: number
  filename: string
  content_type: string
  size_bytes: number
  status: DocumentStatus
  error_detail: string | null
  created_at: string
  extractions: DocumentExtractionOut[]
}

export interface DocumentListResponse {
  case_id: number
  case_number: string
  items: DocumentOut[]
}

export interface ReviewNoteCreate {
  note: string
}

export interface ReviewRequest {
  note?: string | null
  decision?: string | null
  reviewer_id?: number | null
}

export interface ReviewOutcome {
  case: CaseDetail
  note: ReviewNoteOut | null
}

export interface FollowUpCreateRequest {
  reason: string
  items?: string[]
  questions?: string[]
  channel?: FollowUpChannel
}

export interface FollowUpOut {
  id: number
  public_id: string
  case_id: number
  case_number: string | null
  patient_name: string | null
  reason: string
  items: string[]
  questions: string[]
  channel: FollowUpChannel
  status: FollowUpStatus
  result_summary: Record<string, unknown> | null
  requested_by_user_id: number | null
  requested_by_name: string | null
  assigned_to_user_id: number | null
  created_at: string
  completed_at: string | null
  updated_at: string | null
}

export interface FollowUpAnswer {
  item: string
  value: string
  source?: string
}

export interface FollowUpCompleteRequest {
  answers: FollowUpAnswer[]
  summary?: string
}

export interface FollowUpListResponse {
  items: FollowUpOut[]
  total: number
}

export interface ReferralCreateRequest {
  destination_facility?: string
  reason_for_referral?: string
}

export interface ReferralOut {
  id: number
  public_id: string
  case_id: number
  case_number: string | null
  patient_name: string | null
  destination_facility: string | null
  reason_for_referral: string | null
  draft: Record<string, unknown>
  status: ReferralStatus
  version: number
  supersedes_id: number | null
  created_by_user_id: number | null
  created_by_name: string | null
  created_at: string
  verified_at: string | null
  finalized_at: string | null
}

export interface ReferralListResponse {
  items: ReferralOut[]
  total: number
}

export interface AuditLogOut {
  id: number
  action: string
  actor_label: string | null
  actor_role: string | null
  case_id: number | null
  case_number: string | null
  facility_id: number | null
  source: string | null
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogListResponse {
  items: AuditLogOut[]
  total: number
}

export type CallStatus =
  | 'REQUESTED'
  | 'DIALING'
  | 'RINGING'
  | 'CONNECTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'NO_ANSWER'
  | 'CANCELLED'

export interface TranscriptOut {
  id: number
  sequence: number
  role: MessageRole
  content: string
  language?: string | null
  created_at: string
}

export interface TeleCallOut {
  id: number
  public_id: string
  case_id: number
  case_number: string | null
  patient_name: string | null
  phone_number: string | null
  status: CallStatus
  direction: string
  reason: string | null
  questions: string[]
  provider: string
  duration_seconds: number | null
  started_at: string | null
  ended_at: string | null
  extracted_data: Record<string, string> | null
  error_detail: string | null
  transcripts: TranscriptOut[]
  created_at: string
}

export interface TeleCallListResponse {
  items: TeleCallOut[]
  total: number
}

export interface TeleCallTurnResponse {
  agent_question: string
  patient_response: string
  item_key: string
  extracted_value: string | null
  is_last_question: boolean
  duration_seconds: number
}

export interface VoiceSessionOut {
  id: number
  public_id: string
  case_id: number | null
  patient_id: number
  mode: string
  status: string
  language: string
  provider: string
  started_at: string | null
  ended_at: string | null
  error_detail: string | null
  created_at: string
}

export interface VoiceTurnResponse {
  reply: string
  status: string
  progress: { answered: number; total: number; percent: number }
  can_submit: boolean
  added_symptoms: string[]
  added_measurement: boolean
  provider: string
}

export interface FacilityOut {
  id: number
  code: string
  name: string
  facility_type: string
  state: string
  district: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface StaffUserOut {
  id: number
  email: string
  full_name: string
  role: string
  facility_id: number | null
  facility_name: string | null
  designation: string | null
  phone: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export interface FacilityAnalyticsOut {
  facility_id: number | null
  facility_name: string | null
  total_cases: number
  cases_today: number
  pending_review: number
  urgent_review: number
  reviewed_cases: number
  active_followups: number
  active_referrals: number
  staff_count: number
  priority_distribution: Record<string, number>
  source_distribution: Record<string, number>
  language_distribution: Record<string, number>
  daily_trend: { date: string; count: number }[]
}