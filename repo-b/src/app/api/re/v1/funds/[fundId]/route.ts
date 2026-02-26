import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { Allow: "GET, OPTIONS" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not configured" }, { status: 503 });
  }

  try {
    const [fundRes, termsRes] = await Promise.all([
      pool.query(
        `SELECT
           fund_id::text, business_id::text, name, vintage_year,
           fund_type, strategy, sub_strategy, target_size, term_years,
           status, created_at
         FROM repe_fund WHERE fund_id = $1::uuid`,
        [params.fundId]
      ),
      pool.query(
        `SELECT
           term_id::text, fund_id::text, effective_date,
           preferred_return_rate, carry_rate, waterfall_style,
           management_fee_rate, hurdle_rate, created_at
         FROM repe_fund_term WHERE fund_id = $1::uuid
         ORDER BY effective_date DESC`
        ,
        [params.fundId]
      ).catch(() => ({ rows: [] })),
    ]);

    if (!fundRes.rows[0]) {
      return Response.json({ error_code: "FUND_NOT_FOUND", message: `Fund ${params.fundId} not found` }, { status: 404 });
    }

    return Response.json({ fund: fundRes.rows[0], terms: termsRes.rows });
  } catch (err) {
    console.error("[re/v1/funds/[fundId]] DB error", err);
    return Response.json({ error_code: "DB_ERROR", message: "Failed to load fund" }, { status: 500 });
  }
}
