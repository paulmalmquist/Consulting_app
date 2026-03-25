import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

function quarterToRange(quarter: string): { start: string; end: string } | null {
  const m = quarter.match(/^(\d{4})Q([1-4])$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  const sm = (q - 1) * 3 + 1;
  const em = sm + 2;
  const start = `${year}-${String(sm).padStart(2, "0")}-01`;
  const lastDay = new Date(year, em, 0).getDate();
  const end = `${year}-${String(em).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * GET /api/re/v2/investments/[investmentId]/statements
 *
 * Aggregates across all assets in the investment, applying ownership %.
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const statement = searchParams.get("statement") || "IS";
  const period = searchParams.get("period") || "";
  const scenario = searchParams.get("scenario") || "actual";
  const envId = searchParams.get("env_id") || "";
  const businessId = searchParams.get("business_id") || "";

  if (!period) return Response.json({ error: "period required" }, { status: 400 });

  const range = quarterToRange(period);
  if (!range) return Response.json({ error: "Invalid period" }, { status: 400 });

  try {
    // Get assets under this investment (deal_id = investmentId)
    const assetsRes = await pool.query(
      `SELECT a.asset_id,
              COALESCE(jv.ownership_percent, 100) / 100.0 AS own_pct
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       LEFT JOIN re_jv jv ON jv.investment_id = d.deal_id
       WHERE d.deal_id = $1::uuid`,
      [params.investmentId],
    );

    if (assetsRes.rows.length === 0) {
      return Response.json({ lines: [], period, statement });
    }

    // Load statement definitions
    const defRes = await pool.query(
      `SELECT line_code, display_label, group_label, sort_order, is_subtotal,
              subtotal_of, indent_level, sign_display, format_type
       FROM acct_statement_line_def WHERE statement = $1 ORDER BY sort_order`,
      [statement],
    );
    const defs = defRes.rows;

    // Aggregate amounts across assets
    const totals = new Map<string, number>();

    for (const asset of assetsRes.rows) {
      const ownPct = Number(asset.own_pct) || 1;

      const amtRes = await pool.query(
        `SELECT line_code, SUM(amount) AS amount
         FROM acct_normalized_noi_monthly
         WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
           AND period_month >= $4::date AND period_month <= $5::date
         GROUP BY line_code`,
        [envId, businessId, asset.asset_id, range.start, range.end],
      );

      for (const r of amtRes.rows) {
        const current = totals.get(r.line_code) ?? 0;
        totals.set(r.line_code, current + Number(r.amount) * ownPct);
      }

      // Cash flow items from rollup
      if (statement === "CF") {
        const cfRes = await pool.query(
          `SELECT noi, capex, debt_service, ti_lc, reserves, net_cash_flow
           FROM re_asset_acct_quarter_rollup
           WHERE env_id = $1::uuid AND business_id = $2::uuid AND asset_id = $3::uuid AND quarter = $4
           LIMIT 1`,
          [envId, businessId, asset.asset_id, period],
        );
        if (cfRes.rows.length > 0) {
          const cf = cfRes.rows[0];
          const add = (key: string, val: number | null) => {
            if (val != null) totals.set(key, (totals.get(key) ?? 0) + Number(val) * ownPct);
          };
          add("NOI", cf.noi);
          add("CAPEX", cf.capex ? -Math.abs(cf.capex) : null);
          add("DEBT_SERVICE_INT", cf.debt_service ? -Math.abs(cf.debt_service) : null);
          add("REPLACEMENT_RESERVES", cf.reserves ? -Math.abs(cf.reserves) : null);
          add("NET_CASH_FLOW", cf.net_cash_flow);
        }
      }
    }

    // Compute subtotals
    const lineAmounts = new Map<string, number>();
    for (const def of defs) {
      if (!def.is_subtotal) {
        lineAmounts.set(def.line_code, totals.get(def.line_code) ?? 0);
      }
    }
    for (const def of defs) {
      if (def.is_subtotal && def.subtotal_of?.length > 0) {
        let total = 0;
        for (const code of def.subtotal_of) {
          total += lineAmounts.get(code) ?? totals.get(code) ?? 0;
        }
        lineAmounts.set(def.line_code, total);
      }
    }

    const lines = defs.map((def: Record<string, unknown>) => ({
      line_code: def.line_code,
      display_label: def.display_label,
      group_label: def.group_label,
      sort_order: def.sort_order,
      is_subtotal: def.is_subtotal,
      indent_level: def.indent_level,
      sign_display: def.sign_display,
      format_type: def.format_type,
      amount: lineAmounts.get(def.line_code as string) ?? 0,
      comparison_amount: null,
      variance: null,
      variance_pct: null,
    }));

    return Response.json({
      statement,
      period,
      scenario,
      asset_count: assetsRes.rows.length,
      lines,
    });
  } catch (err) {
    console.error("[investment/statements] Error:", err);
    return Response.json({ error: "Statement assembly failed" }, { status: 500 });
  }
}
