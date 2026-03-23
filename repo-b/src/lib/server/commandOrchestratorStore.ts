import type {
  CommandAuditEvent,
  CommandAuditKind,
  CommandRun,
  ExecutionPlan,
  RunStatus,
  StepResult,
} from "@/lib/commandbar/types";

type StoredPlan = ExecutionPlan & {
  confirmToken?: string;
  confirmExpiresAt?: number;
  confirmUsed?: boolean;
  confirmedAt?: number;
};

type StoreShape = {
  plans: Map<string, StoredPlan>;
  runs: Map<string, CommandRun>;
  planByRun: Map<string, string>;
  auditsByPlan: Map<string, CommandAuditEvent[]>;
};

const STORE_KEY = "__bmCommandOrchestratorStore";
const TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_PLANS = 200;
const MAX_RUNS = 200;
const MAX_AUDIT_EVENTS_PER_PLAN = 400;

function nowMs() {
  return Date.now();
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getStore(): StoreShape {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: StoreShape };
  if (!root[STORE_KEY]) {
    root[STORE_KEY] = {
      plans: new Map<string, StoredPlan>(),
      runs: new Map<string, CommandRun>(),
      planByRun: new Map<string, string>(),
      auditsByPlan: new Map<string, CommandAuditEvent[]>(),
    };
  }
  return root[STORE_KEY]!;
}

function pruneStore() {
  const s = getStore();
  if (s.plans.size > MAX_PLANS) {
    const byAge = [...s.plans.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < s.plans.size - MAX_PLANS; i += 1) {
      const plan = byAge[i];
      s.plans.delete(plan.planId);
      s.auditsByPlan.delete(plan.planId);
    }
  }
  if (s.runs.size > MAX_RUNS) {
    const byAge = [...s.runs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < s.runs.size - MAX_RUNS; i += 1) {
      const run = byAge[i];
      s.runs.delete(run.runId);
      s.planByRun.delete(run.runId);
    }
  }
}

export function storePlan(plan: ExecutionPlan) {
  const s = getStore();
  s.plans.set(plan.planId, { ...plan, confirmUsed: false });
  pruneStore();
}

export function getPlan(planId: string): StoredPlan | null {
  const s = getStore();
  return s.plans.get(planId) || null;
}

export function updatePlan(planId: string, nextPlan: ExecutionPlan): StoredPlan | null {
  const s = getStore();
  const current = s.plans.get(planId);
  if (!current) return null;
  const updated: StoredPlan = {
    ...nextPlan,
    planId,
    confirmToken: undefined,
    confirmExpiresAt: undefined,
    confirmUsed: false,
    confirmedAt: undefined,
  };
  s.plans.set(planId, updated);
  return updated;
}

export function getPlanForRun(runId: string): StoredPlan | null {
  const s = getStore();
  const planId = s.planByRun.get(runId);
  if (!planId) return null;
  return getPlan(planId);
}

export function mintConfirmationToken(planId: string) {
  const s = getStore();
  const plan = s.plans.get(planId);
  if (!plan) return null;
  const token = randomId("confirm");
  const expiresAt = nowMs() + TOKEN_TTL_MS;
  plan.confirmToken = token;
  plan.confirmExpiresAt = expiresAt;
  plan.confirmUsed = false;
  s.plans.set(planId, plan);
  return { token, expiresAt };
}

export function verifyAndConsumeConfirmationToken(planId: string, token: string): {
  ok: boolean;
  error?: string;
} {
  const s = getStore();
  const plan = s.plans.get(planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  if (!plan.confirmToken || !plan.confirmExpiresAt) {
    return { ok: false, error: "Plan has not been confirmed." };
  }
  if (plan.confirmUsed) {
    return { ok: false, error: "Confirmation token already used." };
  }
  if (plan.confirmToken !== token) {
    return { ok: false, error: "Invalid confirmation token." };
  }
  if (plan.confirmExpiresAt < nowMs()) {
    return { ok: false, error: "Confirmation token expired." };
  }

  plan.confirmUsed = true;
  plan.confirmedAt = nowMs();
  s.plans.set(planId, plan);
  return { ok: true };
}

export function createRun(planId: string): CommandRun {
  const s = getStore();
  const runId = randomId("run");
  const run: CommandRun = {
    runId,
    planId,
    status: "pending",
    createdAt: nowMs(),
    cancelled: false,
    logs: [],
    stepResults: [],
    verification: [],
  };
  s.runs.set(runId, run);
  s.planByRun.set(runId, planId);
  pruneStore();
  return run;
}

export function getRun(runId: string): CommandRun | null {
  const s = getStore();
  return s.runs.get(runId) || null;
}

export function updateRun(runId: string, patch: Partial<CommandRun>) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  const next = { ...run, ...patch };
  s.runs.set(runId, next);
  return next;
}

export function appendRunLog(runId: string, message: string) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  run.logs.push(message);
  s.runs.set(runId, run);
  return run;
}

export function upsertStepResult(runId: string, step: StepResult) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  const idx = run.stepResults.findIndex((item) => item.stepId === step.stepId);
  if (idx >= 0) {
    run.stepResults[idx] = { ...run.stepResults[idx], ...step };
  } else {
    run.stepResults.push(step);
  }
  s.runs.set(runId, run);
  return run;
}

export function pushVerification(
  runId: string,
  verification: CommandRun["verification"][number]
) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  run.verification.push(verification);
  s.runs.set(runId, run);
  return run;
}

export function markRunStatus(runId: string, status: RunStatus) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  run.status = status;
  if (status === "running" && !run.startedAt) run.startedAt = nowMs();
  if (status === "completed" || status === "failed" || status === "cancelled") {
    run.endedAt = nowMs();
  }
  s.runs.set(runId, run);
  return run;
}

export function cancelRun(runId: string) {
  const s = getStore();
  const run = s.runs.get(runId);
  if (!run) return null;
  run.cancelled = true;
  run.status = "cancelled";
  run.endedAt = nowMs();
  s.runs.set(runId, run);
  return run;
}

export function isRunCancelled(runId: string): boolean {
  const run = getRun(runId);
  return Boolean(run?.cancelled);
}

export function appendAuditEvent(
  planId: string,
  kind: CommandAuditKind,
  details?: Record<string, unknown>,
  runId?: string
) {
  const s = getStore();
  const current = s.auditsByPlan.get(planId) || [];
  const event: CommandAuditEvent = {
    id: randomId("audit"),
    at: nowMs(),
    planId,
    runId,
    kind,
    details,
  };
  current.push(event);
  s.auditsByPlan.set(planId, current.slice(-MAX_AUDIT_EVENTS_PER_PLAN));
  return event;
}

export function listAuditEvents(planId: string): CommandAuditEvent[] {
  const s = getStore();
  return s.auditsByPlan.get(planId) || [];
}

export function listRecentRuns(limit = 8): Array<{
  runId: string;
  planId: string;
  status: RunStatus;
  createdAt: number;
}> {
  const s = getStore();
  return [...s.runs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, limit))
    .map((run) => ({
      runId: run.runId,
      planId: run.planId,
      status: run.status,
      createdAt: run.createdAt,
    }));
}
