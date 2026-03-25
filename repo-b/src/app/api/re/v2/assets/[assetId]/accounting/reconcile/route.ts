import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/accounting/reconcile?quarter=2025Q3&env_id=...&business_id=...
 * Run reconciliation checks for an asset+quarter:
 *   1. GL → Normalized NOI match
 *   2. Normalized NOI → Quarter Rollup match
 * Returns pass/fail with deltas for each check.
 */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");

  if (!quarter || !envId || !businessId) {
    return Response.json(
      { error: "quarter, env_id, and business_id are required" },
      { status: 400 },
    );
  }

  const match = quarter.match(/^(\d{4})Q([1-4])$/);
  if (!match) {
    return Response.json({ error: "Invalid quarter format (expected 2025Q3)" }, { status: 400 });
  }

  const year = Number(match[1]);
  const q = Number(match[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;

  try {
    // ---------- Check 1: GL → Normalized NOI ----------
    const glRes = await pool.query(
      `SELECT
         SUM(CASE WHEN m.sign_multiplier = 1 THEN g.amount * m.sign_multiplier ELSE 0 END) AS gl_revenue,
         SUM(CASE WHEN m.sign_multiplier = -1 THEN g.amount * m.sign_multiplier ELSE 0 END) AS gl_expense,
         SUM(g.amount * m.sign_multiplier) AS gl_noi
       FROM acct_gl_balance_monthly g
       JOIN acct_mapping_rule m
         ON m.env_id = g.env_id AND m.business_id = g.business_id
         AND m.gl_account = g.gl_account AND m.target_statement = 'NOI'
       WHERE g.env_id = $1 AND g.business_id = $2::uuid AND g.asset_id = $3::uuid
         AND g.period_month >= $4::date AND g.period_month <= $5::date`,
      [envId, businessId, params.assetId, startDate, endDate],
    );
    const gl = glRes.rows[0] || {};

    const normRes = await pool.query(
      `SELECT
         SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS norm_revenue,
         SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS norm_expense,
         SUM(amount) AS norm_noi
       FROM acct_normalized_noi_monthly
       WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
         AND period_month >= $4::date AND period_month <= $5::date`,
      [envId, businessId, params.assetId, startDate, endDate],
    );
    const norm = normRes.rows[0] || {};

    const glNoi = Number(gl.gl_noi || 0);
    const normNoi = Number(norm.norm_noi || 0);
    const glDelta = Math.abs(glNoi - normNoi);

    const glNormCheck = {
      check_type: "gl_normalized_match",
      passed: glDelta <= 0.01,
      gl_noi: glNoi,
      norm_noi: normNoi,
      delta: glDelta,
      gl_revenue: Number(gl.gl_revenue || 0),
      norm_revenue: Number(norm.norm_revenue || 0),
    };

    // ---------- Check 2: Normalized → Rollup ----------
    const rollupRes = await pool.query(
      `SELECT revenue, opex, noi
       FROM re_asset_acct_quarter_rollup
       WHERE asset_id = $1::uuid AND quarter = $2
       LIMIT 1`,
      [params.assetId, quarter],
    );
    const rollup = rollupRes.rows[0] || {};

    const rollupNoi = Number(rollup.noi || 0);
    const rollupDelta = Math.abs(normNoi - rollupNoi);

    const rollupCheck = {
      check_type: "rollup_match",
      passed: rollupDelta <= 1.0,
      norm_noi: normNoi,
      rollup_noi: rollupNoi,
      delta: rollupDelta,
      rollup_revenue: Number(rollup.revenue || 0),
      rollup_opex: Number(rollup.opex || 0),
    };

    // ---------- Record results ----------
    const allPassed = glNormCheck.passed && rollupCheck.passed;

    // Persist to acct_validation_result for audit trail
    for (const check of [glNormCheck, rollupCheck]) {
      await pool.query(
        `INSERT INTO acct_validation_result
           (env_id, business_id, asset_id, check_type, passed, expected, actual, delta, details)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          envId,
          businessId,
          params.assetId,
          check.check_type,
          check.passed,
          check.check_type === "gl_normalized_match" ? glNoi : normNoi,
          check.check_type === "gl_normalized_match" ? normNoi : rollupNoi,
          check.check_type === "gl_normalized_match" ? glDelta : rollupDelta,
          JSON.stringify(check),
        ],
      );
    }

    return Response.json({
      all_passed: allPassed,
      quarter,
      asset_id: params.assetId,
      checks: {
        gl_normalized: glNormCheck,
        rollup: rollupCheck,
      },
    });
  } catch (err) {
    console.error("[reconcile] Error:", err);
    return Response.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
