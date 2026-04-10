import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/environments/[envId]/portfolio-kpis
 *
 * Reads released authoritative fund snapshots only.
 * Never falls back to a different quarter and never recomputes from legacy
 * quarter-state tables on read.
 */
export async function GET(
  request: Request,
  { params }: { params: { envId: string } }
) {
  const pool = getPool();
  if (!pool) {
      return Response.json({
        env_id: params.envId,
        business_id: null,
        quarter: null,
        effective_quarter: null,
        audit_run_id: null,
        snapshot_version: null,
        promotion_state: null,
        breakpoint_layer: null,
        fund_count: 0,
        total_commitments: "0",
        portfolio_nav: null,
        gross_irr: null,
        net_irr: null,
      weighted_dscr: null,
      weighted_ltv: null,
      pct_invested: null,
        active_assets: 0,
        warnings: ["Database not available"],
        null_reason: "database_not_available",
        null_reasons: { portfolio: "database_not_available" },
        provenance: [],
        artifact_paths: {},
        source_snapshots: [],
        trust_status: "missing_source",
      });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";
  const scenarioId = searchParams.get("scenario_id");

  try {
    const ebRes = await pool.query(
      `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
      [params.envId]
    );
    const businessId = ebRes.rows[0]?.business_id;
    if (!businessId) {
      return Response.json({
        env_id: params.envId,
        business_id: null,
        quarter,
        effective_quarter: quarter,
        audit_run_id: null,
        snapshot_version: null,
        promotion_state: null,
        breakpoint_layer: null,
        fund_count: 0,
        total_commitments: "0",
        portfolio_nav: null,
        gross_irr: null,
        net_irr: null,
        weighted_dscr: null,
        weighted_ltv: null,
        pct_invested: null,
        active_assets: 0,
        warnings: ["No business binding found for environment"],
        null_reason: "environment_not_bound",
        null_reasons: { portfolio: "environment_not_bound" },
        provenance: [],
        artifact_paths: {},
        source_snapshots: [],
        trust_status: "missing_source",
      });
    }

    if (scenarioId) {
      return Response.json({
        env_id: params.envId,
        business_id: businessId,
        quarter,
        effective_quarter: quarter,
        scenario_id: scenarioId,
        audit_run_id: null,
        snapshot_version: null,
        promotion_state: null,
        breakpoint_layer: null,
        fund_count: 0,
        total_commitments: "0",
        portfolio_nav: null,
        gross_irr: null,
        net_irr: null,
        weighted_dscr: null,
        weighted_ltv: null,
        pct_invested: null,
        active_assets: 0,
        warnings: ["Authoritative portfolio KPIs are only available for released base-scenario snapshots."],
        null_reason: "unsupported_metric_at_scope",
        null_reasons: { portfolio: "unsupported_metric_at_scope" },
        provenance: [],
        artifact_paths: {},
        source_snapshots: [],
        trust_status: "missing_source",
      });
    }

    const metricsRes = await pool.query(
      `
      WITH latest_state AS (
        SELECT DISTINCT ON (s.fund_id)
          s.fund_id,
          s.audit_run_id::text AS audit_run_id,
          s.snapshot_version,
          s.promotion_state,
          s.trust_status,
          s.breakpoint_layer,
          s.canonical_metrics
          ,
          s.null_reasons,
          s.provenance,
          s.artifact_paths
        FROM re_authoritative_fund_state_qtr s
        WHERE s.env_id = $1
          AND s.business_id = $2::uuid
          AND s.quarter = $3
          AND s.promotion_state = 'released'
        ORDER BY s.fund_id, s.released_at DESC NULLS LAST, s.created_at DESC
      ),
      metric_rows AS (
        SELECT
          fund_id,
          audit_run_id,
          snapshot_version,
          promotion_state,
          trust_status,
          breakpoint_layer,
          COALESCE(NULLIF(canonical_metrics->>'ending_nav', '')::numeric, NULLIF(canonical_metrics->>'portfolio_nav', '')::numeric, 0) AS portfolio_nav,
          COALESCE(NULLIF(canonical_metrics->>'total_committed', '')::numeric, 0) AS total_committed,
          COALESCE(NULLIF(canonical_metrics->>'asset_count', '')::int, 0) AS asset_count,
          NULLIF(canonical_metrics->>'gross_irr', '')::numeric AS gross_irr,
          NULLIF(canonical_metrics->>'net_irr', '')::numeric AS net_irr
        FROM latest_state
      )
      SELECT
        COUNT(*)::int AS fund_count,
        COALESCE(SUM(total_committed), 0)::text AS total_commitments,
        CASE WHEN COUNT(*) = 0 THEN NULL ELSE COALESCE(SUM(portfolio_nav), 0)::text END AS portfolio_nav,
        COALESCE(SUM(asset_count), 0)::int AS active_assets,
        CASE
          WHEN SUM(CASE WHEN gross_irr IS NOT NULL AND portfolio_nav > 0 THEN portfolio_nav ELSE 0 END) > 0
          THEN (
            SUM(CASE WHEN gross_irr IS NOT NULL AND portfolio_nav > 0 THEN gross_irr * portfolio_nav ELSE 0 END)
            / SUM(CASE WHEN gross_irr IS NOT NULL AND portfolio_nav > 0 THEN portfolio_nav ELSE 0 END)
          )::text
          ELSE NULL
        END AS gross_irr,
        CASE
          WHEN SUM(CASE WHEN net_irr IS NOT NULL AND portfolio_nav > 0 THEN portfolio_nav ELSE 0 END) > 0
          THEN (
            SUM(CASE WHEN net_irr IS NOT NULL AND portfolio_nav > 0 THEN net_irr * portfolio_nav ELSE 0 END)
            / SUM(CASE WHEN net_irr IS NOT NULL AND portfolio_nav > 0 THEN portfolio_nav ELSE 0 END)
          )::text
          ELSE NULL
        END AS net_irr,
        COALESCE(
          json_agg(
            json_build_object(
              'fund_id', fund_id::text,
              'audit_run_id', audit_run_id,
              'snapshot_version', snapshot_version,
              'promotion_state', promotion_state,
              'trust_status', trust_status
            )
          ) FILTER (WHERE fund_id IS NOT NULL),
          '[]'::json
        ) AS source_snapshots,
        CASE WHEN COUNT(DISTINCT snapshot_version) = 1 THEN MIN(snapshot_version) ELSE NULL END AS snapshot_version,
        CASE WHEN COUNT(DISTINCT audit_run_id) = 1 THEN MIN(audit_run_id) ELSE NULL END AS audit_run_id,
        CASE WHEN COUNT(*) > 0 THEN 'released' ELSE NULL END AS promotion_state,
        MIN(breakpoint_layer) FILTER (WHERE breakpoint_layer IS NOT NULL) AS breakpoint_layer
      FROM metric_rows
      `,
      [params.envId, businessId, quarter]
    );

    const fundCount = metricsRes.rows[0]?.fund_count || 0;
    return Response.json({
      env_id: params.envId,
      business_id: businessId,
      quarter,
      effective_quarter: quarter,
      audit_run_id: metricsRes.rows[0]?.audit_run_id ?? null,
      snapshot_version: metricsRes.rows[0]?.snapshot_version ?? null,
      promotion_state: metricsRes.rows[0]?.promotion_state ?? null,
      breakpoint_layer: metricsRes.rows[0]?.breakpoint_layer ?? null,
      fund_count: fundCount,
      total_commitments: metricsRes.rows[0]?.total_commitments || "0",
      portfolio_nav: metricsRes.rows[0]?.portfolio_nav || null,
      gross_irr: metricsRes.rows[0]?.gross_irr ?? null,
      net_irr: metricsRes.rows[0]?.net_irr ?? null,
      weighted_dscr: null,
      weighted_ltv: null,
      pct_invested: null,
      active_assets: metricsRes.rows[0]?.active_assets || 0,
      warnings: fundCount > 0 ? [] : [`No released authoritative fund snapshots found for ${quarter}.`],
      null_reason: fundCount > 0 ? null : "authoritative_state_not_released",
      null_reasons: fundCount > 0 ? {} : { portfolio: "authoritative_state_not_released" },
      provenance: [],
      artifact_paths: {},
      source_snapshots: metricsRes.rows[0]?.source_snapshots ?? [],
      trust_status: fundCount > 0 ? "trusted" : "missing_source",
    });
  } catch (err) {
    console.error("[re/v2/environments/[envId]/portfolio-kpis] DB error", err);
    return Response.json({
      env_id: params.envId,
      business_id: null,
      quarter,
      effective_quarter: quarter,
      audit_run_id: null,
      snapshot_version: null,
      promotion_state: null,
      breakpoint_layer: null,
      fund_count: 0,
      total_commitments: "0",
      portfolio_nav: null,
      gross_irr: null,
      net_irr: null,
      weighted_dscr: null,
      weighted_ltv: null,
      pct_invested: null,
      active_assets: 0,
      warnings: ["Failed to load authoritative portfolio KPIs"],
      null_reason: "authoritative_state_lookup_failed",
      null_reasons: { portfolio: "authoritative_state_lookup_failed" },
      provenance: [],
      artifact_paths: {},
      source_snapshots: [],
      trust_status: "missing_source",
    });
  }
}
