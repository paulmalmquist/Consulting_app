from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.db import get_cursor

_TABLE_BY_ENTITY = {
    "asset": ("re_authoritative_asset_state_qtr", "asset_id"),
    "investment": ("re_authoritative_investment_state_qtr", "investment_id"),
    "fund": ("re_authoritative_fund_state_qtr", "fund_id"),
}

_PROMOTION_ORDER = {
    "draft_audit": 0,
    "verified": 1,
    "released": 2,
}


def _json_default(value: Any) -> Any:
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _json_dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _normalize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _normalize(v) for k, v in value.items()}
    return value


def _to_decimal(value: Any) -> Decimal:
    if value in (None, "", "null"):
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def create_snapshot_run(
    *,
    env_id: str,
    business_id: UUID | str,
    snapshot_version: str,
    sample_manifest: dict[str, Any],
    artifact_root: str,
    created_by: str = "meridian_authoritative_runner",
    methodology_version: str = "meridian_authoritative_snapshot_v1",
) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_authoritative_snapshot_run (
              env_id, business_id, snapshot_version, methodology_version,
              sample_manifest, artifact_root, created_by
            )
            VALUES (
              %s, %s::uuid, %s, %s,
              %s::jsonb, %s, %s
            )
            RETURNING audit_run_id
            """,
            (
                env_id,
                str(business_id),
                snapshot_version,
                methodology_version,
                _json_dumps(sample_manifest),
                artifact_root,
                created_by,
            ),
        )
        row = cur.fetchone()
        return row["audit_run_id"]


def persist_authoritative_state(
    *,
    entity_type: str,
    audit_run_id: UUID | str,
    snapshot_version: str,
    env_id: str,
    business_id: UUID | str,
    entity_id: UUID | str,
    quarter: str,
    trust_status: str,
    breakpoint_layer: str | None,
    canonical_metrics: dict[str, Any],
    display_metrics: dict[str, Any],
    null_reasons: dict[str, Any],
    formulas: dict[str, Any],
    provenance: list[dict[str, Any]],
    source_row_refs: list[dict[str, Any]],
    artifact_paths: dict[str, Any],
    fund_id: UUID | str | None = None,
    investment_id: UUID | str | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    inputs_hash: str | None = None,
) -> UUID:
    if entity_type not in _TABLE_BY_ENTITY:
        raise ValueError(f"Unsupported authoritative entity type: {entity_type}")
    table_name, id_col = _TABLE_BY_ENTITY[entity_type]

    if entity_type == "asset":
        entity_columns = "fund_id, investment_id, asset_id"
        entity_placeholders = "%s::uuid, %s::uuid, %s::uuid"
        entity_params: tuple[Any, ...] = (
            str(fund_id) if fund_id else None,
            str(investment_id) if investment_id else None,
            str(entity_id),
        )
    elif entity_type == "investment":
        entity_columns = "fund_id, investment_id"
        entity_placeholders = "%s::uuid, %s::uuid"
        entity_params = (
            str(fund_id) if fund_id else None,
            str(entity_id),
        )
    else:
        entity_columns = "fund_id"
        entity_placeholders = "%s::uuid"
        entity_params = (str(entity_id),)

    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {table_name} (
              audit_run_id, snapshot_version, env_id, business_id,
              {entity_columns}, quarter, period_start, period_end,
              trust_status, breakpoint_layer, canonical_metrics, display_metrics,
              null_reasons, formulas, provenance, source_row_refs, artifact_paths,
              inputs_hash
            )
            VALUES (
              %s::uuid, %s, %s, %s::uuid,
              {entity_placeholders}, %s, %s, %s,
              %s, %s, %s::jsonb, %s::jsonb,
              %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb,
              %s
            )
            RETURNING id
            """,
            (
                str(audit_run_id),
                snapshot_version,
                env_id,
                str(business_id),
                *entity_params,
                quarter,
                period_start,
                period_end,
                trust_status,
                breakpoint_layer,
                _json_dumps(canonical_metrics),
                _json_dumps(display_metrics),
                _json_dumps(null_reasons),
                _json_dumps(formulas),
                _json_dumps(provenance),
                _json_dumps(source_row_refs),
                _json_dumps(artifact_paths),
                inputs_hash,
            ),
        )
        return cur.fetchone()["id"]


def persist_fund_gross_to_net_bridge(
    *,
    audit_run_id: UUID | str,
    snapshot_version: str,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID | str,
    quarter: str,
    trust_status: str,
    breakpoint_layer: str | None,
    gross_return_amount: Decimal | str | None,
    management_fees: Decimal | str | None,
    fund_expenses: Decimal | str | None,
    net_return_amount: Decimal | str | None,
    bridge_items: list[dict[str, Any]],
    null_reasons: dict[str, Any],
    formulas: dict[str, Any],
    provenance: list[dict[str, Any]],
    source_row_refs: list[dict[str, Any]],
    artifact_paths: dict[str, Any],
    inputs_hash: str | None = None,
) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_authoritative_fund_gross_to_net_qtr (
              audit_run_id, snapshot_version, env_id, business_id, fund_id, quarter,
              trust_status, breakpoint_layer, gross_return_amount, management_fees,
              fund_expenses, net_return_amount, bridge_items, null_reasons,
              formulas, provenance, source_row_refs, artifact_paths, inputs_hash
            )
            VALUES (
              %s::uuid, %s, %s, %s::uuid, %s::uuid, %s,
              %s, %s, %s, %s,
              %s, %s, %s::jsonb, %s::jsonb,
              %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s
            )
            RETURNING id
            """,
            (
                str(audit_run_id),
                snapshot_version,
                env_id,
                str(business_id),
                str(fund_id),
                quarter,
                trust_status,
                breakpoint_layer,
                str(gross_return_amount) if gross_return_amount is not None else None,
                str(management_fees) if management_fees is not None else None,
                str(fund_expenses) if fund_expenses is not None else None,
                str(net_return_amount) if net_return_amount is not None else None,
                _json_dumps(bridge_items),
                _json_dumps(null_reasons),
                _json_dumps(formulas),
                _json_dumps(provenance),
                _json_dumps(source_row_refs),
                _json_dumps(artifact_paths),
                inputs_hash,
            ),
        )
        return cur.fetchone()["id"]


def promote_snapshot_version(
    *,
    snapshot_version: str,
    target_state: str,
    actor: str,
    findings_summary: dict[str, Any] | None = None,
) -> None:
    if target_state not in ("verified", "released"):
        raise ValueError(f"Unsupported target_state: {target_state}")

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT audit_run_id, run_status
            FROM re_authoritative_snapshot_run
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Snapshot version {snapshot_version} not found")

        current_state = row["run_status"]
        if _PROMOTION_ORDER[target_state] <= _PROMOTION_ORDER[current_state]:
            raise ValueError(f"Snapshot {snapshot_version} is already {current_state}")
        if target_state == "released" and current_state != "verified":
            raise ValueError("Only verified snapshot runs may be promoted to released")

        timestamp_col = "verified_at" if target_state == "verified" else "released_at"
        actor_col = "verified_by" if target_state == "verified" else "released_by"
        summary_sql = ", findings_summary = %s::jsonb" if findings_summary is not None else ""
        params: list[Any] = [actor]
        if findings_summary is not None:
            params.append(_json_dumps(findings_summary))
        params.append(snapshot_version)

        cur.execute(
            f"""
            UPDATE re_authoritative_snapshot_run
            SET run_status = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
                {summary_sql}
            WHERE snapshot_version = %s
            """,
            [target_state] + params,
        )

        for table_name in (
            "re_authoritative_asset_state_qtr",
            "re_authoritative_investment_state_qtr",
            "re_authoritative_fund_state_qtr",
            "re_authoritative_fund_gross_to_net_qtr",
        ):
            cur.execute(
                f"""
                UPDATE {table_name}
                SET promotion_state = %s,
                    {timestamp_col} = COALESCE({timestamp_col}, now()),
                    {actor_col} = %s
                WHERE snapshot_version = %s
                """,
                (target_state, actor, snapshot_version),
            )


def _build_missing_state(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "quarter": quarter,
        "audit_run_id": None,
        "snapshot_version": None,
        "promotion_state": None,
        "trust_status": "missing_source",
        "breakpoint_layer": None,
        "null_reason": reason,
        "state": None,
        "null_reasons": {"state": reason},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def get_authoritative_state(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
    snapshot_version: str | None = None,
    audit_run_id: UUID | str | None = None,
) -> dict[str, Any]:
    if entity_type not in _TABLE_BY_ENTITY:
        raise ValueError(f"Unsupported authoritative entity type: {entity_type}")
    table_name, id_col = _TABLE_BY_ENTITY[entity_type]

    filters = [f"{id_col} = %s::uuid", "quarter = %s"]
    params: list[Any] = [str(entity_id), quarter]
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if not snapshot_version and not audit_run_id:
        filters.append("promotion_state = 'released'")

    where_sql = " AND ".join(filters)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {table_name}
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        return _build_missing_state(
            entity_type=entity_type,
            entity_id=entity_id,
            quarter=quarter,
            reason="authoritative_state_not_released" if not snapshot_version and not audit_run_id else "authoritative_state_not_found",
        )

    state = {
        "period_start": _normalize(row.get("period_start")),
        "period_end": _normalize(row.get("period_end")),
        "canonical_metrics": _normalize(row.get("canonical_metrics") or {}),
        "display_metrics": _normalize(row.get("display_metrics") or {}),
    }
    if entity_type == "fund":
        bridge = get_fund_gross_to_net_bridge(
            fund_id=entity_id,
            quarter=quarter,
            snapshot_version=row["snapshot_version"],
            audit_run_id=row["audit_run_id"],
        )
        if bridge.get("null_reason") is None:
            state["gross_to_net_bridge"] = {
                "gross_return_amount": bridge.get("gross_return_amount"),
                "management_fees": bridge.get("management_fees"),
                "fund_expenses": bridge.get("fund_expenses"),
                "net_return_amount": bridge.get("net_return_amount"),
                "bridge_items": bridge.get("bridge_items") or [],
                "formulas": bridge.get("formulas") or {},
                "null_reasons": bridge.get("null_reasons") or {},
            }
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "quarter": quarter,
        "audit_run_id": str(row["audit_run_id"]),
        "snapshot_version": row["snapshot_version"],
        "promotion_state": row["promotion_state"],
        "trust_status": row["trust_status"],
        "breakpoint_layer": row.get("breakpoint_layer"),
        "null_reason": None,
        "state": state,
        "null_reasons": _normalize(row.get("null_reasons") or {}),
        "formulas": _normalize(row.get("formulas") or {}),
        "provenance": _normalize(row.get("provenance") or []),
        "artifact_paths": _normalize(row.get("artifact_paths") or {}),
    }


def get_fund_gross_to_net_bridge(
    *,
    fund_id: UUID | str,
    quarter: str,
    snapshot_version: str | None = None,
    audit_run_id: UUID | str | None = None,
) -> dict[str, Any]:
    filters = ["fund_id = %s::uuid", "quarter = %s"]
    params: list[Any] = [str(fund_id), quarter]
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if not snapshot_version and not audit_run_id:
        filters.append("promotion_state = 'released'")

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM re_authoritative_fund_gross_to_net_qtr
            WHERE {" AND ".join(filters)}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        return {
            "fund_id": str(fund_id),
            "quarter": quarter,
            "audit_run_id": None,
            "snapshot_version": None,
            "promotion_state": None,
            "trust_status": "missing_source",
            "breakpoint_layer": None,
            "null_reason": "authoritative_state_not_released" if not snapshot_version and not audit_run_id else "authoritative_state_not_found",
            "gross_return_amount": None,
            "management_fees": None,
            "fund_expenses": None,
            "net_return_amount": None,
            "bridge_items": [],
            "null_reasons": {"bridge": "authoritative_state_not_released" if not snapshot_version and not audit_run_id else "authoritative_state_not_found"},
            "formulas": {},
            "provenance": [],
            "artifact_paths": {},
        }

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "audit_run_id": str(row["audit_run_id"]),
        "snapshot_version": row["snapshot_version"],
        "promotion_state": row["promotion_state"],
        "trust_status": row["trust_status"],
        "breakpoint_layer": row.get("breakpoint_layer"),
        "null_reason": None,
        "gross_return_amount": str(row["gross_return_amount"]) if row.get("gross_return_amount") is not None else None,
        "management_fees": str(row["management_fees"]) if row.get("management_fees") is not None else None,
        "fund_expenses": str(row["fund_expenses"]) if row.get("fund_expenses") is not None else None,
        "net_return_amount": str(row["net_return_amount"]) if row.get("net_return_amount") is not None else None,
        "bridge_items": _normalize(row.get("bridge_items") or []),
        "null_reasons": _normalize(row.get("null_reasons") or {}),
        "formulas": _normalize(row.get("formulas") or {}),
        "provenance": _normalize(row.get("provenance") or []),
        "artifact_paths": _normalize(row.get("artifact_paths") or {}),
    }


def get_snapshot_run(*, audit_run_id: UUID | str | None = None, snapshot_version: str | None = None) -> dict[str, Any]:
    if not audit_run_id and not snapshot_version:
        raise ValueError("Either audit_run_id or snapshot_version is required")

    filters = []
    params: list[Any] = []
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM re_authoritative_snapshot_run
            WHERE {" AND ".join(filters)}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        raise LookupError("Authoritative snapshot run not found")
    return _normalize(dict(row))


def get_released_portfolio_kpis(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (fund_id)
              fund_id::text AS fund_id,
              audit_run_id::text AS audit_run_id,
              snapshot_version,
              promotion_state,
              trust_status,
              breakpoint_layer,
              canonical_metrics,
              null_reasons,
              provenance,
              artifact_paths
            FROM re_authoritative_fund_state_qtr
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND quarter = %s
              AND promotion_state = 'released'
            ORDER BY fund_id, released_at DESC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id), quarter),
        )
        rows = cur.fetchall()

    if not rows:
        return {
            "env_id": str(env_id),
            "business_id": str(business_id),
            "quarter": quarter,
            "effective_quarter": quarter,
            "fund_count": 0,
            "total_commitments": "0",
            "portfolio_nav": None,
            "active_assets": 0,
            "gross_irr": None,
            "net_irr": None,
            "warnings": [f"No released authoritative fund snapshots found for {quarter}."],
            "null_reason": "authoritative_state_not_released",
            "null_reasons": {"portfolio": "authoritative_state_not_released"},
            "provenance": [],
            "artifact_paths": {},
            "audit_run_id": None,
            "snapshot_version": None,
            "promotion_state": None,
            "breakpoint_layer": None,
            "source_snapshots": [],
            "trust_status": "missing_source",
        }

    nav_weighted_gross = Decimal("0")
    nav_weighted_net = Decimal("0")
    nav_base_gross = Decimal("0")
    nav_base_net = Decimal("0")
    total_commitments = Decimal("0")
    portfolio_nav = Decimal("0")
    active_assets = 0
    source_snapshots: list[dict[str, Any]] = []
    breakpoint_layers: list[str] = []
    provenance_rows: list[dict[str, Any]] = []
    artifact_paths: dict[str, Any] = {}

    for row in rows:
        metrics = row.get("canonical_metrics") or {}
        nav_value = _to_decimal(metrics.get("ending_nav") or metrics.get("portfolio_nav"))
        portfolio_nav += nav_value
        total_commitments += _to_decimal(metrics.get("total_committed"))
        active_assets += int(metrics.get("asset_count") or 0)
        if row.get("breakpoint_layer"):
            breakpoint_layers.append(str(row["breakpoint_layer"]))
        provenance_rows.extend(_normalize(row.get("provenance") or []))
        artifact_paths[row["fund_id"]] = _normalize(row.get("artifact_paths") or {})
        source_snapshots.append(
            {
                "fund_id": row["fund_id"],
                "audit_run_id": row.get("audit_run_id"),
                "snapshot_version": row.get("snapshot_version"),
                "promotion_state": row.get("promotion_state"),
                "trust_status": row.get("trust_status"),
            }
        )

        gross_irr = metrics.get("gross_irr")
        if gross_irr is not None and nav_value > 0:
            nav_weighted_gross += _to_decimal(gross_irr) * nav_value
            nav_base_gross += nav_value

        net_irr = metrics.get("net_irr")
        if net_irr is not None and nav_value > 0:
            nav_weighted_net += _to_decimal(net_irr) * nav_value
            nav_base_net += nav_value

    unique_versions = sorted({row["snapshot_version"] for row in rows if row.get("snapshot_version")})
    unique_run_ids = sorted({str(row["audit_run_id"]) for row in rows if row.get("audit_run_id")})
    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "quarter": quarter,
        "effective_quarter": quarter,
        "fund_count": len(rows),
        "total_commitments": str(total_commitments),
        "portfolio_nav": str(portfolio_nav) if portfolio_nav != 0 else None,
        "active_assets": active_assets,
        "gross_irr": str(nav_weighted_gross / nav_base_gross) if nav_base_gross > 0 else None,
        "net_irr": str(nav_weighted_net / nav_base_net) if nav_base_net > 0 else None,
        "warnings": [],
        "null_reason": None,
        "null_reasons": {},
        "provenance": provenance_rows,
        "artifact_paths": artifact_paths,
        "audit_run_id": unique_run_ids[0] if len(unique_run_ids) == 1 else None,
        "snapshot_version": unique_versions[0] if len(unique_versions) == 1 else None,
        "promotion_state": "released",
        "breakpoint_layer": breakpoint_layers[0] if breakpoint_layers else None,
        "source_snapshots": source_snapshots,
        "trust_status": "trusted",
    }
