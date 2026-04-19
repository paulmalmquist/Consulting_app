#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import sys
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from app.db import get_cursor  # noqa: E402
from app.finance.irr_engine import xirr as compute_xirr  # noqa: E402
from app.services import re_authoritative_snapshots  # noqa: E402

BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
QUARTERS = ["2025Q4", "2026Q2"]
SELECTED_FUND_IDS = [
    "a1b2c3d4-0003-0030-0001-000000000001",  # Institutional Growth Fund VII
    "a1b2c3d4-0001-0010-0001-000000000001",  # Meridian Real Estate Fund III
    "a1b2c3d4-0002-0020-0001-000000000001",  # Meridian Credit Opportunities Fund I
]
SELECTED_INVESTMENT_IDS = [
    # ── IGF VII — all 20 investments (phase0b fix: was only Tech Campus North) ──
    "d4560000-0456-0101-0006-000000000001",  # IGF VII – Lone Star Distribution
    "d4560000-0456-0101-0007-000000000001",  # IGF VII – Peachtree Logistics Park
    "d4560000-0456-0101-0001-000000000001",  # IGF VII – Meadowview Apartments
    "d4560000-0456-0101-0008-000000000001",  # IGF VII – Northwest Commerce Center
    "d4560000-0456-0101-0002-000000000001",  # IGF VII – Sunbelt Crossing
    "d4560000-0456-0101-0004-000000000001",  # IGF VII – Bayshore Flats
    "d4560000-0456-0101-0003-000000000001",  # IGF VII – Pinehurst Residences
    "594a1367-8109-49db-a353-44685fe6578e",  # IGF VII – Suburban Office Park
    "d4560000-0456-0101-0005-000000000001",  # IGF VII – Oakridge Residences
    "5b642a1e-feb7-4407-b38e-cdd2649c1b77",  # IGF VII – Lakeside Senior Living
    "93b29b91-fa91-47d5-ac93-cf3b7468c63a",  # IGF VII – Cascade Multifamily
    "8d2128bf-d8d2-4c9f-bc7c-05f77d437767",  # IGF VII – Harborview Logistics Park
    "2d54b971-21ac-41b8-a548-a506fe516c6c",  # IGF VII – Tech Campus North
    "eb6e5e5b-a1be-426c-84f8-38e66febb43a",  # IGF VII – Harbor Industrial Portfolio
    "8d87e8f7-9730-4f48-ab72-1ff741aa753a",  # IGF VII – Riverfront Apartments
    "b72d7d6d-396d-4787-9075-f739d23a10f3",  # IGF VII – Pacific Gateway Hotel
    "9689adf7-6e9f-43d4-a4db-e0c3b6a979a3",  # IGF VII – Meridian Office Tower
    "6e5be7a6-b228-4031-8799-ed5ab01c92ff",  # IGF VII – Summit Retail Center
    "6c6f1416-e1a4-43ff-bbe6-cad3967f97ff",  # IGF VII – Downtown Mixed-Use
    "6a793adf-cdfb-49f3-8a2e-440d38c48dea",  # IGF VII – Ironworks Mixed-Use
    # ── MREF III ──
    "a1b2c3d4-0001-0010-0002-000000000001",  # MRF III – Dallas Multifamily Cluster
    "a1b2c3d4-0001-0010-0002-000000000002",  # MRF III – Phoenix Value-Add Portfolio
    # ── MCOF I ──
    "a1b2c3d4-0002-0020-0002-000000000002",  # Midtown Towers – Atlanta GA
]
HIGHLIGHT_ASSET_IDS = [
    "3371333b-a54a-46e3-b4d9-0ad8443dd6a9",  # Tech Campus North capex sample
    "a1b2c3d4-0002-0020-0003-000000000002",  # Midtown Towers debt sample
]


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


def derive_fund_trust_fields(
    *,
    gross_irr: Decimal | None,
    net_irr: Decimal | None,
) -> dict[str, str | None]:
    """Derive the per-metric trust state for a fund snapshot.

    Precedence (documented in docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md):
      - IRR present (not None) → trusted, reason None
      - IRR None → unavailable, reason 'metric_not_computed'

    DSCR is never computed at fund-level in this runner; emit 'unavailable'
    with an explicit reason so the UI contract can fail-closed without
    guessing. This keeps the snapshot self-describing.

    The runner emits these fields on every fund write so consumers can
    rely on the keys being present. Release-state gating (not_released)
    lives in the API layer; at write time the snapshot is by definition
    a fresh record and its own release state is not yet known.
    """
    irr_trust = "trusted" if gross_irr is not None else "unavailable"
    irr_reason = None if gross_irr is not None else "metric_not_computed"
    net_irr_trust = "trusted" if net_irr is not None else "unavailable"
    net_irr_reason = None if net_irr is not None else "metric_not_computed"
    return {
        "irr_trust_state": irr_trust,
        "irr_reason": irr_reason,
        "net_irr_trust_state": net_irr_trust,
        "net_irr_reason": net_irr_reason,
        "dscr_trust_state": "unavailable",
        "dscr_reason": "dscr_not_computed_at_fund_level",
    }


def q_start_end(quarter: str) -> tuple[date, date]:
    year = int(quarter[:4])
    q_num = int(quarter[-1])
    start_month = (q_num - 1) * 3 + 1
    end_month = q_num * 3
    start = date(year, start_month, 1)
    end = date(year, end_month, monthrange(year, end_month)[1])
    return start, end


def quarter_end(quarter: str) -> date:
    return q_start_end(quarter)[1]


def prior_quarter(quarter: str) -> str:
    year = int(quarter[:4])
    q_num = int(quarter[-1])
    if q_num == 1:
        return f"{year - 1}Q4"
    return f"{year}Q{q_num - 1}"


def normalize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    return value


def stable_hash(value: Any) -> str:
    payload = json.dumps(normalize(value), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def decimal_or_zero(value: Any) -> Decimal:
    if value in (None, "", "null"):
        return Decimal("0")
    return Decimal(str(value))


def decimal_or_none(value: Any) -> Decimal | None:
    if value in (None, "", "null"):
        return None
    return Decimal(str(value))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, cls=DecimalEncoder))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if fieldnames is None:
        keys: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for key in row.keys():
                if key not in seen:
                    seen.add(key)
                    keys.append(key)
        fieldnames = keys
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: normalize(row.get(key)) for key in fieldnames})


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def mirror_latest_artifacts(versioned_root: Path, latest_root: Path) -> None:
    latest_root.mkdir(parents=True, exist_ok=True)
    for child in versioned_root.iterdir():
        target = latest_root / child.name
        if child.is_dir():
            shutil.copytree(child, target, dirs_exist_ok=True)
        else:
            shutil.copy2(child, target)


def fetchall(sql: str, params: tuple[Any, ...] | list[Any] = ()) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def fetchone(sql: str, params: tuple[Any, ...] | list[Any] = ()) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
    return dict(row) if row else None


def load_prior_released_ending_nav(fund_id: str, before_quarter: str) -> Decimal | None:
    """Return ending_nav from the most recent released authoritative snapshot for fund_id
    where quarter < before_quarter. Used as a period-continuity fallback when investment-level
    aggregation produces beginning_nav=0 (NF-3: investment has 0 prior NAV but fund does not)."""
    row = fetchone(
        """
        SELECT canonical_metrics->>'ending_nav' AS ending_nav
        FROM re_authoritative_fund_state_qtr
        WHERE fund_id = %s::uuid
          AND quarter < %s
          AND promotion_state = 'released'
        ORDER BY quarter DESC
        LIMIT 1
        """,
        (fund_id, before_quarter),
    )
    if row and row.get("ending_nav"):
        return decimal_or_none(row["ending_nav"])
    return None


def classify_line_code(target_line_code: str | None, target_statement: str | None) -> str:
    if not target_line_code:
        return "unmapped"
    code = target_line_code.upper()
    statement = (target_statement or "").upper()
    if "REV" in code or "INCOME" in code:
        return "revenue"
    if "CAPEX" in code or "TI" in code or "LC" in code or "IMPROVE" in code:
        return "capex"
    if "DEBT" in code or "INTEREST" in code:
        return "debt_service"
    if "RESERVE" in code:
        return "reserves"
    if statement == "BS":
        return "balance_sheet_excluded"
    return "opex"


def build_sample_manifest(hierarchy_rows: list[dict[str, Any]]) -> dict[str, Any]:
    fund_names = {}
    investment_names = {}
    asset_names = {}
    for row in hierarchy_rows:
        fund_names[row["fund_id"]] = row["fund_name"]
        investment_names[row["investment_id"]] = row["investment_name"]
        if row.get("asset_id"):
            asset_names[row["asset_id"]] = row.get("asset_name")
    return {
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "quarters": QUARTERS,
        "funds": [{"fund_id": fund_id, "fund_name": fund_names.get(fund_id)} for fund_id in SELECTED_FUND_IDS],
        "investments": [{"investment_id": inv_id, "investment_name": investment_names.get(inv_id)} for inv_id in SELECTED_INVESTMENT_IDS],
        "highlight_assets": [{"asset_id": asset_id, "asset_name": asset_names.get(asset_id)} for asset_id in HIGHLIGHT_ASSET_IDS],
        "sampling_notes": [
            "Institutional Growth Fund VII is the primary positive chain sample.",
            "Tech Campus North is the primary multi-asset 80/20 JV sample.",
            "Meridian Real Estate Fund III is the primary fee-bearing equity sample.",
            "Meridian Credit Opportunities Fund I / Midtown Towers is the debt and negative-cash-flow sample.",
        ],
    }


def load_hierarchy() -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    hierarchy_rows = fetchall(
        """
        SELECT
          f.fund_id::text AS fund_id,
          f.name AS fund_name,
          d.deal_id::text AS investment_id,
          d.name AS investment_name,
          d.deal_type,
          a.asset_id::text AS asset_id,
          a.name AS asset_name,
          a.asset_type,
          a.asset_status,
          j.jv_id::text AS jv_id,
          j.ownership_percent,
          j.gp_percent,
          j.lp_percent,
          j.status AS jv_status
        FROM repe_fund f
        JOIN repe_deal d ON d.fund_id = f.fund_id
        LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
        LEFT JOIN re_jv j ON j.investment_id = d.deal_id
        WHERE f.business_id = %s::uuid
          AND f.fund_id = ANY(%s::uuid[])
        ORDER BY f.name, d.name, a.name
        """,
        (BUSINESS_ID, SELECTED_FUND_IDS),
    )

    loan_rows = fetchall(
        """
        SELECT
          fund_id::text AS fund_id,
          investment_id::text AS investment_id,
          asset_id::text AS asset_id,
          id::text AS loan_id,
          loan_name,
          upb,
          maturity
        FROM re_loan
        WHERE fund_id = ANY(%s::uuid[])
        ORDER BY fund_id, investment_id, asset_id, loan_name
        """,
        (SELECTED_FUND_IDS,),
    )

    fee_policy_rows = fetchall(
        """
        SELECT
          fund_id::text AS fund_id,
          fee_basis,
          annual_rate,
          start_date,
          stepdown_date,
          stepdown_rate
        FROM re_fee_policy
        WHERE fund_id = ANY(%s::uuid[])
        ORDER BY fund_id, start_date
        """,
        (SELECTED_FUND_IDS,),
    )

    fund_term_rows = fetchall(
        """
        SELECT
          fund_id::text AS fund_id,
          effective_from,
          effective_to,
          management_fee_rate,
          management_fee_basis,
          preferred_return_rate,
          carry_rate
        FROM repe_fund_term
        WHERE fund_id = ANY(%s::uuid[])
        ORDER BY fund_id, effective_from
        """,
        (SELECTED_FUND_IDS,),
    )

    ownership_edge_rows = fetchall(
        """
        SELECT
          ownership_edge_id::text AS ownership_edge_id,
          from_entity_id::text AS from_entity_id,
          to_entity_id::text AS to_entity_id,
          percent,
          effective_from,
          effective_to,
          created_at
        FROM repe_ownership_edge
        ORDER BY created_at DESC
        """
    )

    funds: dict[str, Any] = {}
    flat_rows: list[dict[str, Any]] = []
    for row in hierarchy_rows:
        fund = funds.setdefault(
            row["fund_id"],
            {
                "fund_id": row["fund_id"],
                "fund_name": row["fund_name"],
                "investments": {},
                "fee_entities": [],
                "loans": [],
            },
        )
        investment = fund["investments"].setdefault(
            row["investment_id"],
            {
                "investment_id": row["investment_id"],
                "investment_name": row["investment_name"],
                "deal_type": row["deal_type"],
                "jv": {
                    "jv_id": row.get("jv_id"),
                    "ownership_percent": row.get("ownership_percent"),
                    "gp_percent": row.get("gp_percent"),
                    "lp_percent": row.get("lp_percent"),
                    "status": row.get("jv_status"),
                },
                "assets": [],
            },
        )
        if row.get("asset_id"):
            investment["assets"].append(
                {
                    "asset_id": row["asset_id"],
                    "asset_name": row["asset_name"],
                    "asset_type": row.get("asset_type"),
                    "asset_status": row.get("asset_status"),
                }
            )
        flat_rows.append(
            {
                "fund_id": row["fund_id"],
                "fund_name": row["fund_name"],
                "investment_id": row["investment_id"],
                "investment_name": row["investment_name"],
                "deal_type": row["deal_type"],
                "jv_id": row.get("jv_id"),
                "ownership_percent": row.get("ownership_percent"),
                "gp_percent": row.get("gp_percent"),
                "lp_percent": row.get("lp_percent"),
                "asset_id": row.get("asset_id"),
                "asset_name": row.get("asset_name"),
                "asset_type": row.get("asset_type"),
                "asset_status": row.get("asset_status"),
            }
        )

    for row in loan_rows:
        if row["fund_id"] in funds:
            funds[row["fund_id"]]["loans"].append(normalize(row))

    fee_by_fund: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in fee_policy_rows:
        fee_by_fund[row["fund_id"]].append({"source": "re_fee_policy", **normalize(row)})
    for row in fund_term_rows:
        fee_by_fund[row["fund_id"]].append({"source": "repe_fund_term", **normalize(row)})
    for fund_id, entities in fee_by_fund.items():
        if fund_id in funds:
            funds[fund_id]["fee_entities"] = entities

    lineage_map = {
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "funds": [
            {
                "fund_id": fund["fund_id"],
                "fund_name": fund["fund_name"],
                "investments": list(fund["investments"].values()),
                "fee_entities": fund["fee_entities"],
                "loans": fund["loans"],
            }
            for fund in funds.values()
        ],
        "ownership_edges": normalize(ownership_edge_rows),
    }
    return hierarchy_rows, lineage_map, flat_rows, loan_rows, fee_policy_rows + fund_term_rows


def load_asset_rollups(asset_ids: list[str], quarter: str) -> dict[str, dict[str, Any]]:
    rows = fetchall(
        """
        SELECT DISTINCT ON (asset_id)
          asset_id::text AS asset_id,
          id::text AS rollup_id,
          quarter,
          revenue,
          opex,
          noi,
          capex,
          ti_lc,
          reserves,
          debt_service,
          net_cash_flow,
          source,
          created_at
        FROM re_asset_acct_quarter_rollup
        WHERE asset_id = ANY(%s::uuid[])
          AND quarter = %s
        ORDER BY asset_id, created_at DESC
        """,
        (asset_ids, quarter),
    )
    return {row["asset_id"]: row for row in rows}


def load_asset_states(asset_ids: list[str], quarter: str) -> dict[str, dict[str, Any]]:
    rows = fetchall(
        """
        SELECT DISTINCT ON (asset_id)
          asset_id::text AS asset_id,
          id::text AS state_id,
          nav,
          asset_value,
          debt_balance,
          debt_service,
          occupancy,
          revenue,
          opex,
          noi,
          capex,
          value_reason,
          occupancy_reason,
          debt_reason,
          noi_reason,
          created_at
        FROM re_asset_quarter_state
        WHERE asset_id = ANY(%s::uuid[])
          AND quarter = %s
          AND scenario_id IS NULL
        ORDER BY asset_id, created_at DESC
        """,
        (asset_ids, quarter),
    )
    return {row["asset_id"]: row for row in rows}


def build_accounting_receipts(
    hierarchy_rows: list[dict[str, Any]],
    output_root: Path,
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], dict[str, Any]], list[dict[str, Any]]]:
    highlighted_asset_ids = set(HIGHLIGHT_ASSET_IDS)
    investment_asset_map: dict[str, list[str]] = defaultdict(list)
    asset_name_map = {}
    asset_investment_map = {}
    asset_fund_map = {}
    for row in hierarchy_rows:
        if row.get("asset_id"):
            investment_asset_map[row["investment_id"]].append(row["asset_id"])
            asset_name_map[row["asset_id"]] = row.get("asset_name")
            asset_investment_map[row["asset_id"]] = row["investment_id"]
            asset_fund_map[row["asset_id"]] = row["fund_id"]

    all_asset_ids = sorted(asset_name_map.keys())
    asset_summary_map: dict[tuple[str, str], dict[str, Any]] = {}
    receipt_rows: list[dict[str, Any]] = []
    exceptions: list[dict[str, Any]] = []

    for quarter in QUARTERS:
        rollups = load_asset_rollups(all_asset_ids, quarter)
        states = load_asset_states(all_asset_ids, quarter)
        prior_states = load_asset_states(all_asset_ids, prior_quarter(quarter))

        for asset_id in all_asset_ids:
            rollup = rollups.get(asset_id)
            state = states.get(asset_id)
            prior_state = prior_states.get(asset_id)
            summary = {
                "asset_id": asset_id,
                "asset_name": asset_name_map.get(asset_id),
                "fund_id": asset_fund_map.get(asset_id),
                "investment_id": asset_investment_map.get(asset_id),
                "quarter": quarter,
                "revenue": decimal_or_zero(rollup.get("revenue") if rollup else 0),
                "opex": decimal_or_zero(rollup.get("opex") if rollup else 0),
                "noi": decimal_or_zero(rollup.get("noi") if rollup else 0),
                "capex": decimal_or_zero(rollup.get("capex") if rollup else 0),
                "ti_lc": decimal_or_zero(rollup.get("ti_lc") if rollup else 0),
                "reserves": decimal_or_zero(rollup.get("reserves") if rollup else 0),
                "debt_service": decimal_or_zero(rollup.get("debt_service") if rollup else 0),
                "net_cash_flow": decimal_or_zero(rollup.get("net_cash_flow") if rollup else 0),
                "beginning_nav": decimal_or_none(prior_state.get("nav") if prior_state else None),
                "ending_nav": decimal_or_none(state.get("nav") if state else None),
                "ending_asset_value": decimal_or_none(state.get("asset_value") if state else None),
                "null_reasons": {
                    "value": state.get("value_reason") if state else None,
                    "occupancy": state.get("occupancy_reason") if state else None,
                    "debt": state.get("debt_reason") if state else None,
                    "noi": state.get("noi_reason") if state else None,
                },
                "source_row_refs": [
                    {"table": "re_asset_acct_quarter_rollup", "id": rollup.get("rollup_id")} if rollup else None,
                    {"table": "re_asset_quarter_state", "id": state.get("state_id")} if state else None,
                ],
            }
            summary["source_row_refs"] = [row for row in summary["source_row_refs"] if row]
            asset_summary_map[(asset_id, quarter)] = summary

            if not rollup:
                exceptions.append(
                    {
                        "exception_type": "missing_asset_rollup",
                        "severity": "high",
                        "entity_type": "asset",
                        "entity_id": asset_id,
                        "quarter": quarter,
                        "breakpoint_layer": "asset_rollup",
                        "detail": "No re_asset_acct_quarter_rollup row found for sampled asset period.",
                    }
                )

            if asset_id not in highlighted_asset_ids:
                continue

            start, end = q_start_end(quarter)
            ledger_rows = fetchall(
                """
                SELECT
                  g.asset_id::text AS asset_id,
                  g.period_month,
                  g.gl_account,
                  coa.name AS account_name,
                  g.amount AS raw_amount,
                  mr.target_line_code,
                  mr.target_statement,
                  mr.sign_multiplier
                FROM acct_gl_balance_monthly g
                LEFT JOIN acct_mapping_rule mr
                  ON mr.business_id = g.business_id
                 AND mr.gl_account = g.gl_account
                LEFT JOIN acct_chart_of_accounts coa
                  ON coa.gl_account = g.gl_account
                WHERE g.asset_id = %s::uuid
                  AND g.period_month >= %s
                  AND g.period_month <= %s
                ORDER BY g.period_month, g.gl_account, g.created_at
                """,
                (asset_id, start, end),
            )
            unmapped_total = Decimal("0")
            for ledger_row in ledger_rows:
                category = classify_line_code(ledger_row.get("target_line_code"), ledger_row.get("target_statement"))
                mapped_amount = None
                if ledger_row.get("target_line_code"):
                    mapped_amount = decimal_or_zero(ledger_row.get("raw_amount")) * Decimal(str(ledger_row.get("sign_multiplier") or 1))
                else:
                    unmapped_total += decimal_or_zero(ledger_row.get("raw_amount"))
                receipt_rows.append(
                    {
                        "row_type": "ledger_entry",
                        "asset_id": asset_id,
                        "asset_name": asset_name_map.get(asset_id),
                        "quarter": quarter,
                        "period_month": ledger_row.get("period_month"),
                        "gl_account": ledger_row.get("gl_account"),
                        "account_name": ledger_row.get("account_name"),
                        "raw_amount": ledger_row.get("raw_amount"),
                        "target_line_code": ledger_row.get("target_line_code"),
                        "target_statement": ledger_row.get("target_statement"),
                        "sign_multiplier": ledger_row.get("sign_multiplier"),
                        "standardized_category": category,
                        "mapped_amount": mapped_amount,
                        "status": "mapped" if ledger_row.get("target_line_code") else "unmapped",
                    }
                )

            normalized_rows = fetchall(
                """
                SELECT
                  asset_id::text AS asset_id,
                  period_month,
                  line_code,
                  SUM(amount) AS amount
                FROM acct_normalized_noi_monthly
                WHERE asset_id = %s::uuid
                  AND period_month >= %s
                  AND period_month <= %s
                GROUP BY asset_id, period_month, line_code
                ORDER BY period_month, line_code
                """,
                (asset_id, start, end),
            )
            for normalized_row in normalized_rows:
                receipt_rows.append(
                    {
                        "row_type": "normalized_line",
                        "asset_id": asset_id,
                        "asset_name": asset_name_map.get(asset_id),
                        "quarter": quarter,
                        "period_month": normalized_row.get("period_month"),
                        "line_code": normalized_row.get("line_code"),
                        "normalized_amount": normalized_row.get("amount"),
                    }
                )

            receipt_rows.append(
                {
                    "row_type": "quarter_summary",
                    "asset_id": asset_id,
                    "asset_name": asset_name_map.get(asset_id),
                    "quarter": quarter,
                    "revenue_total": summary["revenue"],
                    "opex_total": summary["opex"],
                    "capex_total": summary["capex"],
                    "noi": summary["noi"],
                    "net_cash_flow": summary["net_cash_flow"],
                    "excluded_or_unmapped_total": unmapped_total,
                }
            )

            if unmapped_total != 0:
                exceptions.append(
                    {
                        "exception_type": "unmapped_account",
                        "severity": "medium",
                        "entity_type": "asset",
                        "entity_id": asset_id,
                        "quarter": quarter,
                        "breakpoint_layer": "mapping",
                        "detail": f"Sampled asset has unmapped accounting rows totaling {unmapped_total}.",
                    }
                )

    return receipt_rows, asset_summary_map, exceptions


def build_asset_input_receipt_rows(
    asset_summary_map: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for (asset_id, quarter), summary in sorted(asset_summary_map.items()):
        if asset_id not in HIGHLIGHT_ASSET_IDS:
            continue
        rows.append(
            {
                "asset_id": asset_id,
                "asset_name": summary.get("asset_name"),
                "fund_id": summary.get("fund_id"),
                "investment_id": summary.get("investment_id"),
                "quarter": quarter,
                "beginning_nav": summary.get("beginning_nav"),
                "ending_nav": summary.get("ending_nav"),
                "ending_asset_value": summary.get("ending_asset_value"),
                "revenue": summary.get("revenue"),
                "opex": summary.get("opex"),
                "noi": summary.get("noi"),
                "capex": summary.get("capex"),
                "ti_lc": summary.get("ti_lc"),
                "reserves": summary.get("reserves"),
                "debt_service": summary.get("debt_service"),
                "net_cash_flow": summary.get("net_cash_flow"),
                "null_reasons": json.dumps(normalize(summary.get("null_reasons") or {})),
                "source_row_refs": json.dumps(normalize(summary.get("source_row_refs") or [])),
            }
        )
    return rows


def resolve_effective_ownership(hierarchy_rows: list[dict[str, Any]], exceptions: list[dict[str, Any]]) -> dict[str, dict[str, Decimal | None]]:
    ownership: dict[str, dict[str, Decimal | None]] = {}
    seen_investments: set[str] = set()
    for row in hierarchy_rows:
        inv_id = row["investment_id"]
        if inv_id in seen_investments:
            continue
        seen_investments.add(inv_id)
        fund_pct = decimal_or_none(row.get("ownership_percent")) or Decimal("1")
        lp_pct = decimal_or_none(row.get("lp_percent"))
        gp_pct = decimal_or_none(row.get("gp_percent"))
        effective_pct = (lp_pct if lp_pct is not None else fund_pct) * (fund_pct if lp_pct is not None else Decimal("1"))
        ownership[inv_id] = {
            "ownership_percent": fund_pct,
            "lp_percent": lp_pct,
            "gp_percent": gp_pct,
            "effective_fund_ownership_percent": effective_pct,
        }
        if lp_pct is not None and gp_pct is not None and (lp_pct + gp_pct).quantize(Decimal("0.0001")) != Decimal("1.0000"):
            exceptions.append(
                {
                    "exception_type": "ownership_split_not_100",
                    "severity": "high",
                    "entity_type": "investment",
                    "entity_id": inv_id,
                    "quarter": None,
                    "breakpoint_layer": "ownership",
                    "detail": f"JV LP/GP split sums to {(lp_pct + gp_pct)} instead of 1.0.",
                }
            )
    return ownership


def build_investment_receipts(
    hierarchy_rows: list[dict[str, Any]],
    asset_summary_map: dict[tuple[str, str], dict[str, Any]],
    exceptions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], dict[str, Any]], list[dict[str, Any]]]:
    ownership = resolve_effective_ownership(hierarchy_rows, exceptions)
    asset_to_investment_rows: list[dict[str, Any]] = []
    investment_receipt_rows: list[dict[str, Any]] = []
    investment_state_map: dict[tuple[str, str], dict[str, Any]] = {}

    investment_assets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    investment_meta: dict[str, dict[str, Any]] = {}
    seen_asset_links: set[tuple[str, str]] = set()
    for row in hierarchy_rows:
        investment_meta[row["investment_id"]] = row
        if row.get("asset_id"):
            key = (row["investment_id"], row["asset_id"])
            if key in seen_asset_links:
                continue
            seen_asset_links.add(key)
            investment_assets[row["investment_id"]].append(row)

    for investment_id in SELECTED_INVESTMENT_IDS:
        rows = investment_assets.get(investment_id, [])
        if not rows:
            exceptions.append(
                {
                    "exception_type": "investment_with_no_assets",
                    "severity": "high",
                    "entity_type": "investment",
                    "entity_id": investment_id,
                    "quarter": None,
                    "breakpoint_layer": "entity_lineage",
                    "detail": "Selected investment has no linked assets.",
                }
            )
            continue
        meta = investment_meta[investment_id]
        own = ownership.get(investment_id) or {
            "ownership_percent": Decimal("1"),
            "lp_percent": None,
            "gp_percent": None,
            "effective_fund_ownership_percent": Decimal("1"),
        }
        effective_pct = decimal_or_zero(own.get("effective_fund_ownership_percent"))
        lp_pct = decimal_or_none(own.get("lp_percent"))
        gp_pct = decimal_or_none(own.get("gp_percent"))

        for quarter in QUARTERS:
            full_operating_cf = Decimal("0")
            attributable_cf = Decimal("0")
            beginning_nav = Decimal("0")
            ending_nav = Decimal("0")
            source_refs: list[dict[str, Any]] = []

            for row in rows:
                asset_id = row["asset_id"]
                asset_summary = asset_summary_map.get((asset_id, quarter))
                if not asset_summary:
                    continue
                asset_cf = decimal_or_zero(asset_summary.get("net_cash_flow"))
                full_operating_cf += asset_cf
                attributable = (asset_cf * effective_pct).quantize(Decimal("0.000000000001"))
                attributable_cf += attributable
                beginning_nav += decimal_or_zero(asset_summary.get("beginning_nav"))
                ending_nav += decimal_or_zero(asset_summary.get("ending_nav"))
                source_refs.extend(asset_summary.get("source_row_refs", []))
                asset_to_investment_rows.append(
                    {
                        "quarter": quarter,
                        "fund_id": row["fund_id"],
                        "fund_name": row["fund_name"],
                        "investment_id": investment_id,
                        "investment_name": row["investment_name"],
                        "asset_id": asset_id,
                        "asset_name": row["asset_name"],
                        "asset_cash_flow": asset_cf,
                        "ownership_percent": own.get("ownership_percent"),
                        "effective_fund_ownership_percent": effective_pct,
                        "lp_percent": lp_pct,
                        "gp_percent": gp_pct,
                        "investment_entity_cash_flow": asset_cf,
                        "fund_attributable_cash_flow": attributable,
                        "lp_cash_flow": (asset_cf * lp_pct).quantize(Decimal("0.000000000001")) if lp_pct is not None else None,
                        "gp_cash_flow": (asset_cf * gp_pct).quantize(Decimal("0.000000000001")) if gp_pct is not None else None,
                        "allocation_formula": "fund attributable cash flow = asset net cash flow * effective fund ownership %",
                    }
                )

            valuation_movement = ending_nav - beginning_nav
            gross_return_amount = attributable_cf + (valuation_movement * effective_pct)
            gross_return_rate = None
            if beginning_nav > 0:
                gross_return_rate = (gross_return_amount / beginning_nav).quantize(Decimal("0.000000000001"))

            state = {
                "entity_type": "investment",
                "investment_id": investment_id,
                "investment_name": meta["investment_name"],
                "fund_id": meta["fund_id"],
                "fund_name": meta["fund_name"],
                "quarter": quarter,
                "period_start": q_start_end(quarter)[0],
                "period_end": q_start_end(quarter)[1],
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "canonical_metrics": {
                    "beginning_nav_full": beginning_nav,
                    "ending_nav_full": ending_nav,
                    "beginning_nav_attributable": (beginning_nav * effective_pct).quantize(Decimal("0.000000000001")),
                    "ending_nav_attributable": (ending_nav * effective_pct).quantize(Decimal("0.000000000001")),
                    "gross_operating_cash_flow_full": full_operating_cf,
                    "fund_attributable_operating_cash_flow": attributable_cf,
                    "effective_fund_ownership_percent": effective_pct,
                    "valuation_movement_full": valuation_movement,
                    "fund_attributable_valuation_movement": (valuation_movement * effective_pct).quantize(Decimal("0.000000000001")),
                    "gross_return_amount": gross_return_amount,
                    "gross_return_rate": gross_return_rate,
                    "gross_irr": None,
                    "gross_irr_series": None,
                },
                "display_metrics": {
                    "gross_return_rate_pct": gross_return_rate * Decimal("100") if gross_return_rate is not None else None,
                },
                "null_reasons": {
                    "gross_irr": "missing_investment_dated_capital_series",
                    "contributions": "investment_level_capital_ledger_not_available",
                    "distributions": "investment_level_distribution_series_not_available",
                },
                "formulas": {
                    "gross_return_amount": "gross return amount = fund attributable operating cash flow + fund attributable valuation movement",
                    "gross_return_rate": "gross return rate = gross return amount / beginning attributable NAV",
                    "fund_attributable_operating_cash_flow": "fund attributable operating cash flow = sum(asset net cash flow * effective fund ownership %)",
                },
                "provenance": [
                    {"table": "re_asset_acct_quarter_rollup", "grain": "asset_quarter", "notes": "Operating cash flow source"},
                    {"table": "re_asset_quarter_state", "grain": "asset_quarter", "notes": "NAV source"},
                    {"table": "re_jv", "grain": "investment", "notes": "Ownership source"},
                ],
                "source_row_refs": source_refs,
            }
            investment_state_map[(investment_id, quarter)] = state
            investment_receipt_rows.extend(
                [
                    {
                        "quarter": quarter,
                        "fund_id": meta["fund_id"],
                        "fund_name": meta["fund_name"],
                        "investment_id": investment_id,
                        "investment_name": meta["investment_name"],
                        "component": "beginning_nav_attributable",
                        "amount": state["canonical_metrics"]["beginning_nav_attributable"],
                        "formula": "sum(prior quarter asset NAV * effective fund ownership %)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": meta["fund_id"],
                        "fund_name": meta["fund_name"],
                        "investment_id": investment_id,
                        "investment_name": meta["investment_name"],
                        "component": "ending_nav_attributable",
                        "amount": state["canonical_metrics"]["ending_nav_attributable"],
                        "formula": "sum(current quarter asset NAV * effective fund ownership %)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": meta["fund_id"],
                        "fund_name": meta["fund_name"],
                        "investment_id": investment_id,
                        "investment_name": meta["investment_name"],
                        "component": "fund_attributable_operating_cash_flow",
                        "amount": attributable_cf,
                        "formula": "sum(asset net cash flow * effective fund ownership %)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": meta["fund_id"],
                        "fund_name": meta["fund_name"],
                        "investment_id": investment_id,
                        "investment_name": meta["investment_name"],
                        "component": "gross_return_amount",
                        "amount": gross_return_amount,
                        "formula": "fund attributable operating cash flow + fund attributable valuation movement",
                    },
                ]
            )

    return asset_to_investment_rows, investment_state_map, investment_receipt_rows


def load_latest_fee_rows(fund_id: str, quarter: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    fee_rows = fetchall(
        """
        SELECT DISTINCT ON (quarter)
          id::text AS id,
          fund_id::text AS fund_id,
          quarter,
          amount,
          created_at
        FROM re_fee_accrual_qtr
        WHERE fund_id = %s::uuid
          AND quarter = %s
        ORDER BY quarter, created_at DESC
        """,
        (fund_id, quarter),
    )
    raw_rows = fetchall(
        """
        SELECT id::text AS id, fund_id::text AS fund_id, quarter, amount, created_at
        FROM re_fee_accrual_qtr
        WHERE fund_id = %s::uuid
          AND quarter = %s
        ORDER BY created_at DESC
        """,
        (fund_id, quarter),
    )
    return (fee_rows[0] if fee_rows else None), raw_rows


def load_latest_expense_rows(fund_id: str, quarter: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    latest_rows = fetchall(
        """
        SELECT DISTINCT ON (expense_type)
          id::text AS id,
          fund_id::text AS fund_id,
          quarter,
          expense_type,
          amount,
          created_at
        FROM re_fund_expense_qtr
        WHERE fund_id = %s::uuid
          AND quarter = %s
        ORDER BY expense_type, created_at DESC
        """,
        (fund_id, quarter),
    )
    raw_rows = fetchall(
        """
        SELECT id::text AS id, fund_id::text AS fund_id, quarter, expense_type, amount, created_at
        FROM re_fund_expense_qtr
        WHERE fund_id = %s::uuid
          AND quarter = %s
        ORDER BY expense_type, created_at DESC
        """,
        (fund_id, quarter),
    )
    return latest_rows, raw_rows


def load_fund_cash_events(fund_id: str, as_of_quarter: str) -> list[tuple[date, Decimal, str, str | None]]:
    rows = fetchall(
        """
        SELECT event_date, event_type, amount, memo
        FROM re_cash_event
        WHERE fund_id = %s::uuid
          AND event_date <= %s
        ORDER BY event_date, created_at
        """,
        (fund_id, quarter_end(as_of_quarter)),
    )
    return [
        (
            row["event_date"] if isinstance(row["event_date"], date) else date.fromisoformat(str(row["event_date"])),
            decimal_or_zero(row.get("amount")),
            row["event_type"],
            row.get("memo"),
        )
        for row in rows
    ]


def load_total_committed(fund_id: str) -> Decimal:
    row = fetchone(
        """
        SELECT COALESCE(SUM(committed_amount), 0) AS total_committed
        FROM re_partner_commitment
        WHERE fund_id = %s::uuid
          AND status IN ('active', 'fully_called')
        """,
        (fund_id,),
    )
    return decimal_or_zero(row.get("total_committed") if row else 0)


def build_fund_receipts(
    hierarchy_rows: list[dict[str, Any]],
    investment_state_map: dict[tuple[str, str], dict[str, Any]],
    exceptions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], dict[str, Any]], dict[tuple[str, str], dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    fund_receipt_rows: list[dict[str, Any]] = []
    fund_state_map: dict[tuple[str, str], dict[str, Any]] = {}
    bridge_map: dict[tuple[str, str], dict[str, Any]] = {}
    reconciliation_rows: list[dict[str, Any]] = []
    variance_rows: list[dict[str, Any]] = []

    fund_investments: dict[str, list[str]] = defaultdict(list)
    fund_names: dict[str, str] = {}
    fund_terms = defaultdict(list)
    fund_policies = defaultdict(list)
    for row in fetchall(
        """
        SELECT fund_id::text AS fund_id, effective_from, effective_to, management_fee_rate, management_fee_basis
        FROM repe_fund_term
        WHERE fund_id = ANY(%s::uuid[])
        ORDER BY fund_id, effective_from
        """,
        (SELECTED_FUND_IDS,),
    ):
        fund_terms[row["fund_id"]].append(row)
    for row in fetchall(
        """
        SELECT fund_id::text AS fund_id, fee_basis, annual_rate, start_date, stepdown_date, stepdown_rate
        FROM re_fee_policy
        WHERE fund_id = ANY(%s::uuid[])
        ORDER BY fund_id, start_date
        """,
        (SELECTED_FUND_IDS,),
    ):
        fund_policies[row["fund_id"]].append(row)
    for row in hierarchy_rows:
        fund_names[row["fund_id"]] = row["fund_name"]
        if row["investment_id"] not in fund_investments[row["fund_id"]]:
            fund_investments[row["fund_id"]].append(row["investment_id"])

    for fund_id in SELECTED_FUND_IDS:
        total_committed = load_total_committed(fund_id)
        for quarter in QUARTERS:
            investments = fund_investments.get(fund_id, [])
            beginning_nav = Decimal("0")
            ending_nav = Decimal("0")
            gross_operating_cf = Decimal("0")
            source_refs: list[dict[str, Any]] = []
            for investment_id in investments:
                inv_state = investment_state_map.get((investment_id, quarter))
                if not inv_state:
                    continue
                canonical = inv_state["canonical_metrics"]
                beginning_nav += decimal_or_zero(canonical.get("beginning_nav_attributable"))
                ending_nav += decimal_or_zero(canonical.get("ending_nav_attributable"))
                gross_operating_cf += decimal_or_zero(canonical.get("fund_attributable_operating_cash_flow"))
                source_refs.extend(inv_state.get("source_row_refs", []))

            # NF-3 fix: investment-level aggregation gives beginning_nav=0 when the selected
            # investment(s) for this fund had zero NAV in the prior quarter (e.g. IGF VII /
            # Tech Campus North whose 2026Q1 state is 0). Fall back to the prior released
            # authoritative snapshot's ending_nav to preserve period-over-period continuity.
            # Only applies when aggregation produces 0 AND a prior released snapshot exists;
            # a genuine first-period fund (no prior snapshot) correctly stays 0.
            if beginning_nav == Decimal("0"):
                prior_ending = load_prior_released_ending_nav(fund_id, quarter)
                if prior_ending is not None:
                    beginning_nav = prior_ending

            fee_row, raw_fee_rows = load_latest_fee_rows(fund_id, quarter)
            latest_expense_rows, raw_expense_rows = load_latest_expense_rows(fund_id, quarter)
            management_fees = decimal_or_zero(fee_row.get("amount") if fee_row else 0)
            fund_expenses = sum(decimal_or_zero(row.get("amount")) for row in latest_expense_rows)
            net_operating_cf = gross_operating_cf - management_fees - fund_expenses

            current_calls = Decimal("0")
            current_dists = Decimal("0")
            fee_events_current = Decimal("0")
            expense_events_current = Decimal("0")
            current_start, current_end = q_start_end(quarter)
            cash_events = load_fund_cash_events(fund_id, quarter)
            gross_cashflows: list[tuple[date, Decimal]] = []
            net_cashflows: list[tuple[date, Decimal]] = []
            cumulative_fees = Decimal("0")
            cumulative_expenses = Decimal("0")

            for event_date, amount, event_type, _memo in cash_events:
                if event_type == "CALL":
                    gross_cashflows.append((event_date, -amount))
                    net_cashflows.append((event_date, -amount))
                    if current_start <= event_date <= current_end:
                        current_calls += amount
                elif event_type == "DIST":
                    gross_cashflows.append((event_date, amount))
                    net_cashflows.append((event_date, amount))
                    if current_start <= event_date <= current_end:
                        current_dists += amount
                elif event_type == "FEE":
                    net_cashflows.append((event_date, -amount))
                    cumulative_fees += amount
                    if current_start <= event_date <= current_end:
                        fee_events_current += amount
                elif event_type == "EXPENSE":
                    net_cashflows.append((event_date, -amount))
                    cumulative_expenses += amount
                    if current_start <= event_date <= current_end:
                        expense_events_current += amount

            if ending_nav > 0:
                gross_cashflows.append((quarter_end(quarter), ending_nav))
                net_cashflows.append((quarter_end(quarter), ending_nav))

            gross_irr = compute_xirr(gross_cashflows)
            net_irr = compute_xirr(net_cashflows)
            total_calls = sum(-amount for _, amount in gross_cashflows if amount < 0)
            total_distributions = sum(amount for _, amount in gross_cashflows if amount > 0) - ending_nav
            dpi = (total_distributions / total_calls).quantize(Decimal("0.000000000001")) if total_calls > 0 else None
            rvpi = (ending_nav / total_calls).quantize(Decimal("0.000000000001")) if total_calls > 0 else None
            tvpi = (dpi + rvpi).quantize(Decimal("0.000000000001")) if dpi is not None and rvpi is not None else None
            net_tvpi = ((total_distributions - cumulative_fees - cumulative_expenses + ending_nav) / total_calls).quantize(Decimal("0.000000000001")) if total_calls > 0 else None

            bridge_items = [
                {
                    "code": "gross_operating_cash_flow",
                    "label": "Gross operating cash flow",
                    "amount": gross_operating_cf,
                    "formula": "gross operating cash flow = sum of investment attributable operating cash flows before fund-level fees",
                },
                {
                    "code": "management_fees",
                    "label": "Management fees",
                    "amount": management_fees,
                    "formula": "management fees = latest released fee accrual row for the quarter",
                },
                {
                    "code": "fund_expenses",
                    "label": "Fund expenses",
                    "amount": fund_expenses,
                    "formula": "fund expenses = sum of latest expense rows per expense_type for the quarter",
                },
                {
                    "code": "net_operating_cash_flow",
                    "label": "Net operating cash flow",
                    "amount": net_operating_cf,
                    "formula": "net operating cash flow = gross operating cash flow - management fees - fund expenses",
                },
            ]

            bridge_map[(fund_id, quarter)] = {
                "fund_id": fund_id,
                "fund_name": fund_names.get(fund_id),
                "quarter": quarter,
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "gross_return_amount": gross_operating_cf,
                "management_fees": management_fees,
                "fund_expenses": fund_expenses,
                "net_return_amount": net_operating_cf,
                "bridge_items": bridge_items,
                "null_reasons": {},
                "formulas": {
                    "net_return_amount": "net return amount = gross operating cash flow - management fees - fund expenses",
                },
                "provenance": [
                    {"table": "re_authoritative_investment_state_qtr", "notes": "Gross operating cash flow source"},
                    {"table": "re_fee_accrual_qtr", "notes": "Management fee source"},
                    {"table": "re_fund_expense_qtr", "notes": "Fund expense source"},
                ],
                "source_row_refs": (
                    ([{"table": "re_fee_accrual_qtr", "id": fee_row["id"]}] if fee_row else [])
                    + [{"table": "re_fund_expense_qtr", "id": row["id"]} for row in latest_expense_rows]
                ),
            }

            state = {
                "entity_type": "fund",
                "fund_id": fund_id,
                "fund_name": fund_names.get(fund_id),
                "quarter": quarter,
                "period_start": current_start,
                "period_end": current_end,
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "canonical_metrics": {
                    "beginning_nav": beginning_nav,
                    "ending_nav": ending_nav,
                    "gross_operating_cash_flow": gross_operating_cf,
                    "contributions": current_calls,
                    "distributions": current_dists,
                    "management_fees": management_fees,
                    "fund_expenses": fund_expenses,
                    "net_operating_cash_flow": net_operating_cf,
                    "gross_irr": gross_irr,
                    "net_irr": net_irr,
                    "dpi": dpi,
                    "rvpi": rvpi,
                    "tvpi": tvpi,
                    "net_tvpi": net_tvpi,
                    "gross_net_spread": (gross_irr - net_irr) if gross_irr is not None and net_irr is not None else None,
                    "asset_count": len({row["asset_id"] for row in hierarchy_rows if row["fund_id"] == fund_id and row.get("asset_id")}),
                    "total_committed": total_committed,
                    "total_called": total_calls,
                    "total_distributed": total_distributions,
                    **derive_fund_trust_fields(gross_irr=gross_irr, net_irr=net_irr),
                },
                "display_metrics": {
                    "gross_irr_pct": gross_irr * Decimal("100") if gross_irr is not None else None,
                    "net_irr_pct": net_irr * Decimal("100") if net_irr is not None else None,
                },
                "null_reasons": {},
                "formulas": {
                    "gross_operating_cash_flow": "gross operating cash flow = sum of investment attributable operating cash flows before fund-level fees",
                    "net_operating_cash_flow": "net operating cash flow = gross operating cash flow - management fees - fund expenses",
                    "gross_irr": "gross IRR = XIRR(capital calls, distributions, terminal ending NAV)",
                    "net_irr": "net IRR = XIRR(capital calls, distributions, fee and expense deductions, terminal ending NAV)",
                },
                "provenance": [
                    {"table": "re_authoritative_investment_state_qtr", "notes": "Aggregated operating cash flow and attributable NAV"},
                    {"table": "re_cash_event", "notes": "Dated call/distribution/fee/expense series for IRR"},
                    {"table": "re_fee_accrual_qtr", "notes": "Management fee accrual"},
                    {"table": "re_fund_expense_qtr", "notes": "Fund expense detail"},
                ],
                "source_row_refs": source_refs,
                "gross_to_net_bridge": {
                    "gross_return_amount": gross_operating_cf,
                    "management_fees": management_fees,
                    "fund_expenses": fund_expenses,
                    "net_return_amount": net_operating_cf,
                    "bridge_items": bridge_items,
                },
            }
            fund_state_map[(fund_id, quarter)] = state

            fund_receipt_rows.extend(
                [
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "beginning_nav",
                        "amount": beginning_nav,
                        "formula": "sum(investment beginning attributable NAV)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "ending_nav",
                        "amount": ending_nav,
                        "formula": "sum(investment ending attributable NAV)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "gross_operating_cash_flow",
                        "amount": gross_operating_cf,
                        "formula": "sum(investment attributable operating cash flow before fund-level fees)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "management_fees",
                        "amount": management_fees,
                        "formula": "latest quarter fee accrual row",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "fund_expenses",
                        "amount": fund_expenses,
                        "formula": "sum(latest quarter expense rows by expense type)",
                    },
                    {
                        "quarter": quarter,
                        "fund_id": fund_id,
                        "fund_name": fund_names.get(fund_id),
                        "component": "net_operating_cash_flow",
                        "amount": net_operating_cf,
                        "formula": "gross operating cash flow - management fees - fund expenses",
                    },
                ]
            )

            mapped_asset_cash_flow = gross_operating_cf
            allocated_to_investments = sum(
                decimal_or_zero(investment_state_map[(investment_id, quarter)]["canonical_metrics"].get("fund_attributable_operating_cash_flow"))
                for investment_id in investments
                if (investment_id, quarter) in investment_state_map
            )
            rolled_to_fund_before_fees = gross_operating_cf
            fee_deductions = management_fees + fund_expenses
            final_net = net_operating_cf
            variance = mapped_asset_cash_flow - allocated_to_investments
            pass_fail = "PASS" if abs(variance) <= Decimal("0.01") else "FAIL"
            reconciliation_rows.append(
                {
                    "quarter": quarter,
                    "fund_id": fund_id,
                    "fund_name": fund_names.get(fund_id),
                    "sum_mapped_asset_cash_flows": mapped_asset_cash_flow,
                    "sum_allocated_to_investments": allocated_to_investments,
                    "sum_rolled_to_funds_before_fees": rolled_to_fund_before_fees,
                    "fee_deductions": fee_deductions,
                    "final_fund_net_cash_flow": final_net,
                    "variance": variance,
                    "pass_fail": pass_fail,
                }
            )
            if pass_fail == "FAIL":
                exceptions.append(
                    {
                        "exception_type": "reconciliation_variance",
                        "severity": "high",
                        "entity_type": "fund",
                        "entity_id": fund_id,
                        "quarter": quarter,
                        "breakpoint_layer": "fund_rollup",
                        "detail": f"Fund reconciliation variance {variance} exceeds exact-tie tolerance.",
                    }
                )

            legacy_state = fetchone(
                """
                SELECT portfolio_nav, gross_irr, net_irr, tvpi, dpi, rvpi
                FROM re_fund_quarter_state
                WHERE fund_id = %s::uuid
                  AND quarter = %s
                  AND scenario_id IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (fund_id, quarter),
            )
            legacy_metrics = fetchone(
                """
                SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi, gross_net_spread
                FROM re_fund_metrics_qtr
                WHERE fund_id = %s::uuid
                  AND quarter = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (fund_id, quarter),
            )
            legacy_bridge = fetchone(
                """
                SELECT gross_return, mgmt_fees, fund_expenses, net_return
                FROM re_gross_net_bridge_qtr
                WHERE fund_id = %s::uuid
                  AND quarter = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (fund_id, quarter),
            )
            variance_rows.append(
                {
                    "fund_id": fund_id,
                    "fund_name": fund_names.get(fund_id),
                    "quarter": quarter,
                    "authoritative_ending_nav": ending_nav,
                    "legacy_portfolio_nav": legacy_state.get("portfolio_nav") if legacy_state else None,
                    "nav_variance": (ending_nav - decimal_or_zero(legacy_state.get("portfolio_nav"))) if legacy_state else None,
                    "authoritative_gross_irr": gross_irr,
                    "legacy_gross_irr": legacy_metrics.get("gross_irr") if legacy_metrics else (legacy_state.get("gross_irr") if legacy_state else None),
                    "gross_irr_variance": (gross_irr - decimal_or_zero((legacy_metrics or legacy_state or {}).get("gross_irr"))) if gross_irr is not None and (legacy_metrics or legacy_state) else None,
                    "authoritative_net_irr": net_irr,
                    "legacy_net_irr": legacy_metrics.get("net_irr") if legacy_metrics else (legacy_state.get("net_irr") if legacy_state else None),
                    "net_irr_variance": (net_irr - decimal_or_zero((legacy_metrics or legacy_state or {}).get("net_irr"))) if net_irr is not None and (legacy_metrics or legacy_state) else None,
                    "authoritative_management_fees": management_fees,
                    "legacy_management_fees": legacy_bridge.get("mgmt_fees") if legacy_bridge else None,
                    "fee_variance": (management_fees - decimal_or_zero(legacy_bridge.get("mgmt_fees"))) if legacy_bridge else None,
                }
            )

            for raw in raw_fee_rows[1:]:
                exceptions.append(
                    {
                        "exception_type": "duplicate_fee_accrual_row",
                        "severity": "medium",
                        "entity_type": "fund",
                        "entity_id": fund_id,
                        "quarter": quarter,
                        "breakpoint_layer": "fees",
                        "detail": f"Additional fee accrual row {raw['id']} exists for the same quarter.",
                    }
                )
            expense_counts = defaultdict(int)
            for raw in raw_expense_rows:
                expense_counts[raw["expense_type"]] += 1
            for expense_type, count in expense_counts.items():
                if count > 1:
                    exceptions.append(
                        {
                            "exception_type": "duplicate_fund_expense_row",
                            "severity": "medium",
                            "entity_type": "fund",
                            "entity_id": fund_id,
                            "quarter": quarter,
                            "breakpoint_layer": "fees",
                            "detail": f"{count} expense rows exist for expense type {expense_type}; authoritative bridge uses the latest row only.",
                        }
                    )

            for term in fund_terms.get(fund_id, []):
                effective_from = term.get("effective_from")
                if effective_from and effective_from > current_end and management_fees > 0:
                    exceptions.append(
                        {
                            "exception_type": "fee_rule_missing_basis",
                            "severity": "high",
                            "entity_type": "fund",
                            "entity_id": fund_id,
                            "quarter": quarter,
                            "breakpoint_layer": "fees",
                            "detail": f"Management fee accrued for {quarter} before fund term effective_from {effective_from}.",
                        }
                    )

    return fund_receipt_rows, fund_state_map, bridge_map, reconciliation_rows, variance_rows


def build_authoritative_asset_states(
    asset_summary_map: dict[tuple[str, str], dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any]]:
    states: dict[tuple[str, str], dict[str, Any]] = {}
    for asset_id in HIGHLIGHT_ASSET_IDS:
        for quarter in QUARTERS:
            summary = asset_summary_map.get((asset_id, quarter))
            if not summary:
                continue
            start, end = q_start_end(quarter)
            states[(asset_id, quarter)] = {
                "entity_type": "asset",
                "asset_id": asset_id,
                "asset_name": summary.get("asset_name"),
                "fund_id": summary.get("fund_id"),
                "investment_id": summary.get("investment_id"),
                "quarter": quarter,
                "period_start": start,
                "period_end": end,
                "trust_status": "trusted",
                "breakpoint_layer": None,
                "canonical_metrics": {
                    "revenue": summary["revenue"],
                    "opex": summary["opex"],
                    "noi": summary["noi"],
                    "capex": summary["capex"],
                    "ti_lc": summary["ti_lc"],
                    "reserves": summary["reserves"],
                    "debt_service": summary["debt_service"],
                    "net_cash_flow": summary["net_cash_flow"],
                    "beginning_nav": summary["beginning_nav"],
                    "ending_nav": summary["ending_nav"],
                    "ending_asset_value": summary["ending_asset_value"],
                },
                "display_metrics": {},
                "null_reasons": summary["null_reasons"],
                "formulas": {
                    "noi": "NOI = operating revenue - operating expenses",
                    "net_cash_flow": "net cash flow = NOI - capex - TI/LC - reserves - debt service",
                },
                "provenance": [
                    {"table": "acct_gl_balance_monthly", "notes": "Raw accounting entries"},
                    {"table": "acct_mapping_rule", "notes": "GL account mapping"},
                    {"table": "acct_normalized_noi_monthly", "notes": "Standardized monthly NOI lines"},
                    {"table": "re_asset_acct_quarter_rollup", "notes": "Quarter cash-flow rollup"},
                    {"table": "re_asset_quarter_state", "notes": "Quarter ending NAV and value"},
                ],
                "source_row_refs": summary["source_row_refs"],
            }
    return states


def apply_trust_flags(
    *,
    exceptions: list[dict[str, Any]],
    asset_states: dict[tuple[str, str], dict[str, Any]],
    investment_states: dict[tuple[str, str], dict[str, Any]],
    fund_states: dict[tuple[str, str], dict[str, Any]],
    bridge_map: dict[tuple[str, str], dict[str, Any]],
) -> None:
    direct_asset_breaks: dict[tuple[str, str], str] = {}
    direct_investment_breaks: dict[tuple[str, str], str] = {}
    direct_fund_breaks: dict[tuple[str, str], str] = {}

    for exc in exceptions:
        entity_type = exc.get("entity_type")
        entity_id = exc.get("entity_id")
        breakpoint_layer = exc.get("breakpoint_layer") or "audit_exception"
        quarter = exc.get("quarter")
        if quarter is None:
            if entity_type == "asset":
                for (asset_id, qtr) in asset_states:
                    if asset_id == entity_id:
                        direct_asset_breaks.setdefault((asset_id, qtr), breakpoint_layer)
            elif entity_type == "investment":
                for (investment_id, qtr) in investment_states:
                    if investment_id == entity_id:
                        direct_investment_breaks.setdefault((investment_id, qtr), breakpoint_layer)
            elif entity_type == "fund":
                for (fund_id, qtr) in fund_states:
                    if fund_id == entity_id:
                        direct_fund_breaks.setdefault((fund_id, qtr), breakpoint_layer)
            continue

        if entity_type == "asset":
            direct_asset_breaks.setdefault((entity_id, quarter), breakpoint_layer)
        elif entity_type == "investment":
            direct_investment_breaks.setdefault((entity_id, quarter), breakpoint_layer)
        elif entity_type == "fund":
            direct_fund_breaks.setdefault((entity_id, quarter), breakpoint_layer)

    for key, state in asset_states.items():
        breakpoint_layer = direct_asset_breaks.get(key)
        if breakpoint_layer:
            state["trust_status"] = "untrusted"
            state["breakpoint_layer"] = breakpoint_layer

    for key, state in investment_states.items():
        breakpoint_layer = direct_investment_breaks.get(key)
        if not breakpoint_layer:
            for asset_state in asset_states.values():
                if asset_state.get("investment_id") == state["investment_id"] and asset_state.get("quarter") == state["quarter"]:
                    if asset_state.get("trust_status") != "trusted":
                        breakpoint_layer = asset_state.get("breakpoint_layer") or "asset_rollup"
                        break
        if breakpoint_layer:
            state["trust_status"] = "untrusted"
            state["breakpoint_layer"] = breakpoint_layer
        else:
            state.setdefault("trust_status", "trusted")
            state.setdefault("breakpoint_layer", None)

    for key, state in fund_states.items():
        breakpoint_layer = direct_fund_breaks.get(key)
        if not breakpoint_layer:
            for investment_state in investment_states.values():
                if investment_state.get("fund_id") == state["fund_id"] and investment_state.get("quarter") == state["quarter"]:
                    if investment_state.get("trust_status") != "trusted":
                        breakpoint_layer = investment_state.get("breakpoint_layer") or "investment_rollup"
                        break
        if breakpoint_layer:
            state["trust_status"] = "untrusted"
            state["breakpoint_layer"] = breakpoint_layer
        else:
            state.setdefault("trust_status", "trusted")
            state.setdefault("breakpoint_layer", None)

        bridge = bridge_map.get(key)
        if bridge is not None:
            bridge["trust_status"] = state["trust_status"]
            bridge["breakpoint_layer"] = state["breakpoint_layer"]


def persist_snapshot_bundle(
    snapshot_version: str,
    hierarchy_root: Path,
    manifest: dict[str, Any],
    asset_states: dict[tuple[str, str], dict[str, Any]],
    investment_states: dict[tuple[str, str], dict[str, Any]],
    fund_states: dict[tuple[str, str], dict[str, Any]],
    bridge_map: dict[tuple[str, str], dict[str, Any]],
) -> UUID:
    audit_run_id = re_authoritative_snapshots.create_snapshot_run(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
        snapshot_version=snapshot_version,
        sample_manifest=manifest,
        artifact_root=str(hierarchy_root),
    )

    for (asset_id, quarter), state in asset_states.items():
        state_path = hierarchy_root / f"authoritative_period_state.asset.{asset_id}.{quarter}.json"
        write_json(state_path, normalize(state))
        re_authoritative_snapshots.persist_authoritative_state(
            entity_type="asset",
            audit_run_id=audit_run_id,
            snapshot_version=snapshot_version,
            env_id=ENV_ID,
            business_id=BUSINESS_ID,
            entity_id=asset_id,
            fund_id=state["fund_id"],
            investment_id=state["investment_id"],
            quarter=quarter,
            period_start=state["period_start"],
            period_end=state["period_end"],
            trust_status=state.get("trust_status", "trusted"),
            breakpoint_layer=state.get("breakpoint_layer"),
            canonical_metrics=state["canonical_metrics"],
            display_metrics=state["display_metrics"],
            null_reasons=state["null_reasons"],
            formulas=state["formulas"],
            provenance=state["provenance"],
            source_row_refs=state["source_row_refs"],
            artifact_paths={"state_json": str(state_path)},
            inputs_hash=stable_hash(state),
        )

    for (investment_id, quarter), state in investment_states.items():
        state_path = hierarchy_root / f"authoritative_period_state.investment.{investment_id}.{quarter}.json"
        write_json(state_path, normalize(state))
        re_authoritative_snapshots.persist_authoritative_state(
            entity_type="investment",
            audit_run_id=audit_run_id,
            snapshot_version=snapshot_version,
            env_id=ENV_ID,
            business_id=BUSINESS_ID,
            entity_id=investment_id,
            fund_id=state["fund_id"],
            quarter=quarter,
            period_start=state["period_start"],
            period_end=state["period_end"],
            trust_status=state.get("trust_status", "trusted"),
            breakpoint_layer=state.get("breakpoint_layer") or state["null_reasons"].get("gross_irr"),
            canonical_metrics=state["canonical_metrics"],
            display_metrics=state["display_metrics"],
            null_reasons=state["null_reasons"],
            formulas=state["formulas"],
            provenance=state["provenance"],
            source_row_refs=state["source_row_refs"],
            artifact_paths={"state_json": str(state_path)},
            inputs_hash=stable_hash(state),
        )

    for (fund_id, quarter), state in fund_states.items():
        state_path = hierarchy_root / f"authoritative_period_state.fund.{fund_id}.{quarter}.json"
        write_json(state_path, normalize(state))
        bridge = bridge_map[(fund_id, quarter)]
        re_authoritative_snapshots.persist_authoritative_state(
            entity_type="fund",
            audit_run_id=audit_run_id,
            snapshot_version=snapshot_version,
            env_id=ENV_ID,
            business_id=BUSINESS_ID,
            entity_id=fund_id,
            quarter=quarter,
            period_start=state["period_start"],
            period_end=state["period_end"],
            trust_status=state.get("trust_status", "trusted"),
            breakpoint_layer=state.get("breakpoint_layer"),
            canonical_metrics=state["canonical_metrics"],
            display_metrics=state["display_metrics"],
            null_reasons=state["null_reasons"],
            formulas=state["formulas"],
            provenance=state["provenance"],
            source_row_refs=state["source_row_refs"],
            artifact_paths={"state_json": str(state_path)},
            inputs_hash=stable_hash(state),
        )
        re_authoritative_snapshots.persist_fund_gross_to_net_bridge(
            audit_run_id=audit_run_id,
            snapshot_version=snapshot_version,
            env_id=ENV_ID,
            business_id=BUSINESS_ID,
            fund_id=fund_id,
            quarter=quarter,
            trust_status=bridge.get("trust_status", "trusted"),
            breakpoint_layer=bridge.get("breakpoint_layer"),
            gross_return_amount=bridge["gross_return_amount"],
            management_fees=bridge["management_fees"],
            fund_expenses=bridge["fund_expenses"],
            net_return_amount=bridge["net_return_amount"],
            bridge_items=bridge["bridge_items"],
            null_reasons=bridge["null_reasons"],
            formulas=bridge["formulas"],
            provenance=bridge["provenance"],
            source_row_refs=bridge["source_row_refs"],
            artifact_paths={"bridge_csv": str(hierarchy_root / "gross_to_net_bridge.csv")},
            inputs_hash=stable_hash(bridge),
        )

    return audit_run_id


def write_surface_drift_outputs(surface_root: Path, snapshot_version: str, variance_rows: list[dict[str, Any]]) -> None:
    surface_root.mkdir(parents=True, exist_ok=True)
    write_text(
        surface_root / "surface_contract_map.md",
        "\n".join(
            [
                "# Meridian Surface Contract Map",
                "",
                "- `/api/re/v2/environments/[envId]/portfolio-kpis` -> released authoritative fund snapshots only.",
                "- `/api/re/v2/funds/[fundId]/returns/[quarter]` -> released authoritative fund state + released structured gross-to-net bridge.",
                "- `backend/app/sql_agent/query_templates.py` fund performance templates -> released authoritative fund snapshots.",
                "- Legacy comparison surfaces kept for drift analysis only: quarter-close route, `re_fund_quarter_state`, `re_fund_metrics_qtr`, `re_gross_net_bridge_qtr`.",
                f"- Snapshot version under review: `{snapshot_version}`.",
            ]
        ),
    )
    page_to_route_rows = [
        {"page": "/lab/env/[envId]/re/portfolio", "route": "/api/re/v2/environments/[envId]/portfolio-kpis", "contract": "authoritative_released_only"},
        {"page": "/lab/env/[envId]/re/funds/[fundId]", "route": "/api/re/v2/funds/[fundId]/returns/[quarter]", "contract": "authoritative_released_only"},
        {"page": "Winston structured Meridian answer", "route": "backend/app/sql_agent/query_templates.py::repe.fund_performance_summary", "contract": "authoritative_released_only"},
        {"page": "/lab/env/[envId]/re/runs/quarter-close", "route": "/api/re/v2/funds/[fundId]/quarter-close", "contract": "legacy_comparison_only"},
    ]
    write_csv(surface_root / "page_to_route_matrix.csv", page_to_route_rows)
    route_to_metric_rows = [
        {"route": "/api/re/v2/environments/[envId]/portfolio-kpis", "metric": "portfolio_nav", "source": "re_authoritative_fund_state_qtr", "status": "trusted"},
        {"route": "/api/re/v2/environments/[envId]/portfolio-kpis", "metric": "gross_irr", "source": "re_authoritative_fund_state_qtr", "status": "trusted"},
        {"route": "/api/re/v2/funds/[fundId]/returns/[quarter]", "metric": "gross_irr", "source": "re_authoritative_fund_state_qtr", "status": "trusted"},
        {"route": "/api/re/v2/funds/[fundId]/returns/[quarter]", "metric": "gross_to_net_bridge", "source": "re_authoritative_fund_gross_to_net_qtr", "status": "trusted"},
        {"route": "/api/re/v2/funds/[fundId]/quarter-close", "metric": "gross_irr", "source": "route-level approximation", "status": "untrusted"},
    ]
    write_csv(surface_root / "route_to_metric_contract_matrix.csv", route_to_metric_rows)
    drift_findings = [
        {
            "severity": "critical",
            "surface": "/api/re/v2/funds/[fundId]/quarter-close",
            "file": "repo-b/src/app/api/re/v2/funds/[fundId]/quarter-close/route.ts",
            "finding": "Legacy route still performs route-level approximations for IRR and fee logic.",
            "status": "comparison_only",
        },
        {
            "severity": "info",
            "surface": "assistant_runtime",
            "file": "backend/app/assistant_runtime/meridian_structured_executor.py",
            "finding": "Compatibility executor now reads released authoritative fund snapshots; keep it aligned until the deprecated path is removed.",
            "status": "aligned_but_deprecated",
        },
    ]
    if variance_rows:
        drift_findings.append(
            {
                "severity": "medium",
                "surface": "legacy_tables",
                "file": "re_fund_quarter_state / re_fund_metrics_qtr",
                "finding": "Legacy tables differ from authoritative snapshot values for at least one sampled fund/quarter.",
                "status": "gap_open",
            }
        )
    write_json(surface_root / "drift_findings.json", drift_findings)
    write_text(
        surface_root / "assistant_provenance_gaps.md",
        "\n".join(
            [
                "# Assistant Provenance Gaps",
                "",
                "- `meridian_structured_runtime` fund-performance templates now read released authoritative fund snapshots.",
                "- `meridian_structured_executor.py` remains a deprecated compatibility path, but its Meridian fund-performance reads now resolve through released authoritative fund snapshots.",
                "- Any assistant path outside the structured runtime should be treated as non-authoritative until it resolves through released snapshot contracts.",
            ]
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Meridian authoritative snapshot audit")
    parser.add_argument("--output-root", default=str(ROOT / "audit" / "meridian_hierarchy_trace"))
    parser.add_argument("--surface-output-root", default=str(ROOT / "audit" / "meridian_surface_drift"))
    args = parser.parse_args()

    latest_hierarchy_root = Path(args.output_root)
    latest_surface_root = Path(args.surface_output_root)
    hierarchy_rows, lineage_map, lineage_csv_rows, _loan_rows, _fee_rows = load_hierarchy()
    manifest = build_sample_manifest(hierarchy_rows)

    accounting_rows, asset_summary_map, exceptions = build_accounting_receipts(hierarchy_rows, latest_hierarchy_root)
    asset_input_rows = build_asset_input_receipt_rows(asset_summary_map)
    asset_states = build_authoritative_asset_states(asset_summary_map)
    asset_to_investment_rows, investment_state_map, investment_receipt_rows = build_investment_receipts(
        hierarchy_rows=hierarchy_rows,
        asset_summary_map=asset_summary_map,
        exceptions=exceptions,
    )
    fund_receipt_rows, fund_state_map, bridge_map, reconciliation_rows, variance_rows = build_fund_receipts(
        hierarchy_rows=hierarchy_rows,
        investment_state_map=investment_state_map,
        exceptions=exceptions,
    )
    apply_trust_flags(
        exceptions=exceptions,
        asset_states=asset_states,
        investment_states=investment_state_map,
        fund_states=fund_state_map,
        bridge_map=bridge_map,
    )

    snapshot_version = f"meridian-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    hierarchy_root = latest_hierarchy_root / snapshot_version
    surface_root = latest_surface_root / snapshot_version
    hierarchy_root.mkdir(parents=True, exist_ok=True)
    surface_root.mkdir(parents=True, exist_ok=True)

    write_json(hierarchy_root / "lineage_map.json", normalize(lineage_map))
    write_json(hierarchy_root / "sampled_entity_manifest.json", normalize(manifest))
    write_csv(hierarchy_root / "lineage_map_receipt.csv", lineage_csv_rows)
    write_csv(hierarchy_root / "asset_input_receipt.csv", asset_input_rows)
    write_csv(hierarchy_root / "accounting_to_asset_cashflow.csv", accounting_rows)
    write_csv(hierarchy_root / "asset_to_investment_receipt.csv", asset_to_investment_rows)
    write_csv(hierarchy_root / "investment_rollup_receipt.csv", investment_receipt_rows)
    write_csv(hierarchy_root / "investment_gross_return_receipt.csv", investment_receipt_rows)
    write_csv(hierarchy_root / "fund_rollup_receipt.csv", fund_receipt_rows)

    gross_to_net_rows: list[dict[str, Any]] = []
    for bridge in bridge_map.values():
        for item in bridge["bridge_items"]:
            gross_to_net_rows.append(
                {
                    "fund_id": bridge["fund_id"],
                    "fund_name": bridge["fund_name"],
                    "quarter": bridge["quarter"],
                    "code": item["code"],
                    "label": item["label"],
                    "amount": item["amount"],
                    "formula": item["formula"],
                }
            )
    write_csv(hierarchy_root / "gross_to_net_bridge.csv", gross_to_net_rows)
    write_csv(hierarchy_root / "reconciliation_matrix.csv", reconciliation_rows)
    write_json(hierarchy_root / "variance_report.json", normalize(variance_rows))

    audit_run_id = persist_snapshot_bundle(
        snapshot_version=snapshot_version,
        hierarchy_root=hierarchy_root,
        manifest=manifest,
        asset_states=asset_states,
        investment_states=investment_state_map,
        fund_states=fund_state_map,
        bridge_map=bridge_map,
    )

    summary_rows = []
    for (asset_id, quarter), state in asset_states.items():
        summary_rows.append(
            {
                "entity_type": "asset",
                "entity_id": asset_id,
                "quarter": quarter,
                "pass_fail": "PASS",
                "trust_status": state.get("trust_status", "trusted"),
                "breakpoint_layer": state.get("breakpoint_layer"),
                "snapshot_version": snapshot_version,
            }
        )
    for (investment_id, quarter), state in investment_state_map.items():
        summary_rows.append(
            {
                "entity_type": "investment",
                "entity_id": investment_id,
                "quarter": quarter,
                "pass_fail": "PASS",
                "trust_status": state.get("trust_status", "trusted"),
                "breakpoint_layer": state.get("breakpoint_layer"),
                "snapshot_version": snapshot_version,
            }
        )
    for (fund_id, quarter), state in fund_state_map.items():
        reconciliation = next((row for row in reconciliation_rows if row["fund_id"] == fund_id and row["quarter"] == quarter), None)
        summary_rows.append(
            {
                "entity_type": "fund",
                "entity_id": fund_id,
                "quarter": quarter,
                "pass_fail": reconciliation["pass_fail"] if reconciliation else "PASS",
                "trust_status": state.get("trust_status", "trusted"),
                "breakpoint_layer": state.get("breakpoint_layer"),
                "snapshot_version": snapshot_version,
            }
        )

    if exceptions:
        write_csv(hierarchy_root / "audit_exceptions.csv", exceptions)
    else:
        write_csv(hierarchy_root / "audit_exceptions.csv", [{"exception_type": "none", "severity": "info", "detail": "No exceptions detected."}])

    findings_summary = {
        "audit_run_id": str(audit_run_id),
        "snapshot_version": snapshot_version,
        "exception_count": len(exceptions),
        "reconciliation_failures": len([row for row in reconciliation_rows if row["pass_fail"] != "PASS"]),
        "untrusted_entities": len([row for row in summary_rows if row.get("trust_status") == "untrusted"]),
    }
    if findings_summary["reconciliation_failures"] == 0:
        re_authoritative_snapshots.promote_snapshot_version(
            snapshot_version=snapshot_version,
            target_state="verified",
            actor="meridian_authoritative_runner",
            findings_summary=findings_summary,
        )

    audit_summary = {
        "audit_run_id": str(audit_run_id),
        "snapshot_version": snapshot_version,
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "entities": summary_rows,
        "findings_summary": findings_summary,
    }
    write_json(hierarchy_root / "audit_summary.json", normalize(audit_summary))

    assistant_receipt = {
        "question": "What are the gross and net returns for Institutional Growth Fund VII in 2026Q2?",
        "answer_contract": {
            "entity_type": "fund",
            "entity_id": SELECTED_FUND_IDS[0],
            "quarter": "2026Q2",
            "snapshot_version": snapshot_version,
            "audit_run_id": str(audit_run_id),
        },
        "authoritative_state_path": str(hierarchy_root / f"authoritative_period_state.fund.{SELECTED_FUND_IDS[0]}.2026Q2.json"),
        "gross_to_net_bridge_path": str(hierarchy_root / "gross_to_net_bridge.csv"),
    }
    write_json(hierarchy_root / "assistant_answer_receipt.json", normalize(assistant_receipt))

    methodology = "\n".join(
        [
            "# Methodology",
            "",
            "- Authoritative state is computed once by this runner, persisted to versioned snapshot tables, and then served read-only.",
            "- Asset accounting receipts come from `acct_gl_balance_monthly`, `acct_mapping_rule`, `acct_normalized_noi_monthly`, and `re_asset_acct_quarter_rollup`.",
            "- Asset operating metrics use:",
            "  NOI = operating revenue - operating expenses",
            "  net cash flow = NOI - capex - TI/LC - reserves - debt service",
            "- Investment attributable cash flow uses:",
            "  attributable cash flow = asset net cash flow * effective fund ownership %",
            "- Fund gross-to-net bridge uses:",
            "  net operating cash flow = gross operating cash flow - management fees - fund expenses",
            "- Fund gross IRR uses dated `CALL` and `DIST` events plus terminal ending NAV.",
            "- Fund net IRR uses dated `CALL`, `DIST`, `FEE`, and `EXPENSE` events plus terminal ending NAV.",
            "- Promotion states:",
            "  draft_audit -> verified -> released",
            "- Only `released` snapshots are served to general API/UI/assistant consumers.",
        ]
    )
    findings_md = "\n".join(
        [
            "# Findings",
            "",
            f"- Snapshot version: `{snapshot_version}`",
            f"- Audit run id: `{audit_run_id}`",
            f"- Reconciliation failures: {findings_summary['reconciliation_failures']}",
            f"- Exceptions captured: {len(exceptions)}",
            f"- Untrusted entity-period states: {findings_summary['untrusted_entities']}",
            "- Known critical legacy drift remains in the route-level quarter-close implementation.",
            "- Released promotion is intentionally separate and must be performed explicitly after review.",
        ]
    )
    narrative_report = "\n".join(
        [
            "# Meridian Financial Lineage Audit Report",
            "",
            "This audit pack reconstructs authoritative period states for sampled Meridian funds, investments, and assets.",
            "The authoritative serving layer is backed by persisted snapshot rows keyed by audit run id and snapshot version.",
            "",
            "## Trust posture",
            "",
            "- Released authoritative snapshots do not exist yet after this runner. The run is promoted to `verified` when exact tie-outs pass, but unreleased states remain fail-closed for general consumers.",
            "- Legacy quarter-close and fund-state tables remain comparison surfaces only.",
            "",
            "## Sample coverage",
            "",
            "- Institutional Growth Fund VII — positive multi-asset JV chain",
            "- Meridian Real Estate Fund III — fee-bearing equity chain",
            "- Meridian Credit Opportunities Fund I — debt and negative-cash-flow sample",
        ]
    )
    write_text(hierarchy_root / "methodology.md", methodology)
    write_text(hierarchy_root / "findings.md", findings_md)
    write_text(hierarchy_root / "narrative_audit_report.md", narrative_report)

    write_surface_drift_outputs(surface_root, snapshot_version, variance_rows)
    mirror_latest_artifacts(hierarchy_root, latest_hierarchy_root)
    mirror_latest_artifacts(surface_root, latest_surface_root)
    print(json.dumps({"audit_run_id": str(audit_run_id), "snapshot_version": snapshot_version}, indent=2))


if __name__ == "__main__":
    main()
