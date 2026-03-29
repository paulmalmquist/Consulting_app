import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { requireTradingMembership } from "@/lib/server/tradingSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coerce pg string-numerics back to JS numbers.
 * pg returns NUMERIC / FLOAT columns as strings to avoid precision loss.
 * The frontend expects plain numbers for .toFixed(), comparisons, etc.
 */
function coerceNumbers<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && v !== "" && !isNaN(Number(v)) && !isDate(v)) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** Naive date-string detector to avoid coercing ISO timestamps to numbers. */
function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function coerceRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(coerceNumbers);
}

/**
 * GET /api/v1/trading
 *
 * Returns all trading-lab data for the Market Intelligence page.
 * Uses the server-side pg pool so the page is not blocked by
 * missing NEXT_PUBLIC_SUPABASE_* browser credentials.
 */
export async function GET(request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database pool not available" },
      { status: 503 }
    );
  }

  try {
    const access = await requireTradingMembership(
      request,
      request.nextUrl.searchParams.get("env_id"),
    );
    if (access.error) return access.error;

    const tenantId = access.membership.tenant_id;
    const [
      themesRes,
      signalsRes,
      hypothesesRes,
      positionsRes,
      perfRes,
      notesRes,
      briefRes,
      watchlistRes,
    ] = await Promise.all([
      pool.query(
        `SELECT * FROM public.trading_themes WHERE tenant_id = $1::uuid ORDER BY created_at DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_signals WHERE tenant_id = $1::uuid ORDER BY strength DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_hypotheses WHERE tenant_id = $1::uuid ORDER BY created_at DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_positions WHERE tenant_id = $1::uuid ORDER BY entry_at DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_performance_snapshots WHERE tenant_id = $1::uuid ORDER BY snapshot_date DESC LIMIT 30`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_research_notes WHERE tenant_id = $1::uuid ORDER BY created_at DESC`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_daily_briefs WHERE tenant_id = $1::uuid ORDER BY brief_date DESC LIMIT 1`,
        [tenantId],
      ),
      pool.query(
        `SELECT * FROM public.trading_watchlist WHERE tenant_id = $1::uuid AND is_active = true ORDER BY ticker`,
        [tenantId],
      ),
    ]);

    return NextResponse.json({
      themes: coerceRows(themesRes.rows),
      signals: coerceRows(signalsRes.rows),
      hypotheses: coerceRows(hypothesesRes.rows),
      positions: coerceRows(positionsRes.rows),
      performanceSnapshots: coerceRows(perfRes.rows),
      researchNotes: coerceRows(notesRes.rows),
      dailyBrief: briefRes.rows[0] ? coerceNumbers(briefRes.rows[0]) : null,
      watchlist: coerceRows(watchlistRes.rows),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Trading API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
