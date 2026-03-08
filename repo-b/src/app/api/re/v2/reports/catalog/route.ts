import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/reports/catalog
 * List available report templates, or get a specific one by report_key.
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const reportKey = searchParams.get("report_key");

  try {
    if (reportKey) {
      const res = await pool.query(
        "SELECT * FROM re_report_template WHERE report_key = $1",
        [reportKey],
      );
      if (res.rows.length === 0) {
        return Response.json({ error: "Report not found" }, { status: 404 });
      }
      return Response.json(res.rows[0]);
    }

    const res = await pool.query(
      "SELECT report_key, name, description, entity_level FROM re_report_template ORDER BY entity_level, name",
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[reports/catalog] Error:", err);
    return Response.json({ error: "Failed to load report catalog" }, { status: 500 });
  }
}
