import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/pipeline-status?env_id=...&quarter=...
 *
 * Diagnostic endpoint: runs four COUNT queries to determine exactly where the
 * fund data pipeline has stalled for a given fund + quarter.
 *
 * Returns:
 *   fund_exists       — repe_fund row present
 *   investment_count  — linked re_investment rows
 *   asset_count       — linked repe_asset rows (via repe_deal)
 *   snapshot_exists   — re_fund_quarter_state row for this quarter
 *   time_series_points — total historical snapshot rows
 *   failure_reason    — NO_FUND | NO_ASSETS | NO_SNAPSHOT | null
 *   status            — PASS | FAIL
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "DB_UNAVAILABLE", message: "Database not available" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id") ?? "";
  const quarter = searchParams.get("quarter");

  if (!quarter) {
    return Response.json(
      { error_code: "MISSING_PARAM", message: "quarter is required" },
      { status: 400 }
    );
  }

  try {
    const [fundRes, investmentRes, assetRes, snapshotRes, seriesRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cnt FROM repe_fund WHERE fund_id = $1::uuid`,
        [params.fundId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM re_investment WHERE fund_id = $1::uuid`,
        [params.fundId]
      ),
      pool.query(
        `SELECT COUNT(a.asset_id) AS cnt
         FROM repe_asset a
         JOIN repe_deal d ON d.deal_id = a.deal_id
         WHERE d.fund_id = $1::uuid`,
        [params.fundId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM re_fund_quarter_state
         WHERE fund_id = $1::uuid AND quarter = $2`,
        [params.fundId, quarter]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM re_fund_quarter_state WHERE fund_id = $1::uuid`,
        [params.fundId]
      ),
    ]);

    const fundExists = Number(fundRes.rows[0]?.cnt ?? 0) > 0;
    const investmentCount = Number(investmentRes.rows[0]?.cnt ?? 0);
    const assetCount = Number(assetRes.rows[0]?.cnt ?? 0);
    const snapshotExists = Number(snapshotRes.rows[0]?.cnt ?? 0) > 0;
    const timeSeriesPoints = Number(seriesRes.rows[0]?.cnt ?? 0);

    let failureReason: string | null = null;
    if (!fundExists) failureReason = "NO_FUND";
    else if (assetCount === 0) failureReason = "NO_ASSETS";
    else if (!snapshotExists) failureReason = "NO_SNAPSHOT";

    return Response.json({
      fund_id: params.fundId,
      env_id: envId,
      quarter,
      fund_exists: fundExists,
      investment_count: investmentCount,
      asset_count: assetCount,
      snapshot_exists: snapshotExists,
      time_series_points: timeSeriesPoints,
      failure_reason: failureReason,
      status: failureReason ? "FAIL" : "PASS",
    });
  } catch (err) {
    console.error("[re/v2/funds/pipeline-status] error", err);
    return Response.json(
      { error_code: "DB_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}
