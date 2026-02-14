import type {
  CommandContext,
  CommandIntent,
  ExecutionPlan,
  PlanResponse,
  PlanStep,
  RiskLevel,
  VerificationResult,
} from "@/lib/commandbar/types";
import {
  appendAuditEvent,
  appendRunLog,
  getPlan,
  isRunCancelled,
  markRunStatus,
  pushVerification,
  upsertStepResult,
} from "@/lib/server/commandOrchestratorStore";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

type PlanParameterOverrides = {
  envId?: string | null;
  businessId?: string | null;
  name?: string | null;
  industry?: string | null;
  notes?: string | null;
};

function nowMs() {
  return Date.now();
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function quotedString(input: string) {
  const match = input.match(/"([^"]+)"/);
  if (match?.[1]) return match[1].trim();
  const single = input.match(/'([^']+)'/);
  if (single?.[1]) return single[1].trim();
  return "";
}

function extractEnvironmentName(input: string): string {
  const quoted = quotedString(input);
  if (quoted) return quoted;
  const lower = input.toLowerCase();
  const match = lower.match(
    /\b(?:delete|remove)\s+(?:the\s+)?(.+?)\s+env(?:ironment)?s?\b/
  );
  if (!match?.[1]) return "";
  return match[1].trim().replace(/^(the)\s+/i, "");
}

function isHealthIntent(lower: string): boolean {
  if (/\b(delete|remove|create|add|update|rename|change|edit)\b/.test(lower)) {
    return false;
  }
  return (
    /\bhealth\s*checks?\b/.test(lower) ||
    /\bservice\s*health\b/.test(lower) ||
    /\bsystem\s*status\b/.test(lower) ||
    /^(health|status)$/.test(lower.trim())
  );
}

export function parseCommandIntent(message: string, context: CommandContext): CommandIntent {
  const rawMessage = message.trim();
  const lower = rawMessage.toLowerCase();
  const quoted = quotedString(rawMessage);
  const maybeId = rawMessage.match(UUID_RE)?.[0] || "";

  if (/\benv(?:ironment)?s?\b/.test(lower)) {
    if (/\b(delete|remove)\b/.test(lower)) {
      return {
        rawMessage,
        domain: "lab",
        resource: "environments",
        action: "delete",
        parameters: {
          envId: maybeId,
          envName: extractEnvironmentName(rawMessage),
        },
        confidence: 0.97,
        readOnly: false,
      };
    }
    if (/\b(update|rename|change|edit)\b/.test(lower)) {
      const renameTo = rawMessage.match(/\bto\s+(.+)$/i)?.[1]?.trim() || "";
      return {
        rawMessage,
        domain: "lab",
        resource: "environments",
        action: "update",
        parameters: {
          envId: maybeId || context.currentEnvId || "",
          name: quoted || renameTo,
        },
        confidence: 0.86,
        readOnly: false,
      };
    }
    if (/\b(create|new|add)\b/.test(lower)) {
      return {
        rawMessage,
        domain: "lab",
        resource: "environments",
        action: "create",
        parameters: {
          name: quoted || "",
          industry: /\bhealth\b/.test(lower)
            ? "healthcare"
            : /\blegal\b/.test(lower)
              ? "legal"
              : /\bconstruction\b/.test(lower)
                ? "construction"
                : "website",
        },
        confidence: 0.93,
        readOnly: false,
      };
    }
    if (/\b(list|show|name|all)\b/.test(lower)) {
      return {
        rawMessage,
        domain: "lab",
        resource: "environments",
        action: "list",
        parameters: {},
        confidence: 0.98,
        readOnly: true,
      };
    }
  }

  if (isHealthIntent(lower)) {
    return {
      rawMessage,
      domain: "system",
      resource: "health",
      action: "health",
      parameters: {},
      confidence: 0.92,
      readOnly: true,
    };
  }

  if (/\btemplate(s)?\b/.test(lower) && /\b(list|show|what|available)\b/.test(lower)) {
    return {
      rawMessage,
      domain: "bos",
      resource: "templates",
      action: "list",
      parameters: {},
      confidence: 0.9,
      readOnly: true,
    };
  }

  if (/\bdepartment(s)?\b/.test(lower) && /\b(list|show|what|available)\b/.test(lower)) {
    return {
      rawMessage,
      domain: "bos",
      resource: "departments",
      action: "list",
      parameters: {},
      confidence: 0.9,
      readOnly: true,
    };
  }

  if (/\bbusiness\b/.test(lower) && /\b(create|new|add)\b/.test(lower)) {
    return {
      rawMessage,
      domain: "bos",
      resource: "businesses",
      action: "create",
      parameters: {
        name: quoted || "",
      },
      confidence: 0.84,
      readOnly: false,
    };
  }

  return {
    rawMessage,
    domain: "unknown",
    resource: "discovery",
    action: "discover",
    parameters: {},
    confidence: 0.5,
    readOnly: true,
  };
}

export function classifyPlanRisk(steps: PlanStep[]): RiskLevel {
  const hasDelete = steps.some(
    (step) => step.mutation && /\bdelete|remove\b/i.test(`${step.title} ${step.description}`)
  );
  if (hasDelete) return "high";
  if (steps.some((step) => step.mutation)) return "medium";
  return "low";
}

function summarizeIntent(intent: CommandIntent): string {
  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "list") {
    return "List Demo Lab environments and return the current inventory.";
  }
  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "create"
  ) {
    return "Create a Demo Lab environment, then verify it appears in the environment list.";
  }
  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "update"
  ) {
    return "Update the selected Demo Lab environment metadata and verify the change.";
  }
  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "delete"
  ) {
    return "Delete the selected Demo Lab environment and verify it no longer appears.";
  }
  if (intent.domain === "bos" && intent.resource === "templates" && intent.action === "list") {
    return "List available Business OS templates.";
  }
  if (intent.domain === "bos" && intent.resource === "departments" && intent.action === "list") {
    return "List Business OS department catalog entries.";
  }
  if (intent.domain === "bos" && intent.resource === "businesses" && intent.action === "create") {
    return "Create a new Business OS business and verify returned identifiers.";
  }
  if (intent.domain === "system" && intent.action === "health") {
    return "Run read-only health checks for command and environment endpoints.";
  }
  return "Unable to map command to a direct mutation. Propose discovery steps first.";
}

function planSteps(intent: CommandIntent, context: CommandContext): PlanStep[] {
  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "list") {
    return [
      {
        id: "step_list_envs",
        title: "Fetch environment list",
        description: "Read /v1/environments and return all lab environments.",
        mutation: false,
        expectedResult: "Environment rows with env_id/client_name/industry.",
      },
    ];
  }

  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "create"
  ) {
    return [
      {
        id: "step_create_env",
        title: "Create environment",
        description: "POST /v1/environments with requested metadata.",
        mutation: true,
        preconditions: ["client_name must be provided"],
        expectedResult: "New environment id returned.",
        rollback: "Delete created environment by env_id.",
      },
      {
        id: "step_verify_env_create",
        title: "Verify environment creation",
        description: "GET /v1/environments and confirm new record exists.",
        mutation: false,
        expectedResult: "Created env appears in list.",
      },
    ];
  }

  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "update"
  ) {
    return [
      {
        id: "step_update_env",
        title: "Update environment",
        description: "PATCH /v1/environments/{envId} with provided fields.",
        mutation: true,
        preconditions: ["env_id must be provided or inferable from context"],
        expectedResult: "Updated environment row returned.",
        rollback: "Patch fields back to previous values.",
      },
      {
        id: "step_verify_env_update",
        title: "Verify environment update",
        description: "GET /v1/environments and confirm fields were updated.",
        mutation: false,
      },
    ];
  }

  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "delete"
  ) {
    return [
      {
        id: "step_resolve_env_delete_target",
        title: "Resolve environment target",
        description: "Resolve the environment by explicit env_id or by matching name.",
        mutation: false,
        expectedResult: "Single target environment identified.",
      },
      {
        id: "step_delete_env",
        title: "Delete environment",
        description: "DELETE /v1/environments/{envId}.",
        mutation: true,
        preconditions: ["env_id must be provided or inferable from context"],
        expectedResult: "Delete acknowledged by API.",
        rollback: "Recreate environment from backup data (manual).",
      },
      {
        id: "step_verify_env_delete",
        title: "Verify environment deletion",
        description: "GET /v1/environments and ensure deleted id is absent.",
        mutation: false,
      },
    ];
  }

  if (intent.domain === "bos" && intent.resource === "templates" && intent.action === "list") {
    return [
      {
        id: "step_list_templates",
        title: "Fetch template catalog",
        description: "GET /api/templates.",
        mutation: false,
      },
    ];
  }

  if (intent.domain === "bos" && intent.resource === "departments" && intent.action === "list") {
    return [
      {
        id: "step_list_departments",
        title: "Fetch department catalog",
        description: "GET /api/departments.",
        mutation: false,
      },
    ];
  }

  if (intent.domain === "bos" && intent.resource === "businesses" && intent.action === "create") {
    return [
      {
        id: "step_create_business",
        title: "Create business",
        description: "POST /api/businesses with name + slug.",
        mutation: true,
        preconditions: ["business name must be provided"],
        expectedResult: "business_id and slug returned.",
        rollback: "Delete business manually via admin tooling.",
      },
    ];
  }

  if (intent.domain === "system" && intent.action === "health") {
    return [
      {
        id: "step_health_checks",
        title: "Run service health checks",
        description: "Check codex bridge health and environment list reachability.",
        mutation: false,
      },
    ];
  }

  return [
    {
      id: "step_discover_context",
      title: "Discover current environments",
      description: "Command was ambiguous. Start with a read-only environment discovery step.",
      mutation: false,
      expectedResult: "Environment list to disambiguate next action.",
      preconditions: ["Provide environment id or explicit action to run mutations."],
    },
  ];
}

function impactedEntities(intent: CommandIntent, context: CommandContext): string[] {
  const entities: string[] = [];
  const envId = String(intent.parameters.envId || context.currentEnvId || "").trim();
  const bizId = String(intent.parameters.businessId || context.currentBusinessId || "").trim();
  if (envId) entities.push(`env:${envId}`);
  if (bizId) entities.push(`biz:${bizId}`);
  if (!entities.length) entities.push("global");
  return entities;
}

function buildMutationSummary(intent: CommandIntent): string[] {
  if (
    intent.domain === "lab" &&
    intent.resource === "environments" &&
    intent.action === "delete"
  ) {
    const envId = String(intent.parameters.envId || "").trim();
    if (envId) return [`delete:lab.environment:${envId}`];
    const envName = String(intent.parameters.envName || "").trim();
    if (envName) return [`delete:lab.environment:by-name:${envName}`];
    return ["delete:lab.environment:unresolved"];
  }
  return [];
}

function toExecutionPlan(intent: CommandIntent, context: CommandContext): ExecutionPlan {
  const steps = planSteps(intent, context);
  const risk = classifyPlanRisk(steps);
  const baseMutations = steps.filter((step) => step.mutation).map((step) => step.title);
  const mutations = [...buildMutationSummary(intent), ...baseMutations];
  const readOnly = mutations.length === 0;
  const requiresDoubleConfirmation = risk === "high";
  const envId = String(intent.parameters.envId || "").trim();
  const envName = String(intent.parameters.envName || "").trim();

  return {
    planId: randomId("plan"),
    intentSummary: summarizeIntent(intent),
    intent,
    steps,
    impactedEntities: impactedEntities(intent, context),
    mutations,
    risk,
    readOnly,
    requiresConfirmation: true,
    requiresDoubleConfirmation,
    doubleConfirmationPhrase: requiresDoubleConfirmation ? "DELETE" : null,
    target:
      intent.domain === "lab" && intent.resource === "environments"
        ? {
            envId: envId || null,
            envName: envName || null,
          }
        : undefined,
    clarification: { needed: false },
    context,
    createdAt: nowMs(),
  };
}

export function buildExecutionPlan(message: string, context: CommandContext): ExecutionPlan {
  const intent = parseCommandIntent(message, context);
  return toExecutionPlan(intent, context);
}

export function toPlanResponse(plan: ExecutionPlan): PlanResponse {
  return {
    plan_id: plan.planId,
    plan,
    risk: plan.risk,
    mutations: plan.mutations,
    requires_confirmation: plan.requiresConfirmation,
    requires_double_confirmation: plan.requiresDoubleConfirmation,
    double_confirmation_phrase: plan.doubleConfirmationPhrase || null,
  };
}

type LabEnvironmentRow = {
  env_id: string;
  client_name?: string;
  industry?: string;
  industry_type?: string;
};

async function fetchLabEnvironments(baseOrigin: string): Promise<LabEnvironmentRow[]> {
  const payload = await requestJson(baseOrigin, "/api/v1/environments", {
    idempotencyKey: `plan-resolve:${Date.now()}`,
    retries: 1,
  });
  return Array.isArray(payload?.environments) ? payload.environments : [];
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function resolveExecutionPlanTargets(
  plan: ExecutionPlan,
  baseOrigin: string
): Promise<ExecutionPlan> {
  if (
    !(
      plan.intent.domain === "lab" &&
      plan.intent.resource === "environments" &&
      plan.intent.action === "delete"
    )
  ) {
    return plan;
  }

  const directEnvId = String(plan.intent.parameters.envId || "").trim();
  const requestedEnvName = String(plan.intent.parameters.envName || "").trim();
  if (directEnvId) {
    return {
      ...plan,
      target: {
        envId: directEnvId,
        envName: requestedEnvName || null,
      },
      clarification: { needed: false },
    };
  }

  let rows: LabEnvironmentRow[] = [];
  try {
    rows = await fetchLabEnvironments(baseOrigin);
  } catch (error) {
    return {
      ...plan,
      steps: [
        {
          id: "step_resolve_env_delete_target",
          title: "Resolve environment target",
          description:
            "Delete not executed because environment lookup failed.",
          mutation: false,
          expectedResult: "Environment list reachable for name resolution.",
        },
      ],
      mutations: [],
      readOnly: true,
      requiresConfirmation: false,
      clarification: {
        needed: true,
        reason:
          error instanceof Error
            ? `I couldn't validate environment name before deletion: ${error.message}`
            : "I couldn't validate environment name before deletion.",
        options: [],
      },
    };
  }
  const normalizedRequested = normalizeText(requestedEnvName);
  const candidates = normalizedRequested
    ? rows.filter((row) => normalizeText(String(row.client_name || "")) === normalizedRequested)
    : [];

  const fuzzyCandidates = normalizedRequested
    ? rows.filter((row) =>
        normalizeText(String(row.client_name || "")).includes(normalizedRequested)
      )
    : [];

  if (candidates.length === 1 && fuzzyCandidates.length <= 1) {
    const env = candidates[0];
    const nextPlan = applyPlanParameterOverrides(plan, {
      envId: env.env_id,
    });
    return {
      ...nextPlan,
      intent: {
        ...nextPlan.intent,
        parameters: {
          ...nextPlan.intent.parameters,
          envName: env.client_name || requestedEnvName,
        },
      },
      target: {
        envId: env.env_id,
        envName: env.client_name || requestedEnvName,
      },
      clarification: { needed: false },
    };
  }

  const optionSource =
    fuzzyCandidates.length > 1
      ? fuzzyCandidates
      : candidates.length
        ? candidates
        : fuzzyCandidates;
  const options = optionSource.map((row) => ({
    label: `${row.client_name || row.env_id} (${row.env_id})`,
    value: row.env_id,
  }));

  return {
    ...plan,
    steps: [
      {
        id: "step_resolve_env_delete_target",
        title: "Resolve environment target",
        description:
          "Delete not executed. Environment name must resolve to exactly one target.",
        mutation: false,
        expectedResult: "User clarifies target environment.",
      },
    ],
    mutations: [],
    readOnly: true,
    requiresConfirmation: false,
    target: {
      envId: null,
      envName: requestedEnvName || null,
    },
    clarification: {
      needed: true,
      reason: options.length
        ? `I couldn't find a unique environment named \"${requestedEnvName}\".`
        : `I couldn't find any environment named \"${requestedEnvName}\".`,
      options,
    },
  };
}

export function applyPlanParameterOverrides(
  plan: ExecutionPlan,
  overrides: PlanParameterOverrides
): ExecutionPlan {
  const nextContext: CommandContext = {
    ...plan.context,
    currentEnvId:
      overrides.envId !== undefined
        ? String(overrides.envId || "").trim() || null
        : plan.context.currentEnvId || null,
    currentBusinessId:
      overrides.businessId !== undefined
        ? String(overrides.businessId || "").trim() || null
        : plan.context.currentBusinessId || null,
  };

  const nextIntent: CommandIntent = {
    ...plan.intent,
    parameters: {
      ...plan.intent.parameters,
      ...(overrides.envId !== undefined
        ? { envId: String(overrides.envId || "").trim() }
        : {}),
      ...(overrides.businessId !== undefined
        ? { businessId: String(overrides.businessId || "").trim() }
        : {}),
      ...(overrides.name !== undefined
        ? { name: String(overrides.name || "").trim() }
        : {}),
      ...(overrides.industry !== undefined
        ? { industry: String(overrides.industry || "").trim() }
        : {}),
      ...(overrides.notes !== undefined
        ? { notes: String(overrides.notes || "").trim() }
        : {}),
    },
  };

  const steps = planSteps(nextIntent, nextContext);
  const risk = classifyPlanRisk(steps);
  const baseMutations = steps.filter((step) => step.mutation).map((step) => step.title);
  const mutations = [...buildMutationSummary(nextIntent), ...baseMutations];
  const readOnly = mutations.length === 0;
  const requiresDoubleConfirmation = risk === "high";
  const envId = String(nextIntent.parameters.envId || "").trim();
  const envName = String(nextIntent.parameters.envName || "").trim();

  return {
    ...plan,
    intent: nextIntent,
    steps,
    impactedEntities: impactedEntities(nextIntent, nextContext),
    mutations,
    risk,
    readOnly,
    requiresDoubleConfirmation,
    doubleConfirmationPhrase: requiresDoubleConfirmation ? "DELETE" : null,
    target:
      nextIntent.domain === "lab" && nextIntent.resource === "environments"
        ? {
            envId: envId || null,
            envName: envName || null,
          }
        : plan.target,
    clarification: { needed: false },
    context: nextContext,
  };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(
  baseOrigin: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: Record<string, unknown>;
    idempotencyKey: string;
    retries?: number;
  }
) {
  const method = options.method || "GET";
  const retries = typeof options.retries === "number" ? options.retries : method === "DELETE" ? 0 : 2;
  const url = new URL(path, baseOrigin).toString();
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt <= retries) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": options.idempotencyKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
      });

      if (!res.ok) {
        const payload = await safeJson(res);
        const detail =
          (payload && (payload.message || payload.detail || payload.error)) ||
          `HTTP ${res.status}`;
        const shouldRetry = res.status >= 500 && attempt < retries;
        if (!shouldRetry) {
          throw new Error(String(detail));
        }
      } else {
        return await safeJson(res);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    attempt += 1;
  }

  throw new Error(lastError || "Request failed");
}

function buildVerification(stepId: string, summary: string, ok = true, details?: Record<string, unknown>, links?: VerificationResult["links"]): VerificationResult {
  return { stepId, ok, summary, details, links };
}

async function resolveDeleteTargetForRun(
  plan: ExecutionPlan,
  apiBases: { labApiBaseUrl: string }
) {
  const explicitEnvId = String(plan.intent.parameters.envId || "").trim();
  if (explicitEnvId) {
    return { envId: explicitEnvId, envName: String(plan.intent.parameters.envName || "").trim() };
  }

  const requestedEnvName = String(plan.intent.parameters.envName || "").trim();
  if (!requestedEnvName) {
    const contextEnvId = String(plan.context.currentEnvId || "").trim();
    if (!contextEnvId) {
      throw new Error(
        "NEEDS_CLARIFICATION: I could not resolve which environment to delete. Please specify the exact environment name or id."
      );
    }
    return { envId: contextEnvId, envName: "" };
  }

  const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
    idempotencyKey: `resolve-delete:${plan.planId}`,
    retries: 1,
  });
  const rows = Array.isArray(payload?.environments) ? payload.environments : [];
  const requested = normalizeText(requestedEnvName);
  const exact = rows.filter(
    (row: { client_name?: string }) =>
      normalizeText(String(row.client_name || "")) === requested
  );
  if (exact.length === 1) {
    return {
      envId: String(exact[0].env_id),
      envName: String(exact[0].client_name || requestedEnvName),
    };
  }

  const fuzzy = rows.filter((row: { client_name?: string }) =>
    normalizeText(String(row.client_name || "")).includes(requested)
  );
  const options = (exact.length ? exact : fuzzy).slice(0, 5).map((row: { env_id: string; client_name?: string }) => `${row.client_name || row.env_id} (${row.env_id})`);
  if (options.length) {
    throw new Error(
      `NEEDS_CLARIFICATION: I couldn't find a unique environment named "${requestedEnvName}". Candidates: ${options.join(", ")}`
    );
  }
  throw new Error(
    `NEEDS_CLARIFICATION: I couldn't find any environment named "${requestedEnvName}".`
  );
}

async function executeStep(
  plan: ExecutionPlan,
  stepId: string,
  apiBases: {
    origin: string;
    labApiBaseUrl: string;
    bosApiBaseUrl: string;
  }
): Promise<{ details?: Record<string, unknown>; verification?: VerificationResult }> {
  const intent = plan.intent;
  const key = `${plan.planId}:${stepId}`;

  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "list") {
    const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
      idempotencyKey: key,
    });
    const environments = Array.isArray(payload?.environments) ? payload.environments : [];
    return {
      details: { count: environments.length, environments },
      verification: buildVerification(
        stepId,
        `Fetched ${environments.length} environment(s).`,
        true,
        { count: environments.length },
        [{ label: "Open environments page", href: "/lab/environments" }]
      ),
    };
  }

  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "create") {
    if (stepId === "step_create_env") {
      const clientName = String(intent.parameters.name || "").trim();
      if (!clientName) throw new Error("Missing environment name. Include quoted name before confirming.");
      const industry = String(intent.parameters.industry || "website");
      const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
        method: "POST",
        body: { client_name: clientName, industry, industry_type: industry },
        idempotencyKey: key,
      });
      return {
        details: payload || {},
        verification: buildVerification(
          stepId,
          "Environment create request accepted.",
          true,
          { env_id: payload?.env_id || null },
          payload?.env_id ? [{ label: "Open environment", href: `/lab/env/${payload.env_id}` }] : undefined
        ),
      };
    }
    if (stepId === "step_verify_env_create") {
      const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
        idempotencyKey: key,
      });
      const environments = Array.isArray(payload?.environments) ? payload.environments : [];
      const targetName = String(intent.parameters.name || "").trim();
      const found = environments.find((item: { client_name?: string }) => item.client_name === targetName);
      if (!found) throw new Error(`Verification failed: environment "${targetName}" not found after create.`);
      return {
        details: { env_id: found.env_id, client_name: found.client_name },
        verification: buildVerification(
          stepId,
          `Verified environment "${targetName}" exists.`,
          true,
          { env_id: found.env_id },
          [{ label: "Open environment", href: `/lab/env/${found.env_id}` }]
        ),
      };
    }
  }

  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "update") {
    const envId = String(intent.parameters.envId || plan.context.currentEnvId || "").trim();
    if (!envId) throw new Error("Missing env_id for update.");
    const nextName = String(intent.parameters.name || "").trim();

    if (stepId === "step_update_env") {
      const payload = await requestJson(apiBases.labApiBaseUrl, `/api/v1/environments/${envId}`, {
        method: "PATCH",
        body: nextName ? { client_name: nextName } : {},
        idempotencyKey: key,
      });
      return {
        details: payload || {},
        verification: buildVerification(stepId, "Update API returned success.", true, {
          env_id: payload?.env_id || envId,
        }),
      };
    }
    if (stepId === "step_verify_env_update") {
      const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
        idempotencyKey: key,
      });
      const environments = Array.isArray(payload?.environments) ? payload.environments : [];
      const found = environments.find((item: { env_id?: string }) => item.env_id === envId);
      if (!found) throw new Error("Verification failed: environment not found.");
      if (nextName && found.client_name !== nextName) {
        throw new Error(`Verification failed: expected name "${nextName}", got "${found.client_name}".`);
      }
      return {
        details: { env_id: envId, client_name: found.client_name },
        verification: buildVerification(
          stepId,
          "Verified updated environment values.",
          true,
          { env_id: envId, client_name: found.client_name },
          [{ label: "Open environment", href: `/lab/env/${envId}` }]
        ),
      };
    }
  }

  if (intent.domain === "lab" && intent.resource === "environments" && intent.action === "delete") {
    const resolved = await resolveDeleteTargetForRun(plan, apiBases);
    const envId = resolved.envId;

    if (stepId === "step_resolve_env_delete_target") {
      return {
        details: { env_id: envId, env_name: resolved.envName || null },
        verification: buildVerification(
          stepId,
          `Resolved delete target: ${resolved.envName || envId}.`,
          true,
          { env_id: envId, env_name: resolved.envName || null }
        ),
      };
    }

    if (stepId === "step_delete_env") {
      const payload = await requestJson(apiBases.labApiBaseUrl, `/api/v1/environments/${envId}`, {
        method: "DELETE",
        idempotencyKey: key,
        retries: 0,
      });
      return {
        details: payload || {},
        verification: buildVerification(stepId, "Delete API returned success.", true, {
          env_id: envId,
          env_name: resolved.envName || null,
        }),
      };
    }
    if (stepId === "step_verify_env_delete") {
      const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
        idempotencyKey: key,
      });
      const environments = Array.isArray(payload?.environments) ? payload.environments : [];
      const stillExists = environments.some((item: { env_id?: string }) => item.env_id === envId);
      if (stillExists) throw new Error("Verification failed: environment still exists after delete.");
      const getById = await fetch(
        new URL(`/api/v1/environments/${envId}`, apiBases.labApiBaseUrl).toString(),
        { cache: "no-store" }
      );
      if (getById.status !== 404) {
        throw new Error(
          `Verification failed: expected GET /api/v1/environments/${envId} to return 404, got ${getById.status}.`
        );
      }
      return {
        details: { env_id: envId, get_by_id_status: 404 },
        verification: buildVerification(
          stepId,
          "Verified environment no longer appears in list.",
          true,
          { env_id: envId, get_by_id_status: 404 },
          [{ label: "Open environments page", href: "/lab/environments" }]
        ),
      };
    }
  }

  if (intent.domain === "bos" && intent.resource === "templates" && intent.action === "list") {
    const payload = await requestJson(apiBases.bosApiBaseUrl, "/api/templates", {
      idempotencyKey: key,
    });
    const count = Array.isArray(payload) ? payload.length : 0;
    return {
      details: { count, items: payload || [] },
      verification: buildVerification(
        stepId,
        `Fetched ${count} template(s).`,
        true,
        { count },
        [{ label: "Open onboarding", href: "/onboarding" }]
      ),
    };
  }

  if (intent.domain === "bos" && intent.resource === "departments" && intent.action === "list") {
    const payload = await requestJson(apiBases.bosApiBaseUrl, "/api/departments", {
      idempotencyKey: key,
    });
    const count = Array.isArray(payload) ? payload.length : 0;
    return {
      details: { count, items: payload || [] },
      verification: buildVerification(stepId, `Fetched ${count} department(s).`, true, { count }),
    };
  }

  if (intent.domain === "bos" && intent.resource === "businesses" && intent.action === "create") {
    const name = String(intent.parameters.name || "").trim();
    if (!name) throw new Error("Missing business name. Include quoted name before confirming.");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload = await requestJson(apiBases.bosApiBaseUrl, "/api/businesses", {
      method: "POST",
      body: { name, slug, region: "us" },
      idempotencyKey: key,
    });
    return {
      details: payload || {},
      verification: buildVerification(
        stepId,
        "Business created.",
        true,
        { business_id: payload?.business_id || null, slug: payload?.slug || slug },
        payload?.business_id ? [{ label: "Open onboarding", href: "/onboarding" }] : undefined
      ),
    };
  }

  if (intent.domain === "system" && intent.action === "health") {
    const [commandHealth, envList] = await Promise.all([
      requestJson(apiBases.origin, "/api/ai/codex/health", { idempotencyKey: `${key}:command` }),
      requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
        idempotencyKey: `${key}:envs`,
      }),
    ]);
    return {
      details: {
        commandHealth,
        environmentCount: Array.isArray(envList?.environments) ? envList.environments.length : 0,
      },
      verification: buildVerification(
        stepId,
        "Health checks completed.",
        true,
        {
          commandHealth,
          environmentCount: Array.isArray(envList?.environments) ? envList.environments.length : 0,
        }
      ),
    };
  }

  // Fallback discovery step
  const payload = await requestJson(apiBases.labApiBaseUrl, "/api/v1/environments", {
    idempotencyKey: key,
  });
  const count = Array.isArray(payload?.environments) ? payload.environments.length : 0;
  return {
    details: { count, environments: payload?.environments || [] },
    verification: buildVerification(
      stepId,
      `Discovery complete: found ${count} environment(s).`,
      true,
      { count },
      [{ label: "Open environments page", href: "/lab/environments" }]
    ),
  };
}

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, "");
}

function resolveBosBaseUrl(origin: string) {
  const configured =
    process.env.BOS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured && configured.trim()) {
    return normalizeBaseUrl(configured.trim());
  }
  return normalizeBaseUrl(origin);
}

function resolveLabBaseUrl(origin: string) {
  const configured =
    process.env.LAB_API_BASE_URL ||
    process.env.DEMO_API_BASE_URL ||
    process.env.DEMO_API_ORIGIN ||
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL;
  if (configured && configured.trim() && !configured.trim().startsWith("/")) {
    return normalizeBaseUrl(configured.trim());
  }
  return normalizeBaseUrl(origin);
}

export async function executePlanRun(params: {
  planId: string;
  runId: string;
  origin: string;
  labApiBaseUrl?: string;
  bosApiBaseUrl?: string;
}) {
  const { planId, runId, origin } = params;
  const plan = getPlan(planId);
  if (!plan) {
    markRunStatus(runId, "failed");
    appendRunLog(runId, "Plan not found.");
    appendAuditEvent(planId, "run.failed", { error: "plan not found" }, runId);
    return;
  }

  const apiBases = {
    origin: normalizeBaseUrl(origin),
    labApiBaseUrl: normalizeBaseUrl(params.labApiBaseUrl || resolveLabBaseUrl(origin)),
    bosApiBaseUrl: normalizeBaseUrl(params.bosApiBaseUrl || resolveBosBaseUrl(origin)),
  };

  markRunStatus(runId, "running");
  appendRunLog(runId, `Execution started for plan ${planId}.`);

  for (const step of plan.steps) {
    if (isRunCancelled(runId)) {
      upsertStepResult(runId, {
        stepId: step.id,
        status: "cancelled",
        startedAt: nowMs(),
        endedAt: nowMs(),
      });
      appendAuditEvent(planId, "run.cancelled", { stepId: step.id }, runId);
      appendRunLog(runId, `Run cancelled before step "${step.title}" completed.`);
      markRunStatus(runId, "cancelled");
      return;
    }

    appendAuditEvent(
      planId,
      "step.started",
      { stepId: step.id, title: step.title, target: plan.target || null },
      runId
    );
    appendRunLog(runId, `Starting: ${step.title}`);
    upsertStepResult(runId, { stepId: step.id, status: "running", startedAt: nowMs() });

    try {
      const result = await executeStep(plan, step.id, apiBases);
      const endedAt = nowMs();
      upsertStepResult(runId, {
        stepId: step.id,
        status: "completed",
        endedAt,
        details: result.details,
        verification: result.verification,
      });
      if (result.verification) {
        pushVerification(runId, result.verification);
      }
      appendAuditEvent(
        planId,
        "step.completed",
        { stepId: step.id, details: result.details || null, target: plan.target || null },
        runId
      );
      appendRunLog(runId, `Completed: ${step.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution failure";
      const clarification = message.startsWith("NEEDS_CLARIFICATION:");
      upsertStepResult(runId, {
        stepId: step.id,
        status: clarification ? "skipped" : "failed",
        endedAt: nowMs(),
        error: message,
      });
      if (clarification) {
        appendAuditEvent(
          planId,
          "run.failed",
          { stepId: step.id, status: "needs_clarification", error: message },
          runId
        );
        appendRunLog(runId, `Needs clarification: ${message.replace("NEEDS_CLARIFICATION:", "").trim()}`);
        markRunStatus(runId, "needs_clarification");
      } else {
        appendAuditEvent(planId, "step.failed", { stepId: step.id, error: message }, runId);
        appendRunLog(runId, `Failed: ${step.title} — ${message}`);
        markRunStatus(runId, "failed");
        appendAuditEvent(planId, "run.failed", { error: message }, runId);
      }
      return;
    }
  }

  markRunStatus(runId, "completed");
  appendRunLog(runId, "Run completed.");
  appendAuditEvent(planId, "run.completed", {}, runId);
}
