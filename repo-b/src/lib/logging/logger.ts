export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const REDACT_PATTERN = /token|authorization|cookie|secret|password|key/i;

function isoNow(): string {
  return new Date().toISOString();
}

function redactValue(key: string, value: unknown): unknown {
  if (REDACT_PATTERN.test(key)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(entries.map(([k, v]) => [k, redactValue(k, v)]));
  }
  return value;
}

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context || {}).map(([k, v]) => [k, redactValue(k, v)])
  );
}

function currentRunId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("bm_run_id");
  } catch {
    return null;
  }
}

function currentRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.location.pathname;
  } catch {
    return null;
  }
}

function shouldLog(): boolean {
  return process.env.NODE_ENV !== "production";
}

function emit(level: LogLevel, action: string, message: string, context: LogContext = {}): void {
  if (!shouldLog()) return;

  const payload = {
    ts: isoNow(),
    level,
    service: "frontend",
    env_id: null,
    business_id: null,
    user: "anonymous",
    request_id: typeof context.request_id === "string" ? context.request_id : null,
    run_id: currentRunId(),
    action,
    message,
    context: sanitizeContext({ route: currentRoute(), ...context }),
    duration_ms: typeof context.duration_ms === "number" ? context.duration_ms : null,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

export function logDebug(action: string, message: string, context: LogContext = {}): void {
  emit("debug", action, message, context);
}

export function logInfo(action: string, message: string, context: LogContext = {}): void {
  emit("info", action, message, context);
}

export function logWarn(action: string, message: string, context: LogContext = {}): void {
  emit("warn", action, message, context);
}

export function logError(action: string, message: string, context: LogContext = {}): void {
  emit("error", action, message, context);
}
