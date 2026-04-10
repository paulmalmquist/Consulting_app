import type { Pool } from "pg";

/**
 * Authoritative State Lockdown — UI side helper.
 *
 * See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariants 1, 2, 5).
 *
 * Legacy / base-scenario / metrics-detail routes call this helper before
 * computing a value. If a released authoritative snapshot exists for the
 * requested (entity, quarter), the legacy route MUST NOT serve a value
 * — it returns a 409 with a redirect to the snapshot contract.
 *
 * This is the runtime enforcement for STATE LOCK. The companion CI lint
 * is verification/lint/no_legacy_repe_reads.py.
 */

const TABLE_BY_ENTITY: Record<"fund" | "investment" | "asset", { table: string; idColumn: string }> = {
  fund: { table: "re_authoritative_fund_state_qtr", idColumn: "fund_id" },
  investment: {
    table: "re_authoritative_investment_state_qtr",
    idColumn: "investment_id",
  },
  asset: { table: "re_authoritative_asset_state_qtr", idColumn: "asset_id" },
};

export type LockedEntity = keyof typeof TABLE_BY_ENTITY;

export type ReleasedSnapshotLock = {
  snapshotVersion: string;
  auditRunId: string;
  promotionState: string;
};

/**
 * Returns the released snapshot version + audit run id for a given
 * (entity, quarter) if one exists, or null if no released snapshot
 * blocks the legacy path.
 */
export async function checkReleasedStateLock(
  pool: Pool,
  entityType: LockedEntity,
  entityId: string,
  quarter: string,
): Promise<ReleasedSnapshotLock | null> {
  const config = TABLE_BY_ENTITY[entityType];
  const result = await pool.query(
    `
    SELECT snapshot_version,
           audit_run_id::text AS audit_run_id,
           promotion_state
    FROM ${config.table}
    WHERE ${config.idColumn} = $1::uuid
      AND quarter = $2
      AND promotion_state = 'released'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [entityId, quarter],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    snapshotVersion: row.snapshot_version,
    auditRunId: row.audit_run_id,
    promotionState: row.promotion_state,
  };
}

/**
 * Build a 409 Response that redirects the caller to the authoritative
 * state contract. Used by legacy routes that detect a released lock.
 */
export function buildStateLockViolationResponse(args: {
  entityType: LockedEntity;
  entityId: string;
  quarter: string;
  lock: ReleasedSnapshotLock;
}): Response {
  const { entityType, entityId, quarter, lock } = args;
  const redirectPath = `/api/re/v2/authoritative-state/${entityType}/${entityId}/${quarter}`;
  const body = {
    error: "state_lock_violation",
    message:
      "A released authoritative snapshot exists for this period. Per the " +
      "Authoritative State Lockdown rules, legacy routes must not compete " +
      "with released snapshots. Read the authoritative-state contract instead.",
    entity_type: entityType,
    entity_id: entityId,
    quarter,
    snapshot_version: lock.snapshotVersion,
    audit_run_id: lock.auditRunId,
    redirect: redirectPath,
  };
  return new Response(JSON.stringify(body), {
    status: 409,
    headers: {
      "content-type": "application/json",
      "x-state-lock-violation": "true",
      "x-snapshot-version": lock.snapshotVersion,
      "x-redirect-to": redirectPath,
    },
  });
}
