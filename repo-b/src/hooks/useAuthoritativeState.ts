"use client";

import { useEffect, useState } from "react";

import {
  getReV2AuthoritativeState,
  type ReV2AuthoritativeState,
  type ReV2AuthoritativeEntityType,
} from "@/lib/bos-api";

/**
 * Authoritative State Lockdown — Phase 3 single fetch hook.
 *
 * The ONLY entry point any REPE page may use to render financial KPIs
 * (TVPI, IRR, NOI, asset counts, gross-to-net bridge). Per
 * docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md, components must consult
 * `lockState` and refuse to render financial values when it is anything
 * other than "released".
 *
 * lockState semantics:
 *   - "loading"          — fetch in flight
 *   - "released"         — promotion_state=released, period_exact=true,
 *                          state_origin=authoritative. Safe to render.
 *   - "verified"         — snapshot exists but not released. UI should
 *                          render an empty state with a "verification
 *                          pending" message.
 *   - "not_released"     — null_reason=authoritative_state_not_released.
 *                          UI should render the empty state with the
 *                          reason.
 *   - "not_found"        — null_reason=authoritative_state_not_found
 *                          (explicit version/run id requested but absent).
 *   - "period_drift"    — a row was returned but for a different
 *                          quarter than requested. Refuse to render.
 *   - "error"            — fetch failed.
 */
export type LockState =
  | "loading"
  | "released"
  | "verified"
  | "not_released"
  | "not_found"
  | "period_drift"
  | "error";

export interface UseAuthoritativeStateResult {
  state: ReV2AuthoritativeState | null;
  loading: boolean;
  error: string | null;
  lockState: LockState;
}

export function useAuthoritativeState(args: {
  entityType: ReV2AuthoritativeEntityType;
  entityId: string | null | undefined;
  quarter: string | null | undefined;
  snapshotVersion?: string;
  auditRunId?: string;
}): UseAuthoritativeStateResult {
  const { entityType, entityId, quarter, snapshotVersion, auditRunId } = args;
  const [state, setState] = useState<ReV2AuthoritativeState | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(entityId && quarter));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId || !quarter) {
      setState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReV2AuthoritativeState({
      entityType,
      entityId,
      quarter,
      snapshotVersion,
      auditRunId,
    })
      .then((result) => {
        if (cancelled) return;
        setState(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setState(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, quarter, snapshotVersion, auditRunId]);

  const lockState = computeLockState({ loading, error, state });

  return { state, loading, error, lockState };
}

function computeLockState(args: {
  loading: boolean;
  error: string | null;
  state: ReV2AuthoritativeState | null;
}): LockState {
  if (args.loading) return "loading";
  if (args.error) return "error";
  if (!args.state) return "error";
  const s = args.state;
  if (s.null_reason === "authoritative_state_not_released") return "not_released";
  if (s.null_reason === "authoritative_state_not_found") return "not_found";
  if (s.null_reason) return "not_released";
  if (!s.period_exact) return "period_drift";
  if (s.state_origin !== "authoritative") return "period_drift";
  if (s.promotion_state === "released") return "released";
  if (s.promotion_state === "verified") return "verified";
  return "not_released";
}

/**
 * Helper for KPI components: returns true only when it is safe to
 * render an authoritative financial value. Components should fall back
 * to an empty state for any other lockState.
 */
export function isLockStateRenderable(lockState: LockState): boolean {
  return lockState === "released";
}
