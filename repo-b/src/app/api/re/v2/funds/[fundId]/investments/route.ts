import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT
         deal_id::text AS investment_id,
         fund_id::text,
         name,
         deal_type AS investment_type,
         stage,
         sponsor,
         target_close_date,
         committed_capital,
         invested_capital,
         realized_distributions,
         created_at
       FROM repe_deal
       WHERE fund_id = $1::uuid
       ORDER BY created_at DESC`,
      [params.fundId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/investments] DB error", err);
    return Response.json([], { status: 200 });
  }
}
