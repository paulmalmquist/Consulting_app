/**
 * Timeout support shared by the fetch helpers (apiFetch, bosFetch).
 *
 * `timeoutMs` option contract:
 *   undefined → the calling helper's default (apiFetch: 30s; bosFetch: none)
 *   number >0 → that many milliseconds
 *   null | 0  → no timeout (for AI/generation routes that legitimately run long)
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  readonly isTimeout = true;
  readonly timeoutMs?: number;

  constructor(message: string, timeoutMs?: number) {
    super(message);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isFetchTimeoutError(err: unknown): err is FetchTimeoutError {
  return (
    err instanceof FetchTimeoutError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { isTimeout?: boolean }).isTimeout === true)
  );
}

/** True when an error is a fetch abort (the shape thrown when an AbortSignal fires). */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AbortError"
  );
}

/**
 * Resolve a `timeoutMs` option against a helper default and produce an AbortSignal.
 * `fallbackMs` is the default applied when `timeoutMs` is undefined.
 * Returns `signal: undefined` when no timeout applies.
 */
export function createTimeoutSignal(
  timeoutMs: number | null | undefined,
  fallbackMs: number | null,
): { signal: AbortSignal | undefined; timeoutMs: number | null; clear: () => void } {
  const resolved = timeoutMs === undefined ? fallbackMs : timeoutMs;
  if (resolved === null || resolved <= 0) {
    return { signal: undefined, timeoutMs: null, clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolved);
  return {
    signal: controller.signal,
    timeoutMs: resolved,
    clear: () => clearTimeout(timer),
  };
}
