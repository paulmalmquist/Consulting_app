import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investors/[partnerId]/capital-activity?quarter=2026Q1&entry_type=contribution
 *
 * Returns capital ledger entries for a specific partner.
 */
export async function GET(
  request: Request,
  { params }: { params: { partnerId: string } }
) {
  const pool = getPool();
  const empty = { entries: [] as Record<string, unknown>[], totals: {} };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");
  const entryType = searchParams.get("entry_type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  try {
    const conditions: string[] = ["cle.partner_id = $1::uuid"];
    const queryParams: (string | number)[] = [params.partnerId];
    let paramIdx = 2;

    if (quarter) {
      conditions.push(`cle.quarter = $${paramIdx}`);
      queryParams.push(quarter);
      paramIdx++;
    }
    if (entryType) {
      conditions.push(`cle.entry_type = $${paramIdx}`);
      queryParams.push(entryType);
      paramIdx++;
    }

    conditions.push(`1=1`);
    queryParams.push(limit);

    const res = await pool.query(
      `SELECT
         cle.entry_id::text,
         cle.fund_id::text,
         f.name AS fund_name,
         cle.entry_type,
         cle.amount_base::text AS amount,
         cle.effective_date::text,
         cle.quarter,
         cle.memo
       FROM re_capital_ledger_entry cle
       JOIN repe_fund f ON f.fund_id = cle.fund_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY cle.effective_date DESC
       LIMIT $${paramIdx}`,
      queryParams
    );

    // Compute totals by entry type
    const totals: Record<string, number> = {};
    for (const row of res.rows) {
      const t = row.entry_type as string;
      const amt = parseFloat(row.amount as string) || 0;
      totals[t] = (totals[t] || 0) + amt;
    }

    return Response.json({
      entries: res.rows,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, String(v)])
      ),
    });
  } catch (err) {
    console.error("[re/v2/investors/[id]/capital-activity] DB error", err);
    return Response.json(empty);
  }
}
