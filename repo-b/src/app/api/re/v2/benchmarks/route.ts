import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/benchmarks
 *
 * Returns benchmark data. Supports filtering by benchmark_name and quarter range.
 * Query params: benchmark_name (default: NCREIF_ODCE), quarters (comma-separated)
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const benchmarkName = searchParams.get("benchmark_name") || "NCREIF_ODCE";
  const quartersParam = searchParams.get("quarters");

  try {
    let query: string;
    let values: string[];

    if (quartersParam) {
      const quarters = quartersParam.split(",").map((q) => q.trim());
      const placeholders = quarters.map((_, i) => `$${i + 2}`).join(", ");
      query = `SELECT id::text, benchmark_name, quarter, total_return::float8, income_return::float8, appreciation::float8
               FROM re_benchmark
               WHERE benchmark_name = $1 AND quarter IN (${placeholders})
               ORDER BY quarter`;
      values = [benchmarkName, ...quarters];
    } else {
      query = `SELECT id::text, benchmark_name, quarter, total_return::float8, income_return::float8, appreciation::float8
               FROM re_benchmark
               WHERE benchmark_name = $1
               ORDER BY quarter`;
      values = [benchmarkName];
    }

    const res = await pool.query(query, values);
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/benchmarks] DB error", err);
    return Response.json([]);
  }
}
