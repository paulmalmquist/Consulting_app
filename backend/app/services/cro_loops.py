"""Consulting Revenue OS – Loop Intelligence service.

V1 scope:
- environment-scoped loop registry
- deterministic labor cost calculations
- intervention snapshots
- seed data for the Novendor consulting workspace
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from app.db import get_cursor

_MONEY_QUANT = Decimal("0.01")
_STATUSES = ("observed", "simplifying", "automating", "stabilized")

_DEFAULT_LOOPS = [
    {
        "name": "Monthly Financial Reporting Loop",
        "process_domain": "reporting",
        "description": "Consolidate monthly finance and operating data into the leadership reporting pack.",
        "trigger_type": "scheduled",
        "frequency_type": "monthly",
        "frequency_per_year": Decimal("12"),
        "status": "observed",
        "control_maturity_stage": 2,
        "automation_readiness_score": 58,
        "avg_wait_time_minutes": Decimal("180"),
        "rework_rate_percent": Decimal("12"),
        "roles": [
            {"role_name": "Analyst", "loaded_hourly_rate": Decimal("95"), "active_minutes": Decimal("180"), "notes": "Data consolidation"},
            {"role_name": "Controller", "loaded_hourly_rate": Decimal("145"), "active_minutes": Decimal("75"), "notes": "Review and sign-off"},
        ],
    },
    {
        "name": "Vendor Onboarding Loop",
        "process_domain": "compliance",
        "description": "Collect required vendor records and coordinate risk review approvals.",
        "trigger_type": "manual",
        "frequency_type": "weekly",
        "frequency_per_year": Decimal("52"),
        "status": "simplifying",
        "control_maturity_stage": 3,
        "automation_readiness_score": 64,
        "avg_wait_time_minutes": Decimal("240"),
        "rework_rate_percent": Decimal("18"),
        "roles": [
            {"role_name": "Operations Lead", "loaded_hourly_rate": Decimal("88"), "active_minutes": Decimal("60"), "notes": "Intake and checklist"},
            {"role_name": "Compliance Manager", "loaded_hourly_rate": Decimal("132"), "active_minutes": Decimal("45"), "notes": "Risk review"},
            {"role_name": "Legal Reviewer", "loaded_hourly_rate": Decimal("210"), "active_minutes": Decimal("20"), "notes": "Contract exceptions"},
        ],
    },
    {
        "name": "Invoice Approval Loop",
        "process_domain": "finance",
        "description": "Review vendor invoices, validate support, and route for approval before payment.",
        "trigger_type": "event",
        "frequency_type": "weekly",
        "frequency_per_year": Decimal("104"),
        "status": "automating",
        "control_maturity_stage": 4,
        "automation_readiness_score": 76,
        "avg_wait_time_minutes": Decimal("90"),
        "rework_rate_percent": Decimal("8"),
        "roles": [
            {"role_name": "AP Specialist", "loaded_hourly_rate": Decimal("72"), "active_minutes": Decimal("25"), "notes": "Review and coding"},
            {"role_name": "Finance Manager", "loaded_hourly_rate": Decimal("138"), "active_minutes": Decimal("12"), "notes": "Approval gate"},
        ],
    },
    {
        "name": "Change Order Approval Loop",
        "process_domain": "operations",
        "description": "Assemble impact summaries and route project change orders for approval.",
        "trigger_type": "manual",
        "frequency_type": "monthly",
        "frequency_per_year": Decimal("24"),
        "status": "simplifying",
        "control_maturity_stage": 3,
        "automation_readiness_score": 61,
        "avg_wait_time_minutes": Decimal("300"),
        "rework_rate_percent": Decimal("15"),
        "roles": [
            {"role_name": "Project Manager", "loaded_hourly_rate": Decimal("118"), "active_minutes": Decimal("50"), "notes": "Impact summary"},
            {"role_name": "Finance Analyst", "loaded_hourly_rate": Decimal("92"), "active_minutes": Decimal("35"), "notes": "Cost update"},
            {"role_name": "Executive Sponsor", "loaded_hourly_rate": Decimal("240"), "active_minutes": Decimal("10"), "notes": "Final approval"},
        ],
    },
    {
        "name": "KPI Dashboard Refresh Loop",
        "process_domain": "reporting",
        "description": "Refresh recurring KPI dashboards and reconcile stale data before distribution.",
        "trigger_type": "scheduled",
        "frequency_type": "weekly",
        "frequency_per_year": Decimal("52"),
        "status": "stabilized",
        "control_maturity_stage": 4,
        "automation_readiness_score": 82,
        "avg_wait_time_minutes": Decimal("45"),
        "rework_rate_percent": Decimal("6"),
        "roles": [
            {"role_name": "BI Analyst", "loaded_hourly_rate": Decimal("110"), "active_minutes": Decimal("40"), "notes": "Refresh + reconcile"},
            {"role_name": "Ops Manager", "loaded_hourly_rate": Decimal("128"), "active_minutes": Decimal("15"), "notes": "Variance review"},
        ],
    },
]


def _to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _compute_costs(loop: dict, roles: list[dict]) -> dict:
    base_role_cost_total = sum(
        (_to_decimal(role["active_minutes"]) / Decimal("60")) * _to_decimal(role["loaded_hourly_rate"])
        for role in roles
    )
    loop_cost_per_run_raw = base_role_cost_total * (
        Decimal("1") + (_to_decimal(loop.get("rework_rate_percent")) / Decimal("100"))
    )
    annual_estimated_cost_raw = loop_cost_per_run_raw * _to_decimal(loop.get("frequency_per_year"))
    return {
        "role_count": len(roles),
        "loop_cost_per_run": _money(loop_cost_per_run_raw),
        "annual_estimated_cost": _money(annual_estimated_cost_raw),
    }


def _validate_client_scope(cur, *, env_id: str, business_id: UUID, client_id: UUID | None) -> None:
    if not client_id:
        return
    cur.execute(
        """
        SELECT id
        FROM cro_client
        WHERE id = %s AND env_id = %s AND business_id = %s
        """,
        (str(client_id), env_id, str(business_id)),
    )
    if not cur.fetchone():
        raise ValueError(f"Client {client_id} is not available in environment {env_id}.")


def _fetch_loop_row(cur, *, loop_id: UUID, env_id: str, business_id: UUID) -> dict:
    cur.execute(
        """
        SELECT id, env_id, business_id, client_id, name, process_domain, description,
               trigger_type, frequency_type, frequency_per_year, status,
               control_maturity_stage, automation_readiness_score,
               avg_wait_time_minutes, rework_rate_percent,
               created_at, updated_at
        FROM nv_loop
        WHERE id = %s AND env_id = %s AND business_id = %s
        """,
        (str(loop_id), env_id, str(business_id)),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"Loop {loop_id} not found")
    return row


def _fetch_roles(cur, *, loop_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, loop_id, role_name, loaded_hourly_rate, active_minutes, notes,
               created_at, updated_at
        FROM nv_loop_role
        WHERE loop_id = %s
        ORDER BY created_at ASC, id ASC
        """,
        (str(loop_id),),
    )
    return cur.fetchall()


def _fetch_interventions(cur, *, loop_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, loop_id, intervention_type, notes, before_snapshot,
               after_snapshot, observed_delta_percent, created_at, updated_at
        FROM nv_loop_intervention
        WHERE loop_id = %s
        ORDER BY created_at DESC, id DESC
        """,
        (str(loop_id),),
    )
    rows = cur.fetchall()
    return [{**row, "loop_metrics": None} for row in rows]


def _assemble_loop_detail(loop: dict, roles: list[dict], interventions: list[dict]) -> dict:
    metrics = _compute_costs(loop, roles)
    return {
        **loop,
        **metrics,
        "roles": roles,
        "interventions": interventions,
    }


def _insert_roles(cur, *, loop_id: UUID, roles: list[dict]) -> None:
    for role in roles:
        cur.execute(
            """
            INSERT INTO nv_loop_role
              (loop_id, role_name, loaded_hourly_rate, active_minutes, notes)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                str(loop_id),
                role["role_name"],
                str(_to_decimal(role["loaded_hourly_rate"])),
                str(_to_decimal(role["active_minutes"])),
                role.get("notes"),
            ),
        )


def _build_snapshot(*, loop: dict, roles: list[dict], computed: dict) -> dict:
    return {
        "schema_version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "loop": _json_safe(loop),
        "roles": _json_safe(roles),
        "computed": _json_safe(computed),
    }


def list_loops(
    *,
    env_id: str,
    business_id: UUID,
    client_id: UUID | None = None,
    status: str | None = None,
    domain: str | None = None,
    min_cost: Decimal | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        sql = """
            SELECT id, env_id, business_id, client_id, name, process_domain, description,
                   trigger_type, frequency_type, frequency_per_year, status,
                   control_maturity_stage, automation_readiness_score,
                   avg_wait_time_minutes, rework_rate_percent,
                   created_at, updated_at
            FROM nv_loop
            WHERE env_id = %s AND business_id = %s
        """
        params: list[object] = [env_id, str(business_id)]

        if client_id:
            sql += " AND client_id = %s"
            params.append(str(client_id))
        if status:
            sql += " AND status = %s"
            params.append(status)
        if domain:
            sql += " AND process_domain = %s"
            params.append(domain)

        sql += " ORDER BY created_at DESC, id DESC"
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

        results = []
        for row in rows:
            roles = _fetch_roles(cur, loop_id=row["id"])
            computed = _compute_costs(row, roles)
            if min_cost is not None and computed["annual_estimated_cost"] < min_cost:
                continue
            results.append({**row, **computed})
        return results


def get_loop_detail(*, loop_id: UUID, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        loop = _fetch_loop_row(cur, loop_id=loop_id, env_id=env_id, business_id=business_id)
        roles = _fetch_roles(cur, loop_id=loop_id)
        interventions = _fetch_interventions(cur, loop_id=loop_id)
        return _assemble_loop_detail(loop, roles, interventions)


def create_loop(*, env_id: str, business_id: UUID, roles: list[dict], **fields) -> dict:
    with get_cursor() as cur:
        _validate_client_scope(cur, env_id=env_id, business_id=business_id, client_id=fields.get("client_id"))
        cur.execute(
            """
            INSERT INTO nv_loop (
              env_id, business_id, client_id, name, process_domain, description,
              trigger_type, frequency_type, frequency_per_year, status,
              control_maturity_stage, automation_readiness_score,
              avg_wait_time_minutes, rework_rate_percent
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, client_id, name, process_domain, description,
                      trigger_type, frequency_type, frequency_per_year, status,
                      control_maturity_stage, automation_readiness_score,
                      avg_wait_time_minutes, rework_rate_percent,
                      created_at, updated_at
            """,
            (
                env_id,
                str(business_id),
                str(fields["client_id"]) if fields.get("client_id") else None,
                fields["name"],
                fields["process_domain"],
                fields.get("description"),
                fields["trigger_type"],
                fields["frequency_type"],
                str(_to_decimal(fields["frequency_per_year"])),
                fields["status"],
                fields["control_maturity_stage"],
                fields["automation_readiness_score"],
                str(_to_decimal(fields.get("avg_wait_time_minutes"))),
                str(_to_decimal(fields.get("rework_rate_percent"))),
            ),
        )
        loop = cur.fetchone()
        _insert_roles(cur, loop_id=loop["id"], roles=roles)
        role_rows = _fetch_roles(cur, loop_id=loop["id"])
        return _assemble_loop_detail(loop, role_rows, [])


def update_loop(
    *,
    loop_id: UUID,
    env_id: str,
    business_id: UUID,
    roles: list[dict] | None = None,
    **fields,
) -> dict:
    with get_cursor() as cur:
        _validate_client_scope(cur, env_id=env_id, business_id=business_id, client_id=fields.get("client_id"))
        cur.execute(
            """
            UPDATE nv_loop
            SET client_id = %s,
                name = %s,
                process_domain = %s,
                description = %s,
                trigger_type = %s,
                frequency_type = %s,
                frequency_per_year = %s,
                status = %s,
                control_maturity_stage = %s,
                automation_readiness_score = %s,
                avg_wait_time_minutes = %s,
                rework_rate_percent = %s,
                updated_at = now()
            WHERE id = %s AND env_id = %s AND business_id = %s
            RETURNING id, env_id, business_id, client_id, name, process_domain, description,
                      trigger_type, frequency_type, frequency_per_year, status,
                      control_maturity_stage, automation_readiness_score,
                      avg_wait_time_minutes, rework_rate_percent,
                      created_at, updated_at
            """,
            (
                str(fields["client_id"]) if fields.get("client_id") else None,
                fields["name"],
                fields["process_domain"],
                fields.get("description"),
                fields["trigger_type"],
                fields["frequency_type"],
                str(_to_decimal(fields["frequency_per_year"])),
                fields["status"],
                fields["control_maturity_stage"],
                fields["automation_readiness_score"],
                str(_to_decimal(fields.get("avg_wait_time_minutes"))),
                str(_to_decimal(fields.get("rework_rate_percent"))),
                str(loop_id),
                env_id,
                str(business_id),
            ),
        )
        loop = cur.fetchone()
        if not loop:
            raise LookupError(f"Loop {loop_id} not found")

        if roles is not None:
            cur.execute("DELETE FROM nv_loop_role WHERE loop_id = %s", (str(loop_id),))
            _insert_roles(cur, loop_id=loop_id, roles=roles)

        role_rows = _fetch_roles(cur, loop_id=loop_id)
        interventions = _fetch_interventions(cur, loop_id=loop_id)
        return _assemble_loop_detail(loop, role_rows, interventions)


def create_intervention(
    *,
    loop_id: UUID,
    env_id: str,
    business_id: UUID,
    intervention_type: str,
    notes: str | None = None,
    after_snapshot: dict | None = None,
    observed_delta_percent: Decimal | None = None,
) -> dict:
    with get_cursor() as cur:
        loop = _fetch_loop_row(cur, loop_id=loop_id, env_id=env_id, business_id=business_id)
        roles = _fetch_roles(cur, loop_id=loop_id)
        computed = _compute_costs(loop, roles)
        before_snapshot = _build_snapshot(loop=loop, roles=roles, computed=computed)

        cur.execute(
            """
            INSERT INTO nv_loop_intervention
              (loop_id, intervention_type, notes, before_snapshot, after_snapshot, observed_delta_percent)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, loop_id, intervention_type, notes, before_snapshot,
                      after_snapshot, observed_delta_percent, created_at, updated_at
            """,
            (
                str(loop_id),
                intervention_type,
                notes,
                before_snapshot,
                _json_safe(after_snapshot) if after_snapshot else None,
                str(observed_delta_percent) if observed_delta_percent is not None else None,
            ),
        )
        row = cur.fetchone()
        return {**row, "loop_metrics": computed}


def get_loop_summary(
    *,
    env_id: str,
    business_id: UUID,
    client_id: UUID | None = None,
    status: str | None = None,
    domain: str | None = None,
    min_cost: Decimal | None = None,
) -> dict:
    loops = list_loops(
        env_id=env_id,
        business_id=business_id,
        client_id=client_id,
        status=status,
        domain=domain,
        min_cost=min_cost,
    )
    total_annual_cost = sum((loop["annual_estimated_cost"] for loop in loops), Decimal("0"))
    loop_count = len(loops)
    avg_maturity = (
        Decimal(str(sum(loop["control_maturity_stage"] for loop in loops))) / Decimal(str(loop_count))
        if loop_count
        else Decimal("0")
    )
    status_counts = {key: 0 for key in _STATUSES}
    for loop in loops:
        status_counts[loop["status"]] = status_counts.get(loop["status"], 0) + 1

    top_5_by_cost = [
        {
            "id": loop["id"],
            "name": loop["name"],
            "annual_estimated_cost": loop["annual_estimated_cost"],
        }
        for loop in sorted(loops, key=lambda item: item["annual_estimated_cost"], reverse=True)[:5]
    ]

    return {
        "total_annual_cost": _money(total_annual_cost),
        "loop_count": loop_count,
        "avg_maturity_stage": avg_maturity.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "top_5_by_cost": top_5_by_cost,
        "status_counts": status_counts,
    }


def seed_default_loops(*, env_id: str, business_id: UUID) -> int:
    seeded = 0
    with get_cursor() as cur:
        for loop in _DEFAULT_LOOPS:
            cur.execute(
                """
                SELECT id
                FROM nv_loop
                WHERE env_id = %s AND business_id = %s AND name = %s
                """,
                (env_id, str(business_id), loop["name"]),
            )
            if cur.fetchone():
                continue

            cur.execute(
                """
                INSERT INTO nv_loop (
                  env_id, business_id, client_id, name, process_domain, description,
                  trigger_type, frequency_type, frequency_per_year, status,
                  control_maturity_stage, automation_readiness_score,
                  avg_wait_time_minutes, rework_rate_percent
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id,
                    str(business_id),
                    None,
                    loop["name"],
                    loop["process_domain"],
                    loop["description"],
                    loop["trigger_type"],
                    loop["frequency_type"],
                    str(loop["frequency_per_year"]),
                    loop["status"],
                    loop["control_maturity_stage"],
                    loop["automation_readiness_score"],
                    str(loop["avg_wait_time_minutes"]),
                    str(loop["rework_rate_percent"]),
                ),
            )
            row = cur.fetchone()
            _insert_roles(cur, loop_id=row["id"], roles=loop["roles"])
            seeded += 1
    return seeded
