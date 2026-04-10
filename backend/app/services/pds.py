from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.datetime_normalization import datetime_sort_key, utc_now
from app.services import pds_engines


def _q(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(value).quantize(Decimal("0.000000000001"))


def _next_version(cur, table: str, id_col: str, target_id: str) -> int:
    cur.execute(
        f"SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM {table} WHERE {id_col} = %s::uuid",
        (target_id,),
    )
    row = cur.fetchone()
    return int(row["next_version"])


def _normalize_limit(value: int | None, default: int = 50, maximum: int = 200) -> int:
    if value is None:
        return default
    return max(1, min(int(value), maximum))


def _normalize_offset(value: int | None) -> int:
    if value is None:
        return 0
    return max(0, int(value))


def _merge_metadata(existing: Any, incoming: dict[str, Any] | None) -> str:
    base: dict[str, Any]
    if isinstance(existing, dict):
        base = dict(existing)
    else:
        base = {}
    if incoming:
        base.update(incoming)
    return json.dumps(base)


def _coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _format_currency_label(value: Decimal, *, prefix_plus: bool = False) -> str:
    amount = _q(value)
    rounded = amount.quantize(Decimal("1"))
    rendered = f"${abs(rounded):,.0f}"
    if rounded < 0:
        return f"-{rendered}"
    if prefix_plus and rounded > 0:
        return f"+{rendered}"
    return rendered


def _format_day_label(days: int) -> str:
    unit = "day" if abs(days) == 1 else "days"
    return f"{days} {unit}"


def _metric_state(value: int, *, yellow_threshold: int, red_threshold: int) -> str:
    if value >= red_threshold:
        return "red"
    if value >= yellow_threshold:
        return "yellow"
    return "green"


def _project_href(*, env_id: UUID, project_id: UUID, section: str | None = None) -> str:
    base = f"/lab/env/{env_id}/pds/projects/{project_id}"
    if section:
        return f"{base}?section={section}"
    return base


def _list_project_rows(*, table: str, env_id: UUID, business_id: UUID, project_id: UUID, order_by: str = "created_at DESC") -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {table}
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND project_id = %s::uuid
            ORDER BY {order_by}
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        return cur.fetchall()


def _next_reference_number(*, cur, table: str, project_id: UUID, column: str, prefix: str) -> str:
    cur.execute(
        f"""
        SELECT COALESCE(
          MAX(
            NULLIF(
              regexp_replace({column}, '[^0-9]', '', 'g'),
              ''
            )::int
          ),
          0
        ) + 1 AS next_seq
        FROM {table}
        WHERE project_id = %s::uuid
        """,
        (str(project_id),),
    )
    row = cur.fetchone() or {}
    return f"{prefix}-{int(row.get('next_seq') or 1):04d}"


def list_projects(
    *,
    env_id: UUID,
    business_id: UUID,
    stage: str | None = None,
    status: str | None = None,
    project_manager: str | None = None,
    offset: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        where = [
            "env_id = %s::uuid",
            "business_id = %s::uuid",
        ]
        params: list[Any] = [str(env_id), str(business_id)]
        if stage:
            where.append("stage = %s")
            params.append(stage)
        if status:
            where.append("status = %s")
            params.append(status)
        if project_manager:
            where.append("project_manager = %s")
            params.append(project_manager)
        params.extend([_normalize_offset(offset), _normalize_limit(limit)])
        cur.execute(
            f"""
            SELECT *
            FROM pds_projects
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            OFFSET %s
            LIMIT %s
            """,
            tuple(params),
        )
        return cur.fetchall()


def get_project(*, env_id: UUID, business_id: UUID, project_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_projects
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Project not found")
        return row


def create_project(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_projects
            (env_id, business_id, program_id, project_code, name, description, sector, project_type, stage, status,
             project_manager, start_date, target_end_date, approved_budget, forecast_at_completion, contingency_budget,
             contingency_remaining, next_milestone_date, currency_code, created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(payload["program_id"]) if payload.get("program_id") else None,
                payload.get("project_code"),
                payload["name"],
                payload.get("description"),
                payload.get("sector"),
                payload.get("project_type"),
                payload.get("stage") or "planning",
                payload.get("status") or "active",
                payload.get("project_manager"),
                payload.get("start_date"),
                payload.get("target_end_date"),
                _q(payload.get("approved_budget")),
                _q(payload.get("forecast_at_completion")) or _q(payload.get("approved_budget")),
                _q(payload.get("contingency_budget")),
                _q(payload.get("contingency_budget")),
                payload.get("next_milestone_date"),
                (payload.get("currency_code") or "USD").upper(),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def create_budget_baseline(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        version_no = _next_version(cur, "pds_budget_versions", "project_id", str(project_id))
        cur.execute(
            """
            INSERT INTO pds_budget_versions
            (env_id, business_id, project_id, version_no, period, approved_budget, status, is_baseline, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, 'published', true, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                version_no,
                payload["period"],
                _q(payload["approved_budget"]),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        version_row = cur.fetchone()

        for line in payload.get("lines") or []:
            cur.execute(
                """
                INSERT INTO pds_budget_lines
                (env_id, business_id, project_id, budget_version_id, cost_code, line_label, approved_amount, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
                ON CONFLICT (budget_version_id, cost_code) DO UPDATE
                  SET line_label = EXCLUDED.line_label,
                      approved_amount = EXCLUDED.approved_amount,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = now()
                """,
                (
                    str(env_id),
                    str(business_id),
                    str(project_id),
                    str(version_row["budget_version_id"]),
                    line["cost_code"],
                    line["line_label"],
                    _q(line.get("approved_amount")),
                    payload.get("created_by"),
                    payload.get("created_by"),
                ),
            )

        cur.execute(
            """
            UPDATE pds_projects
            SET approved_budget = %s,
                contingency_remaining = contingency_budget,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (_q(payload["approved_budget"]), payload.get("created_by"), str(project_id)),
        )

        return version_row


def create_budget_revision(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        version_no = _next_version(cur, "pds_budget_revisions", "project_id", str(project_id))
        cur.execute(
            """
            INSERT INTO pds_budget_revisions
            (env_id, business_id, project_id, period, revision_ref, amount_delta, reason, status, version_no, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                payload["period"],
                payload["revision_ref"],
                _q(payload["amount_delta"]),
                payload.get("reason"),
                payload.get("status") or "approved",
                version_no,
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        row = cur.fetchone()

        if row.get("status") == "approved":
            cur.execute(
                """
                UPDATE pds_projects
                SET approved_budget = approved_budget + %s,
                    updated_by = %s,
                    updated_at = now()
                WHERE project_id = %s::uuid
                """,
                (_q(payload["amount_delta"]), payload.get("created_by"), str(project_id)),
            )
        return row


def create_contract(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        vendor_id = str(payload["vendor_id"]) if payload.get("vendor_id") else None
        vendor_name = payload.get("vendor_name")
        if vendor_id and not vendor_name:
            cur.execute(
                """
                SELECT vendor_name
                FROM pds_vendors
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND vendor_id = %s::uuid
                """,
                (str(env_id), str(business_id), vendor_id),
            )
            vendor = cur.fetchone()
            vendor_name = vendor["vendor_name"] if vendor else None
        cur.execute(
            """
            INSERT INTO pds_contracts
            (env_id, business_id, project_id, contract_number, vendor_id, vendor_name, scope_description, contract_value,
             executed_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                payload["contract_number"],
                vendor_id,
                vendor_name,
                payload.get("scope_description"),
                _q(payload.get("contract_value")),
                payload.get("executed_date"),
                payload.get("status") or "active",
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def create_commitment(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_commitment_lines
            (env_id, business_id, project_id, contract_id, period, amount, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                str(payload["contract_id"]) if payload.get("contract_id") else None,
                payload["period"],
                _q(payload["amount"]),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE pds_projects
            SET committed_amount = committed_amount + %s,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (_q(payload["amount"]), payload.get("created_by"), str(project_id)),
        )
        return row


def create_change_order(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        version_no = _next_version(cur, "pds_change_orders", "project_id", str(project_id))
        cur.execute(
            """
            INSERT INTO pds_change_orders
            (env_id, business_id, project_id, change_order_ref, status, amount_impact, schedule_impact_days,
             approval_required, metadata_json, version_no, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, 'pending', %s, %s, %s, %s::jsonb, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), payload["change_order_ref"], _q(payload["amount_impact"]),
                int(payload.get("schedule_impact_days") or 0), bool(payload.get("approval_required", True)),
                json.dumps(payload.get("metadata_json") or {}), version_no, payload.get("created_by"), payload.get("created_by")
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE pds_projects
            SET pending_change_order_amount = pending_change_order_amount + %s,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (_q(payload["amount_impact"]), payload.get("created_by"), str(project_id)),
        )
        return row


def approve_change_order(*, env_id: UUID, business_id: UUID, change_order_id: UUID, approved_by: str | None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_change_orders
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND change_order_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(change_order_id)),
        )
        existing = cur.fetchone()
        if not existing:
            raise LookupError("Change order not found")

        cur.execute(
            """
            UPDATE pds_change_orders
            SET status = 'approved', approved_at = now(), updated_by = %s, updated_at = now()
            WHERE change_order_id = %s::uuid
            RETURNING *
            """,
            (approved_by, str(change_order_id)),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE pds_projects
            SET approved_budget = approved_budget + %s,
                pending_change_order_amount = GREATEST(0, pending_change_order_amount - %s),
                contingency_remaining = contingency_remaining - %s,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (
                _q(existing.get("amount_impact")),
                _q(existing.get("amount_impact")),
                _q(existing.get("amount_impact")),
                approved_by,
                str(existing["project_id"]),
            ),
        )
        return row


def create_invoice(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_invoices
            (env_id, business_id, project_id, invoice_number, amount, invoice_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), payload["invoice_number"], _q(payload["amount"]),
                payload.get("invoice_date"), payload.get("status") or "approved", payload.get("created_by"), payload.get("created_by")
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE pds_projects
            SET spent_amount = spent_amount + %s,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (_q(payload["amount"]), payload.get("created_by"), str(project_id)),
        )
        return row


def create_payment(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_payments
            (env_id, business_id, project_id, invoice_id, payment_ref, amount, payment_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), str(payload["invoice_id"]) if payload.get("invoice_id") else None,
                payload["payment_ref"], _q(payload["amount"]), payload.get("payment_date"), payload.get("status") or "paid", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_forecast(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        version_no = _next_version(cur, "pds_forecast_versions", "project_id", str(project_id))
        cur.execute(
            """
            INSERT INTO pds_forecast_versions
            (env_id, business_id, project_id, version_no, period, forecast_to_complete, eac, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), version_no, payload["period"],
                _q(payload["forecast_to_complete"]), _q(payload["eac"]), payload.get("status") or "published",
                payload.get("created_by"), payload.get("created_by")
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE pds_projects
            SET forecast_at_completion = %s,
                updated_by = %s,
                updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (_q(payload["eac"]), payload.get("created_by"), str(project_id)),
        )
        return row


def update_project(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    existing = get_project(env_id=env_id, business_id=business_id, project_id=project_id)
    allowed_fields = {
        "project_code": payload.get("project_code"),
        "name": payload.get("name"),
        "description": payload.get("description"),
        "sector": payload.get("sector"),
        "project_type": payload.get("project_type"),
        "stage": payload.get("stage"),
        "status": payload.get("status"),
        "project_manager": payload.get("project_manager"),
        "start_date": payload.get("start_date"),
        "target_end_date": payload.get("target_end_date"),
        "next_milestone_date": payload.get("next_milestone_date"),
    }
    updates = {key: value for key, value in allowed_fields.items() if value is not None}

    if payload.get("approved_budget") is not None:
        updates["approved_budget"] = _q(payload.get("approved_budget"))

    if payload.get("contingency_budget") is not None:
        updates["contingency_budget"] = _q(payload.get("contingency_budget"))
        if payload.get("approved_budget") is None:
            delta = _q(payload.get("contingency_budget")) - _q(existing.get("contingency_budget"))
            updates["contingency_remaining"] = _q(existing.get("contingency_remaining")) + delta

    if payload.get("currency_code") is not None:
        updates["currency_code"] = str(payload.get("currency_code")).upper()

    if not updates:
        return existing

    assignments = []
    params: list[Any] = []
    for key, value in updates.items():
        assignments.append(f"{key} = %s")
        params.append(value)
    assignments.extend(["updated_by = %s", "updated_at = now()"])
    params.extend([payload.get("updated_by"), str(project_id)])

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE pds_projects
            SET {', '.join(assignments)}
            WHERE project_id = %s::uuid
            RETURNING *
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Project not found")
        return row


def list_project_change_orders(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    return _list_project_rows(table="pds_change_orders", env_id=env_id, business_id=business_id, project_id=project_id)


def list_project_commitments(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    return _list_project_rows(table="pds_commitment_lines", env_id=env_id, business_id=business_id, project_id=project_id)


def list_project_forecasts(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    return _list_project_rows(table="pds_forecast_versions", env_id=env_id, business_id=business_id, project_id=project_id, order_by="version_no DESC, created_at DESC")


def list_project_site_reports(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    return _list_project_rows(table="pds_site_reports", env_id=env_id, business_id=business_id, project_id=project_id, order_by="report_date DESC, created_at DESC")


def create_site_report(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_site_reports
            (env_id, business_id, project_id, report_date, summary, blockers, weather, temperature_high,
             temperature_low, workers_on_site, work_performed, delays, safety_incidents, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                payload["report_date"],
                payload.get("summary"),
                payload.get("blockers"),
                payload.get("weather"),
                payload.get("temperature_high"),
                payload.get("temperature_low"),
                int(payload.get("workers_on_site") or 0),
                payload.get("work_performed"),
                payload.get("delays"),
                payload.get("safety_incidents"),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def list_project_contracts(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              c.*,
              COALESCE(v.vendor_name, c.vendor_name) AS resolved_vendor_name,
              v.trade,
              v.contact_name,
              v.contact_email,
              v.insurance_expiry
            FROM pds_contracts c
            LEFT JOIN pds_vendors v ON v.vendor_id = c.vendor_id
            WHERE c.env_id = %s::uuid
              AND c.business_id = %s::uuid
              AND c.project_id = %s::uuid
            ORDER BY c.created_at DESC
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        return cur.fetchall()


def get_project_budget(*, env_id: UUID, business_id: UUID, project_id: UUID) -> dict:
    project = get_project(env_id=env_id, business_id=business_id, project_id=project_id)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_budget_versions
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            ORDER BY version_no DESC, created_at DESC
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        versions = cur.fetchall()
        latest_version = versions[0] if versions else None

        lines: list[dict] = []
        if latest_version:
            cur.execute(
                """
                SELECT *
                FROM pds_budget_lines
                WHERE budget_version_id = %s::uuid
                ORDER BY cost_code ASC
                """,
                (str(latest_version["budget_version_id"]),),
            )
            lines = cur.fetchall()

        revisions = _list_project_rows(
            table="pds_budget_revisions",
            env_id=env_id,
            business_id=business_id,
            project_id=project_id,
        )
        commitments = list_project_commitments(env_id=env_id, business_id=business_id, project_id=project_id)
        forecasts = list_project_forecasts(env_id=env_id, business_id=business_id, project_id=project_id)
        change_orders = list_project_change_orders(env_id=env_id, business_id=business_id, project_id=project_id)

        cur.execute(
            """
            SELECT *
            FROM pds_invoices
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        invoices = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM pds_payments
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        payments = cur.fetchall()

    approved_budget = _q(project.get("approved_budget"))
    spent_amount = _q(project.get("spent_amount"))
    forecast_at_completion = _q(project.get("forecast_at_completion"))

    return {
        "project_id": str(project_id),
        "currency_code": project.get("currency_code"),
        "totals": {
            "approved_budget": approved_budget,
            "committed_amount": _q(project.get("committed_amount")),
            "spent_amount": spent_amount,
            "forecast_at_completion": forecast_at_completion,
            "contingency_budget": _q(project.get("contingency_budget")),
            "contingency_remaining": _q(project.get("contingency_remaining")),
            "pending_change_order_amount": _q(project.get("pending_change_order_amount")),
            "variance": approved_budget - forecast_at_completion,
            "budget_used_ratio": (spent_amount / approved_budget) if approved_budget else Decimal("0"),
        },
        "versions": versions,
        "lines": lines,
        "revisions": revisions,
        "commitments": commitments,
        "invoices": invoices,
        "payments": payments,
        "forecasts": forecasts,
        "change_orders": change_orders,
    }


def list_vendors(*, env_id: UUID, business_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id)]
        where = ["env_id = %s::uuid", "business_id = %s::uuid"]
        if status:
            where.append("status = %s")
            params.append(status)
        cur.execute(
            f"""
            SELECT *
            FROM pds_vendors
            WHERE {' AND '.join(where)}
            ORDER BY vendor_name ASC
            """,
            tuple(params),
        )
        return cur.fetchall()


def get_vendor(*, env_id: UUID, business_id: UUID, vendor_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_vendors
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND vendor_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(vendor_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Vendor not found")
        return row


def create_vendor(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_vendors
            (env_id, business_id, vendor_name, trade, license_number, insurance_expiry, contact_name,
             contact_email, status, metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                payload["vendor_name"],
                payload.get("trade"),
                payload.get("license_number"),
                payload.get("insurance_expiry"),
                payload.get("contact_name"),
                payload.get("contact_email"),
                payload.get("status") or "active",
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def update_vendor(*, env_id: UUID, business_id: UUID, vendor_id: UUID, payload: dict) -> dict:
    existing = get_vendor(env_id=env_id, business_id=business_id, vendor_id=vendor_id)
    updates = {
        "vendor_name": payload.get("vendor_name"),
        "trade": payload.get("trade"),
        "license_number": payload.get("license_number"),
        "insurance_expiry": payload.get("insurance_expiry"),
        "contact_name": payload.get("contact_name"),
        "contact_email": payload.get("contact_email"),
        "status": payload.get("status"),
    }
    filtered = {key: value for key, value in updates.items() if value is not None}
    if payload.get("metadata_json") is not None:
        filtered["metadata_json"] = _merge_metadata(existing.get("metadata_json"), payload.get("metadata_json"))
    if not filtered:
        return existing

    assignments = []
    params: list[Any] = []
    for key, value in filtered.items():
        assignments.append(f"{key} = %s" if key != "metadata_json" else "metadata_json = %s::jsonb")
        params.append(value)
    assignments.extend(["updated_by = %s", "updated_at = now()"])
    params.extend([payload.get("updated_by"), str(vendor_id)])

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE pds_vendors
            SET {', '.join(assignments)}
            WHERE vendor_id = %s::uuid
            RETURNING *
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Vendor not found")
        return row


def list_rfis(*, env_id: UUID, business_id: UUID, project_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id), str(project_id)]
        where = [
            "env_id = %s::uuid",
            "business_id = %s::uuid",
            "project_id = %s::uuid",
        ]
        if status:
            where.append("status = %s")
            params.append(status)
        cur.execute(
            f"""
            SELECT *
            FROM pds_rfis
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            """,
            tuple(params),
        )
        return cur.fetchall()


def get_rfi(*, env_id: UUID, business_id: UUID, project_id: UUID, rfi_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_rfis
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND project_id = %s::uuid
              AND rfi_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id), str(rfi_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("RFI not found")
        return row


def create_rfi(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        rfi_number = payload.get("rfi_number") or _next_reference_number(
            cur=cur,
            table="pds_rfis",
            project_id=project_id,
            column="rfi_number",
            prefix="RFI",
        )
        cur.execute(
            """
            INSERT INTO pds_rfis
            (env_id, business_id, project_id, rfi_number, subject, description, assigned_to, due_date, priority,
             metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                rfi_number,
                payload["subject"],
                payload.get("description"),
                payload.get("assigned_to"),
                payload.get("due_date"),
                payload.get("priority") or "normal",
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def update_rfi(*, env_id: UUID, business_id: UUID, project_id: UUID, rfi_id: UUID, payload: dict) -> dict:
    existing = get_rfi(env_id=env_id, business_id=business_id, project_id=project_id, rfi_id=rfi_id)
    updates = {
        "subject": payload.get("subject"),
        "description": payload.get("description"),
        "assigned_to": payload.get("assigned_to"),
        "due_date": payload.get("due_date"),
        "priority": payload.get("priority"),
        "status": payload.get("status"),
    }
    filtered = {key: value for key, value in updates.items() if value is not None}
    if payload.get("response_text") is not None:
        filtered["response_text"] = payload.get("response_text")
        filtered["responded_at"] = utc_now()
        if "status" not in filtered:
            filtered["status"] = "responded"
    if payload.get("metadata_json") is not None:
        filtered["metadata_json"] = _merge_metadata(existing.get("metadata_json"), payload.get("metadata_json"))
    if not filtered:
        return existing

    assignments = []
    params: list[Any] = []
    for key, value in filtered.items():
        assignments.append(f"{key} = %s" if key != "metadata_json" else "metadata_json = %s::jsonb")
        params.append(value)
    assignments.extend(["updated_by = %s", "updated_at = now()"])
    params.extend([payload.get("updated_by"), str(rfi_id)])

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE pds_rfis
            SET {', '.join(assignments)}
            WHERE rfi_id = %s::uuid
            RETURNING *
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("RFI not found")
        return row


def list_submittals(*, env_id: UUID, business_id: UUID, project_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id), str(project_id)]
        where = [
            "s.env_id = %s::uuid",
            "s.business_id = %s::uuid",
            "s.project_id = %s::uuid",
        ]
        if status:
            where.append("s.status = %s")
            params.append(status)
        cur.execute(
            f"""
            SELECT
              s.*,
              v.vendor_name
            FROM pds_submittals s
            LEFT JOIN pds_vendors v ON v.vendor_id = s.vendor_id
            WHERE {' AND '.join(where)}
            ORDER BY s.created_at DESC
            """,
            tuple(params),
        )
        return cur.fetchall()


def create_submittal(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        submittal_number = payload.get("submittal_number") or _next_reference_number(
            cur=cur,
            table="pds_submittals",
            project_id=project_id,
            column="submittal_number",
            prefix="SUB",
        )
        cur.execute(
            """
            INSERT INTO pds_submittals
            (env_id, business_id, project_id, vendor_id, submittal_number, description, spec_section, required_date,
             submitted_date, reviewed_date, review_notes, status, metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                str(payload["vendor_id"]) if payload.get("vendor_id") else None,
                submittal_number,
                payload.get("description"),
                payload.get("spec_section"),
                payload.get("required_date"),
                payload.get("submitted_date"),
                payload.get("reviewed_date"),
                payload.get("review_notes"),
                payload.get("status") or "pending",
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def list_documents(*, env_id: UUID, business_id: UUID, project_id: UUID, document_type: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id), str(project_id)]
        where = [
            "env_id = %s::uuid",
            "business_id = %s::uuid",
            "project_id = %s::uuid",
        ]
        if document_type:
            where.append("document_type = %s")
            params.append(document_type)
        cur.execute(
            f"""
            SELECT *
            FROM pds_documents
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            """,
            tuple(params),
        )
        return cur.fetchall()


def create_document(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_documents
            (env_id, business_id, project_id, rfi_id, submittal_id, title, document_type, version_label,
             storage_key, metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                str(payload["rfi_id"]) if payload.get("rfi_id") else None,
                str(payload["submittal_id"]) if payload.get("submittal_id") else None,
                payload["title"],
                payload.get("document_type") or "general",
                payload.get("version_label"),
                payload.get("storage_key"),
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def list_project_permits(*, env_id: UUID, business_id: UUID, project_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id), str(project_id)]
        where = [
            "env_id = %s::uuid",
            "business_id = %s::uuid",
            "project_id = %s::uuid",
        ]
        if status:
            where.append("status = %s")
            params.append(status)
        cur.execute(
            f"""
            SELECT *
            FROM pds_permits
            WHERE {' AND '.join(where)}
            ORDER BY COALESCE(required_by_date, expiration_date) ASC NULLS LAST, created_at DESC
            """,
            tuple(params),
        )
        return cur.fetchall()


def create_permit(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_permits
            (env_id, business_id, project_id, permit_type, authority_name, status, required_by_date, expiration_date,
             owner_name, blocking_flag, submitted_at, approved_at, notes, metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                payload["permit_type"],
                payload.get("authority_name"),
                payload.get("status") or "pending",
                payload.get("required_by_date"),
                payload.get("expiration_date"),
                payload.get("owner_name"),
                bool(payload.get("blocking_flag")),
                payload.get("submitted_at"),
                payload.get("approved_at"),
                payload.get("notes"),
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def list_project_contractor_claims(*, env_id: UUID, business_id: UUID, project_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[Any] = [str(env_id), str(business_id), str(project_id)]
        where = [
            "c.env_id = %s::uuid",
            "c.business_id = %s::uuid",
            "c.project_id = %s::uuid",
        ]
        if status:
            where.append("c.status = %s")
            params.append(status)
        cur.execute(
            f"""
            SELECT
              c.*,
              COALESCE(v.vendor_name, c.vendor_name) AS resolved_vendor_name
            FROM pds_contractor_claims c
            LEFT JOIN pds_vendors v ON v.vendor_id = c.vendor_id
            WHERE {' AND '.join(where)}
            ORDER BY c.response_due_at ASC NULLS LAST, c.created_at DESC
            """,
            tuple(params),
        )
        return cur.fetchall()


def create_contractor_claim(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        claim_ref = payload.get("claim_ref") or _next_reference_number(
            cur=cur,
            table="pds_contractor_claims",
            project_id=project_id,
            column="claim_ref",
            prefix="CLM",
        )
        cur.execute(
            """
            INSERT INTO pds_contractor_claims
            (env_id, business_id, project_id, contract_id, vendor_id, vendor_name, claim_ref, claim_type, status,
             claimed_amount, exposure_amount, received_at, response_due_at, owner_name, summary, metadata_json,
             created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(project_id),
                str(payload["contract_id"]) if payload.get("contract_id") else None,
                str(payload["vendor_id"]) if payload.get("vendor_id") else None,
                payload.get("vendor_name"),
                claim_ref,
                payload.get("claim_type") or "change",
                payload.get("status") or "open",
                _q(payload.get("claimed_amount")),
                _q(payload.get("exposure_amount")) if payload.get("exposure_amount") is not None else _q(payload.get("claimed_amount")),
                payload.get("received_at"),
                payload.get("response_due_at"),
                payload.get("owner_name"),
                payload.get("summary"),
                json.dumps(payload.get("metadata_json") or {}),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def _upsert_milestones(*, cur, env_id: UUID, business_id: UUID, project_id: UUID, milestones: list[dict], created_by: str | None):
    for row in milestones:
        cur.execute(
            """
            INSERT INTO pds_milestones
            (env_id, business_id, project_id, milestone_name, baseline_date, current_date, actual_date, slip_reason, is_critical, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(env_id), str(business_id), str(project_id), row["milestone_name"], row.get("baseline_date"), row.get("current_date"),
                row.get("actual_date"), row.get("slip_reason"), bool(row.get("is_critical", False)), created_by, created_by
            ),
        )


def create_schedule_baseline(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> list[dict]:
    with get_cursor() as cur:
        _upsert_milestones(
            cur=cur,
            env_id=env_id,
            business_id=business_id,
            project_id=project_id,
            milestones=payload.get("milestones") or [],
            created_by=payload.get("created_by"),
        )
        cur.execute(
            """
            SELECT *
            FROM pds_milestones
            WHERE project_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(project_id),),
        )
        return cur.fetchall()


def create_schedule_update(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> list[dict]:
    return create_schedule_baseline(env_id=env_id, business_id=business_id, project_id=project_id, payload=payload)


def get_project_schedule(*, env_id: UUID, business_id: UUID, project_id: UUID) -> dict:
    milestones = _list_project_rows(
        table="pds_milestones",
        env_id=env_id,
        business_id=business_id,
        project_id=project_id,
        order_by="COALESCE(current_date, baseline_date) ASC NULLS LAST, created_at ASC",
    )
    total_slip_days = 0
    critical_flags = 0
    next_milestone_date = None

    for milestone in milestones:
        baseline = milestone.get("baseline_date")
        current = milestone.get("current_date")
        actual = milestone.get("actual_date")
        anchor = actual or current or baseline
        if anchor is not None and next_milestone_date is None:
            next_milestone_date = anchor
        if baseline and current and current > baseline:
            total_slip_days += (current - baseline).days
        if milestone.get("is_critical"):
            critical_flags += 1

    if total_slip_days <= 7:
        health = "on_track"
    elif total_slip_days <= 21:
        health = "watch"
    else:
        health = "at_risk"

    return {
        "project_id": str(project_id),
        "schedule_health": health,
        "total_slip_days": total_slip_days,
        "critical_flags": critical_flags,
        "next_milestone_date": next_milestone_date,
        "items": milestones,
    }


def list_risks(*, env_id: UUID, business_id: UUID, project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_risks
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        return cur.fetchall()


def create_risk(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_risks
            (env_id, business_id, project_id, risk_title, probability, impact_amount, impact_days, mitigation_owner, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), payload["risk_title"], _q(payload["probability"]),
                _q(payload.get("impact_amount")), int(payload.get("impact_days") or 0), payload.get("mitigation_owner"), payload.get("status") or "open",
                payload.get("created_by"), payload.get("created_by")
            ),
        )
        row = cur.fetchone()

        cur.execute(
            """
            UPDATE pds_projects
            SET risk_score = (
                SELECT COALESCE(AVG(probability * impact_amount), 0)
                FROM pds_risks
                WHERE project_id = %s::uuid AND status IN ('open', 'mitigating')
            ),
            updated_by = %s,
            updated_at = now()
            WHERE project_id = %s::uuid
            """,
            (str(project_id), payload.get("created_by"), str(project_id)),
        )
        return row


def create_survey_response(*, env_id: UUID, business_id: UUID, project_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_survey_responses
            (env_id, business_id, project_id, survey_template_id, vendor_name, respondent_type, score, responses_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), str(payload["survey_template_id"]) if payload.get("survey_template_id") else None,
                payload.get("vendor_name"), payload["respondent_type"], _q(payload.get("score")) if payload.get("score") is not None else None,
                json.dumps(payload.get("responses_json") or {}), payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def get_project_overview(*, env_id: UUID, business_id: UUID, project_id: UUID) -> dict:
    project = get_project(env_id=env_id, business_id=business_id, project_id=project_id)
    budget = get_project_budget(env_id=env_id, business_id=business_id, project_id=project_id)
    schedule = get_project_schedule(env_id=env_id, business_id=business_id, project_id=project_id)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              COALESCE(COUNT(*) FILTER (WHERE status IN ('open', 'mitigating')), 0) AS open_risks,
              COALESCE(COUNT(*) FILTER (WHERE impact_amount >= 100000 OR impact_days >= 14), 0) AS high_risks
            FROM pds_risks
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        risk_counts = cur.fetchone() or {}

        cur.execute(
            """
            SELECT
              COALESCE(COUNT(*) FILTER (WHERE status IN ('pending', 'approved')), 0) AS open_change_orders,
              COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0) AS pending_change_orders
            FROM pds_change_orders
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        co_counts = cur.fetchone() or {}

        cur.execute(
            """
            SELECT
              COALESCE(COUNT(*) FILTER (WHERE status IN ('open', 'responded', 'in_review')), 0) AS open_rfis,
              COALESCE(COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status <> 'closed'), 0) AS overdue_rfis
            FROM pds_rfis
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        rfi_counts = cur.fetchone() or {}

        cur.execute(
            """
            SELECT COALESCE(COUNT(*), 0) AS site_report_count
            FROM pds_site_reports
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        report_count = cur.fetchone() or {}

    recent_activity = []
    for row in list_project_change_orders(env_id=env_id, business_id=business_id, project_id=project_id)[:4]:
        recent_activity.append(
            {
                "type": "change_order",
                "label": row.get("change_order_ref"),
                "status": row.get("status"),
                "created_at": row.get("created_at"),
            }
        )
    for row in list_rfis(env_id=env_id, business_id=business_id, project_id=project_id)[:4]:
        recent_activity.append(
            {
                "type": "rfi",
                "label": row.get("rfi_number"),
                "status": row.get("status"),
                "created_at": row.get("created_at"),
            }
        )
    for row in list_project_site_reports(env_id=env_id, business_id=business_id, project_id=project_id)[:4]:
        recent_activity.append(
            {
                "type": "site_report",
                "label": row.get("report_date"),
                "status": "logged",
                "created_at": row.get("created_at"),
            }
        )
    recent_activity.sort(key=lambda item: datetime_sort_key(item.get("created_at")), reverse=True)

    team_size = 1 if project.get("project_manager") else 0

    return {
        "project": project,
        "budget": budget["totals"],
        "schedule": {
            "schedule_health": schedule["schedule_health"],
            "total_slip_days": schedule["total_slip_days"],
            "critical_flags": schedule["critical_flags"],
            "next_milestone_date": schedule["next_milestone_date"],
            "items": schedule["items"][:8],
        },
        "counts": {
            "open_risks": int(risk_counts.get("open_risks") or 0),
            "high_risks": int(risk_counts.get("high_risks") or 0),
            "open_change_orders": int(co_counts.get("open_change_orders") or 0),
            "pending_change_orders": int(co_counts.get("pending_change_orders") or 0),
            "open_rfis": int(rfi_counts.get("open_rfis") or 0),
            "overdue_rfis": int(rfi_counts.get("overdue_rfis") or 0),
            "site_report_count": int(report_count.get("site_report_count") or 0),
            "team_size": team_size,
        },
        "recent_activity": recent_activity[:8],
    }


def _fetch_period_inputs(cur, *, env_id: UUID, business_id: UUID, project_id: UUID, period: str) -> dict:
    cur.execute("SELECT * FROM pds_projects WHERE project_id = %s::uuid", (str(project_id),))
    project = cur.fetchone()
    if not project:
        raise LookupError("Project not found")

    cur.execute(
        "SELECT * FROM pds_budget_versions WHERE project_id = %s::uuid AND period = %s ORDER BY version_no ASC",
        (str(project_id), period),
    )
    budget_versions = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_budget_revisions WHERE project_id = %s::uuid AND period = %s ORDER BY created_at ASC",
        (str(project_id), period),
    )
    revisions = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_commitment_lines WHERE project_id = %s::uuid AND period = %s ORDER BY created_at ASC",
        (str(project_id), period),
    )
    commitments = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_invoices WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    invoices = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_payments WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    payments = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_forecast_versions WHERE project_id = %s::uuid AND period = %s ORDER BY version_no ASC",
        (str(project_id), period),
    )
    forecasts = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_change_orders WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    change_orders = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_milestones WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    milestones = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_risks WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    risks = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_survey_responses WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    surveys = cur.fetchall()

    cur.execute(
        "SELECT * FROM pds_punch_items WHERE project_id = %s::uuid ORDER BY created_at ASC",
        (str(project_id),),
    )
    punch_items = cur.fetchall()

    return {
        "project": project,
        "budget_versions": budget_versions,
        "revisions": revisions,
        "commitments": commitments,
        "invoices": invoices,
        "payments": payments,
        "forecasts": forecasts,
        "change_orders": change_orders,
        "milestones": milestones,
        "risks": risks,
        "surveys": surveys,
        "punch_items": punch_items,
    }


def run_snapshot(*, env_id: UUID, business_id: UUID, period: str, project_id: UUID | None = None, run_id: str | None = None, actor: str | None = None) -> dict:
    run_id = run_id or f"pds-run-{uuid4()}"

    with get_cursor() as cur:
        if project_id:
            cur.execute(
                "SELECT project_id FROM pds_projects WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid",
                (str(env_id), str(business_id), str(project_id)),
            )
        else:
            cur.execute(
                "SELECT project_id FROM pds_projects WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
                (str(env_id), str(business_id)),
            )
        project_rows = cur.fetchall()
        if not project_rows:
            raise LookupError("No projects found for snapshot run")

        per_project_results: list[dict] = []
        agg = {
            "approved_budget": Decimal("0"),
            "revisions_amount": Decimal("0"),
            "committed": Decimal("0"),
            "invoiced": Decimal("0"),
            "paid": Decimal("0"),
            "forecast_to_complete": Decimal("0"),
            "eac": Decimal("0"),
            "variance": Decimal("0"),
            "contingency_remaining": Decimal("0"),
            "pending_change_orders": Decimal("0"),
            "open_change_order_count": 0,
            "pending_approval_count": 0,
            "top_risk_count": 0,
        }

        for row in project_rows:
            pid = UUID(str(row["project_id"]))
            inputs = _fetch_period_inputs(cur, env_id=env_id, business_id=business_id, project_id=pid, period=period)

            budget_state = pds_engines.compute_budget_state(
                period=period,
                project_row=inputs["project"],
                budget_versions=inputs["budget_versions"],
                revisions=inputs["revisions"],
                commitments=inputs["commitments"],
                invoices=inputs["invoices"],
                payments=inputs["payments"],
                forecasts=inputs["forecasts"],
                change_orders=inputs["change_orders"],
            )
            schedule_state = pds_engines.compute_schedule_state(period=period, milestones=inputs["milestones"])
            risk_state = pds_engines.compute_risk_state(period=period, risks=inputs["risks"])
            vendor_scores = pds_engines.compute_vendor_scores(
                period=period,
                survey_responses=inputs["surveys"],
                punch_items=inputs["punch_items"],
                disputes=[],
            )

            cur.execute(
                """
                INSERT INTO pds_schedule_snapshots
                (env_id, business_id, project_id, period, milestone_health, total_slip_days, critical_flags,
                 snapshot_hash, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, project_id, period) DO UPDATE
                  SET milestone_health = EXCLUDED.milestone_health,
                      total_slip_days = EXCLUDED.total_slip_days,
                      critical_flags = EXCLUDED.critical_flags,
                      snapshot_hash = EXCLUDED.snapshot_hash,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = now()
                RETURNING schedule_snapshot_id
                """,
                (
                    str(env_id), str(business_id), str(pid), period,
                    schedule_state.milestone_health, schedule_state.total_slip_days, schedule_state.critical_flags,
                    schedule_state.snapshot_hash, actor, actor,
                ),
            )
            schedule_row = cur.fetchone()

            cur.execute(
                """
                INSERT INTO pds_risk_snapshots
                (env_id, business_id, project_id, period, expected_exposure, expected_impact_days, top_risk_count,
                 snapshot_hash, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, project_id, period) DO UPDATE
                  SET expected_exposure = EXCLUDED.expected_exposure,
                      expected_impact_days = EXCLUDED.expected_impact_days,
                      top_risk_count = EXCLUDED.top_risk_count,
                      snapshot_hash = EXCLUDED.snapshot_hash,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = now()
                RETURNING risk_snapshot_id
                """,
                (
                    str(env_id), str(business_id), str(pid), period,
                    budget_state.variance if risk_state.expected_exposure is None else risk_state.expected_exposure,
                    risk_state.expected_impact_days,
                    risk_state.top_risk_count,
                    risk_state.snapshot_hash,
                    actor,
                    actor,
                ),
            )
            risk_row = cur.fetchone()

            vendor_ids: list[str] = []
            for vendor in vendor_scores:
                cur.execute(
                    """
                    INSERT INTO pds_vendor_score_snapshots
                    (env_id, business_id, project_id, vendor_name, period, vendor_score, on_time_rate,
                     punch_speed_score, dispute_count, snapshot_hash, created_by, updated_by)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (env_id, project_id, vendor_name, period) DO UPDATE
                      SET vendor_score = EXCLUDED.vendor_score,
                          on_time_rate = EXCLUDED.on_time_rate,
                          punch_speed_score = EXCLUDED.punch_speed_score,
                          dispute_count = EXCLUDED.dispute_count,
                          snapshot_hash = EXCLUDED.snapshot_hash,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = now()
                    RETURNING vendor_score_snapshot_id
                    """,
                    (
                        str(env_id), str(business_id), str(pid), vendor.vendor_name, period,
                        vendor.vendor_score, vendor.on_time_rate, vendor.punch_speed_score, vendor.dispute_count,
                        vendor.snapshot_hash, actor, actor,
                    ),
                )
                vendor_ids.append(str(cur.fetchone()["vendor_score_snapshot_id"]))

            cur.execute(
                """
                INSERT INTO pds_portfolio_snapshots
                (env_id, business_id, project_id, period, approved_budget, revisions_amount, committed, invoiced, paid,
                 forecast_to_complete, eac, variance, contingency_remaining, pending_change_orders,
                 open_change_order_count, pending_approval_count, top_risk_count, snapshot_hash, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, project_id, period) DO UPDATE
                  SET approved_budget = EXCLUDED.approved_budget,
                      revisions_amount = EXCLUDED.revisions_amount,
                      committed = EXCLUDED.committed,
                      invoiced = EXCLUDED.invoiced,
                      paid = EXCLUDED.paid,
                      forecast_to_complete = EXCLUDED.forecast_to_complete,
                      eac = EXCLUDED.eac,
                      variance = EXCLUDED.variance,
                      contingency_remaining = EXCLUDED.contingency_remaining,
                      pending_change_orders = EXCLUDED.pending_change_orders,
                      open_change_order_count = EXCLUDED.open_change_order_count,
                      pending_approval_count = EXCLUDED.pending_approval_count,
                      top_risk_count = EXCLUDED.top_risk_count,
                      snapshot_hash = EXCLUDED.snapshot_hash,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = now()
                RETURNING portfolio_snapshot_id
                """,
                (
                    str(env_id), str(business_id), str(pid), period,
                    budget_state.approved_budget,
                    budget_state.revisions_amount,
                    budget_state.committed,
                    budget_state.invoiced,
                    budget_state.paid,
                    budget_state.forecast_to_complete,
                    budget_state.eac,
                    budget_state.variance,
                    budget_state.contingency_remaining,
                    budget_state.pending_change_orders,
                    budget_state.open_change_order_count,
                    budget_state.pending_approval_count,
                    risk_state.top_risk_count,
                    budget_state.snapshot_hash,
                    actor,
                    actor,
                ),
            )
            portfolio_row = cur.fetchone()

            cur.execute(
                """
                UPDATE pds_projects
                SET approved_budget = %s,
                    committed_amount = %s,
                    spent_amount = %s,
                    forecast_at_completion = %s,
                    contingency_remaining = %s,
                    pending_change_order_amount = %s,
                    next_milestone_date = %s,
                    risk_score = %s,
                    updated_by = %s,
                    updated_at = now()
                WHERE project_id = %s::uuid
                """,
                (
                    budget_state.approved_budget + budget_state.revisions_amount,
                    budget_state.committed,
                    budget_state.invoiced,
                    budget_state.eac,
                    budget_state.contingency_remaining,
                    budget_state.pending_change_orders,
                    schedule_state.next_milestone_date,
                    risk_state.expected_exposure,
                    actor,
                    str(pid),
                ),
            )

            per_project_results.append(
                {
                    "project_id": str(pid),
                    "portfolio_snapshot_id": str(portfolio_row["portfolio_snapshot_id"]),
                    "schedule_snapshot_id": str(schedule_row["schedule_snapshot_id"]),
                    "risk_snapshot_id": str(risk_row["risk_snapshot_id"]),
                    "vendor_snapshot_ids": vendor_ids,
                    "snapshot_hash": budget_state.snapshot_hash,
                }
            )

            agg["approved_budget"] += budget_state.approved_budget
            agg["revisions_amount"] += budget_state.revisions_amount
            agg["committed"] += budget_state.committed
            agg["invoiced"] += budget_state.invoiced
            agg["paid"] += budget_state.paid
            agg["forecast_to_complete"] += budget_state.forecast_to_complete
            agg["eac"] += budget_state.eac
            agg["variance"] += budget_state.variance
            agg["contingency_remaining"] += budget_state.contingency_remaining
            agg["pending_change_orders"] += budget_state.pending_change_orders
            agg["open_change_order_count"] += budget_state.open_change_order_count
            agg["pending_approval_count"] += budget_state.pending_approval_count
            agg["top_risk_count"] += risk_state.top_risk_count

        overall_hash = pds_engines.compute_budget_state(
            period=period,
            project_row={"approved_budget": agg["approved_budget"], "contingency_budget": agg["contingency_remaining"]},
            budget_versions=[{"version_no": 1, "approved_budget": agg["approved_budget"]}],
            revisions=[{"amount_delta": agg["revisions_amount"], "status": "approved"}],
            commitments=[{"amount": agg["committed"]}],
            invoices=[{"amount": agg["invoiced"]}],
            payments=[{"amount": agg["paid"]}],
            forecasts=[{"version_no": 1, "forecast_to_complete": agg["forecast_to_complete"], "eac": agg["eac"]}],
            change_orders=[{"status": "pending", "amount_impact": agg["pending_change_orders"]}],
        ).snapshot_hash

        cur.execute(
            """
            INSERT INTO pds_portfolio_snapshots
            (env_id, business_id, project_id, period, approved_budget, revisions_amount, committed, invoiced, paid,
             forecast_to_complete, eac, variance, contingency_remaining, pending_change_orders, open_change_order_count,
             pending_approval_count, top_risk_count, snapshot_hash, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING portfolio_snapshot_id
            """,
            (
                str(env_id), str(business_id), period,
                agg["approved_budget"], agg["revisions_amount"], agg["committed"], agg["invoiced"], agg["paid"],
                agg["forecast_to_complete"], agg["eac"], agg["variance"], agg["contingency_remaining"],
                agg["pending_change_orders"], agg["open_change_order_count"], agg["pending_approval_count"], agg["top_risk_count"],
                overall_hash, actor, actor,
            ),
        )
        aggregate_row = cur.fetchone()

        emit_log(
            level="info",
            service="backend",
            action="pds.snapshot.run",
            message="PDS snapshot run complete",
            context={
                "run_id": run_id,
                "env_id": str(env_id),
                "business_id": str(business_id),
                "period": period,
                "project_id": str(project_id) if project_id else None,
                "snapshot_id": str(aggregate_row["portfolio_snapshot_id"]),
            },
        )

        primary = per_project_results[0]
        return {
            "run_id": run_id,
            "env_id": str(env_id),
            "business_id": str(business_id),
            "period": period,
            "project_id": primary["project_id"],
            "snapshot_hash": overall_hash,
            "portfolio_snapshot_id": primary["portfolio_snapshot_id"],
            "schedule_snapshot_id": primary["schedule_snapshot_id"],
            "risk_snapshot_id": primary["risk_snapshot_id"],
            "vendor_snapshot_ids": primary["vendor_snapshot_ids"],
            "projects": per_project_results,
            "aggregate_portfolio_snapshot_id": str(aggregate_row["portfolio_snapshot_id"]),
        }


def run_report_pack(*, env_id: UUID, business_id: UUID, period: str, run_id: str | None = None, actor: str | None = None) -> dict:
    run_id = run_id or f"pds-report-{uuid4()}"
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_portfolio_snapshots
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND period = %s AND project_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), period),
        )
        portfolio = cur.fetchone()
        if not portfolio:
            raise LookupError("No portfolio snapshot found for period. Run snapshot first.")

        cur.execute(
            """
            SELECT *
            FROM pds_schedule_snapshots
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND period = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), period),
        )
        schedule = cur.fetchone() or {"milestone_health": "unknown", "total_slip_days": 0, "critical_flags": 0, "snapshot_hash": None}

        cur.execute(
            """
            SELECT *
            FROM pds_risk_snapshots
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND period = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), period),
        )
        risk = cur.fetchone() or {"expected_exposure": 0, "top_risk_count": 0, "snapshot_hash": None}

        cur.execute(
            """
            SELECT *
            FROM pds_portfolio_snapshots
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND period <> %s AND project_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), period),
        )
        prior = cur.fetchone()

        assembly = pds_engines.assemble_reporting_pack(
            period=period,
            portfolio_snapshot=portfolio,
            schedule_snapshot=schedule,
            risk_snapshot=risk,
            prior_portfolio_snapshot=prior,
        )

        cur.execute(
            """
            INSERT INTO pds_report_runs
            (env_id, business_id, period, run_id, status, snapshot_hash, deterministic_deltas_json,
             artifact_refs_json, narrative_text, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, 'completed', %s, %s::jsonb, %s::jsonb, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), period, run_id,
                assembly.snapshot_hash,
                json.dumps(assembly.deterministic_deltas),
                json.dumps(assembly.artifact_refs),
                assembly.narrative,
                actor,
                actor,
            ),
        )
        row = cur.fetchone()

        emit_log(
            level="info",
            service="backend",
            action="pds.report_pack.run",
            message="PDS report pack assembled",
            context={
                "run_id": run_id,
                "env_id": str(env_id),
                "business_id": str(business_id),
                "period": period,
                "snapshot_id": str(row["report_run_id"]),
            },
        )

        return row


def get_portfolio_kpis(*, env_id: UUID, business_id: UUID, period: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_portfolio_snapshots
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND period = %s AND project_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), period),
        )
        snap = cur.fetchone()
        if snap:
            return {
                "env_id": snap["env_id"],
                "business_id": snap["business_id"],
                "period": snap["period"],
                "approved_budget": snap["approved_budget"],
                "committed": snap["committed"],
                "spent": snap["invoiced"],
                "eac": snap["eac"],
                "variance": snap["variance"],
                "contingency_remaining": snap["contingency_remaining"],
                "open_change_order_count": snap["open_change_order_count"],
                "pending_approval_count": snap["pending_approval_count"],
                "top_risk_count": snap["top_risk_count"],
            }

        cur.execute(
            """
            SELECT
              COALESCE(SUM(approved_budget), 0) AS approved_budget,
              COALESCE(SUM(committed_amount), 0) AS committed,
              COALESCE(SUM(spent_amount), 0) AS spent,
              COALESCE(SUM(forecast_at_completion), 0) AS eac,
              COALESCE(SUM(contingency_remaining), 0) AS contingency_remaining,
              COALESCE(SUM(pending_change_order_amount), 0) AS pending_change_orders
            FROM pds_projects
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        totals = cur.fetchone() or {}

        cur.execute(
            """
            SELECT
              COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0) AS pending_approval_count,
              COALESCE(COUNT(*) FILTER (WHERE status IN ('pending', 'approved')), 0) AS open_change_order_count
            FROM pds_change_orders
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        cos = cur.fetchone() or {}

        cur.execute(
            """
            SELECT COALESCE(COUNT(*), 0) AS top_risk_count
            FROM pds_risks
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'mitigating')
              AND (impact_amount >= 100000 OR impact_days >= 30)
            """,
            (str(env_id), str(business_id)),
        )
        risks = cur.fetchone() or {}

        approved_budget = _q(totals.get("approved_budget"))
        eac = _q(totals.get("eac"))

        return {
            "env_id": str(env_id),
            "business_id": str(business_id),
            "period": period,
            "approved_budget": approved_budget,
            "committed": _q(totals.get("committed")),
            "spent": _q(totals.get("spent")),
            "eac": eac,
            "variance": approved_budget - eac,
            "contingency_remaining": _q(totals.get("contingency_remaining")),
            "open_change_order_count": int(cos.get("open_change_order_count") or 0),
            "pending_approval_count": int(cos.get("pending_approval_count") or 0),
            "top_risk_count": int(risks.get("top_risk_count") or 0),
        }


def get_portfolio_health(
    *,
    env_id: UUID,
    business_id: UUID,
    period: str,
    lookahead_days: int = 7,
    milestone_window_days: int = 14,
) -> dict:
    today = date.today()
    lookahead_end = today + timedelta(days=lookahead_days)
    milestone_window_end = today + timedelta(days=milestone_window_days)
    spend_window_end = today + timedelta(days=30)

    kpis = get_portfolio_kpis(env_id=env_id, business_id=business_id, period=period)
    projects = list_projects(env_id=env_id, business_id=business_id, limit=200)
    active_projects = [row for row in projects if row.get("status") == "active"]
    active_project_ids = {str(row["project_id"]) for row in active_projects}
    project_name_by_id = {str(row["project_id"]): row.get("name") for row in active_projects}

    milestones_by_project: dict[str, list[dict[str, Any]]] = {}
    change_orders_by_project: dict[str, list[dict[str, Any]]] = {}
    risks_by_project: dict[str, list[dict[str, Any]]] = {}
    rfis_by_project: dict[str, list[dict[str, Any]]] = {}
    punch_by_project: dict[str, list[dict[str, Any]]] = {}
    inspections_by_project: dict[str, list[dict[str, Any]]] = {}
    submittals_by_project: dict[str, list[dict[str, Any]]] = {}
    permits_by_project: dict[str, list[dict[str, Any]]] = {}
    claims_by_project: dict[str, list[dict[str, Any]]] = {}
    incidents_by_project: dict[str, list[dict[str, Any]]] = {}

    upcoming_milestones: list[dict[str, Any]] = []
    upcoming_milestones_7d_count = 0
    upcoming_spend_30d = Decimal("0")

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_milestones
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY COALESCE(current_date, baseline_date) ASC NULLS LAST, created_at ASC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key not in active_project_ids:
                continue
            milestones_by_project.setdefault(project_key, []).append(row)

            target_date = _coerce_date(row.get("current_date") or row.get("baseline_date"))
            actual_date = _coerce_date(row.get("actual_date"))
            if actual_date is not None or target_date is None or target_date < today:
                continue

            if target_date <= lookahead_end:
                upcoming_milestones_7d_count += 1

            if target_date > milestone_window_end:
                continue

            metadata = row.get("metadata_json") if isinstance(row.get("metadata_json"), dict) else {}
            baseline_date = _coerce_date(row.get("baseline_date"))
            milestone_status = "slipping" if baseline_date and target_date > baseline_date else "due_soon"
            upcoming_milestones.append(
                {
                    "project_id": row["project_id"],
                    "project_name": project_name_by_id.get(project_key) or "Untitled Project",
                    "milestone_id": row["milestone_id"],
                    "milestone_name": row.get("milestone_name"),
                    "date": target_date,
                    "owner": row.get("owner_name") or metadata.get("owner_name") or metadata.get("owner") or row.get("updated_by"),
                    "status": milestone_status,
                    "href": _project_href(env_id=env_id, project_id=row["project_id"], section="schedule"),
                }
            )

        cur.execute(
            """
            SELECT *
            FROM pds_change_orders
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('pending', 'approved')
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                change_orders_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_risks
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'mitigating')
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                risks_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_rfis
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'resolved')
            ORDER BY due_date ASC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                rfis_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_punch_items
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'complete', 'resolved')
            ORDER BY due_date ASC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                punch_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_inspections
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'completed', 'approved')
            ORDER BY inspection_date ASC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                inspections_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_submittals
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('approved', 'closed')
            ORDER BY required_date ASC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                submittals_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_permits
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'cancelled')
            ORDER BY COALESCE(required_by_date, expiration_date) ASC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                permits_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT
              c.*,
              COALESCE(v.vendor_name, c.vendor_name) AS resolved_vendor_name
            FROM pds_contractor_claims c
            LEFT JOIN pds_vendors v ON v.vendor_id = c.vendor_id
            WHERE c.env_id = %s::uuid
              AND c.business_id = %s::uuid
              AND c.status NOT IN ('closed', 'resolved', 'withdrawn')
            ORDER BY c.response_due_at ASC NULLS LAST, c.created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                claims_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT *
            FROM pds_incidents
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'resolved')
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        for row in cur.fetchall():
            project_key = str(row["project_id"])
            if project_key in active_project_ids:
                incidents_by_project.setdefault(project_key, []).append(row)

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS upcoming_spend_30d
            FROM pds_payments
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND payment_date BETWEEN %s AND %s
              AND status <> 'cancelled'
            """,
            (str(env_id), str(business_id), today, spend_window_end),
        )
        spend_row = cur.fetchone() or {}
        upcoming_spend_30d = _q(spend_row.get("upcoming_spend_30d"))

    upcoming_milestones.sort(key=lambda row: (row["date"], row["project_name"] or ""))

    attention_rows: list[tuple[int, dict[str, Any]]] = []
    queue_rows: list[tuple[int, dict[str, Any]]] = []
    projects_at_risk_count = 0
    behind_schedule_count = 0
    over_budget_count = 0
    pending_change_order_count = 0
    pending_change_order_value_total = Decimal("0")

    for project in active_projects:
        project_id = project["project_id"]
        project_key = str(project_id)
        project_name = project.get("name") or "Untitled Project"

        approved_budget = _q(project.get("approved_budget"))
        forecast_at_completion = _q(project.get("forecast_at_completion"))
        budget_overrun = max(forecast_at_completion - approved_budget, Decimal("0"))
        budget_variance_pct = (
            (budget_overrun / approved_budget) if approved_budget else Decimal("0")
        )

        project_milestones = milestones_by_project.get(project_key, [])
        schedule_slippage_days = 0
        critical_slippage_days = 0
        next_milestone_date = _coerce_date(project.get("next_milestone_date"))
        for milestone in project_milestones:
            baseline = _coerce_date(milestone.get("baseline_date"))
            actual = _coerce_date(milestone.get("actual_date"))
            current = _coerce_date(milestone.get("current_date") or milestone.get("baseline_date"))
            target = actual or current or baseline

            if actual is None and current and current >= today:
                if next_milestone_date is None or current < next_milestone_date:
                    next_milestone_date = current

            if baseline and target and target > baseline:
                slip_days = (target - baseline).days
                schedule_slippage_days += slip_days
                if milestone.get("is_critical"):
                    critical_slippage_days += slip_days

        effective_schedule_slip = critical_slippage_days or schedule_slippage_days

        project_change_orders = change_orders_by_project.get(project_key, [])
        pending_change_orders = [row for row in project_change_orders if row.get("status") == "pending"]
        pending_change_order_count += len(pending_change_orders)
        pending_change_order_value = sum((_q(row.get("amount_impact")) for row in pending_change_orders), Decimal("0"))
        pending_change_order_value_total += pending_change_order_value
        max_pending_change_order = max((_q(row.get("amount_impact")) for row in pending_change_orders), default=Decimal("0"))
        pending_change_order_pct = (
            (pending_change_order_value / approved_budget) if approved_budget else Decimal("0")
        )

        open_risks = risks_by_project.get(project_key, [])
        high_risk_count = sum(
            1
            for row in open_risks
            if _q(row.get("impact_amount")) >= Decimal("100000") or int(row.get("impact_days") or 0) >= 14
        )

        open_rfis = rfis_by_project.get(project_key, [])
        overdue_rfi_count = sum(
            1 for row in open_rfis if (_coerce_date(row.get("due_date")) or lookahead_end) < today
        )

        open_punch = punch_by_project.get(project_key, [])
        overdue_punch_count = sum(
            1 for row in open_punch if (_coerce_date(row.get("due_date")) or lookahead_end) < today
        )

        project_inspections = inspections_by_project.get(project_key, [])
        imminent_inspection_count = sum(
            1
            for row in project_inspections
            if today <= (_coerce_date(row.get("inspection_date")) or spend_window_end) <= lookahead_end
        )

        project_submittals = submittals_by_project.get(project_key, [])
        overdue_submittal_count = sum(
            1 for row in project_submittals if (_coerce_date(row.get("required_date")) or lookahead_end) < today
        )

        project_incidents = incidents_by_project.get(project_key, [])
        open_issue_count = sum(1 for row in project_incidents if row.get("status") not in {"closed", "resolved"})
        severe_issue_count = sum(
            1 for row in project_incidents if str(row.get("severity") or "").lower() in {"high", "critical"}
        )

        permit_rows = permits_by_project.get(project_key, [])
        permit_days: list[int] = []
        for permit in permit_rows:
            permit_status = str(permit.get("status") or "").lower()
            target_date = (
                _coerce_date(permit.get("expiration_date"))
                if permit_status in {"approved", "issued"}
                else _coerce_date(permit.get("required_by_date")) or _coerce_date(permit.get("expiration_date"))
            )
            if target_date:
                permit_days.append((target_date - today).days)
        permit_expired_count = sum(1 for days in permit_days if days < 0)
        permit_expiring_count = sum(1 for days in permit_days if 0 <= days <= 14)
        nearest_permit_days = min(permit_days) if permit_days else None

        project_claims = claims_by_project.get(project_key, [])
        open_claim_count = len(project_claims)
        claim_exposure = sum(
            (
                _q(row.get("exposure_amount"))
                if row.get("exposure_amount") is not None
                else _q(row.get("claimed_amount"))
                for row in project_claims
            ),
            Decimal("0"),
        )
        severe_claim_count = sum(
            1
            for row in project_claims
            if (
                (_q(row.get("exposure_amount")) if row.get("exposure_amount") is not None else _q(row.get("claimed_amount")))
                >= Decimal("250000")
            )
        )

        candidates: list[dict[str, Any]] = []

        def add_candidate(
            *,
            reason_code: str,
            issue_type: str,
            severity: str,
            impact_label: str,
            action_label: str,
            section: str | None,
            priority: int,
        ) -> None:
            candidates.append(
                {
                    "reason_code": reason_code,
                    "issue_type": issue_type,
                    "severity": severity,
                    "impact_label": impact_label,
                    "action_label": action_label,
                    "section": section,
                    "priority": priority,
                }
            )

        if approved_budget and budget_overrun > 0:
            if budget_variance_pct >= Decimal("0.05") or budget_overrun >= Decimal("500000"):
                over_budget_count += 1
                add_candidate(
                    reason_code="BUDGET_OVERRUN",
                    issue_type="Budget Overrun",
                    severity="red",
                    impact_label=_format_currency_label(budget_overrun, prefix_plus=True),
                    action_label="Review Budget",
                    section="financials",
                    priority=100,
                )
            elif budget_variance_pct >= Decimal("0.02"):
                over_budget_count += 1
                add_candidate(
                    reason_code="BUDGET_OVERRUN",
                    issue_type="Budget Overrun",
                    severity="yellow",
                    impact_label=_format_currency_label(budget_overrun, prefix_plus=True),
                    action_label="Review Budget",
                    section="financials",
                    priority=90,
                )

        if effective_schedule_slip >= 14:
            behind_schedule_count += 1
            add_candidate(
                reason_code="SCHEDULE_SLIP",
                issue_type="Schedule Delay",
                severity="red",
                impact_label=_format_day_label(effective_schedule_slip),
                action_label="View Timeline",
                section="schedule",
                priority=95,
            )
        elif effective_schedule_slip >= 7:
            behind_schedule_count += 1
            add_candidate(
                reason_code="SCHEDULE_SLIP",
                issue_type="Schedule Delay",
                severity="yellow",
                impact_label=_format_day_label(effective_schedule_slip),
                action_label="View Timeline",
                section="schedule",
                priority=85,
            )

        if pending_change_orders:
            if pending_change_order_pct >= Decimal("0.03") or max_pending_change_order >= Decimal("250000"):
                add_candidate(
                    reason_code="CHANGE_ORDER_EXPOSURE",
                    issue_type="Change Order Exposure",
                    severity="red",
                    impact_label=_format_currency_label(pending_change_order_value),
                    action_label="Approve COs",
                    section=None,
                    priority=80,
                )
            elif pending_change_order_pct >= Decimal("0.015") or len(pending_change_orders) >= 2:
                add_candidate(
                    reason_code="CHANGE_ORDER_EXPOSURE",
                    issue_type="Change Order Exposure",
                    severity="yellow",
                    impact_label=_format_currency_label(pending_change_order_value),
                    action_label="Approve COs",
                    section=None,
                    priority=75,
                )

        if open_claim_count > 0:
            add_candidate(
                reason_code="CONTRACTOR_CLAIM",
                issue_type="Contractor Claim",
                severity="red" if severe_claim_count > 0 or claim_exposure >= Decimal("500000") else "yellow",
                impact_label=(
                    _format_currency_label(claim_exposure)
                    if claim_exposure > 0
                    else f"{open_claim_count} open claim{'s' if open_claim_count != 1 else ''}"
                ),
                action_label="Review Claim",
                section=None,
                priority=78,
            )

        if permit_expired_count > 0:
            add_candidate(
                reason_code="PERMIT_RISK",
                issue_type="Permit Delay",
                severity="red",
                impact_label="Expired",
                action_label="Review Permit",
                section=None,
                priority=82,
            )
        elif permit_expiring_count > 0 and nearest_permit_days is not None:
            add_candidate(
                reason_code="PERMIT_RISK",
                issue_type="Permit Delay",
                severity="yellow" if nearest_permit_days > 7 else "red",
                impact_label=_format_day_label(max(nearest_permit_days, 0)),
                action_label="Review Permit",
                section=None,
                priority=77,
            )

        if high_risk_count >= 2:
            add_candidate(
                reason_code="RISK_ESCALATION",
                issue_type="Risk Escalation",
                severity="red",
                impact_label=f"{high_risk_count} high risks",
                action_label="Open Issue",
                section=None,
                priority=74,
            )
        elif high_risk_count == 1:
            add_candidate(
                reason_code="RISK_ESCALATION",
                issue_type="Risk Escalation",
                severity="yellow",
                impact_label="1 high risk",
                action_label="Open Issue",
                section=None,
                priority=70,
            )

        overdue_workflow_count = overdue_rfi_count + overdue_punch_count + overdue_submittal_count + severe_issue_count
        if overdue_workflow_count >= 4:
            add_candidate(
                reason_code="OVERDUE_WORKFLOW",
                issue_type="Resolve Issues",
                severity="red",
                impact_label=f"{overdue_workflow_count} blocked items",
                action_label="Open Issue",
                section=None,
                priority=72,
            )
        elif overdue_workflow_count >= 2 or open_issue_count > 0:
            add_candidate(
                reason_code="OVERDUE_WORKFLOW",
                issue_type="Resolve Issues",
                severity="yellow",
                impact_label=f"{max(overdue_workflow_count, open_issue_count)} active items",
                action_label="Open Issue",
                section=None,
                priority=68,
            )

        if imminent_inspection_count > 0:
            add_candidate(
                reason_code="UPCOMING_INSPECTION",
                issue_type="Upcoming Inspection",
                severity="yellow",
                impact_label=f"{imminent_inspection_count} scheduled",
                action_label="View Timeline",
                section="schedule",
                priority=60,
            )

        if candidates:
            projects_at_risk_count += 1
            candidates.sort(
                key=lambda item: (
                    2 if item["severity"] == "red" else 1,
                    item["priority"],
                ),
                reverse=True,
            )
            primary = candidates[0]
            attention_rows.append(
                (
                    (2 if primary["severity"] == "red" else 1) * 100 + primary["priority"],
                    {
                        "project_id": project_id,
                        "project_name": project_name,
                        "project_code": project.get("project_code"),
                        "issue_type": primary["issue_type"],
                        "severity": primary["severity"],
                        "impact_label": primary["impact_label"],
                        "reason_codes": [item["reason_code"] for item in candidates],
                        "recommended_action": {
                            "label": primary["action_label"],
                            "href": _project_href(env_id=env_id, project_id=project_id, section=primary["section"]),
                        },
                        "project_manager": project.get("project_manager"),
                        "next_milestone_date": next_milestone_date,
                        "last_updated_at": project.get("updated_at"),
                    },
                )
            )

        if pending_change_orders:
            earliest_due = min(
                (
                    _coerce_date(row.get("approval_due_at"))
                    or _coerce_date(
                        (row.get("metadata_json") or {}).get("approval_due_at")
                        if isinstance(row.get("metadata_json"), dict)
                        else None
                    )
                    or lookahead_end
                    for row in pending_change_orders
                ),
                default=None,
            )
            queue_rows.append(
                (
                    90,
                    {
                        "queue_item_type": "approve_change_orders",
                        "priority": "high" if pending_change_order_value >= Decimal("250000") else "medium",
                        "title": f"Approve {len(pending_change_orders)} change order{'s' if len(pending_change_orders) != 1 else ''}",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": earliest_due if earliest_due != lookahead_end else None,
                        "why_it_matters": f"{_format_currency_label(pending_change_order_value)} waiting for approval",
                        "href": _project_href(env_id=env_id, project_id=project_id),
                    },
                )
            )

        if open_claim_count > 0:
            earliest_claim_due = min(
                (
                    _coerce_date(row.get("response_due_at")) or spend_window_end
                    for row in project_claims
                ),
                default=None,
            )
            queue_rows.append(
                (
                    75,
                    {
                        "queue_item_type": "review_contractor_claim",
                        "priority": "high" if claim_exposure >= Decimal("500000") or severe_claim_count > 0 else "medium",
                        "title": f"Review {open_claim_count} contractor claim{'s' if open_claim_count != 1 else ''}",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": earliest_claim_due if earliest_claim_due != spend_window_end else None,
                        "why_it_matters": (
                            f"{_format_currency_label(claim_exposure)} of claim exposure"
                            if claim_exposure > 0
                            else "Open contractor claim needs response"
                        ),
                        "href": _project_href(env_id=env_id, project_id=project_id),
                    },
                )
            )

        if budget_overrun > 0 and budget_variance_pct >= Decimal("0.02"):
            queue_rows.append(
                (
                    80,
                    {
                        "queue_item_type": "review_budget_variance",
                        "priority": "high" if budget_overrun >= Decimal("500000") else "medium",
                        "title": "Review budget variance",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": None,
                        "why_it_matters": f"Forecast is {_format_currency_label(budget_overrun, prefix_plus=True)} over plan",
                        "href": _project_href(env_id=env_id, project_id=project_id, section="financials"),
                    },
                )
            )

        if overdue_workflow_count > 0:
            queue_rows.append(
                (
                    70,
                    {
                        "queue_item_type": "resolve_issues",
                        "priority": "high" if overdue_workflow_count >= 4 else "medium",
                        "title": "Resolve field issues",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": None,
                        "why_it_matters": f"{overdue_workflow_count} overdue workflow item{'s' if overdue_workflow_count != 1 else ''}",
                        "href": _project_href(env_id=env_id, project_id=project_id),
                    },
                )
            )

        if permit_expired_count > 0 or permit_expiring_count > 0:
            queue_rows.append(
                (
                    65,
                    {
                        "queue_item_type": "review_permits",
                        "priority": "high" if permit_expired_count > 0 else "medium",
                        "title": "Review permit status",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": None if nearest_permit_days is None else today + timedelta(days=max(nearest_permit_days, 0)),
                        "why_it_matters": (
                            "One or more permits have expired"
                            if permit_expired_count > 0
                            else f"{permit_expiring_count} permit{'s' if permit_expiring_count != 1 else ''} nearing deadline"
                        ),
                        "href": _project_href(env_id=env_id, project_id=project_id),
                    },
                )
            )

        if imminent_inspection_count > 0:
            next_inspection = min(
                (
                    _coerce_date(row.get("inspection_date"))
                    for row in project_inspections
                    if _coerce_date(row.get("inspection_date")) is not None
                ),
                default=None,
            )
            queue_rows.append(
                (
                    60,
                    {
                        "queue_item_type": "upcoming_inspection",
                        "priority": "medium",
                        "title": "Prepare upcoming inspection",
                        "project_id": project_id,
                        "project_name": project_name,
                        "due_date": next_inspection,
                        "why_it_matters": f"{imminent_inspection_count} inspection{'s' if imminent_inspection_count != 1 else ''} scheduled soon",
                        "href": _project_href(env_id=env_id, project_id=project_id, section="schedule"),
                    },
                )
            )

    attention_rows.sort(key=lambda item: item[0], reverse=True)
    queue_rows.sort(key=lambda item: item[0], reverse=True)

    summary = {
        "active_projects": {
            "value": len(active_projects),
            "state": "green" if active_projects else "yellow",
        },
        "projects_at_risk": {
            "value": projects_at_risk_count,
            "state": _metric_state(projects_at_risk_count, yellow_threshold=1, red_threshold=3),
        },
        "behind_schedule": {
            "value": behind_schedule_count,
            "state": _metric_state(behind_schedule_count, yellow_threshold=1, red_threshold=3),
        },
        "over_budget": {
            "value": over_budget_count,
            "state": _metric_state(over_budget_count, yellow_threshold=1, red_threshold=2),
        },
        "pending_change_orders": {
            "value": pending_change_order_count,
            "state": _metric_state(pending_change_order_count, yellow_threshold=1, red_threshold=5),
        },
        "upcoming_milestones_7d": {
            "value": upcoming_milestones_7d_count,
            "state": _metric_state(upcoming_milestones_7d_count, yellow_threshold=4, red_threshold=8),
        },
    }

    return {
        "generated_at": utc_now(),
        "period": period,
        "summary": summary,
        "projects_requiring_attention": [row for _, row in attention_rows[:12]],
        "upcoming_milestones": upcoming_milestones[:12],
        "financial_health": {
            "approved_budget": _q(kpis.get("approved_budget")),
            "committed": _q(kpis.get("committed")),
            "spent": _q(kpis.get("spent")),
            "eac_forecast": _q(kpis.get("eac")),
            "variance": _q(kpis.get("variance")),
            "upcoming_spend_30d": upcoming_spend_30d,
            "pending_change_order_value": pending_change_order_value_total,
        },
        "user_action_queue": [row for _, row in queue_rows[:12]],
    }


def get_portfolio_dashboard(*, env_id: UUID, business_id: UUID, period: str) -> dict:
    kpis = get_portfolio_kpis(env_id=env_id, business_id=business_id, period=period)
    projects = list_projects(env_id=env_id, business_id=business_id, limit=100)

    project_cards: list[dict] = []
    alerts: list[dict] = []
    recent_activity: list[dict] = []

    for project in projects:
        project_id = UUID(str(project["project_id"]))
        schedule = get_project_schedule(env_id=env_id, business_id=business_id, project_id=project_id)
        overview = get_project_overview(env_id=env_id, business_id=business_id, project_id=project_id)

        approved_budget = _q(project.get("approved_budget"))
        eac = _q(project.get("forecast_at_completion"))
        spent = _q(project.get("spent_amount"))
        budget_used_ratio = (spent / approved_budget) if approved_budget else Decimal("0")
        budget_variance = approved_budget - eac

        card = {
            "project_id": str(project_id),
            "name": project.get("name"),
            "project_code": project.get("project_code"),
            "sector": project.get("sector"),
            "stage": project.get("stage"),
            "status": project.get("status"),
            "project_manager": project.get("project_manager"),
            "schedule_health": schedule["schedule_health"],
            "total_slip_days": schedule["total_slip_days"],
            "budget_variance": budget_variance,
            "budget_used_ratio": budget_used_ratio,
            "open_rfis": overview["counts"]["open_rfis"],
            "open_risks": overview["counts"]["open_risks"],
            "pending_change_orders": overview["counts"]["pending_change_orders"],
            "next_milestone_date": schedule["next_milestone_date"],
        }
        project_cards.append(card)

        if budget_variance < 0:
            alerts.append(
                {
                    "project_id": str(project_id),
                    "type": "budget",
                    "severity": "high",
                    "message": f"{project.get('name')} is forecast over budget.",
                }
            )
        if schedule["schedule_health"] == "at_risk":
            alerts.append(
                {
                    "project_id": str(project_id),
                    "type": "schedule",
                    "severity": "medium",
                    "message": f"{project.get('name')} is behind schedule.",
                }
            )
        if overview["counts"]["overdue_rfis"] > 0:
            alerts.append(
                {
                    "project_id": str(project_id),
                    "type": "rfi",
                    "severity": "medium",
                    "message": f"{project.get('name')} has overdue RFIs.",
                }
            )

        for item in overview["recent_activity"][:2]:
            activity = dict(item)
            activity["project_id"] = str(project_id)
            activity["project_name"] = project.get("name")
            recent_activity.append(activity)

    recent_activity.sort(key=lambda item: datetime_sort_key(item.get("created_at")), reverse=True)

    approved_budget = _q(kpis.get("approved_budget"))
    on_budget_count = sum(1 for card in project_cards if card["budget_variance"] >= 0)
    on_schedule_count = sum(1 for card in project_cards if card["schedule_health"] == "on_track")

    return {
        "period": period,
        "kpis": {
            **kpis,
            "active_project_count": len([project for project in projects if project.get("status") == "active"]),
            "project_count": len(projects),
            "projects_on_budget_pct": (Decimal(on_budget_count) / Decimal(len(project_cards))) if project_cards else Decimal("0"),
            "projects_on_schedule_pct": (Decimal(on_schedule_count) / Decimal(len(project_cards))) if project_cards else Decimal("0"),
            "budget_used_ratio": (_q(kpis.get("spent")) / approved_budget) if approved_budget else Decimal("0"),
        },
        "projects": project_cards,
        "alerts": alerts[:12],
        "recent_activity": recent_activity[:12],
    }


def _ensure_phase2_demo_records(*, env_id: UUID, business_id: UUID, project_ids: list[UUID], actor: str) -> None:
    for index, project_id in enumerate(project_ids):
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT
                  COALESCE((SELECT COUNT(*) FROM pds_permits WHERE project_id = %s::uuid), 0) AS permit_count,
                  COALESCE((SELECT COUNT(*) FROM pds_contractor_claims WHERE project_id = %s::uuid), 0) AS claim_count
                """,
                (str(project_id), str(project_id)),
            )
            counts = cur.fetchone() or {}

        if int(counts.get("permit_count") or 0) == 0:
            create_permit(
                env_id=env_id,
                business_id=business_id,
                project_id=project_id,
                payload={
                    "permit_type": "Building Permit" if index == 0 else "Fire Marshal Signoff",
                    "authority_name": "City Building Department" if index == 0 else "County Fire Marshal",
                    "status": "pending" if index == 0 else "under_review",
                    "required_by_date": date.today() + timedelta(days=5 + (index * 4)),
                    "expiration_date": date.today() + timedelta(days=18 + (index * 7)),
                    "owner_name": "Permitting Lead",
                    "blocking_flag": index == 0,
                    "notes": "Seeded mission control permit",
                    "created_by": actor,
                },
            )

        if int(counts.get("claim_count") or 0) == 0:
            create_contractor_claim(
                env_id=env_id,
                business_id=business_id,
                project_id=project_id,
                payload={
                    "vendor_name": "Prime Build Co" if index == 0 else "Atlas Mechanical",
                    "claim_type": "delay" if index == 0 else "scope",
                    "status": "open",
                    "claimed_amount": Decimal("480000") if index == 0 else Decimal("185000"),
                    "exposure_amount": Decimal("325000") if index == 0 else Decimal("125000"),
                    "received_at": utc_now(),
                    "response_due_at": date.today() + timedelta(days=3 + (index * 2)),
                    "owner_name": "Project Executive",
                    "summary": "Seeded contractor claim for mission control alerting",
                    "created_by": actor,
                },
            )


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT project_id FROM pds_projects WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at ASC",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchall()
        if existing:
            existing_ids = [UUID(str(row["project_id"])) for row in existing]
            _ensure_phase2_demo_records(env_id=env_id, business_id=business_id, project_ids=existing_ids[:2], actor=actor)
            return {"seeded": False, "project_ids": [str(project_id) for project_id in existing_ids], "phase2_backfilled": True}

    # 8 projects with varied stages, budgets, and risk profiles
    project_specs = [
        {
            "name": "Downtown Tower Renovation",
            "stage": "construction",
            "project_manager": "A. Thompson",
            "approved_budget": Decimal("24500000"),
            "forecast_at_completion": Decimal("26200000"),  # 7% over — stress
            "contingency_budget": Decimal("1250000"),
        },
        {
            "name": "Riverside Mixed Use Phase II",
            "stage": "preconstruction",
            "project_manager": "L. Morgan",
            "approved_budget": Decimal("18250000"),
            "forecast_at_completion": Decimal("17800000"),  # Under budget — healthy
            "contingency_budget": Decimal("910000"),
        },
        {
            "name": "Federal Campus Consolidation",
            "stage": "construction",
            "project_manager": "D. Washington",
            "approved_budget": Decimal("34800000"),
            "forecast_at_completion": Decimal("36500000"),  # 5% over
            "contingency_budget": Decimal("1740000"),
        },
        {
            "name": "Midwest Distribution Center",
            "stage": "construction",
            "project_manager": "K. Okonkwo",
            "approved_budget": Decimal("12600000"),
            "forecast_at_completion": Decimal("12200000"),  # Under budget
            "contingency_budget": Decimal("630000"),
        },
        {
            "name": "Texas Refinery Turnaround",
            "stage": "construction",
            "project_manager": "M. Santos",
            "approved_budget": Decimal("8900000"),
            "forecast_at_completion": Decimal("10200000"),  # 15% over — red
            "contingency_budget": Decimal("445000"),
        },
        {
            "name": "BioTech Lab Expansion",
            "stage": "preconstruction",
            "project_manager": "T. Yamamoto",
            "approved_budget": Decimal("5200000"),
            "forecast_at_completion": Decimal("5100000"),  # Slightly under
            "contingency_budget": Decimal("260000"),
        },
        {
            "name": "Southeast Medical Complex",
            "stage": "closeout",
            "project_manager": "C. Patel",
            "approved_budget": Decimal("21000000"),
            "forecast_at_completion": Decimal("21800000"),  # 4% over
            "contingency_budget": Decimal("1050000"),
        },
        {
            "name": "Public Safety Training Center",
            "stage": "construction",
            "project_manager": "R. Nguyen",
            "approved_budget": Decimal("3200000"),
            "forecast_at_completion": Decimal("3100000"),  # Under budget
            "contingency_budget": Decimal("160000"),
        },
    ]

    created_projects = []
    for spec in project_specs:
        project = create_project(
            env_id=env_id,
            business_id=business_id,
            payload={
                **spec,
                "next_milestone_date": date.today(),
                "currency_code": "USD",
                "created_by": actor,
            },
        )
        created_projects.append(project)

    # Per-project change orders, risks, and surveys
    change_order_amounts = [
        Decimal("125000"), Decimal("85000"), Decimal("310000"), Decimal("45000"),
        Decimal("220000"), Decimal("30000"), Decimal("175000"), Decimal("25000"),
    ]
    for index, project in enumerate(created_projects):
        pid = UUID(str(project["project_id"]))
        create_budget_baseline(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "period": f"{date.today().year}-{date.today().month:02d}",
                "approved_budget": Decimal(project["approved_budget"]),
                "lines": [
                    {"cost_code": "01", "line_label": "General Conditions", "approved_amount": Decimal(project["approved_budget"]) * Decimal("0.14")},
                    {"cost_code": "02", "line_label": "Structural", "approved_amount": Decimal(project["approved_budget"]) * Decimal("0.26")},
                ],
                "created_by": actor,
            },
        )
        create_change_order(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "change_order_ref": f"CO-{str(pid)[:8]}",
                "amount_impact": change_order_amounts[index % len(change_order_amounts)],
                "schedule_impact_days": 7 + (index * 3),
                "approval_required": True,
                "created_by": actor,
            },
        )
        create_risk(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "risk_title": ["Long lead electrical gear delivery", "Permitting delay risk", "Subcontractor capacity constraint",
                               "Material price escalation", "Weather delay exposure", "Design coordination gap",
                               "Inspection backlog", "Supply chain disruption"][index % 8],
                "probability": Decimal("0.45") + (Decimal(index % 3) * Decimal("0.1")),
                "impact_amount": Decimal("275000") + (Decimal(index) * Decimal("50000")),
                "impact_days": 14 + (index * 5),
                "mitigation_owner": "Procurement Lead",
                "status": "open",
                "created_by": actor,
            },
        )
        survey_scores = [Decimal("4.2"), Decimal("3.5"), Decimal("4.6"), Decimal("3.9"),
                         Decimal("2.8"), Decimal("4.4"), Decimal("3.7"), Decimal("4.1")]
        create_survey_response(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "vendor_name": ["Prime Build Co", "Atlas Construction", "Horizon Builders", "Summit GC",
                                "Pinnacle Constructors", "Vanguard CM", "Keystone Builders", "Apex Contractors"][index % 8],
                "respondent_type": "contractor",
                "score": survey_scores[index % len(survey_scores)],
                "responses_json": {"on_time": str(Decimal("0.88") - (Decimal(index) * Decimal("0.04"))), "punch_speed": "0.79"},
                "created_by": actor,
            },
        )

    project_ids = [UUID(str(p["project_id"])) for p in created_projects]
    _ensure_phase2_demo_records(
        env_id=env_id,
        business_id=business_id,
        project_ids=project_ids[:2],
        actor=actor,
    )

    return {"seeded": True, "project_ids": [str(pid) for pid in project_ids]}
