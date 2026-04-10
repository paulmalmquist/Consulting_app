from __future__ import annotations

import json
import logging
from io import BytesIO
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from app.db import get_cursor
from app.services.datetime_normalization import coerce_utc_datetime, utc_now
from app.services import pds as pds_core
from app.services.pds_executive import queue as queue_svc
from app.services.workspace_templates import resolve_workspace_template_key

logger = logging.getLogger(__name__)

VALID_LENSES = {"market", "account", "project", "resource", "business_line"}
VALID_HORIZONS = {"MTD", "QTD", "YTD", "Forecast"}
VALID_ROLE_PRESETS = {"executive", "market_leader", "account_director", "project_lead", "business_line_leader"}
PIPELINE_STAGE_ORDER = ["prospect", "pursuit", "negotiation", "won", "converted", "lost"]
PIPELINE_BOARD_STAGES = ["prospect", "pursuit", "negotiation", "won", "converted"]
PIPELINE_ACTIVE_STAGES = {"prospect", "pursuit", "negotiation", "won"}
PIPELINE_WON_STAGES = {"won", "converted"}
PIPELINE_CLOSED_STAGES = {"converted", "lost"}
HOME_REASON_LABELS = {
    "staffing": "staffing pressure",
    "utilization": "utilization",
    "delinquent_timecards": "delinquent timecards",
    "backlog": "backlog coverage",
    "closeout": "closeout drag",
    "client_risk": "client risk",
    "ci_miss": "CI miss",
    "pipeline_slip": "pipeline slip",
    "forecast_risk": "forecast risk",
}
MARKET_GEO_FALLBACKS = {
    "neh": (42.0, -72.5),
    "northeast": (42.0, -72.5),
    "maps": (39.2, -76.0),
    "mid-atlantic": (39.2, -76.0),
    "sfl": (26.1, -80.3),
    "south florida": (26.1, -80.3),
}


def _q(value: Any) -> Decimal:
    return pds_core._q(value)


def _table_exists(table_name: str) -> bool:
    with get_cursor() as cur:
        cur.execute("SELECT to_regclass(%s) IS NOT NULL AS exists", (table_name,))
        row = cur.fetchone() or {}
    return bool(row.get("exists"))


def _table_rows_or_empty(
    *,
    key: str,
    table_name: str,
    sql: str,
    env_id: UUID,
    business_id: UUID,
) -> list[dict[str, Any]]:
    if not _table_exists(table_name):
        logger.warning("Optional PDS table missing; returning empty rows", extra={"table": table_name, "key": key})
        return []

    with get_cursor() as cur:
        cur.execute(sql, (str(env_id), str(business_id)))
        return cur.fetchall()


def _ensure_workspace_lazy(*, env_id: UUID, business_id: UUID) -> None:
    """Fast-path workspace check: only runs full ensure if snapshots don't exist yet.

    This avoids the expensive refresh_snapshots() call on every read request.
    Full refresh should happen via the /seed or /refresh-snapshots endpoints.
    """
    if not _table_exists("pds_market_performance_snapshot"):
        logger.warning(
            "PDS market snapshot table missing; skipping lazy workspace bootstrap",
            extra={"env_id": str(env_id), "business_id": str(business_id)},
        )
        return

    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM pds_market_performance_snapshot WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        if cur.fetchone() is not None:
            return  # Snapshots exist — skip expensive seeding
    # Cold workspace — run full initialization with advisory lock
    with get_cursor() as cur:
        cur.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext(%s))",
            (f"pds_enterprise:{env_id}:{business_id}",),
        )
        got_lock = cur.fetchone()
        if got_lock and got_lock.get("pg_try_advisory_xact_lock"):
            ensure_enterprise_workspace(env_id=env_id, business_id=business_id)


def _coerce_date(value: Any) -> date | None:
    return pds_core._coerce_date(value)


def _project_href(*, env_id: UUID, project_id: UUID, section: str | None = None) -> str:
    return pds_core._project_href(env_id=env_id, project_id=project_id, section=section)


def normalize_lens(lens: str | None, role_preset: str | None = None) -> str:
    raw = (lens or "").strip().lower()
    if raw in VALID_LENSES:
        return raw
    role = normalize_role_preset(role_preset)
    if role == "market_leader":
        return "market"
    if role == "business_line_leader":
        return "business_line"
    if role == "account_director":
        return "account"
    if role == "project_lead":
        return "project"
    return "market"


def normalize_horizon(horizon: str | None) -> str:
    raw = (horizon or "").strip().upper()
    if raw in VALID_HORIZONS:
        return raw
    return "YTD"


def normalize_role_preset(role_preset: str | None) -> str:
    raw = (role_preset or "").strip().lower()
    if raw in VALID_ROLE_PRESETS:
        return raw
    return "executive"


def resolve_pds_workspace_template(environment: dict[str, Any] | None = None) -> str:
    environment = environment or {}
    return (
        resolve_workspace_template_key(
            workspace_template_key=environment.get("workspace_template_key"),
            industry_type=environment.get("industry_type"),
            industry=environment.get("industry"),
        )
        or "pds_enterprise"
    )


def _today() -> date:
    return date.today()


def _quarter_start(target: date) -> date:
    return date(target.year, (((target.month - 1) // 3) * 3) + 1, 1)


def _month_start(target: date) -> date:
    return date(target.year, target.month, 1)


def _date_window(horizon: str, today: date) -> tuple[date, date]:
    if horizon == "MTD":
        return _month_start(today), today
    if horizon == "QTD":
        return _quarter_start(today), today
    if horizon == "YTD":
        return date(today.year, 1, 1), today
    return today + timedelta(days=1), today + timedelta(days=120)


def _score_band(score: Decimal) -> str:
    if score >= Decimal("70"):
        return "red"
    if score >= Decimal("50"):
        return "orange"
    if score >= Decimal("25"):
        return "yellow"
    return "green"


def _serialize_json(value: Any) -> str:
    return json.dumps(value or {})


def _serialize_list(value: Iterable[Any]) -> str:
    return json.dumps(list(value))


def _fetch_environment(env_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT env_id::text, client_name, industry, industry_type, workspace_template_key, schema_name, business_id::text AS business_id
            FROM app.environments
            WHERE env_id = %s::uuid
            LIMIT 1
            """,
            (str(env_id),),
        )
        return cur.fetchone()


def _first_of_month(today: date, months_offset: int) -> date:
    month_index = (today.month - 1) + months_offset
    year = today.year + (month_index // 12)
    month = (month_index % 12) + 1
    return date(year, month, 1)


def _sum_amount(rows: Iterable[dict[str, Any]], *, field: str, start: date, end: date, entity_key: str, entity_id: Any) -> Decimal:
    total = Decimal("0")
    for row in rows:
        row_date = _coerce_date(row.get("period_date"))
        if row_date is None or row_date < start or row_date > end:
            continue
        if entity_id is not None and row.get(entity_key) != entity_id:
            continue
        total += _q(row.get(field))
    return _q(total)


def _sum_latest_value(rows: Iterable[dict[str, Any]], *, entity_key: str, entity_id: Any) -> Decimal:
    latest_date: date | None = None
    latest_value = Decimal("0")
    for row in rows:
        if entity_id is not None and row.get(entity_key) != entity_id:
            continue
        row_date = _coerce_date(row.get("period_date"))
        if row_date is None:
            continue
        if latest_date is None or row_date >= latest_date:
            latest_date = row_date
            latest_value = _q(row.get("amount"))
    return _q(latest_value)


def _avg_value(rows: Iterable[dict[str, Any]], *, field: str, entity_key: str, entity_id: Any) -> Decimal:
    values = [_q(row.get(field)) for row in rows if row.get(entity_key) == entity_id]
    if not values:
        return Decimal("0")
    return _q(sum(values) / Decimal(len(values)))


def _clamp_decimal(value: Decimal, lower: Decimal = Decimal("0"), upper: Decimal = Decimal("100")) -> Decimal:
    if value < lower:
        return lower
    if value > upper:
        return upper
    return value


def _normalize_pct_100(value: Any) -> Decimal:
    pct = _q(value)
    if Decimal("0") <= pct <= Decimal("1.5"):
        pct *= Decimal("100")
    return _clamp_decimal(_q(pct))


def _safe_avg(values: Iterable[Decimal]) -> Decimal:
    items = list(values)
    if not items:
        return Decimal("0")
    return _q(sum(items) / Decimal(len(items)))


def _round_score(value: Decimal) -> int:
    return int(_clamp_decimal(_q(value)).quantize(Decimal("1")))


def _account_health_band(score: int | Decimal) -> str:
    numeric = int(_q(score))
    if numeric >= 75:
        return "healthy"
    if numeric >= 55:
        return "watch"
    return "at_risk"


def _account_trend(current_score: int | Decimal, previous_score: int | Decimal | None) -> str:
    if previous_score is None:
        return "stable"
    delta = _q(current_score) - _q(previous_score)
    if delta >= Decimal("5"):
        return "improving"
    if delta <= Decimal("-5"):
        return "deteriorating"
    return "stable"


def _issue_display_label(code: str | None) -> str:
    if not code:
        return "Stable"
    return code.replace("_", " ").title()


def _account_revenue_score(fee_actual: Decimal, fee_plan: Decimal) -> Decimal:
    if fee_plan <= 0:
        return Decimal("50")
    return _clamp_decimal(_q((fee_actual / fee_plan) * Decimal("100")))


def _account_staffing_score(
    team_utilization_pct: Decimal | None,
    overloaded_resources: int,
    staffing_gap_resources: int,
) -> Decimal:
    if team_utilization_pct is None:
        return Decimal("50")
    return _clamp_decimal(
        Decimal("100")
        - abs(team_utilization_pct - Decimal("85")) * Decimal("2")
        - (Decimal(overloaded_resources) * Decimal("15"))
        - (Decimal(staffing_gap_resources) * Decimal("15"))
    )


def _account_timecard_score(timecard_compliance_pct: Decimal | None) -> Decimal:
    if timecard_compliance_pct is None:
        return Decimal("50")
    return _clamp_decimal(timecard_compliance_pct)


def _account_client_score(satisfaction_score: Decimal | None) -> Decimal:
    if satisfaction_score is None or satisfaction_score <= 0:
        return Decimal("50")
    return _clamp_decimal(_q(((satisfaction_score - Decimal("3.0")) / Decimal("1.5")) * Decimal("100")))


def _account_primary_issue_code(
    *,
    fee_plan: Decimal,
    plan_variance_pct: Decimal,
    staffing_score: Decimal,
    overloaded_resources: int,
    staffing_gap_resources: int,
    timecard_compliance_pct: Decimal | None,
    delinquent_timecards: int,
    satisfaction_score: Decimal | None,
    satisfaction_trend_delta: Decimal | None,
    collections_lag: Decimal,
    writeoff_leakage: Decimal,
    red_projects: int,
) -> str | None:
    if fee_plan > 0 and plan_variance_pct < Decimal("-10"):
        return "FEE_VARIANCE"
    if staffing_score < Decimal("60") or overloaded_resources > 0 or staffing_gap_resources > 0:
        return "STAFFING_PRESSURE"
    if (timecard_compliance_pct is not None and timecard_compliance_pct < Decimal("90")) or delinquent_timecards > 0:
        return "TIMECARD_LATE"
    if satisfaction_score is not None and (satisfaction_score < Decimal("3.8") or (satisfaction_trend_delta or Decimal("0")) < 0):
        return "SATISFACTION_DECLINE"
    if collections_lag > Decimal("75000"):
        return "COLLECTIONS_LAG"
    if writeoff_leakage > Decimal("10000"):
        return "REVENUE_LEAKAGE"
    if red_projects > 0:
        return "RED_PROJECTS"
    return None


def _account_issue_action(issue_code: str | None, owner_name: str | None = None) -> tuple[str, str | None]:
    owner_fallback = owner_name or "Account Director"
    if issue_code == "FEE_VARIANCE":
        return "Review fee burn and reforecast the account plan.", owner_fallback
    if issue_code == "STAFFING_PRESSURE":
        return "Rebalance staffing coverage and resolve allocation pressure.", owner_fallback
    if issue_code == "TIMECARD_LATE":
        return "Escalate timecard cleanup before the next forecast lock.", owner_fallback
    if issue_code == "SATISFACTION_DECLINE":
        return "Schedule a client recovery touchpoint with the account team.", owner_fallback
    if issue_code == "COLLECTIONS_LAG":
        return "Review collections blockers and assign follow-up owners.", owner_fallback
    if issue_code == "REVENUE_LEAKAGE":
        return "Investigate writeoffs and close revenue leakage sources.", owner_fallback
    if issue_code == "RED_PROJECTS":
        return "Review the active risk projects and reset the intervention plan.", owner_fallback
    return "Keep the account plan current and monitor weekly.", owner_fallback


def _account_issue_impact_value(issue_code: str | None, row: dict[str, Any]) -> Decimal:
    if issue_code == "FEE_VARIANCE":
        return abs(_q(row.get("fee_actual")) - _q(row.get("fee_plan")))
    if issue_code == "STAFFING_PRESSURE":
        return Decimal(int(row.get("overloaded_resources") or 0) + int(row.get("staffing_gap_resources") or 0))
    if issue_code == "TIMECARD_LATE":
        return Decimal(int(row.get("delinquent_timecards") or 0))
    if issue_code == "SATISFACTION_DECLINE":
        score = _q(row.get("satisfaction_score"))
        return Decimal("5") - score if score > 0 else Decimal("0")
    if issue_code == "COLLECTIONS_LAG":
        return _q(row.get("collections_lag"))
    if issue_code == "REVENUE_LEAKAGE":
        return _q(row.get("writeoff_leakage"))
    if issue_code == "RED_PROJECTS":
        return Decimal(int(row.get("red_projects") or 0))
    return Decimal("0")


def _account_severity_rank(issue_code: str | None, health_score: int, impact_value: Decimal) -> int:
    issue_rank = {
        "FEE_VARIANCE": 70,
        "STAFFING_PRESSURE": 65,
        "TIMECARD_LATE": 60,
        "SATISFACTION_DECLINE": 55,
        "COLLECTIONS_LAG": 50,
        "REVENUE_LEAKAGE": 45,
        "RED_PROJECTS": 40,
    }.get(issue_code, 10)
    return issue_rank + max(0, 100 - health_score) + int(_clamp_decimal(impact_value, upper=Decimal("25")))


def _account_impact_label(issue_code: str | None, row: dict[str, Any]) -> str:
    if issue_code == "FEE_VARIANCE":
        gap = _q(row.get("fee_actual")) - _q(row.get("fee_plan"))
        return f"${abs(int(gap)):,} gap vs plan"
    if issue_code == "STAFFING_PRESSURE":
        return (
            f"{int(_q(row.get('team_utilization_pct') or 0))}% utilization, "
            f"{int(row.get('overloaded_resources') or 0)} overloaded, "
            f"{int(row.get('staffing_gap_resources') or 0)} gaps"
        )
    if issue_code == "TIMECARD_LATE":
        return (
            f"{int(_q(row.get('timecard_compliance_pct') or 0))}% submitted, "
            f"{int(row.get('delinquent_timecards') or 0)} delinquent"
        )
    if issue_code == "SATISFACTION_DECLINE":
        score = _q(row.get("satisfaction_score"))
        trend = _q(row.get("satisfaction_trend_delta"))
        return f"Score {score:.1f}, trend {trend:+.1f}"
    if issue_code == "COLLECTIONS_LAG":
        return f"${int(_q(row.get('collections_lag'))):,} in collections lag"
    if issue_code == "REVENUE_LEAKAGE":
        return f"${int(_q(row.get('writeoff_leakage'))):,} writeoff leakage"
    if issue_code == "RED_PROJECTS":
        return f"{int(row.get('red_projects') or 0)} active project risks"
    return "Stable account"


def _recent_snapshot_dates(table: str, *, env_id: UUID, business_id: UUID, horizon: str, limit: int = 2) -> list[date]:
    if not _table_exists(table):
        return []
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT DISTINCT snapshot_date
            FROM {table}
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND horizon = %s
            ORDER BY snapshot_date DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), horizon, limit),
        )
        return [_coerce_date(row.get("snapshot_date")) for row in cur.fetchall() if _coerce_date(row.get("snapshot_date"))]


def _snapshot_rows_for_date(
    table: str,
    *,
    env_id: UUID,
    business_id: UUID,
    horizon: str,
    snapshot_date: date | None,
) -> list[dict[str, Any]]:
    if snapshot_date is None:
        return []
    if not _table_exists(table):
        return []
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {table}
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND horizon = %s
              AND snapshot_date = %s
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id), horizon, snapshot_date),
        )
        return cur.fetchall()


def _build_account_project_maps(entity_rows: dict[str, list[dict[str, Any]]]) -> tuple[dict[UUID, list[UUID]], dict[UUID, set[UUID]], dict[UUID, dict[str, Any]]]:
    projects = entity_rows["projects"]
    project_map = {row["project_id"]: row for row in projects}
    project_ids_by_account: dict[UUID, list[UUID]] = {}
    resource_ids_by_account: dict[UUID, set[UUID]] = {}
    for project in projects:
        account_id = project.get("account_id")
        if account_id is None:
            continue
        project_ids_by_account.setdefault(account_id, []).append(project["project_id"])
    for assignment in entity_rows["assignments"]:
        project = project_map.get(assignment.get("project_id"))
        if not project:
            continue
        account_id = project.get("account_id")
        resource_id = assignment.get("resource_id")
        if account_id is None or resource_id is None:
            continue
        resource_ids_by_account.setdefault(account_id, set()).add(resource_id)
    return project_ids_by_account, resource_ids_by_account, project_map


def _build_account_rows_from_snapshots(
    *,
    env_id: UUID,
    business_id: UUID,
    horizon: str,
    snapshot_date: date | None,
    entity_rows: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    if snapshot_date is None:
        return []

    accounts = entity_rows["accounts"]
    project_ids_by_account, resource_ids_by_account, project_map = _build_account_project_maps(entity_rows)
    account_snapshots = {
        row["account_id"]: row
        for row in _snapshot_rows_for_date(
            "pds_account_performance_snapshot",
            env_id=env_id,
            business_id=business_id,
            horizon=horizon,
            snapshot_date=snapshot_date,
        )
    }
    resource_snapshots = {
        row["resource_id"]: row
        for row in _snapshot_rows_for_date(
            "pds_resource_utilization_snapshot",
            env_id=env_id,
            business_id=business_id,
            horizon=horizon,
            snapshot_date=snapshot_date,
        )
    }
    timecard_snapshots = {
        row.get("resource_id"): row
        for row in _snapshot_rows_for_date(
            "pds_timecard_health_snapshot",
            env_id=env_id,
            business_id=business_id,
            horizon=horizon,
            snapshot_date=snapshot_date,
        )
        if row.get("resource_id") is not None
    }
    satisfaction_snapshots = {
        row.get("account_id"): row
        for row in _snapshot_rows_for_date(
            "pds_client_satisfaction_snapshot",
            env_id=env_id,
            business_id=business_id,
            horizon=horizon,
            snapshot_date=snapshot_date,
        )
        if row.get("account_id") is not None
    }
    project_snapshots = _snapshot_rows_for_date(
        "pds_project_health_snapshot",
        env_id=env_id,
        business_id=business_id,
        horizon=horizon,
        snapshot_date=snapshot_date,
    )
    project_risk_map: dict[UUID, list[dict[str, Any]]] = {}
    for row in project_snapshots:
        project = project_map.get(row.get("project_id"))
        account_id = project.get("account_id") if project else None
        if account_id is None:
            continue
        project_risk_map.setdefault(account_id, []).append(
            {
                **row,
                "project_name": project.get("name") if project else "Project",
            }
        )

    rows: list[dict[str, Any]] = []
    for account in accounts:
        account_id = account["account_id"]
        snapshot = account_snapshots.get(account_id, {})
        resource_ids = resource_ids_by_account.get(account_id, set())
        resource_rows = [resource_snapshots[rid] for rid in resource_ids if rid in resource_snapshots]
        timecard_rows = [timecard_snapshots[rid] for rid in resource_ids if rid in timecard_snapshots]
        satisfaction_row = satisfaction_snapshots.get(account_id)
        project_rows = sorted(
            project_risk_map.get(account_id, []),
            key=lambda item: _q(item.get("risk_score")),
            reverse=True,
        )

        team_utilization_pct = _safe_avg([_normalize_pct_100(row.get("utilization_pct")) for row in resource_rows]) if resource_rows else None
        overloaded_resources = sum(1 for row in resource_rows if bool(row.get("overload_flag")))
        staffing_gap_resources = sum(1 for row in resource_rows if bool(row.get("staffing_gap_flag")))
        timecard_compliance_pct = _safe_avg([_normalize_pct_100(row.get("submitted_pct")) for row in timecard_rows]) if timecard_rows else None
        delinquent_timecards = sum(int(row.get("delinquent_count") or 0) for row in timecard_rows)

        fee_plan = _q(snapshot.get("fee_plan"))
        fee_actual = _q(snapshot.get("fee_actual"))
        plan_variance_pct = _q(((fee_actual / fee_plan) - Decimal("1")) * Decimal("100")) if fee_plan > 0 else Decimal("0")
        satisfaction_score = _q(satisfaction_row.get("average_score")) if satisfaction_row else None
        if satisfaction_score is not None and satisfaction_score <= 0:
            satisfaction_score = None
        satisfaction_trend_delta = _q(satisfaction_row.get("trend_delta")) if satisfaction_row else None
        red_projects = int(snapshot.get("red_projects") or 0)
        if red_projects == 0:
            red_projects = len([row for row in project_rows if row.get("severity") in {"orange", "red"}])

        revenue_score = _account_revenue_score(fee_actual, fee_plan)
        staffing_score = _account_staffing_score(team_utilization_pct, overloaded_resources, staffing_gap_resources)
        timecard_score = _account_timecard_score(timecard_compliance_pct)
        client_score = _account_client_score(satisfaction_score)
        health_score = _round_score(
            (revenue_score * Decimal("0.35"))
            + (staffing_score * Decimal("0.25"))
            + (timecard_score * Decimal("0.15"))
            + (client_score * Decimal("0.25"))
        )
        health_band = _account_health_band(health_score)
        reason_codes = list(snapshot.get("reason_codes_json") or [])

        row = {
            "account_id": account_id,
            "account_name": account.get("account_name") or "Account",
            "owner_name": account.get("owner_name"),
            "health_score": health_score,
            "health_band": health_band,
            "trend": "stable",
            "fee_plan": fee_plan,
            "fee_actual": fee_actual,
            "plan_variance_pct": plan_variance_pct,
            "ytd_revenue": fee_actual,
            "staffing_score": _round_score(staffing_score),
            "team_utilization_pct": team_utilization_pct,
            "overloaded_resources": overloaded_resources,
            "staffing_gap_resources": staffing_gap_resources,
            "timecard_compliance_pct": timecard_compliance_pct,
            "delinquent_timecards": delinquent_timecards,
            "satisfaction_score": satisfaction_score,
            "satisfaction_trend_delta": satisfaction_trend_delta,
            "red_projects": red_projects,
            "collections_lag": _q(snapshot.get("collections_lag")),
            "writeoff_leakage": _q(snapshot.get("writeoff_leakage")),
            "reason_codes": reason_codes,
            "revenue_score": _round_score(revenue_score),
            "timecard_score": _round_score(timecard_score),
            "client_score": _round_score(client_score),
            "project_rows": project_rows,
        }
        primary_issue_code = _account_primary_issue_code(
            fee_plan=fee_plan,
            plan_variance_pct=plan_variance_pct,
            staffing_score=staffing_score,
            overloaded_resources=overloaded_resources,
            staffing_gap_resources=staffing_gap_resources,
            timecard_compliance_pct=timecard_compliance_pct,
            delinquent_timecards=delinquent_timecards,
            satisfaction_score=satisfaction_score,
            satisfaction_trend_delta=satisfaction_trend_delta,
            collections_lag=_q(snapshot.get("collections_lag")),
            writeoff_leakage=_q(snapshot.get("writeoff_leakage")),
            red_projects=red_projects,
        )
        recommended_action, recommended_owner = _account_issue_action(primary_issue_code, account.get("owner_name"))
        impact_label = _account_impact_label(primary_issue_code, row)
        impact_value = _account_issue_impact_value(primary_issue_code, row)
        row.update(
            {
                "primary_issue_code": primary_issue_code,
                "impact_label": impact_label,
                "recommended_action": recommended_action,
                "recommended_owner": recommended_owner,
                "severity_rank": _account_severity_rank(primary_issue_code, health_score, impact_value),
                "impact_value": impact_value,
            }
        )
        rows.append(row)

    return rows


def _build_account_dashboard(
    *,
    env_id: UUID,
    business_id: UUID,
    horizon: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    normalized_horizon = normalize_horizon(horizon)
    entity_rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    snapshot_dates = _recent_snapshot_dates(
        "pds_account_performance_snapshot",
        env_id=env_id,
        business_id=business_id,
        horizon=normalized_horizon,
        limit=2,
    )
    latest_date = snapshot_dates[0] if snapshot_dates else None
    previous_date = snapshot_dates[1] if len(snapshot_dates) > 1 else None
    current_rows = _build_account_rows_from_snapshots(
        env_id=env_id,
        business_id=business_id,
        horizon=normalized_horizon,
        snapshot_date=latest_date,
        entity_rows=entity_rows,
    )
    previous_rows = _build_account_rows_from_snapshots(
        env_id=env_id,
        business_id=business_id,
        horizon=normalized_horizon,
        snapshot_date=previous_date,
        entity_rows=entity_rows,
    )

    previous_by_account = {row["account_id"]: row for row in previous_rows}
    for row in current_rows:
        previous = previous_by_account.get(row["account_id"])
        row["trend"] = _account_trend(row["health_score"], previous["health_score"] if previous else None)

    distribution = {
        "healthy": len([row for row in current_rows if row["health_band"] == "healthy"]),
        "watch": len([row for row in current_rows if row["health_band"] == "watch"]),
        "at_risk": len([row for row in current_rows if row["health_band"] == "at_risk"]),
    }
    alerts = [
        {
            "key": "at_risk",
            "label": "Accounts At Risk",
            "count": distribution["at_risk"],
            "description": "Health score below 55",
            "tone": "danger",
        },
        {
            "key": "missing_plan",
            "label": "Missing Plan >10%",
            "count": len([row for row in current_rows if _q(row.get("fee_plan")) > 0 and _q(row.get("plan_variance_pct")) < Decimal("-10")]),
            "description": "Fee actual more than 10% below plan",
            "tone": "warn",
        },
        {
            "key": "staffing_issues",
            "label": "Staffing Issues",
            "count": len([
                row for row in current_rows
                if int(row.get("staffing_score") or 0) < 60
                or (_q(row.get("timecard_compliance_pct") or 0) > 0 and _q(row.get("timecard_compliance_pct") or 0) < Decimal("90"))
            ]),
            "description": "Staffing pressure or late timecards",
            "tone": "warn",
        },
    ]
    action_candidates = [
        row for row in current_rows
        if row.get("primary_issue_code") is not None or row["health_band"] != "healthy"
    ]
    action_candidates.sort(
        key=lambda row: (
            int(row.get("severity_rank") or 0),
            _q(row.get("impact_value")),
            _q(row.get("fee_actual")),
        ),
        reverse=True,
    )
    actions = [
        {
            "account_id": row["account_id"],
            "account_name": row["account_name"],
            "owner_name": row.get("owner_name"),
            "health_score": row["health_score"],
            "health_band": row["health_band"],
            "issue": _issue_display_label(row.get("primary_issue_code")),
            "impact_label": row.get("impact_label") or "Stable account",
            "recommended_action": row.get("recommended_action") or "Monitor weekly",
            "recommended_owner": row.get("recommended_owner"),
            "severity_rank": int(row.get("severity_rank") or 0),
        }
        for row in action_candidates[:6]
    ]

    return {
        "alerts": alerts,
        "distribution": distribution,
        "accounts": current_rows,
        "actions": actions,
    }, current_rows, previous_rows


def _delete_snapshot_horizon(cur, table: str, env_id: UUID, business_id: UUID, snapshot_date: date, horizon: str) -> None:
    cur.execute(
        f"""
        DELETE FROM {table}
        WHERE env_id = %s::uuid
          AND business_id = %s::uuid
          AND snapshot_date = %s
          AND horizon = %s
        """,
        (str(env_id), str(business_id), snapshot_date, horizon),
    )


def ensure_enterprise_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict[str, Any]:
    seeded = seed_enterprise_workspace(env_id=env_id, business_id=business_id, actor=actor)
    refreshed = refresh_snapshots(env_id=env_id, business_id=business_id, actor=actor)

    # Auto-seed analytics tables (370-series) if they exist and are empty
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM pds_analytics_employees WHERE env_id = %s::uuid AND business_id = %s::uuid",
                (str(env_id), str(business_id)),
            )
            analytics_count = int((cur.fetchone() or {}).get("cnt") or 0)
        if analytics_count == 0:
            import logging as _logging
            _logging.getLogger(__name__).info("Auto-seeding PDS analytics tables (370-series)")
            from app.services.pds_analytics_seed import seed_pds_analytics
            analytics_result = seed_pds_analytics(env_id=env_id, business_id=business_id)
            seeded["analytics"] = analytics_result
    except Exception:
        import logging as _logging
        _logging.getLogger(__name__).warning("PDS analytics tables not yet migrated — skipping analytics seed")

    # Auto-seed business lines + leader coverage (412-series) if they exist and are empty
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM pds_business_lines WHERE env_id = %s::uuid AND business_id = %s::uuid",
                (str(env_id), str(business_id)),
            )
            bl_count = int((cur.fetchone() or {}).get("cnt") or 0)
        if bl_count == 0:
            import logging as _logging
            _logging.getLogger(__name__).info("Auto-seeding PDS business lines (412-series)")
            from app.services.pds_business_line_seed import seed_business_lines
            bl_result = seed_business_lines(env_id=env_id, business_id=business_id)
            seeded["business_lines"] = bl_result
    except Exception:
        import logging as _logging
        _logging.getLogger(__name__).warning("PDS business_lines table not yet migrated — skipping BL seed")

    return {"seeded": seeded, "refreshed": refreshed}


def seed_enterprise_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict[str, Any]:
    projects = pds_core.list_projects(env_id=env_id, business_id=business_id, limit=200)
    if not projects:
        pds_core.seed_demo_workspace(env_id=env_id, business_id=business_id, actor=actor)
        projects = pds_core.list_projects(env_id=env_id, business_id=business_id, limit=200)

    today = _today()

    with get_cursor() as cur:
        cur.execute(
            "SELECT region_id, region_code FROM pds_regions WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY region_code",
            (str(env_id), str(business_id)),
        )
        region_rows = cur.fetchall()
        if not region_rows:
            for region_code, region_name, leader in [
                ("SE", "Southeast", "Morgan Ruiz"),
                ("NE", "Northeast", "Dana Park"),
                ("MW", "Midwest", "Taylor Chen"),
                ("SC", "South Central", "Riley Brooks"),
                ("NW", "Northwest", "Casey Martinez"),
            ]:
                cur.execute(
                    """
                    INSERT INTO pds_regions (env_id, business_id, region_code, region_name, leader_name, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb)
                    """,
                    (str(env_id), str(business_id), region_code, region_name, leader, "{}"),
                )
            cur.execute(
                "SELECT region_id, region_code FROM pds_regions WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY region_code",
                (str(env_id), str(business_id)),
            )
            region_rows = cur.fetchall()

        region_map = {row["region_code"]: row["region_id"] for row in region_rows}

        cur.execute(
            "SELECT market_id, market_code FROM pds_markets WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY market_code",
            (str(env_id), str(business_id)),
        )
        market_rows = cur.fetchall()
        if not market_rows:
            seed_markets = [
                ("SFL", "South Florida", "Healthcare", region_map.get("SE"), "Avery Cole"),
                ("MAPS", "Mid-Atlantic Public Sector", "Public Sector", region_map.get("SE"), "Jordan Hale"),
                ("NEH", "Northeast Healthcare", "Healthcare", region_map.get("NE"), "Sam Rivera"),
                ("NCR", "National Capital Region", "Federal", region_map.get("NE"), "Dana Park"),
                ("MWC", "Midwest Corporate", "Corporate", region_map.get("MW"), "Taylor Chen"),
                ("TXE", "Texas Energy", "Energy", region_map.get("SC"), "Riley Brooks"),
                ("PNW", "Pacific Northwest", "Life Sciences", region_map.get("NW"), "Casey Martinez"),
            ]
            for code, name, sector, region_id, leader in seed_markets:
                cur.execute(
                    """
                    INSERT INTO pds_markets
                    (env_id, business_id, region_id, market_code, market_name, sector, leader_name, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        str(env_id),
                        str(business_id),
                        str(region_id) if region_id else None,
                        code,
                        name,
                        sector,
                        leader,
                        "{}",
                    ),
                )
            cur.execute(
                "SELECT market_id, market_code FROM pds_markets WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY market_code",
                (str(env_id), str(business_id)),
            )
            market_rows = cur.fetchall()
        market_list = market_rows

        cur.execute(
            "SELECT client_id, client_code FROM pds_clients WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY client_code",
            (str(env_id), str(business_id)),
        )
        client_rows = cur.fetchall()
        if not client_rows:
            for code, name, industry, tier in [
                ("STONE", "Stone Strategic Clients", "Construction Management", "strategic"),
                ("MERH", "Meridian Health Partners", "Healthcare", "strategic"),
                ("CITY", "City Development Authority", "Public Sector", "priority"),
                ("APEX", "Apex Federal Systems", "Federal", "strategic"),
                ("LKWD", "Lakewood Industrial Group", "Corporate", "priority"),
                ("PTRN", "Petron Energy Holdings", "Energy", "strategic"),
                ("CSCD", "Cascade BioTech Campus", "Life Sciences", "priority"),
            ]:
                cur.execute(
                    """
                    INSERT INTO pds_clients
                    (env_id, business_id, client_code, client_name, industry, client_tier, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (str(env_id), str(business_id), code, name, industry, tier, "{}"),
                )
            cur.execute(
                "SELECT client_id, client_code FROM pds_clients WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY client_code",
                (str(env_id), str(business_id)),
            )
            client_rows = cur.fetchall()
        client_list = client_rows

        cur.execute(
            "SELECT account_id, account_code FROM pds_accounts WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY account_code",
            (str(env_id), str(business_id)),
        )
        account_rows = cur.fetchall()
        if not account_rows:
            seed_accounts = [
                ("STONE-HC", "Stone Healthcare Accounts", client_list[0]["client_id"], market_list[0]["market_id"], "Avery Cole"),
                ("MER-HOSP", "Meridian Hospital Program", client_list[1]["client_id"], market_list[2 % len(market_list)]["market_id"], "Dana Park"),
                ("CITY-CIV", "City Civic Infrastructure", client_list[2]["client_id"], market_list[1]["market_id"], "Jordan Hale"),
                ("APEX-FED", "Apex Federal Campus Program", client_list[3 % len(client_list)]["client_id"], market_list[3 % len(market_list)]["market_id"], "Dana Park"),
                ("LKWD-IND", "Lakewood Industrial Retrofit", client_list[4 % len(client_list)]["client_id"], market_list[4 % len(market_list)]["market_id"], "Taylor Chen"),
                ("PTRN-ENG", "Petron Energy Campus", client_list[5 % len(client_list)]["client_id"], market_list[5 % len(market_list)]["market_id"], "Riley Brooks"),
                ("CSCD-BIO", "Cascade BioTech Expansion", client_list[6 % len(client_list)]["client_id"], market_list[6 % len(market_list)]["market_id"], "Casey Martinez"),
                ("STONE-FL", "Stone South Florida Program", client_list[0]["client_id"], market_list[0]["market_id"], "Avery Cole"),
                ("MER-NE", "Meridian Northeast Clinics", client_list[1]["client_id"], market_list[2 % len(market_list)]["market_id"], "Sam Rivera"),
                ("CITY-MW", "City Midwest Development", client_list[2]["client_id"], market_list[4 % len(market_list)]["market_id"], "Taylor Chen"),
            ]
            for code, name, client_id, market_id, owner in seed_accounts:
                cur.execute(
                    """
                    INSERT INTO pds_accounts
                    (env_id, business_id, client_id, market_id, account_code, account_name, owner_name, strategic_flag, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, true, %s::jsonb)
                    """,
                    (str(env_id), str(business_id), str(client_id), str(market_id), code, name, owner, "{}"),
                )
            cur.execute(
                "SELECT account_id, account_code FROM pds_accounts WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY account_code",
                (str(env_id), str(business_id)),
            )
            account_rows = cur.fetchall()
        account_list = account_rows

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_account_owners WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            owner_names = [
                ("Avery Cole", "avery.cole@stonepds.local"),
                ("Dana Park", "dana.park@stonepds.local"),
                ("Jordan Hale", "jordan.hale@stonepds.local"),
                ("Dana Park", "dana.park@stonepds.local"),
                ("Taylor Chen", "taylor.chen@stonepds.local"),
                ("Riley Brooks", "riley.brooks@stonepds.local"),
                ("Casey Martinez", "casey.martinez@stonepds.local"),
                ("Avery Cole", "avery.cole@stonepds.local"),
                ("Sam Rivera", "sam.rivera@stonepds.local"),
                ("Taylor Chen", "taylor.chen@stonepds.local"),
            ]
            owner_rows = [
                (account_list[i]["account_id"], owner_names[i][0], "Account Director", owner_names[i][1], True)
                for i in range(min(len(account_list), len(owner_names)))
            ]
            for account_id, owner_name, owner_role, owner_email, is_primary in owner_rows:
                cur.execute(
                    """
                    INSERT INTO pds_account_owners
                    (env_id, business_id, account_id, owner_name, owner_role, owner_email, is_primary, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (str(env_id), str(business_id), str(account_id), owner_name, owner_role, owner_email, is_primary, "{}"),
                )

        for index, project in enumerate(projects):
            market_id = market_list[index % len(market_list)]["market_id"]
            account_id = account_list[index % len(account_list)]["account_id"]
            client_id = client_list[index % len(client_list)]["client_id"]
            project_executive = ["Morgan Ruiz", "Dana Park", "Avery Cole"][index % 3]
            cur.execute(
                """
                UPDATE pds_projects
                SET market_id = COALESCE(market_id, %s::uuid),
                    account_id = COALESCE(account_id, %s::uuid),
                    client_id = COALESCE(client_id, %s::uuid),
                    project_executive = COALESCE(project_executive, %s),
                    closeout_target_date = COALESCE(closeout_target_date, %s),
                    substantial_completion_date = COALESCE(substantial_completion_date, %s),
                    updated_at = now()
                WHERE project_id = %s::uuid
                """,
                (
                    str(market_id),
                    str(account_id),
                    str(client_id),
                    project_executive,
                    today + timedelta(days=45 + (index * 20)),
                    today + timedelta(days=15 + (index * 15)),
                    str(project["project_id"]),
                ),
            )

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_resources WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            resources = [
                ("PM-101", "A. Thompson", "Project Executive", market_list[0]["market_id"], "executive"),
                ("PM-102", "L. Morgan", "Senior Project Manager", market_list[1]["market_id"], "market_leader"),
                ("PM-103", "C. Patel", "Project Manager", market_list[2 % len(market_list)]["market_id"], "project_lead"),
                ("PM-104", "R. Nguyen", "Project Manager", market_list[0]["market_id"], "project_lead"),
                ("RS-201", "S. Alvarez", "Scheduling Lead", market_list[1]["market_id"], "project_lead"),
                ("RS-202", "J. Kim", "Cost Manager", market_list[2 % len(market_list)]["market_id"], "account_director"),
                ("PM-105", "D. Washington", "Project Executive", market_list[3 % len(market_list)]["market_id"], "executive"),
                ("PM-106", "K. Okonkwo", "Senior Project Manager", market_list[4 % len(market_list)]["market_id"], "market_leader"),
                ("PM-107", "M. Santos", "Project Manager", market_list[5 % len(market_list)]["market_id"], "project_lead"),
                ("RS-203", "T. Yamamoto", "Cost Manager", market_list[6 % len(market_list)]["market_id"], "account_director"),
                ("RS-204", "E. Larsson", "Scheduling Lead", market_list[3 % len(market_list)]["market_id"], "project_lead"),
                ("PM-108", "N. Gupta", "Project Manager", market_list[4 % len(market_list)]["market_id"], "project_lead"),
            ]
            for code, full_name, title, home_market_id, role_preset in resources:
                cur.execute(
                    """
                    INSERT INTO pds_resources
                    (env_id, business_id, home_market_id, resource_code, full_name, title, role_preset, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (str(env_id), str(business_id), str(home_market_id), code, full_name, title, role_preset, "{}"),
                )

        cur.execute(
            "SELECT resource_id, full_name FROM pds_resources WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY resource_code",
            (str(env_id), str(business_id)),
        )
        resource_rows = cur.fetchall()

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_project_assignments WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            for index, project in enumerate(projects):
                assignment_pairs = [
                    (resource_rows[index % len(resource_rows)]["resource_id"], "Lead PM", Decimal("0.85"), Decimal("0.80")),
                    (resource_rows[(index + 4) % len(resource_rows)]["resource_id"], "Controls", Decimal("0.45"), Decimal("0.35")),
                ]
                for resource_id, role_name, allocation_pct, billable_target_pct in assignment_pairs:
                    cur.execute(
                        """
                        INSERT INTO pds_project_assignments
                        (env_id, business_id, project_id, resource_id, role_name, allocation_pct, billable_target_pct, start_date, end_date, metadata_json)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            str(env_id),
                            str(business_id),
                            str(project["project_id"]),
                            str(resource_id),
                            role_name,
                            str(allocation_pct),
                            str(billable_target_pct),
                            today - timedelta(days=45),
                            today + timedelta(days=90),
                            "{}",
                        ),
                    )

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_capacity_plans WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            for resource in resource_rows:
                for offset in range(-1, 3):
                    period_date = _first_of_month(today, offset)
                    capacity_hours = Decimal("160")
                    target_hours = Decimal("132")
                    cur.execute(
                        """
                        INSERT INTO pds_capacity_plans
                        (env_id, business_id, resource_id, period_date, capacity_hours, billable_target_hours, metadata_json)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s::jsonb)
                        """,
                        (str(env_id), str(business_id), str(resource["resource_id"]), period_date, str(capacity_hours), str(target_hours), "{}"),
                    )

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_timecards WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            for index, resource in enumerate(resource_rows):
                for week in range(0, 4):
                    week_ending = today - timedelta(days=today.weekday()) + timedelta(days=6 - (week * 7))
                    status = "submitted" if week < 2 or index % 2 == 0 else "draft"
                    submitted_at = coerce_utc_datetime(week_ending - timedelta(days=1)) if status == "submitted" else None
                    project_id = projects[index % len(projects)]["project_id"] if projects else None
                    hours = Decimal("42") if index in {0, 1} else Decimal("36")
                    cur.execute(
                        """
                        INSERT INTO pds_timecards
                        (env_id, business_id, resource_id, project_id, week_ending, submitted_at, approved_at, status, hours, metadata_json)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            str(env_id),
                            str(business_id),
                            str(resource["resource_id"]),
                            str(project_id) if project_id else None,
                            week_ending,
                            submitted_at,
                            submitted_at,
                            status,
                            str(hours),
                            "{}",
                        ),
                    )

        for table_name in [
            "pds_fee_revenue_plan",
            "pds_fee_revenue_actual",
            "pds_gaap_revenue_plan",
            "pds_gaap_revenue_actual",
            "pds_ci_plan",
            "pds_ci_actual",
            "pds_backlog_fact",
            "pds_billing_fact",
            "pds_collection_fact",
            "pds_writeoff_fact",
        ]:
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM {table_name} WHERE env_id = %s::uuid AND business_id = %s::uuid",
                (str(env_id), str(business_id)),
            )
            if int((cur.fetchone() or {}).get("cnt") or 0) != 0:
                continue
            # Per-project financial profiles: (base_fee, plan_miss_pct, ci_plan_margin, ci_actual_margin, collection_rate, writeoff_base)
            _fin_profiles = [
                (Decimal("425000"), Decimal("-0.07"), Decimal("0.18"), Decimal("0.15"), Decimal("0.96"), Decimal("3500")),
                (Decimal("490000"), Decimal("0.02"), Decimal("0.20"), Decimal("0.22"), Decimal("0.88"), Decimal("18000")),
                (Decimal("680000"), Decimal("-0.12"), Decimal("0.18"), Decimal("0.14"), Decimal("0.94"), Decimal("8500")),
                (Decimal("310000"), Decimal("0.04"), Decimal("0.20"), Decimal("0.21"), Decimal("0.97"), Decimal("2000")),
                (Decimal("220000"), Decimal("-0.15"), Decimal("0.16"), Decimal("0.11"), Decimal("0.85"), Decimal("22000")),
                (Decimal("145000"), Decimal("0.01"), Decimal("0.22"), Decimal("0.23"), Decimal("0.98"), Decimal("1500")),
                (Decimal("520000"), Decimal("-0.04"), Decimal("0.18"), Decimal("0.17"), Decimal("0.93"), Decimal("5000")),
                (Decimal("95000"), Decimal("0.03"), Decimal("0.19"), Decimal("0.20"), Decimal("0.96"), Decimal("2500")),
            ]
            _seasonality = [Decimal("0.85"), Decimal("0.92"), Decimal("1.00"), Decimal("1.05"), Decimal("1.08"), Decimal("1.02")]

            for month_offset in range(-2, 4):
                period_date = _first_of_month(today, month_offset)
                season_mult = _seasonality[(month_offset + 2) % len(_seasonality)]
                for index, project in enumerate(projects):
                    market_id = market_list[index % len(market_list)]["market_id"]
                    account_id = account_list[index % len(account_list)]["account_id"]
                    project_id = project["project_id"]
                    fp = _fin_profiles[index % len(_fin_profiles)]
                    plan_amount = (fp[0] + (Decimal(month_offset) * Decimal("18000"))) * season_mult
                    actual_amount = plan_amount * (Decimal("1") + fp[1])
                    gaap_plan = plan_amount * Decimal("0.94")
                    gaap_actual = actual_amount * Decimal("0.95")
                    ci_plan = plan_amount * fp[2]
                    ci_actual = actual_amount * fp[3]
                    backlog = plan_amount * Decimal("4.6") if month_offset >= 0 else plan_amount * Decimal("3.4")
                    billing = actual_amount * Decimal("0.92")
                    collection = billing * fp[4]
                    writeoff = fp[5] if month_offset <= 0 else Decimal("3500")
                    values = {
                        "pds_fee_revenue_plan": plan_amount,
                        "pds_fee_revenue_actual": actual_amount,
                        "pds_gaap_revenue_plan": gaap_plan,
                        "pds_gaap_revenue_actual": gaap_actual,
                        "pds_ci_plan": ci_plan,
                        "pds_ci_actual": ci_actual,
                        "pds_backlog_fact": backlog,
                        "pds_billing_fact": billing,
                        "pds_collection_fact": collection,
                        "pds_writeoff_fact": writeoff,
                    }
                    sql = f"""
                        INSERT INTO {table_name}
                        (env_id, business_id, market_id, account_id, project_id, period_date, amount{', reason_code' if table_name == 'pds_writeoff_fact' else ''}, metadata_json)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s{', %s' if table_name == 'pds_writeoff_fact' else ''}, %s::jsonb)
                    """
                    params = [
                        str(env_id),
                        str(business_id),
                        str(market_id),
                        str(account_id),
                        str(project_id),
                        period_date,
                        str(values[table_name]),
                    ]
                    if table_name == "pds_writeoff_fact":
                        params.append("BILLING_LEAKAGE")
                    params.append("{}")
                    cur.execute(sql, tuple(params))

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_closeout_records WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            for index, project in enumerate(projects):
                blocker_count = 2 if index == 0 else 1
                cur.execute(
                    """
                    INSERT INTO pds_closeout_records
                    (env_id, business_id, project_id, closeout_target_date, substantial_completion_date, actual_closeout_date,
                     final_billing_status, survey_sent_at, lessons_learned_captured_at, open_blockers_json, status, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb)
                    """,
                    (
                        str(env_id),
                        str(business_id),
                        str(project["project_id"]),
                        today + timedelta(days=30 + (index * 18)),
                        today + timedelta(days=10 + (index * 12)),
                        None if index == 0 else today - timedelta(days=10),
                        "pending" if index == 0 else "submitted",
                        None if index == 0 else utc_now(),
                        None if index == 0 else utc_now(),
                        json.dumps([{"title": f"Closeout blocker {i + 1}"} for i in range(blocker_count)]),
                        "active",
                        "{}",
                    ),
                )

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_client_survey_responses WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            for index, project in enumerate(projects):
                account_id = account_list[index % len(account_list)]["account_id"]
                client_id = client_list[index % len(client_list)]["client_id"]
                scores = [Decimal("4.6"), Decimal("3.4"), Decimal("4.1")]
                for offset, score in enumerate(scores):
                    cur.execute(
                        """
                        INSERT INTO pds_client_survey_responses
                        (env_id, business_id, client_id, account_id, project_id, response_date, score, sentiment, respondent_name, metadata_json)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            str(env_id),
                            str(business_id),
                            str(client_id),
                            str(account_id),
                            str(project["project_id"]),
                            today - timedelta(days=30 * offset),
                            str(score - (Decimal(index) * Decimal("0.3"))),
                            "positive" if index != 1 else "mixed",
                            f"Executive Sponsor {index + 1}",
                            "{}",
                        ),
                    )

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_satisfaction_rollups WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
            # Satisfaction scores: varied distribution across accounts
            # Some strong (4.5+), some mid (3.8-4.2), some at-risk (<3.5)
            satisfaction_profiles = [
                (Decimal("4.6"), Decimal("0.2"), "green"),   # Strong performer
                (Decimal("3.2"), Decimal("-0.6"), "red"),    # At risk — declining
                (Decimal("4.1"), Decimal("0.1"), "green"),   # Solid
                (Decimal("4.4"), Decimal("0.3"), "green"),   # Strong
                (Decimal("3.7"), Decimal("-0.2"), "yellow"), # Watch list
                (Decimal("4.8"), Decimal("0.1"), "green"),   # Top performer
                (Decimal("3.4"), Decimal("-0.4"), "red"),    # At risk
                (Decimal("4.2"), Decimal("0.0"), "green"),   # Stable
                (Decimal("3.9"), Decimal("0.2"), "green"),   # Improving
                (Decimal("2.9"), Decimal("-0.8"), "red"),    # Critical — needs intervention
            ]
            for index, account in enumerate(account_list):
                profile = satisfaction_profiles[index % len(satisfaction_profiles)]
                average_score, trend_delta, risk_state = profile
                cur.execute(
                    """
                    INSERT INTO pds_satisfaction_rollups
                    (env_id, business_id, client_id, account_id, period_date, average_score, response_count, trend_delta, risk_state, metadata_json)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        str(env_id),
                        str(business_id),
                        str(client_list[index % len(client_list)]["client_id"]),
                        str(account["account_id"]),
                        _month_start(today),
                        str(average_score),
                        3,
                        str(trend_delta),
                        risk_state,
                        "{}",
                    ),
                )

        # --- Pipeline deals seed (wrapped in try/catch for graceful degradation
        # when pds_pipeline_deals table hasn't been migrated yet) ---
        try:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM pds_pipeline_deals WHERE env_id = %s::uuid AND business_id = %s::uuid",
                (str(env_id), str(business_id)),
            )
            if int((cur.fetchone() or {}).get("cnt") or 0) == 0:
                _al = account_list  # shorthand
                pipeline_deals = [
                    # Prospects (10-25%)
                    ("Northeast Medical Campus Expansion", _al[0]["account_id"], "prospect", Decimal("2400000"), Decimal("15"), today + timedelta(days=90), "Dana Park"),
                    ("Southeast Office Renovation", _al[1 % len(_al)]["account_id"], "prospect", Decimal("850000"), Decimal("20"), today + timedelta(days=75), "Avery Cole"),
                    ("Mid-Atlantic School Modernization", _al[2 % len(_al)]["account_id"], "prospect", Decimal("1200000"), Decimal("10"), today + timedelta(days=120), "Jordan Hale"),
                    ("Cascade Research Annex", _al[6 % len(_al)]["account_id"], "prospect", Decimal("1800000"), Decimal("20"), today + timedelta(days=100), "Casey Martinez"),
                    # Pursuits (30-50%)
                    ("City Hall Renovation Phase II", _al[2 % len(_al)]["account_id"], "pursuit", Decimal("3200000"), Decimal("45"), today + timedelta(days=60), "Jordan Hale"),
                    ("Public Safety Training Center", _al[3 % len(_al)]["account_id"], "pursuit", Decimal("1750000"), Decimal("50"), today + timedelta(days=45), "Dana Park"),
                    # Negotiation (55-75%)
                    ("Meridian Clinic Network Fit-out", _al[8 % len(_al)]["account_id"], "negotiation", Decimal("1100000"), Decimal("65"), today + timedelta(days=28), "Sam Rivera"),
                    ("Lakewood Warehouse Modernization", _al[4 % len(_al)]["account_id"], "negotiation", Decimal("2100000"), Decimal("60"), today + timedelta(days=35), "Taylor Chen"),
                    ("Petron Refinery Controls Upgrade", _al[5 % len(_al)]["account_id"], "negotiation", Decimal("4500000"), Decimal("55"), today + timedelta(days=42), "Riley Brooks"),
                    # Won (75-90%)
                    ("South Florida Data Center", _al[7 % len(_al)]["account_id"], "won", Decimal("4100000"), Decimal("85"), today + timedelta(days=30), "Avery Cole"),
                    ("Northeast Lab Consolidation", _al[8 % len(_al)]["account_id"], "won", Decimal("1950000"), Decimal("90"), today + timedelta(days=20), "Sam Rivera"),
                    ("Federal Campus Phase III", _al[3 % len(_al)]["account_id"], "won", Decimal("5200000"), Decimal("80"), today + timedelta(days=25), "Dana Park"),
                    # Converted (100%)
                    ("City Civic Water Treatment", _al[9 % len(_al)]["account_id"], "converted", Decimal("2800000"), Decimal("100"), today - timedelta(days=15), "Taylor Chen"),
                    ("Stone Healthcare Central Plant", _al[0]["account_id"], "converted", Decimal("3600000"), Decimal("100"), today - timedelta(days=30), "Avery Cole"),
                    ("Midwest Distribution Hub", _al[4 % len(_al)]["account_id"], "converted", Decimal("1400000"), Decimal("100"), today - timedelta(days=10), "Taylor Chen"),
                    # Lost
                    ("Riverside Public Safety Retrofit", _al[1 % len(_al)]["account_id"], "lost", Decimal("950000"), Decimal("0"), today - timedelta(days=20), "Avery Cole"),
                ]
                for deal_name, account_id, stage, deal_value, probability, close_date, owner in pipeline_deals:
                    cur.execute(
                        """
                        INSERT INTO pds_pipeline_deals
                        (env_id, business_id, account_id, deal_name, stage, deal_value, probability_pct, expected_close_date, owner_name)
                        VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
                        RETURNING deal_id
                        """,
                        (str(env_id), str(business_id), str(account_id), deal_name, stage, str(deal_value), str(probability), close_date, owner),
                    )
                    inserted = cur.fetchone()
                    try:
                        cur.execute(
                            """
                            INSERT INTO pds_pipeline_deal_stage_history
                            (env_id, business_id, deal_id, from_stage, to_stage, changed_at, note)
                            VALUES (%s::uuid, %s::uuid, %s::uuid, NULL, %s, %s, %s)
                            """,
                            (str(env_id), str(business_id), str(inserted["deal_id"]), stage, utc_now(), "Initial stage"),
                        )
                    except Exception:
                        pass
        except Exception:
            # pds_pipeline_deals table may not exist yet — skip gracefully
            import logging as _logging
            _logging.getLogger(__name__).warning("pds_pipeline_deals table not found — skipping pipeline seed")

    return {"projects": len(projects)}


def _load_rows_by_table(*, env_id: UUID, business_id: UUID) -> dict[str, list[dict[str, Any]]]:
    table_map = {
        "markets": "SELECT * FROM pds_markets WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY market_name",
        "accounts": "SELECT * FROM pds_accounts WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY account_name",
        "clients": "SELECT * FROM pds_clients WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY client_name",
        "resources": "SELECT * FROM pds_resources WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY full_name",
        "assignments": "SELECT * FROM pds_project_assignments WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
        "capacity": "SELECT * FROM pds_capacity_plans WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "timecards": "SELECT * FROM pds_timecards WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY week_ending DESC",
        "fee_plan": "SELECT * FROM pds_fee_revenue_plan WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "fee_actual": "SELECT * FROM pds_fee_revenue_actual WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "gaap_plan": "SELECT * FROM pds_gaap_revenue_plan WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "gaap_actual": "SELECT * FROM pds_gaap_revenue_actual WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "ci_plan": "SELECT * FROM pds_ci_plan WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "ci_actual": "SELECT * FROM pds_ci_actual WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "backlog": "SELECT * FROM pds_backlog_fact WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "billing": "SELECT * FROM pds_billing_fact WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "collections": "SELECT * FROM pds_collection_fact WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "writeoffs": "SELECT * FROM pds_writeoff_fact WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "closeout": "SELECT * FROM pds_closeout_records WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY closeout_target_date NULLS LAST",
        "survey_rollups": "SELECT * FROM pds_satisfaction_rollups WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY period_date",
        "survey_responses": "SELECT * FROM pds_client_survey_responses WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY response_date",
        "claims": "SELECT * FROM pds_contractor_claims WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
        "permits": "SELECT * FROM pds_permits WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
        "change_orders": "SELECT * FROM pds_change_orders WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
        "milestones": "SELECT * FROM pds_milestones WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY created_at",
        "business_lines": "SELECT * FROM pds_business_lines WHERE env_id = %s::uuid AND business_id = %s::uuid ORDER BY sort_order",
        "leader_coverage": "SELECT * FROM pds_leader_coverage WHERE env_id = %s::uuid AND business_id = %s::uuid AND effective_to IS NULL ORDER BY market_id, business_line_id",
    }
    optional_tables = {
        "claims": "pds_contractor_claims",
        "permits": "pds_permits",
        "change_orders": "pds_change_orders",
        "milestones": "pds_milestones",
        "business_lines": "pds_business_lines",
        "leader_coverage": "pds_leader_coverage",
    }
    rows: dict[str, list[dict[str, Any]]] = {}
    with get_cursor() as cur:
        for key, sql in table_map.items():
            if key in optional_tables and not _table_exists(optional_tables[key]):
                rows[key] = []
                continue
            cur.execute(sql, (str(env_id), str(business_id)))
            rows[key] = cur.fetchall()
    rows["projects"] = pds_core.list_projects(env_id=env_id, business_id=business_id, limit=200)
    return rows


def _forecast_seed_value(entity_index: int, month_index: int, base_amount: Decimal) -> tuple[Decimal, Decimal, Decimal, Decimal | None, str | None, Decimal]:
    current_value = _q(base_amount * (Decimal("0.96") + (Decimal(month_index) * Decimal("0.03"))))
    prior_value = _q(current_value - (Decimal("12000") * Decimal(entity_index + 1)))
    delta_value = _q(current_value - prior_value)
    override_value = current_value + Decimal("15000") if entity_index == 0 and month_index == 2 else None
    override_reason = "Manual recovery adjustment" if override_value is not None else None
    confidence = Decimal("0.87") - (Decimal(entity_index) * Decimal("0.04")) - (Decimal(month_index) * Decimal("0.03"))
    return current_value, prior_value, delta_value, override_value, override_reason, _q(confidence)


def _insert_forecast_rows(cur, *, env_id: UUID, business_id: UUID, horizon: str, snapshot_date: date, entity_type: str, entities: list[dict[str, Any]], base_lookup: dict[UUID, Decimal], label_key: str) -> None:
    for entity_index, entity in enumerate(entities):
        entity_id = entity[f"{entity_type}_id"]
        base_amount = base_lookup.get(entity_id, Decimal("0")) or Decimal("0")
        for month_index in range(1, 4):
            forecast_month = _first_of_month(snapshot_date, month_index)
            current_value, prior_value, delta_value, override_value, override_reason, confidence = _forecast_seed_value(
                entity_index,
                month_index,
                base_amount or Decimal("100000"),
            )
            cur.execute(
                """
                INSERT INTO pds_forecast_snapshot
                (env_id, business_id, snapshot_date, horizon, entity_type, entity_id, forecast_month, current_value, prior_value,
                 delta_value, override_value, override_reason, confidence_score, explainability_json)
                VALUES
                (%s::uuid, %s::uuid, %s, %s, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (env_id, business_id, snapshot_date, horizon, entity_type, entity_id, forecast_month)
                DO UPDATE SET current_value = EXCLUDED.current_value, prior_value = EXCLUDED.prior_value,
                  delta_value = EXCLUDED.delta_value, override_value = EXCLUDED.override_value,
                  override_reason = EXCLUDED.override_reason, confidence_score = EXCLUDED.confidence_score,
                  explainability_json = EXCLUDED.explainability_json
                """,
                (
                    str(env_id),
                    str(business_id),
                    snapshot_date,
                    horizon,
                    entity_type,
                    str(entity_id),
                    forecast_month,
                    str(current_value),
                    str(prior_value),
                    str(delta_value),
                    str(override_value) if override_value is not None else None,
                    override_reason,
                    str(confidence),
                    _serialize_json({"entity_label": entity.get(label_key)}),
                ),
            )


def _reason_action(reason_codes: list[str]) -> tuple[str, str]:
    if "SCHEDULE_SLIP" in reason_codes:
        return "Escalate schedule recovery review", "Project Executive"
    if "FEE_VARIANCE" in reason_codes:
        return "Review fee burn and reforecast delivery", "Account Director"
    if "LABOR_OVERRUN" in reason_codes:
        return "Rebalance staffing and approve support coverage", "Market Leader"
    if "CLAIM_EXPOSURE" in reason_codes or "CHANGE_ORDER_EXPOSURE" in reason_codes:
        return "Review claim and change-order posture", "Commercial Lead"
    if "CLOSEOUT_AGING" in reason_codes:
        return "Drive closeout blocker resolution", "Project Lead"
    if "SATISFACTION_DECLINE" in reason_codes:
        return "Launch client recovery touchpoint", "Account Director"
    return "Monitor and review with leadership", "Operations Lead"


def _project_risk_snapshot(*, project: dict[str, Any], account_score: Decimal, rows: dict[str, list[dict[str, Any]]], today: date) -> dict[str, Any]:
    project_id = project["project_id"]
    milestones = [row for row in rows["milestones"] if row.get("project_id") == project_id]
    change_orders = [row for row in rows["change_orders"] if row.get("project_id") == project_id]
    claims = [row for row in rows["claims"] if row.get("project_id") == project_id and row.get("status") == "open"]
    permits = [row for row in rows["permits"] if row.get("project_id") == project_id and row.get("status") != "approved"]
    closeout = next((row for row in rows["closeout"] if row.get("project_id") == project_id), None)
    account_id = project.get("account_id")
    survey = next((row for row in rows["survey_rollups"] if row.get("account_id") == account_id), None)

    slip_days = 0
    for milestone in milestones:
        baseline = _coerce_date(milestone.get("baseline_date"))
        current = _coerce_date(milestone.get("current_date"))
        if baseline and current and current > baseline:
            slip_days += (current - baseline).days

    fee_variance = _q(project.get("forecast_at_completion")) - _q(project.get("approved_budget"))
    gaap_variance = fee_variance * Decimal("0.94")
    ci_variance = (_q(project.get("forecast_at_completion")) * Decimal("0.15")) - (_q(project.get("approved_budget")) * Decimal("0.18"))

    assignment_rows = [row for row in rows["assignments"] if row.get("project_id") == project_id]
    assigned_hours = Decimal("0")
    capacity_hours = Decimal("0")
    delinquent = 0
    for assignment in assignment_rows:
        resource_id = assignment.get("resource_id")
        assigned_hours += Decimal("160") * _q(assignment.get("allocation_pct"))
        capacity = next((row for row in rows["capacity"] if row.get("resource_id") == resource_id), None)
        if capacity:
            capacity_hours += _q(capacity.get("capacity_hours"))
        delinquent += sum(
            1
            for timecard in rows["timecards"]
            if timecard.get("resource_id") == resource_id
            and timecard.get("status") != "submitted"
            and (_coerce_date(timecard.get("week_ending")) or today) <= today
        )
    labor_overrun_pct = _q((assigned_hours / capacity_hours) - Decimal("1")) if capacity_hours else Decimal("0")

    claim_exposure = _q(sum(_q(row.get("exposure_amount")) for row in claims))
    change_order_exposure = _q(sum(_q(row.get("amount_impact")) for row in change_orders if row.get("status") in {"pending", "approved"}))
    permit_exposure = sum(1 for row in permits if row.get("blocking_flag"))
    satisfaction_score = _q((survey or {}).get("average_score"))
    closeout_aging_days = 0
    if closeout:
        target_date = _coerce_date(closeout.get("closeout_target_date"))
        actual_date = _coerce_date(closeout.get("actual_closeout_date"))
        if target_date and actual_date is None and today > target_date:
            closeout_aging_days = (today - target_date).days

    risk_score = Decimal("0")
    reason_codes: list[str] = []

    if slip_days > 7:
        risk_score += Decimal("25")
        reason_codes.append("SCHEDULE_SLIP")
    if fee_variance > Decimal("75000"):
        risk_score += Decimal("20")
        reason_codes.append("FEE_VARIANCE")
    if labor_overrun_pct > Decimal("0.10"):
        risk_score += Decimal("15")
        reason_codes.append("LABOR_OVERRUN")
    if delinquent > 0:
        risk_score += Decimal("10")
        reason_codes.append("TIMECARD_DELINQUENCY")
    if claim_exposure > Decimal("0"):
        risk_score += Decimal("15")
        reason_codes.append("CLAIM_EXPOSURE")
    if change_order_exposure > Decimal("150000"):
        risk_score += Decimal("15")
        reason_codes.append("CHANGE_ORDER_EXPOSURE")
    if permit_exposure > 0:
        risk_score += Decimal("15")
        reason_codes.append("PERMIT_BLOCKER")
    if closeout_aging_days > 0:
        risk_score += Decimal("10")
        reason_codes.append("CLOSEOUT_AGING")
    if satisfaction_score and satisfaction_score < Decimal("3.8"):
        risk_score += Decimal("5")
        reason_codes.append("SATISFACTION_DECLINE")
    if account_score >= Decimal("50") and "SATISFACTION_DECLINE" not in reason_codes:
        reason_codes.append("ACCOUNT_PRESSURE")

    recommended_action, recommended_owner = _reason_action(reason_codes)

    return {
        "fee_variance": _q(fee_variance),
        "gaap_variance": _q(gaap_variance),
        "ci_variance": _q(ci_variance),
        "schedule_slip_days": slip_days,
        "labor_overrun_pct": _q(labor_overrun_pct),
        "timecard_delinquent_count": delinquent,
        "claims_exposure": _q(claim_exposure),
        "change_order_exposure": _q(change_order_exposure),
        "permit_exposure": permit_exposure,
        "closeout_aging_days": closeout_aging_days,
        "satisfaction_score": _q(satisfaction_score),
        "risk_score": _q(risk_score),
        "severity": _score_band(_q(risk_score)),
        "reason_codes": reason_codes,
        "recommended_action": recommended_action,
        "recommended_owner": recommended_owner,
    }


def refresh_snapshots(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict[str, Any]:
    seed_enterprise_workspace(env_id=env_id, business_id=business_id, actor=actor)
    rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    today = _today()
    projects = rows["projects"]
    if not projects:
        return {"ok": False, "reason": "no_projects"}

    account_score_map: dict[UUID, Decimal] = {}
    for account in rows["accounts"]:
        account_id = account["account_id"]
        score = Decimal("0")
        fee_plan = _sum_amount(rows["fee_plan"], field="amount", start=date(today.year, 1, 1), end=today, entity_key="account_id", entity_id=account_id)
        fee_actual = _sum_amount(rows["fee_actual"], field="amount", start=date(today.year, 1, 1), end=today, entity_key="account_id", entity_id=account_id)
        forecast_base = fee_actual or fee_plan
        writeoff = _sum_amount(rows["writeoffs"], field="amount", start=date(today.year, 1, 1), end=today, entity_key="account_id", entity_id=account_id)
        satisfaction = _avg_value(rows["survey_rollups"], field="average_score", entity_key="account_id", entity_id=account_id)
        red_projects = len([project for project in projects if project.get("account_id") == account_id and _q(project.get("risk_score")) >= Decimal("50")])
        collections = _sum_amount(rows["collections"], field="amount", start=date(today.year, 1, 1), end=today, entity_key="account_id", entity_id=account_id)
        billings = _sum_amount(rows["billing"], field="amount", start=date(today.year, 1, 1), end=today, entity_key="account_id", entity_id=account_id)
        collections_lag = _q(billings - collections)
        if fee_actual < fee_plan:
            score += Decimal("25")
        if forecast_base < fee_plan:
            score += Decimal("20")
        if satisfaction and satisfaction < Decimal("3.8"):
            score += Decimal("20")
        if red_projects > 0:
            score += Decimal("20")
        if collections_lag > Decimal("75000") or writeoff > Decimal("10000"):
            score += Decimal("15")
        account_score_map[account_id] = _q(score)

    with get_cursor() as cur:
        snapshot_date = today
        for horizon in ["MTD", "QTD", "YTD", "Forecast"]:
            start_date, end_date = _date_window(horizon, today)
            for table in [
                "pds_market_performance_snapshot",
                "pds_business_line_performance_snapshot",
                "pds_account_performance_snapshot",
                "pds_project_health_snapshot",
                "pds_resource_utilization_snapshot",
                "pds_timecard_health_snapshot",
                "pds_forecast_snapshot",
                "pds_client_satisfaction_snapshot",
                "pds_closeout_snapshot",
            ]:
                _delete_snapshot_horizon(cur, table, env_id, business_id, snapshot_date, horizon)

            market_base_lookup: dict[UUID, Decimal] = {}
            account_base_lookup: dict[UUID, Decimal] = {}
            project_base_lookup: dict[UUID, Decimal] = {}

            for market in rows["markets"]:
                market_id = market["market_id"]
                fee_plan = _sum_amount(rows["fee_plan"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                fee_actual = _sum_amount(rows["fee_actual"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                gaap_plan = _sum_amount(rows["gaap_plan"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                gaap_actual = _sum_amount(rows["gaap_actual"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                ci_plan = _sum_amount(rows["ci_plan"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                ci_actual = _sum_amount(rows["ci_actual"], field="amount", start=start_date, end=end_date, entity_key="market_id", entity_id=market_id)
                backlog = _sum_latest_value(rows["backlog"], entity_key="market_id", entity_id=market_id)
                red_projects = len([project for project in projects if project.get("market_id") == market_id and _q(project.get("risk_score")) >= Decimal("50")])
                client_risk_accounts = len([account for account in rows["accounts"] if account.get("market_id") == market_id and account_score_map.get(account["account_id"], Decimal("0")) >= Decimal("50")])
                resource_ids = [resource["resource_id"] for resource in rows["resources"] if resource.get("home_market_id") == market_id]
                assigned_hours = Decimal("0")
                capacity_hours = Decimal("0")
                delinquent_timecards = 0
                for resource_id in resource_ids:
                    assigned_hours += sum(
                        Decimal("160") * _q(assignment.get("allocation_pct"))
                        for assignment in rows["assignments"]
                        if assignment.get("resource_id") == resource_id
                    )
                    capacity_hours += sum(
                        _q(capacity.get("capacity_hours"))
                        for capacity in rows["capacity"]
                        if capacity.get("resource_id") == resource_id and start_date <= (_coerce_date(capacity.get("period_date")) or today) <= end_date
                    )
                    delinquent_timecards += sum(
                        1
                        for timecard in rows["timecards"]
                        if timecard.get("resource_id") == resource_id
                        and timecard.get("status") != "submitted"
                        and start_date <= (_coerce_date(timecard.get("week_ending")) or today) <= end_date
                    )
                utilization_pct = _q(assigned_hours / capacity_hours) if capacity_hours else Decimal("0")
                submitted_count = sum(
                    1
                    for timecard in rows["timecards"]
                    if timecard.get("resource_id") in resource_ids
                    and start_date <= (_coerce_date(timecard.get("week_ending")) or today) <= end_date
                    and timecard.get("status") == "submitted"
                )
                total_timecards = max(
                    1,
                    sum(
                        1
                        for timecard in rows["timecards"]
                        if timecard.get("resource_id") in resource_ids
                        and start_date <= (_coerce_date(timecard.get("week_ending")) or today) <= end_date
                    ),
                )
                timecard_compliance_pct = _q(Decimal(submitted_count) / Decimal(total_timecards))
                satisfaction_score = _q(
                    sum(
                        _q(rollup.get("average_score"))
                        for rollup in rows["survey_rollups"]
                        if next((account for account in rows["accounts"] if account["account_id"] == rollup.get("account_id") and account.get("market_id") == market_id), None)
                    )
                )
                if client_risk_accounts:
                    satisfaction_score = _q(satisfaction_score / Decimal(client_risk_accounts))
                reason_codes: list[str] = []
                if fee_actual < fee_plan:
                    reason_codes.append("FEE_PLAN_MISS")
                if red_projects > 0:
                    reason_codes.append("RED_PROJECTS")
                if delinquent_timecards > 0:
                    reason_codes.append("TIMECARDS_LATE")
                health_status = "red" if red_projects > 1 else "yellow" if reason_codes else "green"
                market_base_lookup[market_id] = fee_actual or fee_plan
                forecast_total = (fee_actual or fee_plan) * Decimal("3.02")
                cur.execute(
                    """
                    INSERT INTO pds_market_performance_snapshot
                    (env_id, business_id, market_id, snapshot_date, horizon, fee_plan, fee_actual, gaap_plan, gaap_actual, ci_plan, ci_actual,
                     backlog, forecast, red_projects, client_risk_accounts, utilization_pct, timecard_compliance_pct, satisfaction_score,
                     health_status, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, market_id)
                    DO UPDATE SET fee_plan = EXCLUDED.fee_plan, fee_actual = EXCLUDED.fee_actual,
                      gaap_plan = EXCLUDED.gaap_plan, gaap_actual = EXCLUDED.gaap_actual,
                      ci_plan = EXCLUDED.ci_plan, ci_actual = EXCLUDED.ci_actual,
                      backlog = EXCLUDED.backlog, forecast = EXCLUDED.forecast,
                      red_projects = EXCLUDED.red_projects, client_risk_accounts = EXCLUDED.client_risk_accounts,
                      utilization_pct = EXCLUDED.utilization_pct, timecard_compliance_pct = EXCLUDED.timecard_compliance_pct,
                      satisfaction_score = EXCLUDED.satisfaction_score, health_status = EXCLUDED.health_status,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(market_id), snapshot_date, horizon,
                        str(fee_plan), str(fee_actual), str(gaap_plan), str(gaap_actual), str(ci_plan), str(ci_actual),
                        str(backlog), str(_q(forecast_total)), red_projects, client_risk_accounts,
                        str(utilization_pct), str(timecard_compliance_pct), str(satisfaction_score),
                        health_status, _serialize_list(reason_codes),
                        _serialize_json({"market_name": market.get("market_name"), "leader_name": market.get("leader_name")}),
                    ),
                )

            # ── Business line snapshots ──────────────────────────
            for bl in rows.get("business_lines", []):
                bl_id = bl["business_line_id"]
                bl_fee_plan = _sum_amount(rows["fee_plan"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_fee_actual = _sum_amount(rows["fee_actual"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_gaap_plan = _sum_amount(rows["gaap_plan"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_gaap_actual = _sum_amount(rows["gaap_actual"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_ci_plan = _sum_amount(rows["ci_plan"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_ci_actual = _sum_amount(rows["ci_actual"], field="amount", start=start_date, end=end_date, entity_key="business_line_id", entity_id=bl_id)
                bl_backlog = _sum_latest_value(rows["backlog"], entity_key="business_line_id", entity_id=bl_id)
                bl_red = len([p for p in projects if p.get("business_line_id") == bl_id and _q(p.get("risk_score")) >= Decimal("50")])
                bl_reason_codes: list[str] = []
                if bl_fee_actual < bl_fee_plan:
                    bl_reason_codes.append("FEE_PLAN_MISS")
                if bl_red > 0:
                    bl_reason_codes.append("RED_PROJECTS")
                bl_health = "red" if bl_red > 1 else "yellow" if bl_reason_codes else "green"
                bl_forecast = (bl_fee_actual or bl_fee_plan) * Decimal("3.02")
                cur.execute(
                    """
                    INSERT INTO pds_business_line_performance_snapshot
                    (env_id, business_id, business_line_id, snapshot_date, horizon,
                     fee_plan, fee_actual, gaap_plan, gaap_actual, ci_plan, ci_actual,
                     backlog, forecast, red_projects, client_risk_accounts,
                     utilization_pct, timecard_compliance_pct, satisfaction_score,
                     health_status, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s,
                     %s, %s, %s, %s, %s, %s,
                     %s, %s, %s, %s,
                     %s, %s, %s,
                     %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, business_line_id)
                    DO UPDATE SET fee_plan = EXCLUDED.fee_plan, fee_actual = EXCLUDED.fee_actual,
                      gaap_plan = EXCLUDED.gaap_plan, gaap_actual = EXCLUDED.gaap_actual,
                      ci_plan = EXCLUDED.ci_plan, ci_actual = EXCLUDED.ci_actual,
                      backlog = EXCLUDED.backlog, forecast = EXCLUDED.forecast,
                      red_projects = EXCLUDED.red_projects, health_status = EXCLUDED.health_status,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(bl_id), snapshot_date, horizon,
                        str(bl_fee_plan), str(bl_fee_actual), str(bl_gaap_plan), str(bl_gaap_actual), str(bl_ci_plan), str(bl_ci_actual),
                        str(bl_backlog), str(_q(bl_forecast)), bl_red, 0,
                        str(Decimal("0")), str(Decimal("0")), str(Decimal("0")),
                        bl_health, _serialize_list(bl_reason_codes),
                        _serialize_json({"line_name": bl.get("line_name"), "line_code": bl.get("line_code")}),
                    ),
                )

            for account in rows["accounts"]:
                account_id = account["account_id"]
                account_project_ids = [project["project_id"] for project in projects if project.get("account_id") == account_id]
                resource_ids = {
                    assignment.get("resource_id")
                    for assignment in rows["assignments"]
                    if assignment.get("project_id") in account_project_ids and assignment.get("resource_id") is not None
                }
                fee_plan = _sum_amount(rows["fee_plan"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                fee_actual = _sum_amount(rows["fee_actual"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                gaap_plan = _sum_amount(rows["gaap_plan"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                gaap_actual = _sum_amount(rows["gaap_actual"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                ci_plan = _sum_amount(rows["ci_plan"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                ci_actual = _sum_amount(rows["ci_actual"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                backlog = _sum_latest_value(rows["backlog"], entity_key="account_id", entity_id=account_id)
                collections = _sum_amount(rows["collections"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                billings = _sum_amount(rows["billing"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                writeoff = _sum_amount(rows["writeoffs"], field="amount", start=start_date, end=end_date, entity_key="account_id", entity_id=account_id)
                red_projects = len([project for project in projects if project.get("account_id") == account_id and _q(project.get("risk_score")) >= Decimal("50")])
                satisfaction_rollup = next((row for row in rows["survey_rollups"] if row.get("account_id") == account_id), None)
                satisfaction_score = _q((satisfaction_rollup or {}).get("average_score"))
                satisfaction_score_value = satisfaction_score if satisfaction_score > 0 else None

                assigned_hours = Decimal("0")
                capacity_hours = Decimal("0")
                overloaded_resources = 0
                staffing_gap_resources = 0
                submitted_count = 0
                total_timecards = 0
                delinquent_timecards = 0
                for resource_id in resource_ids:
                    resource_assignments = [
                        assignment for assignment in rows["assignments"]
                        if assignment.get("resource_id") == resource_id and assignment.get("project_id") in account_project_ids
                    ]
                    resource_assigned = sum(Decimal("160") * _q(assignment.get("allocation_pct")) for assignment in resource_assignments)
                    capacity = next((row for row in rows["capacity"] if row.get("resource_id") == resource_id), None)
                    resource_capacity = _q((capacity or {}).get("capacity_hours"))
                    resource_utilization = _q(resource_assigned / resource_capacity) if resource_capacity else Decimal("0")
                    if resource_utilization > Decimal("1.05"):
                        overloaded_resources += 1
                    if Decimal("0") < resource_utilization < Decimal("0.70"):
                        staffing_gap_resources += 1
                    assigned_hours += resource_assigned
                    capacity_hours += resource_capacity

                    resource_timecards = [
                        timecard for timecard in rows["timecards"]
                        if timecard.get("resource_id") == resource_id
                        and start_date <= (_coerce_date(timecard.get("week_ending")) or today) <= end_date
                    ]
                    submitted_count += sum(1 for timecard in resource_timecards if timecard.get("status") == "submitted")
                    total_timecards += len(resource_timecards)
                    delinquent_timecards += sum(1 for timecard in resource_timecards if timecard.get("status") != "submitted")

                team_utilization_pct = _normalize_pct_100(_q(assigned_hours / capacity_hours)) if capacity_hours else None
                timecard_compliance_pct = (
                    _normalize_pct_100(_q(Decimal(submitted_count) / Decimal(total_timecards)))
                    if total_timecards
                    else None
                )
                revenue_score = _account_revenue_score(fee_actual, fee_plan)
                staffing_score = _account_staffing_score(team_utilization_pct, overloaded_resources, staffing_gap_resources)
                timecard_score = _account_timecard_score(timecard_compliance_pct)
                client_score = _account_client_score(satisfaction_score_value)
                health_score = _round_score(
                    (revenue_score * Decimal("0.35"))
                    + (staffing_score * Decimal("0.25"))
                    + (timecard_score * Decimal("0.15"))
                    + (client_score * Decimal("0.25"))
                )
                plan_variance_pct = _q(((fee_actual / fee_plan) - Decimal("1")) * Decimal("100")) if fee_plan > 0 else Decimal("0")
                account_score = account_score_map.get(account_id, Decimal("0"))
                reason_codes = []
                if fee_actual < fee_plan:
                    reason_codes.append("FEE_VARIANCE")
                if satisfaction_score < Decimal("3.8"):
                    reason_codes.append("SATISFACTION_DECLINE")
                if writeoff > Decimal("10000"):
                    reason_codes.append("REVENUE_LEAKAGE")
                primary_issue_code = _account_primary_issue_code(
                    fee_plan=fee_plan,
                    plan_variance_pct=plan_variance_pct,
                    staffing_score=staffing_score,
                    overloaded_resources=overloaded_resources,
                    staffing_gap_resources=staffing_gap_resources,
                    timecard_compliance_pct=timecard_compliance_pct,
                    delinquent_timecards=delinquent_timecards,
                    satisfaction_score=satisfaction_score_value,
                    satisfaction_trend_delta=_q((satisfaction_rollup or {}).get("trend_delta")) if satisfaction_rollup else None,
                    collections_lag=_q(billings - collections),
                    writeoff_leakage=writeoff,
                    red_projects=red_projects,
                )
                recommended_action, recommended_owner = _account_issue_action(primary_issue_code, account.get("owner_name"))
                account_base_lookup[account_id] = fee_actual or fee_plan
                forecast_total = (fee_actual or fee_plan) * Decimal("3.05")
                cur.execute(
                    """
                    INSERT INTO pds_account_performance_snapshot
                    (env_id, business_id, account_id, snapshot_date, horizon, fee_plan, fee_actual, gaap_plan, gaap_actual, ci_plan, ci_actual,
                     backlog, forecast, collections_lag, writeoff_leakage, red_projects, satisfaction_score, account_risk_score,
                     health_status, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, account_id)
                    DO UPDATE SET fee_plan = EXCLUDED.fee_plan, fee_actual = EXCLUDED.fee_actual,
                      gaap_plan = EXCLUDED.gaap_plan, gaap_actual = EXCLUDED.gaap_actual,
                      ci_plan = EXCLUDED.ci_plan, ci_actual = EXCLUDED.ci_actual,
                      backlog = EXCLUDED.backlog, forecast = EXCLUDED.forecast,
                      collections_lag = EXCLUDED.collections_lag, writeoff_leakage = EXCLUDED.writeoff_leakage,
                      red_projects = EXCLUDED.red_projects, satisfaction_score = EXCLUDED.satisfaction_score,
                      account_risk_score = EXCLUDED.account_risk_score, health_status = EXCLUDED.health_status,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(account_id), snapshot_date, horizon,
                        str(fee_plan), str(fee_actual), str(gaap_plan), str(gaap_actual), str(ci_plan), str(ci_actual),
                        str(backlog), str(_q(forecast_total)), str(_q(billings - collections)), str(writeoff),
                        red_projects, str(satisfaction_score), str(account_score), _score_band(account_score),
                        _serialize_list(reason_codes),
                        _serialize_json(
                            {
                                "account_name": account.get("account_name"),
                                "owner_name": account.get("owner_name"),
                                "team_utilization_pct": str(team_utilization_pct) if team_utilization_pct is not None else None,
                                "timecard_compliance_pct": str(timecard_compliance_pct) if timecard_compliance_pct is not None else None,
                                "overloaded_resources": overloaded_resources,
                                "staffing_gap_resources": staffing_gap_resources,
                                "delinquent_timecards": delinquent_timecards,
                                "revenue_score": _round_score(revenue_score),
                                "staffing_score": _round_score(staffing_score),
                                "timecard_score": _round_score(timecard_score),
                                "client_score": _round_score(client_score),
                                "health_score": health_score,
                                "health_band": _account_health_band(health_score),
                                "primary_issue_code": primary_issue_code,
                                "recommended_action": recommended_action,
                                "recommended_owner": recommended_owner,
                            }
                        ),
                    ),
                )

            for project in projects:
                account_score = account_score_map.get(project.get("account_id"), Decimal("0"))
                snapshot = _project_risk_snapshot(project=project, account_score=account_score, rows=rows, today=today)
                project_id = project["project_id"]
                project_base_lookup[project_id] = _q(project.get("forecast_at_completion")) or _q(project.get("approved_budget"))
                cur.execute(
                    """
                    INSERT INTO pds_project_health_snapshot
                    (env_id, business_id, project_id, snapshot_date, horizon, fee_variance, gaap_variance, ci_variance, schedule_slip_days,
                     labor_overrun_pct, timecard_delinquent_count, claims_exposure, change_order_exposure, permit_exposure, closeout_aging_days,
                     satisfaction_score, risk_score, severity, reason_codes_json, recommended_action, recommended_owner, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, project_id)
                    DO UPDATE SET fee_variance = EXCLUDED.fee_variance, gaap_variance = EXCLUDED.gaap_variance,
                      ci_variance = EXCLUDED.ci_variance, schedule_slip_days = EXCLUDED.schedule_slip_days,
                      labor_overrun_pct = EXCLUDED.labor_overrun_pct, timecard_delinquent_count = EXCLUDED.timecard_delinquent_count,
                      claims_exposure = EXCLUDED.claims_exposure, change_order_exposure = EXCLUDED.change_order_exposure,
                      permit_exposure = EXCLUDED.permit_exposure, closeout_aging_days = EXCLUDED.closeout_aging_days,
                      satisfaction_score = EXCLUDED.satisfaction_score, risk_score = EXCLUDED.risk_score,
                      severity = EXCLUDED.severity, reason_codes_json = EXCLUDED.reason_codes_json,
                      recommended_action = EXCLUDED.recommended_action, recommended_owner = EXCLUDED.recommended_owner,
                      explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(project_id), snapshot_date, horizon,
                        str(snapshot["fee_variance"]), str(snapshot["gaap_variance"]), str(snapshot["ci_variance"]),
                        snapshot["schedule_slip_days"], str(snapshot["labor_overrun_pct"]), snapshot["timecard_delinquent_count"],
                        str(snapshot["claims_exposure"]), str(snapshot["change_order_exposure"]), snapshot["permit_exposure"],
                        snapshot["closeout_aging_days"], str(snapshot["satisfaction_score"]), str(snapshot["risk_score"]),
                        snapshot["severity"], _serialize_list(snapshot["reason_codes"]), snapshot["recommended_action"],
                        snapshot["recommended_owner"], _serialize_json({"project_name": project.get("name")}),
                    ),
                )

            for resource in rows["resources"]:
                resource_id = resource["resource_id"]
                assigned_hours = sum(
                    Decimal("160") * _q(assignment.get("allocation_pct"))
                    for assignment in rows["assignments"]
                    if assignment.get("resource_id") == resource_id
                )
                capacity_hours = sum(
                    _q(capacity.get("capacity_hours"))
                    for capacity in rows["capacity"]
                    if capacity.get("resource_id") == resource_id and start_date <= (_coerce_date(capacity.get("period_date")) or today) <= end_date
                )
                billable_target_hours = sum(
                    _q(capacity.get("billable_target_hours"))
                    for capacity in rows["capacity"]
                    if capacity.get("resource_id") == resource_id and start_date <= (_coerce_date(capacity.get("period_date")) or today) <= end_date
                )
                timecards = [
                    row for row in rows["timecards"]
                    if row.get("resource_id") == resource_id and start_date <= (_coerce_date(row.get("week_ending")) or today) <= end_date
                ]
                submitted_hours = sum(_q(row.get("hours")) for row in timecards if row.get("status") == "submitted")
                delinquent_count = sum(1 for row in timecards if row.get("status") != "submitted")
                utilization_pct = _q(assigned_hours / capacity_hours) if capacity_hours else Decimal("0")
                billable_mix_pct = _q(submitted_hours / billable_target_hours) if billable_target_hours else Decimal("0")
                overload_flag = utilization_pct > Decimal("1.05")
                staffing_gap_flag = utilization_pct < Decimal("0.70")
                reason_codes = []
                if overload_flag:
                    reason_codes.append("OVERALLOCATED")
                if staffing_gap_flag:
                    reason_codes.append("UNDERUTILIZED")
                if delinquent_count > 0:
                    reason_codes.append("TIMECARD_DELINQUENCY")
                cur.execute(
                    """
                    INSERT INTO pds_resource_utilization_snapshot
                    (env_id, business_id, resource_id, snapshot_date, horizon, assigned_hours, capacity_hours, utilization_pct, billable_mix_pct,
                     staffing_gap_flag, overload_flag, delinquent_timecards, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, resource_id)
                    DO UPDATE SET assigned_hours = EXCLUDED.assigned_hours, capacity_hours = EXCLUDED.capacity_hours,
                      utilization_pct = EXCLUDED.utilization_pct, billable_mix_pct = EXCLUDED.billable_mix_pct,
                      staffing_gap_flag = EXCLUDED.staffing_gap_flag, overload_flag = EXCLUDED.overload_flag,
                      delinquent_timecards = EXCLUDED.delinquent_timecards,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(resource_id), snapshot_date, horizon,
                        str(_q(assigned_hours)), str(_q(capacity_hours)), str(utilization_pct), str(billable_mix_pct),
                        staffing_gap_flag, overload_flag, delinquent_count, _serialize_list(reason_codes),
                        _serialize_json({"resource_name": resource.get("full_name"), "title": resource.get("title")}),
                    ),
                )
                submitted_pct = _q(Decimal(sum(1 for row in timecards if row.get("status") == "submitted")) / Decimal(max(1, len(timecards))))
                overdue_hours = sum(_q(row.get("hours")) for row in timecards if row.get("status") != "submitted")
                cur.execute(
                    """
                    INSERT INTO pds_timecard_health_snapshot
                    (env_id, business_id, resource_id, snapshot_date, horizon, submitted_pct, delinquent_count, overdue_hours, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, resource_id)
                    DO UPDATE SET submitted_pct = EXCLUDED.submitted_pct, delinquent_count = EXCLUDED.delinquent_count,
                      overdue_hours = EXCLUDED.overdue_hours,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(resource_id), snapshot_date, horizon,
                        str(submitted_pct), delinquent_count, str(_q(overdue_hours)),
                        _serialize_list(["TIMECARD_DELINQUENCY"] if delinquent_count else []),
                        _serialize_json({"resource_name": resource.get("full_name")}),
                    ),
                )

            for account in rows["accounts"]:
                account_id = account["account_id"]
                rollup = next((row for row in rows["survey_rollups"] if row.get("account_id") == account_id), None)
                reason_codes = []
                average_score = _q((rollup or {}).get("average_score"))
                trend_delta = _q((rollup or {}).get("trend_delta"))
                if average_score < Decimal("3.8"):
                    reason_codes.append("LOW_SCORE")
                if trend_delta < Decimal("0"):
                    reason_codes.append("DECLINING_TREND")
                cur.execute(
                    """
                    INSERT INTO pds_client_satisfaction_snapshot
                    (env_id, business_id, account_id, client_id, snapshot_date, horizon, average_score, trend_delta, response_count,
                     repeat_award_score, risk_state, reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, account_id)
                    DO UPDATE SET client_id = EXCLUDED.client_id, average_score = EXCLUDED.average_score,
                      trend_delta = EXCLUDED.trend_delta, response_count = EXCLUDED.response_count,
                      repeat_award_score = EXCLUDED.repeat_award_score, risk_state = EXCLUDED.risk_state,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(account_id), str(account.get("client_id")) if account.get("client_id") else None,
                        snapshot_date, horizon, str(average_score), str(trend_delta), int((rollup or {}).get("response_count") or 0),
                        str(max(Decimal("0"), average_score - Decimal("0.4"))), "red" if average_score < Decimal("3.8") else "green",
                        _serialize_list(reason_codes), _serialize_json({"account_name": account.get("account_name")}),
                    ),
                )

            for project in projects:
                project_id = project["project_id"]
                closeout = next((row for row in rows["closeout"] if row.get("project_id") == project_id), None)
                if not closeout:
                    continue
                blockers = closeout.get("open_blockers_json") if isinstance(closeout.get("open_blockers_json"), list) else []
                target_date = _coerce_date(closeout.get("closeout_target_date"))
                actual_date = _coerce_date(closeout.get("actual_closeout_date"))
                aging = (today - target_date).days if target_date and actual_date is None and today > target_date else 0
                reason_codes = []
                if aging > 0:
                    reason_codes.append("CLOSEOUT_AGING")
                if closeout.get("final_billing_status") != "submitted":
                    reason_codes.append("FINAL_BILLING_PENDING")
                if not closeout.get("survey_sent_at"):
                    reason_codes.append("SURVEY_PENDING")
                if not closeout.get("lessons_learned_captured_at"):
                    reason_codes.append("LESSONS_PENDING")
                cur.execute(
                    """
                    INSERT INTO pds_closeout_snapshot
                    (env_id, business_id, project_id, snapshot_date, horizon, closeout_target_date, substantial_completion_date, actual_closeout_date,
                     closeout_aging_days, blocker_count, final_billing_status, survey_status, lessons_learned_status, risk_state,
                     reason_codes_json, explainability_json)
                    VALUES
                    (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (env_id, business_id, snapshot_date, horizon, project_id)
                    DO UPDATE SET closeout_target_date = EXCLUDED.closeout_target_date,
                      substantial_completion_date = EXCLUDED.substantial_completion_date,
                      actual_closeout_date = EXCLUDED.actual_closeout_date,
                      closeout_aging_days = EXCLUDED.closeout_aging_days, blocker_count = EXCLUDED.blocker_count,
                      final_billing_status = EXCLUDED.final_billing_status, survey_status = EXCLUDED.survey_status,
                      lessons_learned_status = EXCLUDED.lessons_learned_status, risk_state = EXCLUDED.risk_state,
                      reason_codes_json = EXCLUDED.reason_codes_json, explainability_json = EXCLUDED.explainability_json
                    """,
                    (
                        str(env_id), str(business_id), str(project_id), snapshot_date, horizon,
                        target_date, _coerce_date(closeout.get("substantial_completion_date")), actual_date,
                        aging, len(blockers), closeout.get("final_billing_status") or "pending",
                        "sent" if closeout.get("survey_sent_at") else "pending",
                        "captured" if closeout.get("lessons_learned_captured_at") else "pending",
                        "red" if aging > 0 or len(blockers) > 0 else "green",
                        _serialize_list(reason_codes),
                        _serialize_json({"project_name": project.get("name"), "blockers": blockers}),
                    ),
                )

            # Pipeline → Forecast integration: add weighted pipeline value to base lookups
            try:
                cur.execute(
                    "SELECT account_id, deal_value, probability_pct, stage FROM pds_pipeline_deals WHERE env_id = %s::uuid AND business_id = %s::uuid AND stage IN ('prospect', 'pursuit', 'negotiation', 'won')",
                    (str(env_id), str(business_id)),
                )
                pipeline_rows = cur.fetchall()
                # Build account → weighted pipeline value
                pipeline_by_account: dict[UUID, Decimal] = {}
                for prow in pipeline_rows:
                    acct_id = prow.get("account_id")
                    if acct_id:
                        weighted = _q(prow.get("deal_value")) * (_pipeline_probability_for_stage(prow.get("stage"), prow.get("probability_pct")) / Decimal("100"))
                        pipeline_by_account[acct_id] = pipeline_by_account.get(acct_id, Decimal("0")) + weighted
                # Add pipeline contribution to account base lookup
                for acct_id, weighted_val in pipeline_by_account.items():
                    # Spread pipeline across 3 forecast months
                    monthly_contribution = weighted_val / Decimal("3")
                    account_base_lookup[acct_id] = account_base_lookup.get(acct_id, Decimal("0")) + monthly_contribution
                # Roll up to market via account → market mapping
                account_market_map: dict[UUID, UUID] = {}
                for account in rows["accounts"]:
                    if account.get("market_id"):
                        account_market_map[account["account_id"]] = account["market_id"]
                for acct_id, weighted_val in pipeline_by_account.items():
                    mkt_id = account_market_map.get(acct_id)
                    if mkt_id:
                        monthly_contribution = weighted_val / Decimal("3")
                        market_base_lookup[mkt_id] = market_base_lookup.get(mkt_id, Decimal("0")) + monthly_contribution
            except Exception:
                pass  # pds_pipeline_deals may not exist yet

            _insert_forecast_rows(
                cur,
                env_id=env_id,
                business_id=business_id,
                horizon=horizon,
                snapshot_date=snapshot_date,
                entity_type="market",
                entities=rows["markets"],
                base_lookup=market_base_lookup,
                label_key="market_name",
            )
            _insert_forecast_rows(
                cur,
                env_id=env_id,
                business_id=business_id,
                horizon=horizon,
                snapshot_date=snapshot_date,
                entity_type="account",
                entities=rows["accounts"],
                base_lookup=account_base_lookup,
                label_key="account_name",
            )
            _insert_forecast_rows(
                cur,
                env_id=env_id,
                business_id=business_id,
                horizon=horizon,
                snapshot_date=snapshot_date,
                entity_type="project",
                entities=projects,
                base_lookup=project_base_lookup,
                label_key="name",
            )

    _upsert_pipeline_snapshot(env_id=env_id, business_id=business_id, snapshot_date=today)
    return {"ok": True, "snapshot_date": str(today)}


def _latest_snapshot_rows(table: str, *, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    if not _table_exists(table):
        return []
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {table}
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND horizon = %s
              AND snapshot_date = (
                SELECT MAX(snapshot_date)
                FROM {table}
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND horizon = %s
              )
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id), horizon, str(env_id), str(business_id), horizon),
        )
        return cur.fetchall()


def _forecast_rows(*, env_id: UUID, business_id: UUID, horizon: str, entity_type: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_forecast_snapshot
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND horizon = %s
              AND entity_type = %s
              AND snapshot_date = (
                SELECT MAX(snapshot_date)
                FROM pds_forecast_snapshot
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND horizon = %s
                  AND entity_type = %s
              )
            ORDER BY forecast_month ASC
            """,
            (str(env_id), str(business_id), horizon, entity_type, str(env_id), str(business_id), horizon, entity_type),
        )
        return cur.fetchall()


def get_performance_table(*, env_id: UUID, business_id: UUID, lens: str, horizon: str) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    normalized_lens = normalize_lens(lens)
    normalized_horizon = normalize_horizon(horizon)
    table_by_lens = {
        "market": "pds_market_performance_snapshot",
        "business_line": "pds_business_line_performance_snapshot",
        "account": "pds_account_performance_snapshot",
        "project": "pds_project_health_snapshot",
        "resource": "pds_resource_utilization_snapshot",
    }
    rows = _latest_snapshot_rows(table_by_lens[normalized_lens], env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    entities = _load_rows_by_table(env_id=env_id, business_id=business_id)
    if normalized_lens == "market":
        market_names = {row["market_id"]: row.get("market_name") for row in entities["markets"]}
        return {
            "lens": normalized_lens,
            "horizon": normalized_horizon,
            "columns": ["Market", "Fee", "GAAP", "CI", "Backlog", "Forecast", "Risk"],
            "rows": [
                {
                    "entity_id": row["market_id"],
                    "entity_label": market_names.get(row["market_id"]) or "Market",
                    "owner_label": (next((item for item in entities["markets"] if item["market_id"] == row["market_id"]), {}) or {}).get("leader_name"),
                    "health_status": row.get("health_status") or "green",
                    "fee_plan": _q(row.get("fee_plan")),
                    "fee_actual": _q(row.get("fee_actual")),
                    "fee_variance": _q(row.get("fee_actual")) - _q(row.get("fee_plan")),
                    "gaap_plan": _q(row.get("gaap_plan")),
                    "gaap_actual": _q(row.get("gaap_actual")),
                    "gaap_variance": _q(row.get("gaap_actual")) - _q(row.get("gaap_plan")),
                    "ci_plan": _q(row.get("ci_plan")),
                    "ci_actual": _q(row.get("ci_actual")),
                    "ci_variance": _q(row.get("ci_actual")) - _q(row.get("ci_plan")),
                    "backlog": _q(row.get("backlog")),
                    "forecast": _q(row.get("forecast")),
                    "red_projects": int(row.get("red_projects") or 0),
                    "client_risk_accounts": int(row.get("client_risk_accounts") or 0),
                    "satisfaction_score": _q(row.get("satisfaction_score")),
                    "utilization_pct": _q(row.get("utilization_pct")),
                    "timecard_compliance_pct": _q(row.get("timecard_compliance_pct")),
                    "reason_codes": list(row.get("reason_codes_json") or []),
                    "href": f"/lab/env/{env_id}/pds/markets",
                }
                for row in rows
            ],
        }
    if normalized_lens == "business_line":
        bl_names = {row["business_line_id"]: row.get("line_name") for row in entities.get("business_lines", [])}
        return {
            "lens": normalized_lens,
            "horizon": normalized_horizon,
            "columns": ["Business Line", "Fee", "GAAP", "CI", "Backlog", "Forecast", "Risk"],
            "rows": [
                {
                    "entity_id": row["business_line_id"],
                    "entity_label": bl_names.get(row["business_line_id"]) or "Business Line",
                    "owner_label": None,
                    "health_status": row.get("health_status") or "green",
                    "fee_plan": _q(row.get("fee_plan")),
                    "fee_actual": _q(row.get("fee_actual")),
                    "fee_variance": _q(row.get("fee_actual")) - _q(row.get("fee_plan")),
                    "gaap_plan": _q(row.get("gaap_plan")),
                    "gaap_actual": _q(row.get("gaap_actual")),
                    "gaap_variance": _q(row.get("gaap_actual")) - _q(row.get("gaap_plan")),
                    "ci_plan": _q(row.get("ci_plan")),
                    "ci_actual": _q(row.get("ci_actual")),
                    "ci_variance": _q(row.get("ci_actual")) - _q(row.get("ci_plan")),
                    "backlog": _q(row.get("backlog")),
                    "forecast": _q(row.get("forecast")),
                    "red_projects": int(row.get("red_projects") or 0),
                    "client_risk_accounts": int(row.get("client_risk_accounts") or 0),
                    "satisfaction_score": _q(row.get("satisfaction_score")),
                    "utilization_pct": _q(row.get("utilization_pct")),
                    "timecard_compliance_pct": _q(row.get("timecard_compliance_pct")),
                    "reason_codes": list(row.get("reason_codes_json") or []),
                    "href": f"/lab/env/{env_id}/pds/markets",
                }
                for row in rows
            ],
        }
    if normalized_lens == "account":
        account_names = {row["account_id"]: row.get("account_name") for row in entities["accounts"]}
        return {
            "lens": normalized_lens,
            "horizon": normalized_horizon,
            "columns": ["Account", "Fee", "GAAP", "CI", "Backlog", "Forecast", "Satisfaction"],
            "rows": [
                {
                    "entity_id": row["account_id"],
                    "entity_label": account_names.get(row["account_id"]) or "Account",
                    "owner_label": (next((item for item in entities["accounts"] if item["account_id"] == row["account_id"]), {}) or {}).get("owner_name"),
                    "health_status": row.get("health_status") or "green",
                    "fee_plan": _q(row.get("fee_plan")),
                    "fee_actual": _q(row.get("fee_actual")),
                    "fee_variance": _q(row.get("fee_actual")) - _q(row.get("fee_plan")),
                    "gaap_plan": _q(row.get("gaap_plan")),
                    "gaap_actual": _q(row.get("gaap_actual")),
                    "gaap_variance": _q(row.get("gaap_actual")) - _q(row.get("gaap_plan")),
                    "ci_plan": _q(row.get("ci_plan")),
                    "ci_actual": _q(row.get("ci_actual")),
                    "ci_variance": _q(row.get("ci_actual")) - _q(row.get("ci_plan")),
                    "backlog": _q(row.get("backlog")),
                    "forecast": _q(row.get("forecast")),
                    "red_projects": int(row.get("red_projects") or 0),
                    "collections_lag": _q(row.get("collections_lag")),
                    "writeoff_leakage": _q(row.get("writeoff_leakage")),
                    "satisfaction_score": _q(row.get("satisfaction_score")),
                    "reason_codes": list(row.get("reason_codes_json") or []),
                    "href": f"/lab/env/{env_id}/pds/accounts",
                }
                for row in rows
            ],
        }
    if normalized_lens == "project":
        return {
            "lens": normalized_lens,
            "horizon": normalized_horizon,
            "columns": ["Project", "Risk", "Slip", "Claims", "Closeout", "Action"],
            "rows": [
                {
                    "entity_id": row["project_id"],
                    "entity_label": (next((item for item in entities["projects"] if item["project_id"] == row["project_id"]), {}) or {}).get("name") or "Project",
                    "owner_label": (next((item for item in entities["projects"] if item["project_id"] == row["project_id"]), {}) or {}).get("project_executive"),
                    "health_status": row.get("severity") or "green",
                    "fee_variance": _q(row.get("fee_variance")),
                    "gaap_variance": _q(row.get("gaap_variance")),
                    "ci_variance": _q(row.get("ci_variance")),
                    "forecast": _q(row.get("fee_variance")) * Decimal("-1"),
                    "red_projects": 1 if row.get("severity") in {"orange", "red"} else 0,
                    "satisfaction_score": _q(row.get("satisfaction_score")),
                    "reason_codes": list(row.get("reason_codes_json") or []),
                    "href": _project_href(env_id=env_id, project_id=row["project_id"]),
                }
                for row in rows
            ],
        }
    timecard_rows = _latest_snapshot_rows("pds_timecard_health_snapshot", env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    timecard_by_resource = {row.get("resource_id"): row for row in timecard_rows}
    return {
        "lens": normalized_lens,
        "horizon": normalized_horizon,
        "columns": ["Resource", "Utilization", "Billable Mix", "Timecards", "Flags"],
        "rows": [
            {
                "entity_id": row["resource_id"],
                "entity_label": (next((item for item in entities["resources"] if item["resource_id"] == row["resource_id"]), {}) or {}).get("full_name") or "Resource",
                "owner_label": (next((item for item in entities["resources"] if item["resource_id"] == row["resource_id"]), {}) or {}).get("title"),
                "health_status": "red" if row.get("overload_flag") else "yellow" if row.get("staffing_gap_flag") else "green",
                "forecast": _q(row.get("assigned_hours")),
                "utilization_pct": _q(row.get("utilization_pct")),
                "timecard_compliance_pct": _q((timecard_by_resource.get(row["resource_id"]) or {}).get("submitted_pct")),
                "reason_codes": list(row.get("reason_codes_json") or []),
                "href": f"/lab/env/{env_id}/pds/resources",
            }
            for row in rows
        ],
    }


def get_delivery_risk(*, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _latest_snapshot_rows("pds_project_health_snapshot", env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon))
    projects = {row["project_id"]: row for row in pds_core.list_projects(env_id=env_id, business_id=business_id, limit=200)}
    entity_rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    accounts = {row["account_id"]: row for row in entity_rows["accounts"]}
    markets = {row["market_id"]: row for row in entity_rows["markets"]}
    items = []
    for row in rows:
        if row.get("severity") not in {"orange", "red"}:
            continue
        project = projects.get(row["project_id"], {})
        account = accounts.get(project.get("account_id"), {})
        market = markets.get(project.get("market_id"), {})
        items.append(
            {
                "project_id": row["project_id"],
                "project_name": project.get("name") or "Project",
                "account_name": account.get("account_name"),
                "market_name": market.get("market_name"),
                "issue_summary": ", ".join((row.get("reason_codes_json") or [])[:2]) or "Delivery risk",
                "severity": row.get("severity") or "yellow",
                "risk_score": _q(row.get("risk_score")),
                "reason_codes": list(row.get("reason_codes_json") or []),
                "recommended_action": row.get("recommended_action") or "Review project health",
                "recommended_owner": row.get("recommended_owner"),
                "href": _project_href(env_id=env_id, project_id=row["project_id"]),
            }
        )
    items.sort(key=lambda item: item["risk_score"], reverse=True)
    return items[:8]


def get_resource_health(*, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _latest_snapshot_rows("pds_resource_utilization_snapshot", env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon))
    entity_rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    resources = {row["resource_id"]: row for row in entity_rows["resources"]}
    markets = {row["market_id"]: row for row in entity_rows["markets"]}
    items = []
    for row in rows:
        resource = resources.get(row["resource_id"], {})
        market = markets.get(resource.get("home_market_id"), {})
        items.append(
            {
                "resource_id": row["resource_id"],
                "resource_name": resource.get("full_name") or "Resource",
                "title": resource.get("title"),
                "market_name": market.get("market_name"),
                "utilization_pct": _q(row.get("utilization_pct")),
                "billable_mix_pct": _q(row.get("billable_mix_pct")),
                "delinquent_timecards": int(row.get("delinquent_timecards") or 0),
                "overload_flag": bool(row.get("overload_flag")),
                "staffing_gap_flag": bool(row.get("staffing_gap_flag")),
                "reason_codes": list(row.get("reason_codes_json") or []),
            }
        )
    items.sort(key=lambda item: (item["overload_flag"], item["delinquent_timecards"], item["utilization_pct"]), reverse=True)
    return items[:8]


def get_timecard_health(*, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _latest_snapshot_rows("pds_timecard_health_snapshot", env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon))
    entity_rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    resources = {row["resource_id"]: row for row in entity_rows["resources"]}
    items = []
    for row in rows:
        resource = resources.get(row.get("resource_id"), {})
        items.append(
            {
                "resource_id": row.get("resource_id"),
                "resource_name": resource.get("full_name") or "Resource",
                "submitted_pct": _q(row.get("submitted_pct")),
                "delinquent_count": int(row.get("delinquent_count") or 0),
                "overdue_hours": _q(row.get("overdue_hours")),
                "reason_codes": list(row.get("reason_codes_json") or []),
            }
        )
    items.sort(key=lambda item: (item["delinquent_count"], item["overdue_hours"]), reverse=True)
    return items[:8]


def get_forecast(*, env_id: UUID, business_id: UUID, horizon: str, lens: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    normalized_lens = normalize_lens(lens)
    entity_type = normalized_lens if normalized_lens != "resource" else "market"
    rows = _forecast_rows(env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon), entity_type=entity_type)
    entities = _load_rows_by_table(env_id=env_id, business_id=business_id)
    label_maps = {
        "market": {row["market_id"]: row.get("market_name") for row in entities["markets"]},
        "account": {row["account_id"]: row.get("account_name") for row in entities["accounts"]},
        "project": {row["project_id"]: row.get("name") for row in entities["projects"]},
    }
    labels = label_maps.get(entity_type, {})
    return [
        {
            "forecast_month": row["forecast_month"],
            "entity_type": entity_type,
            "entity_id": row["entity_id"],
            "entity_label": labels.get(row["entity_id"]) or entity_type.title(),
            "current_value": _q(row.get("current_value")),
            "prior_value": _q(row.get("prior_value")),
            "delta_value": _q(row.get("delta_value")),
            "override_value": _q(row.get("override_value")) if row.get("override_value") is not None else None,
            "override_reason": row.get("override_reason"),
            "confidence_score": _q(row.get("confidence_score")),
        }
        for row in rows[:12]
    ]


def get_satisfaction(*, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _latest_snapshot_rows("pds_client_satisfaction_snapshot", env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon))
    entity_rows = _load_rows_by_table(env_id=env_id, business_id=business_id)
    accounts = {row["account_id"]: row for row in entity_rows["accounts"]}
    clients = {row["client_id"]: row for row in entity_rows["clients"]}
    items = []
    for row in rows:
        account = accounts.get(row.get("account_id"), {})
        client = clients.get(row.get("client_id"), {})
        items.append(
            {
                "account_id": row.get("account_id"),
                "account_name": account.get("account_name") or "Account",
                "client_name": client.get("client_name"),
                "average_score": _q(row.get("average_score")),
                "trend_delta": _q(row.get("trend_delta")),
                "response_count": int(row.get("response_count") or 0),
                "repeat_award_score": _q(row.get("repeat_award_score")),
                "risk_state": row.get("risk_state") or "green",
                "reason_codes": list(row.get("reason_codes_json") or []),
            }
        )
    items.sort(key=lambda item: (item["risk_state"], item["average_score"]), reverse=False)
    return items[:8]


def get_closeout(*, env_id: UUID, business_id: UUID, horizon: str) -> list[dict[str, Any]]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _latest_snapshot_rows("pds_closeout_snapshot", env_id=env_id, business_id=business_id, horizon=normalize_horizon(horizon))
    projects = {row["project_id"]: row for row in pds_core.list_projects(env_id=env_id, business_id=business_id, limit=200)}
    items = []
    for row in rows:
        project = projects.get(row["project_id"], {})
        items.append(
            {
                "project_id": row["project_id"],
                "project_name": project.get("name") or "Project",
                "closeout_target_date": row.get("closeout_target_date"),
                "substantial_completion_date": row.get("substantial_completion_date"),
                "actual_closeout_date": row.get("actual_closeout_date"),
                "closeout_aging_days": int(row.get("closeout_aging_days") or 0),
                "blocker_count": int(row.get("blocker_count") or 0),
                "final_billing_status": row.get("final_billing_status") or "pending",
                "survey_status": row.get("survey_status") or "pending",
                "lessons_learned_status": row.get("lessons_learned_status") or "pending",
                "risk_state": row.get("risk_state") or "green",
                "reason_codes": list(row.get("reason_codes_json") or []),
                "href": _project_href(env_id=env_id, project_id=row["project_id"], section="closeout"),
            }
        )
    items.sort(key=lambda item: (item["closeout_aging_days"], item["blocker_count"]), reverse=True)
    return items[:8]


def get_executive_briefing(
    *,
    env_id: UUID,
    business_id: UUID,
    lens: str,
    horizon: str,
    role_preset: str,
    performance_table: dict[str, Any] | None = None,
    delivery_risk: list[dict[str, Any]] | None = None,
    resources: list[dict[str, Any]] | None = None,
    satisfaction: list[dict[str, Any]] | None = None,
    closeout: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    # Accept pre-fetched data from get_command_center to avoid duplicate queries
    if performance_table is None:
        performance_table = get_performance_table(env_id=env_id, business_id=business_id, lens=lens, horizon=horizon)
    if delivery_risk is None:
        delivery_risk = get_delivery_risk(env_id=env_id, business_id=business_id, horizon=horizon)
    if resources is None:
        resources = get_resource_health(env_id=env_id, business_id=business_id, horizon=horizon)
    if satisfaction is None:
        satisfaction = get_satisfaction(env_id=env_id, business_id=business_id, horizon=horizon)
    if closeout is None:
        closeout = get_closeout(env_id=env_id, business_id=business_id, horizon=horizon)

    top_row = performance_table["rows"][0] if performance_table["rows"] else None
    risk_names = ", ".join(item["project_name"] for item in delivery_risk[:2]) or "no immediate interventions"
    resource_name = resources[0]["resource_name"] if resources else "resource bench"
    headline = (
        f"{normalize_lens(lens).title()} view shows {len(delivery_risk)} intervention items and "
        f"{len([row for row in satisfaction if row['risk_state'] == 'red'])} client-risk accounts."
    )
    summary_lines = [
        f"Primary management lens: {normalize_lens(lens).title()} with {normalize_horizon(horizon)} horizon.",
        f"Top variance concentration: {top_row['entity_label'] if top_row else 'No performance row'}.",
        f"Immediate delivery watchlist: {risk_names}.",
        f"Resource pressure centers on {resource_name}.",
        f"Closeout exposure includes {len([row for row in closeout if row['risk_state'] == 'red'])} delayed project(s).",
    ]
    recommended_actions = [
        delivery_risk[0]["recommended_action"] if delivery_risk else "Review forecast drift by market and account.",
        "Enforce timecard cleanup on delinquent teams before weekly forecast lock.",
        "Trigger executive outreach on low-satisfaction accounts.",
    ]
    return {
        "generated_at": utc_now(),
        "lens": normalize_lens(lens),
        "horizon": normalize_horizon(horizon),
        "role_preset": normalize_role_preset(role_preset),
        "headline": headline,
        "summary_lines": summary_lines,
        "recommended_actions": recommended_actions,
    }


def _coerce_datetime(value: Any) -> datetime | None:
    return coerce_utc_datetime(value)


def _pipeline_stage_label(stage: str) -> str:
    return {
        "prospect": "Prospect",
        "pursuit": "Pursuit",
        "negotiation": "Negotiation",
        "won": "Won",
        "converted": "Converted",
        "lost": "Lost",
    }.get(stage, stage.replace("_", " ").title())


def _normalize_pipeline_stage(stage: Any) -> str:
    normalized = str(stage or "prospect").strip().lower()
    if normalized not in PIPELINE_STAGE_ORDER:
        raise ValueError(f"Unsupported pipeline stage: {stage}")
    return normalized


def _nonnegative_decimal(value: Any) -> Decimal:
    return max(Decimal("0"), _q(value))


def _pipeline_probability_for_stage(stage: str, probability_pct: Any) -> Decimal:
    normalized_stage = _normalize_pipeline_stage(stage)
    if normalized_stage == "converted":
        return Decimal("100")
    if normalized_stage == "lost":
        return Decimal("0")
    return _normalize_pct_100(probability_pct)


def _pipeline_health_tone(*, stage: str, attention_reasons: list[str]) -> str:
    if "overdue_close" in attention_reasons or "stalled" in attention_reasons:
        return "danger"
    if "low_probability_high_value" in attention_reasons or "closing_soon" in attention_reasons:
        return "warn"
    if stage in {"won", "converted"}:
        return "positive"
    return "neutral"


def _pipeline_issue_copy(reason: str) -> tuple[str, str, str]:
    if reason == "overdue_close":
        return "overdue_close", "Close date is overdue.", "Update the close plan or push the deal forward."
    if reason == "stalled":
        return "stalled", "No recent activity on the deal.", "Re-engage the owner and refresh next steps."
    if reason == "low_probability_high_value":
        return "low_probability_high_value", "High value with low close probability.", "Reassess qualification or raise confidence with a concrete next action."
    return "closing_soon", "Expected close is within 30 days.", "Confirm the close plan and owner commitments."


def _pipeline_next_stage(stage: str) -> str | None:
    transitions = {
        "prospect": "pursuit",
        "pursuit": "negotiation",
        "negotiation": "won",
        "won": "converted",
    }
    return transitions.get(stage)


def _pipeline_snapshot_rows(*, env_id: UUID, business_id: UUID, limit: int = 2) -> list[dict[str, Any]]:
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM pds_pipeline_snapshot_daily
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                ORDER BY snapshot_date DESC
                LIMIT %s
                """,
                (str(env_id), str(business_id), limit),
            )
            return cur.fetchall()
    except Exception:
        return []


def _upsert_pipeline_snapshot(*, env_id: UUID, business_id: UUID, snapshot_date: date | None = None) -> None:
    snapshot_date = snapshot_date or _today()
    deals = _fetch_pipeline_deal_rows(env_id=env_id, business_id=business_id)
    active_deals = [deal for deal in deals if deal["stage"] in PIPELINE_ACTIVE_STAGES]
    total_pipeline = sum(_nonnegative_decimal(deal.get("deal_value")) for deal in active_deals)
    total_weighted = sum(
        _nonnegative_decimal(deal.get("deal_value")) * (_pipeline_probability_for_stage(deal["stage"], deal.get("probability_pct")) / Decimal("100"))
        for deal in active_deals
    )
    won_count = sum(1 for deal in deals if deal["stage"] == "won")
    converted_count = sum(1 for deal in deals if deal["stage"] == "converted")
    lost_count = sum(1 for deal in deals if deal["stage"] == "lost")
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO pds_pipeline_snapshot_daily
                (env_id, business_id, snapshot_date, total_pipeline_value, total_weighted_value,
                 active_deal_count, won_count, converted_count, lost_count, updated_at)
                VALUES
                (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (env_id, business_id, snapshot_date)
                DO UPDATE SET total_pipeline_value = EXCLUDED.total_pipeline_value,
                  total_weighted_value = EXCLUDED.total_weighted_value,
                  active_deal_count = EXCLUDED.active_deal_count,
                  won_count = EXCLUDED.won_count,
                  converted_count = EXCLUDED.converted_count,
                  lost_count = EXCLUDED.lost_count,
                  updated_at = now()
                """,
                (
                    str(env_id),
                    str(business_id),
                    snapshot_date,
                    str(_q(total_pipeline)),
                    str(_q(total_weighted)),
                    len(active_deals),
                    won_count,
                    converted_count,
                    lost_count,
                ),
            )
    except Exception:
        pass


def _fetch_pipeline_deal_rows(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT d.deal_id, d.deal_name, d.account_id, a.account_name, d.stage,
                       d.deal_value, d.probability_pct, d.expected_close_date, d.owner_name,
                       d.notes, d.lost_reason, d.stage_entered_at, d.last_activity_at,
                       d.created_at, d.updated_at
                FROM pds_pipeline_deals d
                LEFT JOIN pds_accounts a ON a.account_id = d.account_id
                WHERE d.env_id = %s::uuid AND d.business_id = %s::uuid
                ORDER BY d.deal_value DESC NULLS LAST, d.created_at DESC
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except Exception:
        return []


def _fetch_pipeline_history_rows(*, env_id: UUID, business_id: UUID, deal_id: UUID | None = None) -> list[dict[str, Any]]:
    try:
        with get_cursor() as cur:
            sql = """
                SELECT stage_history_id, deal_id, from_stage, to_stage, changed_at, note
                FROM pds_pipeline_deal_stage_history
                WHERE env_id = %s::uuid AND business_id = %s::uuid
            """
            params: list[Any] = [str(env_id), str(business_id)]
            if deal_id is not None:
                sql += " AND deal_id = %s::uuid"
                params.append(str(deal_id))
            sql += " ORDER BY changed_at DESC"
            cur.execute(sql, tuple(params))
            return cur.fetchall()
    except Exception:
        return []


def _pipeline_reasons(*, stage: str, deal_value: Decimal, probability_pct: Decimal, expected_close_date: date | None, last_activity_at: datetime | None, today: date) -> list[str]:
    reasons: list[str] = []
    if stage in PIPELINE_CLOSED_STAGES:
        return reasons
    if expected_close_date:
        days_to_close = (expected_close_date - today).days
        if days_to_close < 0:
            reasons.append("overdue_close")
        elif days_to_close <= 30:
            reasons.append("closing_soon")
    if last_activity_at and (today - last_activity_at.date()).days >= 14:
        reasons.append("stalled")
    if deal_value >= Decimal("1000000") and probability_pct < Decimal("40"):
        reasons.append("low_probability_high_value")
    return reasons


def _pipeline_deal_from_row(row: dict[str, Any], *, today: date) -> dict[str, Any]:
    stage = _normalize_pipeline_stage(row.get("stage"))
    stage_entered_at = _coerce_datetime(row.get("stage_entered_at")) or _coerce_datetime(row.get("updated_at")) or _coerce_datetime(row.get("created_at"))
    last_activity_at = _coerce_datetime(row.get("last_activity_at")) or _coerce_datetime(row.get("updated_at")) or _coerce_datetime(row.get("created_at"))
    deal_value = _nonnegative_decimal(row.get("deal_value"))
    probability_pct = _pipeline_probability_for_stage(stage, row.get("probability_pct"))
    expected_close_date = _coerce_date(row.get("expected_close_date"))
    attention_reasons = _pipeline_reasons(
        stage=stage,
        deal_value=deal_value,
        probability_pct=probability_pct,
        expected_close_date=expected_close_date,
        last_activity_at=last_activity_at,
        today=today,
    )
    days_in_stage = max(0, (today - stage_entered_at.date()).days) if stage_entered_at else 0
    days_to_close = (expected_close_date - today).days if expected_close_date else None
    return {
        "deal_id": row["deal_id"],
        "deal_name": row["deal_name"],
        "account_id": row.get("account_id"),
        "account_name": row.get("account_name"),
        "stage": stage,
        "deal_value": deal_value,
        "probability_pct": probability_pct,
        "expected_close_date": expected_close_date,
        "owner_name": row.get("owner_name"),
        "notes": row.get("notes"),
        "lost_reason": row.get("lost_reason"),
        "stage_entered_at": stage_entered_at,
        "last_activity_at": last_activity_at,
        "days_in_stage": days_in_stage,
        "days_to_close": days_to_close,
        "health_state": _pipeline_health_tone(stage=stage, attention_reasons=attention_reasons),
        "attention_reasons": attention_reasons,
        "is_closed": stage in PIPELINE_CLOSED_STAGES,
    }


def _pipeline_stage_summaries(*, deals: list[dict[str, Any]], history_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stage_map: dict[str, dict[str, Any]] = {
        stage: {
            "stage": stage,
            "label": _pipeline_stage_label(stage),
            "count": 0,
            "weighted_value": Decimal("0"),
            "unweighted_value": Decimal("0"),
            "avg_days_in_stage": None,
            "conversion_to_next_pct": None,
            "dropoff_pct": None,
            "tone": "neutral",
        }
        for stage in PIPELINE_STAGE_ORDER
    }
    durations: dict[str, list[Decimal]] = {stage: [] for stage in PIPELINE_STAGE_ORDER}
    for deal in deals:
        stage = deal["stage"]
        if stage not in stage_map:
            continue
        weighted = _q(deal["deal_value"] * deal["probability_pct"] / Decimal("100"))
        stage_map[stage]["count"] += 1
        stage_map[stage]["unweighted_value"] += deal["deal_value"]
        stage_map[stage]["weighted_value"] += weighted
        if deal["days_in_stage"] is not None:
            durations[stage].append(Decimal(int(deal["days_in_stage"])))
        if stage in {"won", "converted"}:
            stage_map[stage]["tone"] = "positive"
        elif stage == "lost":
            stage_map[stage]["tone"] = "danger"
        elif any(reason in {"stalled", "overdue_close"} for reason in deal["attention_reasons"]):
            stage_map[stage]["tone"] = "warn"

    window_start = utc_now() - timedelta(days=180)
    entered_counts: dict[str, int] = {stage: 0 for stage in PIPELINE_STAGE_ORDER}
    transition_counts: dict[str, int] = {stage: 0 for stage in PIPELINE_STAGE_ORDER}
    drop_counts: dict[str, int] = {stage: 0 for stage in PIPELINE_STAGE_ORDER}
    for row in history_rows:
        changed_at = _coerce_datetime(row.get("changed_at"))
        if changed_at is None or changed_at < window_start:
            continue
        to_stage = _normalize_pipeline_stage(row.get("to_stage"))
        entered_counts[to_stage] = entered_counts.get(to_stage, 0) + 1
        from_stage = row.get("from_stage")
        if from_stage:
            normalized_from = _normalize_pipeline_stage(from_stage)
            if to_stage == _pipeline_next_stage(normalized_from):
                transition_counts[normalized_from] = transition_counts.get(normalized_from, 0) + 1
            if to_stage == "lost":
                drop_counts[normalized_from] = drop_counts.get(normalized_from, 0) + 1

    for stage in PIPELINE_STAGE_ORDER:
        if durations[stage]:
            stage_map[stage]["avg_days_in_stage"] = _safe_avg(durations[stage])
        entered = entered_counts.get(stage, 0)
        if entered >= 3:
            next_count = transition_counts.get(stage, 0)
            drop_count = drop_counts.get(stage, 0)
            if _pipeline_next_stage(stage):
                stage_map[stage]["conversion_to_next_pct"] = _q(Decimal(next_count) / Decimal(entered) * Decimal("100"))
            if drop_count > 0:
                stage_map[stage]["dropoff_pct"] = _q(Decimal(drop_count) / Decimal(entered) * Decimal("100"))

    return [stage_map[stage] for stage in PIPELINE_STAGE_ORDER]


def _pipeline_attention_items(deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority = {
        "overdue_close": 0,
        "stalled": 1,
        "low_probability_high_value": 2,
        "closing_soon": 3,
    }
    items: list[tuple[int, Decimal, dict[str, Any]]] = []
    for deal in deals:
        if not deal["attention_reasons"]:
            continue
        reason = sorted(deal["attention_reasons"], key=lambda key: priority.get(key, 99))[0]
        issue_type, issue, action = _pipeline_issue_copy(reason)
        item = {
            "deal_id": deal["deal_id"],
            "deal_name": deal["deal_name"],
            "account_name": deal.get("account_name"),
            "stage": deal["stage"],
            "deal_value": deal["deal_value"],
            "probability_pct": deal["probability_pct"],
            "expected_close_date": deal.get("expected_close_date"),
            "issue_type": issue_type,
            "issue": issue,
            "action": action,
            "tone": "danger" if reason in {"overdue_close", "stalled"} else "warn",
        }
        items.append((priority.get(reason, 99), -deal["deal_value"], item))
    items.sort(key=lambda item: (item[0], item[1]))
    return [item[2] for item in items[:9]]


def _pipeline_timeline_points(deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: dict[date, dict[str, Any]] = {}
    for deal in deals:
        if deal["stage"] not in PIPELINE_ACTIVE_STAGES:
            continue
        expected_close = deal.get("expected_close_date")
        if expected_close is None:
            continue
        forecast_month = date(expected_close.year, expected_close.month, 1)
        bucket = timeline.setdefault(
            forecast_month,
            {
                "forecast_month": forecast_month,
                "unweighted_value": Decimal("0"),
                "weighted_value": Decimal("0"),
                "deal_count": 0,
            },
        )
        bucket["unweighted_value"] += deal["deal_value"]
        bucket["weighted_value"] += _q(deal["deal_value"] * deal["probability_pct"] / Decimal("100"))
        bucket["deal_count"] += 1
    return [timeline[key] for key in sorted(timeline.keys())]


def _pipeline_metrics(*, deals: list[dict[str, Any]], env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    active_deals = [deal for deal in deals if deal["stage"] in PIPELINE_ACTIVE_STAGES]
    total_pipeline = _q(sum(deal["deal_value"] for deal in active_deals))
    total_weighted = _q(sum(deal["deal_value"] * deal["probability_pct"] / Decimal("100") for deal in active_deals))
    won_count = sum(1 for deal in deals if deal["stage"] in PIPELINE_WON_STAGES)
    lost_count = sum(1 for deal in deals if deal["stage"] == "lost")
    win_rate = _q(Decimal(won_count) / Decimal(won_count + lost_count) * Decimal("100")) if (won_count + lost_count) > 0 else None

    snapshot_rows = _pipeline_snapshot_rows(env_id=env_id, business_id=business_id, limit=2)
    previous_snapshot = snapshot_rows[1] if len(snapshot_rows) > 1 else None

    return [
        {
            "key": "total_pipeline",
            "label": "Total Pipeline",
            "value": total_pipeline,
            "delta_value": _q(total_pipeline - _q(previous_snapshot.get("total_pipeline_value"))) if previous_snapshot else None,
            "delta_label": "vs prior snapshot" if previous_snapshot else None,
            "tone": "neutral",
            "context": "Open value across prospect to won.",
            "empty_hint": "Start by adding the first deal and expected close date.",
        },
        {
            "key": "weighted_pipeline",
            "label": "Weighted Pipeline",
            "value": total_weighted,
            "delta_value": _q(total_weighted - _q(previous_snapshot.get("total_weighted_value"))) if previous_snapshot else None,
            "delta_label": "vs prior snapshot" if previous_snapshot else None,
            "tone": "positive" if total_weighted > 0 else "neutral",
            "context": "Probability-adjusted expected revenue.",
            "empty_hint": "Probability turns raw pipeline into forecast value.",
        },
        {
            "key": "active_deals",
            "label": "Active Deals",
            "value": len(active_deals),
            "delta_value": len(active_deals) - int(previous_snapshot.get("active_deal_count") or 0) if previous_snapshot else None,
            "delta_label": "vs prior snapshot" if previous_snapshot else None,
            "tone": "neutral",
            "context": "Prospect, pursuit, negotiation, and won.",
            "empty_hint": "Create a deal to start the board.",
        },
        {
            "key": "win_rate",
            "label": "Win Rate",
            "value": win_rate,
            "delta_value": None,
            "delta_label": None,
            "tone": "positive" if win_rate and win_rate >= Decimal("50") else "warn" if win_rate is not None else "neutral",
            "context": "Won plus converted over won plus converted plus lost.",
            "empty_hint": "Win rate appears after there is enough closed outcome history.",
        },
    ]


def _pipeline_example_deal() -> dict[str, Any]:
    return {
        "deal_name": "Northwest Medical Campus Refresh",
        "account_name": "Stone Strategic Accounts",
        "stage": "prospect",
        "deal_value": Decimal("1200000"),
        "probability_pct": Decimal("25"),
        "expected_close_date": _today() + timedelta(days=45),
        "owner_name": "Dana Park",
    }


def _severity_bucket(score: Decimal | float | int) -> str:
    value = float(score)
    if value >= 80:
        return "critical"
    if value >= 55:
        return "warning"
    if value >= 25:
        return "watch"
    return "neutral"


def _severity_from_tone(tone: str | None) -> str:
    if tone == "danger":
        return "critical"
    if tone == "warn":
        return "warning"
    return "neutral"


def _reason_tags_from_codes(reason_codes: Iterable[Any] | None) -> list[str]:
    tags: list[str] = []
    for raw_code in reason_codes or []:
        code = str(raw_code or "").strip().lower()
        if not code:
            continue
        mapped = None
        if "timecard" in code or "late_tc" in code:
            mapped = "delinquent_timecards"
        elif "staff" in code or "overload" in code or "gap" in code:
            mapped = "staffing"
        elif "util" in code:
            mapped = "utilization"
        elif "backlog" in code:
            mapped = "backlog"
        elif "closeout" in code or "billing" in code or "blocker" in code:
            mapped = "closeout"
        elif "client" in code or "satisfaction" in code or "survey" in code:
            mapped = "client_risk"
        elif code == "ci" or "ci_" in code or "margin" in code:
            mapped = "ci_miss"
        elif "pipeline" in code or "deal" in code:
            mapped = "pipeline_slip"
        elif "forecast" in code:
            mapped = "forecast_risk"
        if mapped and mapped not in tags:
            tags.append(mapped)
    return tags


def _reason_summary(reason_codes: Iterable[str]) -> str:
    labels = [HOME_REASON_LABELS.get(code, code.replace("_", " ")) for code in reason_codes]
    if not labels:
        return "mixed operating pressure"
    return ", ".join(labels[:3])


def _variance_pct(actual: Any, plan: Any) -> Decimal:
    actual_value = _q(actual)
    plan_value = _q(plan)
    if plan_value == 0:
        return Decimal("0")
    return _q((actual_value - plan_value) / abs(plan_value))


def _lookup_market_geo(market_name: str, market_code: str | None = None) -> tuple[float, float]:
    name_lc = (market_name or "").lower()
    code_lc = (market_code or "").lower()
    for key, coords in MARKET_GEO_FALLBACKS.items():
        if key in name_lc or key in code_lc:
            return coords
    hash_seed = sum(ord(ch) for ch in (market_name or "market"))
    jitter_lat = ((hash_seed % 100) / 100) * 5 - 2.5
    jitter_lng = (((hash_seed // 7) % 100) / 100) * 8 - 4
    return 39.8 + jitter_lat, -98.5 + jitter_lng


def _load_market_lookup(*, env_id: UUID, business_id: UUID) -> dict[str, dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT market_id, market_name, market_code, leader_name
            FROM pds_markets
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall()
    return {
        str(row["market_id"]): {
            "market_name": row.get("market_name"),
            "market_code": row.get("market_code"),
            "leader_name": row.get("leader_name"),
        }
        for row in rows
    }


def _load_top_accounts_by_market(*, env_id: UUID, business_id: UUID) -> dict[str, list[str]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT m.market_id, a.account_name
            FROM pds_accounts a
            JOIN pds_markets m ON m.market_id = a.market_id
            WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid
            ORDER BY a.account_name
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall()
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(str(row["market_id"]), [])
        if len(grouped[str(row["market_id"])]) < 3:
            grouped[str(row["market_id"])].append(str(row["account_name"]))
    return grouped


def _build_pipeline_rollup(pipeline_summary: dict[str, Any]) -> dict[str, Any]:
    attention_items = pipeline_summary.get("attention_items") or []
    deals = pipeline_summary.get("deals") or []
    high_value_low_probability = sum(1 for item in attention_items if item.get("issue_type") == "High Value / Low Prob")
    return {
        "active_deals": len([deal for deal in deals if deal.get("stage") in PIPELINE_ACTIVE_STAGES]),
        "overdue_close_count": sum(1 for item in attention_items if item.get("issue_type") == "Overdue Close"),
        "stalled_count": sum(1 for item in attention_items if item.get("issue_type") == "Stalled"),
        "high_value_low_probability_count": high_value_low_probability,
        "total_pipeline_value": pipeline_summary.get("total_pipeline_value") or Decimal("0"),
        "total_weighted_value": pipeline_summary.get("total_weighted_value") or Decimal("0"),
        "top_deal_name": attention_items[0].get("deal_name") if attention_items else None,
        "top_issue": attention_items[0].get("issue") if attention_items else None,
    }


def _build_alert_filters(
    *,
    performance_rows: list[dict[str, Any]],
    resource_health: list[dict[str, Any]],
    timecard_health: list[dict[str, Any]],
    delivery_risk: list[dict[str, Any]],
    closeout: list[dict[str, Any]],
    pipeline_summary: dict[str, Any],
) -> list[dict[str, Any]]:
    below_plan = [row for row in performance_rows if _variance_pct(row.get("fee_actual"), row.get("fee_plan")) < Decimal("-0.03")]
    staffing = [row for row in resource_health if row.get("overload_flag") or row.get("staffing_gap_flag")]
    delinquent = [row for row in timecard_health if int(row.get("delinquent_count") or 0) > 0]
    red_projects = [row for row in delivery_risk if str(row.get("severity") or "") in {"red", "orange"}]
    closeout_risk = [row for row in closeout if int(row.get("blocker_count") or 0) > 0 or int(row.get("closeout_aging_days") or 0) > 30]
    pipeline_attention = pipeline_summary.get("attention_items") or []
    items = [
        {
            "key": "markets_below_plan",
            "label": f"{len(below_plan)} market{'s' if len(below_plan) != 1 else ''} below plan",
            "count": len(below_plan),
            "description": "Markets trailing fee revenue plan.",
            "severity": "critical" if len(below_plan) >= 3 else "warning" if below_plan else "neutral",
            "tone": "danger" if below_plan else "neutral",
            "reason_codes": ["forecast_risk"],
            "entity_ids": [str(row["entity_id"]) for row in below_plan],
        },
        {
            "key": "staffing_risks",
            "label": f"{len(staffing)} staffing risks",
            "count": len(staffing),
            "description": "Overload or staffing gap pressure across resources.",
            "severity": "critical" if len(staffing) >= 6 else "warning" if staffing else "neutral",
            "tone": "danger" if len(staffing) >= 6 else "warn" if staffing else "neutral",
            "reason_codes": ["staffing", "utilization"],
            "entity_ids": [str(row["resource_id"]) for row in staffing],
        },
        {
            "key": "delinquent_timecards",
            "label": f"{sum(int(row.get('delinquent_count') or 0) for row in delinquent)} delinquent timecards",
            "count": sum(int(row.get("delinquent_count") or 0) for row in delinquent),
            "description": "Late timecards are delaying revenue capture.",
            "severity": "warning" if delinquent else "neutral",
            "tone": "warn" if delinquent else "neutral",
            "reason_codes": ["delinquent_timecards"],
            "entity_ids": [str(row.get("resource_id") or row.get("resource_name") or "") for row in delinquent],
        },
        {
            "key": "red_projects",
            "label": f"{len(red_projects)} red projects",
            "count": len(red_projects),
            "description": "Projects needing immediate delivery intervention.",
            "severity": "critical" if len(red_projects) >= 2 else "warning" if red_projects else "neutral",
            "tone": "danger" if red_projects else "neutral",
            "reason_codes": ["closeout"],
            "entity_ids": [str(row["project_id"]) for row in red_projects],
        },
        {
            "key": "closeout_blockers",
            "label": f"{len(closeout_risk)} closeout blockers",
            "count": len(closeout_risk),
            "description": "Aging closeout blockers holding back final billing.",
            "severity": "warning" if closeout_risk else "neutral",
            "tone": "warn" if closeout_risk else "neutral",
            "reason_codes": ["closeout"],
            "entity_ids": [str(row["project_id"]) for row in closeout_risk],
        },
        {
            "key": "pipeline_pressure",
            "label": f"{len(pipeline_attention)} pipeline interventions",
            "count": len(pipeline_attention),
            "description": "Open pipeline slippage or conversion risk.",
            "severity": "warning" if pipeline_attention else "neutral",
            "tone": "warn" if pipeline_attention else "neutral",
            "reason_codes": ["pipeline_slip"],
            "entity_ids": [str(row["deal_id"]) for row in pipeline_attention],
        },
    ]
    return [item for item in items if item["count"] > 0]


def _build_map_summary(
    *,
    env_id: UUID,
    business_id: UUID,
    market_rows: list[dict[str, Any]],
    resource_health: list[dict[str, Any]],
    timecard_health: list[dict[str, Any]],
    closeout: list[dict[str, Any]],
) -> dict[str, Any]:
    market_lookup = _load_market_lookup(env_id=env_id, business_id=business_id)
    top_accounts = _load_top_accounts_by_market(env_id=env_id, business_id=business_id)
    resource_by_market: dict[str, int] = {}
    delinquent_by_market: dict[str, int] = {}
    closeout_by_market: dict[str, int] = {}

    for row in resource_health:
        market_name = str(row.get("market_name") or "")
        for market_id, market_meta in market_lookup.items():
            if str(market_meta.get("market_name") or "") == market_name:
                resource_by_market[market_id] = resource_by_market.get(market_id, 0) + int(bool(row.get("overload_flag") or row.get("staffing_gap_flag")))
                delinquent_by_market[market_id] = delinquent_by_market.get(market_id, 0) + int(row.get("delinquent_timecards") or 0)
                break

    for row in closeout:
        href = str(row.get("href") or "")
        for market_id in market_lookup:
            if market_id in href:
                closeout_by_market[market_id] = closeout_by_market.get(market_id, 0) + 1

    points: list[dict[str, Any]] = []
    for row in market_rows:
        market_id = str(row["entity_id"])
        market_meta = market_lookup.get(market_id, {})
        lat, lng = _lookup_market_geo(str(row.get("entity_label") or ""), str(market_meta.get("market_code") or ""))
        variance_pct = _variance_pct(row.get("fee_actual"), row.get("fee_plan"))
        risk_score = min(
            Decimal("100"),
            max(
                Decimal("0"),
                abs(variance_pct) * Decimal("280")
                + Decimal(int(row.get("red_projects") or 0) * 8)
                + Decimal(int(resource_by_market.get(market_id, 0)) * 6),
            ),
        )
        points.append(
            {
                "market_id": row["entity_id"],
                "name": row.get("entity_label"),
                "lat": lat,
                "lng": lng,
                "fee_actual": row.get("fee_actual") or Decimal("0"),
                "fee_plan": row.get("fee_plan") or Decimal("0"),
                "variance_pct": variance_pct,
                "backlog": row.get("backlog") or Decimal("0"),
                "forecast": row.get("forecast") or Decimal("0"),
                "staffing_pressure_count": resource_by_market.get(market_id, 0),
                "delinquent_timecards": delinquent_by_market.get(market_id, 0),
                "red_projects": int(row.get("red_projects") or 0),
                "closeout_risk_count": closeout_by_market.get(market_id, 0),
                "client_risk_accounts": int(row.get("client_risk_accounts") or 0),
                "risk_score": _q(risk_score),
                "health_status": row.get("health_status") or "green",
                "reason_codes": _reason_tags_from_codes(row.get("reason_codes")),
                "top_accounts": top_accounts.get(market_id, []),
                "owner_name": row.get("owner_label") or market_meta.get("leader_name"),
            }
        )
    return {
        "focus_market_id": points[0]["market_id"] if points else None,
        "points": points,
        "color_modes": ["revenue_variance", "staffing_pressure", "backlog", "closeout_risk"],
    }


def _queue_payload_for_intervention(
    *,
    env_id: UUID,
    business_id: UUID,
    item: dict[str, Any],
) -> dict[str, Any]:
    decision_code = item["decision_code"]
    correlation_key = item["correlation_key"]
    queue_row = queue_svc.upsert_queue_item(
        env_id=env_id,
        business_id=business_id,
        decision_code=decision_code,
        title=item["entity_label"],
        summary=item["issue_summary"],
        priority={"critical": "critical", "warning": "high", "watch": "medium", "neutral": "low"}[item["severity"]],
        recommended_action=item["recommended_action"],
        recommended_owner=item.get("owner_label"),
        due_at=utc_now() + timedelta(days=1 if item["severity"] == "critical" else 3),
        risk_score=_q(item.get("risk_score") or 0),
        project_id=UUID(str(item["entity_id"])) if item["entity_type"] == "project" else None,
        signal_event_id=None,
        context_json={
            "correlation_key": correlation_key,
            "entity_type": item["entity_type"],
            "entity_id": item["entity_id"],
            "reason_codes": item.get("reason_codes") or [],
            "href": item.get("href"),
        },
        ai_analysis_json={
            "cause_summary": item["cause_summary"],
            "expected_impact": item.get("expected_impact"),
        },
        input_snapshot_json={
            "severity": item["severity"],
            "focus_source": "stone_home",
        },
        correlation_key=correlation_key,
        actor="stone_home",
    )
    item["queue_item_id"] = queue_row.get("queue_item_id")
    item["queue_status"] = queue_row.get("status")
    return item


def _build_intervention_queue(
    *,
    env_id: UUID,
    business_id: UUID,
    horizon: str,
    performance_rows: list[dict[str, Any]],
    delivery_risk: list[dict[str, Any]],
    timecard_health: list[dict[str, Any]],
    satisfaction: list[dict[str, Any]],
    closeout: list[dict[str, Any]],
    pipeline_summary: dict[str, Any],
) -> list[dict[str, Any]]:
    today_key = _today().strftime("%Y-%W")
    items: list[dict[str, Any]] = []
    for row in performance_rows:
        variance_pct = _variance_pct(row.get("fee_actual"), row.get("fee_plan"))
        if variance_pct < Decimal("-0.05"):
            reasons = list(dict.fromkeys(_reason_tags_from_codes(row.get("reason_codes")) + ["forecast_risk"]))
            items.append(
                {
                    "intervention_id": f"market-{row['entity_id']}",
                    "decision_code": "D19",
                    "entity_type": "market",
                    "entity_id": str(row["entity_id"]),
                    "entity_label": str(row.get("entity_label") or "Market"),
                    "severity": "critical" if variance_pct < Decimal("-0.10") else "warning",
                    "tone": "danger",
                    "issue_summary": f"{row.get('entity_label')} is {_q(variance_pct * Decimal('100'))}% vs fee plan.",
                    "cause_summary": _reason_summary(reasons),
                    "expected_impact": f"{_q(_q(row.get('fee_actual')) - _q(row.get('fee_plan')))} fee variance gap requires recovery.",
                    "recommended_action": "Run market recovery plan and rebalance staffing/timecards.",
                    "owner_label": row.get("owner_label"),
                    "reason_codes": reasons,
                    "href": row.get("href"),
                    "correlation_key": f"home:market:{row['entity_id']}:{horizon}:{today_key}",
                    "risk_score": abs(variance_pct) * Decimal("100"),
                }
            )
    for row in delivery_risk[:4]:
        reasons = list(dict.fromkeys(_reason_tags_from_codes(row.get("reason_codes")) + ["closeout"]))
        items.append(
            {
                "intervention_id": f"project-{row['project_id']}",
                "decision_code": "D07",
                "entity_type": "project",
                "entity_id": str(row["project_id"]),
                "entity_label": str(row.get("project_name") or "Project"),
                "severity": "critical" if str(row.get("severity")) == "red" else "warning",
                "tone": "danger" if str(row.get("severity")) == "red" else "warn",
                "issue_summary": str(row.get("issue_summary") or "Project risk requires intervention."),
                "cause_summary": _reason_summary(reasons),
                "expected_impact": f"Delivery drag in {row.get('market_name') or 'the portfolio'} if not escalated.",
                "recommended_action": str(row.get("recommended_action") or "Escalate the project recovery plan."),
                "owner_label": row.get("recommended_owner"),
                "reason_codes": reasons,
                "href": row.get("href"),
                "correlation_key": f"home:project:{row['project_id']}:{horizon}:{today_key}",
                "risk_score": _q(row.get("risk_score")),
            }
        )
    for row in timecard_health[:4]:
        if int(row.get("delinquent_count") or 0) <= 0:
            continue
        reasons = list(dict.fromkeys(_reason_tags_from_codes(row.get("reason_codes")) + ["delinquent_timecards", "staffing"]))
        items.append(
            {
                "intervention_id": f"resource-{row.get('resource_id') or row.get('resource_name')}",
                "decision_code": "D14",
                "entity_type": "resource",
                "entity_id": str(row.get("resource_id") or row.get("resource_name")),
                "entity_label": str(row.get("resource_name") or "Resource"),
                "severity": "warning",
                "tone": "warn",
                "issue_summary": f"{row.get('resource_name')} has {row.get('delinquent_count')} delinquent timecards.",
                "cause_summary": _reason_summary(reasons),
                "expected_impact": "Revenue recognition remains delayed until timecards are submitted.",
                "recommended_action": "Resolve delinquent timecards and rebalance utilization.",
                "owner_label": None,
                "reason_codes": reasons,
                "href": None,
                "correlation_key": f"home:resource:{row.get('resource_id') or row.get('resource_name')}:{horizon}:{today_key}",
                "risk_score": Decimal(int(row.get("delinquent_count") or 0) * 10),
            }
        )
    for row in satisfaction[:3]:
        if str(row.get("risk_state") or "") not in {"red", "orange"} and _q(row.get("average_score")) >= Decimal("3.5"):
            continue
        reasons = list(dict.fromkeys(_reason_tags_from_codes(row.get("reason_codes")) + ["client_risk"]))
        items.append(
            {
                "intervention_id": f"account-{row['account_id']}",
                "decision_code": "D16",
                "entity_type": "account",
                "entity_id": str(row["account_id"]),
                "entity_label": str(row.get("account_name") or "Account"),
                "severity": "critical" if str(row.get("risk_state")) == "red" else "warning",
                "tone": "danger" if str(row.get("risk_state")) == "red" else "warn",
                "issue_summary": f"{row.get('account_name')} satisfaction score is {_q(row.get('average_score'))}.",
                "cause_summary": _reason_summary(reasons),
                "expected_impact": "Client expansion and repeat awards are at risk.",
                "recommended_action": "Run an executive client recovery intervention.",
                "owner_label": None,
                "reason_codes": reasons,
                "href": None,
                "correlation_key": f"home:account:{row['account_id']}:{horizon}:{today_key}",
                "risk_score": Decimal("75"),
            }
        )
    for row in closeout[:3]:
        if int(row.get("blocker_count") or 0) <= 0 and int(row.get("closeout_aging_days") or 0) <= 30:
            continue
        reasons = list(dict.fromkeys(_reason_tags_from_codes(row.get("reason_codes")) + ["closeout"]))
        items.append(
            {
                "intervention_id": f"closeout-{row['project_id']}",
                "decision_code": "D08",
                "entity_type": "project",
                "entity_id": str(row["project_id"]),
                "entity_label": str(row.get("project_name") or "Project"),
                "severity": "warning",
                "tone": "warn",
                "issue_summary": f"{row.get('project_name')} has {row.get('blocker_count')} closeout blockers.",
                "cause_summary": _reason_summary(reasons),
                "expected_impact": "Final billing and lessons learned remain stuck.",
                "recommended_action": "Clear closeout blockers and force final billing readiness.",
                "owner_label": None,
                "reason_codes": reasons,
                "href": row.get("href"),
                "correlation_key": f"home:closeout:{row['project_id']}:{horizon}:{today_key}",
                "risk_score": Decimal(int(row.get("blocker_count") or 0) * 12),
            }
        )
    for row in (pipeline_summary.get("attention_items") or [])[:3]:
        reasons = ["pipeline_slip"]
        if row.get("issue_type") == "Overdue Close":
            reasons.append("forecast_risk")
        items.append(
            {
                "intervention_id": f"deal-{row['deal_id']}",
                "decision_code": "D06",
                "entity_type": "pipeline_deal",
                "entity_id": str(row["deal_id"]),
                "entity_label": str(row.get("deal_name") or "Pipeline deal"),
                "severity": "warning",
                "tone": row.get("tone") or "warn",
                "issue_summary": str(row.get("issue") or "Pipeline attention required."),
                "cause_summary": _reason_summary(reasons),
                "expected_impact": "Pipeline slippage reduces near-term forecast confidence.",
                "recommended_action": str(row.get("action") or "Prioritize the deal for executive review."),
                "owner_label": None,
                "reason_codes": reasons,
                "href": "/lab/env/{}/pds/pipeline".format(env_id),
                "correlation_key": f"home:deal:{row['deal_id']}:{horizon}:{today_key}",
                "risk_score": Decimal("60"),
            }
        )
    ranked = sorted(
        items,
        key=lambda item: (
            {"critical": 0, "warning": 1, "watch": 2, "neutral": 3}[item["severity"]],
            -float(item.get("risk_score") or 0),
        ),
    )[:12]
    return [_queue_payload_for_intervention(env_id=env_id, business_id=business_id, item=item) for item in ranked]


def _build_operating_brief(
    *,
    performance_rows: list[dict[str, Any]],
    resource_health: list[dict[str, Any]],
    timecard_health: list[dict[str, Any]],
    delivery_risk: list[dict[str, Any]],
    closeout: list[dict[str, Any]],
    pipeline_rollup: dict[str, Any],
    interventions: list[dict[str, Any]],
) -> dict[str, Any]:
    worst_market = None
    if performance_rows:
        worst_market = min(performance_rows, key=lambda row: _variance_pct(row.get("fee_actual"), row.get("fee_plan")))
    staffing_risks = len([row for row in resource_health if row.get("overload_flag") or row.get("staffing_gap_flag")])
    delinquent_total = sum(int(row.get("delinquent_count") or 0) for row in timecard_health)
    red_projects = len([row for row in delivery_risk if str(row.get("severity") or "") in {"red", "orange"}])
    closeout_risk = len([row for row in closeout if int(row.get("blocker_count") or 0) > 0 or int(row.get("closeout_aging_days") or 0) > 30])
    top_action = interventions[0] if interventions else None
    headline = "Current Operating Posture"
    summary = "StonePDS is running with concentrated revenue, staffing, and execution pressure."
    focus_label = worst_market.get("entity_label") if worst_market else None
    if worst_market is not None:
        summary = (
            f"{worst_market.get('entity_label')} is {_q(_variance_pct(worst_market.get('fee_actual'), worst_market.get('fee_plan')) * Decimal('100'))}% vs plan, "
            f"with {staffing_risks} staffing risks and {delinquent_total} delinquent timecards constraining delivery."
        )
    return {
        "headline": headline,
        "summary": summary,
        "trend_direction": "worsening" if red_projects or delinquent_total or pipeline_rollup.get("stalled_count") else "stable",
        "focus_label": focus_label,
        "lines": [
            {
                "label": "Biggest Drag",
                "text": f"{worst_market.get('entity_label')} is the largest drag on plan." if worst_market else "No market drag detected.",
                "severity": "critical" if worst_market and _variance_pct(worst_market.get("fee_actual"), worst_market.get("fee_plan")) < Decimal("-0.08") else "warning",
            },
            {
                "label": "Primary Driver",
                "text": f"{staffing_risks} staffing risks and {delinquent_total} delinquent timecards are blocking execution.",
                "severity": "critical" if staffing_risks >= 6 or delinquent_total >= 6 else "warning",
            },
            {
                "label": "Execution Pressure",
                "text": f"{red_projects} red projects and {closeout_risk} closeout blockers need intervention.",
                "severity": "critical" if red_projects >= 2 else "warning" if closeout_risk else "neutral",
            },
            {
                "label": "Pipeline Watch",
                "text": f"{pipeline_rollup.get('overdue_close_count', 0)} overdue closes and {pipeline_rollup.get('stalled_count', 0)} stalled deals are affecting forecast confidence.",
                "severity": "warning" if pipeline_rollup.get("overdue_close_count", 0) or pipeline_rollup.get("stalled_count", 0) else "neutral",
            },
            {
                "label": "Highest-Leverage Action",
                "text": top_action.get("recommended_action") if top_action else "No immediate action queued.",
                "severity": top_action.get("severity") if top_action else "neutral",
            },
        ],
        "recommended_actions": [item["recommended_action"] for item in interventions[:3]],
    }


def _build_insight_panel(
    *,
    operating_brief: dict[str, Any],
    interventions: list[dict[str, Any]],
) -> dict[str, Any]:
    lead = interventions[0] if interventions else None
    if lead is None:
        return {
            "title": "Why this matters",
            "focus_label": operating_brief.get("focus_label"),
            "status": "neutral",
            "what": operating_brief.get("summary") or "Portfolio is stable.",
            "why": "No dominant intervention driver is active.",
            "consequence": "Continue monitoring for new risk concentration.",
            "action": "Review the highest-value markets and pipeline weekly.",
            "owner": None,
            "reason_codes": [],
        }
    return {
        "title": "Why this matters",
        "focus_label": lead.get("entity_label"),
        "status": lead.get("severity") or "warning",
        "what": lead.get("issue_summary"),
        "why": lead.get("cause_summary"),
        "consequence": lead.get("expected_impact") or "Performance will continue to slip if unresolved.",
        "action": lead.get("recommended_action"),
        "owner": lead.get("owner_label"),
        "reason_codes": lead.get("reason_codes") or [],
    }


def _enrich_metric_strip(metrics_strip: list[dict[str, Any]], alert_filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filter_lookup = {item["key"]: item for item in alert_filters}
    metric_map = {
        "fee_vs_plan": ("markets_below_plan", "Markets trailing fee plan.", "down"),
        "gaap_vs_plan": ("markets_below_plan", "Revenue recognition is missing plan.", "down"),
        "ci_vs_plan": ("markets_below_plan", "CI pressure is dragging margin.", "down"),
        "backlog": ("pipeline_pressure", "Backlog coverage against forecast.", "flat"),
        "forecast": ("pipeline_pressure", "Pipeline confidence feeding forecast.", "flat"),
        "red_projects": ("red_projects", "Projects requiring escalation.", "up"),
        "client_risk_accounts": ("closeout_blockers", "Client recovery and closeout risk.", "up"),
    }
    enriched: list[dict[str, Any]] = []
    for metric in metrics_strip:
        filter_key, driver_text, trend_direction = metric_map.get(metric["key"], (None, None, "flat"))
        item = dict(metric)
        item["filter_key"] = filter_key
        item["driver_text"] = driver_text
        item["trend_direction"] = trend_direction
        item["reason_codes"] = list(filter_lookup.get(filter_key, {}).get("reason_codes") or [])
        enriched.append(item)
    return enriched


def _ensure_pipeline_demo_data(*, env_id: UUID, business_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_pipeline_deals WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        existing = int((cur.fetchone() or {}).get("cnt") or 0)
        if existing >= 6:
            return
    with get_cursor() as cur:
        cur.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext(%s))",
            (f"pds_pipeline_seed:{env_id}:{business_id}",),
        )
        lock_row = cur.fetchone() or {}
        if not lock_row.get("pg_try_advisory_xact_lock"):
            return
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_pipeline_deals WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) >= 6:
            return
        # Demo seeding must not assume optional schema columns on pds_accounts.
        # In live environments, business line ownership lives on downstream entities
        # like resources/projects/pipeline deals, so inherit from the owner resource
        # when available and otherwise keep the seeded deal nullable.
        cur.execute(
            """
            SELECT a.account_id, a.account_name, a.market_id, a.owner_name,
                   COALESCE(r.resource_id, a.owner_resource_id) AS owner_resource_id,
                   COALESCE(r.full_name, a.owner_name) AS resource_name,
                   r.business_line_id AS business_line_id
            FROM pds_accounts a
            LEFT JOIN pds_resources r ON r.resource_id = a.owner_resource_id
            WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid
            ORDER BY a.strategic_flag DESC, a.account_name
            LIMIT 12
            """,
            (str(env_id), str(business_id)),
        )
        accounts = cur.fetchall()
        if not accounts:
            return
        today = _today()
        seed_rows = [
            ("Prospect Recovery Program", "prospect", Decimal("850000"), Decimal("20"), today + timedelta(days=21), "High-value prospect needs sponsor alignment."),
            ("Healthcare Campus Modernization", "pursuit", Decimal("1650000"), Decimal("35"), today - timedelta(days=7), "Overdue close; executive sponsor needed."),
            ("Regional Office Consolidation", "negotiation", Decimal("910000"), Decimal("65"), today + timedelta(days=10), "Negotiation is close but stalled."),
            ("Data Center Expansion PMO", "pursuit", Decimal("2200000"), Decimal("30"), today + timedelta(days=40), "High value / low probability; tighten pursuit strategy."),
            ("Critical Care Renovation", "won", Decimal("1400000"), Decimal("90"), today + timedelta(days=5), "Won and awaiting conversion."),
            ("Airport Program Reset", "prospect", Decimal("780000"), Decimal("25"), today + timedelta(days=55), "New opportunity, needs qualification."),
            ("Retail Portfolio Rollout", "negotiation", Decimal("1120000"), Decimal("55"), today - timedelta(days=3), "Late-stage deal is past expected close."),
            ("Life Sciences Lab Upgrade", "pursuit", Decimal("980000"), Decimal("40"), today + timedelta(days=18), "Pursuit aging with light recent activity."),
        ]
        for idx, (deal_name, stage, deal_value, probability_pct, expected_close_date, notes) in enumerate(seed_rows):
            account = accounts[idx % len(accounts)]
            owner_name = account.get("resource_name") or account.get("owner_name") or "Dana Park"
            last_activity_at = utc_now() - timedelta(days=18 if idx in {1, 2, 6, 7} else 6)
            stage_entered_at = utc_now() - timedelta(days=20 if idx in {1, 2, 6} else 9)
            cur.execute(
                """
                INSERT INTO pds_pipeline_deals
                (env_id, business_id, account_id, market_id, business_line_id, owner_resource_id, deal_name,
                 stage, deal_value, probability_pct, expected_close_date, owner_name, notes,
                 stage_entered_at, last_activity_at, created_at, updated_at)
                VALUES
                (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
                 %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
                RETURNING deal_id
                """,
                (
                    str(env_id),
                    str(business_id),
                    str(account["account_id"]),
                    str(account.get("market_id")) if account.get("market_id") else None,
                    str(account.get("business_line_id")) if account.get("business_line_id") else None,
                    str(account.get("owner_resource_id")) if account.get("owner_resource_id") else None,
                    deal_name,
                    stage,
                    str(deal_value),
                    str(probability_pct),
                    expected_close_date,
                    owner_name,
                    notes,
                    stage_entered_at,
                    last_activity_at,
                ),
            )
            created = cur.fetchone() or {}
            if created.get("deal_id"):
                cur.execute(
                    """
                    INSERT INTO pds_pipeline_deal_stage_history
                    (env_id, business_id, deal_id, from_stage, to_stage, changed_at, note)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, NULL, %s, %s, %s)
                    """,
                    (
                        str(env_id),
                        str(business_id),
                        str(created["deal_id"]),
                        stage,
                        stage_entered_at,
                        "Seeded Stone pipeline deal",
                    ),
                )
    _upsert_pipeline_snapshot(env_id=env_id, business_id=business_id)


def _empty_pipeline_summary() -> dict[str, Any]:
    return {
        "has_deals": False,
        "empty_state_title": "Pipeline unavailable",
        "empty_state_body": "Pipeline demo data could not be prepared for this workspace.",
        "required_fields": ["Deal", "Account", "Stage", "Value", "Probability", "Expected Close", "Owner"],
        "example_deal": _pipeline_example_deal(),
        "metrics": [],
        "attention_items": [],
        "stages": [],
        "timeline": [],
        "deals": [],
        "total_pipeline_value": Decimal("0"),
        "total_weighted_value": Decimal("0"),
    }


def get_pipeline_lookups(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    _ensure_pipeline_demo_data(env_id=env_id, business_id=business_id)
    accounts: list[dict[str, Any]] = []
    owners: list[dict[str, Any]] = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT account_id, account_name, owner_name
                FROM pds_accounts
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY account_name
                """,
                (str(env_id), str(business_id)),
            )
            accounts = [
                {
                    "value": str(row["account_id"]),
                    "label": row["account_name"],
                    "meta": row.get("owner_name"),
                }
                for row in cur.fetchall()
            ]
            cur.execute(
                """
                SELECT resource_id, full_name, title
                FROM pds_resources
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY full_name
                """,
                (str(env_id), str(business_id)),
            )
            owners = [
                {
                    "value": str(row["resource_id"]),
                    "label": row["full_name"],
                    "meta": row.get("title"),
                }
                for row in cur.fetchall()
            ]
    except Exception:
        owners = []
        accounts = []
    return {
        "accounts": accounts,
        "owners": owners,
        "stages": [
            {"value": stage, "label": _pipeline_stage_label(stage), "meta": "Closed" if stage in PIPELINE_CLOSED_STAGES else "Active"}
            for stage in PIPELINE_STAGE_ORDER
        ],
    }


def get_pipeline_deal_detail(*, env_id: UUID, business_id: UUID, deal_id: UUID) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    today = _today()
    row = next((item for item in _fetch_pipeline_deal_rows(env_id=env_id, business_id=business_id) if item["deal_id"] == deal_id), None)
    if row is None:
        raise LookupError("Pipeline deal not found")
    history = [
        {
            "stage_history_id": item["stage_history_id"],
            "from_stage": item.get("from_stage"),
            "to_stage": _normalize_pipeline_stage(item.get("to_stage")),
            "changed_at": _coerce_datetime(item.get("changed_at")) or utc_now(),
            "note": item.get("note"),
        }
        for item in _fetch_pipeline_history_rows(env_id=env_id, business_id=business_id, deal_id=deal_id)
    ]
    return {
        "deal": _pipeline_deal_from_row(row, today=today),
        "history": history,
    }


def create_pipeline_deal(*, env_id: UUID, business_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    deal_name = str(payload.get("deal_name") or "").strip()
    if not deal_name:
        raise ValueError("Deal name is required")
    stage = _normalize_pipeline_stage(payload.get("stage"))
    deal_value = _nonnegative_decimal(payload.get("deal_value"))
    probability_pct = _pipeline_probability_for_stage(stage, payload.get("probability_pct"))
    expected_close_date = _coerce_date(payload.get("expected_close_date"))
    owner_name = str(payload.get("owner_name") or "").strip() or None
    notes = str(payload.get("notes") or "").strip() or None
    lost_reason = str(payload.get("lost_reason") or "").strip() or None
    account_id = payload.get("account_id")
    if account_id is not None:
        account_id = UUID(str(account_id))
    changed_at = utc_now()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_pipeline_deals
            (env_id, business_id, account_id, deal_name, stage, deal_value, probability_pct,
             expected_close_date, owner_name, notes, lost_reason, stage_entered_at, last_activity_at)
            VALUES
            (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING deal_id
            """,
            (
                str(env_id),
                str(business_id),
                str(account_id) if account_id else None,
                deal_name,
                stage,
                str(deal_value),
                str(probability_pct),
                expected_close_date,
                owner_name,
                notes,
                lost_reason if stage == "lost" else None,
                changed_at,
                changed_at,
            ),
        )
        created = cur.fetchone()
        cur.execute(
            """
            INSERT INTO pds_pipeline_deal_stage_history
            (env_id, business_id, deal_id, from_stage, to_stage, changed_at, note)
            VALUES (%s::uuid, %s::uuid, %s::uuid, NULL, %s, %s, %s)
            """,
            (
                str(env_id),
                str(business_id),
                str(created["deal_id"]),
                stage,
                changed_at,
                "Initial stage",
            ),
        )
    _upsert_pipeline_snapshot(env_id=env_id, business_id=business_id)
    return get_pipeline_deal_detail(env_id=env_id, business_id=business_id, deal_id=created["deal_id"])


def update_pipeline_deal(*, env_id: UUID, business_id: UUID, deal_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    rows = _fetch_pipeline_deal_rows(env_id=env_id, business_id=business_id)
    current = next((item for item in rows if item["deal_id"] == deal_id), None)
    if current is None:
        raise LookupError("Pipeline deal not found")

    next_stage = _normalize_pipeline_stage(payload["stage"]) if "stage" in payload else _normalize_pipeline_stage(current.get("stage"))
    changed_at = utc_now()
    updates: dict[str, Any] = {}

    if "deal_name" in payload:
        deal_name = str(payload.get("deal_name") or "").strip()
        if not deal_name:
            raise ValueError("Deal name is required")
        updates["deal_name"] = deal_name
    if "account_id" in payload:
        updates["account_id"] = UUID(str(payload["account_id"])) if payload.get("account_id") else None
    if "stage" in payload:
        updates["stage"] = next_stage
        updates["stage_entered_at"] = changed_at
    if "deal_value" in payload:
        updates["deal_value"] = _nonnegative_decimal(payload.get("deal_value"))

    probability_source = payload.get("probability_pct") if "probability_pct" in payload else current.get("probability_pct")
    if "probability_pct" in payload or "stage" in payload:
        updates["probability_pct"] = _pipeline_probability_for_stage(next_stage, probability_source)
    if "expected_close_date" in payload:
        updates["expected_close_date"] = _coerce_date(payload.get("expected_close_date"))
    if "owner_name" in payload:
        updates["owner_name"] = str(payload.get("owner_name") or "").strip() or None
    if "notes" in payload:
        updates["notes"] = str(payload.get("notes") or "").strip() or None
    if "lost_reason" in payload or "stage" in payload:
        next_lost_reason = str(payload.get("lost_reason") or "").strip() or None
        updates["lost_reason"] = next_lost_reason if next_stage == "lost" else None

    updates["last_activity_at"] = changed_at
    updates["updated_at"] = changed_at
    set_columns = []
    params: list[Any] = []
    for key, value in updates.items():
        set_columns.append(f"{key} = %s")
        if isinstance(value, UUID):
            params.append(str(value))
        elif isinstance(value, Decimal):
            params.append(str(value))
        else:
            params.append(value)
    if set_columns:
        params.extend([str(env_id), str(business_id), str(deal_id)])
        with get_cursor() as cur:
            cur.execute(
                f"""
                UPDATE pds_pipeline_deals
                SET {", ".join(set_columns)}
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND deal_id = %s::uuid
                """,
                tuple(params),
            )
            if "stage" in updates and updates["stage"] != _normalize_pipeline_stage(current.get("stage")):
                cur.execute(
                    """
                    INSERT INTO pds_pipeline_deal_stage_history
                    (env_id, business_id, deal_id, from_stage, to_stage, changed_at, note)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
                    """,
                    (
                        str(env_id),
                        str(business_id),
                        str(deal_id),
                        _normalize_pipeline_stage(current.get("stage")),
                        updates["stage"],
                        changed_at,
                        str(payload.get("transition_note") or "").strip() or f"Moved to {_pipeline_stage_label(updates['stage'])}",
                    ),
                )

    _upsert_pipeline_snapshot(env_id=env_id, business_id=business_id)
    return get_pipeline_deal_detail(env_id=env_id, business_id=business_id, deal_id=deal_id)


def get_pipeline_summary(*, env_id: UUID, business_id: UUID, tolerate_seed_failure: bool = False) -> dict[str, Any]:
    """Return the board-first pipeline workspace model for the PDS pipeline module."""
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    if tolerate_seed_failure:
        try:
            _ensure_pipeline_demo_data(env_id=env_id, business_id=business_id)
        except Exception:
            logger.exception(
                "PDS pipeline demo seeding failed during pipeline summary load",
                extra={"env_id": str(env_id), "business_id": str(business_id)},
            )
            return _empty_pipeline_summary()
    else:
        _ensure_pipeline_demo_data(env_id=env_id, business_id=business_id)
    today = _today()
    raw_rows = _fetch_pipeline_deal_rows(env_id=env_id, business_id=business_id)
    deals = [_pipeline_deal_from_row(row, today=today) for row in raw_rows]
    history_rows = _fetch_pipeline_history_rows(env_id=env_id, business_id=business_id)
    total_pipeline = _q(sum(deal["deal_value"] for deal in deals if deal["stage"] in PIPELINE_ACTIVE_STAGES))
    total_weighted = _q(
        sum(deal["deal_value"] * deal["probability_pct"] / Decimal("100") for deal in deals if deal["stage"] in PIPELINE_ACTIVE_STAGES)
    )
    return {
        "has_deals": bool(deals),
        "empty_state_title": "No pipeline yet",
        "empty_state_body": "Start the pipeline by creating a first deal with an account, stage, value, probability, close date, and owner.",
        "required_fields": ["Deal", "Account", "Stage", "Value", "Probability", "Expected Close", "Owner"],
        "example_deal": _pipeline_example_deal(),
        "metrics": _pipeline_metrics(deals=deals, env_id=env_id, business_id=business_id),
        "attention_items": _pipeline_attention_items(deals),
        "stages": _pipeline_stage_summaries(deals=deals, history_rows=history_rows),
        "timeline": _pipeline_timeline_points(deals),
        "deals": deals,
        "total_pipeline_value": total_pipeline,
        "total_weighted_value": total_weighted,
    }


def get_command_center(*, env_id: UUID, business_id: UUID, lens: str, horizon: str, role_preset: str) -> dict[str, Any]:
    environment = _fetch_environment(env_id)
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    normalized_lens = normalize_lens(lens, role_preset)
    normalized_horizon = normalize_horizon(horizon)
    performance_table = get_performance_table(env_id=env_id, business_id=business_id, lens=normalized_lens, horizon=normalized_horizon)
    market_performance_table = performance_table if normalized_lens == "market" else get_performance_table(
        env_id=env_id,
        business_id=business_id,
        lens="market",
        horizon=normalized_horizon,
    )
    delivery_risk = get_delivery_risk(env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    resource_health = get_resource_health(env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    timecard_health = get_timecard_health(env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    forecast = get_forecast(env_id=env_id, business_id=business_id, horizon=normalized_horizon, lens=normalized_lens)
    satisfaction = get_satisfaction(env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    closeout = get_closeout(env_id=env_id, business_id=business_id, horizon=normalized_horizon)
    pipeline_summary = get_pipeline_summary(env_id=env_id, business_id=business_id, tolerate_seed_failure=True)
    pipeline_rollup = _build_pipeline_rollup(pipeline_summary)
    briefing = get_executive_briefing(
        env_id=env_id, business_id=business_id, lens=normalized_lens, horizon=normalized_horizon, role_preset=role_preset,
        performance_table=performance_table, delivery_risk=delivery_risk,
        resources=resource_health, satisfaction=satisfaction, closeout=closeout,
    )
    account_dashboard = None

    fee_plan = sum(_q(row.get("fee_plan")) for row in performance_table["rows"])
    fee_actual = sum(_q(row.get("fee_actual")) for row in performance_table["rows"])
    gaap_plan = sum(_q(row.get("gaap_plan")) for row in performance_table["rows"])
    gaap_actual = sum(_q(row.get("gaap_actual")) for row in performance_table["rows"])
    ci_plan = sum(_q(row.get("ci_plan")) for row in performance_table["rows"])
    ci_actual = sum(_q(row.get("ci_actual")) for row in performance_table["rows"])
    backlog = sum(_q(row.get("backlog")) for row in performance_table["rows"])
    forecast_total = sum(_q(point.get("current_value")) for point in forecast)
    red_projects = len([item for item in delivery_risk if item["severity"] in {"orange", "red"}])
    client_risk_accounts = len([item for item in satisfaction if item["risk_state"] == "red"])
    if normalized_lens == "account":
        account_dashboard, current_account_rows, previous_account_rows = _build_account_dashboard(
            env_id=env_id,
            business_id=business_id,
            horizon=normalized_horizon,
        )
        previous_at_risk_count = len([row for row in previous_account_rows if row["health_band"] == "at_risk"])
        current_at_risk_count = account_dashboard["distribution"].get("at_risk", 0)
        current_avg_health = _safe_avg([Decimal(row["health_score"]) for row in current_account_rows]) if current_account_rows else Decimal("0")
        previous_avg_health = _safe_avg([Decimal(row["health_score"]) for row in previous_account_rows]) if previous_account_rows else Decimal("0")
        plan_attainment_pct = _q((fee_actual / fee_plan) * Decimal("100")) if fee_plan > 0 else Decimal("0")
        metrics_strip = [
            {
                "key": "total_revenue_ytd",
                "label": "Total Revenue (YTD)",
                "value": fee_actual,
                "comparison_label": "Plan",
                "comparison_value": fee_plan,
                "delta_value": _q(fee_actual - fee_plan),
                "tone": "danger" if fee_plan > 0 and fee_actual < fee_plan else "positive",
                "unit": "usd",
            },
            {
                "key": "percent_vs_plan",
                "label": "% vs Plan",
                "value": plan_attainment_pct,
                "comparison_label": "Target",
                "comparison_value": Decimal("100"),
                "delta_value": _q(plan_attainment_pct - Decimal("100")),
                "tone": "danger" if plan_attainment_pct < Decimal("90") else "warn" if plan_attainment_pct < Decimal("100") else "positive",
                "unit": "percent_raw",
            },
            {
                "key": "at_risk_accounts",
                "label": "At Risk Accounts",
                "value": current_at_risk_count,
                "comparison_label": "Prior",
                "comparison_value": previous_at_risk_count,
                "delta_value": current_at_risk_count - previous_at_risk_count,
                "tone": "danger" if current_at_risk_count > 0 else "positive",
            },
            {
                "key": "avg_account_health",
                "label": "Avg Account Health Score",
                "value": _round_score(current_avg_health),
                "comparison_label": "Prior",
                "comparison_value": _round_score(previous_avg_health),
                "delta_value": _round_score(current_avg_health - previous_avg_health),
                "tone": "danger" if current_avg_health < Decimal("55") else "warn" if current_avg_health < Decimal("75") else "positive",
            },
        ]
    else:
        metrics_strip = [
            {
                "key": "fee_vs_plan",
                "label": "Fee Revenue vs Plan",
                "value": fee_actual,
                "comparison_label": "Plan",
                "comparison_value": fee_plan,
                "delta_value": _q(fee_actual - fee_plan),
                "tone": "danger" if fee_actual < fee_plan else "positive",
                "unit": "usd",
            },
            {
                "key": "gaap_vs_plan",
                "label": "GAAP Revenue vs Plan",
                "value": gaap_actual,
                "comparison_label": "Plan",
                "comparison_value": gaap_plan,
                "delta_value": _q(gaap_actual - gaap_plan),
                "tone": "danger" if gaap_actual < gaap_plan else "positive",
                "unit": "usd",
            },
            {
                "key": "ci_vs_plan",
                "label": "CI vs Plan",
                "value": ci_actual,
                "comparison_label": "Plan",
                "comparison_value": ci_plan,
                "delta_value": _q(ci_actual - ci_plan),
                "tone": "danger" if ci_actual < ci_plan else "positive",
                "unit": "usd",
            },
            {"key": "backlog", "label": "Backlog", "value": backlog, "tone": "neutral", "unit": "usd"},
            {"key": "forecast", "label": "Forecast", "value": forecast_total, "tone": "neutral", "unit": "usd"},
            {"key": "red_projects", "label": "Red / At-Risk Projects", "value": red_projects, "tone": "danger"},
            {"key": "client_risk_accounts", "label": "Client Risk Accounts", "value": client_risk_accounts, "tone": "warn"},
        ]

    alert_filters = _build_alert_filters(
        performance_rows=market_performance_table["rows"],
        resource_health=resource_health,
        timecard_health=timecard_health,
        delivery_risk=delivery_risk,
        closeout=closeout,
        pipeline_summary=pipeline_summary,
    )
    interventions = _build_intervention_queue(
        env_id=env_id,
        business_id=business_id,
        horizon=normalized_horizon,
        performance_rows=market_performance_table["rows"],
        delivery_risk=delivery_risk,
        timecard_health=timecard_health,
        satisfaction=satisfaction,
        closeout=closeout,
        pipeline_summary=pipeline_summary,
    )
    operating_brief = _build_operating_brief(
        performance_rows=market_performance_table["rows"],
        resource_health=resource_health,
        timecard_health=timecard_health,
        delivery_risk=delivery_risk,
        closeout=closeout,
        pipeline_rollup=pipeline_rollup,
        interventions=interventions,
    )
    insight_panel = _build_insight_panel(
        operating_brief=operating_brief,
        interventions=interventions,
    )
    map_summary = _build_map_summary(
        env_id=env_id,
        business_id=business_id,
        market_rows=market_performance_table["rows"],
        resource_health=resource_health,
        timecard_health=timecard_health,
        closeout=closeout,
    )
    enriched_metrics_strip = _enrich_metric_strip(metrics_strip, alert_filters)

    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "workspace_template_key": resolve_pds_workspace_template(environment),
        "lens": normalized_lens,
        "horizon": normalized_horizon,
        "role_preset": normalize_role_preset(role_preset),
        "generated_at": utc_now(),
        "metrics_strip": enriched_metrics_strip,
        "performance_table": performance_table,
        "delivery_risk": delivery_risk,
        "resource_health": resource_health,
        "timecard_health": timecard_health,
        "forecast_points": forecast,
        "satisfaction": satisfaction,
        "closeout": closeout,
        "account_dashboard": account_dashboard,
        "briefing": briefing,
        "operating_brief": operating_brief,
        "alert_filters": alert_filters,
        "map_summary": map_summary,
        "intervention_queue": interventions,
        "insight_panel": insight_panel,
        "pipeline_summary": pipeline_rollup,
    }


def get_account_preview(*, env_id: UUID, business_id: UUID, account_id: UUID, horizon: str) -> dict[str, Any]:
    _ensure_workspace_lazy(env_id=env_id, business_id=business_id)
    _dashboard, current_rows, _previous_rows = _build_account_dashboard(
        env_id=env_id,
        business_id=business_id,
        horizon=horizon,
    )
    row = next((item for item in current_rows if item["account_id"] == account_id), None)
    if row is None:
        raise LookupError("Account preview not found")

    top_project_risks = [
        {
            "project_id": project_row["project_id"],
            "project_name": (project_row.get("project_name") or project_row.get("issue_summary") or "Project"),
            "severity": project_row.get("severity") or "green",
            "risk_score": _q(project_row.get("risk_score")),
            "issue_summary": ", ".join((project_row.get("reason_codes_json") or [])[:2]) or "Project risk",
            "recommended_action": project_row.get("recommended_action"),
            "href": _project_href(env_id=env_id, project_id=project_row["project_id"]),
        }
        for project_row in row.get("project_rows", [])[:3]
    ]

    return {
        "account_id": row["account_id"],
        "account_name": row["account_name"],
        "owner_name": row.get("owner_name"),
        "health_score": row["health_score"],
        "health_band": row["health_band"],
        "trend": row["trend"],
        "fee_plan": row["fee_plan"],
        "fee_actual": row["fee_actual"],
        "plan_variance_pct": row["plan_variance_pct"],
        "ytd_revenue": row["ytd_revenue"],
        "score_breakdown": {
            "revenue_score": row["revenue_score"],
            "staffing_score": row["staffing_score"],
            "timecard_score": row["timecard_score"],
            "client_score": row["client_score"],
        },
        "team_utilization_pct": row.get("team_utilization_pct"),
        "staffing_score": row["staffing_score"],
        "overloaded_resources": row["overloaded_resources"],
        "staffing_gap_resources": row["staffing_gap_resources"],
        "timecard_compliance_pct": row.get("timecard_compliance_pct"),
        "satisfaction_score": row.get("satisfaction_score"),
        "satisfaction_trend_delta": row.get("satisfaction_trend_delta"),
        "red_projects": row["red_projects"],
        "collections_lag": row["collections_lag"],
        "writeoff_leakage": row["writeoff_leakage"],
        "primary_issue_code": row.get("primary_issue_code"),
        "impact_label": row.get("impact_label"),
        "recommended_action": row.get("recommended_action"),
        "recommended_owner": row.get("recommended_owner"),
        "reason_codes": row.get("reason_codes") or [],
        "top_project_risks": top_project_risks,
    }


def build_report_packet(*, env_id: UUID, business_id: UUID, packet_type: str, lens: str, horizon: str, role_preset: str) -> dict[str, Any]:
    command_center = get_command_center(env_id=env_id, business_id=business_id, lens=lens, horizon=horizon, role_preset=role_preset)
    sections = [
        {"key": "headline_metrics", "title": "Headline Metrics", "content": command_center["metrics_strip"]},
        {"key": "performance_table", "title": "Performance Table", "content": command_center["performance_table"]},
        {"key": "delivery_risk", "title": "Delivery Risk", "content": command_center["delivery_risk"]},
        {"key": "resource_health", "title": "Resource & Timecards", "content": {"resources": command_center["resource_health"], "timecards": command_center["timecard_health"]}},
        {"key": "forecast", "title": "Forecast Trend", "content": command_center["forecast_points"]},
        {"key": "client_outcomes", "title": "Client Satisfaction & Closeout", "content": {"satisfaction": command_center["satisfaction"], "closeout": command_center["closeout"]}},
    ]
    narrative = " ".join(command_center["briefing"]["summary_lines"])
    return {
        "packet_type": packet_type,
        "generated_at": utc_now(),
        "title": f"{packet_type.replace('_', ' ').title()} - {normalize_lens(lens).title()} / {normalize_horizon(horizon)}",
        "sections": sections,
        "narrative": narrative,
    }


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, tuple):
        return [_json_ready(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _normalize_export_formats(formats: Iterable[str] | None) -> list[str]:
    normalized: list[str] = []
    for fmt in formats or ("pdf", "xlsx"):
        candidate = str(fmt).strip().lower()
        if candidate in {"pdf", "xlsx"} and candidate not in normalized:
            normalized.append(candidate)
    return normalized or ["pdf", "xlsx"]


def _packet_export_rows(value: Any, prefix: str = "") -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            rows.extend(_packet_export_rows(item, next_prefix))
        return rows
    if isinstance(value, list):
        for index, item in enumerate(value, start=1):
            next_prefix = f"{prefix}[{index}]" if prefix else f"[{index}]"
            rows.extend(_packet_export_rows(item, next_prefix))
        return rows
    rows.append((prefix or "value", "" if value is None else str(value)))
    return rows


def _sanitize_sheet_title(title: str, fallback: str) -> str:
    cleaned = "".join(ch for ch in title if ch not in '[]:*?/\\').strip()
    return (cleaned or fallback)[:31]


def _safe_filename_token(value: str) -> str:
    token = "".join(ch.lower() if ch.isalnum() else "_" for ch in value.strip())
    while "__" in token:
        token = token.replace("__", "_")
    return token.strip("_") or "report"


def _report_export_filename(title: str, report_run_id: UUID, export_format: str) -> str:
    base = _safe_filename_token(title)
    return f"{base}_{str(report_run_id)[:8]}.{export_format}"


def _render_packet_pdf(packet: dict[str, Any], generated_at: str | None) -> bytes:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    y = height - 54

    def write_line(text: str, *, size: int = 10, gap: int = 14) -> None:
        nonlocal y
        if y < 54:
            pdf.showPage()
            y = height - 54
        pdf.setFont("Helvetica", size)
        pdf.drawString(54, y, text[:110])
        y -= gap

    pdf.setTitle(str(packet.get("title") or "PDS Report Packet"))
    write_line(str(packet.get("title") or "PDS Report Packet"), size=16, gap=20)
    write_line(f"Generated: {generated_at or packet.get('generated_at') or 'Unknown'}", size=9, gap=16)
    narrative = str(packet.get("narrative") or "Narrative pending.")
    for line in [narrative[i:i + 105] for i in range(0, len(narrative), 105)] or ["Narrative pending."]:
        write_line(line, size=10, gap=13)

    for section in packet.get("sections") or []:
        write_line("", gap=8)
        write_line(str(section.get("title") or section.get("key") or "Section"), size=12, gap=16)
        flat_rows = _packet_export_rows(section.get("content"))
        if not flat_rows:
            write_line("No data available.", size=9, gap=12)
            continue
        for path, value in flat_rows[:18]:
            write_line(f"{path}: {value}", size=9, gap=12)
        if len(flat_rows) > 18:
            write_line(f"... {len(flat_rows) - 18} more values available in XLSX export", size=9, gap=12)

    pdf.save()
    return buffer.getvalue()


def _render_packet_xlsx(packet: dict[str, Any], generated_at: str | None) -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    overview = workbook.active
    overview.title = "Overview"
    overview.append(["Title", str(packet.get("title") or "PDS Report Packet")])
    overview.append(["Generated At", generated_at or str(packet.get("generated_at") or "")])
    overview.append(["Packet Type", str(packet.get("packet_type") or "")])
    overview.append(["Narrative", str(packet.get("narrative") or "")])

    for index, section in enumerate(packet.get("sections") or [], start=1):
        title = str(section.get("title") or section.get("key") or f"Section {index}")
        sheet = workbook.create_sheet(title=_sanitize_sheet_title(title, f"Section {index}"))
        sheet.append(["Path", "Value"])
        for path, value in _packet_export_rows(section.get("content")):
            sheet.append([path, value])

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def create_report_export_run(
    *,
    env_id: UUID,
    business_id: UUID,
    packet_type: str,
    lens: str,
    horizon: str,
    role_preset: str,
    actor: str | None = None,
    formats: Iterable[str] | None = None,
) -> dict[str, Any]:
    packet = build_report_packet(
        env_id=env_id,
        business_id=business_id,
        packet_type=packet_type,
        lens=lens,
        horizon=horizon,
        role_preset=role_preset,
    )
    available_formats = _normalize_export_formats(formats)
    timestamp = utc_now()
    generated_at = packet.get("generated_at")
    packet_json = _json_ready(packet)
    metadata_json = {
        "packet_type": packet_type,
        "title": packet.get("title"),
        "lens": normalize_lens(lens, role_preset),
        "horizon": normalize_horizon(horizon),
        "role_preset": normalize_role_preset(role_preset),
        "available_formats": available_formats,
        "generated_at": _json_ready(generated_at),
        "packet": packet_json,
    }
    artifact_refs = [
        {"artifact_type": "pds_v2_report_export", "format": fmt, "status": "available"}
        for fmt in available_formats
    ]
    run_id = f"pds_v2_export_{timestamp.strftime('%Y%m%d%H%M%S')}"

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_report_runs
            (env_id, business_id, period, run_id, status, snapshot_hash, deterministic_deltas_json,
             artifact_refs_json, narrative_text, source, version_no, metadata_json, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, 'completed', %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING report_run_id, run_id, period, status, source, created_at, metadata_json
            """,
            (
                str(env_id),
                str(business_id),
                normalize_horizon(horizon),
                run_id,
                packet.get("generated_at").isoformat() if isinstance(packet.get("generated_at"), datetime) else None,
                json.dumps({}),
                json.dumps(artifact_refs),
                packet.get("narrative"),
                "pds_v2_export",
                2,
                json.dumps(metadata_json),
                actor,
                actor,
            ),
        )
        row = cur.fetchone() or {}
    return _format_report_export_run(row)


def _format_report_export_run(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata_json") or {}
    packet = metadata.get("packet") or {}
    return {
        "report_run_id": row["report_run_id"],
        "run_id": row.get("run_id") or "",
        "packet_type": metadata.get("packet_type") or packet.get("packet_type") or "forecast_pack",
        "title": metadata.get("title") or packet.get("title") or "PDS Report Packet",
        "status": row.get("status") or "completed",
        "source": row.get("source") or "pds_v2_export",
        "period": row.get("period") or metadata.get("horizon") or "Forecast",
        "lens": metadata.get("lens") or "market",
        "horizon": metadata.get("horizon") or "Forecast",
        "role_preset": metadata.get("role_preset") or "executive",
        "available_formats": _normalize_export_formats(metadata.get("available_formats")),
        "generated_at": _coerce_datetime(metadata.get("generated_at")) or _coerce_datetime(packet.get("generated_at")) or _coerce_datetime(row.get("created_at")) or utc_now(),
        "created_at": _coerce_datetime(row.get("created_at")) or utc_now(),
    }


def list_report_export_runs(
    *,
    env_id: UUID,
    business_id: UUID,
    packet_type: str | None = None,
    limit: int = 6,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 25))
    with get_cursor() as cur:
        if packet_type:
            cur.execute(
                """
                SELECT report_run_id, run_id, period, status, source, created_at, metadata_json
                FROM pds_report_runs
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND source = 'pds_v2_export'
                  AND COALESCE(metadata_json->>'packet_type', '') = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (str(env_id), str(business_id), packet_type, safe_limit),
            )
        else:
            cur.execute(
                """
                SELECT report_run_id, run_id, period, status, source, created_at, metadata_json
                FROM pds_report_runs
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND source = 'pds_v2_export'
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (str(env_id), str(business_id), safe_limit),
            )
        rows = cur.fetchall()
    return [_format_report_export_run(row) for row in rows]


def get_report_export_run(*, env_id: UUID, business_id: UUID, report_run_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT report_run_id, run_id, period, status, source, created_at, metadata_json
            FROM pds_report_runs
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND report_run_id = %s::uuid
              AND source = 'pds_v2_export'
            LIMIT 1
            """,
            (str(env_id), str(business_id), str(report_run_id)),
        )
        row = cur.fetchone()
    return None if row is None else _format_report_export_run(row) | {"metadata_json": row.get("metadata_json") or {}}


def render_report_export(
    *,
    env_id: UUID,
    business_id: UUID,
    report_run_id: UUID,
    export_format: str,
) -> tuple[bytes, str, str]:
    run = get_report_export_run(env_id=env_id, business_id=business_id, report_run_id=report_run_id)
    if run is None:
        raise ValueError("Report export run not found")

    fmt = str(export_format).strip().lower()
    if fmt not in set(run["available_formats"]):
        raise ValueError(f"Unsupported export format: {export_format}")

    metadata = run.get("metadata_json") or {}
    packet = metadata.get("packet")
    if not isinstance(packet, dict):
        raise ValueError("Saved report packet is unavailable")

    generated_at = metadata.get("generated_at")
    if fmt == "pdf":
        return (
            _render_packet_pdf(packet, generated_at),
            _report_export_filename(run["title"], report_run_id, "pdf"),
            "application/pdf",
        )
    return (
        _render_packet_xlsx(packet, generated_at),
        _report_export_filename(run["title"], report_run_id, "xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
