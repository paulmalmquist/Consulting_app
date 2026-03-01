import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments
 *
 * Cross-fund investments list with optional filters and enriched rollup metrics.
 * Follows the assets/route.ts pattern: env_id scoping via env_business_bindings,
 * dynamic WHERE clauses, LEFT JOIN to asset quarter states for aggregation.
 *
 * Query params:
 *   env_id    — required (unless fund_id provided)
 *   fund_id   — optional filter
 *   stage     — optional filter (e.g. "investing", "closed")
 *   type      — optional filter (deal_type)
 *   sponsor   — optional filter
 *   q         — optional search (name, sponsor)
 *   quarter   — optional, defaults to latest available
 *   limit     — max rows (default 100, max 500)
 *   offset    — pagination offset
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const stage = searchParams.get("stage");
  const type = searchParams.get("type");
  const sponsor = searchParams.get("sponsor");
  const q = searchParams.get("q");
  const quarter = searchParams.get("quarter");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
  const offset = parseInt(searchParams.get("offset") || "0", 10) || 0;

  if (!envId && !fundId) {
    return Response.json([], { status: 200 });
  }

  try {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    // Env scoping via env_business_bindings
    if (envId) {
      conditions.push(
        `f.business_id = (SELECT business_id::uuid FROM app.env_business_bindings WHERE env_id = $${idx}::uuid LIMIT 1)`
      );
      values.push(envId);
      idx++;
    }

    if (fundId) {
      conditions.push(`d.fund_id = $${idx}::uuid`);
      values.push(fundId);
      idx++;
    }

    if (stage) {
      conditions.push(`COALESCE(d.stage, '') = $${idx}`);
      values.push(stage);
      idx++;
    }

    if (type) {
      conditions.push(`COALESCE(d.deal_type, '') = $${idx}`);
      values.push(type);
      idx++;
    }

    if (sponsor) {
      conditions.push(`COALESCE(d.sponsor, '') ILIKE $${idx}`);
      values.push(`%${sponsor}%`);
      idx++;
    }

    if (q) {
      conditions.push(`(d.name ILIKE $${idx} OR COALESCE(d.sponsor, '') ILIKE $${idx})`);
      values.push(`%${q}%`);
      idx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Quarter for aggregation: use provided or derive latest
    const quarterParam = `$${idx}`;
    if (quarter) {
      values.push(quarter);
    } else {
      // Derive current quarter from date
      const now = new Date();
      const qNum = Math.ceil((now.getMonth() + 1) / 3);
      values.push(`${now.getFullYear()}Q${qNum}`);
    }
    idx++;

    const limitParam = `$${idx}`;
    values.push(limit);
    idx++;
    const offsetParam = `$${idx}`;
    values.push(offset);

    const res = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.deal_type,
         d.stage,
         d.sponsor,
         d.fund_id::text,
         f.name AS fund_name,
         d.target_close_date::text,
         d.committed_capital::float8,
         d.invested_capital::float8,
         d.created_at::text,
         -- Aggregated from asset quarter states
         COUNT(DISTINCT a.asset_id)::int AS asset_count,
         SUM(qs.nav)::float8 AS nav,
         SUM(qs.asset_value)::float8 AS gross_asset_value,
         SUM(qs.asset_value)::float8 AS total_asset_value,
         SUM(qs.noi)::float8 AS total_noi,
         SUM(qs.revenue)::float8 AS total_revenue,
         SUM(qs.debt_balance)::float8 AS total_debt,
         SUM(qs.debt_balance)::float8 AS debt_balance,
         SUM(qs.cash_balance)::float8 AS cash_balance,
         CASE WHEN SUM(qs.asset_value) > 0
           THEN (SUM(qs.occupancy * qs.asset_value) / SUM(qs.asset_value))::float8
           ELSE NULL END AS weighted_occupancy,
         CASE WHEN SUM(qs.asset_value) > 0
           THEN (SUM(qs.debt_balance) / SUM(qs.asset_value))::float8
           ELSE NULL END AS computed_ltv,
         CASE WHEN SUM(qs.debt_service) > 0
           THEN (SUM(qs.noi) / SUM(qs.debt_service))::float8
           ELSE NULL END AS computed_dscr,
         (COUNT(DISTINCT a.asset_id) - COUNT(DISTINCT qs.asset_id))::int AS missing_quarter_state_count,
         -- Investment quarter state fields (if available)
         iqs.gross_irr::float8,
         iqs.net_irr::float8,
         iqs.equity_multiple::float8
       FROM repe_deal d
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = ${quarterParam} AND qs.scenario_id IS NULL
       LEFT JOIN re_investment_quarter_state iqs
         ON iqs.investment_id = d.deal_id AND iqs.quarter = ${quarterParam} AND iqs.scenario_id IS NULL
       ${whereClause}
       GROUP BY d.deal_id, d.name, d.deal_type, d.stage, d.sponsor,
                d.fund_id, f.name, d.target_close_date,
                d.committed_capital, d.invested_capital, d.created_at,
                iqs.gross_irr, iqs.net_irr, iqs.equity_multiple
       ORDER BY d.name
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    // Add sector_mix and primary_market
    const enriched = await addSectorAndMarket(pool, res.rows);
    return Response.json(enriched);
  } catch (err) {
    console.error("[re/v2/investments] DB error", err);
    return Response.json([], { status: 200 });
  }
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

  const marketRes = await pool.query(
    `SELECT DISTINCT ON (d.deal_id)
       d.deal_id::text AS investment_id,
       pa.msa AS primary_market
     FROM repe_deal d
     JOIN repe_asset a ON a.deal_id = d.deal_id
     LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
     LEFT JOIN LATERAL (
       SELECT asset_value FROM re_asset_quarter_state
       WHERE asset_id = a.asset_id AND scenario_id IS NULL
       ORDER BY quarter DESC LIMIT 1
     ) qs ON true
     WHERE d.deal_id IN (${placeholders})
       AND pa.msa IS NOT NULL AND pa.msa != ''
     ORDER BY d.deal_id, COALESCE(qs.asset_value, 0) DESC`,
    investmentIds
  );

  const sectorMap = new Map<string, Record<string, number>>();
  for (const r of sectorRes.rows) {
    const id = r.investment_id as string;
    if (!sectorMap.has(id)) sectorMap.set(id, {});
    const pt = (r.property_type as string) || "unknown";
    sectorMap.get(id)![pt] = (sectorMap.get(id)![pt] || 0) + (r.type_value as number);
  }
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
