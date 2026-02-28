import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/variance/noi
 *
 * Computes NOI variance (actual vs budget) per asset per line-code for a quarter.
 * Reads from acct_normalized_noi_monthly (actuals) and uw_noi_budget_monthly (budget).
 * If pre-computed variance exists in re_asset_variance_qtr, returns that instead.
 *
 * Query params:
 *   env_id       (required) - environment UUID
 *   business_id  (required) - business UUID
 *   fund_id      (required) - fund UUID
 *   quarter      (required) - e.g. "2026Q1"
 *   uw_version_id (optional) - specific UW version; defaults to latest BUDGET version
 *   source       (optional) - "precomputed" to read from re_asset_variance_qtr
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ items: [], rollup: { total_actual: "0", total_plan: "0", total_variance: "0", total_variance_pct: null } });
  }

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const fundId = searchParams.get("fund_id");
  const quarter = searchParams.get("quarter");
  const uwVersionId = searchParams.get("uw_version_id");
  const source = searchParams.get("source");

  if (!envId || !businessId || !fundId || !quarter) {
    return Response.json(
      { items: [], rollup: { total_actual: "0", total_plan: "0", total_variance: "0", total_variance_pct: null } },
      { status: 200 }
    );
  }

  // Parse quarter → month range
  const year = parseInt(quarter.slice(0, 4), 10);
  const q = parseInt(quarter.slice(-1), 10);
  const startMonth = (q - 1) * 3 + 1;
  const monthDates = [0, 1, 2].map(
    (i) => `${year}-${String(startMonth + i).padStart(2, "0")}-01`
  );

  try {
    // Strategy 1: Try pre-computed variance first
    if (source === "precomputed" || !source) {
      const precomputed = await pool.query(
        `SELECT
           id::text, run_id::text, asset_id::text, quarter, line_code,
           actual_amount::float8 AS actual_amount,
           plan_amount::float8 AS plan_amount,
           variance_amount::float8 AS variance_amount,
           variance_pct::float8 AS variance_pct
         FROM re_asset_variance_qtr
         WHERE env_id = $1 AND business_id = $2::uuid
           AND fund_id = $3::uuid AND quarter = $4
         ORDER BY asset_id, line_code`,
        [envId, businessId, fundId, quarter]
      );

      if (precomputed.rows.length > 0) {
        return buildResponse(precomputed.rows);
      }
    }

    // Strategy 2: Compute on-the-fly from actuals + budget
    // Resolve UW version
    let resolvedUwVersionId = uwVersionId;
    if (!resolvedUwVersionId) {
      const uvRes = await pool.query(
        `SELECT id::text FROM uw_version
         WHERE env_id = $1 AND business_id = $2::uuid
         ORDER BY effective_from DESC LIMIT 1`,
        [envId, businessId]
      );
      if (uvRes.rows.length > 0) {
        resolvedUwVersionId = uvRes.rows[0].id;
      }
    }

    if (!resolvedUwVersionId) {
      return Response.json({
        items: [],
        rollup: { total_actual: "0", total_plan: "0", total_variance: "0", total_variance_pct: null },
      });
    }

    const result = await pool.query(
      `WITH fund_assets AS (
         SELECT a.asset_id
         FROM repe_asset a
         JOIN repe_deal d ON d.deal_id = a.deal_id
         WHERE d.fund_id = $3::uuid
       ),
       actuals AS (
         SELECT n.asset_id, n.line_code, SUM(n.amount)::float8 AS actual_amount
         FROM acct_normalized_noi_monthly n
         JOIN fund_assets fa ON fa.asset_id = n.asset_id
         WHERE n.env_id = $1 AND n.business_id = $2::uuid
           AND n.period_month = ANY($5::date[])
         GROUP BY n.asset_id, n.line_code
       ),
       budget AS (
         SELECT b.asset_id, b.line_code, SUM(b.amount)::float8 AS plan_amount
         FROM uw_noi_budget_monthly b
         JOIN fund_assets fa ON fa.asset_id = b.asset_id
         WHERE b.env_id = $1 AND b.business_id = $2::uuid
           AND b.uw_version_id = $6::uuid
           AND b.period_month = ANY($5::date[])
         GROUP BY b.asset_id, b.line_code
       ),
       merged AS (
         SELECT
           COALESCE(a.asset_id, b.asset_id) AS asset_id,
           COALESCE(a.line_code, b.line_code) AS line_code,
           COALESCE(a.actual_amount, 0) AS actual_amount,
           COALESCE(b.plan_amount, 0) AS plan_amount
         FROM actuals a
         FULL OUTER JOIN budget b
           ON a.asset_id = b.asset_id AND a.line_code = b.line_code
       )
       SELECT
         gen_random_uuid()::text AS id,
         ''::text AS run_id,
         m.asset_id::text,
         $4 AS quarter,
         m.line_code,
         m.actual_amount,
         m.plan_amount,
         (m.actual_amount - m.plan_amount) AS variance_amount,
         CASE WHEN m.plan_amount = 0 THEN NULL
              ELSE ROUND(((m.actual_amount - m.plan_amount) / ABS(m.plan_amount))::numeric, 4)::float8
         END AS variance_pct
       FROM merged m
       ORDER BY m.asset_id, m.line_code`,
      [envId, businessId, fundId, quarter, monthDates, resolvedUwVersionId]
    );

    return buildResponse(result.rows);
  } catch (err) {
    console.error("[re/v2/variance/noi] DB error", err);
    return Response.json({
      items: [],
      rollup: { total_actual: "0", total_plan: "0", total_variance: "0", total_variance_pct: null },
    });
  }
}

function buildResponse(items: Array<Record<string, unknown>>) {
  let totalActual = 0;
  let totalPlan = 0;

  for (const item of items) {
    totalActual += Number(item.actual_amount) || 0;
    totalPlan += Number(item.plan_amount) || 0;
  }

  const totalVariance = totalActual - totalPlan;
  const totalVariancePct =
    totalPlan !== 0
      ? ((totalActual - totalPlan) / Math.abs(totalPlan)).toFixed(4)
      : null;

  return Response.json({
    items,
    rollup: {
      total_actual: totalActual.toFixed(2),
      total_plan: totalPlan.toFixed(2),
      total_variance: totalVariance.toFixed(2),
      total_variance_pct: totalVariancePct,
    },
  });
}
