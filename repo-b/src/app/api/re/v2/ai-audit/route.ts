import { getPool } from "@/lib/server/db";

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const decisionType = searchParams.get("decision_type");
  const toolName = searchParams.get("tool_name");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  if (!businessId) {
    return Response.json({ error: "business_id required" }, { status: 400 });
  }

  const conditions: string[] = ["business_id = $1"];
  const params: (string | number)[] = [businessId];
  let paramIdx = 2;

  if (envId) {
    conditions.push(`env_id = $${paramIdx}`);
    params.push(envId);
    paramIdx++;
  }
  if (decisionType) {
    conditions.push(`decision_type = $${paramIdx}`);
    params.push(decisionType);
    paramIdx++;
  }
  if (toolName) {
    conditions.push(`tool_name = $${paramIdx}`);
    params.push(toolName);
    paramIdx++;
  }

  const where = conditions.join(" AND ");
  params.push(limit, offset);

  try {
    const { rows } = await pool.query(
      `SELECT id, business_id, env_id, conversation_id, actor,
              decision_type, tool_name, model_used,
              latency_ms, confidence, grounding_score,
              success, error_message, tags, created_at
       FROM ai_decision_audit_log
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params,
    );

    // Stats query
    const statsParams = [businessId, ...(envId ? [envId] : [])];
    const statsWhere = envId ? "business_id = $1 AND env_id = $2" : "business_id = $1";
    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_decisions,
         COUNT(*) FILTER (WHERE success = true)::int AS successful,
         COUNT(*) FILTER (WHERE success = false)::int AS failed,
         ROUND(AVG(latency_ms))::int AS avg_latency_ms,
         ROUND(AVG(grounding_score)::numeric, 3) AS avg_grounding_score
       FROM ai_decision_audit_log
       WHERE ${statsWhere}`,
      statsParams,
    );

    return Response.json({
      decisions: rows,
      stats: statsRows[0] || {},
      count: rows.length,
      limit,
      offset,
    });
  } catch (err) {
    console.error("ai-audit query error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
