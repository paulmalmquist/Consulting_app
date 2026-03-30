import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/market-rotation
 *
 * Returns Market Rotation Engine data: active segments, recent intel briefs,
 * and feature cards. Used by the Decision Engine "Market Segments" tab.
 *
 * Query params:
 *   limit_briefs  — max intel briefs to return (default 20)
 *   limit_cards   — max feature cards to return (default 50)
 *   status        — filter feature cards by status (optional)
 */
export async function GET(request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database pool not available" },
      { status: 503 }
    );
  }

  const { searchParams } = request.nextUrl;
  const limitBriefs = Math.min(parseInt(searchParams.get("limit_briefs") ?? "20", 10), 100);
  const limitCards = Math.min(parseInt(searchParams.get("limit_cards") ?? "50", 10), 200);
  const statusFilter = searchParams.get("status");

  try {
    const [segmentsRes, briefsRes, cardsRes] = await Promise.all([
      pool.query(
        `SELECT
           segment_id, category, subcategory, segment_name,
           tickers, tier, rotation_cadence_days, last_rotated_at,
           rotation_priority_score, heat_triggers, research_protocol,
           cross_vertical, is_active, updated_at
         FROM public.market_segments
         WHERE is_active = TRUE
         ORDER BY tier ASC, rotation_priority_score DESC`
      ),
      pool.query(
        `SELECT
           b.brief_id, b.segment_id, b.run_date, b.regime_tag,
           b.composite_score, b.key_findings, b.feature_gaps_identified,
           b.cross_vertical_insights, b.signals, b.created_at,
           s.segment_name, s.category, s.tier
         FROM public.market_segment_intel_brief b
         JOIN public.market_segments s ON s.segment_id = b.segment_id
         ORDER BY b.run_date DESC, b.composite_score DESC
         LIMIT $1`,
        [limitBriefs]
      ),
      statusFilter
        ? pool.query(
            `SELECT
               card_id, segment_id, gap_category, title, description,
               priority_score, cross_vertical_flag, status, target_module,
               lineage_note, created_at
             FROM public.trading_feature_cards
             WHERE status = $1
             ORDER BY priority_score DESC
             LIMIT $2`,
            [statusFilter, limitCards]
          )
        : pool.query(
            `SELECT
               card_id, segment_id, gap_category, title, description,
               priority_score, cross_vertical_flag, status, target_module,
               lineage_note, created_at
             FROM public.trading_feature_cards
             WHERE status != 'deferred'
             ORDER BY priority_score DESC
             LIMIT $1`,
            [limitCards]
          ),
    ]);

    return NextResponse.json({
      segments: segmentsRes.rows,
      briefs: briefsRes.rows,
      featureCards: cardsRes.rows,
      meta: {
        segmentCount: segmentsRes.rowCount ?? 0,
        briefCount: briefsRes.rowCount ?? 0,
        cardCount: cardsRes.rowCount ?? 0,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Market rotation API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
