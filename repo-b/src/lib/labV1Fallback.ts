type LabEnvironment = {
  env_id: string;
  client_name: string;
  industry: string;
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

type FallbackState = {
  environments: Map<string, LabEnvironment>;
  documentsByEnv: Map<string, DocumentItem[]>;
  queueByEnv: Map<string, QueueItem[]>;
  auditByEnv: Map<string, AuditItem[]>;
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
    };
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

function ensureEnvironment(envId: string) {
  const s = state();
  if (!s.environments.has(envId)) {
    const env: LabEnvironment = {
      env_id: envId,
      client_name: "General Client",
      industry: "website",
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
}

function ensureSeededDefaults() {
  const s = state();
  if (s.environments.size > 0) return;
  for (const env of DEFAULT_ENVIRONMENTS) {
    const row: LabEnvironment = {
      env_id: env.id,
      client_name: env.client_name,
      industry: env.industry,
      schema_name: slugSchemaName(env.client_name),
      is_active: true,
      created_at: nowIso(),
    };
    s.environments.set(row.env_id, row);
    s.documentsByEnv.set(row.env_id, seedDocuments(row.env_id));
    s.queueByEnv.set(row.env_id, seedQueue(row.env_id));
    s.auditByEnv.set(row.env_id, seedAudit(row.env_id));
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
}) {
  ensureSeededDefaults();
  const row: LabEnvironment = {
    env_id: compactId("env", input.client_name),
    client_name: input.client_name,
    industry: input.industry || "general",
    schema_name: slugSchemaName(input.client_name),
    is_active: true,
    created_at: nowIso(),
  };
  const s = state();
  s.environments.set(row.env_id, row);
  s.documentsByEnv.set(row.env_id, seedDocuments(row.env_id));
  s.queueByEnv.set(row.env_id, seedQueue(row.env_id));
  s.auditByEnv.set(row.env_id, seedAudit(row.env_id));
  pushAudit(row.env_id, {
    actor: "system",
    action: "environment.created",
    entity_type: "environment",
    entity_id: row.env_id,
    details: { fallback: true, industry: row.industry },
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
  s.documentsByEnv.set(envId, seedDocuments(envId));
  s.queueByEnv.set(envId, seedQueue(envId));
  s.auditByEnv.set(envId, seedAudit(envId));
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
