from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import re_integrity


def _qmoney(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(value).quantize(Decimal("0.000000000001"))


def _business_exists(cur, business_id: UUID) -> bool:
    cur.execute("SELECT 1 FROM business WHERE business_id = %s", (str(business_id),))
    return bool(cur.fetchone())


def list_funds(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM repe_fund
            WHERE business_id = %s
            ORDER BY created_at DESC
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def _default_waterfall_definition(style: str) -> dict:
    return {
        "style": style,
        "tiers": [
            {
                "name": "return_of_capital",
                "priority": 1,
                "rule": "distribute_until_contributed_capital_returned",
            },
            {
                "name": "preferred_return",
                "priority": 2,
                "rule": "distribute_until_pref_hurdle",
            },
            {
                "name": "carried_interest_split",
                "priority": 3,
                "rule": "split_residual",
                "carry_rate": "0.20",
                "gp_share": "0.20",
                "lp_share": "0.80",
            },
        ],
    }


def _seed_fund_defaults(cur, *, business_id: UUID, fund: dict, payload: dict) -> None:
    scenario_name = payload.get("base_scenario_name") or "Base Scenario"
    style = payload.get("initial_waterfall_template") or payload.get("waterfall_style") or "european"
    base_currency = payload.get("base_currency") or "USD"
    cadence = payload.get("quarter_cadence") or "quarterly"

    cur.execute(
        """
        INSERT INTO repe_fund_scenario (fund_id, name, scenario_type, is_base, assumptions_json)
        VALUES (%s, %s, 'base', true, %s::jsonb)
        ON CONFLICT (fund_id, name) DO NOTHING
        """,
        (
            fund["fund_id"],
            scenario_name,
            json.dumps(
                {
                    "base_currency": base_currency,
                    "quarter_cadence": cadence,
                }
            ),
        ),
    )

    cur.execute(
        """
        INSERT INTO repe_fund_waterfall_definition
        (fund_id, name, style, definition_json, is_default)
        VALUES (%s, 'Default Waterfall', %s, %s::jsonb, true)
        ON CONFLICT (fund_id, name) DO NOTHING
        """,
        (fund["fund_id"], style, json.dumps(_default_waterfall_definition(style))),
    )

    gp_name = payload.get("gp_entity_name") or f"{fund['name']} GP"
    cur.execute(
        """
        INSERT INTO repe_entity (business_id, name, entity_type, jurisdiction)
        VALUES (%s, %s, 'gp', %s)
        RETURNING entity_id
        """,
        (
            str(business_id),
            gp_name,
            payload.get("gp_jurisdiction"),
        ),
    )
    gp_entity = cur.fetchone()

    cur.execute(
        """
        INSERT INTO repe_fund_entity_link (fund_id, entity_id, role, ownership_percent)
        VALUES (%s, %s, 'gp', %s)
        ON CONFLICT (fund_id, entity_id, role) DO NOTHING
        """,
        (
            fund["fund_id"],
            gp_entity["entity_id"],
            _qmoney(payload.get("gp_ownership_percent")) or Decimal("1"),
        ),
    )

    lp_rows = payload.get("lp_entities") or []
    for row in lp_rows:
        lp_name = row.get("name")
        if not lp_name:
            continue
        cur.execute(
            """
            INSERT INTO repe_entity (business_id, name, entity_type, jurisdiction)
            VALUES (%s, %s, 'fund_lp', %s)
            RETURNING entity_id
            """,
            (str(business_id), lp_name, row.get("jurisdiction")),
        )
        lp_entity = cur.fetchone()
        cur.execute(
            """
            INSERT INTO repe_fund_entity_link (fund_id, entity_id, role, ownership_percent)
            VALUES (%s, %s, 'lp', %s)
            ON CONFLICT (fund_id, entity_id, role) DO NOTHING
            """,
            (
                fund["fund_id"],
                lp_entity["entity_id"],
                _qmoney(row.get("ownership_percent")),
            ),
        )


def create_fund(*, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        if not _business_exists(cur, business_id):
            raise LookupError("Business not found")

        cur.execute(
            """
            INSERT INTO repe_fund
            (
              business_id, name, vintage_year, fund_type, strategy, sub_strategy,
              target_size, term_years, status, base_currency, inception_date,
              quarter_cadence, target_sectors_json, target_geographies_json,
              target_leverage_min, target_leverage_max,
              target_hold_period_min_years, target_hold_period_max_years, metadata_json
            )
            VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s::jsonb)
            RETURNING *
            """,
            (
                str(business_id),
                payload["name"],
                payload["vintage_year"],
                payload["fund_type"],
                payload["strategy"],
                payload.get("sub_strategy"),
                _qmoney(payload.get("target_size")),
                payload.get("term_years"),
                payload["status"],
                (payload.get("base_currency") or "USD").upper(),
                payload.get("inception_date"),
                payload.get("quarter_cadence") or "quarterly",
                json.dumps(payload.get("target_sectors") or []),
                json.dumps(payload.get("target_geographies") or []),
                _qmoney(payload.get("target_leverage_min")),
                _qmoney(payload.get("target_leverage_max")),
                payload.get("target_hold_period_min_years"),
                payload.get("target_hold_period_max_years"),
                json.dumps(payload.get("metadata_json") or {}),
            ),
        )
        fund = cur.fetchone()

        if any(
            payload.get(key) is not None
            for key in [
                "management_fee_rate",
                "management_fee_basis",
                "preferred_return_rate",
                "carry_rate",
                "waterfall_style",
                "catch_up_style",
            ]
        ):
            cur.execute(
                """
                INSERT INTO repe_fund_term
                (fund_id, effective_from, management_fee_rate, management_fee_basis, preferred_return_rate,
                 carry_rate, waterfall_style, catch_up_style)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    fund["fund_id"],
                    payload.get("terms_effective_from") or date.today(),
                    _qmoney(payload.get("management_fee_rate")),
                    payload.get("management_fee_basis"),
                    _qmoney(payload.get("preferred_return_rate")),
                    _qmoney(payload.get("carry_rate")),
                    payload.get("waterfall_style"),
                    payload.get("catch_up_style"),
                ),
            )

        if payload.get("seed_defaults", True):
            _seed_fund_defaults(cur, business_id=business_id, fund=fund, payload=payload)

        return fund


def get_fund(*, fund_id: UUID) -> tuple[dict, list[dict]]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        fund = cur.fetchone()
        if not fund:
            raise LookupError("Fund not found")

        cur.execute(
            """
            SELECT *
            FROM repe_fund_term
            WHERE fund_id = %s
            ORDER BY effective_from DESC
            """,
            (str(fund_id),),
        )
        terms = cur.fetchall()
        return fund, terms


def list_deals(*, fund_id: UUID) -> list[dict]:
    re_integrity.backfill_missing_investment_assets(fund_id=fund_id)
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        if not cur.fetchone():
            raise LookupError("Fund not found")

        cur.execute(
            """
            SELECT *
            FROM repe_deal
            WHERE fund_id = %s
            ORDER BY created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()


def create_deal(*, fund_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        if not cur.fetchone():
            raise LookupError("Fund not found")

        cur.execute(
            """
            INSERT INTO repe_deal
            (fund_id, name, deal_type, stage, sponsor, target_close_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(fund_id),
                payload["name"],
                payload["deal_type"],
                payload["stage"],
                payload.get("sponsor"),
                payload.get("target_close_date"),
            ),
        )
        row = cur.fetchone()
        re_integrity.ensure_investment_has_asset(
            deal_id=UUID(str(row["deal_id"])),
            deal_name=row["name"],
            asset_type="cmbs" if row["deal_type"] == "debt" else "property",
        )
        return row


def get_deal(*, deal_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM repe_deal WHERE deal_id = %s", (str(deal_id),))
        row = cur.fetchone()
        if not row:
            raise LookupError("Deal not found")
        re_integrity.ensure_investment_has_asset(
            deal_id=UUID(str(row["deal_id"])),
            deal_name=row["name"],
            asset_type="cmbs" if row["deal_type"] == "debt" else "property",
        )
        return row


def list_assets(*, deal_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM repe_deal WHERE deal_id = %s", (str(deal_id),))
        if not cur.fetchone():
            raise LookupError("Deal not found")

        cur.execute(
            """
            SELECT *
            FROM repe_asset
            WHERE deal_id = %s
            ORDER BY created_at DESC
            """,
            (str(deal_id),),
        )
        return cur.fetchall()


def create_asset(*, deal_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM repe_deal WHERE deal_id = %s", (str(deal_id),))
        if not cur.fetchone():
            raise LookupError("Deal not found")

        cur.execute(
            """
            INSERT INTO repe_asset (deal_id, asset_type, name)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (str(deal_id), payload["asset_type"], payload["name"]),
        )
        asset = cur.fetchone()

        if payload["asset_type"] == "property":
            cur.execute(
                """
                INSERT INTO repe_property_asset
                (asset_id, property_type, units, market, current_noi, occupancy)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    asset["asset_id"],
                    payload.get("property_type"),
                    payload.get("units"),
                    payload.get("market"),
                    _qmoney(payload.get("current_noi")),
                    _qmoney(payload.get("occupancy")),
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO repe_cmbs_asset
                (asset_id, tranche, rating, coupon, maturity_date, collateral_summary_json)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    asset["asset_id"],
                    payload.get("tranche"),
                    payload.get("rating"),
                    _qmoney(payload.get("coupon")),
                    payload.get("maturity_date"),
                    payload.get("collateral_summary_json") and json.dumps(payload.get("collateral_summary_json")),
                ),
            )

        return asset


def get_asset(*, asset_id: UUID) -> tuple[dict, dict]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM repe_asset WHERE asset_id = %s", (str(asset_id),))
        asset = cur.fetchone()
        if not asset:
            raise LookupError("Asset not found")

        if asset["asset_type"] == "property":
            cur.execute("SELECT * FROM repe_property_asset WHERE asset_id = %s", (str(asset_id),))
            details = cur.fetchone() or {}
        else:
            cur.execute("SELECT * FROM repe_cmbs_asset WHERE asset_id = %s", (str(asset_id),))
            details = cur.fetchone() or {}
        return asset, details


def create_entity(*, payload: dict) -> dict:
    business_id = payload["business_id"]
    with get_cursor() as cur:
        if not _business_exists(cur, business_id):
            raise LookupError("Business not found")

        cur.execute(
            """
            INSERT INTO repe_entity (business_id, name, entity_type, jurisdiction)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(business_id),
                payload["name"],
                payload["entity_type"],
                payload.get("jurisdiction"),
            ),
        )
        return cur.fetchone()


def create_ownership_edge(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT entity_id FROM repe_entity WHERE entity_id = %s", (str(payload["from_entity_id"]),))
        if not cur.fetchone():
            raise LookupError("From entity not found")

        cur.execute("SELECT entity_id FROM repe_entity WHERE entity_id = %s", (str(payload["to_entity_id"]),))
        if not cur.fetchone():
            raise LookupError("To entity not found")

        cur.execute(
            """
            INSERT INTO repe_ownership_edge
            (from_entity_id, to_entity_id, percent, effective_from, effective_to)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(payload["from_entity_id"]),
                str(payload["to_entity_id"]),
                _qmoney(payload["percent"]),
                payload["effective_from"],
                payload.get("effective_to"),
            ),
        )
        return cur.fetchone()


def get_asset_ownership(*, asset_id: UUID, as_of_date: date | None = None) -> dict:
    target_date = as_of_date or date.today()
    with get_cursor() as cur:
        cur.execute("SELECT * FROM repe_asset WHERE asset_id = %s", (str(asset_id),))
        asset = cur.fetchone()
        if not asset:
            raise LookupError("Asset not found")

        cur.execute(
            """
            SELECT
              l.asset_entity_link_id,
              l.asset_id,
              l.entity_id,
              e.name AS entity_name,
              e.entity_type,
              l.role,
              l.percent,
              l.effective_from,
              l.effective_to
            FROM repe_asset_entity_link l
            JOIN repe_entity e ON e.entity_id = l.entity_id
            WHERE l.asset_id = %s
              AND l.effective_from <= %s
              AND (l.effective_to IS NULL OR l.effective_to >= %s)
            ORDER BY l.effective_from DESC
            """,
            (str(asset_id), target_date, target_date),
        )
        links = cur.fetchall()

        cur.execute(
            """
            SELECT
              oe.ownership_edge_id,
              oe.from_entity_id,
              fe.name AS from_entity_name,
              oe.to_entity_id,
              te.name AS to_entity_name,
              oe.percent,
              oe.effective_from,
              oe.effective_to
            FROM repe_ownership_edge oe
            JOIN repe_entity fe ON fe.entity_id = oe.from_entity_id
            JOIN repe_entity te ON te.entity_id = oe.to_entity_id
            WHERE oe.effective_from <= %s
              AND (oe.effective_to IS NULL OR oe.effective_to >= %s)
              AND (oe.to_entity_id IN (SELECT entity_id FROM repe_asset_entity_link WHERE asset_id = %s)
                   OR oe.from_entity_id IN (SELECT entity_id FROM repe_asset_entity_link WHERE asset_id = %s))
            ORDER BY oe.effective_from DESC
            """,
            (target_date, target_date, str(asset_id), str(asset_id)),
        )
        edges = cur.fetchall()

        return {
            "asset_id": asset_id,
            "as_of_date": target_date,
            "links": links,
            "entity_edges": edges,
        }


def create_asset_entity_link(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM repe_asset WHERE asset_id = %s", (str(payload["asset_id"]),))
        if not cur.fetchone():
            raise LookupError("Asset not found")

        cur.execute("SELECT 1 FROM repe_entity WHERE entity_id = %s", (str(payload["entity_id"]),))
        if not cur.fetchone():
            raise LookupError("Entity not found")

        cur.execute(
            """
            INSERT INTO repe_asset_entity_link
            (asset_id, entity_id, role, percent, effective_from, effective_to)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(payload["asset_id"]),
                str(payload["entity_id"]),
                payload["role"],
                _qmoney(payload.get("percent")),
                payload["effective_from"],
                payload.get("effective_to"),
            ),
        )
        return cur.fetchone()


def seed_demo(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        if not _business_exists(cur, business_id):
            raise LookupError("Business not found")

    fund1 = create_fund(
        business_id=business_id,
        payload={
            "name": "GreenRock Value Add Fund I",
            "vintage_year": 2026,
            "fund_type": "closed_end",
            "strategy": "equity",
            "sub_strategy": "value_add",
            "target_size": Decimal("500000000"),
            "term_years": 10,
            "status": "investing",
            "preferred_return_rate": Decimal("0.08"),
            "carry_rate": Decimal("0.20"),
            "waterfall_style": "european",
            "catch_up_style": "full",
            "terms_effective_from": date(2026, 1, 1),
        },
    )
    fund2 = create_fund(
        business_id=business_id,
        payload={
            "name": "GreenRock Credit Fund I",
            "vintage_year": 2026,
            "fund_type": "closed_end",
            "strategy": "debt",
            "sub_strategy": "cmbs",
            "target_size": Decimal("300000000"),
            "term_years": 7,
            "status": "investing",
            "preferred_return_rate": Decimal("0.12"),
            "carry_rate": Decimal("0.15"),
            "waterfall_style": "american",
            "catch_up_style": "partial",
            "terms_effective_from": date(2026, 1, 1),
        },
    )

    deal1 = create_deal(
        fund_id=fund1["fund_id"],
        payload={
            "name": "Sunset Towers Acquisition",
            "deal_type": "equity",
            "stage": "operating",
            "sponsor": "Sunset Sponsor LLC",
            "target_close_date": date(2026, 6, 30),
        },
    )
    deal2 = create_deal(
        fund_id=fund1["fund_id"],
        payload={
            "name": "Riverpoint Reposition",
            "deal_type": "equity",
            "stage": "underwriting",
            "sponsor": "Riverpoint Capital",
            "target_close_date": date(2026, 9, 30),
        },
    )
    deal3 = create_deal(
        fund_id=fund2["fund_id"],
        payload={
            "name": "CMBS 2026-B",
            "deal_type": "debt",
            "stage": "closing",
            "sponsor": "Atlas Lending",
            "target_close_date": date(2026, 8, 15),
        },
    )

    asset1 = create_asset(
        deal_id=deal1["deal_id"],
        payload={
            "asset_type": "property",
            "name": "Sunset Towers",
            "property_type": "multifamily",
            "units": 280,
            "market": "Phoenix, AZ",
            "current_noi": Decimal("7200000"),
            "occupancy": Decimal("0.94"),
        },
    )
    asset2 = create_asset(
        deal_id=deal2["deal_id"],
        payload={
            "asset_type": "property",
            "name": "Riverpoint Plaza",
            "property_type": "office",
            "units": 0,
            "market": "Dallas, TX",
            "current_noi": Decimal("4100000"),
            "occupancy": Decimal("0.87"),
        },
    )
    asset3 = create_asset(
        deal_id=deal3["deal_id"],
        payload={
            "asset_type": "cmbs",
            "name": "CMBS 2026-B A3",
            "tranche": "A3",
            "rating": "AA",
            "coupon": Decimal("0.058"),
            "maturity_date": date(2036, 12, 1),
            "collateral_summary_json": {"pool_size": 42, "weighted_avg_dscr": 1.32},
        },
    )

    gp = create_entity(
        payload={
            "business_id": business_id,
            "name": "GreenRock GP LLC",
            "entity_type": "gp",
            "jurisdiction": "DE",
        }
    )
    holdco = create_entity(
        payload={
            "business_id": business_id,
            "name": "Sunset HoldCo",
            "entity_type": "holdco",
            "jurisdiction": "DE",
        }
    )
    spv = create_entity(
        payload={
            "business_id": business_id,
            "name": "Sunset SPV 1",
            "entity_type": "spv",
            "jurisdiction": "DE",
        }
    )
    jv = create_entity(
        payload={
            "business_id": business_id,
            "name": "Northlake JV Partner",
            "entity_type": "jv_partner",
            "jurisdiction": "NY",
        }
    )

    create_ownership_edge(
        payload={
            "from_entity_id": gp["entity_id"],
            "to_entity_id": holdco["entity_id"],
            "percent": Decimal("0.60"),
            "effective_from": date(2026, 1, 1),
        }
    )
    create_ownership_edge(
        payload={
            "from_entity_id": jv["entity_id"],
            "to_entity_id": holdco["entity_id"],
            "percent": Decimal("0.40"),
            "effective_from": date(2026, 1, 1),
        }
    )
    create_ownership_edge(
        payload={
            "from_entity_id": holdco["entity_id"],
            "to_entity_id": spv["entity_id"],
            "percent": Decimal("1.00"),
            "effective_from": date(2026, 1, 1),
        }
    )

    create_asset_entity_link(
        payload={
            "asset_id": asset1["asset_id"],
            "entity_id": spv["entity_id"],
            "role": "owner",
            "percent": Decimal("1.00"),
            "effective_from": date(2026, 1, 1),
        }
    )

    # Create JV entities for each deal (RE v2 hierarchy)
    jv_ids = []
    with get_cursor() as cur:
        # Check if re_jv table exists before trying to seed
        cur.execute(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 're_jv'"
        )
        if cur.fetchone():
            for deal, jv_name in [
                (deal1, "Sunset Towers JV"),
                (deal2, "Riverpoint Reposition JV"),
                (deal3, "CMBS 2026-B JV"),
            ]:
                cur.execute(
                    """INSERT INTO re_jv (investment_id, legal_name, ownership_percent, gp_percent, lp_percent, status)
                       VALUES (%s, %s, 1.0, 0.2, 0.8, 'active')
                       RETURNING jv_id""",
                    (str(deal["deal_id"]), jv_name),
                )
                jv_row = cur.fetchone()
                jv_ids.append(str(jv_row["jv_id"]))
                # Link assets that belong to this deal to the JV
                cur.execute(
                    "UPDATE repe_asset SET jv_id = %s WHERE deal_id = %s AND jv_id IS NULL",
                    (str(jv_row["jv_id"]), str(deal["deal_id"])),
                )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_capital_event (fund_id, event_type, amount, event_date, memo)
            VALUES
              (%s, 'capital_call', 12500000, '2026-03-01', 'Initial equity call'),
              (%s, 'expense', 450000, '2026-04-01', 'Acquisition costs'),
              (%s, 'distribution', 1800000, '2026-12-31', 'Operating distribution')
            """,
            (fund1["fund_id"], fund1["fund_id"], fund1["fund_id"]),
        )

    return {
        "business_id": business_id,
        "funds": [fund1["fund_id"], fund2["fund_id"]],
        "deals": [deal1["deal_id"], deal2["deal_id"], deal3["deal_id"]],
        "assets": [asset1["asset_id"], asset2["asset_id"], asset3["asset_id"]],
        "entities": [gp["entity_id"], holdco["entity_id"], spv["entity_id"], jv["entity_id"]],
    }
