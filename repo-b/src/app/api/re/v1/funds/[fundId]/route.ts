import { getPool } from "@/lib/server/db";
import { getFundDetail } from "@/lib/server/repeFunds";

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
    const detail = await getFundDetail(pool, params.fundId);
    if (!detail) {
      return Response.json({ error_code: "FUND_NOT_FOUND", message: `Fund ${params.fundId} not found` }, { status: 404 });
    }

    return Response.json(detail);
  } catch (err) {
    console.error("[re/v1/funds/[fundId]] DB error", err);
    return Response.json({ error_code: "DB_ERROR", message: "Failed to load fund" }, { status: 500 });
  }
}
