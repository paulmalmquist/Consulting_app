import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/returns/[quarter]
 *
 * Reads the released authoritative fund state plus the released structured
 * gross-to-net bridge for the same quarter.
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      metrics: null,
      bridge: null,
      benchmark: null,
      null_reason: "database_not_available",
      trust_status: "missing_source",
    });
  }

  try {
    const metricsRes = await pool.query(
      `
      SELECT
        audit_run_id::text,
        snapshot_version,
        promotion_state,
        trust_status,
        breakpoint_layer,
        canonical_metrics,
        artifact_paths
      FROM re_authoritative_fund_state_qtr
      WHERE fund_id = $1::uuid
        AND quarter = $2
        AND promotion_state = 'released'
      ORDER BY released_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      `,
      [params.fundId, params.quarter]
    );

    const bridgeRes = await pool.query(
      `
      SELECT
        audit_run_id::text,
        snapshot_version,
        promotion_state,
        trust_status,
        breakpoint_layer,
        gross_return_amount::text,
        management_fees::text,
        fund_expenses::text,
        net_return_amount::text,
        bridge_items,
        formulas,
        null_reasons,
        provenance,
        artifact_paths
      FROM re_authoritative_fund_gross_to_net_qtr
      WHERE fund_id = $1::uuid
        AND quarter = $2
        AND promotion_state = 'released'
      ORDER BY released_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      `,
      [params.fundId, params.quarter]
    );

    const metricsRow = metricsRes.rows[0];
    const bridgeRow = bridgeRes.rows[0];

    if (!metricsRow && !bridgeRow) {
      return Response.json({
        metrics: null,
        bridge: null,
        benchmark: null,
        null_reason: "authoritative_state_not_released",
        trust_status: "missing_source",
      });
    }

    const canonicalMetrics = metricsRow?.canonical_metrics || {};
    const metrics = metricsRow
      ? {
          audit_run_id: metricsRow.audit_run_id,
          snapshot_version: metricsRow.snapshot_version,
          promotion_state: metricsRow.promotion_state,
          trust_status: metricsRow.trust_status,
          breakpoint_layer: metricsRow.breakpoint_layer,
          quarter: params.quarter,
          gross_irr: canonicalMetrics.gross_irr ?? null,
          net_irr: canonicalMetrics.net_irr ?? null,
          gross_tvpi: canonicalMetrics.tvpi ?? null,
          net_tvpi: canonicalMetrics.net_tvpi ?? null,
          dpi: canonicalMetrics.dpi ?? null,
          rvpi: canonicalMetrics.rvpi ?? null,
          cash_on_cash: canonicalMetrics.cash_on_cash ?? null,
          gross_net_spread: canonicalMetrics.gross_net_spread ?? null,
          portfolio_nav: canonicalMetrics.ending_nav ?? canonicalMetrics.portfolio_nav ?? null,
          total_committed: canonicalMetrics.total_committed ?? null,
          total_called: canonicalMetrics.total_called ?? null,
          total_distributed: canonicalMetrics.total_distributed ?? null,
          artifact_paths: metricsRow.artifact_paths ?? {},
        }
      : null;

    const bridge = bridgeRow
      ? {
          audit_run_id: bridgeRow.audit_run_id,
          snapshot_version: bridgeRow.snapshot_version,
          promotion_state: bridgeRow.promotion_state,
          trust_status: bridgeRow.trust_status,
          breakpoint_layer: bridgeRow.breakpoint_layer,
          gross_return: bridgeRow.gross_return_amount,
          mgmt_fees: bridgeRow.management_fees,
          fund_expenses: bridgeRow.fund_expenses,
          net_return: bridgeRow.net_return_amount,
          bridge_items: bridgeRow.bridge_items ?? [],
          formulas: bridgeRow.formulas ?? {},
          null_reasons: bridgeRow.null_reasons ?? {},
          provenance: bridgeRow.provenance ?? [],
          artifact_paths: bridgeRow.artifact_paths ?? {},
        }
      : null;

    return Response.json({
      metrics,
      bridge,
      benchmark: null,
      null_reason: null,
      trust_status: metrics?.trust_status ?? bridge?.trust_status ?? "missing_source",
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/returns/[quarter]] DB error", err);
    return Response.json({
      metrics: null,
      bridge: null,
      benchmark: null,
      null_reason: "authoritative_state_lookup_failed",
      trust_status: "missing_source",
    });
  }
}
