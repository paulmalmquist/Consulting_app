import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/investment-rollup/[quarter]
 *
 * Returns per-investment rollup for a fund in a given quarter.
 * Each row shows investment-level NAV, asset value, debt, cash,
 * plus enriched metrics: asset_count, NOI, occupancy, LTV, DSCR,
 * sector_mix, primary_market, data_health, sponsor, IRR, equity_multiple.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  try {
    const scenarioClause = scenarioId
      ? "AND qs.scenario_id = $3::uuid"
      : "AND qs.scenario_id IS NULL";
    const values: string[] = [params.fundId, params.quarter];
    if (scenarioId) values.push(scenarioId);

    // Try direct investment quarter state first
    const directRes = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.deal_type,
         d.stage,
         d.sponsor,
         iqs.id::text AS quarter_state_id,
         iqs.run_id::text,
         iqs.nav::float8,
         iqs.unrealized_value::float8 AS gross_asset_value,
         iqs.committed_capital::float8,
         iqs.invested_capital::float8,
         iqs.gross_irr::float8,
         iqs.net_irr::float8,
         iqs.equity_multiple::float8,
         iqs.created_at::text
       FROM repe_deal d
       LEFT JOIN re_investment_quarter_state iqs
         ON iqs.investment_id = d.deal_id AND iqs.quarter = $2
         ${scenarioId ? "AND iqs.scenario_id = $3::uuid" : "AND iqs.scenario_id IS NULL"}
       WHERE d.fund_id = $1::uuid
       ORDER BY d.name`,
      values
    );

    // If we have investment quarter states with data, enrich with asset-level aggregates
    if (directRes.rows.some((r: Record<string, unknown>) => r.quarter_state_id)) {
      const enriched = await enrichWithAssetMetrics(
        pool, directRes.rows, params.quarter, scenarioClause, values
      );
      return Response.json(enriched);
    }

    // Fallback: aggregate from asset quarter states with full enrichment
    const aggRes = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.deal_type,
         d.stage,
         d.sponsor,
         NULL::text AS quarter_state_id,
         NULL::text AS run_id,
         SUM(qs.nav)::float8 AS nav,
         SUM(qs.asset_value)::float8 AS gross_asset_value,
         SUM(qs.debt_balance)::float8 AS debt_balance,
         SUM(qs.cash_balance)::float8 AS cash_balance,
         NULL::float8 AS effective_ownership_percent,
         SUM(qs.nav)::float8 AS fund_nav_contribution,
         NULL::text AS inputs_hash,
         d.created_at::text,
         -- Enriched fields
         COUNT(DISTINCT a.asset_id)::int AS asset_count,
         SUM(qs.noi)::float8 AS total_noi,
         SUM(qs.revenue)::float8 AS total_revenue,
         CASE WHEN SUM(qs.asset_value) > 0
           THEN (SUM(qs.occupancy * qs.asset_value) / SUM(qs.asset_value))::float8
           ELSE NULL END AS weighted_occupancy,
         SUM(qs.asset_value)::float8 AS total_asset_value,
         SUM(qs.debt_balance)::float8 AS total_debt,
         CASE WHEN SUM(qs.asset_value) > 0
           THEN (SUM(qs.debt_balance) / SUM(qs.asset_value))::float8
           ELSE NULL END AS computed_ltv,
         CASE WHEN SUM(qs.debt_service) > 0
           THEN (SUM(qs.noi) / SUM(qs.debt_service))::float8
           ELSE NULL END AS computed_dscr,
         NULL::float8 AS gross_irr,
         NULL::float8 AS net_irr,
         NULL::float8 AS equity_multiple,
         -- Missing data count: total assets minus those with quarter state
         (COUNT(DISTINCT a.asset_id) - COUNT(DISTINCT qs.asset_id))::int AS missing_quarter_state_count
       FROM repe_deal d
       LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 ${scenarioClause}
       WHERE d.fund_id = $1::uuid
       GROUP BY d.deal_id, d.name, d.deal_type, d.stage, d.sponsor, d.created_at
       ORDER BY d.name`,
      values
    );

    // Add sector_mix and primary_market via separate query
    const rows = await addSectorAndMarket(pool, aggRes.rows);
    return Response.json(rows);
  } catch (err) {
    console.error("[re/v2/funds/[id]/investment-rollup] DB error", err);
    return Response.json([], { status: 200 });
  }
}

/**
 * Enrich direct investment quarter state rows with asset-level aggregates.
 */
async function enrichWithAssetMetrics(
  pool: ReturnType<typeof getPool> & object,
  rows: Record<string, unknown>[],
  quarter: string,
  scenarioClause: string,
  values: string[]
) {
  const investmentIds = rows.map((r) => r.investment_id as string);
  if (investmentIds.length === 0) return rows;

  // Build enrichment query for all investments at once
  const nextIdx = values.length + 1;
  const idPlaceholders = investmentIds.map((_, i) => `$${nextIdx + i}::uuid`).join(", ");
  const enrichValues = [...values, ...investmentIds];

  const enrichRes = await pool.query(
    `SELECT
       d.deal_id::text AS investment_id,
       COUNT(DISTINCT a.asset_id)::int AS asset_count,
       SUM(qs.noi)::float8 AS total_noi,
       SUM(qs.revenue)::float8 AS total_revenue,
       CASE WHEN SUM(qs.asset_value) > 0
         THEN (SUM(qs.occupancy * qs.asset_value) / SUM(qs.asset_value))::float8
         ELSE NULL END AS weighted_occupancy,
       SUM(qs.asset_value)::float8 AS total_asset_value,
       SUM(qs.debt_balance)::float8 AS total_debt,
       CASE WHEN SUM(qs.asset_value) > 0
         THEN (SUM(qs.debt_balance) / SUM(qs.asset_value))::float8
         ELSE NULL END AS computed_ltv,
       CASE WHEN SUM(qs.debt_service) > 0
         THEN (SUM(qs.noi) / SUM(qs.debt_service))::float8
         ELSE NULL END AS computed_dscr,
       SUM(qs.nav)::float8 AS fund_nav_contribution,
       (COUNT(DISTINCT a.asset_id) - COUNT(DISTINCT qs.asset_id))::int AS missing_quarter_state_count
     FROM repe_deal d
     LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
     LEFT JOIN re_asset_quarter_state qs
       ON qs.asset_id = a.asset_id AND qs.quarter = $2 ${scenarioClause}
     WHERE d.deal_id IN (${idPlaceholders})
     GROUP BY d.deal_id`,
    enrichValues
  );

  const enrichMap = new Map<string, Record<string, unknown>>();
  for (const r of enrichRes.rows) {
    enrichMap.set(r.investment_id as string, r);
  }

  const enrichedRows = await addSectorAndMarket(
    pool,
    rows.map((row) => {
      const enrich = enrichMap.get(row.investment_id as string);
      const merged = { ...row, ...(enrich || {}) };
      // Ensure fund_nav_contribution is set: prefer enriched value, fall back to row.nav
      if (merged.fund_nav_contribution == null && row.nav != null) {
        merged.fund_nav_contribution = row.nav;
      }
      return merged;
    })
  );
  return enrichedRows;
}

/**
 * Add sector_mix (JSON) and primary_market to each investment row.
 */
async function addSectorAndMarket(
  pool: ReturnType<typeof getPool> & object,
  rows: Record<string, unknown>[]
) {
  const investmentIds = rows.map((r) => r.investment_id as string);
  if (investmentIds.length === 0) return rows;

  const placeholders = investmentIds.map((_, i) => `$${i + 1}::uuid`).join(", ");

  // Sector mix: property_type distribution by asset_value
  const sectorRes = await pool.query(
    `SELECT
       d.deal_id::text AS investment_id,
       pa.property_type,
       SUM(COALESCE(qs.asset_value, 0))::float8 AS type_value
     FROM repe_deal d
     JOIN repe_asset a ON a.deal_id = d.deal_id
     LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
     LEFT JOIN LATERAL (
       SELECT asset_value FROM re_asset_quarter_state
       WHERE asset_id = a.asset_id AND scenario_id IS NULL
       ORDER BY quarter DESC LIMIT 1
     ) qs ON true
     WHERE d.deal_id IN (${placeholders})
     GROUP BY d.deal_id, pa.property_type`,
    investmentIds
  );

  // Primary market: top MSA/market by asset value (fall back to market or city when msa is null)
  const marketRes = await pool.query(
    `SELECT DISTINCT ON (d.deal_id)
       d.deal_id::text AS investment_id,
       COALESCE(NULLIF(pa.msa, ''), NULLIF(pa.market, ''), NULLIF(pa.city, '')) AS primary_market
     FROM repe_deal d
     JOIN repe_asset a ON a.deal_id = d.deal_id
     LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
     LEFT JOIN LATERAL (
       SELECT asset_value FROM re_asset_quarter_state
       WHERE asset_id = a.asset_id AND scenario_id IS NULL
       ORDER BY quarter DESC LIMIT 1
     ) qs ON true
     WHERE d.deal_id IN (${placeholders})
       AND COALESCE(NULLIF(pa.msa, ''), NULLIF(pa.market, ''), NULLIF(pa.city, '')) IS NOT NULL
     ORDER BY d.deal_id, COALESCE(qs.asset_value, 0) DESC`,
    investmentIds
  );

  // Build lookup maps
  const sectorMap = new Map<string, Record<string, number>>();
  for (const r of sectorRes.rows) {
    const id = r.investment_id as string;
    if (!sectorMap.has(id)) sectorMap.set(id, {});
    const pt = (r.property_type as string) || "unknown";
    sectorMap.get(id)![pt] = (sectorMap.get(id)![pt] || 0) + (r.type_value as number);
  }

  // Normalize sector_mix to proportions
  for (const [id, mix] of sectorMap.entries()) {
    const total = Object.values(mix).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const key of Object.keys(mix)) {
        mix[key] = Math.round((mix[key] / total) * 100) / 100;
      }
    }
    sectorMap.set(id, mix);
  }

  const marketMap = new Map<string, string>();
  for (const r of marketRes.rows) {
    marketMap.set(r.investment_id as string, r.primary_market as string);
  }

  return rows.map((row) => ({
    ...row,
    sector_mix: sectorMap.get(row.investment_id as string) || null,
    primary_market: marketMap.get(row.investment_id as string) || null,
  }));
}
