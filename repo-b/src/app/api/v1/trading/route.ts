import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

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
export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database pool not available" },
      { status: 503 }
    );
  }

  try {
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
        `SELECT * FROM public.trading_themes ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT * FROM public.trading_signals ORDER BY strength DESC`
      ),
      pool.query(
        `SELECT * FROM public.trading_hypotheses ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT * FROM public.trading_positions ORDER BY entry_at DESC`
      ),
      pool.query(
        `SELECT * FROM public.trading_performance_snapshots ORDER BY snapshot_date DESC LIMIT 30`
      ),
      pool.query(
        `SELECT * FROM public.trading_research_notes ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT * FROM public.trading_daily_briefs ORDER BY brief_date DESC LIMIT 1`
      ),
      pool.query(
        `SELECT * FROM public.trading_watchlist WHERE is_active = true ORDER BY ticker`
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
