import {
  type EccAuditLog,
  type EccBriefResponse,
  type EccCalendarEvent,
  type EccContact,
  type EccDailyBrief,
  type EccDemoStatus,
  type EccDelegation,
  type EccEventLog,
  type EccFinancialTransaction,
  type EccMessage,
  type EccMessageDetail,
  type EccPayable,
  type EccPayableDetail,
  type EccQueueCard,
  type EccQueueResponse,
  type EccReceivable,
  type EccTask,
  type EccTaskType,
  type EccUser,
} from "@/lib/ecc/types";

export const ECC_SEED_VERSION = "ecc_meridian_apex_v1";
export const MERIDIAN_APEX_ENV_ID = "0f2b6f58-57c2-4a54-8b11-4fda7fd72510";
export const MERIDIAN_APEX_ENV_NAME = "Meridian Apex Holdings";
export const MERIDIAN_APEX_INDUSTRY = "ecc";

type EccEnvironmentState = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string;
  schema_name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  demo_mode: boolean;
  seed_version: string;
  runtime_started_at_ms: number;
  manual_time_offset_ms: number;
  users: EccUser[];
  contacts: EccContact[];
  messages: EccMessage[];
  tasks: EccTask[];
  payables: EccPayable[];
  receivables: EccReceivable[];
  transactions: EccFinancialTransaction[];
  events: EccCalendarEvent[];
  delegations: EccDelegation[];
  briefs: EccDailyBrief[];
  audit_log: EccAuditLog[];
  event_log: EccEventLog[];
};

type EccStore = {
  environments: Map<string, EccEnvironmentState>;
};

type MessageSeedInput = {
  slug: string;
  source: EccMessage["source"];
  source_id: string;
  sender_raw: string;
  sender_contact_id: string | null;
  subject: string;
  body: string;
  minutes_ago: number;
  recipients?: EccMessage["recipients_raw"];
  attachments?: EccMessage["attachments"];
  requires_reply?: boolean;
  tags?: string[];
  status?: EccMessage["status"];
  snoozed_until?: string | null;
};

type IngestPayload = {
  env_id?: string;
  source: EccMessage["source"];
  source_id: string;
  sender: string;
  subject?: string;
  body: string;
  received_at?: string;
  attachments?: EccMessage["attachments"];
  raw?: Record<string, unknown>;
};

type CreatePayableFromMessageArgs = {
  actor_user_id?: string | null;
  message_id: string;
  approval_required?: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __eccDemoStore: EccStore | undefined;
}

const REFERENCE_NOW = Date.parse("2026-02-27T14:00:00.000Z");

const OWNER_ID = seededUuid(101);
const ASSISTANT_ID = seededUuid(102);
const CONTROLLER_ID = seededUuid(103);
const OPS_ID = seededUuid(104);

const CONTACT_IDS = {
  spouse: seededUuid(201),
  board: seededUuid(202),
  lp: seededUuid(203),
  counsel: seededUuid(204),
  client: seededUuid(205),
  banker: seededUuid(206),
  marketing: seededUuid(207),
  contractor: seededUuid(208),
  payroll: seededUuid(209),
  school: seededUuid(210),
  software: seededUuid(211),
  utilities: seededUuid(212),
  hospitality: seededUuid(213),
} as const;

const PAYABLE_IDS = {
  marketing: seededUuid(301),
  changeOrder: seededUuid(302),
  payroll: seededUuid(303),
  software: seededUuid(304),
  utilities: seededUuid(305),
} as const;

const RECEIVABLE_IDS = {
  capitalCall: seededUuid(401),
  hospitalityAr: seededUuid(402),
  consultingFee: seededUuid(403),
} as const;

const EVENT_IDS = {
  boardMeeting: seededUuid(501),
  hiring: seededUuid(502),
  siteVisit: seededUuid(503),
  school: seededUuid(504),
  flight: seededUuid(505),
} as const;

function seededUuid(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function store(): EccStore {
  if (!globalThis.__eccDemoStore) {
    globalThis.__eccDemoStore = { environments: new Map<string, EccEnvironmentState>() };
  }
  return globalThis.__eccDemoStore;
}

function schemaName(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return `env_${base || "client"}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function plusMinutes(baseMs: number, minutes: number): string {
  return new Date(baseMs + minutes * 60_000).toISOString();
}

function plusHours(baseMs: number, hours: number): string {
  return plusMinutes(baseMs, hours * 60);
}

function plusDays(baseMs: number, days: number): string {
  return new Date(baseMs + days * 86_400_000).toISOString();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function sanitizePreview(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 180);
}

function getEnvState(envId = MERIDIAN_APEX_ENV_ID): EccEnvironmentState {
  const state = store().environments.get(envId);
  if (!state) {
    return createOrResetMeridianDemo(envId);
  }
  return state;
}

function now(state: EccEnvironmentState): Date {
  const elapsed = Date.now() - state.runtime_started_at_ms + state.manual_time_offset_ms;
  return new Date(REFERENCE_NOW + elapsed);
}

function compareAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

function isNewsOrAutomated(value: string): boolean {
  return /(newsletter|digest|unsubscribe|no-reply|notification|cc:|press release|daily brief)/i.test(value);
}

function parseCurrencyAmount(text: string): number | null {
  const match = text.match(/\$([0-9][0-9,]*(?:\.[0-9]{2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function vendorTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function vendorSimilarity(left: string, right: string): number {
  const a = new Set(vendorTokens(left));
  const b = new Set(vendorTokens(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function urgencyWeight(text: string): number {
  const weights: Array<[RegExp, number]> = [
    [/\bpayroll\b/i, 18],
    [/\boverdue\b/i, 12],
    [/\burgent\b/i, 10],
    [/\btoday\b/i, 8],
    [/\bwire\b/i, 9],
    [/\blegal deadline\b/i, 12],
    [/\bmust decide\b/i, 10],
    [/\brsvp\b/i, 6],
    [/\bsign\b/i, 8],
  ];
  return weights.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0);
}

function extractTaskTypes(text: string): EccTaskType[] {
  const checks: Array<[RegExp, EccTaskType]> = [
    [/\bpay\b|\binvoice\b|\bwire\b|\bfunding\b/i, "pay"],
    [/\bapprove\b|\bauthorize\b/i, "approve"],
    [/\breply\b|\brespond\b|\bcall me\b/i, "reply"],
    [/\bschedule\b|\bcalendar\b|\brsvp\b/i, "schedule"],
    [/\breview\b|\blook over\b/i, "review"],
    [/\bdecide\b|\bsign\b|\bchoice\b/i, "decide"],
  ];
  const types = new Set<EccTaskType>();
  for (const [pattern, type] of checks) {
    if (pattern.test(text)) types.add(type);
  }
  return Array.from(types);
}

function findContactBySender(state: EccEnvironmentState, sender: string): EccContact | null {
  const lower = sender.toLowerCase();
  return (
    state.contacts.find((contact) => {
      if (contact.name.toLowerCase() === lower) return true;
      if (contact.channels.emails.some((email) => email.toLowerCase() === lower)) return true;
      if (contact.channels.emails.some((email) => lower.includes(email.toLowerCase()))) return true;
      if (contact.channels.domains?.some((domain) => lower.includes(domain.toLowerCase()))) return true;
      if (contact.channels.phones.some((phone) => lower.includes(phone.toLowerCase()))) return true;
      return false;
    }) || null
  );
}

function financeSuggestionsForMessage(state: EccEnvironmentState, message: Pick<EccMessage, "subject" | "body_full" | "linked_payable_ids">) {
  const text = `${message.subject} ${message.body_full || ""}`;
  const amount = parseCurrencyAmount(text);
  const suggestions: EccMessage["finance_suggestions"] = [];
  if (!amount) return suggestions;

  const matches = state.payables
    .map((payable) => {
      const amountDelta = Math.abs(payable.amount - amount);
      const amountScore = Math.max(0, 1 - amountDelta / Math.max(payable.amount, amount, 1));
      const vendorScore = vendorSimilarity(text, payable.vendor_name_raw);
      const score = Number((amountScore * 0.65 + vendorScore * 0.35).toFixed(2));
      return { payable, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (best && best.score >= 0.55) {
    suggestions.push({
      kind: "link_payable",
      target_id: best.payable.id,
      label: `Link ${best.payable.vendor_name_raw}`,
      confidence: best.score,
      note:
        best.score >= 0.85
          ? "Strong payable match by amount, timing, and vendor."
          : "Likely payable match. Controller review recommended.",
    });
  } else {
    suggestions.push({
      kind: "create_payable",
      label: amount ? `Create payable for ${formatMoney(amount)}` : "Create payable",
      confidence: 0.66,
      note: "New bill detected from message body.",
    });
  }

  return suggestions;
}

function classifyMessage(
  state: EccEnvironmentState,
  input: {
    source: EccMessage["source"];
    source_id: string;
    sender_raw: string;
    sender_contact_id?: string | null;
    subject: string;
    body: string;
    received_at: string;
    recipients?: EccMessage["recipients_raw"];
    attachments?: EccMessage["attachments"];
    raw_payload?: Record<string, unknown>;
    status?: EccMessage["status"];
    snoozed_until?: string | null;
    requires_reply?: boolean;
    queue_tags?: string[];
  }
): EccMessage {
  const existingContact =
    (input.sender_contact_id &&
      state.contacts.find((contact) => contact.id === input.sender_contact_id)) ||
    findContactBySender(state, input.sender_raw);
  const vip_tier = existingContact?.vip_tier ?? 0;
  const vip_flag = vip_tier > 0;
  const amount = parseCurrencyAmount(`${input.subject} ${input.body}`);
  const urgency = urgencyWeight(`${input.subject} ${input.body}`);
  const automated = isNewsOrAutomated(`${input.sender_raw} ${input.subject} ${input.body}`);
  const taskTypes = extractTaskTypes(`${input.subject} ${input.body}`);
  const confidence = Number(
    Math.min(
      0.98,
      (taskTypes.length ? 0.25 : 0) +
        (vip_tier >= 2 ? 0.22 : vip_tier ? 0.12 : 0) +
        (urgency / 100) +
        (amount ? Math.min(amount / 250_000, 0.28) : 0)
    ).toFixed(2)
  );
  const priority = Math.max(
    0,
    Math.min(
      100,
      (vip_tier ? vip_tier * 18 : 0) +
        urgency +
        (amount ? Math.min(18, Math.round(amount / 15_000)) : 0) +
        (taskTypes.length ? taskTypes.length * 6 : 0) -
        (automated ? 28 : 0)
    )
  );
  const sla_deadline = vip_flag ? plusHours(new Date(input.received_at).getTime(), existingContact?.sla_hours || 24) : null;
  const dedupe = hashString(
    `${input.source}:${input.source_id}:${input.sender_raw}:${input.subject}:${sanitizePreview(input.body)}`
  );
  const messageId = seededUuid(2_000 + state.messages.length + 1);
  const message: EccMessage = {
    id: messageId,
    env_id: state.env_id,
    source: input.source,
    source_id: input.source_id,
    sender_contact_id: existingContact?.id || input.sender_contact_id || null,
    sender_raw: input.sender_raw,
    recipients_raw: input.recipients || [],
    subject: input.subject || "(no subject)",
    body_preview: sanitizePreview(input.body),
    body_full: input.body,
    received_at: input.received_at,
    vip_flag,
    vip_tier,
    priority_score: priority,
    requires_reply: input.requires_reply ?? (vip_flag || /reply|respond|call|rsvp/i.test(input.body)),
    sla_deadline,
    status: input.status || "open",
    snoozed_until: input.snoozed_until || null,
    linked_task_ids: [],
    linked_payable_ids: [],
    attachments: input.attachments || [],
    raw_payload: input.raw_payload || {},
    created_at: input.received_at,
    notes: [],
    action_candidates: taskTypes,
    confidence_score: confidence,
    finance_suggestions: [],
    dedupe_hash: dedupe,
    queue_tags: input.queue_tags || [],
  };
  message.finance_suggestions = financeSuggestionsForMessage(state, message);
  return message;
}

function addAudit(
  state: EccEnvironmentState,
  input: {
    actor_user_id?: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    before_state?: Record<string, unknown> | null;
    after_state?: Record<string, unknown> | null;
    source_refs?: Record<string, unknown>;
  }
) {
  state.audit_log.unshift({
    id: seededUuid(7_000 + state.audit_log.length + 1),
    env_id: state.env_id,
    actor_user_id: input.actor_user_id ?? null,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    before_state: input.before_state || null,
    after_state: input.after_state || null,
    source_refs: input.source_refs || {},
    created_at: now(state).toISOString(),
  });
}

function addEvent(
  state: EccEnvironmentState,
  event_type: string,
  payload: Record<string, unknown>
) {
  state.event_log.unshift({
    id: seededUuid(8_000 + state.event_log.length + 1),
    env_id: state.env_id,
    event_type,
    payload,
    created_at: now(state).toISOString(),
  });
}

function getUserByName(state: EccEnvironmentState, name: string): EccUser | null {
  return state.users.find((user) => user.name.toLowerCase() === name.toLowerCase()) || null;
}

function createTaskForMessage(
  state: EccEnvironmentState,
  message: EccMessage,
  taskType: EccTaskType,
  options?: {
    owner_user_id?: string | null;
    due_by?: string | null;
    amount?: number | null;
    notes?: string;
    linked_payable_ids?: string[];
  }
): EccTask {
  const task: EccTask = {
    id: seededUuid(2_500 + state.tasks.length + 1),
    env_id: state.env_id,
    type: taskType,
    owner_user_id: options?.owner_user_id ?? OWNER_ID,
    delegated_to_user_id: null,
    due_by: options?.due_by ?? message.sla_deadline ?? null,
    amount: options?.amount ?? parseCurrencyAmount(`${message.subject} ${message.body_full || ""}`),
    currency: "USD",
    status: "open",
    linked_message_ids: [message.id],
    linked_payable_ids: options?.linked_payable_ids || [],
    linked_event_ids: [],
    confidence_score: message.confidence_score,
    notes: options?.notes || "",
    created_at: now(state).toISOString(),
  };
  state.tasks.push(task);
  message.linked_task_ids.push(task.id);
  addEvent(state, "TaskCreated", {
    task_id: task.id,
    message_id: message.id,
    type: task.type,
  });
  return task;
}

function findBestTransactionMatch(
  state: EccEnvironmentState,
  payable: EccPayable
): { transaction: EccFinancialTransaction; confidence: number } | null {
  const due = new Date(payable.due_date).getTime();
  const candidates = state.transactions
    .filter((txn) => txn.direction === "out")
    .map((txn) => {
      const txnTime = new Date(txn.posted_at).getTime();
      const days = Math.abs(txnTime - due) / 86_400_000;
      const timeScore = Math.max(0, 1 - days / 7);
      const amountScore = Math.max(0, 1 - Math.abs(txn.amount - payable.amount) / Math.max(payable.amount, 1));
      const vendorScore = vendorSimilarity(txn.merchant, payable.vendor_name_raw);
      const confidence = Number((amountScore * 0.55 + vendorScore * 0.3 + timeScore * 0.15).toFixed(2));
      return { transaction: txn, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0] || null;
}

function runTransactionMatcher(state: EccEnvironmentState) {
  for (const payable of state.payables) {
    const best = findBestTransactionMatch(state, payable);
    if (!best) continue;
    payable.matched_transaction_id = best.transaction.id;
    payable.match_confidence = best.confidence;
    if (best.confidence >= 0.85) {
      best.transaction.linked_payable_id = payable.id;
      best.transaction.confidence_score = best.confidence;
      addEvent(state, "PayableMatched", {
        payable_id: payable.id,
        transaction_id: best.transaction.id,
        confidence: best.confidence,
      });
    } else if (payable.status === "needs_approval") {
      payable.needs_review_reason = "Close amount and merchant variant need confirmation.";
    }
  }
}

function routeMessage(state: EccEnvironmentState, message: EccMessage) {
  const queues = new Set<string>(message.queue_tags);
  if (message.vip_flag && message.requires_reply && message.status !== "done") queues.add("vip");
  if (message.linked_payable_ids.length) queues.add("approvals");
  if (!queues.size) queues.add("general");
  message.queue_tags = Array.from(queues);
  addEvent(state, "RoutedToQueue", {
    message_id: message.id,
    queues: message.queue_tags,
  });
}

function attachPayableToMessage(state: EccEnvironmentState, payableId: string, messageId: string) {
  const payable = state.payables.find((row) => row.id === payableId);
  const message = state.messages.find((row) => row.id === messageId);
  if (!payable || !message) return;
  if (!message.linked_payable_ids.includes(payable.id)) {
    message.linked_payable_ids.push(payable.id);
  }
  payable.source_message_id = message.id;
  message.finance_suggestions = financeSuggestionsForMessage(state, message);
}

function maybeCreateTasksForMessage(state: EccEnvironmentState, message: EccMessage) {
  const text = `${message.subject} ${message.body_full || ""}`;
  const taskTypes = message.action_candidates;
  if (!taskTypes.length && !(message.vip_tier >= 2 && /reply|respond|call|review/i.test(text))) {
    return;
  }

  const shouldAutoCreate = message.confidence_score >= 0.6 || (message.vip_tier >= 2 && taskTypes.length > 0);
  if (!shouldAutoCreate) return;

  const amount = parseCurrencyAmount(text);
  const dueBy =
    /today/i.test(text)
      ? plusHours(REFERENCE_NOW, 6)
      : /tomorrow/i.test(text)
      ? plusDays(REFERENCE_NOW, 1)
      : message.sla_deadline;
  const owner =
    /payroll|invoice|renewal|utilities|change order/i.test(text) ? CONTROLLER_ID : OWNER_ID;
  const notes = message.vip_flag ? "VIP workflow: close the loop visibly." : "";

  const types: EccTaskType[] = taskTypes.length ? taskTypes : ["reply"];
  for (const type of types) {
    const task = createTaskForMessage(state, message, type, {
      owner_user_id: owner,
      due_by: dueBy,
      amount,
      notes,
      linked_payable_ids: [...message.linked_payable_ids],
    });
    if (type === "pay" || type === "approve") {
      task.linked_payable_ids = [...message.linked_payable_ids];
    }
  }
}

function seedUsers(envId: string): EccUser[] {
  return [
    {
      id: OWNER_ID,
      env_id: envId,
      name: "Richard Hale",
      role: "owner",
      title: "Owner",
      email: "richard@meridianapex.com",
    },
    {
      id: ASSISTANT_ID,
      env_id: envId,
      name: "Sarah Kim",
      role: "assistant",
      title: "Executive Assistant",
      email: "sarah@meridianapex.com",
    },
    {
      id: CONTROLLER_ID,
      env_id: envId,
      name: "Daniel Ortiz",
      role: "controller",
      title: "Controller",
      email: "daniel@meridianapex.com",
    },
    {
      id: OPS_ID,
      env_id: envId,
      name: "Lisa Tran",
      role: "operator",
      title: "Ops Manager",
      email: "lisa@meridianapex.com",
    },
  ];
}

function seedContacts(envId: string): EccContact[] {
  const createdAt = new Date(REFERENCE_NOW).toISOString();
  return [
    {
      id: CONTACT_IDS.spouse,
      env_id: envId,
      name: "Amelia Hale",
      channels: {
        emails: ["amelia@halefamily.com"],
        phones: ["+1-312-555-0101"],
        domains: ["halefamily.com"],
      },
      vip_tier: 3,
      sla_hours: 1,
      tags: ["family", "spouse"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.board,
      env_id: envId,
      name: "Evelyn Price",
      channels: {
        emails: ["eprice@boardpartners.com"],
        phones: ["+1-646-555-0102"],
        domains: ["boardpartners.com"],
      },
      vip_tier: 3,
      sla_hours: 1,
      tags: ["board"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.lp,
      env_id: envId,
      name: "Martin Greene",
      channels: {
        emails: ["martin.greene@greenefamilycapital.com"],
        phones: ["+1-617-555-0103"],
        domains: ["greenefamilycapital.com"],
      },
      vip_tier: 2,
      sla_hours: 4,
      tags: ["lp"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.counsel,
      env_id: envId,
      name: "Rebecca Stone",
      channels: {
        emails: ["rstone@stoneharrisonlaw.com"],
        phones: ["+1-212-555-0104"],
        domains: ["stoneharrisonlaw.com"],
      },
      vip_tier: 2,
      sla_hours: 4,
      tags: ["legal"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.client,
      env_id: envId,
      name: "Noah Bennett",
      channels: {
        emails: ["noah@horizonhospitalitygroup.com"],
        phones: ["+1-305-555-0105"],
        domains: ["horizonhospitalitygroup.com"],
      },
      vip_tier: 2,
      sla_hours: 4,
      tags: ["client"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.banker,
      env_id: envId,
      name: "Oliver Chase",
      channels: {
        emails: ["oliver.chase@citadelbank.com"],
        phones: ["+1-312-555-0106"],
        domains: ["citadelbank.com"],
      },
      vip_tier: 1,
      sla_hours: 24,
      tags: ["banker"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.marketing,
      env_id: envId,
      name: "Northline Marketing Agency",
      channels: {
        emails: ["billing@northlinemarketing.com"],
        phones: [],
        domains: ["northlinemarketing.com"],
      },
      vip_tier: 1,
      sla_hours: 24,
      tags: ["vendor"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.contractor,
      env_id: envId,
      name: "North Shore Construction Supply",
      channels: {
        emails: ["pm@nscsupply.com"],
        phones: [],
        domains: ["nscsupply.com"],
      },
      vip_tier: 0,
      sla_hours: 24,
      tags: ["vendor"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.payroll,
      env_id: envId,
      name: "Payroll Clearing House",
      channels: {
        emails: ["alerts@payrollclearing.com"],
        phones: [],
        domains: ["payrollclearing.com"],
      },
      vip_tier: 0,
      sla_hours: 24,
      tags: ["vendor", "payroll"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.school,
      env_id: envId,
      name: "Lakeside School",
      channels: {
        emails: ["events@lakesideschool.org"],
        phones: [],
        domains: ["lakesideschool.org"],
      },
      vip_tier: 0,
      sla_hours: 24,
      tags: ["family"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.software,
      env_id: envId,
      name: "Atlas Cloud Software",
      channels: {
        emails: ["renewals@atlascloud.com"],
        phones: [],
        domains: ["atlascloud.com"],
      },
      vip_tier: 0,
      sla_hours: 24,
      tags: ["vendor", "software"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.utilities,
      env_id: envId,
      name: "City Utilities",
      channels: {
        emails: ["billing@cityutilities.com"],
        phones: [],
        domains: ["cityutilities.com"],
      },
      vip_tier: 0,
      sla_hours: 24,
      tags: ["vendor", "utilities"],
      created_at: createdAt,
    },
    {
      id: CONTACT_IDS.hospitality,
      env_id: envId,
      name: "Astera Events",
      channels: {
        emails: ["ops@asteraevents.com"],
        phones: [],
        domains: ["asteraevents.com"],
      },
      vip_tier: 1,
      sla_hours: 24,
      tags: ["client"],
      created_at: createdAt,
    },
  ];
}

function seedPayables(envId: string): EccPayable[] {
  return [
    {
      id: PAYABLE_IDS.marketing,
      env_id: envId,
      vendor_id: CONTACT_IDS.marketing,
      vendor_name_raw: "Northline Marketing Agency",
      amount: 18_450,
      due_date: dateOnly(plusDays(REFERENCE_NOW, 3)),
      invoice_number: "NMA-2207",
      invoice_link: "demo://invoice/nma-2207",
      status: "needs_approval",
      approval_required: true,
      approval_note: null,
      source_message_id: null,
      source_doc_id: null,
      matched_transaction_id: null,
      match_confidence: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: PAYABLE_IDS.changeOrder,
      env_id: envId,
      vendor_id: CONTACT_IDS.contractor,
      vendor_name_raw: "North Shore Construction Supply",
      amount: 72_000,
      due_date: dateOnly(new Date(REFERENCE_NOW).toISOString()),
      invoice_number: "CO-412",
      invoice_link: "demo://invoice/co-412",
      status: "needs_approval",
      approval_required: true,
      approval_note: null,
      source_message_id: null,
      source_doc_id: null,
      matched_transaction_id: null,
      match_confidence: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: PAYABLE_IDS.payroll,
      env_id: envId,
      vendor_id: CONTACT_IDS.payroll,
      vendor_name_raw: "Payroll Clearing House",
      amount: 145_000,
      due_date: dateOnly(plusDays(REFERENCE_NOW, 1)),
      invoice_number: "PAY-228",
      invoice_link: "demo://invoice/pay-228",
      status: "needs_review",
      approval_required: true,
      approval_note: "Risk: shortfall against current cash buffer.",
      source_message_id: null,
      source_doc_id: null,
      matched_transaction_id: null,
      match_confidence: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
      needs_review_reason: "Close payroll debit detected but funding buffer is short.",
    },
    {
      id: PAYABLE_IDS.software,
      env_id: envId,
      vendor_id: CONTACT_IDS.software,
      vendor_name_raw: "Atlas Cloud Software",
      amount: 9_850,
      due_date: dateOnly(plusDays(REFERENCE_NOW, -9)),
      invoice_number: "ATL-991",
      invoice_link: "demo://invoice/atl-991",
      status: "overdue",
      approval_required: true,
      approval_note: "Renewal lapsed 9 days ago.",
      source_message_id: null,
      source_doc_id: null,
      matched_transaction_id: null,
      match_confidence: null,
      created_at: plusDays(REFERENCE_NOW, -12),
    },
    {
      id: PAYABLE_IDS.utilities,
      env_id: envId,
      vendor_id: CONTACT_IDS.utilities,
      vendor_name_raw: "City Utilities",
      amount: 5_200,
      due_date: dateOnly(plusDays(REFERENCE_NOW, 5)),
      invoice_number: "UTIL-811",
      invoice_link: "demo://invoice/util-811",
      status: "needs_review",
      approval_required: true,
      approval_note: null,
      source_message_id: null,
      source_doc_id: null,
      matched_transaction_id: null,
      match_confidence: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
      needs_review_reason: "Two similar utility debits posted. Confirm the correct one.",
    },
  ];
}

function seedReceivables(envId: string): EccReceivable[] {
  return [
    {
      id: RECEIVABLE_IDS.capitalCall,
      env_id: envId,
      customer_name_raw: "Capital Call Pending",
      amount: 250_000,
      due_date: dateOnly(plusDays(REFERENCE_NOW, 2)),
      status: "open",
      source_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: RECEIVABLE_IDS.hospitalityAr,
      env_id: envId,
      customer_name_raw: "Harbor Hospitality AR",
      amount: 48_000,
      due_date: dateOnly(plusDays(REFERENCE_NOW, -7)),
      status: "overdue",
      source_message_id: null,
      created_at: plusDays(REFERENCE_NOW, -10),
    },
    {
      id: RECEIVABLE_IDS.consultingFee,
      env_id: envId,
      customer_name_raw: "Consulting Fee",
      amount: 19_000,
      due_date: dateOnly(plusDays(REFERENCE_NOW, 7)),
      status: "open",
      source_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
  ];
}

function seedTransactions(envId: string): EccFinancialTransaction[] {
  const createdAt = new Date(REFERENCE_NOW).toISOString();
  return [
    {
      id: seededUuid(601),
      env_id: envId,
      account_name: "Construction",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -1)),
      amount: 18_450,
      direction: "out",
      merchant: "Northline Mktg Agency",
      memo: "Invoice NMA-2207",
      category: "marketing",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: { match_hint: "clear" },
      created_at: createdAt,
    },
    {
      id: seededUuid(602),
      env_id: envId,
      account_name: "Construction",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, 0)),
      amount: 72_000,
      direction: "out",
      merchant: "North Shore Construction Supply",
      memo: "Change order CO-412",
      category: "project_cost",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: { match_hint: "clear" },
      created_at: createdAt,
    },
    {
      id: seededUuid(603),
      env_id: envId,
      account_name: "Personal",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -8)),
      amount: 9_850,
      direction: "out",
      merchant: "Atlas Cloud Software",
      memo: "Annual renewal ATL-991",
      category: "software",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: { match_hint: "clear" },
      created_at: createdAt,
    },
    {
      id: seededUuid(604),
      env_id: envId,
      account_name: "Fund Operating",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, 0)),
      amount: 144_200,
      direction: "out",
      merchant: "Payroll Clearing",
      memo: "Payroll prefund batch 228",
      category: "payroll",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: { match_hint: "ambiguous" },
      created_at: createdAt,
    },
    {
      id: seededUuid(605),
      env_id: envId,
      account_name: "Hospitality",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, 4)),
      amount: 5_110,
      direction: "out",
      merchant: "City Utility Services",
      memo: "Utility auto debit",
      category: "utilities",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: { match_hint: "ambiguous" },
      created_at: createdAt,
    },
    {
      id: seededUuid(606),
      env_id: envId,
      account_name: "Fund Operating",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -1)),
      amount: 250_000,
      direction: "in",
      merchant: "Greene Family Capital",
      memo: "Partial capital call wire",
      category: "capital_call",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: {},
      created_at: createdAt,
    },
    {
      id: seededUuid(607),
      env_id: envId,
      account_name: "Hospitality",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -2)),
      amount: 12_500,
      direction: "out",
      merchant: "Culinary Wholesale",
      memo: "Food order",
      category: "cogs",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: {},
      created_at: createdAt,
    },
    {
      id: seededUuid(608),
      env_id: envId,
      account_name: "Construction",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -2)),
      amount: 33_700,
      direction: "out",
      merchant: "Mason Rentals",
      memo: "Equipment rental",
      category: "equipment",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: {},
      created_at: createdAt,
    },
    {
      id: seededUuid(609),
      env_id: envId,
      account_name: "Personal",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -1)),
      amount: 3_200,
      direction: "out",
      merchant: "Lakeview Pediatrics",
      memo: "Family medical appointment",
      category: "medical",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: {},
      created_at: createdAt,
    },
    {
      id: seededUuid(610),
      env_id: envId,
      account_name: "Construction",
      posted_at: dateOnly(plusDays(REFERENCE_NOW, -3)),
      amount: 48_000,
      direction: "in",
      merchant: "Astera Events",
      memo: "Deposit receipt",
      category: "ar",
      confidence_score: null,
      linked_payable_id: null,
      raw_payload: {},
      created_at: createdAt,
    },
  ];
}

function seedEvents(envId: string): EccCalendarEvent[] {
  return [
    {
      id: EVENT_IDS.boardMeeting,
      env_id: envId,
      title: "Board Meeting",
      start_time: plusHours(REFERENCE_NOW, 3),
      end_time: plusHours(REFERENCE_NOW, 4.25),
      location: "Meridian HQ",
      rsvp_status: "accepted",
      prep_notes: "Prep required: capital call timing, payroll liquidity, and LP follow-up.",
      travel_buffer_minutes: 30,
      linked_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: EVENT_IDS.hiring,
      env_id: envId,
      title: "Hiring Decision Call",
      start_time: plusHours(REFERENCE_NOW, 5),
      end_time: plusHours(REFERENCE_NOW, 5.5),
      location: "Zoom",
      rsvp_status: "tentative",
      prep_notes: "Need final scorecard from Lisa before joining.",
      travel_buffer_minutes: 15,
      linked_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: EVENT_IDS.siteVisit,
      env_id: envId,
      title: "Construction Site Visit",
      start_time: plusDays(REFERENCE_NOW, 1),
      end_time: plusHours(REFERENCE_NOW + 86_400_000, 1.5),
      location: "Oak Street Tower",
      rsvp_status: "accepted",
      prep_notes: "Missing travel buffer before departure. Bring change-order packet.",
      travel_buffer_minutes: 0,
      linked_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: EVENT_IDS.school,
      env_id: envId,
      title: "Family School Event",
      start_time: plusHours(REFERENCE_NOW, 6.5),
      end_time: plusHours(REFERENCE_NOW, 7.5),
      location: "Lakeside School",
      rsvp_status: "needs_response",
      prep_notes: "RSVP still pending for Richard and Amelia.",
      travel_buffer_minutes: 20,
      linked_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
    {
      id: EVENT_IDS.flight,
      env_id: envId,
      title: "Flight to Chicago",
      start_time: plusHours(REFERENCE_NOW, 5.25),
      end_time: plusHours(REFERENCE_NOW, 7),
      location: "ORD",
      rsvp_status: "needs_response",
      prep_notes: "Conflicts with ops review. No buffer built between call and airport.",
      travel_buffer_minutes: 0,
      linked_message_id: null,
      created_at: new Date(REFERENCE_NOW).toISOString(),
    },
  ];
}

function addSeedMessage(
  state: EccEnvironmentState,
  input: MessageSeedInput
): EccMessage {
  const message = classifyMessage(state, {
    source: input.source,
    source_id: input.source_id,
    sender_raw: input.sender_raw,
    sender_contact_id: input.sender_contact_id,
    subject: input.subject,
    body: input.body,
    received_at: plusMinutes(REFERENCE_NOW, -input.minutes_ago),
    recipients: input.recipients || [{ name: "Richard Hale", email: "richard@meridianapex.com" }],
    attachments: input.attachments || [],
    raw_payload: { slug: input.slug, seed: true },
    requires_reply: input.requires_reply,
    status: input.status,
    snoozed_until: input.snoozed_until,
    queue_tags: input.tags,
  });
  state.messages.push(message);
  addEvent(state, "MessageReceived", {
    message_id: message.id,
    source: message.source,
    source_id: message.source_id,
  });
  addEvent(state, "MessageClassified", {
    message_id: message.id,
    vip_tier: message.vip_tier,
    priority_score: message.priority_score,
    requires_reply: message.requires_reply,
  });
  routeMessage(state, message);
  maybeCreateTasksForMessage(state, message);
  return message;
}

function buildSeededMessages(state: EccEnvironmentState) {
  const messageBySlug = new Map<string, EccMessage>();
  const push = (input: MessageSeedInput) => {
    const message = addSeedMessage(state, input);
    messageBySlug.set(input.slug, message);
  };

  push({
    slug: "board-capital-call",
    source: "email",
    source_id: "seed-board-001",
    sender_raw: "Evelyn Price <eprice@boardpartners.com>",
    sender_contact_id: CONTACT_IDS.board,
    subject: "Need capital call timing before the board meeting",
    body:
      "Richard, I still need the capital call timing before we walk into the board meeting. Please reply today with whether the $250,000 LP wire clears before Monday. I have not heard back and the board deck goes out in one hour.",
    minutes_ago: 185,
    requires_reply: true,
    tags: ["red_alert", "vip"],
  });

  push({
    slug: "spouse-medical",
    source: "sms",
    source_id: "seed-spouse-001",
    sender_raw: "Amelia Hale",
    sender_contact_id: CONTACT_IDS.spouse,
    subject: "Can you confirm the pediatric appointment?",
    body:
      "Can you confirm whether you can handle the pediatric appointment timing before the school event tonight? I need an answer in the next hour so I can move the sitter.",
    minutes_ago: 95,
    requires_reply: true,
    tags: ["red_alert", "vip"],
  });

  push({
    slug: "lp-followup",
    source: "email",
    source_id: "seed-lp-001",
    sender_raw: "Martin Greene <martin.greene@greenefamilycapital.com>",
    sender_contact_id: CONTACT_IDS.lp,
    subject: "Following up on capital call cadence",
    body:
      "Before I release the next tranche, I need confirmation on the capital call cadence and when Harbor Hospitality AR is expected to convert. Please respond this afternoon.",
    minutes_ago: 75,
    requires_reply: true,
    tags: ["vip"],
  });

  push({
    slug: "legal-signature",
    source: "email",
    source_id: "seed-legal-001",
    sender_raw: "Rebecca Stone <rstone@stoneharrisonlaw.com>",
    sender_contact_id: CONTACT_IDS.counsel,
    subject: "Signature still missing on the supplier agreement",
    body:
      "Richard, the supplier agreement was due for signature yesterday at 5pm. We now have an unsigned contract past deadline. Please review and sign today or tell me to negotiate an extension.",
    minutes_ago: 68,
    requires_reply: true,
    tags: ["red_alert", "vip"],
  });

  push({
    slug: "client-cancellation",
    source: "email",
    source_id: "seed-client-001",
    sender_raw: "Noah Bennett <noah@horizonhospitalitygroup.com>",
    sender_contact_id: CONTACT_IDS.client,
    subject: "Need a call before we cancel the Harbor event block",
    body:
      "We need a decision today. If I do not hear back on the room block concession by 4pm, my team will start the cancellation process. Please call me back.",
    minutes_ago: 55,
    requires_reply: true,
    tags: ["vip"],
  });

  push({
    slug: "marketing-invoice",
    source: "email",
    source_id: "seed-payable-001",
    sender_raw: "Northline Marketing Agency <billing@northlinemarketing.com>",
    sender_contact_id: CONTACT_IDS.marketing,
    subject: "Invoice NMA-2207 | $18,450 due Friday",
    body:
      "Attached is invoice NMA-2207 for $18,450 covering Q1 creative and paid search. Payment is due Friday. Please approve or have Daniel wire it.",
    minutes_ago: 90,
    tags: ["approvals"],
  });

  push({
    slug: "change-order",
    source: "email",
    source_id: "seed-payable-002",
    sender_raw: "North Shore Construction Supply <pm@nscsupply.com>",
    sender_contact_id: CONTACT_IDS.contractor,
    subject: "CO-412 | $72,000 change order needs approval today",
    body:
      "We need approval today on CO-412 for $72,000 or the crew slips into next week. Please review the scope and approve before the site visit.",
    minutes_ago: 52,
    tags: ["approvals", "red_alert"],
  });

  push({
    slug: "payroll-shortfall",
    source: "email",
    source_id: "seed-payable-003",
    sender_raw: "Daniel Ortiz <daniel@meridianapex.com>",
    sender_contact_id: null,
    subject: "Payroll funding risk | $145,000 due tomorrow",
    body:
      "Payroll funding of $145,000 is due tomorrow. Current buffer is short by roughly $38,000 after the construction draw. Need a decision today on whether to move cash from Fund Operating or Personal.",
    minutes_ago: 40,
    tags: ["approvals", "red_alert"],
  });

  push({
    slug: "software-renewal",
    source: "email",
    source_id: "seed-payable-004",
    sender_raw: "Atlas Cloud Software <renewals@atlascloud.com>",
    sender_contact_id: CONTACT_IDS.software,
    subject: "Renewal ATL-991 is now overdue",
    body:
      "Your annual software renewal of $9,850 is overdue. Service access remains at risk until payment is confirmed.",
    minutes_ago: 510,
    tags: ["approvals", "red_alert"],
  });

  push({
    slug: "utilities-bill",
    source: "email",
    source_id: "seed-payable-005",
    sender_raw: "City Utilities <billing@cityutilities.com>",
    sender_contact_id: CONTACT_IDS.utilities,
    subject: "Utilities statement | $5,200 due next week",
    body:
      "This is a reminder that the utilities statement for $5,200 is due in five days. There are two similar debits on file; please review before payment.",
    minutes_ago: 105,
    tags: ["approvals"],
  });

  push({
    slug: "school-rsvp",
    source: "email",
    source_id: "seed-school-001",
    sender_raw: "Lakeside School <events@lakesideschool.org>",
    sender_contact_id: CONTACT_IDS.school,
    subject: "RSVP needed for tonight's family school event",
    body:
      "Please RSVP for tonight's family school event. We need headcount confirmation by 3pm so the school can release seating.",
    minutes_ago: 48,
    tags: ["calendar"],
  });

  push({
    slug: "flight-conflict",
    source: "email",
    source_id: "seed-travel-001",
    sender_raw: "Travel Desk <trips@meridianapex.com>",
    sender_contact_id: null,
    subject: "Flight to Chicago leaves before your ops review wraps",
    body:
      "The 7:15pm flight to Chicago now conflicts with the ops review. There is no travel buffer between the call and airport departure. Please decide whether to move the flight or push the review.",
    minutes_ago: 32,
    tags: ["calendar", "red_alert"],
  });

  for (let index = 0; index < 10; index += 1) {
    push({
      slug: `vip-t3-${index}`,
      source: index % 2 === 0 ? "sms" : "email",
      source_id: `seed-vipt3-${index}`,
      sender_raw:
        index % 2 === 0
          ? "Amelia Hale"
          : "Evelyn Price <eprice@boardpartners.com>",
      sender_contact_id: index % 2 === 0 ? CONTACT_IDS.spouse : CONTACT_IDS.board,
      subject: index % 2 === 0 ? "Need a quick yes/no on the family plan" : "Need a yes/no before the board sees this",
      body:
        index % 2 === 0
          ? `Need a quick reply within the hour on the revised family plan item ${index + 1}.`
          : `Please reply before the next board draft goes out. This is item ${index + 1}.`,
      minutes_ago: 20 + index * 3,
      requires_reply: index < 2,
      tags: ["vip"],
    });
  }

  for (let index = 0; index < 15; index += 1) {
    const senderCycle = [CONTACT_IDS.lp, CONTACT_IDS.counsel, CONTACT_IDS.client, CONTACT_IDS.banker][index % 4];
    const sender =
      senderCycle === CONTACT_IDS.lp
        ? "Martin Greene <martin.greene@greenefamilycapital.com>"
        : senderCycle === CONTACT_IDS.counsel
        ? "Rebecca Stone <rstone@stoneharrisonlaw.com>"
        : senderCycle === CONTACT_IDS.client
        ? "Noah Bennett <noah@horizonhospitalitygroup.com>"
        : "Oliver Chase <oliver.chase@citadelbank.com>";
    push({
      slug: `vip-t2-${index}`,
      source: "email",
      source_id: `seed-vipt2-${index}`,
      sender_raw: sender,
      sender_contact_id: senderCycle,
      subject: `Follow-up needed on priority thread ${index + 1}`,
      body:
        senderCycle === CONTACT_IDS.counsel
          ? "Please review the updated legal deadline and respond today."
          : senderCycle === CONTACT_IDS.banker
          ? "Need your decision on the wire timing before end of day."
          : "Please respond this afternoon so we can close the loop.",
      minutes_ago: 12 + index * 4,
      requires_reply: index < 3,
      tags: ["vip"],
    });
  }

  for (let index = 0; index < 33; index += 1) {
    const subjects = [
      "Ops review packet updated",
      "Field team schedule check",
      "Hospitality staffing change",
      "Controller note on cash transfer",
      "Draft board prep notes",
    ];
    push({
      slug: `ops-${index}`,
      source: index % 5 === 0 ? "slack" : "email",
      source_id: `seed-ops-${index}`,
      sender_raw:
        index % 3 === 0
          ? "Lisa Tran <lisa@meridianapex.com>"
          : index % 3 === 1
          ? "Daniel Ortiz <daniel@meridianapex.com>"
          : "Operations Desk <ops@meridianapex.com>",
      sender_contact_id: null,
      subject: subjects[index % subjects.length],
      body:
        index % 4 === 0
          ? "Please review the attached operating update and decide if Sarah should follow up."
          : "Operational note only. Team is moving, no action unless the board asks for detail.",
      minutes_ago: 6 + index * 12,
      requires_reply: index % 4 === 0,
    });
  }

  for (let index = 0; index < 110; index += 1) {
    push({
      slug: `noise-${index}`,
      source: "email",
      source_id: `seed-noise-${index}`,
      sender_raw: index % 2 === 0 ? "Daily Digest <no-reply@digest.example>" : "Newsletter Desk <newsletter@example.com>",
      sender_contact_id: null,
      subject: index % 2 === 0 ? "Daily market digest" : "Weekly sponsor newsletter",
      body:
        "Automated newsletter. Unsubscribe if you no longer want these updates. This is informational only and requires no action.",
      minutes_ago: 3 + index * 11,
      requires_reply: false,
    });
  }

  attachPayableToMessage(state, PAYABLE_IDS.marketing, messageBySlug.get("marketing-invoice")?.id || "");
  attachPayableToMessage(state, PAYABLE_IDS.changeOrder, messageBySlug.get("change-order")?.id || "");
  attachPayableToMessage(state, PAYABLE_IDS.payroll, messageBySlug.get("payroll-shortfall")?.id || "");
  attachPayableToMessage(state, PAYABLE_IDS.software, messageBySlug.get("software-renewal")?.id || "");
  attachPayableToMessage(state, PAYABLE_IDS.utilities, messageBySlug.get("utilities-bill")?.id || "");

  const boardMessage = messageBySlug.get("board-capital-call");
  const spouseMessage = messageBySlug.get("spouse-medical");
  const legalMessage = messageBySlug.get("legal-signature");
  const schoolMessage = messageBySlug.get("school-rsvp");
  const flightMessage = messageBySlug.get("flight-conflict");

  if (state.events.length) {
    state.events.find((event) => event.id === EVENT_IDS.boardMeeting)!.linked_message_id = boardMessage?.id || null;
    state.events.find((event) => event.id === EVENT_IDS.school)!.linked_message_id = schoolMessage?.id || null;
    state.events.find((event) => event.id === EVENT_IDS.flight)!.linked_message_id = flightMessage?.id || null;
  }

  if (legalMessage) {
    const legalTask = state.tasks.find((task) => task.linked_message_ids.includes(legalMessage.id));
    if (legalTask) {
      legalTask.due_by = plusHours(REFERENCE_NOW, -1);
      legalTask.notes = "Unsigned contract past deadline.";
    }
  }
  if (boardMessage) {
    boardMessage.notes.push("Past SLA at seed time.");
  }
  if (spouseMessage) {
    spouseMessage.notes.push("Past SLA at seed time.");
  }
}

function generateBrief(state: EccEnvironmentState, type: "am" | "pm"): EccDailyBrief {
  const snapshot = buildQueue(state);
  const due72h = state.payables
    .filter((payable) => {
      const days = (new Date(payable.due_date).getTime() - now(state).getTime()) / 86_400_000;
      return payable.status !== "paid" && days <= 3;
    })
    .reduce((sum, payable) => sum + payable.amount, 0);
  const overdue = state.payables
    .filter((payable) => payable.status === "overdue" || new Date(payable.due_date).getTime() < now(state).getTime())
    .reduce((sum, payable) => sum + payable.amount, 0);
  const receivableTotal = state.receivables
    .filter((receivable) => receivable.status !== "paid")
    .reduce((sum, receivable) => sum + receivable.amount, 0);
  const decisionExposure = state.payables
    .filter((payable) => payable.status !== "paid" && payable.status !== "declined")
    .reduce((sum, payable) => sum + payable.amount, 0);
  const cashOutToday = state.transactions
    .filter((txn) => txn.direction === "out" && txn.posted_at === dateOnly(now(state).toISOString()))
    .reduce((sum, txn) => sum + txn.amount, 0);
  const body =
    type === "am"
      ? [
          `Morning Brief for ${state.client_name}`,
          `Cash moving today: ${formatMoney(cashOutToday)}`,
          `Bills due in 72h: ${formatMoney(due72h)} across ${snapshot.counts.approvals} approvals`,
          `Overdue exposure: ${formatMoney(overdue)}`,
          `Decision exposure: ${formatMoney(decisionExposure)}`,
          `Red alerts: ${snapshot.counts.red_alerts}`,
        ].join("\n")
      : snapshot.counts.red_alerts === 0 &&
        snapshot.counts.vip === 0 &&
        snapshot.counts.approvals === 0 &&
        snapshot.counts.general === 0
      ? "All clear. No open red alerts, approvals, VIP replies, or open decisions remain."
      : [
          "Evening Sweep",
          `Unreplied VIPs: ${snapshot.counts.vip}`,
          `Open approvals: ${snapshot.counts.approvals}`,
          `Open general tasks: ${snapshot.counts.general}`,
          `Red alerts still open: ${snapshot.counts.red_alerts}`,
        ].join("\n");

  const brief: EccDailyBrief = {
    id: seededUuid(9_000 + state.briefs.length + 1),
    env_id: state.env_id,
    user_id: OWNER_ID,
    date: dateOnly(now(state).toISOString()),
    type,
    money_summary: {
      cash_out_today: cashOutToday,
      due_72h_total: due72h,
      overdue_total: overdue,
      receivable_total: receivableTotal,
      decision_exposure: decisionExposure,
    },
    top_risks: [...snapshot.risk_signals],
    top_messages: snapshot.sections.vip.slice(0, 10).map((item) => item.id),
    top_approvals: snapshot.sections.approvals.slice(0, 10).map((item) => item.id),
    top_events: snapshot.sections.calendar.slice(0, 5).map((item) => item.id),
    body,
    created_at: now(state).toISOString(),
  };

  state.briefs = state.briefs.filter((row) => !(row.date === brief.date && row.type === type));
  state.briefs.unshift(brief);
  addEvent(state, "DailyBriefGenerated", {
    brief_id: brief.id,
    type,
  });
  return brief;
}

function seedMeridianEnvironment(envId = MERIDIAN_APEX_ENV_ID): EccEnvironmentState {
  const state: EccEnvironmentState = {
    env_id: envId,
    client_name: MERIDIAN_APEX_ENV_NAME,
    industry: MERIDIAN_APEX_INDUSTRY,
    industry_type: MERIDIAN_APEX_INDUSTRY,
    schema_name: schemaName(MERIDIAN_APEX_ENV_NAME),
    notes:
      "Meridian Apex Holdings | Hybrid PE + operators + family office. Includes Apex Capital Fund I, Meridian Construction Group, Harbor Hospitality, and Apex Family Office.",
    is_active: true,
    created_at: new Date(REFERENCE_NOW).toISOString(),
    demo_mode: true,
    seed_version: ECC_SEED_VERSION,
    runtime_started_at_ms: Date.now(),
    manual_time_offset_ms: 0,
    users: seedUsers(envId),
    contacts: seedContacts(envId),
    messages: [],
    tasks: [],
    payables: seedPayables(envId),
    receivables: seedReceivables(envId),
    transactions: seedTransactions(envId),
    events: seedEvents(envId),
    delegations: [],
    briefs: [],
    audit_log: [],
    event_log: [],
  };

  buildSeededMessages(state);
  runTransactionMatcher(state);

  const schoolTask = state.tasks.find((task) =>
    task.linked_message_ids.some((messageId) =>
      state.messages.some((message) => message.id === messageId && message.subject.includes("RSVP"))
    )
  );
  if (schoolTask) {
    schoolTask.linked_event_ids.push(EVENT_IDS.school);
  }

  for (const message of state.messages) {
    if (
      message.vip_flag &&
      message.requires_reply &&
      message.sla_deadline &&
      new Date(message.sla_deadline).getTime() < REFERENCE_NOW
    ) {
      addEvent(state, "SLAExpired", {
        message_id: message.id,
        sla_deadline: message.sla_deadline,
      });
    }
  }
  for (const task of state.tasks) {
    if (task.due_by && new Date(task.due_by).getTime() < REFERENCE_NOW && task.status !== "done") {
      addEvent(state, "TaskOverdue", {
        task_id: task.id,
        due_by: task.due_by,
      });
    }
  }

  generateBrief(state, "am");
  addAudit(state, {
    actor_user_id: null,
    action: "demo.seeded",
    entity_type: "environment",
    entity_id: state.env_id,
    after_state: {
      messages: state.messages.length,
      payables: state.payables.length,
      receivables: state.receivables.length,
      transactions: state.transactions.length,
      events: state.events.length,
      tasks: state.tasks.length,
    },
    source_refs: { seed_version: ECC_SEED_VERSION },
  });
  return state;
}

function baseMessageCard(state: EccEnvironmentState, message: EccMessage): EccQueueCard {
  return {
    id: message.id,
    kind: "message",
    href: `/lab/env/${state.env_id}/ecc/messages/${message.id}`,
    title: message.subject,
    actor: message.sender_raw,
    summary: message.body_preview,
    amount: parseCurrencyAmount(`${message.subject} ${message.body_full || ""}`),
    currency: "USD",
    priority_score: message.priority_score,
    status: message.status,
    badge: message.vip_flag ? `VIP ${message.vip_tier}` : "Message",
    due_at: message.sla_deadline,
    due_label: message.sla_deadline ? `SLA ${new Date(message.sla_deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Open",
    quick_actions: ["Reply", "Delegate", "Snooze", "Done"],
  };
}

function payableCard(state: EccEnvironmentState, payable: EccPayable, overrideTitle?: string, overrideSummary?: string): EccQueueCard {
  return {
    id: payable.id,
    kind: "payable",
    href: `/lab/env/${state.env_id}/ecc/approvals/${payable.id}`,
    title: overrideTitle || payable.vendor_name_raw,
    actor: payable.vendor_name_raw,
    summary:
      overrideSummary ||
      `${formatMoney(payable.amount)} due ${new Date(payable.due_date).toLocaleDateString()}${payable.needs_review_reason ? ` • ${payable.needs_review_reason}` : ""}`,
    amount: payable.amount,
    currency: "USD",
    priority_score: Math.min(100, Math.round(payable.amount / 2_000) + (payable.status === "overdue" ? 25 : 10)),
    status: payable.status,
    badge:
      payable.status === "needs_review"
        ? "Needs Review"
        : payable.status === "overdue"
        ? "Overdue"
        : "Approval",
    due_at: `${payable.due_date}T17:00:00.000Z`,
    due_label: new Date(payable.due_date).toLocaleDateString(),
    quick_actions: ["Approve", "Delegate", "Snooze"],
  };
}

function eventCard(state: EccEnvironmentState, event: EccCalendarEvent): EccQueueCard {
  return {
    id: event.id,
    kind: "event",
    href: `/lab/env/${state.env_id}/ecc/brief`,
    title: event.title,
    actor: event.location || "Calendar",
    summary: event.prep_notes || "Calendar event",
    amount: null,
    currency: "USD",
    priority_score: event.rsvp_status === "needs_response" ? 72 : 55,
    status: event.rsvp_status,
    badge:
      event.rsvp_status === "needs_response"
        ? "RSVP"
        : /conflict|buffer/i.test(event.prep_notes || "")
        ? "Conflict"
        : "Calendar",
    due_at: event.start_time,
    due_label: new Date(event.start_time).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    quick_actions: ["Delegate", "Done"],
  };
}

function taskCard(state: EccEnvironmentState, task: EccTask, label: string): EccQueueCard {
  return {
    id: task.id,
    kind: "task",
    href: `/lab/env/${state.env_id}/ecc/messages/${task.linked_message_ids[0] || ""}`,
    title: label,
    actor: "Task",
    summary: task.notes || "Open decision",
    amount: task.amount,
    currency: task.currency,
    priority_score: Math.min(100, Math.round(task.confidence_score * 100)),
    status: task.status,
    badge: "Task",
    due_at: task.due_by,
    due_label: task.due_by ? new Date(task.due_by).toLocaleString() : "Open",
    quick_actions: ["Delegate", "Done"],
  };
}

function buildQueue(state: EccEnvironmentState): EccQueueResponse {
  const nowValue = now(state).getTime();
  const activeMessages = state.messages.filter((message) => {
    if (message.status === "done") return false;
    if (message.status === "snoozed" && message.snoozed_until && new Date(message.snoozed_until).getTime() > nowValue) {
      return false;
    }
    return true;
  });

  const redAlerts: EccQueueCard[] = [];
  const vipCards = activeMessages
    .filter((message) => message.vip_flag && message.requires_reply)
    .sort((a, b) => b.priority_score - a.priority_score)
    .map((message) => baseMessageCard(state, message));

  for (const message of activeMessages) {
    if (message.vip_flag && message.requires_reply && message.sla_deadline && new Date(message.sla_deadline).getTime() < nowValue) {
      redAlerts.push(baseMessageCard(state, message));
    }
  }

  const approvals = state.payables
    .filter((payable) =>
      payable.status === "needs_approval" ||
      payable.status === "needs_review" ||
      payable.status === "overdue"
    )
    .sort((a, b) => compareAsc(`${a.due_date}T17:00:00.000Z`, `${b.due_date}T17:00:00.000Z`))
    .map((payable) => payableCard(state, payable));

  const payrollPayable = state.payables.find((payable) => payable.id === PAYABLE_IDS.payroll);
  if (payrollPayable && payrollPayable.status !== "paid" && payrollPayable.status !== "declined") {
    redAlerts.push(
      payableCard(
        state,
        payrollPayable,
        "Payroll funding risk",
        "Insufficient cash buffer against tomorrow's payroll funding."
      )
    );
  }

  const overduePayable = state.payables.find((payable) => payable.status === "overdue");
  if (overduePayable && overduePayable.status !== "paid" && overduePayable.status !== "declined") {
    redAlerts.push(
      payableCard(
        state,
        overduePayable,
        "Overdue payable > 7 days",
        `${overduePayable.vendor_name_raw} has been overdue for more than 7 days.`
      )
    );
  }

  const contractTask = state.tasks.find((task) => task.notes.includes("Unsigned contract"));
  if (contractTask && contractTask.status !== "done") {
    redAlerts.push(taskCard(state, contractTask, "Unsigned contract past deadline"));
  }

  const calendar = state.events
    .filter(
      (event) => {
        const linkedMessage =
          event.linked_message_id
            ? state.messages.find((message) => message.id === event.linked_message_id)
            : null;
        const unresolvedLinkedMessage = linkedMessage ? linkedMessage.status !== "done" : true;
        return unresolvedLinkedMessage && (event.rsvp_status === "needs_response" || /conflict/i.test(event.prep_notes || ""));
      }
    )
    .sort((a, b) => compareAsc(a.start_time, b.start_time))
    .map((event) => eventCard(state, event));

  const general = activeMessages
    .filter(
      (message) =>
        !message.vip_flag &&
        !message.linked_payable_ids.length &&
        !message.queue_tags.includes("calendar") &&
        message.priority_score >= 12 &&
        !isNewsOrAutomated(`${message.sender_raw} ${message.subject}`)
    )
    .map((message) => baseMessageCard(state, message))
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 10);

  const riskSignals = [
    "Payroll funding risk: insufficient buffer",
    "2 VIP messages unanswered past SLA",
    "1 overdue payable > 7 days",
    "1 unsigned contract past deadline",
  ];

  return {
    env_id: state.env_id,
    client_name: state.client_name,
    generated_at: now(state).toISOString(),
    demo_mode: state.demo_mode,
    seed_version: state.seed_version,
    counts: {
      red_alerts: redAlerts.length,
      vip: vipCards.length,
      approvals: approvals.length,
      calendar: calendar.length,
      general: general.length,
    },
    sections: {
      red_alerts: redAlerts
        .sort((a, b) => b.priority_score - a.priority_score)
        .slice(0, 10),
      vip: vipCards.slice(0, 10),
      approvals: approvals.slice(0, 10),
      calendar: calendar.slice(0, 10),
      general,
    },
    risk_signals: riskSignals,
  };
}

function ensureMessageLinks(state: EccEnvironmentState, task: EccTask) {
  for (const messageId of task.linked_message_ids) {
    const message = state.messages.find((row) => row.id === messageId);
    if (message && !message.linked_task_ids.includes(task.id)) {
      message.linked_task_ids.push(task.id);
    }
  }
}

function createOrResolveTaskForItem(
  state: EccEnvironmentState,
  itemType: "message" | "payable" | "task" | "event",
  itemId: string
): EccTask | null {
  if (itemType === "task") {
    return state.tasks.find((task) => task.id === itemId) || null;
  }
  if (itemType === "message") {
    const message = state.messages.find((row) => row.id === itemId);
    if (!message) return null;
    const task = state.tasks.find((row) => row.linked_message_ids.includes(message.id) && row.status !== "done");
    if (task) return task;
    return createTaskForMessage(state, message, "reply", {
      owner_user_id: OWNER_ID,
      due_by: message.sla_deadline,
      notes: "Created during delegation.",
    });
  }
  if (itemType === "payable") {
    const payable = state.payables.find((row) => row.id === itemId);
    if (!payable) return null;
    const existing = state.tasks.find((row) => row.linked_payable_ids.includes(payable.id) && row.status !== "done");
    if (existing) return existing;
    const task: EccTask = {
      id: seededUuid(2_500 + state.tasks.length + 1),
      env_id: state.env_id,
      type: payable.status === "needs_review" ? "review" : "approve",
      owner_user_id: OWNER_ID,
      delegated_to_user_id: null,
      due_by: `${payable.due_date}T17:00:00.000Z`,
      amount: payable.amount,
      currency: "USD",
      status: "open",
      linked_message_ids: payable.source_message_id ? [payable.source_message_id] : [],
      linked_payable_ids: [payable.id],
      linked_event_ids: [],
      confidence_score: payable.match_confidence || 0.78,
      notes: "Created during delegation.",
      created_at: now(state).toISOString(),
    };
    state.tasks.push(task);
    ensureMessageLinks(state, task);
    addEvent(state, "TaskCreated", {
      task_id: task.id,
      payable_id: payable.id,
      type: task.type,
    });
    return task;
  }
  if (itemType === "event") {
    const event = state.events.find((row) => row.id === itemId);
    if (!event) return null;
    const existing = state.tasks.find((row) => row.linked_event_ids.includes(event.id) && row.status !== "done");
    if (existing) return existing;
    const task: EccTask = {
      id: seededUuid(2_500 + state.tasks.length + 1),
      env_id: state.env_id,
      type: "schedule",
      owner_user_id: OWNER_ID,
      delegated_to_user_id: null,
      due_by: event.start_time,
      amount: null,
      currency: "USD",
      status: "open",
      linked_message_ids: event.linked_message_id ? [event.linked_message_id] : [],
      linked_payable_ids: [],
      linked_event_ids: [event.id],
      confidence_score: 0.81,
      notes: "Created during delegation.",
      created_at: now(state).toISOString(),
    };
    state.tasks.push(task);
    ensureMessageLinks(state, task);
    addEvent(state, "TaskCreated", {
      task_id: task.id,
      event_id: event.id,
      type: task.type,
    });
    return task;
  }
  return null;
}

export function createOrResetMeridianDemo(envId = MERIDIAN_APEX_ENV_ID): EccEnvironmentState {
  const next = seedMeridianEnvironment(envId);
  store().environments.set(envId, next);
  return next;
}

export function resetEccRuntime() {
  store().environments.clear();
}

export function getMeridianEnvironmentRecord(envId = MERIDIAN_APEX_ENV_ID) {
  const state = getEnvState(envId);
  return {
    env_id: state.env_id,
    client_name: state.client_name,
    industry: state.industry,
    industry_type: state.industry_type,
    schema_name: state.schema_name,
    notes: state.notes,
    is_active: state.is_active,
    created_at: state.created_at,
  };
}

export function getDemoStatus(envId = MERIDIAN_APEX_ENV_ID): EccDemoStatus {
  const state = getEnvState(envId);
  const queue = buildQueue(state);
  return {
    env_id: state.env_id,
    demo_mode: state.demo_mode,
    seed_version: state.seed_version,
    counts: {
      messages: state.messages.length,
      payables: state.payables.length,
      receivables: state.receivables.length,
      transactions: state.transactions.length,
      events: state.events.length,
      tasks: state.tasks.length,
      red_alerts: queue.counts.red_alerts,
    },
  };
}

export function setDemoMode(enabled: boolean, envId = MERIDIAN_APEX_ENV_ID): EccDemoStatus {
  const state = getEnvState(envId);
  state.demo_mode = enabled;
  addAudit(state, {
    actor_user_id: OWNER_ID,
    action: "demo.mode.updated",
    entity_type: "environment",
    entity_id: envId,
    before_state: { demo_mode: !enabled },
    after_state: { demo_mode: enabled },
  });
  return getDemoStatus(envId);
}

export function getQueue(envId = MERIDIAN_APEX_ENV_ID): EccQueueResponse {
  return buildQueue(getEnvState(envId));
}

export function getMessageDetail(messageId: string, envId = MERIDIAN_APEX_ENV_ID): EccMessageDetail | null {
  const state = getEnvState(envId);
  const message = state.messages.find((row) => row.id === messageId);
  if (!message) return null;
  return {
    message: clone(message),
    tasks: state.tasks.filter((task) => message.linked_task_ids.includes(task.id)).map((task) => clone(task)),
    linked_payables: state.payables.filter((payable) => message.linked_payable_ids.includes(payable.id)).map((payable) => clone(payable)),
    audit: state.audit_log.filter((entry) => entry.entity_id === message.id).slice(0, 8).map((entry) => clone(entry)),
  };
}

export function getPayableDetail(payableId: string, envId = MERIDIAN_APEX_ENV_ID): EccPayableDetail | null {
  const state = getEnvState(envId);
  const payable = state.payables.find((row) => row.id === payableId);
  if (!payable) return null;
  const linkedTask = state.tasks.find((task) => task.linked_payable_ids.includes(payable.id)) || null;
  const candidates = state.transactions
    .filter((txn) => txn.direction === "out")
    .map((txn) => {
      const confidence = Number(
        (
          Math.max(0, 1 - Math.abs(txn.amount - payable.amount) / Math.max(payable.amount, 1)) * 0.6 +
          vendorSimilarity(txn.merchant, payable.vendor_name_raw) * 0.4
        ).toFixed(2)
      );
      return { txn, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((row) => ({ ...row.txn, confidence_score: row.confidence }));
  return {
    payable: clone(payable),
    linked_message: payable.source_message_id ? clone(state.messages.find((row) => row.id === payable.source_message_id) || null) : null,
    linked_task: linkedTask ? clone(linkedTask) : null,
    candidate_transactions: candidates.map((txn) => clone(txn)),
    audit: state.audit_log.filter((entry) => entry.entity_id === payable.id).slice(0, 8).map((entry) => clone(entry)),
  };
}

export function ingestMessage(payload: IngestPayload): EccMessage {
  const state = getEnvState(payload.env_id || MERIDIAN_APEX_ENV_ID);
  const receivedAt = payload.received_at || now(state).toISOString();
  const subject = String(payload.subject || "").trim() || "(manual forward)";
  const existing = state.messages.find(
    (message) =>
      message.source === payload.source &&
      message.source_id === payload.source_id &&
      message.dedupe_hash ===
        hashString(
          `${payload.source}:${payload.source_id}:${payload.sender}:${subject}:${sanitizePreview(payload.body)}`
        )
  );
  if (existing) {
    return clone(existing);
  }

  const message = classifyMessage(state, {
    source: payload.source,
    source_id: payload.source_id,
    sender_raw: payload.sender,
    subject,
    body: payload.body,
    received_at: receivedAt,
    attachments: payload.attachments || [],
    raw_payload: payload.raw || {},
  });

  state.messages.unshift(message);
  addEvent(state, "MessageReceived", {
    message_id: message.id,
    source: message.source,
    source_id: message.source_id,
  });
  addEvent(state, "MessageClassified", {
    message_id: message.id,
    vip_tier: message.vip_tier,
    priority_score: message.priority_score,
    requires_reply: message.requires_reply,
  });

  const bestSuggestion = message.finance_suggestions[0];
  if (bestSuggestion?.kind === "link_payable" && bestSuggestion.target_id) {
    attachPayableToMessage(state, bestSuggestion.target_id, message.id);
  } else if (bestSuggestion?.kind === "create_payable" && bestSuggestion.confidence >= 0.8) {
    createPayableFromMessage(state, { message_id: message.id, actor_user_id: null, approval_required: true });
  }

  routeMessage(state, message);
  maybeCreateTasksForMessage(state, message);
  addAudit(state, {
    actor_user_id: null,
    action: "message.ingested",
    entity_type: "message",
    entity_id: message.id,
    after_state: {
      vip_tier: message.vip_tier,
      priority_score: message.priority_score,
      linked_payable_ids: message.linked_payable_ids,
    },
    source_refs: { source_id: message.source_id },
  });
  return clone(message);
}

function createPayableFromMessage(
  state: EccEnvironmentState,
  args: CreatePayableFromMessageArgs
): EccPayable | null {
  const message = state.messages.find((row) => row.id === args.message_id);
  if (!message) return null;
  const amount = parseCurrencyAmount(`${message.subject} ${message.body_full || ""}`);
  if (!amount) return null;

  const payable: EccPayable = {
    id: seededUuid(3_500 + state.payables.length + 1),
    env_id: state.env_id,
    vendor_id: message.sender_contact_id,
    vendor_name_raw: message.sender_raw.replace(/<.*$/, "").trim(),
    amount,
    due_date: dateOnly(plusDays(REFERENCE_NOW, 2)),
    invoice_number: null,
    invoice_link: null,
    status: "needs_approval",
    approval_required: args.approval_required ?? true,
    approval_note: "Created from message intake.",
    source_message_id: message.id,
    source_doc_id: null,
    matched_transaction_id: null,
    match_confidence: null,
    created_at: now(state).toISOString(),
  };
  state.payables.unshift(payable);
  attachPayableToMessage(state, payable.id, message.id);
  const best = findBestTransactionMatch(state, payable);
  if (best) {
    payable.matched_transaction_id = best.transaction.id;
    payable.match_confidence = best.confidence;
    if (best.confidence < 0.85) {
      payable.status = "needs_review";
      payable.needs_review_reason = "Manual review required after intake.";
    }
  }
  addEvent(state, "PayableCreated", {
    payable_id: payable.id,
    message_id: message.id,
  });
  addAudit(state, {
    actor_user_id: args.actor_user_id ?? null,
    action: "payable.created_from_message",
    entity_type: "payable",
    entity_id: payable.id,
    after_state: { amount: payable.amount, status: payable.status },
    source_refs: { message_id: message.id },
  });
  return payable;
}

export function quickCapture(input: {
  env_id?: string;
  body: string;
  tags?: string[];
  attachment?: { filename: string; content_type?: string; size_bytes?: number } | null;
}) {
  const sourceId = `quick-${hashString(`${input.body}:${JSON.stringify(input.tags || [])}`)}`;
  return ingestMessage({
    env_id: input.env_id,
    source: "manual",
    source_id: sourceId,
    sender: "Quick Capture",
    subject: "Quick capture",
    body: input.body,
    attachments: input.attachment ? [input.attachment] : [],
    raw: { tags: input.tags || [] },
  });
}

export function messageAction(
  messageId: string,
  input: {
    env_id?: string;
    actor_user_id?: string | null;
    action: "mark_done" | "snooze_until" | "unsnooze" | "mark_requires_reply" | "add_note" | "create_payable";
    value?: string;
    note?: string;
  }
) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const message = state.messages.find((row) => row.id === messageId);
  if (!message) return null;
  const before = clone(message);

  if (input.action === "mark_done") {
    message.status = "done";
    message.requires_reply = false;
    for (const taskId of message.linked_task_ids) {
      const task = state.tasks.find((row) => row.id === taskId);
      if (task) {
        task.status = "done";
        addEvent(state, "TaskCompleted", { task_id: task.id, message_id: message.id });
      }
    }
  } else if (input.action === "snooze_until") {
    message.status = "snoozed";
    message.snoozed_until = input.value || plusMinutes(now(state).getTime(), 30);
  } else if (input.action === "unsnooze") {
    message.status = "open";
    message.snoozed_until = null;
  } else if (input.action === "mark_requires_reply") {
    message.requires_reply = true;
    message.status = "open";
  } else if (input.action === "add_note" && input.note) {
    message.notes.unshift(input.note);
  } else if (input.action === "create_payable") {
    createPayableFromMessage(state, {
      actor_user_id: input.actor_user_id ?? null,
      message_id: message.id,
      approval_required: true,
    });
  }

  addAudit(state, {
    actor_user_id: input.actor_user_id ?? OWNER_ID,
    action: `message.${input.action}`,
    entity_type: "message",
    entity_id: message.id,
    before_state: before as unknown as Record<string, unknown>,
    after_state: clone(message) as unknown as Record<string, unknown>,
  });
  return clone(message);
}

export function payableAction(
  payableId: string,
  input: {
    env_id?: string;
    actor_user_id?: string | null;
    action: "approve" | "decline" | "mark_paid" | "needs_review" | "add_note";
    note?: string;
  }
) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const payable = state.payables.find((row) => row.id === payableId);
  if (!payable) return null;
  const before = clone(payable);

  if (input.action === "approve") {
    payable.status = "approved";
    payable.approval_note = input.note || "Approved in ECC.";
  } else if (input.action === "decline") {
    payable.status = "declined";
    payable.approval_note = input.note || "Declined in ECC.";
  } else if (input.action === "mark_paid") {
    payable.status = "paid";
    payable.approval_note = input.note || "Marked paid.";
  } else if (input.action === "needs_review") {
    payable.status = "needs_review";
    payable.needs_review_reason = input.note || "Sent back for controller review.";
  } else if (input.action === "add_note" && input.note) {
    payable.approval_note = input.note;
  }

  const linkedTask = state.tasks.find((task) => task.linked_payable_ids.includes(payable.id));
  if (linkedTask && (input.action === "approve" || input.action === "decline" || input.action === "mark_paid")) {
    linkedTask.status = "done";
    addEvent(state, "TaskCompleted", {
      task_id: linkedTask.id,
      payable_id: payable.id,
    });
  }

  addAudit(state, {
    actor_user_id: input.actor_user_id ?? OWNER_ID,
    action: `payable.${input.action}`,
    entity_type: "payable",
    entity_id: payable.id,
    before_state: before as unknown as Record<string, unknown>,
    after_state: clone(payable) as unknown as Record<string, unknown>,
  });
  return clone(payable);
}

export function taskAction(
  taskId: string,
  input: {
    env_id?: string;
    actor_user_id?: string | null;
    action: "complete" | "reopen" | "change_due" | "add_note" | "delegate";
    due_by?: string;
    note?: string;
    to_user_id?: string;
  }
) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const task = state.tasks.find((row) => row.id === taskId);
  if (!task) return null;
  const before = clone(task);

  if (input.action === "complete") {
    task.status = "done";
    addEvent(state, "TaskCompleted", { task_id: task.id });
  } else if (input.action === "reopen") {
    task.status = "open";
  } else if (input.action === "change_due" && input.due_by) {
    task.due_by = input.due_by;
  } else if (input.action === "add_note" && input.note) {
    task.notes = task.notes ? `${task.notes}\n${input.note}` : input.note;
  } else if (input.action === "delegate" && input.to_user_id) {
    const user = state.users.find((row) => row.id === input.to_user_id);
    task.delegated_to_user_id = input.to_user_id;
    task.status = "delegated";
    state.delegations.unshift({
      id: seededUuid(6_500 + state.delegations.length + 1),
      env_id: state.env_id,
      from_user_id: input.actor_user_id ?? OWNER_ID,
      to_user_id: input.to_user_id,
      item_type: "task",
      item_id: task.id,
      status: "assigned",
      context_notes: input.note || `Delegated to ${user?.name || "team member"}.`,
      due_by: input.due_by || task.due_by,
      created_at: now(state).toISOString(),
    });
    addEvent(state, "TaskDelegated", {
      task_id: task.id,
      to_user_id: input.to_user_id,
    });
  }

  addAudit(state, {
    actor_user_id: input.actor_user_id ?? OWNER_ID,
    action: `task.${input.action}`,
    entity_type: "task",
    entity_id: task.id,
    before_state: before as unknown as Record<string, unknown>,
    after_state: clone(task) as unknown as Record<string, unknown>,
  });
  return clone(task);
}

export function delegateItem(input: {
  env_id?: string;
  actor_user_id?: string | null;
  item_type: "message" | "task" | "payable" | "event";
  item_id: string;
  to_user: string;
  due_by: string;
  context_note: string;
}) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const assignee =
    state.users.find((user) => user.id === input.to_user) ||
    getUserByName(state, input.to_user);
  if (!assignee) return null;
  const task = createOrResolveTaskForItem(state, input.item_type, input.item_id);
  if (!task) return null;
  const delegation: EccDelegation = {
    id: seededUuid(6_500 + state.delegations.length + 1),
    env_id: state.env_id,
    from_user_id: input.actor_user_id ?? OWNER_ID,
    to_user_id: assignee.id,
    item_type: input.item_type,
    item_id: input.item_id,
    status: "assigned",
    context_notes: input.context_note,
    due_by: input.due_by,
    created_at: now(state).toISOString(),
  };
  state.delegations.unshift(delegation);
  task.delegated_to_user_id = assignee.id;
  task.status = "delegated";
  task.due_by = input.due_by;
  task.notes = task.notes ? `${task.notes}\n${input.context_note}` : input.context_note;
  addEvent(state, "TaskDelegated", {
    task_id: task.id,
    delegation_id: delegation.id,
    to_user_id: assignee.id,
  });
  addAudit(state, {
    actor_user_id: input.actor_user_id ?? OWNER_ID,
    action: "delegation.created",
    entity_type: input.item_type,
    entity_id: input.item_id,
    after_state: {
      delegation_id: delegation.id,
      to_user_id: assignee.id,
      task_id: task.id,
    },
    source_refs: { task_id: task.id },
  });
  return {
    delegation: clone(delegation),
    task: clone(task),
  };
}

export function listVips(envId = MERIDIAN_APEX_ENV_ID) {
  const state = getEnvState(envId);
  return state.contacts
    .filter((contact) => contact.vip_tier > 0)
    .sort((a, b) => b.vip_tier - a.vip_tier || a.name.localeCompare(b.name))
    .map((contact) => clone(contact));
}

export function createVip(input: {
  env_id?: string;
  name: string;
  email?: string;
  phone?: string;
  vip_tier: number;
  sla_hours: number;
  tags?: string[];
}) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const contact: EccContact = {
    id: seededUuid(900 + state.contacts.length + 1),
    env_id: state.env_id,
    name: input.name,
    channels: {
      emails: input.email ? [input.email] : [],
      phones: input.phone ? [input.phone] : [],
      domains: input.email ? [input.email.split("@")[1]] : [],
    },
    vip_tier: input.vip_tier,
    sla_hours: input.sla_hours,
    tags: input.tags || [],
    created_at: now(state).toISOString(),
  };
  state.contacts.push(contact);
  addAudit(state, {
    actor_user_id: OWNER_ID,
    action: "vip.created",
    entity_type: "contact",
    entity_id: contact.id,
    after_state: clone(contact) as unknown as Record<string, unknown>,
  });
  return clone(contact);
}

export function updateVip(
  contactId: string,
  input: {
    env_id?: string;
    vip_tier?: number;
    sla_hours?: number;
    tags?: string[];
  }
) {
  const state = getEnvState(input.env_id || MERIDIAN_APEX_ENV_ID);
  const contact = state.contacts.find((row) => row.id === contactId);
  if (!contact) return null;
  const before = clone(contact);
  if (typeof input.vip_tier === "number") contact.vip_tier = input.vip_tier;
  if (typeof input.sla_hours === "number") contact.sla_hours = input.sla_hours;
  if (input.tags) contact.tags = [...input.tags];
  addAudit(state, {
    actor_user_id: OWNER_ID,
    action: "vip.updated",
    entity_type: "contact",
    entity_id: contact.id,
    before_state: before as unknown as Record<string, unknown>,
    after_state: clone(contact) as unknown as Record<string, unknown>,
  });
  return clone(contact);
}

export function deleteVip(contactId: string, envId = MERIDIAN_APEX_ENV_ID) {
  const state = getEnvState(envId);
  const index = state.contacts.findIndex((row) => row.id === contactId);
  if (index < 0) return null;
  const [removed] = state.contacts.splice(index, 1);
  addAudit(state, {
    actor_user_id: OWNER_ID,
    action: "vip.deleted",
    entity_type: "contact",
    entity_id: removed.id,
    before_state: removed as unknown as Record<string, unknown>,
  });
  return { ok: true, id: removed.id };
}

export function getTodayBrief(
  envId = MERIDIAN_APEX_ENV_ID,
  type: "am" | "pm" = "am"
): EccBriefResponse {
  const state = getEnvState(envId);
  const existing = state.briefs.find(
    (brief) => brief.date === dateOnly(now(state).toISOString()) && brief.type === type
  );
  const brief = existing || generateBrief(state, type);
  const queue = buildQueue(state);
  const openItems =
    queue.counts.red_alerts +
    queue.counts.vip +
    queue.counts.approvals +
    queue.counts.calendar +
    queue.counts.general;
  return {
    brief: clone(brief),
    outstanding_red_alerts: queue.counts.red_alerts,
    outstanding_open_items: openItems,
  };
}

export function generateTodayBrief(
  envId = MERIDIAN_APEX_ENV_ID,
  type: "am" | "pm" = "am"
) {
  const state = getEnvState(envId);
  const brief = generateBrief(state, type);
  return {
    brief: clone(brief),
    outstanding_red_alerts: buildQueue(state).counts.red_alerts,
    outstanding_open_items:
      buildQueue(state).counts.red_alerts +
      buildQueue(state).counts.vip +
      buildQueue(state).counts.approvals +
      buildQueue(state).counts.calendar +
      buildQueue(state).counts.general,
  };
}

export function getAuditSlice(envId = MERIDIAN_APEX_ENV_ID, limit = 20) {
  const state = getEnvState(envId);
  return state.audit_log.slice(0, limit).map((row) => clone(row));
}

export function getDelegations(envId = MERIDIAN_APEX_ENV_ID) {
  const state = getEnvState(envId);
  return state.delegations.map((row) => clone(row));
}
