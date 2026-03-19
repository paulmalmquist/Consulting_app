import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "DB not configured" } },
      { status: 404 }
    );
  }

  try {
    // Get loans for this asset
    const loansRes = await pool.query(
      `SELECT id::text AS loan_id, loan_name, upb, rate, maturity_date, fund_id::text
       FROM re_loan
       WHERE asset_id = $1
       ORDER BY loan_name`,
      [params.assetId]
    );

    const loans = [];
    for (const loan of loansRes.rows) {
      // Get covenant definitions
      const covsRes = await pool.query(
        `SELECT covenant_type, threshold, comparator
         FROM re_loan_covenant_definition
         WHERE loan_id = $1 AND active = true
         ORDER BY covenant_type`,
        [loan.loan_id]
      );

      // Get latest covenant test results
      const resultsRes = await pool.query(
        `SELECT dscr, ltv, debt_yield, pass, headroom, breached, quarter
         FROM re_loan_covenant_result_qtr
         WHERE loan_id = $1
         ORDER BY quarter DESC
         LIMIT 1`,
        [loan.loan_id]
      );

      const latestResult = resultsRes.rows[0] || null;

      loans.push({
        loan_id: loan.loan_id,
        loan_name: loan.loan_name,
        upb: parseFloat(loan.upb || "0"),
        rate: parseFloat(loan.rate || "0"),
        maturity_date: loan.maturity_date,
        covenants: covsRes.rows.map((c: Record<string, unknown>) => ({
          covenant_type: c.covenant_type,
          threshold: parseFloat(String(c.threshold || "0")),
          comparator: c.comparator,
        })),
        latest_result: latestResult
          ? {
              dscr: latestResult.dscr ? parseFloat(latestResult.dscr) : null,
              ltv: latestResult.ltv ? parseFloat(latestResult.ltv) : null,
              debt_yield: latestResult.debt_yield ? parseFloat(latestResult.debt_yield) : null,
              pass: latestResult.pass,
              headroom: latestResult.headroom ? parseFloat(latestResult.headroom) : null,
              breached: latestResult.breached,
              quarter: latestResult.quarter,
            }
          : null,
      });
    }

    return Response.json({ asset_id: params.assetId, loans });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ detail: { error_code: "INTERNAL", message } }, { status: 500 });
  }
}
