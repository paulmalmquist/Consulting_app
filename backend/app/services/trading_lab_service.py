"""Trading Lab Service — CRUD operations for all trading lab entities.

Covers signals, hypotheses, positions, watchlist, research notes,
daily briefs, and performance snapshots.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor


# ── Signals ──────────────────────────────────────────────────────────────────


def create_signal(tenant_id: UUID, data: dict[str, Any]) -> dict:
    signal_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_signals (
                signal_id, tenant_id, theme_id, name, description,
                category, direction, strength, source, asset_class,
                tickers, evidence, decay_rate, expires_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            RETURNING *
            """,
            (
                signal_id, str(tenant_id), data["theme_id"], data["name"],
                data["description"], data["category"], data["direction"],
                data.get("strength", 50), data["source"], data["asset_class"],
                json.dumps(data.get("tickers", [])),
                json.dumps(data.get("evidence", {})),
                data.get("decay_rate", 0),
                data.get("expires_at"),
            ),
        )
        return cur.fetchone()


def update_signal(tenant_id: UUID, signal_id: UUID, data: dict[str, Any]) -> dict:
    sets, vals = _build_update(data, [
        "name", "description", "category", "direction", "strength",
        "status", "decay_rate", "expires_at",
    ])
    if "evidence" in data:
        sets.append("evidence = %s")
        vals.append(json.dumps(data["evidence"]))
    if not sets:
        return get_signal(tenant_id, signal_id)
    sets.append("updated_at = now()")
    vals.extend([str(tenant_id), str(signal_id)])
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE trading_signals SET {', '.join(sets)} "
            f"WHERE tenant_id = %s AND signal_id = %s RETURNING *",
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Signal {signal_id} not found")
        return row


def get_signal(tenant_id: UUID, signal_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_signals WHERE tenant_id = %s AND signal_id = %s",
            (str(tenant_id), str(signal_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Signal {signal_id} not found")
        return row


def list_signals(
    tenant_id: UUID,
    status: str | None = None,
    category: str | None = None,
    direction: str | None = None,
    min_strength: int | None = None,
) -> list[dict]:
    sql = "SELECT * FROM trading_signals WHERE tenant_id = %s"
    params: list[Any] = [str(tenant_id)]
    if status:
        sql += " AND status = %s"
        params.append(status)
    if category:
        sql += " AND category = %s"
        params.append(category)
    if direction:
        sql += " AND direction = %s"
        params.append(direction)
    if min_strength is not None:
        sql += " AND strength >= %s"
        params.append(min_strength)
    sql += " ORDER BY strength DESC"
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ── Hypotheses ───────────────────────────────────────────────────────────────


def create_hypothesis(tenant_id: UUID, data: dict[str, Any]) -> dict:
    hypothesis_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_hypotheses (
                hypothesis_id, tenant_id, thesis, rationale,
                expected_outcome, timeframe, confidence,
                proves_right, proves_wrong, invalidation_level, tags
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            )
            RETURNING *
            """,
            (
                hypothesis_id, str(tenant_id), data["thesis"], data["rationale"],
                data["expected_outcome"], data["timeframe"],
                data.get("confidence", 50),
                json.dumps(data.get("proves_right", [])),
                json.dumps(data.get("proves_wrong", [])),
                data.get("invalidation_level", 0),
                json.dumps(data.get("tags", [])),
            ),
        )
        return cur.fetchone()


def update_hypothesis(tenant_id: UUID, hypothesis_id: UUID, data: dict[str, Any]) -> dict:
    sets, vals = _build_update(data, [
        "thesis", "rationale", "expected_outcome", "timeframe",
        "confidence", "status", "outcome_notes", "outcome_score", "resolved_at",
    ])
    if "tags" in data:
        sets.append("tags = %s")
        vals.append(json.dumps(data["tags"]))
    if not sets:
        return get_hypothesis(tenant_id, hypothesis_id)
    sets.append("updated_at = now()")
    vals.extend([str(tenant_id), str(hypothesis_id)])
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE trading_hypotheses SET {', '.join(sets)} "
            f"WHERE tenant_id = %s AND hypothesis_id = %s RETURNING *",
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Hypothesis {hypothesis_id} not found")
        return row


def get_hypothesis(tenant_id: UUID, hypothesis_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_hypotheses WHERE tenant_id = %s AND hypothesis_id = %s",
            (str(tenant_id), str(hypothesis_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Hypothesis {hypothesis_id} not found")
        return row


def get_hypothesis_status(tenant_id: UUID, hypothesis_id: UUID) -> dict:
    h = get_hypothesis(tenant_id, hypothesis_id)
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM trading_positions "
            "WHERE tenant_id = %s AND hypothesis_id = %s AND status = 'open'",
            (str(tenant_id), str(hypothesis_id)),
        )
        open_count = cur.fetchone()["cnt"]
    return {
        "hypothesis_id": str(hypothesis_id),
        "thesis": h["thesis"],
        "status": h["status"],
        "confidence": h["confidence"],
        "outcome_score": h.get("outcome_score"),
        "open_positions": open_count,
    }


# ── Positions ────────────────────────────────────────────────────────────────


def create_position(tenant_id: UUID, data: dict[str, Any]) -> dict:
    position_id = str(uuid4())
    entry_at = data.get("entry_at") or datetime.now(timezone.utc).isoformat()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_positions (
                position_id, tenant_id, hypothesis_id, ticker, asset_name,
                asset_class, direction, entry_price, size, notional,
                stop_loss, take_profit, notes, entry_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            RETURNING *
            """,
            (
                position_id, str(tenant_id), data["hypothesis_id"],
                data["ticker"], data["asset_name"], data["asset_class"],
                data["direction"], data["entry_price"], data["size"],
                data["notional"], data.get("stop_loss"), data.get("take_profit"),
                data.get("notes"), entry_at,
            ),
        )
        return cur.fetchone()


def update_position(tenant_id: UUID, position_id: UUID, data: dict[str, Any]) -> dict:
    sets, vals = _build_update(data, [
        "current_price", "stop_loss", "take_profit", "notes", "status",
    ])
    if not sets:
        return _get_position(tenant_id, position_id)
    sets.append("updated_at = now()")
    # Auto-compute unrealized PnL if current_price is updated
    if "current_price" in data:
        sets.append(
            "unrealized_pnl = CASE WHEN direction = 'long' "
            "THEN (%s - entry_price) * size "
            "ELSE (entry_price - %s) * size END"
        )
        vals.extend([data["current_price"], data["current_price"]])
        sets.append(
            "return_pct = CASE WHEN notional > 0 THEN "
            "(CASE WHEN direction = 'long' THEN (%s - entry_price) * size "
            "ELSE (entry_price - %s) * size END) / notional * 100 ELSE 0 END"
        )
        vals.extend([data["current_price"], data["current_price"]])
    vals.extend([str(tenant_id), str(position_id)])
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE trading_positions SET {', '.join(sets)} "
            f"WHERE tenant_id = %s AND position_id = %s RETURNING *",
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Position {position_id} not found")
        return row


def close_position(
    tenant_id: UUID,
    position_id: UUID,
    exit_price: float,
    exit_at: str | None = None,
) -> dict:
    pos = _get_position(tenant_id, position_id)
    if pos["status"] != "open":
        raise ValueError(f"Position {position_id} is already {pos['status']}")

    direction_mult = 1.0 if pos["direction"] == "long" else -1.0
    realized_pnl = (exit_price - float(pos["entry_price"])) * float(pos["size"]) * direction_mult
    notional = float(pos["notional"]) if pos["notional"] else 1.0
    return_pct = (realized_pnl / notional) * 100 if notional else 0.0
    exit_ts = exit_at or datetime.now(timezone.utc).isoformat()

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE trading_positions SET
                exit_price = %s, realized_pnl = %s, return_pct = %s,
                unrealized_pnl = 0, status = 'closed', exit_at = %s,
                current_price = %s, updated_at = now()
            WHERE tenant_id = %s AND position_id = %s
            RETURNING *
            """,
            (exit_price, realized_pnl, return_pct, exit_ts, exit_price,
             str(tenant_id), str(position_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Position {position_id} not found")
        return row


def list_open_positions(tenant_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_positions WHERE tenant_id = %s AND status = 'open' "
            "ORDER BY entry_at DESC",
            (str(tenant_id),),
        )
        return cur.fetchall()


def update_position_price(tenant_id: UUID, position_id: UUID, current_price: float) -> dict:
    return update_position(tenant_id, position_id, {"current_price": current_price})


def _get_position(tenant_id: UUID, position_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_positions WHERE tenant_id = %s AND position_id = %s",
            (str(tenant_id), str(position_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Position {position_id} not found")
        return row


# ── Watchlist ────────────────────────────────────────────────────────────────


def create_watchlist_item(tenant_id: UUID, data: dict[str, Any]) -> dict:
    watchlist_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_watchlist (
                watchlist_id, tenant_id, ticker, asset_name,
                asset_class, notes, alert_above, alert_below
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                watchlist_id, str(tenant_id), data["ticker"], data["asset_name"],
                data["asset_class"], data.get("notes"),
                data.get("alert_above"), data.get("alert_below"),
            ),
        )
        return cur.fetchone()


def update_watchlist_item(tenant_id: UUID, watchlist_id: UUID, data: dict[str, Any]) -> dict:
    sets, vals = _build_update(data, [
        "asset_name", "asset_class", "current_price", "price_change_1d",
        "price_change_1w", "notes", "alert_above", "alert_below", "is_active",
    ])
    if not sets:
        return _get_watchlist_item(tenant_id, watchlist_id)
    vals.extend([str(tenant_id), str(watchlist_id)])
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE trading_watchlist SET {', '.join(sets)} "
            f"WHERE tenant_id = %s AND watchlist_id = %s RETURNING *",
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Watchlist item {watchlist_id} not found")
        return row


def get_watchlist_alerts(tenant_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM trading_watchlist
            WHERE tenant_id = %s AND is_active = true
              AND (
                (alert_above IS NOT NULL AND current_price IS NOT NULL AND current_price >= alert_above)
                OR (alert_below IS NOT NULL AND current_price IS NOT NULL AND current_price <= alert_below)
              )
            ORDER BY ticker
            """,
            (str(tenant_id),),
        )
        return cur.fetchall()


def _get_watchlist_item(tenant_id: UUID, watchlist_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_watchlist WHERE tenant_id = %s AND watchlist_id = %s",
            (str(tenant_id), str(watchlist_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Watchlist item {watchlist_id} not found")
        return row


# ── Research Notes ───────────────────────────────────────────────────────────


def create_research_note(tenant_id: UUID, data: dict[str, Any]) -> dict:
    note_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_research_notes (
                note_id, tenant_id, title, content, note_type,
                signal_id, hypothesis_id, position_id, theme_id,
                ticker, tags
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                note_id, str(tenant_id), data["title"], data["content"],
                data["note_type"], data.get("signal_id"), data.get("hypothesis_id"),
                data.get("position_id"), data.get("theme_id"),
                data.get("ticker"), json.dumps(data.get("tags", [])),
            ),
        )
        return cur.fetchone()


def update_research_note(tenant_id: UUID, note_id: UUID, data: dict[str, Any]) -> dict:
    sets, vals = _build_update(data, ["title", "content", "note_type"])
    if "tags" in data:
        sets.append("tags = %s")
        vals.append(json.dumps(data["tags"]))
    if not sets:
        return _get_research_note(tenant_id, note_id)
    sets.append("updated_at = now()")
    vals.extend([str(tenant_id), str(note_id)])
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE trading_research_notes SET {', '.join(sets)} "
            f"WHERE tenant_id = %s AND note_id = %s RETURNING *",
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Research note {note_id} not found")
        return row


def _get_research_note(tenant_id: UUID, note_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM trading_research_notes WHERE tenant_id = %s AND note_id = %s",
            (str(tenant_id), str(note_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Research note {note_id} not found")
        return row


# ── Daily Briefs ─────────────────────────────────────────────────────────────


def create_daily_brief(tenant_id: UUID, data: dict[str, Any]) -> dict:
    brief_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_daily_briefs (
                brief_id, tenant_id, brief_date, regime_label, regime_change,
                market_summary, key_moves, signals_fired, hypotheses_at_risk,
                position_pnl_summary, what_changed, top_risks, recommended_actions
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                brief_id, str(tenant_id), data["brief_date"],
                data["regime_label"], data["regime_change"],
                data["market_summary"],
                json.dumps(data.get("key_moves", [])),
                json.dumps(data.get("signals_fired", [])),
                json.dumps(data.get("hypotheses_at_risk", [])),
                json.dumps(data.get("position_pnl_summary", [])),
                data.get("what_changed", ""),
                json.dumps(data.get("top_risks", [])),
                json.dumps(data.get("recommended_actions", [])),
            ),
        )
        return cur.fetchone()


# ── Performance Snapshots ────────────────────────────────────────────────────


def create_performance_snapshot(tenant_id: UUID, data: dict[str, Any]) -> dict:
    perf_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO trading_performance_snapshots (
                perf_id, tenant_id, snapshot_date, total_pnl,
                unrealized_pnl, realized_pnl, open_positions, closed_positions,
                win_count, loss_count, win_rate, avg_win, avg_loss,
                best_trade_pnl, worst_trade_pnl, equity_value, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                perf_id, str(tenant_id), data["snapshot_date"],
                data["total_pnl"], data["unrealized_pnl"], data["realized_pnl"],
                data["open_positions"], data["closed_positions"],
                data["win_count"], data["loss_count"], data["win_rate"],
                data["avg_win"], data["avg_loss"],
                data["best_trade_pnl"], data["worst_trade_pnl"],
                data["equity_value"], json.dumps(data.get("metadata", {})),
            ),
        )
        return cur.fetchone()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _build_update(
    data: dict[str, Any],
    allowed_keys: list[str],
) -> tuple[list[str], list[Any]]:
    sets: list[str] = []
    vals: list[Any] = []
    for key in allowed_keys:
        if key in data:
            sets.append(f"{key} = %s")
            vals.append(data[key])
    return sets, vals
