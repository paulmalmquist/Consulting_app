"""Finance service layer: persistence + waterfall run orchestration."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import json
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.finance.waterfall_engine import ENGINE_VERSION, run_waterfall_engine


def _to_str_uuid(value: UUID | str) -> str:
    return str(value)


def list_finance_deals() -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.id,
                   d.name,
                   d.strategy,
                   d.start_date,
                   d.default_scenario_id,
                   d.created_at,
                   f.id AS fund_id,
                   f.name AS fund_name,
                   f.currency
            FROM app.investment_deal d
            JOIN app.investment_fund f ON f.id = d.fund_id
            ORDER BY d.created_at DESC
            """
        )
        return cur.fetchall()


def create_finance_deal(payload: dict[str, Any]) -> dict[str, Any]:
    partners = payload.get("partners") or []
    waterfall = payload.get("waterfall")
    prop = payload.get("property")

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.investment_fund (name, currency)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET currency = EXCLUDED.currency
            RETURNING id
            """,
            (payload["fund_name"], payload.get("currency", "USD")),
        )
        fund_id = cur.fetchone()["id"]

        cur.execute(
            """
            INSERT INTO app.investment_deal (fund_id, name, strategy, start_date)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (
                _to_str_uuid(fund_id),
                payload["deal_name"],
                payload.get("strategy"),
                payload["start_date"],
            ),
        )
        deal_id = cur.fetchone()["id"]

        if prop:
            cur.execute(
                """
                INSERT INTO app.investment_property (
                    deal_id,
                    name,
                    address_line1,
                    address_line2,
                    city,
                    state,
                    postal_code,
                    country,
                    property_type
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (deal_id, name) DO UPDATE SET
                    address_line1 = EXCLUDED.address_line1,
                    address_line2 = EXCLUDED.address_line2,
                    city = EXCLUDED.city,
                    state = EXCLUDED.state,
                    postal_code = EXCLUDED.postal_code,
                    country = EXCLUDED.country,
                    property_type = EXCLUDED.property_type
                """,
                (
                    _to_str_uuid(deal_id),
                    prop.get("name"),
                    prop.get("address_line1"),
                    prop.get("address_line2"),
                    prop.get("city"),
                    prop.get("state"),
                    prop.get("postal_code"),
                    prop.get("country", "US"),
                    prop.get("property_type"),
                ),
            )

        for partner in partners:
            cur.execute(
                """
                INSERT INTO app.partner (name, role, tax_type)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) DO UPDATE
                SET role = EXCLUDED.role,
                    tax_type = COALESCE(EXCLUDED.tax_type, app.partner.tax_type)
                RETURNING id
                """,
                (partner["name"], partner["role"], partner.get("tax_type")),
            )
            partner_id = cur.fetchone()["id"]

            cur.execute(
                """
                INSERT INTO app.deal_partner (
                    deal_id,
                    partner_id,
                    commitment_amount,
                    ownership_pct,
                    has_promote
                )
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (deal_id, partner_id) DO UPDATE
                SET commitment_amount = EXCLUDED.commitment_amount,
                    ownership_pct = EXCLUDED.ownership_pct,
                    has_promote = EXCLUDED.has_promote
                """,
                (
                    _to_str_uuid(deal_id),
                    _to_str_uuid(partner_id),
                    partner.get("commitment_amount", 0),
                    partner.get("ownership_pct", 0),
                    partner.get("has_promote", False),
                ),
            )

        waterfall_id = None
        if waterfall:
            cur.execute(
                """
                INSERT INTO app.waterfall (
                    deal_id,
                    name,
                    distribution_frequency,
                    promote_structure_type
                )
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (
                    _to_str_uuid(deal_id),
                    waterfall.get("name", "Standard JV Waterfall"),
                    waterfall.get("distribution_frequency", "monthly"),
                    waterfall.get("promote_structure_type", "american"),
                ),
            )
            waterfall_id = cur.fetchone()["id"]

            for tier in sorted(waterfall.get("tiers", []), key=lambda t: int(t.get("tier_order", 0))):
                cur.execute(
                    """
                    INSERT INTO app.waterfall_tier (
                        waterfall_id,
                        tier_order,
                        tier_type,
                        hurdle_irr,
                        hurdle_multiple,
                        pref_rate,
                        catch_up_pct,
                        split_lp,
                        split_gp,
                        notes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (waterfall_id, tier_order) DO UPDATE
                    SET tier_type = EXCLUDED.tier_type,
                        hurdle_irr = EXCLUDED.hurdle_irr,
                        hurdle_multiple = EXCLUDED.hurdle_multiple,
                        pref_rate = EXCLUDED.pref_rate,
                        catch_up_pct = EXCLUDED.catch_up_pct,
                        split_lp = EXCLUDED.split_lp,
                        split_gp = EXCLUDED.split_gp,
                        notes = EXCLUDED.notes
                    """,
                    (
                        _to_str_uuid(waterfall_id),
                        tier["tier_order"],
                        tier["tier_type"],
                        tier.get("hurdle_irr"),
                        tier.get("hurdle_multiple"),
                        tier.get("pref_rate"),
                        tier.get("catch_up_pct"),
                        tier.get("split_lp"),
                        tier.get("split_gp"),
                        tier.get("notes"),
                    ),
                )

        default_scenario_id = None
        if payload.get("seed_default_scenario", True):
            cur.execute(
                """
                INSERT INTO app.scenario (deal_id, name, description, as_of_date)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (
                    _to_str_uuid(deal_id),
                    "Base",
                    "Auto-created base scenario",
                    payload["start_date"],
                ),
            )
            default_scenario_id = cur.fetchone()["id"]
            cur.execute(
                "UPDATE app.investment_deal SET default_scenario_id = %s WHERE id = %s",
                (_to_str_uuid(default_scenario_id), _to_str_uuid(deal_id)),
            )

    return {
        "deal_id": deal_id,
        "fund_id": fund_id,
        "waterfall_id": waterfall_id,
        "default_scenario_id": default_scenario_id,
    }


def get_finance_deal(deal_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.id,
                   d.name,
                   d.strategy,
                   d.start_date,
                   d.default_scenario_id,
                   d.created_at,
                   f.id AS fund_id,
                   f.name AS fund_name,
                   f.currency
            FROM app.investment_deal d
            JOIN app.investment_fund f ON f.id = d.fund_id
            WHERE d.id = %s
            """,
            (_to_str_uuid(deal_id),),
        )
        deal = cur.fetchone()
        if not deal:
            return None

        cur.execute(
            """
            SELECT dp.id,
                   dp.deal_id,
                   dp.partner_id,
                   p.name,
                   p.role,
                   p.tax_type,
                   dp.commitment_amount,
                   dp.ownership_pct,
                   dp.has_promote,
                   dp.created_at
            FROM app.deal_partner dp
            JOIN app.partner p ON p.id = dp.partner_id
            WHERE dp.deal_id = %s
            ORDER BY p.role, p.name
            """,
            (_to_str_uuid(deal_id),),
        )
        partners = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM app.investment_property
            WHERE deal_id = %s
            ORDER BY created_at
            """,
            (_to_str_uuid(deal_id),),
        )
        properties = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM app.waterfall
            WHERE deal_id = %s
            ORDER BY created_at
            """,
            (_to_str_uuid(deal_id),),
        )
        waterfalls = cur.fetchall()

        for waterfall in waterfalls:
            cur.execute(
                """
                SELECT *
                FROM app.waterfall_tier
                WHERE waterfall_id = %s
                ORDER BY tier_order
                """,
                (_to_str_uuid(waterfall["id"]),),
            )
            waterfall["tiers"] = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM app.scenario
            WHERE deal_id = %s
            ORDER BY created_at
            """,
            (_to_str_uuid(deal_id),),
        )
        scenarios = cur.fetchall()

        for scenario in scenarios:
            cur.execute(
                """
                SELECT id, scenario_id, key, value_num, value_text, value_json, created_at
                FROM app.scenario_assumption
                WHERE scenario_id = %s
                ORDER BY key
                """,
                (_to_str_uuid(scenario["id"]),),
            )
            scenario["assumptions"] = cur.fetchall()

        return {
            "deal": deal,
            "partners": partners,
            "properties": properties,
            "waterfalls": waterfalls,
            "scenarios": scenarios,
        }


def create_scenario(deal_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.scenario (deal_id, name, description, as_of_date)
            VALUES (%s, %s, %s, %s)
            RETURNING id, deal_id, name, description, as_of_date, created_at
            """,
            (
                _to_str_uuid(deal_id),
                payload["name"],
                payload.get("description"),
                payload["as_of_date"],
            ),
        )
        scenario = cur.fetchone()

        for assumption in payload.get("assumptions", []):
            cur.execute(
                """
                INSERT INTO app.scenario_assumption (
                    scenario_id,
                    key,
                    value_num,
                    value_text,
                    value_json
                )
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (scenario_id, key) DO UPDATE
                SET value_num = EXCLUDED.value_num,
                    value_text = EXCLUDED.value_text,
                    value_json = EXCLUDED.value_json
                """,
                (
                    _to_str_uuid(scenario["id"]),
                    assumption["key"],
                    assumption.get("value_num"),
                    assumption.get("value_text"),
                    json.dumps(assumption.get("value_json")) if assumption.get("value_json") is not None else None,
                ),
            )

    return scenario


def update_scenario(scenario_id: UUID, payload: dict[str, Any]) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, deal_id, name, description, as_of_date, created_at FROM app.scenario WHERE id = %s",
            (_to_str_uuid(scenario_id),),
        )
        current = cur.fetchone()
        if not current:
            return None

        next_name = payload.get("name", current["name"])
        next_description = payload.get("description", current["description"])
        next_as_of = payload.get("as_of_date", current["as_of_date"])

        cur.execute(
            """
            UPDATE app.scenario
            SET name = %s,
                description = %s,
                as_of_date = %s
            WHERE id = %s
            RETURNING id, deal_id, name, description, as_of_date, created_at
            """,
            (next_name, next_description, next_as_of, _to_str_uuid(scenario_id)),
        )
        scenario = cur.fetchone()

        assumptions = payload.get("assumptions", [])
        for assumption in assumptions:
            cur.execute(
                """
                INSERT INTO app.scenario_assumption (
                    scenario_id,
                    key,
                    value_num,
                    value_text,
                    value_json
                )
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (scenario_id, key) DO UPDATE
                SET value_num = EXCLUDED.value_num,
                    value_text = EXCLUDED.value_text,
                    value_json = EXCLUDED.value_json
                """,
                (
                    _to_str_uuid(scenario_id),
                    assumption["key"],
                    assumption.get("value_num"),
                    assumption.get("value_text"),
                    json.dumps(assumption.get("value_json")) if assumption.get("value_json") is not None else None,
                ),
            )

    return scenario


def import_cashflows(deal_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    inserted = 0
    with get_cursor() as cur:
        for event in payload.get("events", []):
            cur.execute(
                """
                INSERT INTO app.cashflow_event (
                    deal_id,
                    property_id,
                    date,
                    event_type,
                    amount,
                    scenario_id,
                    metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    _to_str_uuid(deal_id),
                    _to_str_uuid(event["property_id"]) if event.get("property_id") else None,
                    event["date"],
                    event["event_type"],
                    event["amount"],
                    _to_str_uuid(payload["scenario_id"]),
                    json.dumps(event.get("metadata") or {}),
                ),
            )
            inserted += 1

    return {"inserted": inserted}


def _scenario_assumption_map(cur, scenario_id: UUID) -> tuple[dict[str, Any], date]:
    cur.execute(
        "SELECT as_of_date FROM app.scenario WHERE id = %s",
        (_to_str_uuid(scenario_id),),
    )
    scenario_row = cur.fetchone()
    if not scenario_row:
        raise LookupError("Scenario not found")

    cur.execute(
        """
        SELECT key, value_num, value_text, value_json
        FROM app.scenario_assumption
        WHERE scenario_id = %s
        ORDER BY key
        """,
        (_to_str_uuid(scenario_id),),
    )
    assumption_rows = cur.fetchall()

    assumptions: dict[str, Any] = {"as_of_date": scenario_row["as_of_date"].isoformat()}
    for row in assumption_rows:
        if row["value_num"] is not None:
            assumptions[row["key"]] = row["value_num"]
        elif row["value_text"] is not None:
            assumptions[row["key"]] = row["value_text"]
        else:
            assumptions[row["key"]] = row["value_json"]
    return assumptions, scenario_row["as_of_date"]


def _load_run_inputs(cur, deal_id: UUID, scenario_id: UUID, waterfall_id: UUID) -> dict[str, Any]:
    cur.execute(
        """
        SELECT w.id,
               w.distribution_frequency,
               w.promote_structure_type
        FROM app.waterfall w
        WHERE w.id = %s AND w.deal_id = %s
        """,
        (_to_str_uuid(waterfall_id), _to_str_uuid(deal_id)),
    )
    waterfall = cur.fetchone()
    if not waterfall:
        raise LookupError("Waterfall not found for deal")

    cur.execute(
        """
        SELECT wt.id,
               wt.tier_order,
               wt.tier_type,
               wt.hurdle_irr,
               wt.hurdle_multiple,
               wt.pref_rate,
               wt.catch_up_pct,
               wt.split_lp,
               wt.split_gp,
               wt.notes
        FROM app.waterfall_tier wt
        WHERE wt.waterfall_id = %s
        ORDER BY wt.tier_order
        """,
        (_to_str_uuid(waterfall_id),),
    )
    tiers = cur.fetchall()

    cur.execute(
        """
        SELECT p.id,
               p.name,
               p.role,
               dp.has_promote,
               dp.commitment_amount,
               dp.ownership_pct
        FROM app.deal_partner dp
        JOIN app.partner p ON p.id = dp.partner_id
        WHERE dp.deal_id = %s
        ORDER BY p.name
        """,
        (_to_str_uuid(deal_id),),
    )
    partners = cur.fetchall()

    assumptions, _as_of_date = _scenario_assumption_map(cur, scenario_id)

    cur.execute(
        """
        SELECT date,
               event_type,
               amount,
               metadata
        FROM app.cashflow_event
        WHERE deal_id = %s
          AND scenario_id = %s
        ORDER BY date, event_type, id
        """,
        (_to_str_uuid(deal_id), _to_str_uuid(scenario_id)),
    )
    events = cur.fetchall()

    return {
        "waterfall": waterfall,
        "tiers": tiers,
        "partners": partners,
        "assumptions": assumptions,
        "events": events,
    }


def run_model(deal_id: UUID, scenario_id: UUID, waterfall_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        inputs = _load_run_inputs(cur, deal_id, scenario_id, waterfall_id)

        result = run_waterfall_engine(
            partners=inputs["partners"],
            tiers=inputs["tiers"],
            events=inputs["events"],
            assumptions=inputs["assumptions"],
            distribution_frequency=inputs["waterfall"]["distribution_frequency"],
            promote_structure_type=inputs["waterfall"]["promote_structure_type"],
        )

        cur.execute(
            """
            SELECT id
            FROM app.model_run
            WHERE deal_id = %s
              AND scenario_id = %s
              AND waterfall_id = %s
              AND run_hash = %s
              AND engine_version = %s
              AND status = 'completed'
            ORDER BY completed_at DESC
            LIMIT 1
            """,
            (
                _to_str_uuid(deal_id),
                _to_str_uuid(scenario_id),
                _to_str_uuid(waterfall_id),
                result.run_hash,
                result.engine_version,
            ),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "model_run_id": existing["id"],
                "status": "completed",
                "reused_existing": True,
                "run_hash": result.run_hash,
                "engine_version": result.engine_version,
            }

        cur.execute(
            """
            INSERT INTO app.model_run (
                deal_id,
                scenario_id,
                waterfall_id,
                run_hash,
                engine_version,
                status,
                started_at
            )
            VALUES (%s, %s, %s, %s, %s, 'started', now())
            RETURNING id
            """,
            (
                _to_str_uuid(deal_id),
                _to_str_uuid(scenario_id),
                _to_str_uuid(waterfall_id),
                result.run_hash,
                result.engine_version,
            ),
        )
        model_run_id = cur.fetchone()["id"]

        try:
            for metric_key, value_num in sorted(result.summary_metrics.items(), key=lambda i: i[0]):
                cur.execute(
                    """
                    INSERT INTO app.model_run_output_summary (model_run_id, metric_key, value_num)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (model_run_id, metric_key) DO UPDATE
                    SET value_num = EXCLUDED.value_num
                    """,
                    (
                        _to_str_uuid(model_run_id),
                        metric_key,
                        value_num,
                    ),
                )

            for dist in result.distributions:
                cur.execute(
                    """
                    INSERT INTO app.model_run_distribution (
                        model_run_id,
                        date,
                        tier_id,
                        partner_id,
                        distribution_amount,
                        distribution_type,
                        lineage_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        _to_str_uuid(model_run_id),
                        dist["date"],
                        _to_str_uuid(dist["tier_id"]) if dist["tier_id"] else None,
                        _to_str_uuid(dist["partner_id"]),
                        dist["distribution_amount"],
                        dist["distribution_type"],
                        json.dumps(dist.get("lineage_json") or {}),
                    ),
                )

            for row in result.tier_ledger:
                cur.execute(
                    """
                    INSERT INTO app.model_run_tier_ledger (
                        model_run_id,
                        as_of_date,
                        tier_id,
                        cumulative_lp_distributed,
                        cumulative_gp_distributed,
                        notes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        _to_str_uuid(model_run_id),
                        row.get("as_of_date"),
                        _to_str_uuid(row["tier_id"]),
                        row["cumulative_lp_distributed"],
                        row["cumulative_gp_distributed"],
                        json.dumps(row.get("notes") or {}),
                    ),
                )

            cur.execute(
                """
                UPDATE app.model_run
                SET status = 'completed',
                    completed_at = now(),
                    error_message = NULL
                WHERE id = %s
                """,
                (_to_str_uuid(model_run_id),),
            )

            # Persist run meta alongside summaries in notes metric rows.
            for key, value in sorted(result.summary_meta.items(), key=lambda i: i[0]):
                if isinstance(value, (int, float, Decimal)):
                    val_num = Decimal(str(value))
                elif isinstance(value, str):
                    try:
                        val_num = Decimal(value)
                    except Exception:
                        continue
                else:
                    continue
                cur.execute(
                    """
                    INSERT INTO app.model_run_output_summary (model_run_id, metric_key, value_num)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (model_run_id, metric_key) DO NOTHING
                    """,
                    (_to_str_uuid(model_run_id), f"meta_{key}", val_num),
                )

            return {
                "model_run_id": model_run_id,
                "status": "completed",
                "reused_existing": False,
                "run_hash": result.run_hash,
                "engine_version": result.engine_version,
            }
        except Exception as exc:
            cur.execute(
                """
                UPDATE app.model_run
                SET status = 'failed',
                    completed_at = now(),
                    error_message = %s
                WHERE id = %s
                """,
                (str(exc), _to_str_uuid(model_run_id)),
            )
            raise


def get_run_summary(run_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   deal_id,
                   scenario_id,
                   waterfall_id,
                   run_hash,
                   engine_version,
                   status,
                   started_at,
                   completed_at
            FROM app.model_run
            WHERE id = %s
            """,
            (_to_str_uuid(run_id),),
        )
        run = cur.fetchone()
        if not run:
            return None

        cur.execute(
            """
            SELECT metric_key, value_num
            FROM app.model_run_output_summary
            WHERE model_run_id = %s
            ORDER BY metric_key
            """,
            (_to_str_uuid(run_id),),
        )
        metric_rows = cur.fetchall()

    metrics: dict[str, Decimal] = {}
    meta: dict[str, Any] = {}
    for row in metric_rows:
        key = row["metric_key"]
        if key.startswith("meta_"):
            meta[key.replace("meta_", "", 1)] = row["value_num"]
        else:
            metrics[key] = row["value_num"]

    run["metrics"] = metrics
    run["meta"] = meta
    return run


def get_run_distributions(run_id: UUID, group_by: str) -> dict[str, Any]:
    if group_by not in {"partner", "tier", "date"}:
        raise ValueError("group_by must be one of partner|tier|date")

    with get_cursor() as cur:
        if group_by == "partner":
            cur.execute(
                """
                SELECT p.name AS group_key,
                       SUM(d.distribution_amount) AS amount
                FROM app.model_run_distribution d
                JOIN app.partner p ON p.id = d.partner_id
                WHERE d.model_run_id = %s
                GROUP BY p.name
                ORDER BY p.name
                """,
                (_to_str_uuid(run_id),),
            )
        elif group_by == "tier":
            cur.execute(
                """
                SELECT COALESCE(CONCAT('Tier ', wt.tier_order, ' - ', wt.tier_type), 'Other') AS group_key,
                       SUM(d.distribution_amount) AS amount
                FROM app.model_run_distribution d
                LEFT JOIN app.waterfall_tier wt ON wt.id = d.tier_id
                WHERE d.model_run_id = %s
                GROUP BY COALESCE(wt.tier_order, 999), COALESCE(wt.tier_type, 'other')
                ORDER BY COALESCE(wt.tier_order, 999)
                """,
                (_to_str_uuid(run_id),),
            )
        else:
            cur.execute(
                """
                SELECT d.date::text AS group_key,
                       SUM(d.distribution_amount) AS amount
                FROM app.model_run_distribution d
                WHERE d.model_run_id = %s
                GROUP BY d.date
                ORDER BY d.date
                """,
                (_to_str_uuid(run_id),),
            )
        grouped = cur.fetchall()

        cur.execute(
            """
            SELECT d.date,
                   d.tier_id,
                   d.partner_id,
                   p.name AS partner_name,
                   wt.tier_order,
                   wt.tier_type,
                   d.distribution_amount,
                   d.distribution_type,
                   d.lineage_json
            FROM app.model_run_distribution d
            JOIN app.partner p ON p.id = d.partner_id
            LEFT JOIN app.waterfall_tier wt ON wt.id = d.tier_id
            WHERE d.model_run_id = %s
            ORDER BY d.date, wt.tier_order NULLS LAST, p.name
            """,
            (_to_str_uuid(run_id),),
        )
        details = cur.fetchall()

    return {
        "model_run_id": run_id,
        "group_by": group_by,
        "grouped": grouped,
        "details": details,
    }


def get_run_explain(run_id: UUID, partner_id: UUID, explain_date: date | None) -> dict[str, Any]:
    with get_cursor() as cur:
        if explain_date is None:
            cur.execute(
                """
                SELECT date
                FROM app.model_run_distribution
                WHERE model_run_id = %s
                  AND partner_id = %s
                ORDER BY date DESC
                LIMIT 1
                """,
                (_to_str_uuid(run_id), _to_str_uuid(partner_id)),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("No explainable distributions found for partner")
            explain_date = row["date"]

        cur.execute(
            """
            SELECT d.date,
                   d.tier_id,
                   wt.tier_order,
                   wt.tier_type,
                   d.distribution_amount,
                   d.distribution_type,
                   d.lineage_json
            FROM app.model_run_distribution d
            LEFT JOIN app.waterfall_tier wt ON wt.id = d.tier_id
            WHERE d.model_run_id = %s
              AND d.partner_id = %s
              AND d.date = %s
            ORDER BY wt.tier_order NULLS LAST, d.distribution_type
            """,
            (_to_str_uuid(run_id), _to_str_uuid(partner_id), explain_date),
        )
        rows = cur.fetchall()

    return {
        "model_run_id": run_id,
        "partner_id": partner_id,
        "date": explain_date,
        "rows": rows,
    }
