"""Operator Diagnostics service — senior-housing operator vs market analysis.

Honors the Authoritative State Lockdown contract (docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md):
  * NOI and occupancy come only from `re_authoritative_snapshots.get_authoritative_state`.
  * No SQL aggregates are run over `re_authoritative_*` tables (Invariant 7).
  * Derived metrics suppress when inputs are null or periods diverge; suppression
    reasons are surfaced per field.
  * Every field in the response carries a state_origin + null_reasons so the UI
    can render provenance verbatim.
  * Peer-set construction is deterministic and explicit (cohort by acuity,
    region, size_band; minimum sample 3; simple mean; exclude self) — it is
    NOT narrowed by UI display filters.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable
from uuid import UUID

from app.db import get_cursor
from app.services import re_authoritative_snapshots


# ─────────────────────────────────────────────────────────────
# Peer-set constants (stable contract)
# ─────────────────────────────────────────────────────────────

COHORT_KEYS = ("acuity_type", "region", "size_band")
MIN_PEER_SAMPLE = 3


# ─────────────────────────────────────────────────────────────
# Decimal helpers (we return strings in the response; arithmetic is Decimal)
# ─────────────────────────────────────────────────────────────

def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _d2s(value: Decimal | None) -> str | None:
    """Decimal → stable string (or None). Preserves precision for audit."""
    if value is None:
        return None
    return format(value, "f")


def _divide(num: Decimal | None, den: Decimal | None) -> Decimal | None:
    if num is None or den is None or den == 0:
        return None
    return num / den


# ─────────────────────────────────────────────────────────────
# Quarter helpers (quarter labels look like '2026Q2'; operational rows use same)
# ─────────────────────────────────────────────────────────────

def _prior_quarter(quarter: str) -> str | None:
    if len(quarter) != 6 or quarter[4] != "Q":
        return None
    year = int(quarter[:4])
    q = int(quarter[5])
    if q == 1:
        return f"{year - 1}Q4"
    return f"{year}Q{q - 1}"


def _size_band(units: int | None) -> str | None:
    if units is None:
        return None
    if units >= 150:
        return "large"
    if units >= 75:
        return "mid"
    return "small"


# ─────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────

def get_operator_diagnostics(
    *,
    env_id: str,
    quarter: str,
    fund_id: UUID | str | None = None,
    acuity: str | None = None,
    region: str | None = None,
    operator: str | None = None,
    snapshot_version: str | None = None,
    audit_run_id: UUID | str | None = None,
) -> dict[str, Any]:
    """Compose the full diagnostics payload.

    Pipeline:
      1. List senior-housing assets in env (optionally scoped to a fund).
      2. Attach current-effective operator profile per asset.
      3. Pull authoritative (NOI, occupancy) per asset via single fetch layer.
      4. Pull operational (revenue, labor_cost) + prior-quarter occupancy for trend.
      5. Derive metrics, enforcing period alignment.
      6. Build peer sets from ALL released assets (not display-filtered).
      7. Apply display filters (acuity/region/operator) to returned rows.
      8. Operator rollups + summary rollups (from visible rows / released only).
      9. Compose audit block.
    """
    assets_raw = _list_senior_housing_assets(env_id=env_id, fund_id=fund_id)
    asset_ids = [row["asset_id"] for row in assets_raw]

    profiles = _load_profiles(asset_ids=asset_ids, env_id=env_id)
    auth_states = _load_authoritative_states(
        asset_ids=asset_ids,
        quarter=quarter,
        snapshot_version=snapshot_version,
        audit_run_id=audit_run_id,
    )
    prior_auth = _load_authoritative_states(
        asset_ids=asset_ids,
        quarter=_prior_quarter(quarter) or quarter,
        snapshot_version=None,
        audit_run_id=None,
    )
    operational = _load_operational_rows(
        asset_ids=asset_ids, quarter=quarter
    )

    # Build unfiltered per-asset rows first (needed for peer-set math).
    unfiltered_assets: list[dict[str, Any]] = []
    for a in assets_raw:
        row = _compose_asset_row(
            asset=a,
            profile=profiles.get(a["asset_id"]),
            auth=auth_states.get(a["asset_id"]),
            prior_auth=prior_auth.get(a["asset_id"]),
            op=operational.get(a["asset_id"]),
            quarter=quarter,
        )
        unfiltered_assets.append(row)

    _apply_peer_deltas(unfiltered_assets)

    # Apply display filters (narrows returned list; does NOT re-compute peer math).
    visible_assets = [r for r in unfiltered_assets if _matches_filter(r, acuity, region, operator)]

    operators = _rollup_operators(visible_assets)
    summary = _rollup_summary(visible_assets, env_id=env_id, quarter=quarter)
    audit = _build_audit(
        assets=unfiltered_assets,
        visible=visible_assets,
        quarter=quarter,
    )

    return {
        "summary": summary,
        "operators": operators,
        "assets": [_strip_internal(r) for r in visible_assets],
        "audit": audit,
    }


def _strip_internal(row: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in row.items() if not k.startswith("_")}
    if isinstance(out.get("asset_id"), UUID):
        out["asset_id"] = str(out["asset_id"])
    return out


# ─────────────────────────────────────────────────────────────
# Step 1 — list assets
# ─────────────────────────────────────────────────────────────

def _list_senior_housing_assets(
    *, env_id: str, fund_id: UUID | str | None
) -> list[dict[str, Any]]:
    sql = """
        SELECT a.asset_id,
               a.name,
               pa.units,
               pa.market,
               pa.property_type
          FROM repe_asset a
          JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
          JOIN repe_deal d            ON d.deal_id = a.deal_id
          JOIN repe_fund f            ON f.fund_id = d.fund_id
         WHERE f.env_id = %s
           AND LOWER(COALESCE(pa.property_type, '')) IN ('senior_housing','senior housing')
    """
    params: list[Any] = [env_id]
    if fund_id is not None:
        sql += " AND f.fund_id = %s::uuid"
        params.append(str(fund_id))
    sql += " ORDER BY a.name ASC"

    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────
# Step 2 — load effective profiles
# ─────────────────────────────────────────────────────────────

def _load_profiles(
    *, asset_ids: list[UUID | str], env_id: str
) -> dict[Any, dict[str, Any]]:
    if not asset_ids:
        return {}
    sql = """
        SELECT DISTINCT ON (asset_id)
               asset_id, operator_name, operator_name_source,
               acuity_type, acuity_type_source, size_band
          FROM re_asset_operator_profile
         WHERE env_id = %s
           AND asset_id = ANY(%s::uuid[])
           AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
         ORDER BY asset_id, effective_from DESC
    """
    with get_cursor() as cur:
        cur.execute(sql, [env_id, [str(a) for a in asset_ids]])
        rows = cur.fetchall() or []
    return {r["asset_id"]: dict(r) for r in rows}


# ─────────────────────────────────────────────────────────────
# Step 3 — authoritative states (per-asset, Invariant 7 honored)
# ─────────────────────────────────────────────────────────────

def _load_authoritative_states(
    *,
    asset_ids: list[UUID | str],
    quarter: str,
    snapshot_version: str | None,
    audit_run_id: UUID | str | None,
) -> dict[Any, dict[str, Any]]:
    out: dict[Any, dict[str, Any]] = {}
    for aid in asset_ids:
        out[aid] = re_authoritative_snapshots.get_authoritative_state(
            entity_type="asset",
            entity_id=aid,
            quarter=quarter,
            snapshot_version=snapshot_version,
            audit_run_id=audit_run_id,
        )
    return out


# ─────────────────────────────────────────────────────────────
# Step 4 — operational rows (non-authoritative)
# ─────────────────────────────────────────────────────────────

def _load_operational_rows(
    *, asset_ids: list[UUID | str], quarter: str
) -> dict[Any, dict[str, Any]]:
    if not asset_ids:
        return {}
    sql = """
        SELECT asset_id, quarter, revenue, labor_cost, labor_cost_source, source_type
          FROM re_asset_operating_qtr
         WHERE asset_id = ANY(%s::uuid[])
           AND quarter = %s
           AND scenario_id IS NULL
    """
    with get_cursor() as cur:
        cur.execute(sql, [[str(a) for a in asset_ids], quarter])
        rows = cur.fetchall() or []
    return {r["asset_id"]: dict(r) for r in rows}


# ─────────────────────────────────────────────────────────────
# Step 5 — compose per-asset row enforcing metric contract
# ─────────────────────────────────────────────────────────────

def _compose_asset_row(
    *,
    asset: dict[str, Any],
    profile: dict[str, Any] | None,
    auth: dict[str, Any] | None,
    prior_auth: dict[str, Any] | None,
    op: dict[str, Any] | None,
    quarter: str,
) -> dict[str, Any]:
    null_reasons: dict[str, str] = {}
    sources: dict[str, str | None] = {
        "operator_name_source": None,
        "acuity_type_source": None,
        "labor_cost_source": None,
        "revenue_source": None,
    }

    # Profile (metadata)
    operator_name: str | None = None
    acuity_type: str | None = None
    size_band: str | None = None
    if profile is not None:
        operator_name = profile.get("operator_name")
        acuity_type = profile.get("acuity_type")
        size_band = profile.get("size_band")
        sources["operator_name_source"] = profile.get("operator_name_source")
        sources["acuity_type_source"] = profile.get("acuity_type_source")
    else:
        null_reasons["operator_name"] = "profile_missing"
        null_reasons["acuity_type"] = "profile_missing"

    if size_band is None:
        size_band = _size_band(asset.get("units"))

    # Authoritative NOI + occupancy
    noi: Decimal | None = None
    occupancy: Decimal | None = None
    auth_quarter: str | None = None
    snapshot_version: str | None = None
    period_exact: bool = False
    state_origin = "fallback"

    if auth is not None and auth.get("state") is not None and auth.get("period_exact"):
        canonical = auth["state"].get("canonical_metrics") or {}
        noi = _to_decimal(canonical.get("noi"))
        occupancy = _to_decimal(canonical.get("occupancy"))
        auth_quarter = str(auth.get("quarter"))
        snapshot_version = auth.get("snapshot_version")
        period_exact = bool(auth.get("period_exact"))
        if auth.get("state_origin") == "authoritative":
            state_origin = "authoritative"
        if noi is None:
            null_reasons["noi"] = "canonical_metric_missing"
        if occupancy is None:
            null_reasons["occupancy"] = "canonical_metric_missing"
    else:
        reason = (auth or {}).get("null_reason") or "authoritative_state_not_released"
        null_reasons["noi"] = reason
        null_reasons["occupancy"] = reason

    # Operational (revenue, labor_cost) — MUST match authoritative quarter exactly
    revenue: Decimal | None = None
    labor_cost: Decimal | None = None
    op_period_mismatch = False
    if op is not None:
        if auth_quarter is not None and str(op.get("quarter")) != auth_quarter:
            op_period_mismatch = True
        else:
            revenue = _to_decimal(op.get("revenue"))
            labor_cost = _to_decimal(op.get("labor_cost"))
            sources["labor_cost_source"] = op.get("labor_cost_source")
            sources["revenue_source"] = op.get("source_type")

    if op_period_mismatch:
        null_reasons["revenue"] = "operational_period_mismatch"
        null_reasons["labor_cost"] = "operational_period_mismatch"
    else:
        if revenue is None:
            null_reasons.setdefault("revenue", "operational_row_missing")
        if labor_cost is None:
            null_reasons.setdefault("labor_cost", "operational_value_missing")

    # Derived — suppress cleanly if inputs missing
    noi_margin = _divide(noi, revenue) if "noi" not in null_reasons and "revenue" not in null_reasons else None
    if noi_margin is None and "noi_margin" not in null_reasons:
        null_reasons["noi_margin"] = _derived_null_reason(null_reasons, ["noi", "revenue"])

    labor_intensity = (
        _divide(labor_cost, revenue)
        if "labor_cost" not in null_reasons and "revenue" not in null_reasons
        else None
    )
    if labor_intensity is None:
        null_reasons.setdefault(
            "labor_intensity", _derived_null_reason(null_reasons, ["labor_cost", "revenue"])
        )

    # Occupancy trend QoQ
    prior_occupancy: Decimal | None = None
    if (
        prior_auth is not None
        and prior_auth.get("state") is not None
        and prior_auth.get("period_exact")
        and prior_auth.get("state_origin") == "authoritative"
    ):
        prior_occupancy = _to_decimal(
            (prior_auth["state"].get("canonical_metrics") or {}).get("occupancy")
        )
    occupancy_trend: Decimal | None = None
    if occupancy is not None and prior_occupancy is not None:
        occupancy_trend = occupancy - prior_occupancy
    else:
        null_reasons.setdefault("occupancy_trend_qoq", "prior_quarter_unreleased")

    return {
        "asset_id": asset["asset_id"],
        "name": asset.get("name"),
        "operator_name": operator_name,
        "acuity_type": acuity_type,
        "size_band": size_band,
        "market": asset.get("market"),
        "units": asset.get("units"),
        # authoritative
        "noi": _d2s(noi),
        "occupancy": _d2s(occupancy),
        # operational
        "revenue": _d2s(revenue),
        "labor_cost": _d2s(labor_cost),
        # derived
        "noi_margin": _d2s(noi_margin),
        "labor_intensity": _d2s(labor_intensity),
        "occupancy_trend_qoq": _d2s(occupancy_trend),
        "peer_margin_delta": None,  # filled by _apply_peer_deltas
        # metadata
        "state_origin": state_origin,
        "snapshot_version": snapshot_version,
        "period_exact": period_exact,
        "null_reasons": null_reasons,
        "sources": sources,
        "peer_set": {
            "acuity_type": acuity_type,
            "region": asset.get("market"),
            "size_band": size_band,
            "peer_count": 0,
        },
        # internal (not serialized) — used for peer math + rollups
        "_noi_margin_decimal": noi_margin,
        "_released": period_exact and state_origin == "authoritative",
    }


def _derived_null_reason(null_reasons: dict[str, str], inputs: list[str]) -> str:
    for inp in inputs:
        if inp in null_reasons:
            return null_reasons[inp]
    return "missing_input"


# ─────────────────────────────────────────────────────────────
# Step 6 — peer deltas from ALL released assets
# ─────────────────────────────────────────────────────────────

def _apply_peer_deltas(assets: list[dict[str, Any]]) -> None:
    """Compute peer_margin_delta per asset using cohort (acuity, region, size_band).

    Uses ALL released assets (not display-filtered). Excludes self by asset_id
    so identical margins don't collide. Suppresses if sample < MIN_PEER_SAMPLE.
    """
    # Index released assets' margins keyed by cohort, tagged with asset_id so
    # we can exclude self cleanly without relying on value identity.
    cohort_index: dict[tuple, list[tuple[Any, Decimal]]] = defaultdict(list)
    for r in assets:
        if not r["_released"]:
            continue
        m = r["_noi_margin_decimal"]
        if m is None:
            continue
        key = (r["acuity_type"], r["market"], r["size_band"])
        cohort_index[key].append((r["asset_id"], m))

    for r in assets:
        key = (r["acuity_type"], r["market"], r["size_band"])
        bucket = cohort_index.get(key, [])
        peers = [m for (aid, m) in bucket if aid != r["asset_id"]]
        peer_count = len(peers)
        r["peer_set"]["peer_count"] = peer_count

        if not r["_released"] or r["_noi_margin_decimal"] is None:
            r["null_reasons"].setdefault(
                "peer_margin_delta", "asset_not_released_or_margin_missing"
            )
            r["peer_margin_delta"] = None
            continue
        if peer_count < MIN_PEER_SAMPLE:
            r["null_reasons"]["peer_margin_delta"] = "insufficient_peer_sample"
            r["peer_margin_delta"] = None
            continue
        peer_avg = sum(peers, Decimal(0)) / Decimal(peer_count)
        delta = r["_noi_margin_decimal"] - peer_avg
        r["peer_margin_delta"] = _d2s(delta)


# ─────────────────────────────────────────────────────────────
# Step 7 — filters (display-only)
# ─────────────────────────────────────────────────────────────

def _matches_filter(
    row: dict[str, Any],
    acuity: str | None,
    region: str | None,
    operator: str | None,
) -> bool:
    if acuity and row.get("acuity_type") != acuity:
        return False
    if region and row.get("market") != region:
        return False
    if operator and row.get("operator_name") != operator:
        return False
    return True


# ─────────────────────────────────────────────────────────────
# Step 8 — rollups (exact from visible / released rows)
# ─────────────────────────────────────────────────────────────

def _avg_decimal(values: Iterable[Decimal]) -> Decimal | None:
    xs = [v for v in values if v is not None]
    if not xs:
        return None
    return sum(xs) / Decimal(len(xs))


def _rollup_operators(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_op: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in assets:
        if r.get("operator_name"):
            by_op[r["operator_name"]].append(r)

    items: list[dict[str, Any]] = []
    for op_name, rows in by_op.items():
        margins = [_to_decimal(r["noi_margin"]) for r in rows if r["noi_margin"] is not None]
        occs = [_to_decimal(r["occupancy"]) for r in rows if r["occupancy"] is not None]
        lis = [_to_decimal(r["labor_intensity"]) for r in rows if r["labor_intensity"] is not None]
        deltas = [_to_decimal(r["peer_margin_delta"]) for r in rows if r["peer_margin_delta"] is not None]
        any_seed = any(
            (r.get("sources") or {}).get("operator_name_source") == "seed"
            or (r.get("sources") or {}).get("acuity_type_source") == "seed"
            or (r.get("sources") or {}).get("labor_cost_source") == "seed"
            for r in rows
        )
        any_released = any(r["_released"] for r in rows)
        items.append(
            {
                "operator_name": op_name,
                "asset_count": len(rows),
                "avg_noi_margin": _d2s(_avg_decimal(margins)),
                "avg_occupancy": _d2s(_avg_decimal(occs)),
                "avg_labor_intensity": _d2s(_avg_decimal(lis)),
                "peer_margin_delta": _d2s(_avg_decimal(deltas)),
                "rank": 0,  # filled below
                "trust_status": "trusted" if any_released else "missing_source",
                "contains_seed_sources": any_seed,
            }
        )

    items.sort(
        key=lambda x: (
            _to_decimal(x["avg_noi_margin"]) if x["avg_noi_margin"] is not None else Decimal("-Infinity")
        ),
        reverse=True,
    )
    for i, it in enumerate(items):
        it["rank"] = i + 1
    return items


def _rollup_summary(
    assets: list[dict[str, Any]], *, env_id: str, quarter: str
) -> dict[str, Any]:
    released = [r for r in assets if r["_released"]]
    released_count = len(released)
    margins = [_to_decimal(r["noi_margin"]) for r in released if r["noi_margin"] is not None]
    occs = [_to_decimal(r["occupancy"]) for r in released if r["occupancy"] is not None]
    lis = [_to_decimal(r["labor_intensity"]) for r in released if r["labor_intensity"] is not None]
    deltas = [
        _to_decimal(r["peer_margin_delta"]) for r in released if r["peer_margin_delta"] is not None
    ]
    null_reasons: dict[str, str] = {}
    if released_count == 0:
        null_reasons = {
            "avg_noi_margin": "no_released_snapshots",
            "avg_occupancy": "no_released_snapshots",
            "avg_labor_intensity": "no_released_snapshots",
            "avg_peer_delta": "no_released_snapshots",
        }
    return {
        "env_id": env_id,
        "quarter": quarter,
        "asset_count": len(assets),
        "released_count": released_count,
        "avg_noi_margin": _d2s(_avg_decimal(margins)),
        "avg_occupancy": _d2s(_avg_decimal(occs)),
        "avg_labor_intensity": _d2s(_avg_decimal(lis)),
        "avg_peer_delta": _d2s(_avg_decimal(deltas)),
        "state_origin": "derived",
        "null_reasons": null_reasons,
    }


# ─────────────────────────────────────────────────────────────
# Step 9 — audit block
# ─────────────────────────────────────────────────────────────

def _build_audit(
    *,
    assets: list[dict[str, Any]],
    visible: list[dict[str, Any]],
    quarter: str,
) -> dict[str, Any]:
    versions = sorted({r["snapshot_version"] for r in assets if r.get("snapshot_version")})
    released_count = sum(1 for r in assets if r["_released"])
    missing_count = len(assets) - released_count

    # Peer-count histogram
    buckets = {"0-2": 0, "3-5": 0, "6-10": 0, "11+": 0}
    for r in assets:
        n = r["peer_set"]["peer_count"]
        if n <= 2:
            buckets["0-2"] += 1
        elif n <= 5:
            buckets["3-5"] += 1
        elif n <= 10:
            buckets["6-10"] += 1
        else:
            buckets["11+"] += 1

    # Per-field suppression reason counts
    suppression: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in assets:
        for field, reason in (r.get("null_reasons") or {}).items():
            if reason:
                suppression[field][reason] += 1
    suppression_out = {field: dict(reasons) for field, reasons in suppression.items()}

    # Source provenance counts
    provenance: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    demo_seed_present = False
    for r in assets:
        for field, val in (r.get("sources") or {}).items():
            if val is not None:
                provenance[field][val] += 1
                if val == "seed":
                    demo_seed_present = True
    provenance_out = {f: dict(vs) for f, vs in provenance.items()}

    return {
        "snapshot_versions": versions,
        "released_count": released_count,
        "missing_count": missing_count,
        "peer_set_definition": {
            "cohort_keys": list(COHORT_KEYS),
            "min_sample": MIN_PEER_SAMPLE,
            "aggregation": "mean",
            "exclude_self": True,
        },
        "peer_count_histogram": buckets,
        "metric_suppression_reasons": suppression_out,
        "source_provenance_counts": provenance_out,
        "demo_seed_present": demo_seed_present,
        "quarter": quarter,
        "requested_quarter": quarter,
        "generated_at": datetime.now(timezone.utc),
    }
