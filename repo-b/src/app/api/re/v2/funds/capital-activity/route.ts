import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/capital-activity?env_id=X&business_id=Y&horizon=12m|24m|all&grain=monthly|quarterly&fund_id=Z
 *
 * Returns time-series capital activity (contributions + distributions) from
 * re_capital_ledger_entry, aggregated across all funds in the business.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { summary: { total_contributed: "0", total_distributed: "0", net_capital_movement: "0" }, series: [] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const horizon = searchParams.get("horizon") || "24m";
  const grain = searchParams.get("grain") || "monthly";

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (fundId) {
      filters += ` AND cle.fund_id = $${idx}::uuid`;
      params.push(fundId);
      idx++;
    }

    // Horizon filter
    let horizonFilter = "";
    if (horizon === "12m") {
      horizonFilter = ` AND cle.effective_date >= (CURRENT_DATE - INTERVAL '12 months')`;
    } else if (horizon === "24m") {
      horizonFilter = ` AND cle.effective_date >= (CURRENT_DATE - INTERVAL '24 months')`;
    }
    // "all" = no date filter

    // Period grouping
    const periodExpr = grain === "quarterly"
      ? `EXTRACT(YEAR FROM cle.effective_date)::text || 'Q' || CEIL(EXTRACT(MONTH FROM cle.effective_date) / 3.0)::int::text`
      : `TO_CHAR(cle.effective_date, 'YYYY-MM')`;

    const sql = `
      WITH activity AS (
        SELECT
          ${periodExpr} AS period,
          cle.entry_type,
          SUM(cle.amount) AS total
        FROM re_capital_ledger_entry cle
        JOIN repe_fund f ON f.fund_id = cle.fund_id
        WHERE f.business_id = $1::uuid
          AND cle.entry_type IN ('contribution', 'distribution')
          ${filters}
          ${horizonFilter}
        GROUP BY period, cle.entry_type
        ORDER BY period
      ),
      pivoted AS (
        SELECT
          period,
          COALESCE(SUM(total) FILTER (WHERE entry_type = 'contribution'), 0) AS contributions,
          COALESCE(SUM(total) FILTER (WHERE entry_type = 'distribution'), 0) AS distributions
        FROM activity
        GROUP BY period
        ORDER BY period
      ),
      totals AS (
        SELECT
          COALESCE(SUM(contributions), 0) AS total_contributed,
          COALESCE(SUM(distributions), 0) AS total_distributed
        FROM pivoted
      )
      SELECT
        t.total_contributed::text,
        t.total_distributed::text,
        (t.total_contributed - t.total_distributed)::text AS net_capital_movement,
        COALESCE(json_agg(
          json_build_object(
            'period', p.period,
            'contributions', p.contributions,
            'distributions', p.distributions
          ) ORDER BY p.period
        ) FILTER (WHERE p.period IS NOT NULL), '[]'::json) AS series
      FROM totals t
      LEFT JOIN pivoted p ON true
      GROUP BY t.total_contributed, t.total_distributed
    `;

    const res = await pool.query(sql, params);

    if (res.rows.length === 0) return Response.json(empty);

    const row = res.rows[0];
    return Response.json({
      summary: {
        total_contributed: row.total_contributed,
        total_distributed: row.total_distributed,
        net_capital_movement: row.net_capital_movement,
      },
      series: row.series,
    });
  } catch (err) {
    console.error("[re/v2/funds/capital-activity] DB error", err);
    return Response.json(empty);
  }
}
