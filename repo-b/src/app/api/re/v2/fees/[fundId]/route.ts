import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/fees/[fundId]
 *
 * Returns fee policies and historical accruals for a specific fund.
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    // ── Fund info ───────────────────────────────────────────────────────
    const fundRes = await pool.query(
      `SELECT fund_id::text, name, strategy, vintage_year, business_id::text
       FROM repe_fund
       WHERE fund_id = $1::uuid`,
      [params.fundId]
    );
    if (fundRes.rows.length === 0) {
      return Response.json({ error: "Fund not found" }, { status: 404 });
    }
    const fund = fundRes.rows[0];

    // ── Fee Policies ────────────────────────────────────────────────────
    const policiesRes = await pool.query(
      `SELECT
         id::text,
         fund_id::text,
         fee_basis,
         annual_rate::text,
         start_date::text,
         stepdown_date::text,
         stepdown_rate::text,
         created_at::text
       FROM re_fee_policy
       WHERE fund_id = $1::uuid
       ORDER BY fee_basis`,
      [params.fundId]
    );

    // ── Historical Accruals ─────────────────────────────────────────────
    const accrualsRes = await pool.query(
      `SELECT
         id::text,
         fund_id::text,
         quarter,
         fee_basis,
         base_amount::text,
         annual_rate::text,
         accrued_amount::text,
         created_at::text
       FROM re_fee_accrual_qtr
       WHERE fund_id = $1::uuid
       ORDER BY quarter DESC`,
      [params.fundId]
    );

    return Response.json({
      fund,
      policies: policiesRes.rows,
      accruals: accrualsRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/fees/[fundId]] DB error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Internal error" },
      { status: 500 }
    );
  }
}
