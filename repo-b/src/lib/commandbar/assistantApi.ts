import type {
  AssistantContextEnvelope,
  CommandContext,
  ContextSnapshot,
  ExecutionPlan,
  ResolvedAssistantScope,
  RunStatus,
} from "@/lib/commandbar/types";
import {
  type AssistantPlan,
  codexHealthSchema,
  contextSnapshotSchema,
  parseConfirmResponse,
  parseExecuteResponse,
  parsePlanResponse,
  parseRunStatusResponse,
} from "@/lib/commandbar/schemas";

export type AssistantApiTrace = {
  requestId: string;
  endpoint: string;
  method: "GET" | "POST";
  startedAt: number;
  durationMs: number;
  status: number;
  ok: boolean;
  runId?: string;
};

export type DiagnosticsCheck = {
  id: "health" | "version" | "permissions" | "sample_plan";
  label: string;
  ok: boolean;
  status: "ok" | "warning" | "error";
  latencyMs: number;
  detail: string;
};

export type AssistantToolEvent = {
  tool_name: string;
  args?: unknown;
  result_preview?: string;
  result?: unknown;
  duration_ms?: number;
  success?: boolean;
  row_count?: number | null;
  is_write?: boolean;
  pending_confirmation?: boolean;
};

export type WinstonToolTimeline = {
  step: number;
  tool_name: string;
  purpose: string;
  success: boolean;
  duration_ms: number;
  result_summary: string;
  row_count?: number | null;
  error?: string;
};

export type WinstonDataSource = {
  source_type: "database" | "document" | "cache" | "ui_visible";
  tool_name?: string;
  module?: string | null;
  doc_id?: string;
  chunk_id?: string;
  score?: number;
  section_heading?: string | null;
  row_count?: number;
};

export type WinstonRepeMetadata = {
  industry: string;
  rollup_level: string;
  fund_id?: string | null;
  asset_id?: string | null;
  deal_id?: string | null;
  schema_name?: string | null;
};

export type WinstonTrace = {
  execution_path: "chat" | "tool" | "rag" | "hybrid";
  lane?: "A" | "B" | "C" | "D";
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_call_count: number;
  tool_timeline: WinstonToolTimeline[];
  data_sources: WinstonDataSource[];
  citations: unknown[];
  rag_chunks_used: number;
  warnings: string[];
  elapsed_ms: number;
  resolved_scope: Record<string, unknown> | null;
  repe: WinstonRepeMetadata | null;
  visible_context_shortcut: boolean;
  reasoning_effort?: string | null;
  // Pipeline stage results (populated by later phases)
  verification?: { enabled: boolean; status: string; ms: number } | null;
  query_expansion?: { enabled: boolean; subqueries: number; ms: number } | null;
  structured_retrieval?: { enabled: boolean; sources: string[] } | null;
  cache?: { embedding_hit: boolean; rag_hit: boolean; semantic_hit: boolean } | null;
  timings?: {
    context_resolution_ms?: number;
    rag_search_ms?: number;
    prompt_construction_ms?: number;
    ttft_ms?: number;
    model_ms?: number;
    total_ms?: number;
    [key: string]: number | undefined;
  };
};

export type SSEEvent = {
  seq: number;
  timestamp: number;
  elapsedMs: number;
  eventType: string;
  payload: unknown;
  summary: string;
};

export type AskAiDebug = {
  contextEnvelope?: AssistantContextEnvelope;
  resolvedScope?: ResolvedAssistantScope | null;
  toolCalls: AssistantToolEvent[];
  toolResults: AssistantToolEvent[];
  citations: unknown[];
  done?: unknown;
  trace?: WinstonTrace | null;
  eventLog: SSEEvent[];
};

export class AssistantApiError extends Error {
  endpoint: string;
  status: number;
  requestId: string;
  rawPayload: unknown;

  constructor(params: {
    message: string;
    endpoint: string;
    status: number;
    requestId: string;
    rawPayload: unknown;
  }) {
    super(params.message);
    this.name = "AssistantApiError";
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.requestId = params.requestId;
    this.rawPayload = params.rawPayload;
  }
}

type ApiResponse<T> = {
  data: T;
  trace: AssistantApiTrace;
  raw: unknown;
};

const TIMEOUT_MS = 25_000;
const USE_MOCKS =
  process.env.NEXT_PUBLIC_USE_MOCKS === "true" ||
  process.env.USE_MOCKS === "true";
const USE_CODEX_SERVER =
  process.env.NEXT_PUBLIC_USE_CODEX_SERVER !== "false" &&
  process.env.USE_CODEX_SERVER !== "false";

const mockState: {
  callCount: number;
  run: {
    runId: string;
    planId: string;
    status: RunStatus;
    createdAt: number;
    logs: string[];
  } | null;
} = {
  callCount: 0,
  run: null,
};

function nextRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `req_${crypto.randomUUID()}`;
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function logClientTrace(trace: AssistantApiTrace) {
  console.info("[winston-assistant]", {
    request_id: trace.requestId,
    endpoint: trace.endpoint,
    method: trace.method,
    status: trace.status,
    ok: trace.ok,
    duration_ms: trace.durationMs,
    run_id: trace.runId || null,
  });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort("timeout"), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return {
    signal: controller.signal,
    cancel: () => globalThis.clearTimeout(timeout),
  };
}

async function requestJson<T>(params: {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ApiResponse<T>> {
  const requestId = nextRequestId();
  const startedAt = Date.now();
  const { signal, cancel } = withTimeout(params.signal, params.timeoutMs);

  try {
    const response = await fetch(params.endpoint, {
      method: params.method,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      cache: "no-store",
      signal,
    });

    const payload = await safeJson(response);
    const trace: AssistantApiTrace = {
      requestId,
      endpoint: params.endpoint,
      method: params.method,
      startedAt,
      durationMs: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
    };

    if (!response.ok) {
      logClientTrace(trace);
      const message =
        (payload as { error?: string; message?: string } | null)?.error ||
        (payload as { message?: string } | null)?.message ||
        `Request failed (${response.status})`;
      throw new AssistantApiError({
        message,
        endpoint: params.endpoint,
        status: response.status,
        requestId,
        rawPayload: payload,
      });
    }

    logClientTrace(trace);
    return { data: payload as T, trace, raw: payload };
  } catch (error) {
    if (error instanceof AssistantApiError) throw error;

    const trace: AssistantApiTrace = {
      requestId,
      endpoint: params.endpoint,
      method: params.method,
      startedAt,
      durationMs: Date.now() - startedAt,
      status: 0,
      ok: false,
    };
    logClientTrace(trace);

    throw new AssistantApiError({
      message: error instanceof Error ? error.message : "Network error",
      endpoint: params.endpoint,
      status: 0,
      requestId,
      rawPayload: null,
    });
  } finally {
    cancel();
  }
}

function buildContextSnapshotUrl(context: CommandContext) {
  const url = new URL("/api/mcp/context-snapshot", window.location.origin);
  if (context.route) url.searchParams.set("route", context.route);
  if (context.currentEnvId) url.searchParams.set("currentEnvId", context.currentEnvId);
  if (context.currentBusinessId) url.searchParams.set("businessId", context.currentBusinessId);
  return `${url.pathname}${url.search}`;
}

function mockPlan(message: string, context: CommandContext) {
  const planId = `plan_mock_${Date.now()}`;
  return {
    planId,
    plan: {
      planId,
      intentSummary: `Draft plan for: ${message}`,
      intent: {
        rawMessage: message,
        domain: "lab" as const,
        resource: "environments",
        action: "list" as const,
        parameters: {},
        confidence: 0.88,
        readOnly: true,
      },
      operationName: "lab.environments.list",
      operationParams: { route: context.route || "/lab/environments" },
      steps: [
        {
          id: "step_1",
          title: "Read environment list",
          description: "Calls the environment listing endpoint.",
          mutation: false,
        },
      ],
      impactedEntities: ["environments"],
      mutations: [],
      risk: "low" as const,
      riskLevel: "low" as const,
      affectedEntities: ["environments"],
      previewDiff: [
        {
          field: "operation",
          before: null,
          after: "lab.environments.list",
          change: "none" as const,
        },
      ],
      readOnly: true,
      requiresConfirmation: true,
      requiresDoubleConfirmation: false,
      doubleConfirmationPhrase: null,
      target: {
        envId: context.currentEnvId || null,
        envName: context.currentEnvId || null,
        businessId: context.currentBusinessId || null,
      },
      clarification: { needed: false },
      context,
      createdAt: Date.now(),
    },
  } as { planId: string; plan: AssistantPlan };
}

export function getAssistantFeatureFlags() {
  return {
    useCodexServer: USE_CODEX_SERVER,
    useMocks: USE_MOCKS,
  };
}

export async function fetchContextSnapshot(context: CommandContext, signal?: AbortSignal) {
  if (USE_MOCKS) {
    return {
      snapshot: {
        route: context.route || "/lab/environments",
        environments: [{ env_id: "env_mock", client_name: "Mock Co" }],
        selectedEnv: context.currentEnvId
          ? { env_id: context.currentEnvId, client_name: "Mock Co" }
          : null,
        business: context.currentBusinessId
          ? { business_id: context.currentBusinessId, name: "Mock Business", slug: "mock-business" }
          : null,
        modulesAvailable: ["environments", "tasks"],
        recentRuns: [],
      } as ContextSnapshot,
      trace: {
        requestId: nextRequestId(),
        endpoint: "/api/mcp/context-snapshot",
        method: "GET" as const,
        startedAt: Date.now(),
        durationMs: 5,
        status: 200,
        ok: true,
      },
      raw: {},
    };
  }

  const endpoint = buildContextSnapshotUrl(context);
  const response = await requestJson<unknown>({ endpoint, method: "GET", signal });
  const parsed = contextSnapshotSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AssistantApiError({
      message: `Context snapshot validation failed: ${parsed.error.message}`,
      endpoint,
      status: response.trace.status,
      requestId: response.trace.requestId,
      rawPayload: response.data,
    });
  }

  return {
    snapshot: parsed.data,
    trace: response.trace,
    raw: response.raw,
  };
}

export async function createPlan(input: {
  message: string;
  context: CommandContext;
  contextSnapshot: ContextSnapshot;
  signal?: AbortSignal;
}) {
  if (USE_MOCKS) {
    const plan = mockPlan(input.message, input.context);
    return {
      planId: plan.planId,
      plan: plan.plan,
      trace: {
        requestId: nextRequestId(),
        endpoint: "/api/mcp/plan",
        method: "POST" as const,
        startedAt: Date.now(),
        durationMs: 10,
        status: 200,
        ok: true,
      },
      raw: plan,
    };
  }

  const endpoint = "/api/mcp/plan";
  const response = await requestJson<unknown>({
    endpoint,
    method: "POST",
    body: {
      message: input.message,
      context: input.context,
      contextSnapshot: input.contextSnapshot,
    },
    signal: input.signal,
  });

  const parsed = parsePlanResponse(endpoint, response.data);
  return {
    planId: parsed.planId,
    plan: parsed.plan,
    trace: response.trace,
    raw: response.raw,
  };
}

export async function confirmPlan(input: {
  planId: string;
  confirmationText?: string;
  overrides?: {
    envId?: string;
    businessId?: string;
    name?: string;
    industry?: string;
    notes?: string;
  };
  signal?: AbortSignal;
}) {
  if (USE_MOCKS) {
    return {
      confirmToken: `confirm_mock_${Date.now()}`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      trace: {
        requestId: nextRequestId(),
        endpoint: "/api/commands/confirm",
        method: "POST" as const,
        startedAt: Date.now(),
        durationMs: 8,
        status: 200,
        ok: true,
      },
      raw: {},
      plan: undefined,
    };
  }

  const endpoint = "/api/commands/confirm";
  const response = await requestJson<unknown>({
    endpoint,
    method: "POST",
    body: {
      plan_id: input.planId,
      confirmation_text: input.confirmationText || "",
      overrides: input.overrides,
    },
    signal: input.signal,
  });

  const parsed = parseConfirmResponse(endpoint, response.data);
  return {
    ...parsed,
    trace: response.trace,
    raw: response.raw,
  };
}

export async function executePlan(input: {
  planId: string;
  confirmToken: string;
  signal?: AbortSignal;
}) {
  if (USE_MOCKS) {
    const runId = `run_mock_${Date.now()}`;
    mockState.callCount = 0;
    mockState.run = {
      runId,
      planId: input.planId,
      status: "running",
      createdAt: Date.now(),
      logs: ["Execution started."],
    };
    return {
      runId,
      status: "running" as RunStatus,
      trace: {
        requestId: nextRequestId(),
        endpoint: "/api/commands/execute",
        method: "POST" as const,
        startedAt: Date.now(),
        durationMs: 12,
        status: 200,
        ok: true,
        runId,
      },
      raw: { run_id: runId, status: "running" },
    };
  }

  const endpoint = "/api/commands/execute";
  const response = await requestJson<unknown>({
    endpoint,
    method: "POST",
    body: {
      plan_id: input.planId,
      confirm_token: input.confirmToken,
    },
    signal: input.signal,
  });

  const parsed = parseExecuteResponse(endpoint, response.data);
  return {
    ...parsed,
    trace: {
      ...response.trace,
      runId: parsed.runId,
    },
    raw: response.raw,
  };
}

export async function getRunStatus(runId: string, signal?: AbortSignal) {
  if (USE_MOCKS && mockState.run) {
    mockState.callCount += 1;
    const completed = mockState.callCount > 1;
    const status: RunStatus = completed ? "completed" : "running";
    mockState.run.status = status;
    if (completed) {
      mockState.run.logs = [...mockState.run.logs, "Completed: Read environment list", "Run completed."];
    }

    const payload = {
      run: {
        runId: mockState.run.runId,
        planId: mockState.run.planId,
        status,
        createdAt: mockState.run.createdAt,
        startedAt: mockState.run.createdAt,
        endedAt: completed ? Date.now() : undefined,
        cancelled: false,
        logs: mockState.run.logs,
        stepResults: [
          {
            stepId: "step_1",
            status: completed ? "completed" : "running",
            startedAt: mockState.run.createdAt,
            endedAt: completed ? Date.now() : undefined,
          },
        ],
        verification: completed
          ? [
              {
                stepId: "step_1",
                ok: true,
                summary: "Discovery complete: found 1 environment(s).",
                links: [{ label: "Open environments page", href: "/lab/environments" }],
              },
            ]
          : [],
      },
      plan: {
        plan_id: mockState.run.planId,
        risk: "low",
        read_only: true,
        intent_summary: "List environments",
        impacted_entities: ["environments"],
        mutations: [],
        target: null,
        clarification: null,
        requires_double_confirmation: false,
        double_confirmation_phrase: null,
      },
      audit_events: [],
    };

    return {
      ...parseRunStatusResponse(`/api/commands/runs/${runId}`, payload),
      trace: {
        requestId: nextRequestId(),
        endpoint: `/api/commands/runs/${runId}`,
        method: "GET" as const,
        startedAt: Date.now(),
        durationMs: 10,
        status: 200,
        ok: true,
        runId,
      },
      raw: payload,
    };
  }

  const endpoint = `/api/commands/runs/${encodeURIComponent(runId)}`;
  const response = await requestJson<unknown>({ endpoint, method: "GET", signal });
  return {
    ...parseRunStatusResponse(endpoint, response.data),
    trace: {
      ...response.trace,
      runId,
    },
    raw: response.raw,
  };
}

export async function cancelRun(runId: string, signal?: AbortSignal) {
  if (USE_MOCKS && mockState.run) {
    mockState.run.status = "cancelled";
    return {
      ok: true,
      runId,
      status: "cancelled" as RunStatus,
      trace: {
        requestId: nextRequestId(),
        endpoint: `/api/commands/runs/${runId}/cancel`,
        method: "POST" as const,
        startedAt: Date.now(),
        durationMs: 4,
        status: 200,
        ok: true,
        runId,
      },
      raw: {},
    };
  }

  const endpoint = `/api/commands/runs/${encodeURIComponent(runId)}/cancel`;
  const response = await requestJson<unknown>({ endpoint, method: "POST", signal });
  const payload = response.data as { ok?: boolean; run_id?: string; status?: RunStatus };
  return {
    ok: payload.ok === true,
    runId: String(payload.run_id || runId),
    status: (payload.status || "cancelled") as RunStatus,
    trace: {
      ...response.trace,
      runId,
    },
    raw: response.raw,
  };
}

export async function checkCodexHealth(signal?: AbortSignal) {
  // Use the AI Gateway health endpoint instead of the old Codex sidecar
  const endpoint = "/api/ai/gateway/health";
  const started = Date.now();

  try {
    const response = await requestJson<{
      enabled: boolean;
      model: string;
      embedding_model: string;
      rag_available: boolean;
      message: string | null;
    }>({ endpoint, method: "GET", signal, timeoutMs: 10_000 });

    const data = response.data;
    return {
      health: {
        ok: data.enabled,
        mode: data.enabled ? "gateway" : "disabled",
        message: data.message || `Model: ${data.model}, RAG: ${data.rag_available ? "available" : "unavailable"}`,
      },
      latencyMs: Date.now() - started,
      trace: response.trace,
      raw: response.raw,
    };
  } catch (error) {
    // Re-throw so callers (diagnostics, tests) can distinguish
    // between "gateway disabled" (resolved) and "gateway unreachable" (rejected)
    throw error;
  }
}

export async function runDiagnostics(input: {
  context: CommandContext;
  contextSnapshot: ContextSnapshot | null;
}) {
  const checks: DiagnosticsCheck[] = [];

  const healthStarted = Date.now();
  try {
    const healthRes = await checkCodexHealth();
    checks.push({
      id: "health",
      label: "AI Gateway health",
      ok: healthRes.health.ok,
      status: healthRes.health.ok ? "ok" : "warning",
      latencyMs: Date.now() - healthStarted,
      detail: healthRes.health.message || "Health check completed.",
    });

    checks.push({
      id: "version",
      label: "Gateway mode",
      ok: true,
      status: "ok",
      latencyMs: Date.now() - healthStarted,
      detail: `Mode: ${healthRes.health.mode || "unknown"}`,
    });
  } catch (error) {
    checks.push({
      id: "health",
      label: "AI Gateway health",
      ok: false,
      status: "error",
      latencyMs: Date.now() - healthStarted,
      detail: error instanceof Error ? error.message : "Health check failed.",
    });
    checks.push({
      id: "version",
      label: "Gateway mode",
      ok: false,
      status: "error",
      latencyMs: Date.now() - healthStarted,
      detail: "Unavailable while health check is failing.",
    });
  }

  const permissionsStarted = Date.now();
  try {
    await fetchContextSnapshot(input.context);
    checks.push({
      id: "permissions",
      label: "Permissions",
      ok: true,
      status: "ok",
      latencyMs: Date.now() - permissionsStarted,
      detail: "Authenticated workspace access is available.",
    });
  } catch (error) {
    checks.push({
      id: "permissions",
      label: "Permissions",
      ok: false,
      status: "error",
      latencyMs: Date.now() - permissionsStarted,
      detail: error instanceof Error ? error.message : "Permission check failed.",
    });
  }

  const samplePlanStarted = Date.now();
  try {
    const snapshot = input.contextSnapshot || (await fetchContextSnapshot(input.context)).snapshot;
    const plan = await createPlan({
      message: "list recent documents",
      context: input.context,
      contextSnapshot: snapshot,
    });

    checks.push({
      id: "sample_plan",
      label: "Sample plan dry-run",
      ok: Boolean(plan.plan.readOnly),
      status: plan.plan.readOnly ? "ok" : "warning",
      latencyMs: Date.now() - samplePlanStarted,
      detail: plan.plan.readOnly
        ? "Read-only dry-run plan generated."
        : "Plan generated but includes mutations.",
    });
  } catch (error) {
    checks.push({
      id: "sample_plan",
      label: "Sample plan dry-run",
      ok: false,
      status: "error",
      latencyMs: Date.now() - samplePlanStarted,
      detail: error instanceof Error ? error.message : "Dry-run failed.",
    });
  }

  return checks;
}

export function buildExecutionSummary(plan: ExecutionPlan | AssistantPlan | null, run: {
  runId: string;
  status: RunStatus;
  logs: string[];
  verification: Array<{ summary: string }>;
} | null) {
  if (!plan || !run) return "No run summary available.";

  return [
    `Winston Run ${run.runId}`,
    `Status: ${run.status}`,
    `Intent: ${plan.intentSummary}`,
    `Risk: ${("riskLevel" in plan ? plan.riskLevel : plan.risk).toUpperCase()}`,
    `Mutations: ${plan.mutations.length ? plan.mutations.join(", ") : "Read-only"}`,
    ...(run.verification.length
      ? ["Verification:", ...run.verification.map((item) => `- ${item.summary}`)]
      : []),
    ...(run.logs.length ? ["Logs:", ...run.logs.map((line) => `- ${line}`)] : []),
  ].join("\n");
}

/**
 * Ask Winston AI a freeform question via the AI gateway.
 * Collects SSE stream into a single text response.
 */
export async function askAi(input: {
  message: string;
  workspace?: Record<string, string>;
  business_id?: string;
  env_id?: string;
  conversation_id?: string;
  context_envelope?: AssistantContextEnvelope;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<{ answer: string; trace: AssistantApiTrace; debug: AskAiDebug }> {
  const requestId = nextRequestId();
  const startedAt = Date.now();
  const endpoint = "/api/ai/gateway/ask";

  if (USE_MOCKS) {
    return {
      answer: `[Mock] Winston would analyze: "${input.message}". In production this calls the AI gateway.`,
      trace: { requestId, endpoint, method: "POST", startedAt, durationMs: 10, status: 200, ok: true },
      debug: {
        contextEnvelope: input.context_envelope,
        resolvedScope: null,
        toolCalls: [],
        toolResults: [],
        citations: [],
        trace: null,
        eventLog: [],
      },
    };
  }

  const { signal, cancel } = withTimeout(input.signal, 90_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bm-request-id": requestId, "x-request-id": requestId },
      body: JSON.stringify({
        message: input.message,
        business_id: input.business_id || null,
        env_id: input.env_id || null,
        conversation_id: input.conversation_id || null,
        context_envelope: input.context_envelope || null,
        session_id: requestId,
      }),
      signal,
    });

    const trace: AssistantApiTrace = {
      requestId,
      endpoint,
      method: "POST",
      startedAt,
      durationMs: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
    };

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logClientTrace(trace);
      const hint = response.status === 404
        ? "The AI gateway backend is not running. Start it with `make backend` or set BOS_API_ORIGIN."
        : response.status === 401
          ? "Session expired. Refresh the page and sign in again."
          : errText.slice(0, 200);
      return {
        answer: `Winston is unavailable (${response.status}). ${hint}`,
        trace,
        debug: {
          contextEnvelope: input.context_envelope,
          resolvedScope: null,
          toolCalls: [],
          toolResults: [],
          citations: [],
          trace: null,
          eventLog: [],
        },
      };
    }

    // Collect SSE stream — handles both:
    //   1. FastAPI backend format: "event: token\ndata: {"text":"..."}"
    //   2. OpenAI proxy format: "data: {"choices":[{"delta":{"content":"..."}}]}"
    let answer = "";
    const debug: AskAiDebug = {
      contextEnvelope: input.context_envelope,
      resolvedScope: null,
      toolCalls: [],
      toolResults: [],
      citations: [],
      trace: null,
      eventLog: [],
    };
    let sseSeq = 0;
    const sseStartMs = Date.now();

    const logSSE = (eventType: string, parsed: unknown, summary: string) => {
      const now = Date.now();
      const evt: SSEEvent = {
        seq: sseSeq++,
        timestamp: now,
        elapsedMs: now - sseStartMs,
        eventType,
        payload: parsed,
        summary,
      };
      debug.eventLog.push(evt);
      console.log(
        `%c[Winston SSE #${evt.seq}] %c${eventType} %c+${evt.elapsedMs}ms %c${summary}`,
        "color: #888", "color: #4fc3f7; font-weight: bold", "color: #aaa", "color: #e0e0e0",
      );
    };

    const reader = response.body?.getReader();
    if (reader) {
      // Safety net: if the 90s timeout fires, force-cancel a potentially hung reader.
      // The abort signal passed to fetch() does not reliably cancel an already-received
      // response body's ReadableStream — wire it directly to reader.cancel().
      const onAbort = () => reader.cancel();
      signal.addEventListener("abort", onAbort, { once: true });
      console.group(`[Winston] SSE stream for request ${requestId}`);
      console.log(`[Winston] Message: "${input.message.slice(0, 80)}${input.message.length > 80 ? "..." : ""}"`);
      console.log(`[Winston] business_id=${input.business_id || "none"} env_id=${input.env_id || "none"} conversation_id=${input.conversation_id || "none"}`);
      const decoder = new TextDecoder();
      let currentEvent = "";
      let lineBuffer = ""; // accumulates partial lines across chunk boundaries
      let tokenCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        // Last element may be an incomplete line — keep it in the buffer
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { currentEvent = ""; continue; }
          // Track SSE event type
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === "[DONE]") {
            logSSE("stream_end", null, "Stream [DONE] signal received");
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            if (currentEvent === "context") {
              debug.contextEnvelope = parsed.context_envelope || debug.contextEnvelope;
              debug.resolvedScope = parsed.resolved_scope || null;
              logSSE("context", parsed, `scope=${parsed.resolved_scope?.resolved_scope_type || "none"} env=${parsed.resolved_scope?.environment_id || "none"}`);
            }
            // Status event — show lane/scope immediately
            else if (currentEvent === "status" && parsed.message) {
              logSSE("status", parsed, parsed.message);
              input.onStatus?.(parsed.message);
              continue;
            }
            // FastAPI "token" event: {"text": "..."}
            else if (currentEvent === "token" && parsed.text) {
              tokenCount++;
              answer += parsed.text;
              // Log first token and then every 20th to avoid spam
              if (tokenCount === 1) {
                logSSE("token", { text: parsed.text.slice(0, 50) }, `First token: "${parsed.text.slice(0, 40)}..."`);
              } else if (tokenCount % 20 === 0) {
                logSSE("token", { count: tokenCount }, `${tokenCount} tokens received, answer length=${answer.length}`);
              }
            }
            // OpenAI streaming format: {"choices":[{"delta":{"content":"..."}}]}
            else if (parsed.choices?.[0]?.delta?.content) {
              tokenCount++;
              answer += parsed.choices[0].delta.content;
              if (tokenCount === 1) {
                logSSE("openai_token", { text: parsed.choices[0].delta.content.slice(0, 50) }, `First OpenAI token (fallback path)`);
              }
            }
            // FastAPI "error" event
            else if (currentEvent === "error" && parsed.message) {
              logSSE("error", parsed, `ERROR: ${parsed.message}`);
              console.error(`[Winston SSE] Error event: ${parsed.message}`, parsed);
              answer += `\n[Error: ${parsed.message}]`;
            }
            // FastAPI tool_call event — surface as status
            else if (currentEvent === "tool_call" && parsed.tool_name) {
              debug.toolCalls.push({
                tool_name: parsed.tool_name,
                args: parsed.args,
                result_preview: parsed.result_preview,
                duration_ms: parsed.duration_ms,
                success: parsed.success,
                row_count: parsed.row_count,
                is_write: parsed.is_write,
                pending_confirmation: parsed.pending_confirmation,
              });
              const successStr = parsed.success ? "OK" : `FAIL${parsed.error ? `: ${parsed.error}` : ""}`;
              logSSE("tool_call", parsed, `${parsed.tool_name} → ${successStr} (${parsed.duration_ms || 0}ms, ${parsed.row_count ?? "?"} rows)`);
              const label = parsed.tool_name.replace(/^repe\./, "").replace(/_/g, " ");
              input.onStatus?.(`Looking up ${label}...`);
              continue;
            }
            else if (currentEvent === "tool_result" && parsed.tool_name) {
              debug.toolResults.push({
                tool_name: parsed.tool_name,
                args: parsed.args,
                result: parsed.result,
              });
              logSSE("tool_result", { tool_name: parsed.tool_name }, `Result for ${parsed.tool_name}`);
              continue;
            }
            // Write tool confirmation required — surface as status
            else if (currentEvent === "confirmation_required" && parsed.action) {
              logSSE("confirmation_required", parsed, `Action: ${parsed.action} — ${parsed.summary || "awaiting user confirmation"}`);
              input.onStatus?.(`Awaiting confirmation: ${parsed.action}`);
              continue;
            }
            // REPE fast-path structured result card
            else if (currentEvent === "structured_result" && parsed.card) {
              if (!("structuredResults" in debug)) {
                (debug as Record<string, unknown>).structuredResults = [];
              }
              ((debug as Record<string, unknown>).structuredResults as unknown[]).push(parsed);
              logSSE("structured_result", { type: parsed.result_type, title: parsed.card.title },
                `Card: ${parsed.card.title} (${parsed.result_type})`);
              continue;
            }
            // FastAPI citation/done events
            else if (currentEvent === "citation") {
              debug.citations.push(parsed);
              logSSE("citation", parsed, `chunk=${parsed.chunk_id || parsed.doc_id || "unknown"} score=${parsed.score || "?"}`);
              continue;
            }
            else if (currentEvent === "done") {
              debug.done = parsed;
              // Extract structured trace from done event
              if (parsed.trace) {
                debug.trace = parsed.trace as WinstonTrace;
              }
              const t = parsed.trace;
              logSSE("done", { lane: t?.lane, path: t?.execution_path, tools: t?.tool_call_count, elapsed: t?.elapsed_ms, tokens: t?.total_tokens },
                `Lane ${t?.lane || "?"} | ${t?.execution_path || "?"} | ${t?.tool_call_count || 0} tools | ${t?.elapsed_ms || 0}ms | ${t?.total_tokens || 0} tokens`);
              continue;
            }
            else {
              // Unknown event type — log for debugging
              logSSE(currentEvent || "unknown", parsed, `Unhandled event: ${currentEvent || "no-type"}`);
            }
          } catch {
            // JSON parse failed — only append plain text, never JSON blobs
            if (payload && payload !== "[DONE]" && !payload.startsWith("{") && !payload.startsWith("[")) {
              answer += payload;
              logSSE("text_fallback", { text: payload.slice(0, 80) }, `Plain text: "${payload.slice(0, 60)}"`);
            } else {
              logSSE("parse_error", { raw: payload.slice(0, 100) }, `Failed to parse: ${payload.slice(0, 60)}`);
            }
          }
        }
      }
      signal.removeEventListener("abort", onAbort);
      // Final summary log
      console.log(`[Winston] Stream complete: ${tokenCount} tokens, ${answer.length} chars, ${debug.toolCalls.length} tool calls, ${debug.eventLog.length} SSE events, ${Date.now() - sseStartMs}ms`);
      console.groupEnd();
    } else {
      // Non-streaming fallback
      const json = await response.json().catch(() => null);
      answer = (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || JSON.stringify(json);
    }

    trace.durationMs = Date.now() - startedAt;
    if (!answer.trim()) {
      console.warn(`[askAi] Empty response for ${requestId} after ${trace.durationMs}ms (status=${response.status})`);
    }
    logClientTrace(trace);
    return { answer: answer.trim() || "No response from Winston.", trace, debug };
  } catch (error) {
    const trace: AssistantApiTrace = {
      requestId,
      endpoint,
      method: "POST",
      startedAt,
      durationMs: Date.now() - startedAt,
      status: 0,
      ok: false,
    };
    logClientTrace(trace);
    return {
      answer: error instanceof Error ? `Winston error: ${error.message}` : "Winston encountered an error.",
      trace,
      debug: {
        contextEnvelope: input.context_envelope,
        resolvedScope: null,
        toolCalls: [],
        toolResults: [],
        citations: [],
        trace: null,
        eventLog: [],
      },
    };
  } finally {
    cancel();
  }
}

// ── Conversation management ─────────────────────────────────────────────────

export type ConversationSummary = {
  conversation_id: string;
  title: string | null;
  message_count: number;
  updated_at: string | null;
  archived: boolean;
};

export type ConversationDetail = {
  conversation_id: string;
  business_id: string;
  title: string | null;
  messages: Array<{
    message_id: string;
    role: string;
    content: string;
    created_at: string | null;
  }>;
};

export async function createConversation(input: {
  business_id: string;
  env_id?: string;
}): Promise<ConversationDetail> {
  const res = await fetch("/api/ai/gateway/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: input.business_id,
      env_id: input.env_id || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  return res.json();
}

export async function listConversations(
  businessId: string,
): Promise<ConversationSummary[]> {
  const res = await fetch(
    `/api/ai/gateway/conversations?business_id=${encodeURIComponent(businessId)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.conversations || [];
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const res = await fetch(`/api/ai/gateway/conversations/${conversationId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function archiveConversation(conversationId: string): Promise<void> {
  await fetch(`/api/ai/gateway/conversations/${conversationId}`, {
    method: "DELETE",
  });
}
