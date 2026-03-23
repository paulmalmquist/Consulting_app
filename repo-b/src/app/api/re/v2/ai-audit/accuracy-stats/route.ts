import { getPool } from "@/lib/server/db";

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return Response.json({ error: "business_id required" }, { status: 400 });
  }

  try {
    // Overall grounding stats
    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE grounding_score IS NOT NULL)::int AS scored_count,
         ROUND(AVG(grounding_score)::numeric, 3) AS avg_score,
         COUNT(*) FILTER (WHERE grounding_score >= 0.8)::int AS high_count,
         COUNT(*) FILTER (WHERE grounding_score >= 0.5 AND grounding_score < 0.8)::int AS mixed_count,
         COUNT(*) FILTER (WHERE grounding_score < 0.5 AND grounding_score IS NOT NULL)::int AS low_count
       FROM ai_decision_audit_log
       WHERE business_id = $1 AND decision_type = 'response'`,
      [businessId],
    );

    // Weekly trend (last 12 weeks)
    const { rows: trendRows } = await pool.query(
      `SELECT
         date_trunc('week', created_at)::date AS week,
         ROUND(AVG(grounding_score)::numeric, 3) AS avg_score,
         COUNT(*)::int AS count
       FROM ai_decision_audit_log
       WHERE business_id = $1
         AND grounding_score IS NOT NULL
         AND created_at >= now() - interval '12 weeks'
       GROUP BY date_trunc('week', created_at)
       ORDER BY week`,
      [businessId],
    );

    // Top tools by avg grounding score
    const { rows: toolRows } = await pool.query(
      `SELECT
         tool_name,
         ROUND(AVG(grounding_score)::numeric, 3) AS avg_score,
         COUNT(*)::int AS call_count
       FROM ai_decision_audit_log
       WHERE business_id = $1
         AND tool_name IS NOT NULL
         AND grounding_score IS NOT NULL
       GROUP BY tool_name
       ORDER BY avg_score DESC
       LIMIT 10`,
      [businessId],
    );

    return Response.json({
      stats: statsRows[0] || {},
      weekly_trend: trendRows,
      tools_by_accuracy: toolRows,
    });
  } catch (err) {
    console.error("accuracy-stats query error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
