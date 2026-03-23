import { getPool } from "@/lib/server/db";

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("business_id");
  const fundId = searchParams.get("fund_id");
  const quarter = searchParams.get("quarter");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  if (!businessId) {
    return Response.json({ error: "business_id required" }, { status: 400 });
  }

  const conditions: string[] = ["d.business_id = $1"];
  const params: (string | number)[] = [businessId];
  let idx = 2;

  if (fundId) {
    conditions.push(`d.fund_id = $${idx}`);
    params.push(fundId);
    idx++;
  }
  if (quarter) {
    conditions.push(`d.quarter = $${idx}`);
    params.push(quarter);
    idx++;
  }
  if (status) {
    conditions.push(`d.status = $${idx}`);
    params.push(status);
    idx++;
  }

  const where = conditions.join(" AND ");
  params.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT d.*, f.name AS fund_name
       FROM re_ir_drafts d
       LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${idx}`,
      params,
    );
    return Response.json({ drafts: rows, count: rows.length });
  } catch (err) {
    console.error("ir-drafts query error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
