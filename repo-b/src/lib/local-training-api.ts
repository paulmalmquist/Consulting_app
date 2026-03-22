import { apiFetch } from "@/lib/api";

const BASE = "/bos/api/consulting/local-training";

export type TrainingWorkspace = {
  inventory: {
    existing_objects: Array<{ object: string; purpose: string; usable_as_is: boolean | string; action: string }>;
    duplicates_or_overlaps: string[];
    missing_relationships_before_build: string[];
    mobile_problems_before_build: string[];
  };
  architecture: Record<string, string>;
  summary: {
    next_event: TrainingEvent | null;
    contacts_added_this_month: number;
    followups_due: number;
    venue_outreach_status: Record<string, number>;
    partner_status: Record<string, number>;
    recent_activity: TrainingActivity[];
    campaign_performance: Array<{
      campaign_name: string;
      channel: string;
      target_event_name: string | null;
      leads_generated: number;
      registrations_generated: number;
      cost_per_registration: number | null;
    }>;
    mobile_dashboard: {
      today_tasks: TrainingTask[];
      next_event: TrainingEvent | null;
      outstanding_followups: TrainingRegistration[];
      recent_registrations: TrainingRegistration[];
      check_in_shortcut_event_id: string | null;
    };
  };
  reports: {
    event_performance: Array<{
      event_id: string;
      event_name: string;
      registrations: number;
      attendance: number;
      capacity_utilization: number | null;
      price_mix: { early_bird: number; standard: number };
      repeat_attendance: number;
      feedback_score: number | null;
      channel_conversion: Record<string, number>;
    }>;
    partnership_pipeline: {
      active_venue_conversations: TrainingVenue[];
      preferred_venues: TrainingVenue[];
      cost_comparison: Array<{ venue_name: string; city: string; hourly_cost: number | null; capacity_max: number | null }>;
      next_touch_needed: TrainingActivity[];
    };
  };
  qa: {
    orphan_records: number;
    duplicate_contact_emails: string[];
    impossible_status_rows: number;
    registration_count_matches_events: boolean;
  };
  seed_summary: Record<string, number>;
  contacts: TrainingContact[];
  organizations: TrainingOrganization[];
  venues: TrainingVenue[];
  events: TrainingEvent[];
  registrations: TrainingRegistration[];
  campaigns: TrainingCampaign[];
  activities: TrainingActivity[];
  tasks: TrainingTask[];
  feedback: TrainingFeedback[];
};

export type TrainingContact = {
  crm_contact_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  crm_account_id: string | null;
  organization_name: string | null;
  preferred_contact_method: string | null;
  city: string | null;
  age_band: string | null;
  persona_type: string | null;
  audience_segment: string | null;
  business_owner_flag: boolean;
  company_name_text: string | null;
  notes: string | null;
  lead_source: string | null;
  status: string;
  consent_to_email: boolean;
  first_event_attended_id: string | null;
  total_events_attended: number;
  interest_area: string | null;
  follow_up_priority: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type TrainingOrganization = {
  crm_account_id: string;
  organization_name: string;
  organization_type: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  relationship_type: string | null;
  partner_status: string | null;
  notes: string | null;
  owner_contact_id: string | null;
  owner_contact_name: string | null;
  owner_contact_email: string | null;
};

export type TrainingVenue = {
  id: string;
  linked_organization_id: string | null;
  venue_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  capacity_min: number | null;
  capacity_max: number | null;
  wifi_quality: string | null;
  av_available: boolean;
  parking_notes: string | null;
  accessibility_notes: string | null;
  hourly_cost: number | null;
  deposit_required: boolean;
  preferred_for_event_type: string | null;
  venue_status: string;
  is_preferred: boolean;
  notes: string | null;
  linked_organization_name: string | null;
};

export type TrainingEvent = {
  id: string;
  event_name: string;
  event_series: string | null;
  event_type: string;
  event_status: string;
  event_date: string;
  event_start_time: string | null;
  event_end_time: string | null;
  venue_id: string | null;
  city: string | null;
  target_capacity: number | null;
  actual_registrations: number;
  actual_attendance: number;
  ticket_price_standard: number | null;
  ticket_price_early: number | null;
  event_theme: string | null;
  audience_level: string | null;
  instructor: string | null;
  assistant_count: number;
  registration_link: string | null;
  check_in_status: string;
  follow_up_sent_flag: boolean;
  notes: string | null;
  outcome_summary: string | null;
  venue_name: string | null;
};

export type TrainingRegistration = {
  registration_id: string;
  event_id: string;
  contact_id: string;
  registration_date: string;
  ticket_type: string | null;
  price_paid: number | null;
  payment_status: string;
  attended_flag: boolean;
  checked_in_time: string | null;
  source_channel: string | null;
  referral_source: string | null;
  follow_up_status: string | null;
  feedback_score: number | null;
  feedback_notes: string | null;
  walk_in_flag: boolean;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  event_name: string;
};

export type TrainingCampaign = {
  id: string;
  campaign_name: string;
  channel: string;
  audience: string | null;
  launch_date: string | null;
  end_date: string | null;
  budget: number | null;
  target_event_id: string | null;
  message_angle: string | null;
  status: string;
  leads_generated: number;
  registrations_generated: number;
  notes: string | null;
  target_event_name: string | null;
};

export type TrainingActivity = {
  id: string;
  activity_type: string;
  contact_id: string | null;
  organization_id: string | null;
  event_id: string | null;
  campaign_id: string | null;
  owner: string | null;
  activity_date: string;
  channel: string | null;
  subject: string | null;
  message_summary: string | null;
  outcome: string | null;
  next_step: string | null;
  due_date: string | null;
  status: string;
  contact_name: string | null;
  organization_name: string | null;
  event_name: string | null;
  campaign_name: string | null;
};

export type TrainingTask = {
  id: string;
  task_name: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  assigned_to: string | null;
  priority: string;
  due_date: string | null;
  status: string;
  mobile_quick_action_flag: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainingFeedback = {
  id: string;
  event_id: string;
  contact_id: string;
  rating: number | null;
  what_they_found_useful: string | null;
  what_was_confusing: string | null;
  would_attend_again: boolean | null;
  would_bring_friend: boolean | null;
  testimonial_permission: boolean;
  testimonial_text: string | null;
  contact_name: string;
  event_name: string;
};

export function fetchTrainingWorkspace(envId: string, businessId: string) {
  return apiFetch<TrainingWorkspace>(`${BASE}/workspace?env_id=${envId}&business_id=${businessId}`);
}

export function seedTrainingWorkspace(body: { env_id: string; business_id: string }) {
  return apiFetch<Record<string, number | string>>(`${BASE}/seed`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createTrainingContact(body: Record<string, unknown>) {
  return apiFetch(`${BASE}/contacts`, { method: "POST", body: JSON.stringify(body) });
}

export function createTrainingEvent(body: Record<string, unknown>) {
  return apiFetch(`${BASE}/events`, { method: "POST", body: JSON.stringify(body) });
}

export function createTrainingActivity(body: Record<string, unknown>) {
  return apiFetch(`${BASE}/activities`, { method: "POST", body: JSON.stringify(body) });
}

export function upsertTrainingRegistration(body: Record<string, unknown>) {
  return apiFetch(`${BASE}/registrations`, { method: "POST", body: JSON.stringify(body) });
}

export function checkInTrainingRegistration(registrationId: string, attended_flag = true) {
  return apiFetch(`${BASE}/registrations/${registrationId}/check-in`, {
    method: "PATCH",
    body: JSON.stringify({ attended_flag }),
  });
}

export function updateTrainingTask(taskId: string, status: "open" | "in_progress" | "done") {
  return apiFetch(`${BASE}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
