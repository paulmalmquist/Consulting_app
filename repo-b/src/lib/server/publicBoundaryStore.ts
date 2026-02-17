import type {
  PublicLeadCreateRequest,
  PublicLeadCreateResponse,
} from "@/lib/public-assistant/types";

type PublicLeadRecord = PublicLeadCreateResponse & {
  company_name: string;
  email: string;
  industry: string | null;
  team_size: string | null;
  source: string;
};

type PublicBoundaryAuditEvent = {
  event_id: string;
  at: string;
  event_type: "public.onboarding_lead.created" | "public.assistant.asked";
  details: Record<string, unknown>;
};

type StoreShape = {
  leads: PublicLeadRecord[];
  audit: PublicBoundaryAuditEvent[];
};

const STORE_KEY = "__bmPublicBoundaryStore";
const MAX_LEADS = 2000;
const MAX_AUDIT = 5000;

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getStore(): StoreShape {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: StoreShape };
  if (!root[STORE_KEY]) {
    root[STORE_KEY] = {
      leads: [],
      audit: [],
    };
  }
  return root[STORE_KEY]!;
}

function pushAudit(event_type: PublicBoundaryAuditEvent["event_type"], details: Record<string, unknown>) {
  const store = getStore();
  store.audit.push({
    event_id: randomId("pub_audit"),
    at: nowIso(),
    event_type,
    details,
  });
  if (store.audit.length > MAX_AUDIT) {
    store.audit = store.audit.slice(-MAX_AUDIT);
  }
}

export function createPublicLead(input: PublicLeadCreateRequest): PublicLeadCreateResponse {
  const store = getStore();
  const created_at = nowIso();
  const lead: PublicLeadRecord = {
    lead_id: randomId("lead"),
    created_at,
    status: "captured",
    company_name: input.company_name,
    email: input.email,
    industry: input.industry || null,
    team_size: input.team_size || null,
    source: input.source || "public_onboarding",
  };
  store.leads.push(lead);
  if (store.leads.length > MAX_LEADS) {
    store.leads = store.leads.slice(-MAX_LEADS);
  }

  pushAudit("public.onboarding_lead.created", {
    lead_id: lead.lead_id,
    company_name: lead.company_name,
    industry: lead.industry,
    team_size: lead.team_size,
    source: lead.source,
  });

  return {
    lead_id: lead.lead_id,
    created_at: lead.created_at,
    status: lead.status,
  };
}

export function appendPublicAssistantAudit(details: Record<string, unknown>) {
  pushAudit("public.assistant.asked", details);
}
