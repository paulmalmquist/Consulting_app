"""Bottom-up REPE cash flow engine.

IRR is a derived output of property-level quarterly cash flows aggregated through
ownership % to investment and fund. This module owns the asset-level layer:
series construction, terminal-value resolution, and XIRR computation. Investment
and fund aggregation are in the same module (roll-up helpers below).

Date convention: every CF is dated at its quarter-end
    YYYY-03-31 / -06-30 / -09-30 / -12-31
Mid-quarter acquisitions / exits are bucketed to that quarter's end. This is
sufficient precision for quarterly XIRR; intra-quarter timing is intentionally
out of scope for v1.

Sign convention: acquisitions, capex, and debt principal outflows are negative;
NOI, exit proceeds, and terminal value are positive. Debt service interest is
subtracted inside the NOI-to-CF bridge.

IRR kind: asset-level gross IRR rolled to investment and fund. NOT investor-level
net IRR. Keys written to canonical_metrics are suffixed `_bottom_up` to stay
distinct from the legacy top-down fields and from future investor-level metrics.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.finance.irr_engine import xirr

# Cap-rate bounds for NOI/cap terminal-value fallback. Outside this range we
# refuse to produce a terminal value — one bad seed otherwise explodes IRR.
MIN_EXIT_CAP_RATE = Decimal("0.03")
MAX_EXIT_CAP_RATE = Decimal("0.15")

# If terminal value represents more than this fraction of total positive CF,
# the row is flagged (warning, not null). Surfaces a caution badge in the UI.
TERMINAL_DOMINANCE_THRESHOLD = Decimal("0.80")

NullReason = str


@dataclass
class CFPoint:
    quarter: str
    quarter_end_date: date
    amount: Decimal
    component_breakdown: dict[str, Any] = field(default_factory=dict)
    has_actual: bool = False
    has_projection: bool = False
    has_exit: bool = False
    has_terminal_value: bool = False
    warnings: list[str] = field(default_factory=list)


@dataclass
class IrrResult:
    value: Decimal | None
    null_reason: NullReason | None
    cashflow_count: int
    has_exit: bool
    has_terminal_value: bool
    warnings: list[str] = field(default_factory=list)


def quarter_end_date(quarter: str) -> date:
    """Convert 'YYYY-QN' -> quarter-end date. Our canonical CF dating."""
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def date_to_quarter(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _q_to_tuple(q: str) -> tuple[int, int]:
    return (int(q[:4]), int(q[-1]))


def _quarter_le(a: str, b: str) -> bool:
    return _q_to_tuple(a) <= _q_to_tuple(b)


def _next_quarter(q: str) -> str:
    y, qn = _q_to_tuple(q)
    qn += 1
    if qn > 4:
        qn = 1
        y += 1
    return f"{y}-Q{qn}"


def _quarters_between(start: str, end: str) -> list[str]:
    (ys, qs), (ye, qe) = _q_to_tuple(start), _q_to_tuple(end)
    out: list[str] = []
    y, q = ys, qs
    while (y, q) <= (ye, qe):
        out.append(f"{y}-Q{q}")
        q += 1
        if q > 4:
            q = 1
            y += 1
    return out


def _hash_sources(*parts: Any) -> str:
    h = hashlib.sha256()
    h.update(json.dumps(parts, sort_keys=True, default=str).encode())
    return h.hexdigest()


def _to_decimal(v: Any) -> Decimal:
    if v is None:
        return Decimal(0)
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


# ---------------------------------------------------------------------------
# Asset-level CF series construction
# ---------------------------------------------------------------------------


def _load_asset_context(cur, asset_id: UUID) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT a.asset_id,
               a.deal_id,
               a.name,
               a.acquisition_date,
               a.cost_basis,
               d.fund_id
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        WHERE a.asset_id = %s
        """,
        [str(asset_id)],
    )
    return cur.fetchone()


def _load_operating_quarters(cur, asset_id: UUID, as_of_quarter: str) -> list[dict]:
    cur.execute(
        """
        SELECT quarter,
               revenue,
               other_income,
               opex,
               capex,
               debt_service,
               cash_balance
        FROM re_asset_operating_qtr
        WHERE asset_id = %s
          AND quarter <= %s
        ORDER BY quarter
        """,
        [str(asset_id), as_of_quarter],
    )
    return cur.fetchall()


def _load_projection_quarters(
    cur, asset_id: UUID, after_quarter: str
) -> list[dict]:
    cur.execute(
        """
        SELECT quarter,
               revenue,
               opex,
               capex,
               debt_service_interest,
               debt_service_principal,
               source
        FROM re_asset_cf_projection
        WHERE asset_id = %s
          AND quarter > %s
        ORDER BY quarter, source
        """,
        [str(asset_id), after_quarter],
    )
    # Prefer one row per quarter; preference order: realized > underwriting > model_run > manual
    preferred: dict[str, dict] = {}
    rank = {"underwriting": 0, "model_run": 1, "manual": 2}
    for row in cur.fetchall():
        q = row["quarter"]
        if q not in preferred or rank.get(row["source"], 99) < rank.get(
            preferred[q]["source"], 99
        ):
            preferred[q] = row
    return [preferred[q] for q in sorted(preferred)]


def _load_latest_exit_event(cur, asset_id: UUID) -> dict | None:
    cur.execute(
        """
        SELECT status,
               exit_quarter,
               exit_date,
               gross_sale_price,
               selling_costs,
               debt_payoff,
               net_proceeds,
               projected_cap_rate,
               revision_at
        FROM re_asset_exit_event
        WHERE asset_id = %s
        ORDER BY revision_at DESC
        LIMIT 1
        """,
        [str(asset_id)],
    )
    return cur.fetchone()


def _load_nav_for_terminal(
    cur, asset_id: UUID, as_of_quarter: str
) -> tuple[Decimal | None, str | None]:
    """Terminal-value NAV resolution: authoritative -> quarter_state -> None."""
    cur.execute(
        """
        SELECT canonical_metrics
        FROM re_authoritative_asset_state_qtr
        WHERE asset_id = %s
          AND quarter = %s
          AND promotion_state = 'released'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        [str(asset_id), as_of_quarter],
    )
    row = cur.fetchone()
    if row:
        cm = row["canonical_metrics"] or {}
        nav = cm.get("nav") if isinstance(cm, dict) else None
        if nav is not None:
            return (_to_decimal(nav), "authoritative_nav")

    cur.execute(
        """
        SELECT nav, asset_value
        FROM re_asset_quarter_state
        WHERE asset_id = %s
          AND quarter = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        [str(asset_id), as_of_quarter],
    )
    row = cur.fetchone()
    if row:
        nav = row.get("nav") if isinstance(row, dict) else None
        if nav is None:
            nav = row.get("asset_value") if isinstance(row, dict) else None
        if nav is not None:
            return (_to_decimal(nav), "quarter_state_nav")

    return (None, None)


def _last_ttm_noi(operating_rows: list[dict]) -> Decimal | None:
    """Sum of most recent 4 quarters of (revenue + other_income - opex)."""
    if not operating_rows:
        return None
    trail = operating_rows[-4:]
    total = Decimal(0)
    any_nonzero = False
    for r in trail:
        rev = _to_decimal(r.get("revenue"))
        oth = _to_decimal(r.get("other_income"))
        opx = _to_decimal(r.get("opex"))
        total += rev + oth - opx
        if rev or oth or opx:
            any_nonzero = True
    return total if any_nonzero else None


def _resolve_terminal_value(
    *,
    cur,
    asset_id: UUID,
    as_of_quarter: str,
    operating_rows: list[dict],
    exit_event: dict | None,
    env_default_cap_rate: Decimal | None = None,
) -> dict[str, Any]:
    """Return {amount, source, cap_rate?, invalid_cap_rate?} or {amount: None, reason}."""
    # Priority 1: authoritative NAV.
    nav, src = _load_nav_for_terminal(cur, asset_id, as_of_quarter)
    if nav is not None and nav > 0:
        return {"amount": nav, "source": src}

    # Priority 3: NOI / cap-rate fallback.
    ttm_noi = _last_ttm_noi(operating_rows)
    if ttm_noi is None or ttm_noi <= 0:
        return {"amount": None, "reason": "no_inflow"}

    cap_rate: Decimal | None = None
    if exit_event and exit_event.get("projected_cap_rate") is not None:
        cap_rate = _to_decimal(exit_event["projected_cap_rate"])
    elif env_default_cap_rate is not None:
        cap_rate = env_default_cap_rate

    if cap_rate is None:
        return {"amount": None, "reason": "no_inflow"}

    if cap_rate < MIN_EXIT_CAP_RATE or cap_rate > MAX_EXIT_CAP_RATE:
        return {
            "amount": None,
            "reason": "invalid_cap_rate",
            "cap_rate": float(cap_rate),
        }

    return {
        "amount": ttm_noi / cap_rate,
        "source": "noi_cap_rate",
        "cap_rate": float(cap_rate),
    }


def build_asset_cf_series(
    asset_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
) -> list[CFPoint]:
    """Assemble the quarterly CF series for one asset up to as_of_quarter.

    Composition:
      - Acquisition: (-cost_basis) at the quarter-end of acquisition_date.
      - Per-quarter operating CF: (revenue + other_income - opex - capex - debt_service)
        for every quarter with a re_asset_operating_qtr row <= as_of_quarter.
      - Per-quarter projected CF after last-closed quarter: same formula from
        re_asset_cf_projection up through (and including) exit_quarter.
      - Exit event: net_proceeds at exit_quarter (added to that quarter's CF).
      - Terminal value (pre-exit only): synthetic positive at as_of_quarter-end
        following NAV priority order (authoritative -> quarter_state -> NOI/cap).
    """
    with get_cursor() as cur:
        ctx = _load_asset_context(cur, asset_id)
        if not ctx:
            return []

        operating = _load_operating_quarters(cur, asset_id, as_of_quarter)
        exit_event = _load_latest_exit_event(cur, asset_id)

        # Determine the forecast horizon:
        #   - realized exit with exit_quarter <= as_of_quarter: no forecast needed,
        #     exit CF is booked directly.
        #   - projected/underwritten exit past as_of_quarter: include exit CF only
        #     if projections bridge last_closed_quarter to exit_quarter. Otherwise
        #     treat as "planned exit, not yet modeled"; fall through to terminal
        #     value at as_of_quarter using the exit event's projected_cap_rate.
        last_closed_quarter = operating[-1]["quarter"] if operating else None
        forecast_end_quarter: str | None = None
        if exit_event and exit_event.get("exit_quarter"):
            eq = exit_event["exit_quarter"]
            if _quarter_le(eq, last_closed_quarter or "0000-Q0"):
                # Exit already in actuals window — book it directly.
                pass
            else:
                forecast_end_quarter = eq

        projection_rows: list[dict] = []
        if forecast_end_quarter:
            start_after = last_closed_quarter or "0000-Q0"
            all_proj = _load_projection_quarters(cur, asset_id, start_after)
            projection_rows = [
                p for p in all_proj
                if _quarter_le(p["quarter"], forecast_end_quarter)
            ]
            # If projections don't bridge cleanly to exit_quarter, abandon the
            # exit-CF path and let terminal-value logic take over. Bridge means:
            # a projection row exists for every quarter between start_after+1
            # and exit_quarter inclusive.
            needed = _quarters_between(
                _next_quarter(start_after) if last_closed_quarter else start_after,
                forecast_end_quarter,
            )
            have = {p["quarter"] for p in projection_rows}
            if not set(needed).issubset(have):
                forecast_end_quarter = None
                projection_rows = []

    points_by_q: dict[str, CFPoint] = {}

    # 1. Acquisition.
    if ctx.get("acquisition_date") and ctx.get("cost_basis") is not None:
        acq_date: date = ctx["acquisition_date"]
        acq_q = date_to_quarter(acq_date)
        amt = -_to_decimal(ctx["cost_basis"])
        p = CFPoint(
            quarter=acq_q,
            quarter_end_date=quarter_end_date(acq_q),
            amount=amt,
            component_breakdown={"acquisition": float(amt)},
        )
        points_by_q[acq_q] = p

    # 2. Operating actuals.
    for row in operating:
        q = row["quarter"]
        noi = (
            _to_decimal(row.get("revenue"))
            + _to_decimal(row.get("other_income"))
            - _to_decimal(row.get("opex"))
        )
        capex = _to_decimal(row.get("capex"))
        dbt = _to_decimal(row.get("debt_service"))
        net_cf = noi - capex - dbt
        p = points_by_q.setdefault(
            q,
            CFPoint(
                quarter=q,
                quarter_end_date=quarter_end_date(q),
                amount=Decimal(0),
                component_breakdown={},
            ),
        )
        p.amount += net_cf
        p.has_actual = True
        p.component_breakdown.setdefault("operating_actual", []).append(
            {"noi": float(noi), "capex": float(capex), "debt_service": float(dbt)}
        )

    # 3. Projections through forecast_end_quarter.
    for row in projection_rows:
        q = row["quarter"]
        noi = _to_decimal(row.get("revenue")) - _to_decimal(row.get("opex"))
        capex = _to_decimal(row.get("capex"))
        dbt = _to_decimal(row.get("debt_service_interest")) + _to_decimal(
            row.get("debt_service_principal")
        )
        net_cf = noi - capex - dbt
        p = points_by_q.setdefault(
            q,
            CFPoint(
                quarter=q,
                quarter_end_date=quarter_end_date(q),
                amount=Decimal(0),
                component_breakdown={},
            ),
        )
        p.amount += net_cf
        p.has_projection = True
        p.component_breakdown.setdefault(
            "projection",
            {
                "noi": float(noi),
                "capex": float(capex),
                "debt_service": float(dbt),
                "source": row.get("source"),
            },
        )

    # 4. Exit event — book when:
    #    (a) status = 'realized' (historical fact; book regardless of actuals), OR
    #    (b) projections bridge cleanly to exit_quarter (forecast_end_quarter set).
    if exit_event and exit_event.get("exit_quarter"):
        eq = exit_event["exit_quarter"]
        is_realized = exit_event.get("status") == "realized"
        within_horizon = is_realized or (
            forecast_end_quarter is not None and _quarter_le(eq, forecast_end_quarter)
        )
        if within_horizon:
            proceeds = exit_event.get("net_proceeds")
            if proceeds is None:
                gross = _to_decimal(exit_event.get("gross_sale_price"))
                sc = _to_decimal(exit_event.get("selling_costs"))
                dp = _to_decimal(exit_event.get("debt_payoff"))
                proceeds = gross - sc - dp
            amt = _to_decimal(proceeds)
            p = points_by_q.setdefault(
                eq,
                CFPoint(
                    quarter=eq,
                    quarter_end_date=quarter_end_date(eq),
                    amount=Decimal(0),
                    component_breakdown={},
                ),
            )
            p.amount += amt
            p.has_exit = True
            p.component_breakdown["exit"] = {
                "status": exit_event.get("status"),
                "amount": float(amt),
            }

    # 5. Terminal value if no realized/projected exit within horizon.
    has_any_exit = any(pt.has_exit for pt in points_by_q.values())
    if not has_any_exit:
        with get_cursor() as cur:
            tv = _resolve_terminal_value(
                cur=cur,
                asset_id=asset_id,
                as_of_quarter=as_of_quarter,
                operating_rows=operating,
                exit_event=exit_event,
                env_default_cap_rate=env_default_cap_rate,
            )
        if tv.get("amount") is not None:
            q = as_of_quarter
            p = points_by_q.setdefault(
                q,
                CFPoint(
                    quarter=q,
                    quarter_end_date=quarter_end_date(q),
                    amount=Decimal(0),
                    component_breakdown={},
                ),
            )
            p.amount += tv["amount"]
            p.has_terminal_value = True
            tv_entry = {
                "kind": "terminal_value",
                "source": tv["source"],
                "amount": float(tv["amount"]),
            }
            if "cap_rate" in tv:
                tv_entry["cap_rate"] = tv["cap_rate"]
            p.component_breakdown["terminal_value"] = tv_entry
        else:
            # No terminal value achievable — mark the as-of point so the IRR
            # step can emit the right null_reason.
            reason = tv.get("reason", "no_inflow")
            q = as_of_quarter
            p = points_by_q.setdefault(
                q,
                CFPoint(
                    quarter=q,
                    quarter_end_date=quarter_end_date(q),
                    amount=Decimal(0),
                    component_breakdown={},
                ),
            )
            p.component_breakdown["terminal_value_failure"] = {
                "reason": reason,
                "cap_rate": tv.get("cap_rate"),
            }
            p.warnings.append(reason)

    # Dominance flag: terminal_value_pct > 0.80.
    total_pos = sum((pt.amount for pt in points_by_q.values() if pt.amount > 0), Decimal(0))
    tv_amount = Decimal(0)
    for pt in points_by_q.values():
        tv_c = pt.component_breakdown.get("terminal_value")
        if tv_c and isinstance(tv_c, dict):
            tv_amount += _to_decimal(tv_c.get("amount"))
    if total_pos > 0 and tv_amount > 0:
        tv_pct = tv_amount / total_pos
        if tv_pct > TERMINAL_DOMINANCE_THRESHOLD:
            for pt in points_by_q.values():
                if "terminal_value" in pt.component_breakdown:
                    pt.warnings.append("terminal_value_dominant")
                    pt.component_breakdown["terminal_value"]["pct_of_inflows"] = float(
                        tv_pct
                    )

    return sorted(points_by_q.values(), key=lambda pt: pt.quarter_end_date)


# ---------------------------------------------------------------------------
# Asset-level IRR
# ---------------------------------------------------------------------------


def compute_asset_irr(
    asset_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
    series: list[CFPoint] | None = None,
) -> IrrResult:
    """Compute asset-level gross IRR from the bottom-up CF series.

    Null rules (first failing wins):
      1. missing_acquisition
      2. no_inflow
      3. invalid_cap_rate (only relevant when NOI/cap path produced the bad value)
      4. insufficient_sign_changes
      5. xirr_nonconvergence
    """
    if series is None:
        series = build_asset_cf_series(
            asset_id, as_of_quarter, env_default_cap_rate=env_default_cap_rate
        )

    if not series:
        return IrrResult(
            value=None,
            null_reason="missing_acquisition",
            cashflow_count=0,
            has_exit=False,
            has_terminal_value=False,
        )

    has_acquisition = any(
        "acquisition" in p.component_breakdown for p in series
    )
    if not has_acquisition:
        return IrrResult(
            value=None,
            null_reason="missing_acquisition",
            cashflow_count=len(series),
            has_exit=any(p.has_exit for p in series),
            has_terminal_value=any(p.has_terminal_value for p in series),
        )

    # Check for the NOI/cap-path invalid_cap_rate marker.
    for p in series:
        tvf = p.component_breakdown.get("terminal_value_failure")
        if tvf and tvf.get("reason") == "invalid_cap_rate":
            return IrrResult(
                value=None,
                null_reason="invalid_cap_rate",
                cashflow_count=len(series),
                has_exit=False,
                has_terminal_value=False,
                warnings=[f"cap_rate={tvf.get('cap_rate')}"],
            )

    has_positive = any(p.amount > 0 for p in series)
    has_negative = any(p.amount < 0 for p in series)

    if not has_positive:
        return IrrResult(
            value=None,
            null_reason="no_inflow",
            cashflow_count=len(series),
            has_exit=any(p.has_exit for p in series),
            has_terminal_value=any(p.has_terminal_value for p in series),
        )

    if not (has_positive and has_negative):
        return IrrResult(
            value=None,
            null_reason="insufficient_sign_changes",
            cashflow_count=len(series),
            has_exit=any(p.has_exit for p in series),
            has_terminal_value=any(p.has_terminal_value for p in series),
        )

    cashflows = [(p.quarter_end_date, p.amount) for p in series if p.amount != 0]
    result = xirr(cashflows)
    if result is None:
        return IrrResult(
            value=None,
            null_reason="xirr_nonconvergence",
            cashflow_count=len(cashflows),
            has_exit=any(p.has_exit for p in series),
            has_terminal_value=any(p.has_terminal_value for p in series),
        )

    warnings: list[str] = []
    for p in series:
        for w in p.warnings:
            if w not in warnings:
                warnings.append(w)

    return IrrResult(
        value=Decimal(str(result)).quantize(Decimal("0.000001")),
        null_reason=None,
        cashflow_count=len(cashflows),
        has_exit=any(p.has_exit for p in series),
        has_terminal_value=any(p.has_terminal_value for p in series),
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Ownership resolution (effective-dated)
# ---------------------------------------------------------------------------


def _resolve_effective_ownership_from_links(
    cur, asset_id: UUID, as_of: date
) -> Decimal | None:
    """Pick the `repe_asset_entity_link.percent` whose effective window covers
    `as_of`. Role preference: owner > collateral_owner > anything else. If no
    window matches, returns None so the caller can fall back to re_jv or 1.0.
    """
    cur.execute(
        """
        SELECT role, percent, effective_from, effective_to
        FROM repe_asset_entity_link
        WHERE asset_id = %s
          AND effective_from <= %s
          AND (effective_to IS NULL OR effective_to > %s)
        """,
        [str(asset_id), as_of, as_of],
    )
    rows = cur.fetchall() or []
    if not rows:
        return None
    role_priority = {"owner": 0, "collateral_owner": 1, "manager": 2, "borrower": 3}
    rows.sort(key=lambda r: role_priority.get(r.get("role"), 99))
    for r in rows:
        pct = r.get("percent")
        if pct is not None:
            return _to_decimal(pct)
    return None


def _jv_ownership_percent(cur, asset_id: UUID) -> Decimal | None:
    cur.execute(
        """
        SELECT j.ownership_percent
        FROM repe_asset a
        LEFT JOIN re_jv j ON j.jv_id = a.jv_id
        WHERE a.asset_id = %s
        """,
        [str(asset_id)],
    )
    row = cur.fetchone()
    if not row:
        return None
    pct = row.get("ownership_percent") if isinstance(row, dict) else None
    return _to_decimal(pct) if pct is not None else None


def resolve_ownership_pct(asset_id: UUID, as_of: date) -> Decimal:
    """Resolve the effective ownership % of `asset_id` at `as_of`.

    Priority:
      1. `repe_asset_entity_link.percent` — effective-dated, handles mid-hold
         JV changes.
      2. `re_jv.ownership_percent` — static per investment.
      3. 1.0 (single-owner fallback).
    """
    with get_cursor() as cur:
        pct = _resolve_effective_ownership_from_links(cur, asset_id, as_of)
        if pct is not None:
            return pct
        pct = _jv_ownership_percent(cur, asset_id)
        if pct is not None:
            return pct
    return Decimal("1")


def ownership_schedule(asset_id: UUID) -> list[dict[str, Any]]:
    """Return the effective-dated ownership schedule for an asset as a list of
    {role, percent, effective_from, effective_to}. Used by provenance / audit."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT role, percent, effective_from, effective_to
            FROM repe_asset_entity_link
            WHERE asset_id = %s
            ORDER BY effective_from
            """,
            [str(asset_id)],
        )
        rows = cur.fetchall() or []
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "role": r.get("role"),
                "percent": float(r.get("percent")) if r.get("percent") is not None else None,
                "effective_from": r.get("effective_from").isoformat()
                if r.get("effective_from")
                else None,
                "effective_to": r.get("effective_to").isoformat()
                if r.get("effective_to")
                else None,
            }
        )
    return out


def source_hash_for_asset(asset_id: UUID, as_of_quarter: str) -> str:
    """Fingerprint the inputs that feed build_asset_cf_series. Used by the
    materialization layer to detect stale caches."""
    with get_cursor() as cur:
        ctx = _load_asset_context(cur, asset_id)
        operating = _load_operating_quarters(cur, asset_id, as_of_quarter)
        projections = _load_projection_quarters(cur, asset_id, "0000-Q0")
        exit_event = _load_latest_exit_event(cur, asset_id)
    return _hash_sources(
        {"ctx": ctx, "op_count": len(operating)},
        {
            "op_rows": [
                (r["quarter"], str(r.get("revenue")), str(r.get("opex")),
                 str(r.get("capex")), str(r.get("debt_service")))
                for r in operating
            ]
        },
        {"proj_rows": [(r["quarter"], r["source"], str(r.get("revenue"))) for r in projections]},
        {"exit": exit_event},
        {"as_of": as_of_quarter},
    )
