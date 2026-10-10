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
  submitted_at?: string
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

export interface DocumentCitation {
  document_id: number
  filename: string
  excerpt: string
  relevance_score: number
}

export interface DocumentRAGResponse {
  answer: string
  citations: DocumentCitation[]
  mode: string
  model: string
  clinical_flags: string[]
  suggested_followups: string[]
  timestamp?: string
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
  diagnostics?: Record<string, any>
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

// ----------------------------------------------------
// AI Clinical Decision Support & Evaluation Types
// ----------------------------------------------------
export interface ConfidenceItem {
  entity_type: string
  name: string
  value: string | null
  unit: string | null
  confidence: number
  tier: 'HIGH' | 'MEDIUM' | 'LOW'
  is_calibrated: boolean
  evidence_quote: string | null
  rationale: string
  provenance: string
}

export interface ContradictionItem {
  contradiction_type: string
  severity: 'CRITICAL' | 'WARNING' | 'INFORMATIONAL'
  statement_a: string
  source_a: string
  statement_b: string
  source_b: string
  clinical_implication: string
  recommended_doctor_action: string
}

export interface MissingInfoItem {
  syndrome: string
  missing_aspect: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  suggested_clinician_question: string
  rationale: string
}

export interface ClinicalAnalysisResponse {
  case_id: number
  case_number: string
  symptom_confidences: ConfidenceItem[]
  measurement_confidences: ConfidenceItem[]
  contradictions: ContradictionItem[]
  missing_critical_info: MissingInfoItem[]
  disclaimer: string
}

export interface SOPProtocol {
  doc_id: string
  doc_title: string
  section: string
  source_citation: string
  relevance_score: number
  triage_pathway: string
  red_flag_criteria: string[]
  recommended_actions: string[]
  issuing_authority?: string | null
  source_url?: string | null
  publication_date?: string | null
  version?: string
  document_hash?: string | null
  review_status?: string
  is_verified?: boolean
  governance_warning?: string | null
}

export interface SOPGovernanceSummary {
  total_documents: number
  verified_documents: number
  unverified_documents: number
  all_verified: boolean
  governance_note: string
}

export interface SOPGuidelinesResponse {
  case_number: string
  has_guidance: boolean
  protocols: SOPProtocol[]
  clinical_disclaimer: string
  governance?: SOPGovernanceSummary
  has_unverified_sources?: boolean
}

// ----------------------------------------------------
// Evidence Traceability Types
// ----------------------------------------------------
export type EvidenceReviewStatus = 'PENDING' | 'CONFIRMED' | 'EDITED' | 'REJECTED'

export interface EvidenceRecord {
  id: number
  case_id: number
  fact_type: string
  fact_ref: string
  label: string
  unit: string | null
  normalized_value: string | null
  original_value: string | null
  current_value: string | null
  source_kind: string
  source_provenance: string
  source_snippet: string | null
  source_ref_id: string | null
  source_timestamp: string | null
  extraction_method: string
  model_version: string | null
  extraction_timestamp: string | null
  confidence: number | null
  confidence_tier: string | null
  is_calibrated: boolean
  rationale: string | null
  validation_warnings: string[]
  sop_references: unknown[]
  reviewer_status: EvidenceReviewStatus
  reviewer_label: string | null
  reviewed_at: string | null
  review_reason: string | null
}

export interface EvidenceListResponse {
  case_id: number
  case_number: string
  total: number
  pending_review: number
  evidence: EvidenceRecord[]
  disclaimer: string
}

export interface LongitudinalEncounter {
  case_number: string
  date: string
  facility: string | null
  chief_concern: string | null
  priority: string
  status: string
  symptoms: string[]
  vitals: string[]
  medications: string[]
  source_attribution: string
}

export interface LongitudinalHistoryResponse {
  patient_id: number
  patient_name: string
  total_encounters: number
  longitudinal_narrative: string
  encounters: LongitudinalEncounter[]
  vital_trends: Record<string, { date: string; case_number: string; value: string; unit?: string; attribution: string }[]>
}

export interface LanguageEvalBreakdown {
  name: string
  sample_count: number
  mean_wer: number
  mean_cer: number
  entity_precision: number
  entity_recall: number
  entity_f1: number
}

export interface AiEvaluationReport {
  timestamp: string
  total_test_cases: number
  overall_metrics: {
    mean_wer: number
    mean_cer: number
    mean_precision: number
    mean_recall: number
    mean_f1: number
    expected_calibration_error_ece: number
    calibration_status: string
  }
  language_breakdown: Record<string, LanguageEvalBreakdown>
  cases: {
    case_id: string
    language: string
    scenario: string
    wer: number
    cer: number
    entity_f1: number
    entity_precision: number
    entity_recall: number
    is_emergency: boolean
  }[]
  dataset_version?: string
  model_version?: string
  config_version?: string
  provider?: string | null
  dataset_kind?: string
  is_clinical_validation?: boolean
  unavailable_metrics?: string[]
  warnings?: string[]
}

export interface EvaluationThresholdBreach {
  metric: string
  value: number
  limit: number
  direction: string
}

export interface EvaluationRunRecord {
  id: number
  run_label: string
  kind: string
  dataset_version: string
  model_version: string
  config_version: string
  provider: string | null
  dataset_kind: string
  is_clinical_validation: boolean
  total_samples: number
  metrics: Record<string, number>
  language_breakdown: Record<string, LanguageEvalBreakdown>
  unavailable_metrics: string[]
  warnings: string[]
  thresholds_breached: EvaluationThresholdBreach[]
  created_at: string
  notes: string | null
}

export interface EvaluationHistoryResponse {
  count: number
  runs: EvaluationRunRecord[]
  note: string
}

export interface EvaluationTrendMetric {
  series: { run_id: number; created_at: string | null; value: number }[]
  latest: number
  previous: number | null
  delta: number | null
  direction: 'up' | 'down' | 'flat'
  limit: number
  better: 'lower' | 'higher'
  threshold_breached: boolean
  drift_detected: boolean
}

export interface EvaluationTrendResponse {
  run_count: number
  metrics: Record<string, EvaluationTrendMetric>
  drift_detected: boolean
  drift_metrics: string[]
  thresholds: Record<string, { better: string; limit: number; drift_delta: number }>
  is_clinical_validation: boolean
  note: string
}