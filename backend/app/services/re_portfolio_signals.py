"""
Portfolio signal generator.

Produces deterministic, data-driven insights for the fund portfolio page.
Each signal has attribution depth (per-entity breakdown with driver field)
and recommended actions (links to commands/navigation).

No AI — all signals are derived from SQL aggregates against period state tables.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor

# Active asset filter reused from re_env_portfolio
_ACTIVE_STATUSES = ("active", "held", "lease_up", "operating")
_ACTIVE_STATUS_SQL = f"(a.asset_status IS NULL OR a.asset_status IN ({', '.join(repr(s) for s in _ACTIVE_STATUSES)}))"


def _money_str(v: Decimal | None) -> str | None:
    return format(v, "f") if v is not None else None


def _pct_str(v: Decimal | float | None, precision: int = 2) -> str | None:
    if v is None:
        return None
    return f"{float(v) * 100:.{precision}f}%"


def generate_signals(
    *,
    business_id: UUID | str,
    quarter: str,
) -> list[dict]:
    """Generate deterministic portfolio signals for the given quarter."""
    biz = str(business_id)
    signals: list[dict] = []

    signals.extend(_low_dscr_signal(biz, quarter))
    signals.extend(_nav_delta_signal(biz, quarter))
    signals.extend(_maturing_debt_signal(biz, quarter))
    signals.extend(_occupancy_warning_signal(biz, quarter))

    return signals


# ---------------------------------------------------------------------------
# Signal: Low DSCR
# ---------------------------------------------------------------------------

def _low_dscr_signal(business_id: str, quarter: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (aqs.asset_id)
                aqs.asset_id,
                aqs.dscr,
                aqs.noi,
                aqs.debt_balance,
                a.name AS asset_name,
                f.name AS fund_name,
                f.fund_id
              FROM re_asset_quarter_state aqs
              JOIN repe_asset a ON a.asset_id = aqs.asset_id
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE f.business_id = %s::uuid
                AND aqs.quarter = %s
                AND aqs.scenario_id IS NULL
                AND aqs.dscr IS NOT NULL
                AND aqs.dscr < 1.25
              ORDER BY aqs.asset_id, aqs.created_at DESC
            )
            SELECT * FROM latest ORDER BY dscr ASC
            """,
            [business_id, quarter],
        )
        rows = cur.fetchall()

    if not rows:
        return []

    count = len(rows)
    breakdown = []
    entity_refs = []
    for r in rows:
        breakdown.append({
            "asset_name": r["asset_name"],
            "dscr": float(r["dscr"]) if r["dscr"] else None,
            "fund": r["fund_name"],
            "noi": _money_str(r["noi"]),
            "debt_balance": _money_str(r["debt_balance"]),
        })
        entity_refs.append({
            "entity_type": "asset",
            "entity_id": str(r["asset_id"]),
            "name": r["asset_name"],
        })

    # Group by fund for detail text
    fund_counts: dict[str, int] = {}
    for r in rows:
        fund_counts[r["fund_name"]] = fund_counts.get(r["fund_name"], 0) + 1
    detail_parts = [f"{c} in {fn}" for fn, c in fund_counts.items()]

    severity = "critical" if any(float(r["dscr"]) < 1.0 for r in rows) else "warning"

    return [{
        "signal_id": "low_dscr",
        "severity": severity,
        "headline": f"{count} asset{'s' if count != 1 else ''} below 1.25x DSCR",
        "detail": "Concentrated in " + ", ".join(detail_parts) + ".",
        "filter_overrides": {"dscr_max": "1.25"},
        "entity_refs": entity_refs[:10],
        "attribution_payload": {
            "breakdown": breakdown[:10],
            "drill_url": "/re/surveillance?dscr_max=1.25",
        },
        "recommended_actions": [
            {"label": "Review debt maturities", "command": "/debt-surveillance"},
            {"label": "Run refinance model", "command": "/run-model", "params": {"scope": "dscr_stressed"}},
            {"label": "Inspect DSCR variance", "command": "/variance-analysis", "params": {"metric": "dscr"}},
        ],
    }]


# ---------------------------------------------------------------------------
# Signal: NAV QoQ Delta
# ---------------------------------------------------------------------------

def _prior_quarter(quarter: str) -> str:
    """Compute previous quarter string from 'YYYYQn'."""
    year = int(quarter[:4])
    q = int(quarter[5])
    q -= 1
    if q < 1:
        q = 4
        year -= 1
    return f"{year}Q{q}"


def _nav_delta_signal(business_id: str, quarter: str) -> list[dict]:
    prev = _prior_quarter(quarter)

    with get_cursor() as cur:
        # Current and prior quarter fund NAVs
        cur.execute(
            """
            WITH current_nav AS (
              SELECT DISTINCT ON (s.fund_id) s.fund_id, s.portfolio_nav, f.name AS fund_name
              FROM re_fund_quarter_state s
              JOIN repe_fund f ON f.fund_id = s.fund_id
              WHERE f.business_id = %s::uuid AND s.quarter = %s AND s.scenario_id IS NULL
              ORDER BY s.fund_id, s.created_at DESC
            ),
            prior_nav AS (
              SELECT DISTINCT ON (s.fund_id) s.fund_id, s.portfolio_nav
              FROM re_fund_quarter_state s
              JOIN repe_fund f ON f.fund_id = s.fund_id
              WHERE f.business_id = %s::uuid AND s.quarter = %s AND s.scenario_id IS NULL
              ORDER BY s.fund_id, s.created_at DESC
            )
            SELECT
              c.fund_id, c.fund_name,
              c.portfolio_nav AS current_nav,
              p.portfolio_nav AS prior_nav,
              CASE WHEN p.portfolio_nav IS NOT NULL AND p.portfolio_nav > 0
                   THEN (c.portfolio_nav - p.portfolio_nav) / p.portfolio_nav
                   ELSE NULL END AS pct_change
            FROM current_nav c
            LEFT JOIN prior_nav p ON p.fund_id = c.fund_id
            WHERE c.portfolio_nav IS NOT NULL
            ORDER BY ABS(COALESCE(c.portfolio_nav - p.portfolio_nav, 0)) DESC
            """,
            [business_id, quarter, business_id, prev],
        )
        rows = cur.fetchall()

    if not rows:
        return []

    total_current = sum(r["current_nav"] or 0 for r in rows)
    total_prior = sum(r["prior_nav"] or 0 for r in rows)

    if total_prior and total_prior > 0:
        overall_pct = float((total_current - total_prior) / total_prior * 100)
    else:
        return []  # Can't compute delta without prior period

    if abs(overall_pct) < 0.1:
        return []  # Trivial change, skip signal

    direction = "+" if overall_pct > 0 else ""
    severity = "positive" if overall_pct > 0 else "warning"

    # Top contributor
    top = rows[0] if rows else None
    top_detail = ""
    if top and top["pct_change"] is not None:
        top_detail = f" Top mover: {top['fund_name']} ({direction}{float(top['pct_change']) * 100:.1f}%)."

    breakdown = []
    for r in rows[:5]:
        delta = r["current_nav"] - r["prior_nav"] if r["prior_nav"] else None
        breakdown.append({
            "asset_name": r["fund_name"],  # Using fund name in breakdown
            "fund": r["fund_name"],
            "current_nav": _money_str(r["current_nav"]),
            "prior_nav": _money_str(r["prior_nav"]),
            "delta": _money_str(delta) if delta else None,
            "pct_change": _pct_str(r["pct_change"]) if r["pct_change"] else None,
        })

    return [{
        "signal_id": "nav_delta",
        "severity": severity,
        "headline": f"NAV {direction}{overall_pct:.1f}% QoQ",
        "detail": f"Portfolio NAV moved from {_money_str(Decimal(total_prior))} to {_money_str(Decimal(total_current))}.{top_detail}",
        "filter_overrides": {},
        "entity_refs": [
            {"entity_type": "fund", "entity_id": str(r["fund_id"]), "name": r["fund_name"]}
            for r in rows[:5]
        ],
        "attribution_payload": {
            "breakdown": breakdown,
            "drill_url": f"/re/variance?quarter={quarter}",
        },
        "recommended_actions": [
            {"label": "Open variance analysis", "command": "/variance-analysis"},
        ],
    }]


# ---------------------------------------------------------------------------
# Signal: Maturing Debt
# ---------------------------------------------------------------------------

def _maturing_debt_signal(business_id: str, quarter: str) -> list[dict]:
    year = int(quarter[:4])

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              ld.asset_id,
              a.name AS asset_name,
              f.name AS fund_name,
              ld.maturity_date,
              ld.current_balance,
              ld.coupon,
              EXTRACT(YEAR FROM ld.maturity_date)::int AS maturity_year
            FROM re_loan_detail ld
            JOIN repe_asset a ON a.asset_id = ld.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s::uuid
              AND ld.maturity_date IS NOT NULL
              AND EXTRACT(YEAR FROM ld.maturity_date) BETWEEN %s AND %s
              AND ld.current_balance IS NOT NULL AND ld.current_balance > 0
            ORDER BY ld.maturity_date ASC
            """,
            [business_id, year, year + 2],
        )
        rows = cur.fetchall()

    if not rows:
        return []

    count = len(rows)
    total_balance = sum(r["current_balance"] or 0 for r in rows)

    # Group by year
    year_buckets: dict[int, int] = {}
    for r in rows:
        y = r["maturity_year"]
        year_buckets[y] = year_buckets.get(y, 0) + 1

    detail_parts = [f"{c} in {y}" for y, c in sorted(year_buckets.items())]

    breakdown = []
    entity_refs = []
    for r in rows[:10]:
        breakdown.append({
            "asset_name": r["asset_name"],
            "fund": r["fund_name"],
            "maturity_date": r["maturity_date"].isoformat() if r["maturity_date"] else None,
            "current_balance": _money_str(r["current_balance"]),
            "coupon": _pct_str(r["coupon"]) if r["coupon"] else None,
        })
        entity_refs.append({
            "entity_type": "asset",
            "entity_id": str(r["asset_id"]),
            "name": r["asset_name"],
        })

    return [{
        "signal_id": "maturing_debt",
        "severity": "warning" if count <= 3 else "critical",
        "headline": f"{count} loan{'s' if count != 1 else ''} maturing within 24 months ({_money_str(Decimal(total_balance))})",
        "detail": "Maturities: " + ", ".join(detail_parts) + ".",
        "filter_overrides": {"maturity_year_max": str(year + 2)},
        "entity_refs": entity_refs[:10],
        "attribution_payload": {
            "breakdown": breakdown,
            "drill_url": "/re/surveillance?view=debt",
        },
        "recommended_actions": [
            {"label": "Review debt maturities", "command": "/debt-surveillance"},
            {"label": "Run refinance model", "command": "/run-model", "params": {"scope": "refi"}},
        ],
    }]


# ---------------------------------------------------------------------------
# Signal: Low Occupancy
# ---------------------------------------------------------------------------

def _occupancy_warning_signal(business_id: str, quarter: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (aqs.asset_id)
                aqs.asset_id,
                aqs.occupancy,
                a.name AS asset_name,
                f.name AS fund_name,
                pa.property_type
              FROM re_asset_quarter_state aqs
              JOIN repe_asset a ON a.asset_id = aqs.asset_id
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
              WHERE f.business_id = %s::uuid
                AND aqs.quarter = %s
                AND aqs.scenario_id IS NULL
                AND aqs.occupancy IS NOT NULL
                AND aqs.occupancy < 0.85
              ORDER BY aqs.asset_id, aqs.created_at DESC
            )
            SELECT * FROM latest ORDER BY occupancy ASC
            """,
            [business_id, quarter],
        )
        rows = cur.fetchall()

    if not rows:
        return []

    count = len(rows)
    breakdown = []
    entity_refs = []
    for r in rows[:10]:
        breakdown.append({
            "asset_name": r["asset_name"],
            "fund": r["fund_name"],
            "occupancy": _pct_str(r["occupancy"]) if r["occupancy"] else None,
            "property_type": r["property_type"],
        })
        entity_refs.append({
            "entity_type": "asset",
            "entity_id": str(r["asset_id"]),
            "name": r["asset_name"],
        })

    return [{
        "signal_id": "low_occupancy",
        "severity": "warning",
        "headline": f"{count} asset{'s' if count != 1 else ''} below 85% occupancy",
        "detail": f"Lowest: {rows[0]['asset_name']} at {_pct_str(rows[0]['occupancy'])}.",
        "filter_overrides": {"occupancy_max": "0.85"},
        "entity_refs": entity_refs[:10],
        "attribution_payload": {
            "breakdown": breakdown,
            "drill_url": "/re/variance?metric=occupancy",
        },
        "recommended_actions": [
            {"label": "Open variance analysis", "command": "/variance-analysis", "params": {"metric": "occupancy"}},
        ],
    }]
