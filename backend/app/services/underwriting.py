from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from hashlib import sha256
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.schemas.underwriting import UnderwritingResearchIngestRequest, UnderwritingRunCreateRequest, UnderwritingRunScenariosRequest
from app.services.reporting_common import resolve_tenant_id
from app.underwriting.id import deterministic_run_identity
from app.underwriting.model import run_underwriting_model
from app.underwriting.normalization import NORMALIZATION_VERSION, normalize_research_payload, validate_citation_requirements
from app.underwriting.reports import generate_report_bundle
from app.underwriting.scenarios import merge_scenarios

MODEL_VERSION = "uw_model_v1"
CONTRACT_VERSION = "uw_research_contract_v1"


def _json_default(value: Any):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, UUID):
        return str(value)
    return str(value)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=_json_default)


def _payload_hash(value: Any) -> str:
    return sha256(_json_dumps(value).encode("utf-8")).hexdigest()


def _ensure_underwriting_lineage(cur, tenant_id: UUID) -> tuple[UUID, UUID]:
    cur.execute(
        """
        INSERT INTO dataset (tenant_id, key, label, description)
        VALUES (%s, 'uw_research', 'Underwriting Research Dataset', 'Normalized underwriting research inputs')
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description
        RETURNING dataset_id
        """,
        (str(tenant_id),),
    )
    dataset_id = cur.fetchone()["dataset_id"]

    cur.execute(
        """
        SELECT dataset_version_id
        FROM dataset_version
        WHERE dataset_id = %s
        ORDER BY version DESC
        LIMIT 1
        """,
        (str(dataset_id),),
    )
    dsv = cur.fetchone()
    if dsv:
        dataset_version_id = dsv["dataset_version_id"]
    else:
        checksum = _payload_hash({"dataset": "uw_research", "version": 1})
        cur.execute(
            """
            INSERT INTO dataset_version (dataset_id, version, row_count, checksum)
            VALUES (%s, 1, 0, %s)
            RETURNING dataset_version_id
            """,
            (str(dataset_id), checksum),
        )
        dataset_version_id = cur.fetchone()["dataset_version_id"]

    cur.execute(
        """
        INSERT INTO rule_set (tenant_id, key, label, description)
        VALUES (%s, 'uw_model', 'Underwriting Model Rules', 'Deterministic underwriting model and report rules')
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description
        RETURNING rule_set_id
        """,
        (str(tenant_id),),
    )
    rule_set_id = cur.fetchone()["rule_set_id"]

    cur.execute(
        """
        SELECT rule_version_id
        FROM rule_version
        WHERE rule_set_id = %s
        ORDER BY version DESC
        LIMIT 1
        """,
        (str(rule_set_id),),
    )
    rv = cur.fetchone()
    if rv:
        rule_version_id = rv["rule_version_id"]
    else:
        definition_json = {
            "model_version": MODEL_VERSION,
            "normalization_version": NORMALIZATION_VERSION,
            "contract_version": CONTRACT_VERSION,
        }
        checksum = _payload_hash(definition_json)
        cur.execute(
            """
            INSERT INTO rule_version (rule_set_id, version, definition_json, checksum)
            VALUES (%s, 1, %s::jsonb, %s)
            RETURNING rule_version_id
            """,
            (str(rule_set_id), _json_dumps(definition_json), checksum),
        )
        rule_version_id = cur.fetchone()["rule_version_id"]

    return dataset_version_id, rule_version_id


def _insert_audit_event(cur, *, run_row: dict[str, Any], event_type: str, event_payload: dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO uw_audit_event (tenant_id, business_id, run_id, event_type, event_payload_json)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(run_row["tenant_id"]),
            str(run_row["business_id"]),
            str(run_row["run_id"]),
            event_type,
            _json_dumps(event_payload),
        ),
    )


def _next_input_snapshot_version(cur, *, run_id: UUID, snapshot_type: str) -> int:
    cur.execute(
        """
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM uw_input_snapshot
        WHERE run_id = %s AND snapshot_type = %s
        """,
        (str(run_id), snapshot_type),
    )
    return int(cur.fetchone()["next_version"])


def _next_output_snapshot_version(cur, *, run_id: UUID, scenario_id: UUID, snapshot_type: str) -> int:
    cur.execute(
        """
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM uw_output_snapshot
        WHERE run_id = %s AND scenario_id = %s AND snapshot_type = %s
        """,
        (str(run_id), str(scenario_id), snapshot_type),
    )
    return int(cur.fetchone()["next_version"])


def _typed_value_columns(value_kind: str, value: Any) -> dict[str, Any]:
    cols = {
        "value_decimal": None,
        "value_int": None,
        "value_text": None,
        "value_date": None,
        "value_bool": None,
        "value_json": None,
    }
    if value_kind == "decimal":
        cols["value_decimal"] = float(value)
    elif value_kind == "integer":
        cols["value_int"] = int(value)
    elif value_kind == "text":
        cols["value_text"] = str(value)
    elif value_kind == "date":
        cols["value_date"] = value
    elif value_kind == "bool":
        cols["value_bool"] = bool(value)
    else:
        cols["value_json"] = value
    return cols


def _coerce_assumption_scalar(value: Any) -> Any:
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value


def get_research_contract_schema() -> dict[str, Any]:
    return UnderwritingResearchIngestRequest.model_json_schema()


def create_run(*, req: UnderwritingRunCreateRequest) -> dict[str, Any]:
    identity_payload = {
        "business_id": str(req.business_id),
        "env_id": str(req.env_id) if req.env_id else None,
        "property_name": req.property_name,
        "property_type": req.property_type.value,
        "address_line1": req.address_line1,
        "address_line2": req.address_line2,
        "city": req.city,
        "state_province": req.state_province,
        "postal_code": req.postal_code,
        "country": req.country,
        "submarket": req.submarket,
        "gross_area_sf": req.gross_area_sf,
        "unit_count": req.unit_count,
        "occupancy_pct": req.occupancy_pct,
        "in_place_noi_cents": req.in_place_noi_cents,
        "purchase_price_cents": req.purchase_price_cents,
        "property_inputs_json": req.property_inputs_json,
        "contract_version": req.contract_version,
    }
    run_id, input_hash = deterministic_run_identity(identity_payload)

    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, req.business_id)

        cur.execute("SELECT * FROM uw_run WHERE run_id = %s", (str(run_id),))
        existing = cur.fetchone()
        if existing:
            return existing

        dataset_version_id, rule_version_id = _ensure_underwriting_lineage(cur, tenant_id)

        cur.execute(
            """
            INSERT INTO run (run_id, tenant_id, business_id, dataset_version_id, rule_version_id, status, started_at)
            VALUES (%s, %s, %s, %s, %s, 'pending', now())
            ON CONFLICT (run_id) DO NOTHING
            """,
            (
                str(run_id),
                str(tenant_id),
                str(req.business_id),
                str(dataset_version_id),
                str(rule_version_id),
            ),
        )

        cur.execute("SELECT department_id FROM app.departments WHERE key = 'finance'")
        dept = cur.fetchone()
        finance_dept_id = dept["department_id"] if dept else None

        cur.execute(
            """
            SELECT c.capability_id
            FROM app.capabilities c
            JOIN app.departments d ON d.department_id = c.department_id
            WHERE d.key = 'finance' AND c.key = 'finance_history'
            """
        )
        cap = cur.fetchone()
        finance_cap_id = cap["capability_id"] if cap else None

        cur.execute(
            """
            INSERT INTO app.executions (business_id, department_id, capability_id, status, inputs_json, outputs_json)
            VALUES (%s, %s, %s, 'queued', %s::jsonb, %s::jsonb)
            RETURNING execution_id
            """,
            (
                str(req.business_id),
                str(finance_dept_id) if finance_dept_id else None,
                str(finance_cap_id) if finance_cap_id else None,
                _json_dumps(
                    {
                        "run_id": str(run_id),
                        "pipeline": "underwriting",
                        "property_name": req.property_name,
                        "property_type": req.property_type.value,
                    }
                ),
                _json_dumps({"message": "Run created and queued for research ingest"}),
            ),
        )
        execution_id = cur.fetchone()["execution_id"]

        cur.execute(
            """
            INSERT INTO uw_run (
              run_id, tenant_id, business_id, env_id, execution_id,
              property_name, property_type,
              address_line1, address_line2, city, state_province, postal_code, country, submarket,
              gross_area_sf, unit_count, occupancy_pct, in_place_noi_cents, purchase_price_cents,
              property_inputs_json, status,
              model_version, normalization_version, contract_version, input_hash,
              dataset_version_id, rule_version_id
            ) VALUES (
              %s, %s, %s, %s, %s,
              %s, %s,
              %s, %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              %s::jsonb, 'created',
              %s, %s, %s, %s,
              %s, %s
            )
            RETURNING *
            """,
            (
                str(run_id),
                str(tenant_id),
                str(req.business_id),
                str(req.env_id) if req.env_id else None,
                str(execution_id),
                req.property_name,
                req.property_type.value,
                req.address_line1,
                req.address_line2,
                req.city,
                req.state_province,
                req.postal_code,
                req.country,
                req.submarket,
                req.gross_area_sf,
                req.unit_count,
                req.occupancy_pct,
                req.in_place_noi_cents,
                req.purchase_price_cents,
                _json_dumps(req.property_inputs_json),
                MODEL_VERSION,
                NORMALIZATION_VERSION,
                req.contract_version,
                input_hash,
                str(dataset_version_id),
                str(rule_version_id),
            ),
        )
        run_row = cur.fetchone()

        _insert_audit_event(
            cur,
            run_row=run_row,
            event_type="run.created",
            event_payload={
                "input_hash": input_hash,
                "execution_id": str(execution_id),
                "contract_version": req.contract_version,
            },
        )

        return run_row


def list_runs(*, business_id: UUID, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        if status:
            cur.execute(
                """
                SELECT *
                FROM uw_run
                WHERE business_id = %s AND status = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (str(business_id), status, limit),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM uw_run
                WHERE business_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (str(business_id), limit),
            )
        return cur.fetchall()


def get_run(*, run_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM uw_run WHERE run_id = %s", (str(run_id),))
        return cur.fetchone()


def ingest_research(*, run_id: UUID, req: UnderwritingResearchIngestRequest) -> dict[str, Any]:
    payload = req.model_dump(mode="python")
    validate_citation_requirements(payload)
    normalized = normalize_research_payload(payload)

    with get_cursor() as cur:
        cur.execute("SELECT * FROM uw_run WHERE run_id = %s", (str(run_id),))
        run_row = cur.fetchone()
        if not run_row:
            raise LookupError("Underwriting run not found")

        source_tables = [
            "uw_research_source",
            "uw_research_datum",
            "uw_comp_sale",
            "uw_comp_lease",
            "uw_market_snapshot",
            "uw_assumption",
        ]
        for table_name in source_tables:
            cur.execute(f"DELETE FROM {table_name} WHERE run_id = %s", (str(run_id),))

        source_id_by_citation: dict[str, UUID] = {}
        for src in normalized["sources"]:
            cur.execute(
                """
                INSERT INTO uw_research_source (
                  tenant_id, business_id, run_id, citation_key,
                  url, title, publisher, date_accessed,
                  raw_text_excerpt, excerpt_hash, raw_payload_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING research_source_id
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    src["citation_key"],
                    src["url"],
                    src.get("title"),
                    src.get("publisher"),
                    src["date_accessed"],
                    src.get("raw_text_excerpt"),
                    src["excerpt_hash"],
                    _json_dumps(src.get("raw_payload") or {}),
                ),
            )
            source_id_by_citation[src["citation_key"]] = cur.fetchone()["research_source_id"]

        for datum in normalized["extracted_datapoints"]:
            typed = _typed_value_columns(datum["value_kind"], datum["value"])
            source_id = source_id_by_citation.get(datum.get("citation_key") or "")
            cur.execute(
                """
                INSERT INTO uw_research_datum (
                  tenant_id, business_id, run_id, source_id, citation_key,
                  datum_key, fact_class, value_kind,
                  value_decimal, value_int, value_text, value_date, value_bool, value_json,
                  unit, confidence, validation_warnings_json, is_outlier
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s,
                  %s, %s, %s, %s, %s, %s::jsonb,
                  %s, %s, %s::jsonb, %s
                )
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(source_id) if source_id else None,
                    datum.get("citation_key"),
                    datum["datum_key"],
                    datum["fact_class"],
                    datum["value_kind"],
                    typed["value_decimal"],
                    typed["value_int"],
                    typed["value_text"],
                    typed["value_date"],
                    typed["value_bool"],
                    _json_dumps(typed["value_json"]),
                    datum.get("unit"),
                    datum.get("confidence"),
                    _json_dumps(datum.get("warnings") or []),
                    False,
                ),
            )

        for comp in normalized["sale_comps"]:
            source_id = source_id_by_citation.get(comp["citation_key"])
            price_per_sf = None
            if comp.get("size_sf") and float(comp["size_sf"]) > 0:
                price_per_sf = int(round(comp["sale_price_cents"] / float(comp["size_sf"])))
            cur.execute(
                """
                INSERT INTO uw_comp_sale (
                  tenant_id, business_id, run_id, source_id, citation_key,
                  address, submarket, close_date,
                  sale_price_cents, cap_rate, noi_cents, size_sf, price_per_sf_cents,
                  confidence, dedupe_key, is_outlier, validation_warnings_json
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  %s, %s, %s, %s::jsonb
                )
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(source_id) if source_id else None,
                    comp["citation_key"],
                    comp["address"],
                    comp.get("submarket"),
                    comp.get("close_date"),
                    comp["sale_price_cents"],
                    comp.get("cap_rate"),
                    comp.get("noi_cents"),
                    comp.get("size_sf"),
                    price_per_sf,
                    comp.get("confidence"),
                    comp["dedupe_key"],
                    comp.get("is_outlier") or False,
                    _json_dumps(comp.get("warnings") or []),
                ),
            )

        for comp in normalized["lease_comps"]:
            source_id = source_id_by_citation.get(comp["citation_key"])
            cur.execute(
                """
                INSERT INTO uw_comp_lease (
                  tenant_id, business_id, run_id, source_id, citation_key,
                  address, submarket, lease_date,
                  rent_psf_cents, term_months, size_sf, concessions_cents,
                  confidence, dedupe_key, is_outlier, validation_warnings_json
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s, %s::jsonb
                )
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(source_id) if source_id else None,
                    comp["citation_key"],
                    comp["address"],
                    comp.get("submarket"),
                    comp.get("lease_date"),
                    comp["rent_psf_cents"],
                    comp.get("term_months"),
                    comp.get("size_sf"),
                    comp.get("concessions_cents"),
                    comp.get("confidence"),
                    comp["dedupe_key"],
                    comp.get("is_outlier") or False,
                    _json_dumps(comp.get("warnings") or []),
                ),
            )

        for metric in normalized["market_snapshot"]:
            source_id = source_id_by_citation.get(metric["citation_key"])
            cur.execute(
                """
                INSERT INTO uw_market_snapshot (
                  tenant_id, business_id, run_id, source_id, citation_key,
                  metric_key, metric_date, metric_grain, metric_value_decimal,
                  unit, confidence, validation_warnings_json
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s::jsonb
                )
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(source_id) if source_id else None,
                    metric["citation_key"],
                    metric["metric_key"],
                    metric.get("metric_date"),
                    metric.get("metric_grain") or "point",
                    metric["metric_value"],
                    metric["unit"],
                    metric.get("confidence"),
                    _json_dumps(metric.get("warnings") or []),
                ),
            )

        assumption_count = 0
        for item in normalized.get("assumption_suggestions", []):
            cur.execute(
                """
                INSERT INTO uw_assumption (
                  tenant_id, business_id, run_id,
                  assumption_key, value_json, rationale,
                  assumption_origin, assumed_by
                ) VALUES (%s, %s, %s, %s, %s::jsonb, %s, 'research_suggestion', 'research')
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    item["assumption_key"],
                    _json_dumps(item.get("value")),
                    item.get("rationale"),
                ),
            )
            assumption_count += 1

        for idx, unknown in enumerate(normalized.get("unknowns") or [], start=1):
            cur.execute(
                """
                INSERT INTO uw_assumption (
                  tenant_id, business_id, run_id,
                  assumption_key, value_json, rationale,
                  assumption_origin, assumed_by
                ) VALUES (%s, %s, %s, %s, %s::jsonb, %s, 'system', 'system')
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    f"unknown_{idx}",
                    _json_dumps({"text": unknown}),
                    "Unknown value captured during research ingestion",
                ),
            )
            assumption_count += 1

        raw_snapshot_version = _next_input_snapshot_version(cur, run_id=run_id, snapshot_type="research_raw")
        cur.execute(
            """
            INSERT INTO uw_input_snapshot (
              tenant_id, business_id, run_id, snapshot_type, version, payload_json, payload_hash
            ) VALUES (%s, %s, %s, 'research_raw', %s, %s::jsonb, %s)
            """,
            (
                str(run_row["tenant_id"]),
                str(run_row["business_id"]),
                str(run_id),
                raw_snapshot_version,
                _json_dumps(payload),
                _payload_hash(payload),
            ),
        )

        normalized_snapshot_version = _next_input_snapshot_version(
            cur,
            run_id=run_id,
            snapshot_type="research_normalized",
        )
        cur.execute(
            """
            INSERT INTO uw_input_snapshot (
              tenant_id, business_id, run_id, snapshot_type, version, payload_json, payload_hash
            ) VALUES (%s, %s, %s, 'research_normalized', %s, %s::jsonb, %s)
            """,
            (
                str(run_row["tenant_id"]),
                str(run_row["business_id"]),
                str(run_id),
                normalized_snapshot_version,
                _json_dumps(normalized),
                _payload_hash(normalized),
            ),
        )

        new_research_version = int(run_row["research_version"]) + 1
        new_normalized_version = int(run_row["normalized_version"]) + 1

        cur.execute(
            """
            UPDATE uw_run
            SET status = 'research_ingested',
                research_version = %s,
                normalized_version = %s,
                normalization_version = %s,
                contract_version = %s,
                error_message = NULL,
                updated_at = now()
            WHERE run_id = %s
            RETURNING *
            """,
            (
                new_research_version,
                new_normalized_version,
                NORMALIZATION_VERSION,
                normalized.get("contract_version") or CONTRACT_VERSION,
                str(run_id),
            ),
        )
        updated_run = cur.fetchone()

        cur.execute(
            """
            UPDATE run
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                error_message = NULL
            WHERE run_id = %s
            """,
            (str(run_id),),
        )

        if updated_run.get("execution_id"):
            cur.execute(
                """
                UPDATE app.executions
                SET status = 'running',
                    outputs_json = %s::jsonb,
                    updated_at = now()
                WHERE execution_id = %s
                """,
                (
                    _json_dumps(
                        {
                            "message": "Research ingested",
                            "source_count": normalized["stats"]["source_count"],
                            "warning_count": len(normalized.get("warnings") or []),
                        }
                    ),
                    str(updated_run["execution_id"]),
                ),
            )

        _insert_audit_event(
            cur,
            run_row=updated_run,
            event_type="research.ingested",
            event_payload={
                "source_count": normalized["stats"]["source_count"],
                "datum_count": normalized["stats"]["datum_count"],
                "sale_comp_count": normalized["stats"]["sale_comp_count"],
                "lease_comp_count": normalized["stats"]["lease_comp_count"],
                "market_metric_count": normalized["stats"]["market_metric_count"],
                "warnings": normalized.get("warnings") or [],
            },
        )

        return {
            "run_id": run_id,
            "research_version": new_research_version,
            "normalized_version": new_normalized_version,
            "source_count": normalized["stats"]["source_count"],
            "datum_count": normalized["stats"]["datum_count"],
            "sale_comp_count": normalized["stats"]["sale_comp_count"],
            "lease_comp_count": normalized["stats"]["lease_comp_count"],
            "market_metric_count": normalized["stats"]["market_metric_count"],
            "assumption_count": assumption_count,
            "warnings": normalized.get("warnings") or [],
        }


def _datum_numeric_value(row: dict[str, Any]) -> float | None:
    if row.get("value_int") is not None:
        return float(row["value_int"])
    if row.get("value_decimal") is not None:
        return float(row["value_decimal"])
    return None


def _default_assumptions(
    *,
    run_row: dict[str, Any],
    market_snapshot: dict[str, float],
    assumption_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    occupancy_pct = float(run_row.get("occupancy_pct") or 0.94)
    vacancy_default = max(0.0, min(0.95, 1.0 - occupancy_pct))
    base = {
        "rent_growth_pct": 0.03,
        "vacancy_pct": vacancy_default,
        "entry_cap_pct": float(market_snapshot.get("cap_rate") or 0.055),
        "exit_cap_pct": float(market_snapshot.get("exit_cap_rate") or market_snapshot.get("cap_rate") or 0.06),
        "expense_growth_pct": float(market_snapshot.get("expense_growth_pct") or 0.025),
        "opex_ratio": float(market_snapshot.get("opex_ratio") or 0.38),
        "ti_lc_per_sf_cents": 1500.0,
        "capex_reserve_per_sf_cents": 300.0,
        "debt_rate_pct": float(market_snapshot.get("debt_rate_pct") or 0.06),
        "ltv": 0.65,
        "amort_years": 30,
        "io_months": 24,
        "sale_cost_pct": 0.02,
        "discount_rate_pct": 0.10,
        "hold_years": 10,
    }

    if market_snapshot.get("rent_growth_pct") is not None:
        base["rent_growth_pct"] = float(market_snapshot["rent_growth_pct"])
    if market_snapshot.get("vacancy_rate") is not None:
        base["vacancy_pct"] = float(market_snapshot["vacancy_rate"])

    for row in assumption_rows:
        key = row["assumption_key"]
        value = _coerce_assumption_scalar(row.get("value_json"))
        if key in {"amort_years", "io_months", "hold_years"}:
            try:
                base[key] = int(value)
            except Exception:
                continue
            continue

        if isinstance(value, (int, float)):
            base[key] = float(value)
            continue

        if isinstance(value, str):
            try:
                base[key] = float(value)
            except ValueError:
                continue

    base["vacancy_pct"] = max(0.0, min(0.95, float(base["vacancy_pct"])))
    base["entry_cap_pct"] = max(0.01, min(0.20, float(base["entry_cap_pct"])))
    base["exit_cap_pct"] = max(0.01, min(0.20, float(base["exit_cap_pct"])))
    return base


def _build_property_inputs(run_row: dict[str, Any], datum_rows: list[dict[str, Any]]) -> dict[str, Any]:
    inputs = {
        "property_name": run_row.get("property_name"),
        "property_type": run_row.get("property_type"),
        "gross_area_sf": float(run_row.get("gross_area_sf") or 0),
        "unit_count": int(run_row.get("unit_count") or 0),
        "occupancy_pct": float(run_row.get("occupancy_pct") or 0),
        "in_place_noi_cents": int(run_row.get("in_place_noi_cents") or 0),
        "purchase_price_cents": int(run_row.get("purchase_price_cents") or 0),
    }

    key_map = {
        "in_place_noi_cents": {"in_place_noi", "in_place_noi_cents", "noi", "trailing_12m_noi"},
        "purchase_price_cents": {"purchase_price", "purchase_price_cents", "acquisition_price"},
        "gross_area_sf": {"gross_area_sf", "rentable_sf", "size_sf"},
        "unit_count": {"unit_count", "units"},
    }

    for logical_key, source_keys in key_map.items():
        if logical_key in {"gross_area_sf", "unit_count"}:
            empty = float(inputs.get(logical_key) or 0) <= 0
        else:
            empty = int(inputs.get(logical_key) or 0) <= 0
        if not empty:
            continue

        for row in datum_rows:
            if row.get("datum_key") not in source_keys:
                continue
            numeric = _datum_numeric_value(row)
            if numeric is None:
                continue
            if logical_key in {"unit_count"}:
                inputs[logical_key] = int(round(numeric))
            elif logical_key in {"gross_area_sf"}:
                inputs[logical_key] = float(numeric)
            else:
                inputs[logical_key] = int(round(numeric))
            break

    return inputs


def run_scenarios(*, run_id: UUID, req: UnderwritingRunScenariosRequest) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM uw_run WHERE run_id = %s", (str(run_id),))
        run_row = cur.fetchone()
        if not run_row:
            raise LookupError("Underwriting run not found")
        if int(run_row.get("research_version") or 0) <= 0:
            raise ValueError("Research must be ingested before running scenarios")

        cur.execute(
            """
            SELECT payload_json
            FROM uw_input_snapshot
            WHERE run_id = %s AND snapshot_type = 'research_normalized'
            ORDER BY version DESC
            LIMIT 1
            """,
            (str(run_id),),
        )
        normalized_snapshot = cur.fetchone()
        if not normalized_snapshot:
            raise ValueError("No normalized research snapshot found")

        cur.execute(
            "SELECT * FROM uw_research_source WHERE run_id = %s ORDER BY created_at",
            (str(run_id),),
        )
        source_rows = cur.fetchall()

        cur.execute("SELECT * FROM uw_comp_sale WHERE run_id = %s", (str(run_id),))
        sale_comps = cur.fetchall()

        cur.execute("SELECT * FROM uw_comp_lease WHERE run_id = %s", (str(run_id),))
        lease_comps = cur.fetchall()

        cur.execute("SELECT * FROM uw_market_snapshot WHERE run_id = %s ORDER BY metric_date DESC NULLS LAST", (str(run_id),))
        market_rows = cur.fetchall()

        cur.execute("SELECT * FROM uw_assumption WHERE run_id = %s", (str(run_id),))
        assumption_rows = cur.fetchall()

        cur.execute("SELECT * FROM uw_research_datum WHERE run_id = %s", (str(run_id),))
        datum_rows = cur.fetchall()

        market_snapshot: dict[str, float] = {}
        for row in market_rows:
            key = row["metric_key"]
            if key in market_snapshot:
                continue
            market_snapshot[key] = float(row["metric_value_decimal"])

        property_inputs = _build_property_inputs(run_row, datum_rows)
        base_assumptions = _default_assumptions(
            run_row=run_row,
            market_snapshot=market_snapshot,
            assumption_rows=assumption_rows,
        )

        scenario_defs = merge_scenarios(
            property_type=str(run_row["property_type"]),
            include_defaults=req.include_defaults,
            custom_scenarios=[s.model_dump(mode="python") for s in req.custom_scenarios],
        )
        if not scenario_defs:
            raise ValueError("At least one scenario is required")

        # Re-run behavior: replace scenario/result/report rows for deterministic replay.
        cur.execute("DELETE FROM uw_report_artifact WHERE run_id = %s", (str(run_id),))
        cur.execute("DELETE FROM uw_output_snapshot WHERE run_id = %s", (str(run_id),))
        cur.execute("DELETE FROM uw_model_result WHERE run_id = %s", (str(run_id),))
        cur.execute("DELETE FROM uw_scenario WHERE run_id = %s", (str(run_id),))

        input_snapshot_version = _next_input_snapshot_version(cur, run_id=run_id, snapshot_type="model_input")
        model_input_payload = {
            "property_inputs": property_inputs,
            "market_snapshot": market_snapshot,
            "assumptions": base_assumptions,
            "scenario_definitions": scenario_defs,
        }
        cur.execute(
            """
            INSERT INTO uw_input_snapshot (
              tenant_id, business_id, run_id, snapshot_type, version, payload_json, payload_hash
            ) VALUES (%s, %s, %s, 'model_input', %s, %s::jsonb, %s)
            """,
            (
                str(run_row["tenant_id"]),
                str(run_row["business_id"]),
                str(run_id),
                input_snapshot_version,
                _json_dumps(model_input_payload),
                _payload_hash(model_input_payload),
            ),
        )

        scenario_results: list[dict[str, Any]] = []
        for scenario in scenario_defs:
            cur.execute(
                """
                INSERT INTO uw_scenario (
                  tenant_id, business_id, run_id, scenario_type, name, levers_json, is_default
                ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                RETURNING scenario_id
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    scenario["scenario_type"],
                    scenario["name"],
                    _json_dumps(scenario["levers"]),
                    bool(scenario.get("is_default")),
                ),
            )
            scenario_id = cur.fetchone()["scenario_id"]

            result = run_underwriting_model(
                property_inputs=property_inputs,
                market_snapshot=market_snapshot,
                assumptions=base_assumptions,
                scenario_levers=scenario["levers"],
            )

            cur.execute(
                """
                INSERT INTO uw_model_result (
                  tenant_id, business_id, run_id, scenario_id,
                  valuation_json, returns_json, debt_json,
                  sensitivities_json, proforma_json, recommendation
                ) VALUES (
                  %s, %s, %s, %s,
                  %s::jsonb, %s::jsonb, %s::jsonb,
                  %s::jsonb, %s::jsonb, %s
                )
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(scenario_id),
                    _json_dumps(result["valuation"]),
                    _json_dumps(result["returns"]),
                    _json_dumps(result["debt"]),
                    _json_dumps(result["sensitivities"]),
                    _json_dumps(result["proforma"]),
                    result["recommendation"],
                ),
            )

            run_context = {
                "run_id": str(run_id),
                "property_name": run_row["property_name"],
                "property_type": run_row["property_type"],
                "submarket": run_row.get("submarket"),
                "business_id": str(run_row["business_id"]),
            }
            report_bundle = generate_report_bundle(
                run_context=run_context,
                scenario={
                    "scenario_id": str(scenario_id),
                    "name": scenario["name"],
                    "scenario_type": scenario["scenario_type"],
                    "levers": scenario["levers"],
                },
                result=result,
                assumptions=result.get("applied_assumptions") or base_assumptions,
                market_snapshot=market_snapshot,
                sale_comps=sale_comps,
                lease_comps=lease_comps,
                sources=source_rows,
            )

            artifact_payloads = {
                "ic_memo_md": {"content_md": report_bundle["ic_memo_md"], "content_json": None},
                "appraisal_md": {"content_md": report_bundle["appraisal_md"], "content_json": None},
                "outputs_json": {"content_md": None, "content_json": report_bundle["outputs_json"]},
                "outputs_md": {"content_md": report_bundle["outputs_md"], "content_json": None},
                "sources_ledger_md": {"content_md": report_bundle["sources_ledger_md"], "content_json": None},
            }

            for artifact_type, artifact in artifact_payloads.items():
                content_for_hash = artifact["content_json"] if artifact["content_json"] is not None else artifact["content_md"]
                cur.execute(
                    """
                    INSERT INTO uw_report_artifact (
                      tenant_id, business_id, run_id, scenario_id,
                      artifact_type, content_md, content_json, content_hash
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        str(run_row["tenant_id"]),
                        str(run_row["business_id"]),
                        str(run_id),
                        str(scenario_id),
                        artifact_type,
                        artifact["content_md"],
                        _json_dumps(artifact["content_json"]),
                        _payload_hash(content_for_hash),
                    ),
                )

            model_output_version = _next_output_snapshot_version(
                cur,
                run_id=run_id,
                scenario_id=scenario_id,
                snapshot_type="model_output",
            )
            cur.execute(
                """
                INSERT INTO uw_output_snapshot (
                  tenant_id, business_id, run_id, scenario_id,
                  snapshot_type, version, payload_json, payload_hash
                ) VALUES (%s, %s, %s, %s, 'model_output', %s, %s::jsonb, %s)
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(scenario_id),
                    model_output_version,
                    _json_dumps(result),
                    _payload_hash(result),
                ),
            )

            report_bundle_version = _next_output_snapshot_version(
                cur,
                run_id=run_id,
                scenario_id=scenario_id,
                snapshot_type="report_bundle",
            )
            cur.execute(
                """
                INSERT INTO uw_output_snapshot (
                  tenant_id, business_id, run_id, scenario_id,
                  snapshot_type, version, payload_json, payload_hash
                ) VALUES (%s, %s, %s, %s, 'report_bundle', %s, %s::jsonb, %s)
                """,
                (
                    str(run_row["tenant_id"]),
                    str(run_row["business_id"]),
                    str(run_id),
                    str(scenario_id),
                    report_bundle_version,
                    _json_dumps(report_bundle),
                    _payload_hash(report_bundle),
                ),
            )

            scenario_results.append(
                {
                    "scenario_id": scenario_id,
                    "name": scenario["name"],
                    "scenario_type": scenario["scenario_type"],
                    "recommendation": result["recommendation"],
                    "valuation": result["valuation"],
                    "returns": result["returns"],
                    "debt": result["debt"],
                    "sensitivities": result["sensitivities"],
                }
            )

        model_input_version = int(run_row.get("model_input_version") or 0) + 1
        output_version = int(run_row.get("output_version") or 0) + 1

        cur.execute(
            """
            UPDATE uw_run
            SET status = 'completed',
                model_input_version = %s,
                output_version = %s,
                model_version = %s,
                error_message = NULL,
                updated_at = now()
            WHERE run_id = %s
            RETURNING *
            """,
            (
                model_input_version,
                output_version,
                MODEL_VERSION,
                str(run_id),
            ),
        )
        updated_run = cur.fetchone()

        cur.execute(
            """
            UPDATE run
            SET status = 'completed',
                completed_at = now(),
                error_message = NULL
            WHERE run_id = %s
            """,
            (str(run_id),),
        )

        if updated_run.get("execution_id"):
            cur.execute(
                """
                UPDATE app.executions
                SET status = 'completed',
                    outputs_json = %s::jsonb,
                    updated_at = now()
                WHERE execution_id = %s
                """,
                (
                    _json_dumps(
                        {
                            "message": "Scenarios completed",
                            "scenario_count": len(scenario_results),
                            "recommendations": [
                                {
                                    "scenario": s["name"],
                                    "recommendation": s["recommendation"],
                                }
                                for s in scenario_results
                            ],
                        }
                    ),
                    str(updated_run["execution_id"]),
                ),
            )

        _insert_audit_event(
            cur,
            run_row=updated_run,
            event_type="scenarios.completed",
            event_payload={
                "scenario_count": len(scenario_results),
                "model_input_version": model_input_version,
                "output_version": output_version,
            },
        )

        return {
            "run_id": run_id,
            "status": "completed",
            "model_input_version": model_input_version,
            "output_version": output_version,
            "scenarios": scenario_results,
        }


def get_reports(*, run_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM uw_run WHERE run_id = %s", (str(run_id),))
        run_row = cur.fetchone()
        if not run_row:
            raise LookupError("Underwriting run not found")

        cur.execute(
            """
            SELECT s.scenario_id, s.name, s.scenario_type, m.recommendation
            FROM uw_scenario s
            LEFT JOIN uw_model_result m
              ON m.run_id = s.run_id AND m.scenario_id = s.scenario_id
            WHERE s.run_id = %s
            ORDER BY s.created_at
            """,
            (str(run_id),),
        )
        scenario_rows = cur.fetchall()

        scenarios_out: list[dict[str, Any]] = []
        for scenario in scenario_rows:
            cur.execute(
                """
                SELECT artifact_type, content_md, content_json
                FROM uw_report_artifact
                WHERE run_id = %s AND scenario_id = %s
                ORDER BY created_at
                """,
                (str(run_id), str(scenario["scenario_id"])),
            )
            artifacts = cur.fetchall()
            artifact_map = {
                row["artifact_type"]: {
                    "artifact_type": row["artifact_type"],
                    "content_md": row.get("content_md"),
                    "content_json": row.get("content_json"),
                }
                for row in artifacts
            }
            scenarios_out.append(
                {
                    "scenario_id": scenario["scenario_id"],
                    "name": scenario["name"],
                    "scenario_type": scenario["scenario_type"],
                    "recommendation": scenario.get("recommendation"),
                    "artifacts": artifact_map,
                }
            )

        return {
            "run_id": run_id,
            "scenarios": scenarios_out,
        }
