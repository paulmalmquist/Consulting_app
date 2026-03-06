import type { CommandContext, ContextSnapshot, ExecutionPlan, RunStatus } from "@/lib/commandbar/types";
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
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<{ answer: string; trace: AssistantApiTrace }> {
  const requestId = nextRequestId();
  const startedAt = Date.now();
  const endpoint = "/api/ai/gateway/ask";

  if (USE_MOCKS) {
    return {
      answer: `[Mock] Winston would analyze: "${input.message}". In production this calls the AI gateway.`,
      trace: { requestId, endpoint, method: "POST", startedAt, durationMs: 10, status: 200, ok: true },
    };
  }

  const { signal, cancel } = withTimeout(input.signal, 90_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bm-request-id": requestId },
      body: JSON.stringify({
        message: input.message,
        business_id: input.business_id || null,
        env_id: input.env_id || null,
        conversation_id: input.conversation_id || null,
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
      };
    }

    // Collect SSE stream — handles both:
    //   1. FastAPI backend format: "event: token\ndata: {"text":"..."}"
    //   2. OpenAI proxy format: "data: {"choices":[{"delta":{"content":"..."}}]}"
    let answer = "";
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let currentEvent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) { currentEvent = ""; continue; }
          // Track SSE event type
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            // FastAPI "token" event: {"text": "..."}
            if (currentEvent === "token" && parsed.text) {
              answer += parsed.text;
            }
            // OpenAI streaming format: {"choices":[{"delta":{"content":"..."}}]}
            else if (parsed.choices?.[0]?.delta?.content) {
              answer += parsed.choices[0].delta.content;
            }
            // FastAPI "error" event
            else if (currentEvent === "error" && parsed.message) {
              answer += `\n[Error: ${parsed.message}]`;
            }
            // FastAPI tool_call event — surface as status
            else if (currentEvent === "tool_call" && parsed.tool_name) {
              const label = parsed.tool_name.replace(/^repe\./, "").replace(/_/g, " ");
              input.onStatus?.(`Looking up ${label}...`);
              continue;
            }
            // FastAPI citation/done events — silently consume
            else if (currentEvent === "citation" || currentEvent === "done") {
              continue;
            }
          } catch {
            if (payload && payload !== "[DONE]") answer += payload;
          }
        }
      }
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
    return { answer: answer.trim() || "No response from Winston.", trace };
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
