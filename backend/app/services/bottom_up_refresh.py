"""Materialization layer for the bottom-up CF engine.

Writes / rereads `re_asset_cf_series_mat`. The rule from the plan is:
materialized rows are rebuilt only on source change, not on read. Readers hit
the materialized table and compare `source_hash` to current sources to decide
staleness. If stale beyond a hard TTL, the reader returns null IRR rather than
a cached number it can't trust.

This layer intentionally stays thin: it doesn't own a queue. Source-change
triggers (DB triggers or application-level hooks) should call
`refresh_asset_cf_series_materialized` synchronously or enqueue it. The
function is idempotent — running it twice with the same sources is a no-op
beyond updating `computed_at`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.bottom_up_cashflow import (
    CFPoint,
    IrrResult,
    build_asset_cf_series,
    compute_asset_irr,
    source_hash_for_asset,
)

# Staleness thresholds. Working-quarter rows may be a bit stale (refresh is
# async); released/locked rows must never be stale. Beyond the hard TTL we
# null out the IRR rather than serve a stale number.
STALENESS_WARN_SECONDS_DEFAULT = 15 * 60  # 15 minutes
STALENESS_HARD_TTL_SECONDS_DEFAULT = 24 * 60 * 60  # 24 hours


@dataclass
class MaterializedSeries:
    asset_id: UUID
    as_of_quarter: str
    points: list[CFPoint]
    source_hash: str
    computed_at: datetime
    is_stale: bool
    staleness_seconds: int
    exceeded_hard_ttl: bool


def _load_asset_env(cur, asset_id: UUID) -> dict | None:
    cur.execute(
        """
        SELECT f.business_id,
               COALESCE(
                 (SELECT env_id
                    FROM re_authoritative_asset_state_qtr
                   WHERE asset_id = %s
                   ORDER BY created_at DESC
                   LIMIT 1),
                 'default'
               ) AS env_id
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE a.asset_id = %s
        """,
        [str(asset_id), str(asset_id)],
    )
    return cur.fetchone()


def refresh_asset_cf_series_materialized(
    asset_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
    force: bool = False,
) -> MaterializedSeries:
    """Rebuild re_asset_cf_series_mat for (asset_id, as_of_quarter).

    Idempotent: if source_hash already matches, the row is not rewritten
    (unless force=True). Returns the freshly-written (or already-fresh) series.
    """
    new_hash = source_hash_for_asset(asset_id, as_of_quarter)

    with get_cursor() as cur:
        env_row = _load_asset_env(cur, asset_id)
        if not env_row:
            raise ValueError(f"asset {asset_id} not found")
        env_id = env_row["env_id"]
        business_id = env_row["business_id"]

        if not force:
            cur.execute(
                """
                SELECT source_hash, computed_at
                FROM re_asset_cf_series_mat
                WHERE asset_id = %s
                  AND as_of_quarter = %s
                ORDER BY computed_at DESC
                LIMIT 1
                """,
                [str(asset_id), as_of_quarter],
            )
            row = cur.fetchone()
            if row and row["source_hash"] == new_hash:
                # Already fresh — just return what's there.
                return _read_materialized(
                    cur, asset_id=asset_id, as_of_quarter=as_of_quarter,
                    current_hash=new_hash,
                )

    # Recompute: build the series, then write.
    points = build_asset_cf_series(
        asset_id, as_of_quarter, env_default_cap_rate=env_default_cap_rate
    )

    with get_cursor() as cur:
        cur.execute(
            """
            DELETE FROM re_asset_cf_series_mat
            WHERE asset_id = %s AND as_of_quarter = %s
            """,
            [str(asset_id), as_of_quarter],
        )
        now = datetime.now(timezone.utc)
        for p in points:
            cur.execute(
                """
                INSERT INTO re_asset_cf_series_mat (
                  asset_id, quarter, env_id, business_id, as_of_quarter,
                  quarter_end_date, cash_flow_base, component_breakdown,
                  has_actual, has_projection, has_exit, has_terminal_value,
                  warnings, source_hash, computed_at
                ) VALUES (
                  %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                  %s, %s, %s, %s, %s::jsonb, %s, %s
                )
                """,
                [
                    str(asset_id), p.quarter, env_id, str(business_id),
                    as_of_quarter, p.quarter_end_date, p.amount,
                    json.dumps(p.component_breakdown, default=_json_default),
                    p.has_actual, p.has_projection, p.has_exit,
                    p.has_terminal_value,
                    json.dumps(p.warnings), new_hash, now,
                ],
            )

        return _read_materialized(
            cur, asset_id=asset_id, as_of_quarter=as_of_quarter,
            current_hash=new_hash,
        )


def _json_default(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    raise TypeError(f"unserializable: {type(v)}")


def get_materialized_series(
    asset_id: UUID,
    as_of_quarter: str,
    *,
    warn_threshold_seconds: int = STALENESS_WARN_SECONDS_DEFAULT,
    hard_ttl_seconds: int = STALENESS_HARD_TTL_SECONDS_DEFAULT,
) -> MaterializedSeries | None:
    """Read the materialized series and annotate staleness.

    Does NOT recompute inline. Returns None if no materialized rows exist
    (caller can decide whether to refresh first or return a null-reason).
    """
    current_hash = source_hash_for_asset(asset_id, as_of_quarter)
    with get_cursor() as cur:
        result = _read_materialized(
            cur,
            asset_id=asset_id,
            as_of_quarter=as_of_quarter,
            current_hash=current_hash,
            warn_threshold_seconds=warn_threshold_seconds,
            hard_ttl_seconds=hard_ttl_seconds,
        )
    if result and not result.points:
        # Row metadata exists but empty series — treat as no cache.
        return None
    return result


def _read_materialized(
    cur,
    *,
    asset_id: UUID,
    as_of_quarter: str,
    current_hash: str,
    warn_threshold_seconds: int = STALENESS_WARN_SECONDS_DEFAULT,
    hard_ttl_seconds: int = STALENESS_HARD_TTL_SECONDS_DEFAULT,
) -> MaterializedSeries | None:
    cur.execute(
        """
        SELECT quarter, quarter_end_date, cash_flow_base, component_breakdown,
               has_actual, has_projection, has_exit, has_terminal_value,
               warnings, source_hash, computed_at
        FROM re_asset_cf_series_mat
        WHERE asset_id = %s
          AND as_of_quarter = %s
        ORDER BY quarter_end_date
        """,
        [str(asset_id), as_of_quarter],
    )
    rows = cur.fetchall()
    if not rows:
        return None

    mat_hash = rows[0]["source_hash"]
    mat_computed_at = rows[0]["computed_at"]
    if mat_computed_at.tzinfo is None:
        mat_computed_at = mat_computed_at.replace(tzinfo=timezone.utc)

    staleness_seconds = int(
        (datetime.now(timezone.utc) - mat_computed_at).total_seconds()
    )
    is_stale = (
        mat_hash != current_hash
        or staleness_seconds > warn_threshold_seconds
    )
    exceeded_hard_ttl = staleness_seconds > hard_ttl_seconds or (
        mat_hash != current_hash and staleness_seconds > hard_ttl_seconds
    )

    points: list[CFPoint] = []
    for r in rows:
        comp = r["component_breakdown"]
        if isinstance(comp, str):
            comp = json.loads(comp)
        warnings = r.get("warnings") or []
        if isinstance(warnings, str):
            warnings = json.loads(warnings)
        points.append(
            CFPoint(
                quarter=r["quarter"],
                quarter_end_date=r["quarter_end_date"],
                amount=Decimal(str(r["cash_flow_base"])),
                component_breakdown=comp or {},
                has_actual=bool(r["has_actual"]),
                has_projection=bool(r["has_projection"]),
                has_exit=bool(r["has_exit"]),
                has_terminal_value=bool(r["has_terminal_value"]),
                warnings=list(warnings),
            )
        )

    return MaterializedSeries(
        asset_id=asset_id,
        as_of_quarter=as_of_quarter,
        points=points,
        source_hash=mat_hash,
        computed_at=mat_computed_at,
        is_stale=is_stale,
        staleness_seconds=staleness_seconds,
        exceeded_hard_ttl=exceeded_hard_ttl,
    )


def get_asset_cashflow_response(
    asset_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
    refresh_if_missing: bool = True,
    warn_threshold_seconds: int = STALENESS_WARN_SECONDS_DEFAULT,
    hard_ttl_seconds: int = STALENESS_HARD_TTL_SECONDS_DEFAULT,
) -> dict[str, Any]:
    """End-to-end read path for the asset cash flow route.

    Returns a dict with keys: series, irr, null_reason, warnings, terminal_value,
    is_stale, staleness_seconds, source_hash, computed_at, as_of_quarter.
    """
    mat = get_materialized_series(
        asset_id, as_of_quarter,
        warn_threshold_seconds=warn_threshold_seconds,
        hard_ttl_seconds=hard_ttl_seconds,
    )

    if mat is None and refresh_if_missing:
        mat = refresh_asset_cf_series_materialized(
            asset_id, as_of_quarter,
            env_default_cap_rate=env_default_cap_rate,
        )

    if mat is None:
        return {
            "asset_id": str(asset_id),
            "as_of_quarter": as_of_quarter,
            "series": [],
            "irr": None,
            "null_reason": "missing_acquisition",
            "warnings": [],
            "terminal_value": None,
            "is_stale": False,
            "staleness_seconds": 0,
            "source_hash": None,
            "computed_at": None,
        }

    if mat.exceeded_hard_ttl:
        return _payload(
            mat,
            irr=IrrResult(
                value=None, null_reason="stale_cache_exceeded_ttl",
                cashflow_count=len(mat.points),
                has_exit=any(p.has_exit for p in mat.points),
                has_terminal_value=any(p.has_terminal_value for p in mat.points),
            ),
        )

    irr = compute_asset_irr(asset_id, as_of_quarter, series=mat.points)
    return _payload(mat, irr=irr)


def _payload(mat: MaterializedSeries, *, irr: IrrResult) -> dict[str, Any]:
    tv_entry = None
    for p in mat.points:
        tv = p.component_breakdown.get("terminal_value")
        if tv and isinstance(tv, dict):
            tv_entry = {**tv, "quarter": p.quarter}
            break

    return {
        "asset_id": str(mat.asset_id),
        "as_of_quarter": mat.as_of_quarter,
        "series": [
            {
                "quarter": p.quarter,
                "quarter_end_date": p.quarter_end_date.isoformat(),
                "amount": float(p.amount),
                "component_breakdown": p.component_breakdown,
                "has_actual": p.has_actual,
                "has_projection": p.has_projection,
                "has_exit": p.has_exit,
                "has_terminal_value": p.has_terminal_value,
                "warnings": p.warnings,
            }
            for p in mat.points
        ],
        "irr": float(irr.value) if irr.value is not None else None,
        "null_reason": irr.null_reason,
        "cashflow_count": irr.cashflow_count,
        "has_exit": irr.has_exit,
        "has_terminal_value": irr.has_terminal_value,
        "warnings": irr.warnings,
        "terminal_value": tv_entry,
        "is_stale": mat.is_stale,
        "staleness_seconds": mat.staleness_seconds,
        "source_hash": mat.source_hash,
        "computed_at": mat.computed_at.isoformat(),
    }
