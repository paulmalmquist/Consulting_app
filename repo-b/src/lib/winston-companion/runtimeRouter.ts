/**
 * Runtime selection for the dual-runtime Winston chat surface.
 *
 *  - "gateway"        → existing OpenAI/FastAPI gateway (`/api/ai/gateway/*`).
 *  - "managed_agent"  → Operator runtime backed by the Anthropic Managed Agent
 *                       (`/api/ai/operator/*`).
 *  - "auto"           → scaffolded; backend re-evaluates and is the source of
 *                       truth. Until WINSTON_AUTO_ROUTER_ENABLED flips on, the
 *                       backend silently falls back to "gateway", but the
 *                       routing decision is recorded for future training data.
 *
 * Persistence: localStorage key `winston_runtime`. Cross-component sync is via
 * the `winston-runtime-changed` window event so any pill, badge, or provider
 * subscribed via `subscribeRuntime` stays in lockstep.
 *
 * Query-string override: `?runtime=operator|gateway|auto` updates localStorage
 * AND the resolved runtime, so a teammate can hand someone a deep link to flip
 * runtimes without changing settings.
 */

export type WinstonRuntime = "gateway" | "managed_agent" | "auto";

const STORAGE_KEY = "winston_runtime";
const QUERY_KEY = "runtime";
const EVENT_NAME = "winston-runtime-changed";

export function resolveRuntime(): WinstonRuntime {
  if (typeof window === "undefined") return "gateway";

  // Query param wins and persists, so the URL is always self-explanatory.
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get(QUERY_KEY);
    if (param === "operator" || param === "managed_agent") {
      window.localStorage.setItem(STORAGE_KEY, "managed_agent");
      return "managed_agent";
    }
    if (param === "gateway") {
      window.localStorage.setItem(STORAGE_KEY, "gateway");
      return "gateway";
    }
    if (param === "auto") {
      window.localStorage.setItem(STORAGE_KEY, "auto");
      return "auto";
    }
  } catch {
    // URL parse failure — fall through to localStorage.
  }

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored === "managed_agent" || stored === "auto") return stored;
  return "gateway";
}

export function setRuntime(runtime: WinstonRuntime): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, runtime);
  } catch {
    // Private mode etc. — propagate via event regardless.
  }
  try {
    window.dispatchEvent(new CustomEvent<WinstonRuntime>(EVENT_NAME, { detail: runtime }));
  } catch {
    // CustomEvent unavailable in some embedded contexts; ignore.
  }
}

export function subscribeRuntime(cb: (r: WinstonRuntime) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<WinstonRuntime>).detail;
    if (detail === "gateway" || detail === "managed_agent" || detail === "auto") {
      cb(detail);
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/**
 * True when the operator transport should handle the request. Conservative by
 * design: only "managed_agent" routes to operator. "auto" stays on the
 * gateway transport but tags the request with `routing_hint: { runtime:
 * "auto" }` so the backend logs the would-be auto-router decision into
 * receipts for future training data. When `WINSTON_AUTO_ROUTER_ENABLED=true`
 * is added at a later phase, this function will widen to include "auto".
 */
export function isOperatorActive(runtime: WinstonRuntime): boolean {
  return runtime === "managed_agent";
}

export const WINSTON_RUNTIME_STORAGE_KEY = STORAGE_KEY;
export const WINSTON_RUNTIME_EVENT_NAME = EVENT_NAME;
