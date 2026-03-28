import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trading/positions/[id]/close
 * Close a position with exit price, auto-calculates realized PnL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: positionId } = await params;
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ error: "Database pool not available" }, { status: 503 });
  }

  try {
    const { exit_price, exit_at } = await req.json();
    if (exit_price == null || typeof exit_price !== "number") {
      return NextResponse.json({ error: "exit_price is required and must be a number" }, { status: 400 });
    }

    // Fetch position
    const posRes = await pool.query(
      "SELECT * FROM public.trading_positions WHERE position_id = $1",
      [positionId]
    );
    if (posRes.rows.length === 0) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    const pos = posRes.rows[0];
    if (pos.status !== "open") {
      return NextResponse.json(
        { error: `Position is already ${pos.status}` },
        { status: 400 }
      );
    }

    const entryPrice = Number(pos.entry_price);
    const size = Number(pos.size);
    const notional = Number(pos.notional) || 1;
    const dirMult = pos.direction === "long" ? 1 : -1;
    const realizedPnl = (exit_price - entryPrice) * size * dirMult;
    const returnPct = (realizedPnl / notional) * 100;
    const exitTs = exit_at || new Date().toISOString();

    const result = await pool.query(
      `UPDATE public.trading_positions SET
        exit_price = $1, realized_pnl = $2, return_pct = $3,
        unrealized_pnl = 0, status = 'closed', exit_at = $4,
        current_price = $1, updated_at = now()
      WHERE position_id = $5
      RETURNING *`,
      [exit_price, realizedPnl, returnPct, exitTs, positionId]
    );

    // Coerce numerics
    const row = result.rows[0];
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && v !== "" && !isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v)) {
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }

    return NextResponse.json(out);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Close position error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
