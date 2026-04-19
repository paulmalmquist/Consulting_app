/**
 * Authoritative metric contract guard.
 *
 * Every REPE fund-level KPI value rendered to the UI MUST first pass
 * through this guard. If the backing authoritative state is unreleased,
 * origin-drifted, period-drifted, or carries a null_reason, the guard
 * refuses to hand out a numeric value.
 *
 * Contract (all three are hard, not warnings):
 *   1. source_origin === "authoritative"
 *   2. promotion_state === "released"
 *   3. If a field's null_reason is present, that field is forbidden from
 *      any numeric render path.
 *
 * Behavior:
 *   - Dev (NODE_ENV !== "production"): contract violations THROW so the
 *     page blows up loudly the moment someone wires the wrong fetcher.
 *   - Prod: contract violations return the sentinel
 *     { kind: "unavailable", nullReason } and emit a structured
 *     ui_contract_violation log event so a bad fetcher at 2am does not
 *     black-screen the live app but also cannot silently print junk.
 *
 * Usage:
 *
 *   const cell = renderAuthoritativeMetric(state, "gross_irr", fmtPct);
 *   // cell is either { kind: "value", value: "12.8%" } or
 *   //                { kind: "unavailable", nullReason: "..." }
 *
 *   if (cell.kind === "value") <span>{cell.value}</span>
 *   else <UnavailableCell nullReason={cell.nullReason} />
 */

import type { LockState } from "@/hooks/useAuthoritativeState";
import type { ReV2AuthoritativeState } from "@/lib/bos-api";

// ── Result shape ────────────────────────────────────────────────────────────

export type MetricCell<V> =
  | { kind: "value"; value: V }
  | { kind: "unavailable"; nullReason: string };

// ── Contract violation types ────────────────────────────────────────────────

export class AuthoritativeMetricContractError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(`[AuthoritativeMetricContract:${code}] ${message}`);
    this.name = "AuthoritativeMetricContractError";
    this.code = code;
    this.context = context;
  }
}

// ── Dev vs prod behavior switch ─────────────────────────────────────────────

function isDev(): boolean {
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV) {
    return process.env.NODE_ENV !== "production";
  }
  return true; // default to dev-strict if we can't detect
}

function emitContractViolation(code: string, context: Record<string, unknown>): void {
  // Structured log — picked up by the app's telemetry adapter if present.
  if (typeof console !== "undefined" && console.error) {
    console.error("[ui_contract_violation]", { code, ...context });
  }
}

type Rejection = { kind: "unavailable"; nullReason: string };

function reject(code: string, message: string, context: Record<string, unknown>): Rejection {
  if (isDev()) {
    throw new AuthoritativeMetricContractError(code, message, context);
  }
  emitContractViolation(code, { message, ...context });
  return { kind: "unavailable", nullReason: code };
}

// ── Core guard: does this state allow ANY metric to render? ─────────────────

export interface AuthoritativeStateLike {
  state_origin?: unknown;
  promotion_state?: unknown;
  period_exact?: unknown;
  null_reason?: string | null;
  null_reasons?: Record<string, unknown> | null | undefined;
  state?: { canonical_metrics?: Record<string, unknown> | null } | null;
}

export interface AssertAuthoritativeMetricOptions {
  /**
   * Which metric key we are about to render. Used for field-level
   * null_reason lookup and for contract-violation telemetry.
   */
  field: string;
  /**
   * Optional entity label for better error messages.
   */
  entityLabel?: string;
}

/**
 * Pure guard — returns a discriminated union. Never throws on callable
 * misuse (those throw); only throws on contract violations in dev.
 *
 * Caller is responsible for extracting the raw value from
 * state.canonical_metrics[field] and formatting it.
 */
export function assertAuthoritativeMetric(
  state: AuthoritativeStateLike | null | undefined,
  opts: AssertAuthoritativeMetricOptions,
): { kind: "allowed"; value: unknown } | Rejection {
  const { field, entityLabel } = opts;
  const ctx = { field, entityLabel };

  // 0. State must be present.
  if (!state) {
    return reject(
      "missing_state",
      `No authoritative state returned for ${entityLabel ?? "entity"}`,
      ctx,
    );
  }

  // 1. INV-1: source_origin must be "authoritative".
  if (state.state_origin !== "authoritative") {
    return reject(
      "non_authoritative_origin",
      `state_origin is ${state.state_origin ?? "<missing>"}, expected "authoritative"`,
      { ...ctx, state_origin: state.state_origin },
    );
  }

  // 2. INV-2: period_exact must be true.
  if (state.period_exact !== true) {
    return reject(
      "period_drift",
      `period_exact is false — refusing to render across period drift`,
      ctx,
    );
  }

  // 3. Promotion state must be "released".
  if (state.promotion_state !== "released") {
    return { kind: "unavailable", nullReason: "authoritative_state_not_released" };
  }

  // 4. Top-level null_reason forbids ALL metric rendering.
  if (state.null_reason) {
    return { kind: "unavailable", nullReason: state.null_reason };
  }

  // 5. Field-level null_reasons forbid THIS field.
  const fieldReasons = state.null_reasons;
  if (fieldReasons && typeof fieldReasons === "object") {
    const fieldReason = (fieldReasons as Record<string, unknown>)[field];
    if (typeof fieldReason === "string" && fieldReason.length > 0) {
      return { kind: "unavailable", nullReason: fieldReason };
    }
  }

  // 6. State payload must exist and carry canonical_metrics.
  const canonical = state.state?.canonical_metrics;
  if (!canonical) {
    return reject(
      "missing_canonical_metrics",
      `state.canonical_metrics is missing`,
      ctx,
    );
  }

  // 7. Per-metric trust gate (Phase 3e).
  // Snapshots emitted by derive_fund_trust_fields() carry an explicit
  // trust state per metric. If the writer flagged this metric as anything
  // other than "trusted", refuse to render regardless of value presence.
  // Precedence: release_state → top null_reason → field null_reason →
  //             per-metric trust_state → value presence.
  const trustField = _trustFieldFor(field);
  if (trustField) {
    const trust = canonical[trustField];
    if (trust !== undefined && trust !== null && trust !== "trusted") {
      // trust key shape: <prefix>_trust_state → reason key <prefix>_reason
      // e.g. irr_trust_state → irr_reason, net_irr_trust_state → net_irr_reason
      const reasonKey = trustField.replace(/_trust_state$/, "_reason");
      const explicitReason = canonical[reasonKey];
      const nullReason =
        typeof explicitReason === "string" && explicitReason.length > 0
          ? explicitReason
          : `metric_not_trusted:${field}`;
      return { kind: "unavailable", nullReason };
    }
  }

  // 8. Extract the value. A missing/null value is "unavailable by design".
  const raw = canonical[field];
  if (raw === null || raw === undefined) {
    return { kind: "unavailable", nullReason: `missing:${field}` };
  }

  return { kind: "allowed", value: raw };
}

/**
 * Map a metric field name to the canonical_metrics key that holds its
 * trust state, per the snapshot contract emitted by
 * derive_fund_trust_fields() in verification/runners/.
 *
 * Returns null for fields not covered by the trust model — those stay
 * on the old gate chain (release + null_reason + value presence).
 */
function _trustFieldFor(field: string): string | null {
  if (field === "gross_irr" || field === "irr") return "irr_trust_state";
  if (field === "net_irr") return "net_irr_trust_state";
  if (field === "dscr" || field === "weighted_dscr") return "dscr_trust_state";
  return null;
}

// ── Render helper: guard + formatter in one call ────────────────────────────

/**
 * Compose assertAuthoritativeMetric with a formatter. Returns a
 * MetricCell that the caller can discriminate on.
 *
 * The formatter runs ONLY on an allowed value. If formatting itself
 * throws (bad input), the cell falls through to "unavailable" with
 * nullReason = "formatter_error" (dev: throws; prod: logs).
 */
export function renderAuthoritativeMetric<V>(
  state: AuthoritativeStateLike | null | undefined,
  field: string,
  formatter: (value: unknown) => V,
  opts: { entityLabel?: string } = {},
): MetricCell<V> {
  const guard = assertAuthoritativeMetric(state, { field, entityLabel: opts.entityLabel });
  if (guard.kind === "unavailable") return guard;
  try {
    return { kind: "value", value: formatter(guard.value) };
  } catch (err) {
    if (isDev()) {
      throw new AuthoritativeMetricContractError(
        "formatter_error",
        `Formatter threw on ${field}: ${err instanceof Error ? err.message : String(err)}`,
        { field, value: guard.value },
      );
    }
    emitContractViolation("formatter_error", {
      field,
      value: guard.value,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: "unavailable", nullReason: "formatter_error" };
  }
}

// ── Lock-state helper: quick check for "is the whole state safe to read" ───

/**
 * If you already have a LockState from useAuthoritativeState, this is
 * the one-line gate. Returns true only when rendering any numeric metric
 * is permitted.
 */
export function isRenderable(lockState: LockState): boolean {
  return lockState === "released";
}
