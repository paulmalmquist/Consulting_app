import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

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

export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2) {
    return Response.json({ error: "name is required (min 2 chars)" }, { status: 400 });
  }

  const dealId = randomUUID();
  try {
    const res = await pool.query(
      `INSERT INTO repe_deal
         (deal_id, fund_id, name, deal_type, stage, sponsor,
          target_close_date, committed_capital, invested_capital, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING
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
         created_at`,
      [
        dealId,
        params.fundId,
        name,
        (body.deal_type as string) || "equity",
        (body.stage as string) || "sourcing",
        (body.sponsor as string) || null,
        (body.target_close_date as string) || null,
        body.committed_capital ?? null,
        body.invested_capital ?? null,
      ]
    );
    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/investments] POST error", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
