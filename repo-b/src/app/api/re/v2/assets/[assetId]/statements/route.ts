import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * Convert a quarter string like "2026Q1" to start/end dates.
 */
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
 * Compute date range for different period types.
 */
function periodToRange(
  periodType: string,
  period: string,
): { start: string; end: string } | null {
  if (periodType === "quarterly") return quarterToRange(period);

  if (periodType === "monthly") {
    // period = "2026-01"
    const [y, mo] = period.split("-").map(Number);
    if (!y || !mo) return null;
    const lastDay = new Date(y, mo, 0).getDate();
    return {
      start: `${y}-${String(mo).padStart(2, "0")}-01`,
      end: `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  if (periodType === "annual") {
    // period = "2026"
    const y = parseInt(period, 10);
    if (!y) return null;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  if (periodType === "ytd") {
    // period = "2026Q1" → YTD from Jan 1 to end of Q1
    const qr = quarterToRange(period);
    if (!qr) return null;
    const y = period.slice(0, 4);
    return { start: `${y}-01-01`, end: qr.end };
  }

  if (periodType === "ttm") {
    // period = "2026Q1" → trailing 12 months ending at Q1
    const qr = quarterToRange(period);
    if (!qr) return null;
    const endDate = new Date(qr.end);
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    startDate.setDate(startDate.getDate() + 1);
    return {
      start: startDate.toISOString().slice(0, 10),
      end: qr.end,
    };
  }

  return null;
}

interface StatementLine {
  line_code: string;
  display_label: string;
  group_label: string;
  sort_order: number;
  is_subtotal: boolean;
  subtotal_of: string[];
  indent_level: number;
  sign_display: number;
  format_type: string;
  amount: number;
  comparison_amount: number | null;
  variance: number | null;
  variance_pct: number | null;
}

/**
 * GET /api/re/v2/assets/[assetId]/statements
 *
 * Params:
 *   statement: IS | CF | BS | KPI
 *   period_type: monthly | quarterly | annual | ytd | ttm
 *   period: e.g. "2026Q1" or "2026-01" or "2026"
 *   scenario: actual | budget | proforma (default: actual)
 *   comparison: none | budget | prior_year (default: none)
 *   env_id, business_id: required
 */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const statement = searchParams.get("statement") || "IS";
  const periodType = searchParams.get("period_type") || "quarterly";
  const period = searchParams.get("period") || "";
  const scenario = searchParams.get("scenario") || "actual";
  const comparison = searchParams.get("comparison") || "none";
  const envId = searchParams.get("env_id") || "";
  const businessId = searchParams.get("business_id") || "";

  if (!period) {
    return Response.json({ error: "period param required" }, { status: 400 });
  }

  const range = periodToRange(periodType, period);
  if (!range) {
    return Response.json({ error: "Invalid period/period_type" }, { status: 400 });
  }

  try {
    // 1. Load statement line definitions
    const defRes = await pool.query(
      `SELECT line_code, display_label, group_label, sort_order, is_subtotal,
              subtotal_of, indent_level, sign_display, format_type
       FROM acct_statement_line_def
       WHERE statement = $1
       ORDER BY sort_order`,
      [statement],
    );
    const defs = defRes.rows;

    if (defs.length === 0) {
      return Response.json({ lines: [], period, periodType });
    }

    // 2. Load actual amounts from normalized NOI
    let amountQuery: string;
    let amountParams: unknown[];

    if (scenario === "actual") {
      amountQuery = `
        SELECT line_code, SUM(amount) AS amount
        FROM acct_normalized_noi_monthly
        WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
          AND period_month >= $4::date AND period_month <= $5::date
        GROUP BY line_code`;
      amountParams = [envId, businessId, params.assetId, range.start, range.end];
    } else {
      // Budget or proforma
      const versionName = scenario === "budget" ? "2025 Annual Budget" : "Acquisition Pro Forma";
      amountQuery = `
        SELECT b.line_code, SUM(b.amount) AS amount
        FROM uw_noi_budget_monthly b
        JOIN uw_version v ON v.id = b.uw_version_id
        WHERE b.env_id = $1 AND b.business_id = $2::uuid AND b.asset_id = $3::uuid
          AND b.period_month >= $4::date AND b.period_month <= $5::date
          AND v.name = $6
        GROUP BY b.line_code`;
      amountParams = [envId, businessId, params.assetId, range.start, range.end, versionName];
    }

    const amtRes = await pool.query(amountQuery, amountParams);
    const amounts = new Map<string, number>(
      amtRes.rows.map((r: { line_code: string; amount: string }) => [r.line_code, Number(r.amount)]),
    );

    // 3. Load comparison amounts if requested
    let compAmounts: Map<string, number> | null = null;

    if (comparison === "budget") {
      const compRes = await pool.query(
        `SELECT b.line_code, SUM(b.amount) AS amount
         FROM uw_noi_budget_monthly b
         JOIN uw_version v ON v.id = b.uw_version_id
         WHERE b.env_id = $1 AND b.business_id = $2::uuid AND b.asset_id = $3::uuid
           AND b.period_month >= $4::date AND b.period_month <= $5::date
           AND v.name = '2025 Annual Budget'
         GROUP BY b.line_code`,
        [envId, businessId, params.assetId, range.start, range.end],
      );
      compAmounts = new Map(
        compRes.rows.map((r: { line_code: string; amount: string }) => [r.line_code, Number(r.amount)]),
      );
    } else if (comparison === "prior_year") {
      const pyStart = new Date(range.start);
      pyStart.setFullYear(pyStart.getFullYear() - 1);
      const pyEnd = new Date(range.end);
      pyEnd.setFullYear(pyEnd.getFullYear() - 1);
      const compRes = await pool.query(
        `SELECT line_code, SUM(amount) AS amount
         FROM acct_normalized_noi_monthly
         WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
           AND period_month >= $4::date AND period_month <= $5::date
         GROUP BY line_code`,
        [envId, businessId, params.assetId, pyStart.toISOString().slice(0, 10), pyEnd.toISOString().slice(0, 10)],
      );
      compAmounts = new Map(
        compRes.rows.map((r: { line_code: string; amount: string }) => [r.line_code, Number(r.amount)]),
      );
    }

    // 4. Also load cash flow items from rollup table
    if (statement === "CF") {
      const cfRes = await pool.query(
        `SELECT quarter, capex, debt_service, ti_lc, reserves, net_cash_flow, noi
         FROM re_asset_acct_quarter_rollup
         WHERE env_id = $1::uuid AND business_id = $2::uuid AND asset_id = $3::uuid
           AND quarter = $4
         LIMIT 1`,
        [envId, businessId, params.assetId, period],
      );
      if (cfRes.rows.length > 0) {
        const cf = cfRes.rows[0];
        if (!amounts.has("NOI") && cf.noi) amounts.set("NOI", Number(cf.noi));
        if (!amounts.has("CAPEX") && cf.capex) amounts.set("CAPEX", -Math.abs(Number(cf.capex)));
        if (!amounts.has("TENANT_IMPROVEMENTS") && cf.ti_lc) amounts.set("TENANT_IMPROVEMENTS", -Math.abs(Number(cf.ti_lc) * 0.6));
        if (!amounts.has("LEASING_COMMISSIONS") && cf.ti_lc) amounts.set("LEASING_COMMISSIONS", -Math.abs(Number(cf.ti_lc) * 0.4));
        if (!amounts.has("REPLACEMENT_RESERVES") && cf.reserves) amounts.set("REPLACEMENT_RESERVES", -Math.abs(Number(cf.reserves)));
        if (!amounts.has("DEBT_SERVICE_INT") && cf.debt_service) amounts.set("DEBT_SERVICE_INT", -Math.abs(Number(cf.debt_service)));
        if (!amounts.has("NET_CASH_FLOW") && cf.net_cash_flow) amounts.set("NET_CASH_FLOW", Number(cf.net_cash_flow));
      }
    }

    // 5. Assemble lines with computed subtotals
    const lineAmounts = new Map<string, number>();

    // First pass: set direct amounts
    for (const def of defs) {
      if (!def.is_subtotal) {
        lineAmounts.set(def.line_code, amounts.get(def.line_code) ?? 0);
      }
    }

    // Second pass: compute subtotals
    for (const def of defs) {
      if (def.is_subtotal && def.subtotal_of && def.subtotal_of.length > 0) {
        let total = 0;
        for (const code of def.subtotal_of) {
          total += lineAmounts.get(code) ?? amounts.get(code) ?? 0;
        }
        lineAmounts.set(def.line_code, total);
      }
    }

    // Special: NOI margin
    const egi = lineAmounts.get("EGI") ?? 0;
    const noi = lineAmounts.get("NOI") ?? 0;
    if (amounts.has("RENT") || amounts.has("OTHER_INCOME")) {
      lineAmounts.set("NOI_MARGIN", egi > 0 ? noi / egi : 0);
    }

    // 6. Build response
    const lines: StatementLine[] = defs.map((def: Record<string, unknown>) => {
      const lineCode = def.line_code as string;
      const amt = lineAmounts.get(lineCode) ?? 0;
      const compAmt = compAmounts?.get(lineCode) ?? null;
      const variance = compAmt !== null ? amt - compAmt : null;
      const variancePct =
        variance !== null && compAmt !== null && compAmt !== 0
          ? variance / Math.abs(compAmt)
          : null;

      return {
        line_code: lineCode,
        display_label: def.display_label as string,
        group_label: def.group_label as string,
        sort_order: def.sort_order as number,
        is_subtotal: def.is_subtotal as boolean,
        subtotal_of: (def.subtotal_of as string[]) || [],
        indent_level: def.indent_level as number,
        sign_display: def.sign_display as number,
        format_type: (def.format_type as string) || "currency",
        amount: amt,
        comparison_amount: compAmt,
        variance,
        variance_pct: variancePct,
      };
    });

    return Response.json({
      statement,
      period,
      period_type: periodType,
      scenario,
      comparison,
      lines,
    });
  } catch (err) {
    console.error("[statements] Error:", err);
    return Response.json({ error: "Statement assembly failed" }, { status: 500 });
  }
}
