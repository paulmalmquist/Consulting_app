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

export type StructuredResultCard = {
  title: string;
  subtitle?: string;
  metrics?: StructuredResultMetric[];
  parameters?: Record<string, string | null>;
  actions?: StructuredResultAction[];
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

export function loadHistory(contextKey: CommandContextKey): CommandMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(historyStorageKey(contextKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CommandMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.id === "string" &&
        (item.role === "user" || item.role === "assistant" || item.role === "system") &&
        typeof item.content === "string" &&
        typeof item.createdAt === "number"
    );
  } catch {
    return [];
  }
}

export function persistHistory(contextKey: CommandContextKey, messages: CommandMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(historyStorageKey(contextKey), JSON.stringify(messages));
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
