import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { requireTradingMembership, tradingWriteAllowed } from "@/lib/server/tradingSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coerce pg string-numerics back to JS numbers.
 */
function coerceNumbers<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && v !== "" && !isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v)) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

const ENTITY_CONFIG: Record<string, {
  table: string;
  idCol: string;
  insertCols: string[];
  updateCols: string[];
}> = {
  signals: {
    table: "trading_signals",
    idCol: "signal_id",
    insertCols: [
      "signal_id", "tenant_id", "theme_id", "name", "description",
      "category", "direction", "strength", "source", "asset_class",
      "tickers", "evidence", "decay_rate", "expires_at",
    ],
    updateCols: [
      "name", "description", "category", "direction", "strength",
      "status", "evidence", "decay_rate", "expires_at",
    ],
  },
  hypotheses: {
    table: "trading_hypotheses",
    idCol: "hypothesis_id",
    insertCols: [
      "hypothesis_id", "tenant_id", "thesis", "rationale",
      "expected_outcome", "timeframe", "confidence",
      "proves_right", "proves_wrong", "invalidation_level", "tags",
    ],
    updateCols: [
      "thesis", "rationale", "expected_outcome", "timeframe",
      "confidence", "status", "outcome_notes", "outcome_score",
      "resolved_at", "tags",
    ],
  },
  positions: {
    table: "trading_positions",
    idCol: "position_id",
    insertCols: [
      "position_id", "tenant_id", "hypothesis_id", "ticker", "asset_name",
      "asset_class", "direction", "entry_price", "size", "notional",
      "stop_loss", "take_profit", "notes", "entry_at",
    ],
    updateCols: [
      "current_price", "stop_loss", "take_profit", "notes", "status",
    ],
  },
  watchlist: {
    table: "trading_watchlist",
    idCol: "watchlist_id",
    insertCols: [
      "watchlist_id", "tenant_id", "ticker", "asset_name",
      "asset_class", "notes", "alert_above", "alert_below",
    ],
    updateCols: [
      "asset_name", "asset_class", "current_price", "price_change_1d",
      "price_change_1w", "notes", "alert_above", "alert_below", "is_active",
    ],
  },
  research: {
    table: "trading_research_notes",
    idCol: "note_id",
    insertCols: [
      "note_id", "tenant_id", "title", "content", "note_type",
      "signal_id", "hypothesis_id", "position_id", "theme_id",
      "ticker", "tags",
    ],
    updateCols: ["title", "content", "note_type", "tags"],
  },
  briefs: {
    table: "trading_daily_briefs",
    idCol: "brief_id",
    insertCols: [
      "brief_id", "tenant_id", "brief_date", "regime_label", "regime_change",
      "market_summary", "key_moves", "signals_fired", "hypotheses_at_risk",
      "position_pnl_summary", "what_changed", "top_risks", "recommended_actions",
    ],
    updateCols: [],
  },
  performance: {
    table: "trading_performance_snapshots",
    idCol: "perf_id",
    insertCols: [
      "perf_id", "tenant_id", "snapshot_date", "total_pnl",
      "unrealized_pnl", "realized_pnl", "open_positions", "closed_positions",
      "win_count", "loss_count", "win_rate", "avg_win", "avg_loss",
      "best_trade_pnl", "worst_trade_pnl", "equity_value", "metadata",
    ],
    updateCols: [],
  },
};

const JSON_COLS = new Set([
  "tickers", "evidence", "proves_right", "proves_wrong", "tags",
  "key_moves", "signals_fired", "hypotheses_at_risk",
  "position_pnl_summary", "top_risks", "recommended_actions", "metadata",
]);

/**
 * POST /api/v1/trading/[entity]
 * Creates a new record in the corresponding trading table.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const config = ENTITY_CONFIG[entity];
  if (!config) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ error: "Database pool not available" }, { status: 503 });
  }

  try {
    const access = await requireTradingMembership(req);
    if (access.error) return access.error;
    if (!tradingWriteAllowed(access.membership.role)) {
      return NextResponse.json({ error: "Write access required" }, { status: 403 });
    }

    const body = await req.json();
    const id = crypto.randomUUID();
    body[config.idCol] = id;
    body.tenant_id = access.membership.tenant_id;

    // Default entry_at for positions
    if (entity === "positions" && !body.entry_at) {
      body.entry_at = new Date().toISOString();
    }

    const cols = config.insertCols.filter((c) => body[c] !== undefined);
    const vals = cols.map((c) => JSON_COLS.has(c) ? JSON.stringify(body[c]) : body[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    const sql = `INSERT INTO public.${config.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
    const result = await pool.query(sql, vals);
    return NextResponse.json(coerceNumbers(result.rows[0]), { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Trading POST /${entity} error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/trading/[entity]?id=<uuid>
 * Updates an existing record. Requires ?id= query param.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const config = ENTITY_CONFIG[entity];
  if (!config) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 400 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing ?id= query param" }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ error: "Database pool not available" }, { status: 503 });
  }

  try {
    const access = await requireTradingMembership(req);
    if (access.error) return access.error;
    if (!tradingWriteAllowed(access.membership.role)) {
      return NextResponse.json({ error: "Write access required" }, { status: 403 });
    }

    const body = await req.json();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let paramIdx = 1;

    for (const col of config.updateCols) {
      if (body[col] !== undefined) {
        sets.push(`${col} = $${paramIdx++}`);
        vals.push(JSON_COLS.has(col) ? JSON.stringify(body[col]) : body[col]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    sets.push(`updated_at = now()`);
    vals.push(id);

    vals.push(access.membership.tenant_id);

    const sql = `UPDATE public.${config.table} SET ${sets.join(", ")} WHERE ${config.idCol} = $${paramIdx} AND tenant_id = $${paramIdx + 1}::uuid RETURNING *`;
    const result = await pool.query(sql, vals);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(coerceNumbers(result.rows[0]));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Trading PATCH /${entity} error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
