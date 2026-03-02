from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor
from app.observability.logger import emit_log
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
             project_manager, start_date, target_end_date, approved_budget, contingency_budget,
             contingency_remaining, next_milestone_date, currency_code, created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
        filtered["responded_at"] = datetime.utcnow()
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
    recent_activity.sort(key=lambda item: item.get("created_at") or datetime.min, reverse=True)

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

    recent_activity.sort(key=lambda item: item.get("created_at") or datetime.min, reverse=True)

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


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT project_id FROM pds_projects WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchone()
        if existing:
            return {"seeded": False, "project_ids": [str(existing["project_id"])]}

    project_a = create_project(
        env_id=env_id,
        business_id=business_id,
        payload={
            "name": "Downtown Tower Renovation",
            "stage": "construction",
            "project_manager": "A. Thompson",
            "approved_budget": Decimal("24500000"),
            "contingency_budget": Decimal("1250000"),
            "next_milestone_date": date.today(),
            "currency_code": "USD",
            "created_by": actor,
        },
    )
    project_b = create_project(
        env_id=env_id,
        business_id=business_id,
        payload={
            "name": "Riverside Mixed Use Phase II",
            "stage": "preconstruction",
            "project_manager": "L. Morgan",
            "approved_budget": Decimal("18250000"),
            "contingency_budget": Decimal("910000"),
            "next_milestone_date": date.today(),
            "currency_code": "USD",
            "created_by": actor,
        },
    )

    for project in (project_a, project_b):
        pid = UUID(str(project["project_id"]))
        create_budget_baseline(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "period": f"{date.today().year}-{date.today().month:02d}",
                "approved_budget": Decimal(project["approved_budget"]),
                "lines": [
                    {"cost_code": "01", "line_label": "General Conditions", "approved_amount": Decimal("3500000")},
                    {"cost_code": "02", "line_label": "Structural", "approved_amount": Decimal("6400000")},
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
                "amount_impact": Decimal("125000"),
                "schedule_impact_days": 7,
                "approval_required": True,
                "created_by": actor,
            },
        )
        create_risk(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "risk_title": "Long lead electrical gear delivery",
                "probability": Decimal("0.45"),
                "impact_amount": Decimal("275000"),
                "impact_days": 21,
                "mitigation_owner": "Procurement Lead",
                "status": "open",
                "created_by": actor,
            },
        )
        create_survey_response(
            env_id=env_id,
            business_id=business_id,
            project_id=pid,
            payload={
                "vendor_name": "Prime Build Co",
                "respondent_type": "contractor",
                "score": Decimal("4.2"),
                "responses_json": {"on_time": "0.88", "punch_speed": "0.79"},
                "created_by": actor,
            },
        )

    return {"seeded": True, "project_ids": [str(project_a["project_id"]), str(project_b["project_id"])]}
