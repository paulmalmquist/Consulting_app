export type CommandContextKey = `env:${string}` | `biz:${string}` | "global";

export type StructuredResultAction = {
  label: string;
  action: string;
  params?: Record<string, unknown>;
};

export type StructuredResultMetric = {
  label: string;
  value: string | null;
  delta?: { value: string; direction: "positive" | "negative" } | null;
};

export type StructuredResultPrimitive = string | number | boolean | null;

export type StructuredResultTable = {
  columns: string[];
  rows: Array<Record<string, StructuredResultPrimitive>>;
};

export type StructuredResultHeatmap = {
  title?: string;
  col_headers: string[];
  row_headers: string[];
  rows: Array<Array<StructuredResultPrimitive>>;
  base_value?: StructuredResultPrimitive;
  value_suffix?: string;
};

export type StructuredResultSection = {
  title: string;
  content: string;
};

export type StructuredResultCard = {
  title: string;
  subtitle?: string;
  metrics?: StructuredResultMetric[];
  parameters?: Record<string, string | null>;
  actions?: StructuredResultAction[];
  table?: StructuredResultTable | null;
  heatmap?: StructuredResultHeatmap | null;
  sections?: StructuredResultSection[] | null;
  session_waterfall_runs?: WaterfallRunSummary[] | null;
  // Specialized sections
  tiers?: Array<Record<string, string>>;
  partners?: Array<Record<string, string | null>>;
  assets?: Array<Record<string, string | null>>;
  scenarios?: Array<Record<string, string | null>>;
};

export type StructuredResult = {
  result_type: string;
  card: StructuredResultCard;
};

export type WaterfallRunSummary = {
  run_id: string;
  fund_id?: string;
  fund_name?: string | null;
  scenario_name?: string | null;
  quarter?: string | null;
  key_metrics?: {
    nav?: string | number | null;
    irr?: string | number | null;
    tvpi?: string | number | null;
    carry?: string | number | null;
  };
  overrides?: Record<string, unknown>;
  created_at?: string | null;
};

export type CommandMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  kind?: "text" | "plan" | "run" | "verification";
  planId?: string | null;
  runId?: string | null;
  structuredResult?: StructuredResult | null;
};

export type CommandHistoryState = {
  messages: CommandMessage[];
  waterfallRuns: WaterfallRunSummary[];
};

export function resolveCommandContext(): CommandContextKey {
  if (typeof window === "undefined") return "global";

  const routeEnvMatch = window.location.pathname.match(/^\/lab\/env\/([^/]+)/);
  const envId =
    routeEnvMatch?.[1] || window.localStorage.getItem("demo_lab_env_id");
  if (envId) return `env:${envId}`;

  const businessId = window.localStorage.getItem("bos_business_id");
  if (businessId) return `biz:${businessId}`;

  return "global";
}

export function historyStorageKey(contextKey: CommandContextKey): string {
  return `commandbar_history_${contextKey}`;
}

export function loadHistoryState(contextKey: CommandContextKey): CommandHistoryState {
  if (typeof window === "undefined") return { messages: [], waterfallRuns: [] };
  try {
    const raw = window.localStorage.getItem(historyStorageKey(contextKey));
    if (!raw) return { messages: [], waterfallRuns: [] };
    const parsed = JSON.parse(raw) as CommandHistoryState | CommandMessage[];
    const messages = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.messages)
        ? parsed.messages
        : [];
    const waterfallRuns = !Array.isArray(parsed) && Array.isArray(parsed?.waterfallRuns)
      ? parsed.waterfallRuns
      : [];
    return {
      messages: messages.filter(
      (item) =>
        typeof item.id === "string" &&
        (item.role === "user" || item.role === "assistant" || item.role === "system") &&
        typeof item.content === "string" &&
        typeof item.createdAt === "number"
      ),
      waterfallRuns,
    };
  } catch {
    return { messages: [], waterfallRuns: [] };
  }
}

export function loadHistory(contextKey: CommandContextKey): CommandMessage[] {
  return loadHistoryState(contextKey).messages;
}

export function persistHistoryState(contextKey: CommandContextKey, state: CommandHistoryState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(historyStorageKey(contextKey), JSON.stringify(state));
}

export function persistHistory(contextKey: CommandContextKey, messages: CommandMessage[]) {
  persistHistoryState(contextKey, { messages, waterfallRuns: [] });
}

export function makeMessage(
  role: CommandMessage["role"],
  content: string,
  id?: string
): CommandMessage {
  return {
    id:
      id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `msg_${Math.random().toString(16).slice(2)}_${Date.now()}`),
    role,
    content,
    createdAt: Date.now(),
  };
}
