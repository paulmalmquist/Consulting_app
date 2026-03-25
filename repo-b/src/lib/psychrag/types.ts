export type PsychragRole = "patient" | "therapist" | "admin";
export type RiskLevel = "none" | "low" | "moderate" | "high" | "crisis";

export type PsychragProfile = {
  id: string;
  practice_id: string;
  role: PsychragRole;
  display_name: string;
  email: string;
  license_number?: string | null;
  license_state?: string | null;
  specializations: string[];
  onboarding_complete: boolean;
};

export type PsychragConnection = {
  id: string;
  patient_id: string;
  therapist_id?: string | null;
  therapist_email: string;
  status: "pending" | "active" | "inactive";
  allow_therapist_feedback_to_ai: boolean;
  consent_captured_at?: string | null;
};

export type PsychragMeResponse = {
  profile: PsychragProfile | null;
  relationships: PsychragConnection[];
};

export type PsychragCitation = {
  document_id: string;
  chunk_id: string;
  title: string;
  chapter?: string | null;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  score?: number | null;
  excerpt?: string | null;
};

export type PsychragSafetyFlags = {
  risk_level: RiskLevel;
  crisis_detected: boolean;
  keywords: string[];
  resources: string[];
  notify_therapist: boolean;
};

export type PsychragMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  rag_sources: PsychragCitation[];
  safety_flags?: PsychragSafetyFlags | null;
  model_used?: string | null;
  created_at: string;
};

export type PsychragSession = {
  id: string;
  title?: string | null;
  session_type: "therapy" | "psychoeducation" | "crisis";
  mood_pre?: number | null;
  mood_post?: number | null;
  techniques_used: string[];
  ai_summary?: string | null;
  crisis_level: RiskLevel;
  is_active: boolean;
  created_at: string;
  ended_at?: string | null;
  messages: PsychragMessage[];
};

export type PsychragSharedSession = {
  id: string;
  session_id: string;
  patient_id: string;
  therapist_id: string;
  share_type: "full" | "summary_only" | "flagged_only";
  patient_note?: string | null;
  reviewed: boolean;
  reviewed_at?: string | null;
  therapist_notes?: string | null;
  risk_assessment?: RiskLevel | null;
  follow_up_needed: boolean;
  ai_clinical_summary?: string | null;
  shared_at: string;
  patient_name?: string;
  session_title?: string;
};

export type PsychragAssessment = {
  id: string;
  instrument: "phq9" | "gad7";
  total_score: number;
  severity: string;
  responses: Record<string, number>;
  session_id?: string | null;
  created_at: string;
};

export type PsychragAlert = {
  id: string;
  notification_type: "shared_session" | "crisis_alert" | "summary_ready";
  status: "pending" | "acknowledged";
  payload: Record<string, unknown>;
  created_at: string;
};

export type PsychragTherapistPatient = {
  patient_id: string;
  display_name: string;
  email: string;
  pending_reviews: number;
  crisis_alerts: number;
  last_shared_at?: string | null;
};

export type PsychragTherapistOverview = {
  patient: PsychragProfile;
  shared_sessions: PsychragSharedSession[];
  recent_assessments: PsychragAssessment[];
  crisis_alerts: Array<{
    id: string;
    risk_level: RiskLevel;
    status: string;
    created_at: string;
  }>;
};

export type PsychragStreamResult = {
  session: PsychragSession;
  assistant_message: PsychragMessage;
};
