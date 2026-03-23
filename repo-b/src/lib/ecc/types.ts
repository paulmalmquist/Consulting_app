export type EccUser = {
  id: string;
  env_id: string;
  name: string;
  role: "owner" | "assistant" | "controller" | "operator";
  title: string;
  email: string;
};

export type EccContact = {
  id: string;
  env_id: string;
  name: string;
  channels: {
    emails: string[];
    phones: string[];
    domains?: string[];
  };
  vip_tier: number;
  sla_hours: number;
  tags: string[];
  created_at: string;
};

export type EccTaskType = "pay" | "approve" | "reply" | "schedule" | "review" | "decide";
export type EccTaskStatus = "open" | "in_progress" | "waiting" | "delegated" | "done";
export type EccMessageStatus = "open" | "snoozed" | "done";
export type EccPayableStatus =
  | "needs_approval"
  | "approved"
  | "declined"
  | "paid"
  | "overdue"
  | "needs_review";
export type EccReceivableStatus = "open" | "overdue" | "paid" | "disputed";
export type EccDirection = "in" | "out";
export type EccDelegationStatus = "assigned" | "acknowledged" | "done";
export type EccBriefType = "am" | "pm";

export type EccFinanceSuggestion = {
  kind: "link_payable" | "create_payable" | "match_transaction";
  target_id?: string;
  label: string;
  confidence: number;
  note: string;
};

export type EccMessage = {
  id: string;
  env_id: string;
  source: "email" | "sms" | "slack" | "whatsapp" | "manual" | "seed";
  source_id: string;
  sender_contact_id: string | null;
  sender_raw: string;
  recipients_raw: Array<{ name?: string; email?: string; phone?: string }>;
  subject: string;
  body_preview: string;
  body_full: string | null;
  received_at: string;
  vip_flag: boolean;
  vip_tier: number;
  priority_score: number;
  requires_reply: boolean;
  sla_deadline: string | null;
  status: EccMessageStatus;
  snoozed_until: string | null;
  linked_task_ids: string[];
  linked_payable_ids: string[];
  attachments: Array<{ filename: string; content_type?: string; size_bytes?: number }>;
  raw_payload: Record<string, unknown>;
  created_at: string;
  notes: string[];
  action_candidates: EccTaskType[];
  confidence_score: number;
  finance_suggestions: EccFinanceSuggestion[];
  dedupe_hash: string;
  queue_tags: string[];
};

export type EccTask = {
  id: string;
  env_id: string;
  type: EccTaskType;
  owner_user_id: string | null;
  delegated_to_user_id: string | null;
  due_by: string | null;
  amount: number | null;
  currency: string;
  status: EccTaskStatus;
  linked_message_ids: string[];
  linked_payable_ids: string[];
  linked_event_ids: string[];
  confidence_score: number;
  notes: string;
  created_at: string;
};

export type EccPayable = {
  id: string;
  env_id: string;
  vendor_id: string | null;
  vendor_name_raw: string;
  amount: number;
  due_date: string;
  invoice_number: string | null;
  invoice_link: string | null;
  status: EccPayableStatus;
  approval_required: boolean;
  approval_note: string | null;
  source_message_id: string | null;
  source_doc_id: string | null;
  matched_transaction_id: string | null;
  match_confidence: number | null;
  created_at: string;
  needs_review_reason?: string | null;
};

export type EccReceivable = {
  id: string;
  env_id: string;
  customer_name_raw: string;
  amount: number;
  due_date: string;
  status: EccReceivableStatus;
  source_message_id: string | null;
  created_at: string;
};

export type EccFinancialTransaction = {
  id: string;
  env_id: string;
  account_name: string;
  posted_at: string;
  amount: number;
  direction: EccDirection;
  merchant: string;
  memo: string;
  category: string | null;
  confidence_score: number | null;
  linked_payable_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

export type EccCalendarEvent = {
  id: string;
  env_id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  rsvp_status: "needs_response" | "accepted" | "declined" | "tentative";
  prep_notes: string | null;
  travel_buffer_minutes: number;
  linked_message_id: string | null;
  created_at: string;
};

export type EccDelegation = {
  id: string;
  env_id: string;
  from_user_id: string;
  to_user_id: string;
  item_type: "message" | "task" | "payable" | "event";
  item_id: string;
  status: EccDelegationStatus;
  context_notes: string;
  due_by: string | null;
  created_at: string;
};

export type EccDailyBrief = {
  id: string;
  env_id: string;
  user_id: string;
  date: string;
  type: EccBriefType;
  money_summary: {
    cash_out_today: number;
    due_72h_total: number;
    overdue_total: number;
    receivable_total: number;
    decision_exposure: number;
  };
  top_risks: string[];
  top_messages: string[];
  top_approvals: string[];
  top_events: string[];
  body: string;
  created_at: string;
};

export type EccAuditLog = {
  id: string;
  env_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  source_refs: Record<string, unknown>;
  created_at: string;
};

export type EccEventLog = {
  id: string;
  env_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type EccQueueCard = {
  id: string;
  kind: "message" | "payable" | "event" | "task";
  href: string;
  title: string;
  actor: string;
  summary: string;
  amount: number | null;
  currency: string;
  priority_score: number;
  status: string;
  badge: string;
  due_at: string | null;
  due_label: string;
  quick_actions: string[];
};

export type EccQueueResponse = {
  env_id: string;
  client_name: string;
  generated_at: string;
  demo_mode: boolean;
  seed_version: string;
  counts: {
    red_alerts: number;
    vip: number;
    approvals: number;
    calendar: number;
    general: number;
  };
  sections: {
    red_alerts: EccQueueCard[];
    vip: EccQueueCard[];
    approvals: EccQueueCard[];
    calendar: EccQueueCard[];
    general: EccQueueCard[];
  };
  risk_signals: string[];
};

export type EccMessageDetail = {
  message: EccMessage;
  tasks: EccTask[];
  linked_payables: EccPayable[];
  audit: EccAuditLog[];
};

export type EccPayableDetail = {
  payable: EccPayable;
  linked_message: EccMessage | null;
  linked_task: EccTask | null;
  candidate_transactions: EccFinancialTransaction[];
  audit: EccAuditLog[];
};

export type EccBriefResponse = {
  brief: EccDailyBrief;
  outstanding_red_alerts: number;
  outstanding_open_items: number;
};

export type EccDemoStatus = {
  env_id: string;
  demo_mode: boolean;
  seed_version: string;
  counts: {
    messages: number;
    payables: number;
    receivables: number;
    transactions: number;
    events: number;
    tasks: number;
    red_alerts: number;
  };
};
