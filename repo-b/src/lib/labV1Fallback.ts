type LabEnvironment = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string;
  schema_name: string;
  is_active: boolean;
  created_at: string;
};

type DocumentItem = {
  doc_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type QueueItem = {
  id: string;
  created_at: string;
  status: string;
  risk_level: string;
  requested_action: Record<string, unknown>;
};

type AuditItem = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
};

type PipelineStage = {
  stage_id: string;
  stage_key: string;
  stage_name: string;
  order_index: number;
  color_token: string | null;
  created_at: string;
  updated_at: string;
};

type PipelineCard = {
  card_id: string;
  stage_id: string;
  title: string;
  account_name: string | null;
  owner: string | null;
  value_cents: number | null;
  priority: "low" | "medium" | "high" | "critical";
  due_date: string | null;
  notes: string | null;
  rank: number;
  created_at: string;
  updated_at: string;
};

type FallbackState = {
  environments: Map<string, LabEnvironment>;
  documentsByEnv: Map<string, DocumentItem[]>;
  queueByEnv: Map<string, QueueItem[]>;
  auditByEnv: Map<string, AuditItem[]>;
  pipelineStagesByEnv: Map<string, PipelineStage[]>;
  pipelineCardsByEnv: Map<string, PipelineCard[]>;
};

declare global {
  // eslint-disable-next-line no-var
  var __labV1FallbackState: FallbackState | undefined;
}

const DEFAULT_ENVIRONMENTS: Array<{
  id: string;
  client_name: string;
  industry: string;
}> = [
  { id: "env_fallback_ops", client_name: "Fallback Ops", industry: "website" },
  { id: "env_fallback_health", client_name: "Fallback Health", industry: "healthcare" },
];

const DEFAULT_PIPELINE_STAGES: Record<string, Array<{ key: string; label: string; color: string }>> = {
  healthcare: [
    { key: "intake", label: "Intake", color: "slate" },
    { key: "eligibility", label: "Eligibility Verified", color: "blue" },
    { key: "treatment_plan", label: "Treatment Plan", color: "amber" },
    { key: "prior_auth", label: "Prior Auth", color: "purple" },
    { key: "scheduled", label: "Scheduled", color: "green" },
  ],
  legal: [
    { key: "new_matter", label: "New Matter", color: "slate" },
    { key: "conflicts", label: "Conflicts Check", color: "blue" },
    { key: "engagement", label: "Engagement Signed", color: "amber" },
    { key: "discovery", label: "Discovery", color: "purple" },
    { key: "retained", label: "Retained", color: "green" },
  ],
  construction: [
    { key: "lead", label: "Lead", color: "slate" },
    { key: "site_walk", label: "Site Walk", color: "blue" },
    { key: "estimate", label: "Estimate Sent", color: "amber" },
    { key: "contract", label: "Contract Review", color: "purple" },
    { key: "won", label: "Won", color: "green" },
  ],
  website: [
    { key: "inbound", label: "Inbound", color: "slate" },
    { key: "discovery", label: "Discovery", color: "blue" },
    { key: "proposal", label: "Proposal", color: "amber" },
    { key: "negotiation", label: "Negotiation", color: "purple" },
    { key: "closed_won", label: "Closed Won", color: "green" },
  ],
  general: [
    { key: "lead", label: "Lead", color: "slate" },
    { key: "qualified", label: "Qualified", color: "blue" },
    { key: "proposal", label: "Proposal", color: "amber" },
    { key: "negotiation", label: "Negotiation", color: "purple" },
    { key: "closed_won", label: "Closed Won", color: "green" },
  ],
};

function nowIso() {
  return new Date().toISOString();
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function compactId(prefix: string, key: string) {
  const value = hashString(`${prefix}:${key}:${Date.now()}:${Math.random()}`)
    .toString(16)
    .padStart(8, "0");
  return `${prefix}_${value}`;
}

function slugSchemaName(clientName: string) {
  const base = clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return `env_${base || "client"}`;
}

function state(): FallbackState {
  if (!globalThis.__labV1FallbackState) {
    globalThis.__labV1FallbackState = {
      environments: new Map<string, LabEnvironment>(),
      documentsByEnv: new Map<string, DocumentItem[]>(),
      queueByEnv: new Map<string, QueueItem[]>(),
      auditByEnv: new Map<string, AuditItem[]>(),
      pipelineStagesByEnv: new Map<string, PipelineStage[]>(),
      pipelineCardsByEnv: new Map<string, PipelineCard[]>(),
    };
  }
  if (!globalThis.__labV1FallbackState.pipelineStagesByEnv) {
    globalThis.__labV1FallbackState.pipelineStagesByEnv = new Map<string, PipelineStage[]>();
  }
  if (!globalThis.__labV1FallbackState.pipelineCardsByEnv) {
    globalThis.__labV1FallbackState.pipelineCardsByEnv = new Map<string, PipelineCard[]>();
  }
  return globalThis.__labV1FallbackState;
}

function seedDocuments(envId: string) {
  const seed = hashString(envId);
  const ts = nowIso();
  return [
    {
      doc_id: compactId("doc", `${envId}:policy`),
      filename: `policy_${seed % 7}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 45_000 + (seed % 5_000),
      created_at: ts,
    },
    {
      doc_id: compactId("doc", `${envId}:runbook`),
      filename: `runbook_${(seed % 9) + 1}.md`,
      mime_type: "text/markdown",
      size_bytes: 6_000 + (seed % 2_000),
      created_at: ts,
    },
  ];
}

function seedQueue(envId: string): QueueItem[] {
  const seed = hashString(envId);
  return [
    {
      id: compactId("q", `${envId}:1`),
      created_at: nowIso(),
      status: "pending",
      risk_level: seed % 2 === 0 ? "high" : "medium",
      requested_action: {
        type: "ticket.create",
        summary: "Escalate intake exception",
        owner: "ops-manager",
      },
    },
    {
      id: compactId("q", `${envId}:2`),
      created_at: nowIso(),
      status: "pending",
      risk_level: "medium",
      requested_action: {
        type: "invoice.approve",
        summary: "Approve invoice over threshold",
        owner: "finance-lead",
      },
    },
  ];
}

function seedAudit(envId: string): AuditItem[] {
  return [
    {
      id: compactId("aud", `${envId}:boot`),
      at: nowIso(),
      actor: "system",
      action: "environment.seeded",
      entity_type: "environment",
      entity_id: envId,
      details: { source: "fallback" },
    },
  ];
}

function seedPipelineStages(envId: string, industryType: string): PipelineStage[] {
  const template = DEFAULT_PIPELINE_STAGES[industryType] || DEFAULT_PIPELINE_STAGES.general;
  const now = nowIso();
  return template.map((stage, index) => ({
    stage_id: compactId("stage", `${envId}:${stage.key}`),
    stage_key: stage.key,
    stage_name: stage.label,
    order_index: (index + 1) * 10,
    color_token: stage.color,
    created_at: now,
    updated_at: now,
  }));
}

function seedPipelineCards(envId: string, stages: PipelineStage[]): PipelineCard[] {
  const firstStage = stages[0];
  const secondStage = stages[1] || firstStage;
  const now = nowIso();
  return [
    {
      card_id: compactId("card", `${envId}:alpha`),
      stage_id: firstStage.stage_id,
      title: "New inbound opportunity",
      account_name: "Northwind Health",
      owner: "ops-lead",
      value_cents: 180000,
      priority: "medium",
      due_date: null,
      notes: null,
      rank: 10,
      created_at: now,
      updated_at: now,
    },
    {
      card_id: compactId("card", `${envId}:beta`),
      stage_id: secondStage.stage_id,
      title: "Expansion retainer",
      account_name: "Apex Advisory",
      owner: "client-partner",
      value_cents: 325000,
      priority: "high",
      due_date: null,
      notes: null,
      rank: 20,
      created_at: now,
      updated_at: now,
    },
  ];
}

function ensureEnvironment(envId: string) {
  const s = state();
  if (!s.environments.has(envId)) {
    const env: LabEnvironment = {
      env_id: envId,
      client_name: "General Client",
      industry: "website",
      industry_type: "website",
      schema_name: slugSchemaName("General Client"),
      is_active: true,
      created_at: nowIso(),
    };
    s.environments.set(envId, env);
  }
  if (!s.documentsByEnv.has(envId)) {
    s.documentsByEnv.set(envId, seedDocuments(envId));
  }
  if (!s.queueByEnv.has(envId)) {
    s.queueByEnv.set(envId, seedQueue(envId));
  }
  if (!s.auditByEnv.has(envId)) {
    s.auditByEnv.set(envId, seedAudit(envId));
  }
  if (!s.pipelineStagesByEnv.has(envId)) {
    const env = s.environments.get(envId);
    const stages = seedPipelineStages(envId, env?.industry_type || env?.industry || "general");
    s.pipelineStagesByEnv.set(envId, stages);
    s.pipelineCardsByEnv.set(envId, seedPipelineCards(envId, stages));
  }
  if (!s.pipelineCardsByEnv.has(envId)) {
    s.pipelineCardsByEnv.set(envId, []);
  }
}

function ensureSeededDefaults() {
  const s = state();
  if (s.environments.size > 0) return;
  for (const env of DEFAULT_ENVIRONMENTS) {
    const row: LabEnvironment = {
      env_id: env.id,
      client_name: env.client_name,
      industry: env.industry,
      industry_type: env.industry,
      schema_name: slugSchemaName(env.client_name),
      is_active: true,
      created_at: nowIso(),
    };
    s.environments.set(row.env_id, row);
    s.documentsByEnv.set(row.env_id, seedDocuments(row.env_id));
    s.queueByEnv.set(row.env_id, seedQueue(row.env_id));
    s.auditByEnv.set(row.env_id, seedAudit(row.env_id));
    const stages = seedPipelineStages(row.env_id, row.industry_type);
    s.pipelineStagesByEnv.set(row.env_id, stages);
    s.pipelineCardsByEnv.set(row.env_id, seedPipelineCards(row.env_id, stages));
  }
}

function pushAudit(envId: string, item: Omit<AuditItem, "id" | "at">) {
  ensureEnvironment(envId);
  const s = state();
  const rows = s.auditByEnv.get(envId) || [];
  rows.unshift({
    id: compactId("aud", `${envId}:${item.action}`),
    at: nowIso(),
    ...item,
  });
  s.auditByEnv.set(envId, rows.slice(0, 100));
}

export function listFallbackEnvironments() {
  ensureSeededDefaults();
  return Array.from(state().environments.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export function createFallbackEnvironment(input: {
  client_name: string;
  industry?: string;
  industry_type?: string;
}) {
  ensureSeededDefaults();
  const industryType = input.industry_type || input.industry || "general";
  const row: LabEnvironment = {
    env_id: compactId("env", input.client_name),
    client_name: input.client_name,
    industry: input.industry || industryType,
    industry_type: industryType,
    schema_name: slugSchemaName(input.client_name),
    is_active: true,
    created_at: nowIso(),
  };
  const s = state();
  s.environments.set(row.env_id, row);
  s.documentsByEnv.set(row.env_id, seedDocuments(row.env_id));
  s.queueByEnv.set(row.env_id, seedQueue(row.env_id));
  s.auditByEnv.set(row.env_id, seedAudit(row.env_id));
  const stages = seedPipelineStages(row.env_id, row.industry_type);
  s.pipelineStagesByEnv.set(row.env_id, stages);
  s.pipelineCardsByEnv.set(row.env_id, seedPipelineCards(row.env_id, stages));
  pushAudit(row.env_id, {
    actor: "system",
    action: "environment.created",
    entity_type: "environment",
    entity_id: row.env_id,
    details: { fallback: true, industry: row.industry, industry_type: row.industry_type },
  });
  return row;
}

export function listFallbackDocuments(envId: string) {
  ensureEnvironment(envId);
  return state().documentsByEnv.get(envId) || [];
}

export function createFallbackDocument(envId: string, file: {
  filename: string;
  mime_type: string;
  size_bytes: number;
}) {
  ensureEnvironment(envId);
  const doc: DocumentItem = {
    doc_id: compactId("doc", `${envId}:${file.filename}`),
    filename: file.filename,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    created_at: nowIso(),
  };
  const s = state();
  const docs = s.documentsByEnv.get(envId) || [];
  docs.unshift(doc);
  s.documentsByEnv.set(envId, docs.slice(0, 100));
  pushAudit(envId, {
    actor: "demo-user",
    action: "document.uploaded",
    entity_type: "document",
    entity_id: doc.doc_id,
    details: { filename: file.filename, size_bytes: file.size_bytes },
  });
  return doc;
}

export function listFallbackQueue(envId: string) {
  ensureEnvironment(envId);
  return state().queueByEnv.get(envId) || [];
}

export function recordFallbackQueueDecision(
  queueId: string,
  decision: "approve" | "deny"
) {
  ensureSeededDefaults();
  const s = state();
  for (const [envId, items] of s.queueByEnv.entries()) {
    const next = items.map((item) =>
      item.id === queueId
        ? { ...item, status: decision === "approve" ? "approved" : "denied" }
        : item
    );
    const updated = next.find((item) => item.id === queueId);
    if (!updated) continue;
    s.queueByEnv.set(envId, next);
    pushAudit(envId, {
      actor: "demo-approver",
      action: "queue.decision",
      entity_type: "queue_item",
      entity_id: queueId,
      details: { decision },
    });
    return updated;
  }
  return null;
}

export function listFallbackAudit(envId: string) {
  ensureEnvironment(envId);
  return state().auditByEnv.get(envId) || [];
}

export function listFallbackPipeline(envId: string) {
  ensureEnvironment(envId);
  const s = state();
  const env = s.environments.get(envId);
  return {
    env_id: envId,
    client_name: env?.client_name || "Client",
    industry: env?.industry || "general",
    industry_type: env?.industry_type || env?.industry || "general",
    stages: [...(s.pipelineStagesByEnv.get(envId) || [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
    cards: [...(s.pipelineCardsByEnv.get(envId) || [])].sort(
      (a, b) => a.rank - b.rank
    ),
  };
}

export function createFallbackPipelineStage(input: {
  env_id: string;
  stage_name: string;
  color_token?: string | null;
  order_index?: number;
}) {
  ensureEnvironment(input.env_id);
  const s = state();
  const stages = s.pipelineStagesByEnv.get(input.env_id) || [];
  const stageKeyBase = input.stage_name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "stage";
  let stageKey = stageKeyBase;
  let counter = 2;
  const existingKeys = new Set(stages.map((stage) => stage.stage_key));
  while (existingKeys.has(stageKey)) {
    stageKey = `${stageKeyBase}_${counter}`;
    counter += 1;
  }
  const orderIndex =
    typeof input.order_index === "number"
      ? input.order_index
      : (stages[stages.length - 1]?.order_index || 0) + 10;
  const now = nowIso();
  const stage: PipelineStage = {
    stage_id: compactId("stage", `${input.env_id}:${stageKey}`),
    stage_key: stageKey,
    stage_name: input.stage_name,
    order_index: orderIndex,
    color_token: input.color_token || "slate",
    created_at: now,
    updated_at: now,
  };
  s.pipelineStagesByEnv.set(input.env_id, [...stages, stage]);
  pushAudit(input.env_id, {
    actor: "demo-user",
    action: "pipeline.stage.created",
    entity_type: "pipeline_stage",
    entity_id: stage.stage_id,
    details: { stage_name: stage.stage_name },
  });
  return stage;
}

export function updateFallbackPipelineStage(
  stageId: string,
  patch: Partial<{ stage_name: string; order_index: number; color_token: string | null }>
) {
  ensureSeededDefaults();
  const s = state();
  for (const [envId, stages] of s.pipelineStagesByEnv.entries()) {
    const stage = stages.find((item) => item.stage_id === stageId);
    if (!stage) continue;
    const updated: PipelineStage = {
      ...stage,
      stage_name: patch.stage_name ?? stage.stage_name,
      order_index:
        typeof patch.order_index === "number" ? patch.order_index : stage.order_index,
      color_token: patch.color_token === undefined ? stage.color_token : patch.color_token,
      updated_at: nowIso(),
    };
    s.pipelineStagesByEnv.set(
      envId,
      stages.map((item) => (item.stage_id === stageId ? updated : item))
    );
    pushAudit(envId, {
      actor: "demo-user",
      action: "pipeline.stage.updated",
      entity_type: "pipeline_stage",
      entity_id: stageId,
      details: { changed_fields: Object.keys(patch) },
    });
    return updated;
  }
  return null;
}

export function deleteFallbackPipelineStage(stageId: string) {
  ensureSeededDefaults();
  const s = state();
  for (const [envId, stages] of s.pipelineStagesByEnv.entries()) {
    const target = stages.find((item) => item.stage_id === stageId);
    if (!target) continue;
    const remaining = stages.filter((item) => item.stage_id !== stageId);
    if (!remaining.length) {
      return null;
    }
    const fallbackStage = [...remaining].sort((a, b) => a.order_index - b.order_index)[0];
    const cards = s.pipelineCardsByEnv.get(envId) || [];
    const movedCount = cards.filter((card) => card.stage_id === stageId).length;
    const moved = cards.map((card) =>
      card.stage_id === stageId
        ? { ...card, stage_id: fallbackStage.stage_id, updated_at: nowIso() }
        : card
    );
    s.pipelineStagesByEnv.set(envId, remaining);
    s.pipelineCardsByEnv.set(envId, moved);
    pushAudit(envId, {
      actor: "demo-user",
      action: "pipeline.stage.deleted",
      entity_type: "pipeline_stage",
      entity_id: stageId,
      details: { moved_to: fallbackStage.stage_id },
    });
    return {
      ok: true,
      moved_cards: movedCount,
      target_stage_id: fallbackStage.stage_id,
    };
  }
  return null;
}

export function createFallbackPipelineCard(input: {
  env_id: string;
  stage_id?: string | null;
  title: string;
  account_name?: string | null;
  owner?: string | null;
  value_cents?: number | null;
  priority?: "low" | "medium" | "high" | "critical";
  due_date?: string | null;
  notes?: string | null;
  rank?: number | null;
}) {
  ensureEnvironment(input.env_id);
  const s = state();
  const stages = s.pipelineStagesByEnv.get(input.env_id) || [];
  const stage = stages.find((item) => item.stage_id === input.stage_id) || stages[0];
  if (!stage) return null;
  const cards = s.pipelineCardsByEnv.get(input.env_id) || [];
  const maxRank = cards
    .filter((item) => item.stage_id === stage.stage_id)
    .reduce((acc, item) => Math.max(acc, item.rank), 0);
  const now = nowIso();
  const card: PipelineCard = {
    card_id: compactId("card", `${input.env_id}:${input.title}`),
    stage_id: stage.stage_id,
    title: input.title,
    account_name: input.account_name || null,
    owner: input.owner || null,
    value_cents: typeof input.value_cents === "number" ? input.value_cents : null,
    priority: input.priority || "medium",
    due_date: input.due_date || null,
    notes: input.notes || null,
    rank: typeof input.rank === "number" ? input.rank : maxRank + 10,
    created_at: now,
    updated_at: now,
  };
  s.pipelineCardsByEnv.set(input.env_id, [...cards, card]);
  pushAudit(input.env_id, {
    actor: "demo-user",
    action: "pipeline.card.created",
    entity_type: "pipeline_card",
    entity_id: card.card_id,
    details: { stage_id: card.stage_id, title: card.title },
  });
  return card;
}

export function updateFallbackPipelineCard(
  cardId: string,
  patch: Partial<{
    stage_id: string;
    title: string;
    account_name: string | null;
    owner: string | null;
    value_cents: number | null;
    priority: "low" | "medium" | "high" | "critical";
    due_date: string | null;
    notes: string | null;
    rank: number;
  }>
) {
  ensureSeededDefaults();
  const s = state();
  for (const [envId, cards] of s.pipelineCardsByEnv.entries()) {
    const current = cards.find((item) => item.card_id === cardId);
    if (!current) continue;
    const updated: PipelineCard = {
      ...current,
      stage_id: patch.stage_id ?? current.stage_id,
      title: patch.title ?? current.title,
      account_name: patch.account_name === undefined ? current.account_name : patch.account_name,
      owner: patch.owner === undefined ? current.owner : patch.owner,
      value_cents: patch.value_cents === undefined ? current.value_cents : patch.value_cents,
      priority: patch.priority ?? current.priority,
      due_date: patch.due_date === undefined ? current.due_date : patch.due_date,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      rank: typeof patch.rank === "number" ? patch.rank : current.rank,
      updated_at: nowIso(),
    };
    s.pipelineCardsByEnv.set(
      envId,
      cards.map((item) => (item.card_id === cardId ? updated : item))
    );
    pushAudit(envId, {
      actor: "demo-user",
      action: "pipeline.card.updated",
      entity_type: "pipeline_card",
      entity_id: cardId,
      details: { changed_fields: Object.keys(patch) },
    });
    return updated;
  }
  return null;
}

export function deleteFallbackPipelineCard(cardId: string) {
  ensureSeededDefaults();
  const s = state();
  for (const [envId, cards] of s.pipelineCardsByEnv.entries()) {
    const current = cards.find((item) => item.card_id === cardId);
    if (!current) continue;
    s.pipelineCardsByEnv.set(
      envId,
      cards.filter((item) => item.card_id !== cardId)
    );
    pushAudit(envId, {
      actor: "demo-user",
      action: "pipeline.card.deleted",
      entity_type: "pipeline_card",
      entity_id: cardId,
      details: { title: current.title },
    });
    return { ok: true };
  }
  return null;
}

export function buildFallbackMetrics(envId: string) {
  ensureEnvironment(envId);
  const docs = listFallbackDocuments(envId);
  const queue = listFallbackQueue(envId);
  const seed = hashString(envId);
  const approved = queue.filter((item) => item.status === "approved").length;
  const denied = queue.filter((item) => item.status === "denied").length;
  const pending = queue.filter((item) => item.status === "pending").length;
  const decisions = approved + denied;
  const approvalRate = decisions > 0 ? approved / decisions : 0.75;
  const overrideRate = decisions > 0 ? denied / decisions : 0.12;
  return {
    uploads_count: docs.length,
    tickets_count: queue.length + (seed % 6),
    pending_approvals: pending,
    approval_rate: Number(approvalRate.toFixed(2)),
    override_rate: Number(overrideRate.toFixed(2)),
    avg_time_to_decision_sec: 40 + (seed % 120),
  };
}

export function resetFallbackEnvironment(envId: string) {
  ensureEnvironment(envId);
  const s = state();
  const env = s.environments.get(envId);
  const stages = seedPipelineStages(envId, env?.industry_type || env?.industry || "general");
  s.documentsByEnv.set(envId, seedDocuments(envId));
  s.queueByEnv.set(envId, seedQueue(envId));
  s.auditByEnv.set(envId, seedAudit(envId));
  s.pipelineStagesByEnv.set(envId, stages);
  s.pipelineCardsByEnv.set(envId, seedPipelineCards(envId, stages));
  pushAudit(envId, {
    actor: "demo-user",
    action: "environment.reset",
    entity_type: "environment",
    entity_id: envId,
    details: { fallback: true },
  });
}

export function buildFallbackChatResponse(input: {
  envId: string;
  message: string;
}) {
  ensureEnvironment(input.envId);
  const docs = listFallbackDocuments(input.envId);
  const citations = docs.slice(0, 2).map((doc, index) => ({
    doc_id: doc.doc_id,
    filename: doc.filename,
    chunk_id: `chunk_${index + 1}`,
    snippet: `Reference from ${doc.filename} for "${input.message.slice(0, 42)}"`,
  }));
  const suggested_actions =
    /ticket|approve|risk|queue/i.test(input.message)
      ? [
          {
            type: "queue.review",
            summary: "Review queued approval generated from fallback assistant",
          },
        ]
      : [];
  pushAudit(input.envId, {
    actor: "assistant",
    action: "chat.responded",
    entity_type: "chat",
    entity_id: compactId("chat", input.envId),
    details: { message: input.message.slice(0, 120) },
  });
  return {
    answer: `Fallback assistant response for environment ${input.envId.slice(
      0,
      8
    )}: ${input.message}`,
    citations,
    suggested_actions,
  };
}
