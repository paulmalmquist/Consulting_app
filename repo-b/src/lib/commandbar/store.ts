export type CommandContextKey = `env:${string}` | `biz:${string}` | "global";

export type CommandMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};

export function resolveCommandContext(): CommandContextKey {
  if (typeof window === "undefined") return "global";

  const envId = window.localStorage.getItem("lab_active_env_id");
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
