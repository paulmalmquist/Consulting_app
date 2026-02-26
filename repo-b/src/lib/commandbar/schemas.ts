import { z } from "zod";
import type { ExecutionPlan, RunStatus } from "@/lib/commandbar/types";

export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const planStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  mutation: z.boolean(),
  preconditions: z.array(z.string()).optional(),
  expectedResult: z.string().optional(),
  rollback: z.string().nullable().optional(),
  resource: z.string().optional(),
});

const commandIntentSchema = z.object({
  rawMessage: z.string(),
  domain: z.enum(["lab", "bos", "tasks", "system", "unknown"]),
  resource: z.string(),
  action: z.enum(["list", "create", "update", "delete", "health", "discover"]),
  parameters: z.record(z.unknown()),
  confidence: z.number(),
  readOnly: z.boolean(),
});

const commandContextSchema = z.object({
  currentEnvId: z.string().nullable().optional(),
  currentBusinessId: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  selection: z.string().nullable().optional(),
});

const clarificationSchema = z
  .object({
    needed: z.boolean(),
    kind: z.enum(["needs_clarification", "missing_capability"]).optional(),
    reason: z.string().nullable().optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  })
  .optional();

const executionPlanSchema = z.object({
  planId: z.string().min(1),
  intentSummary: z.string().min(1),
  intent: commandIntentSchema,
  operationName: z.string().optional(),
  operationParams: z.record(z.unknown()).optional(),
  steps: z.array(planStepSchema),
  impactedEntities: z.array(z.string()),
  mutations: z.array(z.string()),
  risk: riskLevelSchema,
  readOnly: z.boolean(),
  requiresConfirmation: z.boolean(),
  requiresDoubleConfirmation: z.boolean(),
  doubleConfirmationPhrase: z.string().nullable().optional(),
  target: z
    .object({
      envId: z.string().nullable().optional(),
      envName: z.string().nullable().optional(),
      businessId: z.string().nullable().optional(),
    })
    .optional(),
  clarification: clarificationSchema,
  context: commandContextSchema,
  createdAt: z.number(),
});

const previewDiffRowSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  change: z.enum(["add", "remove", "update", "none"]),
});

const planResponseSchema = z.object({
  plan_id: z.string().min(1),
  plan: executionPlanSchema,
  risk: riskLevelSchema,
  mutations: z.array(z.string()),
  requires_confirmation: z.boolean(),
  requires_double_confirmation: z.boolean(),
  double_confirmation_phrase: z.string().nullable().optional(),
});

const confirmResponseSchema = z.object({
  confirm_token: z.string().min(1),
  expires_at: z.string().min(1),
  plan: executionPlanSchema.optional(),
});

const executeResponseSchema = z.object({
  run_id: z.string().min(1),
  status: z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "needs_clarification",
    "blocked",
  ]),
});

const verificationResultSchema = z.object({
  stepId: z.string(),
  ok: z.boolean(),
  summary: z.string(),
  details: z.record(z.unknown()).optional(),
  links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
});

const stepResultSchema = z.object({
  stepId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "skipped"]),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  details: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  verification: verificationResultSchema.optional(),
});

const runSchema = z.object({
  runId: z.string(),
  planId: z.string(),
  status: z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "needs_clarification",
    "blocked",
  ]),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  cancelled: z.boolean(),
  logs: z.array(z.string()),
  stepResults: z.array(stepResultSchema),
  verification: z.array(verificationResultSchema),
});

const runStatusResponseSchema = z.object({
  run: runSchema,
  plan: z
    .object({
      plan_id: z.string(),
      risk: riskLevelSchema,
      read_only: z.boolean(),
      intent_summary: z.string(),
      impacted_entities: z.array(z.string()),
      mutations: z.array(z.string()),
      target: z
        .object({
          envId: z.string().nullable().optional(),
          envName: z.string().nullable().optional(),
          businessId: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      clarification: clarificationSchema.nullable().optional(),
      requires_double_confirmation: z.boolean(),
      double_confirmation_phrase: z.string().nullable(),
    })
    .nullable(),
  audit_events: z.array(
    z.object({
      id: z.string(),
      at: z.number(),
      planId: z.string(),
      runId: z.string().optional(),
      kind: z.enum([
        "plan.created",
        "plan.confirmed",
        "step.started",
        "step.completed",
        "step.failed",
        "run.completed",
        "run.failed",
        "run.cancelled",
      ]),
      details: z.record(z.unknown()).optional(),
    })
  ),
});

export const contextSnapshotSchema = z.object({
  route: z.string().nullable(),
  environments: z.array(
    z.object({
      env_id: z.string(),
      client_name: z.string(),
      industry: z.string().optional(),
      industry_type: z.string().optional(),
    })
  ),
  selectedEnv: z
    .object({
      env_id: z.string(),
      client_name: z.string(),
      industry: z.string().optional(),
      industry_type: z.string().optional(),
    })
    .nullable(),
  business: z
    .object({
      business_id: z.string(),
      name: z.string().optional(),
      slug: z.string().optional(),
    })
    .nullable(),
  modulesAvailable: z.array(z.string()),
  recentRuns: z.array(
    z.object({
      runId: z.string(),
      planId: z.string(),
      status: z.enum([
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "needs_clarification",
        "blocked",
      ]),
      createdAt: z.number(),
    })
  ),
});

export const codexHealthSchema = z.object({
  ok: z.boolean(),
  mode: z.string().optional(),
  message: z.string().optional(),
});

export class ContractValidationError extends Error {
  endpoint: string;
  payload: unknown;
  issues: string;

  constructor(endpoint: string, payload: unknown, issues: string) {
    super(`Response validation failed for ${endpoint}: ${issues}`);
    this.name = "ContractValidationError";
    this.endpoint = endpoint;
    this.payload = payload;
    this.issues = issues;
  }
}

export type PreviewDiffRow = z.infer<typeof previewDiffRowSchema>;

export type AssistantPlan = ExecutionPlan & {
  riskLevel: z.infer<typeof riskLevelSchema>;
  affectedEntities: string[];
  previewDiff: PreviewDiffRow[];
};

function inferDiffRows(plan: ExecutionPlan): PreviewDiffRow[] {
  const params = plan.operationParams || {};
  const rows: PreviewDiffRow[] = [];

  Object.entries(params).forEach(([field, value]) => {
    if (value == null || value === "") return;
    rows.push({
      field,
      before: null,
      after: String(value),
      change: "update",
    });
  });

  if (rows.length > 0) return previewDiffRowSchema.array().parse(rows);

  return plan.mutations.map((mutation) => ({
    field: mutation,
    before: null,
    after: mutation,
    change: "update" as const,
  }));
}

export function parsePlanResponse(endpoint: string, payload: unknown): {
  planId: string;
  plan: AssistantPlan;
} {
  const parsed = planResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractValidationError(endpoint, payload, parsed.error.message);
  }

  const plan = parsed.data.plan;
  return {
    planId: parsed.data.plan_id,
    plan: {
      ...plan,
      riskLevel: plan.risk,
      affectedEntities: plan.impactedEntities,
      previewDiff: inferDiffRows(plan),
    },
  };
}

export function parseConfirmResponse(endpoint: string, payload: unknown): {
  confirmToken: string;
  expiresAt: string;
  plan?: AssistantPlan;
} {
  const parsed = confirmResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractValidationError(endpoint, payload, parsed.error.message);
  }

  return {
    confirmToken: parsed.data.confirm_token,
    expiresAt: parsed.data.expires_at,
    plan: parsed.data.plan
      ? {
          ...parsed.data.plan,
          riskLevel: parsed.data.plan.risk,
          affectedEntities: parsed.data.plan.impactedEntities,
          previewDiff: inferDiffRows(parsed.data.plan),
        }
      : undefined,
  };
}

export function parseExecuteResponse(endpoint: string, payload: unknown): {
  runId: string;
  status: RunStatus;
} {
  const parsed = executeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractValidationError(endpoint, payload, parsed.error.message);
  }

  return {
    runId: parsed.data.run_id,
    status: parsed.data.status,
  };
}

export function parseRunStatusResponse(endpoint: string, payload: unknown) {
  const parsed = runStatusResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractValidationError(endpoint, payload, parsed.error.message);
  }
  return parsed.data;
}
