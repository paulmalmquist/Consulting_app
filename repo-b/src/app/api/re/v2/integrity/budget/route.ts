import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/integrity/budget
 *
 * Checks that every asset in the environment has budget + actuals coverage
 * for the specified quarters. Returns a structured integrity report.
 *
 * Query params:
 *   env_id       (required)
 *   business_id  (required)
 *   quarters     (optional, comma-separated) - defaults to "2026Q1"
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "No database pool" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const quartersParam = searchParams.get("quarters") || "2026Q1";

  if (!envId || !businessId) {
    return Response.json({ error: "env_id and business_id required" }, { status: 400 });
  }

  const requiredQuarters = quartersParam.split(",").map((q) => q.trim());

  // Convert quarters to month dates
  const monthDates: string[] = [];
  for (const q of requiredQuarters) {
    const year = parseInt(q.slice(0, 4), 10);
    const qn = parseInt(q.slice(-1), 10);
    const startMonth = (qn - 1) * 3 + 1;
    for (let i = 0; i < 3; i++) {
      monthDates.push(`${year}-${String(startMonth + i).padStart(2, "0")}-01`);
    }
  }

  try {
    // All assets
    const assetsRes = await pool.query(
      `SELECT a.asset_id::text, a.name
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       WHERE f.business_id = $1::uuid
       ORDER BY a.name`,
      [businessId]
    );
    const allAssets = new Map<string, string>(
      assetsRes.rows.map((r: { asset_id: string; name: string }) => [r.asset_id, r.name])
    );

    // UW versions
    const uwRes = await pool.query(
      `SELECT id::text FROM uw_version
       WHERE env_id = $1 AND business_id = $2::uuid
       ORDER BY effective_from DESC`,
      [envId, businessId]
    );
    const budgetVersionId = uwRes.rows[0]?.id || null;
    const proformaVersionId = uwRes.rows[1]?.id || null;

    // Budget coverage
    let budgetAssets = new Set<string>();
    if (budgetVersionId) {
      const budRes = await pool.query(
        `SELECT DISTINCT asset_id::text
         FROM uw_noi_budget_monthly
         WHERE env_id = $1 AND business_id = $2::uuid
           AND uw_version_id = $3::uuid
           AND period_month = ANY($4::date[])`,
        [envId, businessId, budgetVersionId, monthDates]
      );
      budgetAssets = new Set(budRes.rows.map((r: { asset_id: string }) => r.asset_id));
    }

    // Proforma coverage
    let proformaAssets = new Set<string>();
    if (proformaVersionId) {
      const pfRes = await pool.query(
        `SELECT DISTINCT asset_id::text
         FROM uw_noi_budget_monthly
         WHERE env_id = $1 AND business_id = $2::uuid
           AND uw_version_id = $3::uuid
           AND period_month = ANY($4::date[])`,
        [envId, businessId, proformaVersionId, monthDates]
      );
      proformaAssets = new Set(pfRes.rows.map((r: { asset_id: string }) => r.asset_id));
    }

    // Actuals coverage
    const actRes = await pool.query(
      `SELECT DISTINCT asset_id::text
       FROM acct_normalized_noi_monthly
       WHERE env_id = $1 AND business_id = $2::uuid
         AND period_month = ANY($3::date[])`,
      [envId, businessId, monthDates]
    );
    const actualsAssets = new Set(actRes.rows.map((r: { asset_id: string }) => r.asset_id));

    // Variance coverage
    const varRes = await pool.query(
      `SELECT DISTINCT asset_id::text
       FROM re_asset_variance_qtr
       WHERE env_id = $1 AND business_id = $2::uuid
         AND quarter = ANY($3::text[])`,
      [envId, businessId, requiredQuarters]
    );
    const varianceAssets = new Set(varRes.rows.map((r: { asset_id: string }) => r.asset_id));

    // Compute missing
    const allIds = Array.from(allAssets.keys());
    const missingBudget = allIds.filter((id) => !budgetAssets.has(id)).map((id) => allAssets.get(id)!);
    const missingProforma = allIds.filter((id) => !proformaAssets.has(id)).map((id) => allAssets.get(id)!);
    const missingActuals = allIds.filter((id) => !actualsAssets.has(id)).map((id) => allAssets.get(id)!);
    const missingVariance = allIds.filter((id) => !varianceAssets.has(id)).map((id) => allAssets.get(id)!);

    const passed = missingBudget.length === 0 && missingActuals.length === 0;

    return Response.json({
      total_assets: allAssets.size,
      assets_with_budget: budgetAssets.size,
      assets_with_proforma: proformaAssets.size,
      assets_with_actuals: actualsAssets.size,
      assets_with_variance: varianceAssets.size,
      missing_budget: missingBudget.sort(),
      missing_proforma: missingProforma.sort(),
      missing_actuals: missingActuals.sort(),
      missing_variance: missingVariance.sort(),
      required_quarters: requiredQuarters,
      passed,
    });
  } catch (err) {
    console.error("[re/v2/integrity/budget] DB error", err);
    return Response.json({ error: "Integrity check failed", detail: String(err) }, { status: 500 });
  }
}
