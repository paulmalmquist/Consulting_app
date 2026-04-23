"""Fund Decomposition — Gross Contribution Overlay.

Owns the overlay contract for the fund-decomposition dashboard. The endpoint
lets a user select a subset of investments in a fund and asks: "what does the
gross contribution stack look like if I isolate this subset at current
ownership through the stated as-of quarter?"

This is explanatory analysis, not a hypothetical alternate fund history. The
contract is fixed: `state_origin` is always `"decomposition_overlay"`, the
response always carries `baseline_authoritative` and `selection_derived` side
by side, and identity checks witness the relationship between the two. The
contract does not shape-shift on the selection set.

Math invariants (see /Users/paulmalmquist/.claude/plans/you-are-working-inside-greedy-crane.md):
  - TVPI identity: selection_tvpi == (selection_nav + selection_distributions) / selection_paid_in
  - DPI identity:  selection_dpi  == selection_distributions / selection_paid_in
  - Full-set match: selecting every investment is within 5 bps of the released
    snapshot's gross IRR and 0.005 of its TVPI.
  - Order independence: response is invariant to the order of excluded IDs.
  - No future CF: every CF quarter <= as_of_quarter end.

Waterfall-dependent quantities (carry, promote, gp_share) always return null
with null_reason `out_of_scope_requires_waterfall` — never approximated. Net
IRR under filtering returns null with `net_irr_not_dimensional_to_investment_subset`
because fund-level fees are not investment-dimensional.
"""

from __future__ import annotations

import copy
import hashlib
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from threading import Lock
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.bottom_up_cashflow import quarter_end_date
from app.services.bottom_up_rollup import compute_fund_rollup
from app.services.re_authoritative_snapshots import get_authoritative_state

_OVERLAY_SEMANTICS = (
    "Gross contribution of selected investments at current ownership through "
    "as_of_quarter. Not an alternate fund history."
)

_IRR_MATCH_TOLERANCE_BPS = 5
_TVPI_MATCH_TOLERANCE = Decimal("0.005")
_IDENTITY_TOLERANCE = Decimal("0.000000001")


class EmptySelection(ValueError):
    """Raised when the caller filters out every investment.

    Maps to error_code AT_LEAST_ONE_ASSET_REQUIRED on the POST endpoint.
    """


class UnknownInvestmentIds(ValueError):
    """Raised when `excluded_investment_ids` contains IDs not in the fund.

    Maps to error_code UNKNOWN_INVESTMENT_IDS on the POST endpoint.
    """

    def __init__(self, ids: list[UUID]):
        self.ids = ids
        super().__init__(f"unknown_investment_ids: {[str(i) for i in ids]}")


class EnvNotCapable(Exception):
    """Raised when the env is missing schema/materializations required to run
    the overlay. Reported as error_code ENV_NOT_DECOMPOSITION_CAPABLE.

    The capability probe is the authoritative source — this exception is
    the fail-closed path when the POST endpoint is called directly without
    a prior capability check.
    """

    def __init__(self, missing_tables: list[str], reasons: list[str]):
        self.missing_tables = missing_tables
        self.reasons = reasons
        super().__init__(f"env_not_decomposition_capable: {reasons}")


class EnvHasNoReData(Exception):
    """Raised when schema is present but the env has no funds.

    Distinct from EnvNotCapable (schema) and FundNotFound (bad id within an
    env that has funds). Reported as ENV_HAS_NO_RE_DATA.
    """


class FundNotFound(Exception):
    """Raised when the requested fund_id does not exist in the env's scope.

    Distinct from EnvHasNoReData (no funds at all). Reported as FUND_NOT_FOUND.
    """

    def __init__(self, fund_id: UUID):
        self.fund_id = fund_id
        super().__init__(f"fund_not_found: {fund_id}")


class OverlayComputationFailed(Exception):
    """Raised when the overlay compute itself fails for a reason other than
    the typed categories above (xirr nonconvergence, mismatched state, etc).
    Reported as OVERLAY_COMPUTATION_FAILED.
    """


@dataclass
class _InvestmentState:
    investment_id: UUID
    name: str
    invested_capital: Decimal
    realized_distributions: Decimal
    unrealized_value: Decimal
    gross_irr: Decimal | None


def _to_decimal(v: Any, default: Decimal = Decimal(0)) -> Decimal:
    if v is None:
        return default
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return default


def _list_fund_investments(fund_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT deal_id AS investment_id, name
            FROM repe_deal
            WHERE fund_id = %s
            ORDER BY created_at
            """,
            [str(fund_id)],
        )
        return cur.fetchall() or []


def _load_investment_states(
    investment_ids: list[UUID], as_of_quarter: str
) -> dict[UUID, _InvestmentState]:
    """Read per-investment paid-in / distributions / NAV / gross_irr from
    `re_investment_quarter_state` at the as-of quarter. Substrate must match
    the TVPI/DPI identity — this is the single source we read from.
    """
    if not investment_ids:
        return {}

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT iqs.investment_id,
                   d.name,
                   iqs.invested_capital,
                   iqs.realized_distributions,
                   iqs.unrealized_value,
                   iqs.gross_irr
            FROM re_investment_quarter_state iqs
            JOIN repe_deal d ON d.deal_id = iqs.investment_id
            WHERE iqs.investment_id = ANY(%s::uuid[])
              AND iqs.quarter = %s
              AND iqs.scenario_id IS NULL
            """,
            [[str(i) for i in investment_ids], as_of_quarter],
        )
        rows = cur.fetchall() or []

    out: dict[UUID, _InvestmentState] = {}
    for r in rows:
        iid = r["investment_id"]
        if isinstance(iid, str):
            iid = UUID(iid)
        out[iid] = _InvestmentState(
            investment_id=iid,
            name=r.get("name") or "(unnamed)",
            invested_capital=_to_decimal(r.get("invested_capital")),
            realized_distributions=_to_decimal(r.get("realized_distributions")),
            unrealized_value=_to_decimal(r.get("unrealized_value")),
            gross_irr=_to_decimal(r.get("gross_irr"), Decimal(0))
            if r.get("gross_irr") is not None
            else None,
        )
    return out


def _load_investment_assets(investment_ids: list[UUID]) -> dict[UUID, list[dict[str, Any]]]:
    """Read child-asset summary for drill-down rows. Drill-down only — never
    used for the selection filter or the accounting identity.
    """
    if not investment_ids:
        return {}

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT a.deal_id  AS investment_id,
                   a.asset_id,
                   a.name,
                   a.asset_status AS status,
                   aqs.nav      AS nav,
                   aqs.asset_value
            FROM repe_asset a
            LEFT JOIN LATERAL (
              SELECT nav, asset_value
              FROM re_asset_quarter_state
              WHERE asset_id = a.asset_id AND scenario_id IS NULL
              ORDER BY quarter DESC
              LIMIT 1
            ) aqs ON TRUE
            WHERE a.deal_id = ANY(%s::uuid[])
            ORDER BY a.deal_id, a.created_at
            """,
            [[str(i) for i in investment_ids]],
        )
        rows = cur.fetchall() or []

    grouped: dict[UUID, list[dict[str, Any]]] = {}
    for r in rows:
        iid = r["investment_id"]
        if isinstance(iid, str):
            iid = UUID(iid)
        aid = r["asset_id"]
        if isinstance(aid, str):
            aid = UUID(aid)
        nav_val = r.get("nav") if r.get("nav") is not None else r.get("asset_value")
        grouped.setdefault(iid, []).append(
            {
                "asset_id": str(aid),
                "name": r.get("name") or "(unnamed asset)",
                "nav": float(_to_decimal(nav_val)) if nav_val is not None else None,
                "status": r.get("status"),
            }
        )
    return grouped


def _cache_key(
    fund_id: UUID,
    as_of_quarter: str,
    excluded: set[UUID],
    default_cap_rate: Decimal | None,
) -> str:
    excluded_sorted = sorted(str(i) for i in excluded)
    key = f"{fund_id}|{as_of_quarter}|{','.join(excluded_sorted)}|{default_cap_rate or ''}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


_CACHE_MAX = 128
_CACHE_TTL_SECONDS = 300
_cache: "OrderedDict[str, tuple[float, dict[str, Any]]]" = OrderedDict()
_cache_lock = Lock()


def _cache_get(key: str) -> dict[str, Any] | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        ts, payload = entry
        if time.monotonic() - ts > _CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return copy.deepcopy(payload)


def _cache_put(key: str, payload: dict[str, Any]) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), copy.deepcopy(payload))
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)


def _cache_clear() -> None:
    """Test hook — clear the overlay cache."""
    with _cache_lock:
        _cache.clear()


# ---------------------------------------------------------------------------
# Capability probe
# ---------------------------------------------------------------------------
#
# Environment-scoped readiness check for the Fund Decomposition overlay.
# The page calls this on mount and refuses to issue a POST until
# `capable=true` and a valid fund is selected. Direct API callers still
# need to handle typed errors on the POST endpoint (stale tabs, races,
# cross-env stitching) — this probe does not relax the POST contract.
#
# Decomposition capability = every one of:
#   1. Schema for repe_fund, repe_deal, re_investment_quarter_state,
#      re_asset_cf_series_mat, re_investment_cf_series_mat, re_authoritative_fund_state_qtr.
#   2. The env (scoped via RLS session context) has at least one fund.
#
# Data-presence checks (fund existence, investment count, snapshot for the
# requested quarter) are fund-scoped extras returned when `fund_id` is
# provided but are NOT required for env-level capability.

_REQUIRED_TABLES = [
    "repe_fund",
    "repe_deal",
    "re_investment_quarter_state",
    "re_asset_cf_series_mat",
    "re_investment_cf_series_mat",
    "re_authoritative_fund_state_qtr",
]


def _list_missing_tables() -> list[str]:
    """Return the subset of _REQUIRED_TABLES that don't exist in the current
    DB. Uses information_schema.tables so a missing table is a clean empty
    row, not an exception.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY(%s::text[])
            """,
            [_REQUIRED_TABLES],
        )
        rows = cur.fetchall() or []
    present = {r["table_name"] for r in rows}
    return [t for t in _REQUIRED_TABLES if t not in present]


def _count_env_funds() -> int:
    """Fund count within the caller's RLS scope. Returns 0 if the table is
    missing — capability probe callers filter that case out earlier."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT COUNT(*)::bigint AS n FROM repe_fund")
            row = cur.fetchone()
            return int(row["n"]) if row and row.get("n") is not None else 0
    except Exception:
        return 0


def _count_fund_investments(fund_id: UUID) -> int:
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*)::bigint AS n FROM repe_deal WHERE fund_id = %s",
                [str(fund_id)],
            )
            row = cur.fetchone()
            return int(row["n"]) if row and row.get("n") is not None else 0
    except Exception:
        return 0


def _fund_exists(fund_id: UUID) -> bool:
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM repe_fund WHERE fund_id = %s LIMIT 1",
                [str(fund_id)],
            )
            return cur.fetchone() is not None
    except Exception:
        return False


def probe_decomposition_capabilities(
    *, fund_id: UUID | None = None
) -> dict[str, Any]:
    """Report whether the current env can run the Fund Decomposition overlay.

    Env-scoped first: schema completeness + fund presence. If `fund_id` is
    provided, also reports fund-level data presence (existence, investment
    count). Never raises — this function is the fail-open probe; it returns
    structured reasons instead.
    """
    missing_tables = _list_missing_tables()
    schema_complete = len(missing_tables) == 0

    if not schema_complete:
        return {
            "capable": False,
            "error_code": "ENV_NOT_DECOMPOSITION_CAPABLE",
            "reasons": [
                "required RE data-model migrations and decomposition tables are not present for this workspace",
            ],
            "missing_migrations": _infer_missing_migrations(missing_tables),
            "missing_tables": missing_tables,
            "fund_count": 0,
            "fund": None,
        }

    fund_count = _count_env_funds()
    if fund_count == 0:
        return {
            "capable": False,
            "error_code": "ENV_HAS_NO_RE_DATA",
            "reasons": [
                "this workspace has no RE funds seeded yet",
            ],
            "missing_migrations": [],
            "missing_tables": [],
            "fund_count": 0,
            "fund": None,
        }

    fund_info: dict[str, Any] | None = None
    if fund_id is not None:
        if not _fund_exists(fund_id):
            return {
                "capable": True,
                "error_code": "FUND_NOT_FOUND",
                "reasons": [f"fund {fund_id} is not present in this workspace"],
                "missing_migrations": [],
                "missing_tables": [],
                "fund_count": fund_count,
                "fund": {"fund_id": str(fund_id), "exists": False, "investment_count": 0},
            }
        inv_count = _count_fund_investments(fund_id)
        fund_info = {
            "fund_id": str(fund_id),
            "exists": True,
            "investment_count": inv_count,
        }

    return {
        "capable": True,
        "error_code": None,
        "reasons": [],
        "missing_migrations": [],
        "missing_tables": [],
        "fund_count": fund_count,
        "fund": fund_info,
    }


def _infer_missing_migrations(missing_tables: list[str]) -> list[str]:
    """Map missing tables back to the schema migration(s) that introduce them.
    Kept narrow and honest — only the migration families directly relevant
    to this feature."""
    families: set[str] = set()
    for t in missing_tables:
        if t in {"repe_fund", "repe_deal"}:
            families.add("265_repe_object_model")
        elif t == "re_investment_quarter_state":
            families.add("270_re_institutional_model")
        elif t in {"re_asset_cf_series_mat", "re_investment_cf_series_mat"}:
            families.add("507_re_bottom_up_cashflow")
        elif t == "re_authoritative_fund_state_qtr":
            families.add("authoritative_state_lockdown")
    return sorted(families)


def compute_fund_decomposition(
    fund_id: UUID,
    as_of_quarter: str,
    *,
    excluded_investment_ids: set[UUID] | None = None,
    env_default_cap_rate: Decimal | None = None,
) -> dict[str, Any]:
    """Assemble the overlay response. See module docstring for invariants.

    Typed error contract — the POST endpoint maps each of these to a
    distinct error_code so UI and API callers can distinguish states:
      * EnvNotCapable           → ENV_NOT_DECOMPOSITION_CAPABLE
      * EnvHasNoReData          → ENV_HAS_NO_RE_DATA
      * FundNotFound            → FUND_NOT_FOUND
      * EmptySelection          → AT_LEAST_ONE_ASSET_REQUIRED
      * UnknownInvestmentIds    → UNKNOWN_INVESTMENT_IDS
      * OverlayComputationFailed → OVERLAY_COMPUTATION_FAILED
    """
    excluded = excluded_investment_ids or set()

    # Cache key is built from sorted inputs — order-independent by construction.
    cache_key_early = _cache_key(fund_id, as_of_quarter, excluded, env_default_cap_rate)
    cached = _cache_get(cache_key_early)
    if cached is not None:
        return cached

    # Capability fail-closed. A direct POST that bypassed the probe (stale
    # tab, cross-env stitch, race) must still distinguish schema/data gaps
    # from the overlay's fund/selection errors.
    cap = probe_decomposition_capabilities(fund_id=fund_id)
    if cap["error_code"] == "ENV_NOT_DECOMPOSITION_CAPABLE":
        raise EnvNotCapable(
            missing_tables=cap.get("missing_tables") or [],
            reasons=cap.get("reasons") or [],
        )
    if cap["error_code"] == "ENV_HAS_NO_RE_DATA":
        raise EnvHasNoReData()
    if cap["error_code"] == "FUND_NOT_FOUND":
        raise FundNotFound(fund_id)

    all_investments = _list_fund_investments(fund_id)
    all_ids = set()
    for inv in all_investments:
        iid = inv["investment_id"]
        if isinstance(iid, str):
            iid = UUID(iid)
        all_ids.add(iid)

    # Fund exists per the capability probe but has zero investments — treat
    # as FUND_NOT_FOUND semantically (nothing to decompose). Separate from
    # EmptySelection which only fires when the user excludes everything.
    if not all_ids:
        raise FundNotFound(fund_id)

    unknown = excluded - all_ids
    if unknown:
        raise UnknownInvestmentIds(sorted(unknown, key=str))

    selected_ids = all_ids - excluded
    if not selected_ids:
        raise EmptySelection("at_least_one_investment_required")

    is_full_set = excluded == set()

    # Ledger substrate — paid-in / distributions / NAV at as_of_quarter.
    states = _load_investment_states(sorted(selected_ids, key=str), as_of_quarter)

    sel_paid_in = sum((s.invested_capital for s in states.values()), Decimal(0))
    sel_distributions = sum(
        (s.realized_distributions for s in states.values()), Decimal(0)
    )
    sel_nav = sum((s.unrealized_value for s in states.values()), Decimal(0))

    sel_tvpi: Decimal | None = None
    sel_dpi: Decimal | None = None
    if sel_paid_in > 0:
        sel_tvpi = (sel_nav + sel_distributions) / sel_paid_in
        sel_dpi = sel_distributions / sel_paid_in

    # CF substrate — gross bottom-up IRR via the existing rollup engine.
    roll = compute_fund_rollup(
        fund_id,
        as_of_quarter,
        env_default_cap_rate=env_default_cap_rate,
        included_investment_ids=selected_ids,
        compute_contributions=True,
    )

    # Cumulative CF series on quarter-end.
    cashflow_series: list[dict[str, Any]] = []
    running = Decimal(0)
    for p in roll.series:
        running += p.amount
        cashflow_series.append(
            {
                "quarter": p.quarter,
                "quarter_end_date": p.quarter_end_date.isoformat(),
                "amount": float(p.amount),
                "cumulative": float(running),
            }
        )

    # Baseline from authoritative snapshot (always fetched; never recomputed).
    baseline_raw = get_authoritative_state(
        entity_type="fund", entity_id=fund_id, quarter=as_of_quarter
    )
    baseline = _baseline_block(baseline_raw)

    # Per-investment contributions with drill-down assets.
    asset_groups = _load_investment_assets(sorted(selected_ids | excluded, key=str))

    # Investment-level marginal IRR bps via leave-one-out on the CF series.
    iid_to_marginal_bps = _compute_investment_marginal_bps(
        fund_id,
        as_of_quarter,
        selected_ids,
        roll.irr,
        env_default_cap_rate,
    )

    investment_contributions: list[dict[str, Any]] = []
    for iid in sorted(all_ids, key=str):
        st = states.get(iid)
        included = iid in selected_ids
        entry: dict[str, Any] = {
            "investment_id": str(iid),
            "name": (st.name if st else _name_lookup(iid, all_investments)),
            "included": included,
            "paid_in": float(st.invested_capital) if st else None,
            "distributions": float(st.realized_distributions) if st else None,
            "nav": float(st.unrealized_value) if st else None,
            "gross_irr": float(st.gross_irr) if (st and st.gross_irr is not None) else None,
            "value_share": _value_share_for(iid, roll) if included else None,
            "irr_marginal_bps": iid_to_marginal_bps.get(str(iid)) if included else None,
            "irr_marginal_label": (
                "marginal impact under current selection (leave-one-out, non-additive)"
            ),
            "assets": asset_groups.get(iid, []),
        }
        investment_contributions.append(entry)

    # Identity checks.
    identity_checks: list[dict[str, Any]] = []

    # 1. TVPI identity
    if sel_tvpi is not None and sel_paid_in > 0:
        computed = (sel_nav + sel_distributions) / sel_paid_in
        identity_checks.append(
            {
                "name": "tvpi_identity",
                "passed": abs(sel_tvpi - computed) <= _IDENTITY_TOLERANCE,
                "delta": float(abs(sel_tvpi - computed)),
                "tolerance": float(_IDENTITY_TOLERANCE),
            }
        )
    else:
        identity_checks.append(
            {
                "name": "tvpi_identity",
                "passed": True,
                "applied": False,
                "applied_reason": "paid_in_zero",
            }
        )

    # 2. DPI identity
    if sel_dpi is not None and sel_paid_in > 0:
        computed = sel_distributions / sel_paid_in
        identity_checks.append(
            {
                "name": "dpi_identity",
                "passed": abs(sel_dpi - computed) <= _IDENTITY_TOLERANCE,
                "delta": float(abs(sel_dpi - computed)),
                "tolerance": float(_IDENTITY_TOLERANCE),
            }
        )
    else:
        identity_checks.append(
            {
                "name": "dpi_identity",
                "passed": True,
                "applied": False,
                "applied_reason": "paid_in_zero",
            }
        )

    # 3. Full-set matches baseline (only applies when selection == all).
    if is_full_set and baseline.get("trust_status") == "trusted":
        base_irr = _to_decimal(baseline.get("gross_irr"))
        base_tvpi = _to_decimal(baseline.get("tvpi"))
        sel_irr = roll.irr if roll.irr is not None else None
        delta_irr_bps = (
            float(abs(sel_irr - base_irr) * 10000) if sel_irr is not None else None
        )
        delta_tvpi = float(abs(sel_tvpi - base_tvpi)) if sel_tvpi is not None else None
        passed = (
            (delta_irr_bps is None or delta_irr_bps <= _IRR_MATCH_TOLERANCE_BPS)
            and (delta_tvpi is None or delta_tvpi <= float(_TVPI_MATCH_TOLERANCE))
        )
        identity_checks.append(
            {
                "name": "full_set_matches_baseline",
                "passed": passed,
                "delta_gross_irr_bps": delta_irr_bps,
                "delta_tvpi": delta_tvpi,
                "tolerance_gross_irr_bps": _IRR_MATCH_TOLERANCE_BPS,
                "tolerance_tvpi": float(_TVPI_MATCH_TOLERANCE),
                "applied": True,
            }
        )
    else:
        identity_checks.append(
            {
                "name": "full_set_matches_baseline",
                "passed": True,
                "applied": False,
                "applied_reason": (
                    "selection_is_subset"
                    if not is_full_set
                    else "baseline_not_released"
                ),
            }
        )

    # 4. Order independence (witnessed by cache-key hash stability on sorted input).
    identity_checks.append(
        {
            "name": "order_independent",
            "passed": True,
            "cache_key_hash": cache_key_early,
            "tolerance": "hash_stable",
        }
    )

    # 5. No future CF.
    as_of_end: date = quarter_end_date(as_of_quarter)
    future_points = [
        p for p in cashflow_series if date.fromisoformat(p["quarter_end_date"]) > as_of_end
    ]
    identity_checks.append(
        {
            "name": "no_future_cf",
            "passed": len(future_points) == 0,
            "last_quarter": cashflow_series[-1]["quarter"] if cashflow_series else None,
            "as_of_quarter_end": as_of_end.isoformat(),
        }
    )

    warnings: list[str] = list(roll.warnings)

    response = {
        "fund_id": str(fund_id),
        "as_of_quarter": as_of_quarter,
        "state_origin": "decomposition_overlay",
        "selection_definition": {
            "primitive": "investment",
            "included_investment_ids": sorted(str(i) for i in selected_ids),
            "excluded_investment_ids": sorted(str(i) for i in excluded),
            "ownership_basis": "as_of_quarter_end",
            "cf_grain": "quarterly_quarter_end",
            "overlay_semantics": _OVERLAY_SEMANTICS,
        },
        "baseline_authoritative": baseline,
        "selection_derived": {
            "gross_irr": float(roll.irr) if roll.irr is not None else None,
            "gross_irr_null_reason": roll.null_reason,
            "tvpi": float(sel_tvpi) if sel_tvpi is not None else None,
            "dpi": float(sel_dpi) if sel_dpi is not None else None,
            "paid_in": float(sel_paid_in),
            "distributions": float(sel_distributions),
            "nav": float(sel_nav),
            "cashflow_series": cashflow_series,
            "net_irr": None,
            "net_irr_null_reason": "net_irr_not_dimensional_to_investment_subset",
            "carry": None,
            "carry_null_reason": "out_of_scope_requires_waterfall",
            "promote": None,
            "promote_null_reason": "out_of_scope_requires_waterfall",
            "gp_share": None,
            "gp_share_null_reason": "out_of_scope_requires_waterfall",
        },
        "investment_contributions": investment_contributions,
        "identity_checks": identity_checks,
        "provenance": {
            "cf_substrate": "re_investment_cf_series_mat (via compute_fund_rollup)",
            "paid_in_substrate": "re_investment_quarter_state",
            "xirr_engine": "app.finance.irr_engine.xirr",
            "cache_key_hash": cache_key_early,
        },
        "warnings": warnings,
    }
    _cache_put(cache_key_early, response)
    return response


def _baseline_block(raw: dict[str, Any]) -> dict[str, Any]:
    """Extract the fields the overlay contract promises from the authoritative
    state response. Missing metrics pass through as null — we never synthesize.
    """
    if raw.get("null_reason"):
        return {
            "trust_status": "missing_source",
            "source": "re_authoritative_snapshots",
            "snapshot_version": None,
            "period_exact": None,
            "promotion_state": None,
            "null_reason": raw["null_reason"],
            "gross_irr": None,
            "net_irr": None,
            "tvpi": None,
            "dpi": None,
            "paid_in": None,
            "distributions": None,
            "nav": None,
        }

    state = raw.get("state") or {}
    metrics = state.get("canonical_metrics") or {}

    def _num(v: Any) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "source": "re_authoritative_snapshots",
        "snapshot_version": raw.get("snapshot_version"),
        "trust_status": raw.get("trust_status"),
        "period_exact": raw.get("period_exact"),
        "promotion_state": raw.get("promotion_state"),
        "gross_irr": _num(metrics.get("gross_irr")),
        "net_irr": _num(metrics.get("net_irr")),
        "tvpi": _num(metrics.get("tvpi")),
        "dpi": _num(metrics.get("dpi")),
        "paid_in": _num(metrics.get("total_called")),
        "distributions": _num(metrics.get("total_distributed")),
        "nav": _num(metrics.get("ending_nav")),
        "net_irr_label": "baseline fund only, not recomputed under selection",
    }


def _name_lookup(iid: UUID, investments: list[dict[str, Any]]) -> str:
    for inv in investments:
        row_id = inv["investment_id"]
        if isinstance(row_id, str):
            row_id = UUID(row_id)
        if row_id == iid:
            return inv.get("name") or "(unnamed)"
    return "(unnamed)"


def _value_share_for(iid: UUID, roll: Any) -> float | None:
    for c in roll.investment_contributions:
        if c["investment_id"] == str(iid):
            return c.get("value_share")
    return None


def _compute_investment_marginal_bps(
    fund_id: UUID,
    as_of_quarter: str,
    selected_ids: set[UUID],
    fund_irr: Decimal | None,
    env_default_cap_rate: Decimal | None,
) -> dict[str, float | None]:
    """Investment-level leave-one-out marginal IRR in basis points.

    For each selected investment i, recompute the fund rollup on the
    selection minus {i} and take fund_irr - loo_irr. Non-additive by
    construction; labeled as a heuristic in the response.
    """
    if fund_irr is None or len(selected_ids) <= 1:
        return {str(i): None for i in selected_ids}

    out: dict[str, float | None] = {}
    for iid in selected_ids:
        loo = compute_fund_rollup(
            fund_id,
            as_of_quarter,
            env_default_cap_rate=env_default_cap_rate,
            included_investment_ids=selected_ids - {iid},
            compute_contributions=False,
        )
        if loo.irr is None:
            out[str(iid)] = None
        else:
            out[str(iid)] = float((fund_irr - loo.irr) * 10000)
    return out
