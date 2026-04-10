import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

/**
 * Authoritative State Lockdown — Phase 3 single fetch layer.
 *
 * GET /api/re/v2/authoritative-state/{fund|investment|asset}/{entityId}/{quarter}
 *
 * Mirrors the FastAPI contract at backend/app/routes/re_authoritative.py
 * by querying the same `re_authoritative_*_state_qtr` tables directly.
 * The UI hits this Next.js route so it does not depend on FastAPI being
 * reachable from the public origin.
 *
 * Always returns:
 *   - entity_type, entity_id, requested_quarter, quarter
 *   - period_exact: bool
 *   - state_origin: "authoritative" | "fallback"
 *   - snapshot_version, audit_run_id, promotion_state, trust_status
 *   - canonical_metrics + display_metrics + null_reasons + formulas + provenance
 *   - For fund entities: gross_to_net_bridge
 *
 * See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
 */

const TABLE_BY_ENTITY = {
  fund: { table: "re_authoritative_fund_state_qtr", idColumn: "fund_id" },
  investment: { table: "re_authoritative_investment_state_qtr", idColumn: "investment_id" },
  asset: { table: "re_authoritative_asset_state_qtr", idColumn: "asset_id" },
} as const;

type EntityType = keyof typeof TABLE_BY_ENTITY;

function isEntityType(value: string): value is EntityType {
  return value === "fund" || value === "investment" || value === "asset";
}

function buildMissingState(args: {
  entityType: EntityType;
  entityId: string;
  quarter: string;
  reason: string;
}) {
  return {
    entity_type: args.entityType,
    entity_id: args.entityId,
    quarter: args.quarter,
    requested_quarter: args.quarter,
    period_exact: false,
    state_origin: "fallback" as const,
    audit_run_id: null,
    snapshot_version: null,
    promotion_state: null,
    trust_status: "missing_source" as const,
    breakpoint_layer: null,
    null_reason: args.reason,
    state: null,
    null_reasons: { state: args.reason },
    formulas: {},
    provenance: [],
    artifact_paths: {},
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { entityType: string; entityId: string; quarter: string } },
) {
  if (!isEntityType(params.entityType)) {
    return Response.json(
      { error_code: "INVALID_ENTITY_TYPE", message: `Unknown entity_type: ${params.entityType}` },
      { status: 400 },
    );
  }
  const entityType: EntityType = params.entityType;
  const entityId = params.entityId;
  const quarter = params.quarter;

  const url = new URL(request.url);
  const snapshotVersion = url.searchParams.get("snapshot_version");
  const auditRunId = url.searchParams.get("audit_run_id");

  const pool = getPool();
  if (!pool) {
    return Response.json(
      buildMissingState({
        entityType,
        entityId,
        quarter,
        reason: "database_not_available",
      }),
    );
  }

  const config = TABLE_BY_ENTITY[entityType];

  // Build the WHERE clause: by default we require promotion_state =
  // 'released'. If the caller supplied snapshot_version or audit_run_id
  // explicitly, we honor that filter and skip the released-only gate.
  const filters: string[] = [
    `${config.idColumn} = $1::uuid`,
    `quarter = $2`,
  ];
  const values: (string | null)[] = [entityId, quarter];
  if (snapshotVersion) {
    filters.push(`snapshot_version = $${values.length + 1}`);
    values.push(snapshotVersion);
  }
  if (auditRunId) {
    filters.push(`audit_run_id = $${values.length + 1}::uuid`);
    values.push(auditRunId);
  }
  if (!snapshotVersion && !auditRunId) {
    filters.push(`promotion_state = 'released'`);
  }

  try {
    const stateRes = await pool.query(
      `
      SELECT
        ${config.idColumn} AS entity_id,
        audit_run_id::text AS audit_run_id,
        snapshot_version,
        promotion_state,
        trust_status,
        breakpoint_layer,
        quarter,
        period_start,
        period_end,
        canonical_metrics,
        display_metrics,
        null_reasons,
        formulas,
        provenance,
        artifact_paths,
        created_at
      FROM ${config.table}
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 1
      `,
      values,
    );
    const row = stateRes.rows[0];

    if (!row) {
      const reason =
        !snapshotVersion && !auditRunId
          ? "authoritative_state_not_released"
          : "authoritative_state_not_found";
      return Response.json(buildMissingState({ entityType, entityId, quarter, reason }));
    }

    const returnedQuarter: string = row.quarter;
    const periodExact = returnedQuarter === quarter;

    const state: Record<string, unknown> = {
      period_start: row.period_start,
      period_end: row.period_end,
      canonical_metrics: row.canonical_metrics ?? {},
      display_metrics: row.display_metrics ?? {},
    };

    if (entityType === "fund") {
      const bridgeRes = await pool.query(
        `
        SELECT
          audit_run_id::text AS audit_run_id,
          snapshot_version,
          promotion_state,
          trust_status,
          breakpoint_layer,
          gross_return_amount::text AS gross_return_amount,
          management_fees::text AS management_fees,
          fund_expenses::text AS fund_expenses,
          net_return_amount::text AS net_return_amount,
          bridge_items,
          formulas,
          null_reasons,
          provenance,
          artifact_paths
        FROM re_authoritative_fund_gross_to_net_qtr
        WHERE fund_id = $1::uuid
          AND quarter = $2
          AND snapshot_version = $3
          AND audit_run_id = $4::uuid
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [entityId, quarter, row.snapshot_version, row.audit_run_id],
      );
      const bridgeRow = bridgeRes.rows[0];
      if (bridgeRow) {
        state.gross_to_net_bridge = {
          gross_return_amount: bridgeRow.gross_return_amount,
          management_fees: bridgeRow.management_fees,
          fund_expenses: bridgeRow.fund_expenses,
          net_return_amount: bridgeRow.net_return_amount,
          bridge_items: bridgeRow.bridge_items ?? [],
          formulas: bridgeRow.formulas ?? {},
          null_reasons: bridgeRow.null_reasons ?? {},
          provenance: bridgeRow.provenance ?? [],
        };
      }
    }

    return Response.json({
      entity_type: entityType,
      entity_id: entityId,
      quarter: returnedQuarter,
      requested_quarter: quarter,
      period_exact: periodExact,
      state_origin: "authoritative" as const,
      audit_run_id: row.audit_run_id,
      snapshot_version: row.snapshot_version,
      promotion_state: row.promotion_state,
      trust_status: row.trust_status,
      breakpoint_layer: row.breakpoint_layer,
      null_reason: null,
      state,
      null_reasons: row.null_reasons ?? {},
      formulas: row.formulas ?? {},
      provenance: row.provenance ?? [],
      artifact_paths: row.artifact_paths ?? {},
    });
  } catch (err) {
    console.error("[re/v2/authoritative-state] DB error", err);
    return Response.json(
      buildMissingState({
        entityType,
        entityId,
        quarter,
        reason: "authoritative_state_lookup_failed",
      }),
    );
  }
}
