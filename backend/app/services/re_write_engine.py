"""REPE asset write engine — balanced-books mutation layer.

Balanced-books invariants enforced by this service:
  EGI         = revenue + other_income
  NOI         = EGI - opex
  Net CF      = NOI - capex - debt_service - leasing_costs - tenant_improvements - free_rent

NOI and net cash flow are NEVER set directly. They are always computed
from their ingredient line items. Any caller that passes a pre-computed
NOI or tries to set it directly will receive a validation error.

All writes set source_type = 'manual_override' and recompute inputs_hash.
The original 'derived' row is NOT deleted — a new row is inserted with
the manual_override source_type and the same (asset_id, quarter) key.
Conflicts on (asset_id, quarter) upsert to the same row.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor


_TWO_PLACES = Decimal("0.01")


# ── P&L helpers ────────────────────────────────────────────────────────────────


def _d(v: Any) -> Decimal:
    """Coerce to Decimal, treating None / missing as 0."""
    if v is None:
        return Decimal(0)
    return Decimal(str(v))


def compute_pnl(row: dict) -> dict:
    """Return a full P&L breakdown computed from ingredient line items.

    Input row keys map directly to re_asset_operating_qtr columns.
    Returns float values for JSON serialisation.
    """
    revenue = _d(row.get("revenue"))
    other_income = _d(row.get("other_income"))
    opex = _d(row.get("opex"))
    capex = _d(row.get("capex"))
    debt_service = _d(row.get("debt_service"))
    leasing_costs = _d(row.get("leasing_costs"))
    tenant_improvements = _d(row.get("tenant_improvements"))
    free_rent = _d(row.get("free_rent"))
    occupancy = _d(row.get("occupancy"))

    egi = revenue + other_income
    noi = egi - opex
    net_cf = noi - capex - debt_service - leasing_costs - tenant_improvements - free_rent

    return {
        "revenue": float(revenue),
        "other_income": float(other_income),
        "egi": float(egi),
        "opex": float(opex),
        "noi": float(noi),
        "capex": float(capex),
        "debt_service": float(debt_service),
        "leasing_costs": float(leasing_costs),
        "tenant_improvements": float(tenant_improvements),
        "free_rent": float(free_rent),
        "net_cash_flow": float(net_cf),
        "occupancy": float(occupancy),
    }


def _pnl_diff(before: dict, after: dict) -> dict:
    """Return delta dict for every key in the P&L."""
    return {k: round(after[k] - before[k], 2) for k in before}


def _compute_hash(row: dict) -> str:
    """Deterministic hash of the ingredient values for staleness detection."""
    keys = ["revenue", "other_income", "opex", "capex", "debt_service",
            "leasing_costs", "tenant_improvements", "free_rent", "occupancy"]
    payload = {k: str(row.get(k) or 0) for k in keys}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


# ── Validation ─────────────────────────────────────────────────────────────────


def validate_operating(data: dict) -> list[str]:
    """Return a list of human-readable validation errors. Empty = valid."""
    errors: list[str] = []
    non_negative = ["revenue", "opex", "capex", "debt_service",
                    "leasing_costs", "tenant_improvements", "free_rent"]
    for field in non_negative:
        v = data.get(field)
        if v is not None and float(v) < 0:
            errors.append(f"{field} must be >= 0 (it is the absolute amount, not a signed adjustment)")
    if data.get("occupancy") is not None:
        occ = float(data["occupancy"])
        if occ < 0 or occ > 1:
            errors.append("occupancy must be between 0.0 and 1.0")
    if data.get("noi") is not None:
        errors.append("noi cannot be set directly — set revenue and opex instead")
    if data.get("net_cash_flow") is not None or data.get("cash_flow") is not None:
        errors.append("net_cash_flow cannot be set directly — set the ingredient line items instead")
    return errors


# ── Read ───────────────────────────────────────────────────────────────────────


def read_asset_pnl(*, asset_id: str, quarter: str) -> dict:
    """Return current operating row + computed P&L for an asset/quarter.

    Returns the most recent row by created_at (manual_override beats derived
    since it's inserted later). Returns None pnl fields if no row exists.
    """
    with get_cursor() as cur:
        # Asset metadata
        cur.execute(
            "SELECT asset_id, name, asset_type FROM repe_asset WHERE asset_id = %s",
            (asset_id,),
        )
        asset = cur.fetchone()
        if not asset:
            raise LookupError(f"Asset {asset_id} not found")

        # Most recent operating row for this quarter
        cur.execute(
            """
            SELECT revenue, other_income, opex, capex, debt_service,
                   leasing_costs, tenant_improvements, free_rent,
                   occupancy, cash_balance, source_type, inputs_hash, created_at
            FROM re_asset_operating_qtr
            WHERE asset_id = %s AND quarter = %s
            ORDER BY
              CASE source_type WHEN 'manual_override' THEN 0 ELSE 1 END,
              created_at DESC
            LIMIT 1
            """,
            (asset_id, quarter),
        )
        row = cur.fetchone()

        result: dict = {
            "asset_id": asset_id,
            "asset_name": asset["name"],
            "asset_type": asset["asset_type"],
            "quarter": quarter,
            "has_data": row is not None,
            "source_type": row["source_type"] if row else None,
            "last_updated": str(row["created_at"]) if row else None,
        }

        if row:
            result["pnl"] = compute_pnl(row)
            result["inputs_hash"] = row["inputs_hash"]
        else:
            result["pnl"] = None

        return result


# ── Preview ────────────────────────────────────────────────────────────────────


def preview_change(
    *,
    asset_id: str,
    quarter: str,
    overrides: dict,
) -> dict:
    """Compute before/after P&L for proposed changes without writing anything.

    overrides: dict with any subset of line item keys. Keys absent from
    overrides are inherited from the current row.
    """
    current = read_asset_pnl(asset_id=asset_id, quarter=quarter)
    base_row = current.get("pnl") or {}

    # Validate the proposed values
    errors = validate_operating(overrides)
    if errors:
        return {"valid": False, "errors": errors}

    # Merge overrides onto current
    merged = {**base_row}
    # Map PnL output keys back to row keys (pnl has egi/noi as computed, not stored)
    stored_keys = ["revenue", "other_income", "opex", "capex", "debt_service",
                   "leasing_costs", "tenant_improvements", "free_rent", "occupancy"]
    for k in stored_keys:
        if k in overrides and overrides[k] is not None:
            merged[k] = float(overrides[k])

    before_pnl = compute_pnl(base_row) if base_row else compute_pnl({})
    after_pnl = compute_pnl(merged)
    delta = _pnl_diff(before_pnl, after_pnl)

    return {
        "valid": True,
        "errors": [],
        "asset_name": current["asset_name"],
        "quarter": quarter,
        "has_existing_data": current["has_data"],
        "before": before_pnl,
        "after": after_pnl,
        "delta": delta,
        "note": (
            "NOI = EGI - opex. Net CF = NOI - capex - debt_service - leasing_costs "
            "- tenant_improvements - free_rent. Both are computed, never set directly."
        ),
    }


# ── Write ──────────────────────────────────────────────────────────────────────


def set_operating(
    *,
    asset_id: str,
    quarter: str,
    overrides: dict,
    reason: str,
    confirm: bool,
) -> dict:
    """Apply operating line-item overrides for an asset/quarter.

    If confirm=False, returns a preview (identical to preview_change) without
    writing. Require confirm=True to execute.

    Writes source_type='manual_override'. The hash is recomputed from the
    merged values so the bottom-up engine can detect the change.
    """
    # Always compute the preview first
    preview = preview_change(asset_id=asset_id, quarter=quarter, overrides=overrides)

    if not preview["valid"]:
        return preview

    if not confirm:
        return {
            **preview,
            "committed": False,
            "message": "Preview only — pass confirm=true to apply this change",
        }

    after = preview["after"]
    inputs_hash = _compute_hash(after)

    with get_cursor() as cur:
        # Step 1: try to update an existing non-locked base-scenario row
        cur.execute(
            """
            UPDATE re_asset_operating_qtr
            SET revenue             = %s,
                other_income        = %s,
                opex                = %s,
                capex               = %s,
                debt_service        = %s,
                leasing_costs       = %s,
                tenant_improvements = %s,
                free_rent           = %s,
                occupancy           = %s,
                source_type         = 'manual_override',
                inputs_hash         = %s,
                created_at          = now()
            WHERE asset_id = %s AND quarter = %s AND scenario_id IS NULL
              AND source_type != 'locked'
            RETURNING id
            """,
            (
                after["revenue"], after["other_income"], after["opex"],
                after["capex"], after["debt_service"], after["leasing_costs"],
                after["tenant_improvements"], after["free_rent"], after["occupancy"],
                inputs_hash, asset_id, quarter,
            ),
        )
        updated = cur.fetchone()

        if updated is None:
            # Check if blocked by lock
            cur.execute(
                "SELECT source_type FROM re_asset_operating_qtr "
                "WHERE asset_id = %s AND quarter = %s AND scenario_id IS NULL",
                (asset_id, quarter),
            )
            existing = cur.fetchone()
            if existing and existing["source_type"] == "locked":
                return {
                    "committed": False,
                    "error": "Write blocked — this quarter's row has source_type='locked'. "
                             "Locked rows cannot be overridden.",
                }
            # No existing row — insert fresh
            cur.execute(
                """
                INSERT INTO re_asset_operating_qtr
                  (id, asset_id, quarter, revenue, other_income, opex, capex,
                   debt_service, leasing_costs, tenant_improvements, free_rent,
                   occupancy, source_type, inputs_hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'manual_override', %s)
                RETURNING id
                """,
                (
                    str(uuid4()), asset_id, quarter,
                    after["revenue"], after["other_income"], after["opex"],
                    after["capex"], after["debt_service"], after["leasing_costs"],
                    after["tenant_improvements"], after["free_rent"], after["occupancy"],
                    inputs_hash,
                ),
            )

    return {
        **preview,
        "committed": True,
        "inputs_hash": inputs_hash,
        "reason": reason,
        "message": (
            f"Operating data updated for {preview['asset_name']} {quarter}. "
            f"NOI: {preview['before']['noi']:,.0f} → {preview['after']['noi']:,.0f} "
            f"(Δ {preview['delta']['noi']:+,.0f}). "
            f"Run repe.fund.rebuild_metrics to recompute fund-level IRR."
        ),
    }


# ── Fund rebuild trigger ───────────────────────────────────────────────────────


def rebuild_fund_metrics(
    *,
    fund_id: str,
    env_id: str,
    business_id: str,
    as_of_quarter: str,
    confirm: bool,
) -> dict:
    """Trigger bottom-up CF rebuild for all assets in a fund.

    Refreshes re_asset_cf_series_mat for each asset, then runs the fund-level
    rollup to produce a new canonical_metrics snapshot.
    """
    if not confirm:
        return {
            "committed": False,
            "message": (
                "Preview: will rebuild cash flow series for all assets in this fund "
                f"and recompute IRR as-of {as_of_quarter}. "
                "Pass confirm=true to execute."
            ),
        }

    from app.services.bottom_up_refresh import refresh_asset_cf_series_materialized
    from app.services.bottom_up_rollup import compute_fund_rollup

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ra.asset_id, ra.name
            FROM repe_asset ra
            JOIN repe_fund_entity_link rfl ON rfl.entity_id = ra.asset_id
            WHERE rfl.fund_id = %s
            ORDER BY ra.name
            """,
            (fund_id,),
        )
        assets = cur.fetchall()

    if not assets:
        return {"committed": False, "error": f"No assets found for fund {fund_id}"}

    refreshed: list[str] = []
    errors: list[str] = []
    for asset in assets:
        try:
            refresh_asset_cf_series_materialized(
                asset_id=UUID(str(asset["asset_id"])),
                as_of_quarter=as_of_quarter,
            )
            refreshed.append(asset["name"])
        except Exception as exc:
            errors.append(f"{asset['name']}: {exc}")

    # Fund-level rollup
    fund_result = None
    fund_rollup_error = None
    try:
        fund_result = compute_fund_rollup(
            fund_id=UUID(fund_id),
            as_of_quarter=as_of_quarter,
        )
    except Exception as exc:
        fund_rollup_error = str(exc)

    irr_display = (
        f"{float(fund_result.irr):.2%}"
        if fund_result and fund_result.irr is not None
        else f"null ({fund_result.null_reason if fund_result else fund_rollup_error})"
    )

    return {
        "committed": True,
        "assets_refreshed": refreshed,
        "asset_count": len(refreshed),
        "errors": errors + ([fund_rollup_error] if fund_rollup_error else []),
        "fund_gross_irr": float(fund_result.irr) if fund_result and fund_result.irr is not None else None,
        "fund_irr_null_reason": fund_result.null_reason if fund_result else fund_rollup_error,
        "as_of_quarter": as_of_quarter,
        "message": (
            f"Rebuilt CF series for {len(refreshed)}/{len(assets)} assets. "
            f"Fund gross IRR: {irr_display}"
            + (f". {len(errors)} error(s)." if errors else ".")
        ),
    }


# ── Entity operations ──────────────────────────────────────────────────────────


def add_asset(
    *,
    env_id: str,
    business_id: str,
    fund_id: str,
    name: str,
    asset_type: str,
    acquisition_quarter: str,
    acquisition_cost: Decimal,
    ownership_pct: Decimal,
    city: str | None,
    state_code: str | None,
    confirm: bool,
) -> dict:
    """Add a new asset, create a deal record, and link it to a fund."""
    # Validation
    errors: list[str] = []
    valid_types = {"multifamily", "industrial", "office", "retail", "hotel",
                   "senior_living", "medical", "mixed_use", "land"}
    if asset_type not in valid_types:
        errors.append(f"asset_type must be one of: {', '.join(sorted(valid_types))}")
    if float(ownership_pct) <= 0 or float(ownership_pct) > 1:
        errors.append("ownership_pct must be between 0.0 (exclusive) and 1.0 (inclusive)")
    if float(acquisition_cost) < 0:
        errors.append("acquisition_cost cannot be negative")
    if errors:
        return {"committed": False, "errors": errors}

    if not confirm:
        return {
            "committed": False,
            "message": (
                f"Preview: will create asset '{name}' ({asset_type}) "
                f"and link to fund {fund_id} at {float(ownership_pct):.0%} ownership. "
                "Pass confirm=true to execute."
            ),
        }

    with get_cursor() as cur:
        # Verify fund exists
        cur.execute("SELECT fund_id, name FROM repe_fund WHERE fund_id = %s", (fund_id,))
        fund = cur.fetchone()
        if not fund:
            return {"committed": False, "error": f"Fund {fund_id} not found"}

        # Create deal record
        deal_id = str(uuid4())
        cur.execute(
            """
            INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage,
                                   invested_capital, committed_capital)
            VALUES (%s, %s, %s, 'acquisition', 'closed', %s, %s)
            RETURNING deal_id
            """,
            (deal_id, fund_id, name, str(acquisition_cost), str(acquisition_cost)),
        )

        # Convert quarter to acquisition date (quarter-end)
        acq_year = int(acquisition_quarter[:4])
        acq_q = int(acquisition_quarter[-1])
        acq_month = acq_q * 3
        if acq_month == 3:
            acq_date = date(acq_year, 3, 31)
        elif acq_month == 6:
            acq_date = date(acq_year, 6, 30)
        elif acq_month == 9:
            acq_date = date(acq_year, 9, 30)
        else:
            acq_date = date(acq_year, 12, 31)

        # Create asset
        asset_id = str(uuid4())
        cur.execute(
            """
            INSERT INTO repe_asset (asset_id, deal_id, asset_type, name,
                                    acquisition_date, cost_basis, asset_status)
            VALUES (%s, %s, %s, %s, %s, %s, 'active')
            RETURNING asset_id
            """,
            (asset_id, deal_id, asset_type, name, acq_date, str(acquisition_cost)),
        )

        # Link to fund
        cur.execute(
            """
            INSERT INTO repe_fund_entity_link (fund_id, entity_id, role, ownership_percent)
            VALUES (%s, %s, 'asset', %s)
            ON CONFLICT (fund_id, entity_id, role) DO NOTHING
            """,
            (fund_id, asset_id, str(ownership_pct)),
        )

        # Seed zero operating row for acquisition quarter
        seed_hash = _compute_hash({})
        cur.execute(
            """
            INSERT INTO re_asset_operating_qtr
              (id, asset_id, quarter, revenue, other_income, opex, capex,
               debt_service, leasing_costs, tenant_improvements, free_rent,
               occupancy, source_type, inputs_hash)
            VALUES (%s, %s, %s, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'manual_override', %s)
            ON CONFLICT DO NOTHING
            """,
            (str(uuid4()), asset_id, acquisition_quarter, seed_hash),
        )

    return {
        "committed": True,
        "asset_id": asset_id,
        "deal_id": deal_id,
        "name": name,
        "asset_type": asset_type,
        "fund_name": fund["name"],
        "ownership_pct": float(ownership_pct),
        "acquisition_quarter": acquisition_quarter,
        "acquisition_cost": float(acquisition_cost),
        "message": (
            f"Asset '{name}' created and linked to {fund['name']} at "
            f"{float(ownership_pct):.0%} ownership. Seed operating row created for "
            f"{acquisition_quarter}. Use repe.asset.set_operating to populate line items."
        ),
    }


def deactivate_asset(
    *,
    asset_id: str,
    fund_id: str,
    reason: str,
    confirm: bool,
) -> dict:
    """Mark an asset as disposed/exited. Historical data is preserved."""
    if not reason.strip():
        return {"committed": False, "error": "reason is required for audit trail"}

    if not confirm:
        with get_cursor() as cur:
            cur.execute("SELECT name, asset_status FROM repe_asset WHERE asset_id = %s", (asset_id,))
            asset = cur.fetchone()
        if not asset:
            return {"committed": False, "error": f"Asset {asset_id} not found"}
        return {
            "committed": False,
            "message": (
                f"Preview: will set asset '{asset['name']}' status to 'disposed'. "
                "Historical operating data and CF series will be preserved. "
                "Pass confirm=true to execute."
            ),
        }

    with get_cursor() as cur:
        cur.execute(
            "UPDATE repe_asset SET asset_status = 'disposed' WHERE asset_id = %s RETURNING name",
            (asset_id,),
        )
        updated = cur.fetchone()
        if not updated:
            return {"committed": False, "error": f"Asset {asset_id} not found"}

    return {
        "committed": True,
        "asset_id": asset_id,
        "asset_name": updated["name"],
        "reason": reason,
        "message": (
            f"Asset '{updated['name']}' marked as disposed. Historical data preserved. "
            f"Run repe.fund.rebuild_metrics to update fund-level metrics."
        ),
    }
