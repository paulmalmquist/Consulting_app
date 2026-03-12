/**
 * GET /api/re/v2/dashboards/pipeline-stages
 *
 * Returns deal counts and total headline_price grouped by status from re_pipeline_deal.
 * Used by PipelineBarWidget.
 *
 * Query params:
 *   env_id      (required)
 *   business_id (required)
 *   fund_id     (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const env_id = searchParams.get("env_id");
  const business_id = searchParams.get("business_id");
  const fund_id = searchParams.get("fund_id");

  if (!env_id || !business_id) {
    return NextResponse.json({ error: "env_id and business_id are required" }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const client = await pool.connect();
  try {
    const params: (string)[] = [env_id];
    let fundClause = "";
    if (fund_id) {
      params.push(fund_id);
      fundClause = `AND d.fund_id = $${params.length}`;
    }

    const sql = `
      SELECT
        d.status,
        COUNT(*)::int          AS deal_count,
        COALESCE(SUM(d.headline_price), 0)::bigint AS total_value
      FROM re_pipeline_deal d
      WHERE d.env_id = $1
        ${fundClause}
      GROUP BY d.status
      ORDER BY d.status
    `;

    const result = await client.query(sql, params);
    return NextResponse.json({ stages: result.rows });
  } catch (err) {
    console.error("pipeline-stages error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  } finally {
    client.release();
  }
}
