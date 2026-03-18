"""Capital Projects service — unified query layer over PDS + cp_* tables.

Provides portfolio rollups, project dashboards, health scoring, and CRUD
for construction-specific entities (daily logs, meetings, drawings, pay apps).
Delegates to pds_svc for existing PDS entities.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


# ── Helpers ────────────────────────────────────────────────────────

def _q(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _normalize_limit(value: int | None, default: int = 50, maximum: int = 200) -> int:
    if value is None:
        return default
    return max(1, min(int(value), maximum))


def _normalize_offset(value: int | None) -> int:
    if value is None:
        return 0
    return max(0, int(value))


# ── Health scoring ─────────────────────────────────────────────────

def compute_budget_health(
    approved_budget: Decimal,
    forecast_at_completion: Decimal,
    contingency_remaining: Decimal,
) -> str:
    if approved_budget <= 0:
        return "green"
    variance = approved_budget - forecast_at_completion
    variance_pct = variance / approved_budget
    if variance_pct >= 0:
        return "green"
    if variance_pct > Decimal("-0.05"):
        return "yellow"
    return "red"


def compute_schedule_health(milestones: list[dict[str, Any]]) -> str:
    if not milestones:
        return "green"
    max_slip = 0
    today = date.today()
    for m in milestones:
        baseline = m.get("baseline_date")
        current = m.get("current_date")
        if baseline and current:
            if isinstance(baseline, str):
                baseline = date.fromisoformat(baseline[:10])
            if isinstance(current, str):
                current = date.fromisoformat(current[:10])
            slip = (current - baseline).days
            if slip > max_slip:
                max_slip = slip
    if max_slip <= 5:
        return "green"
    if max_slip <= 15:
        return "yellow"
    return "red"


def compute_overall_health(
    budget_health: str,
    schedule_health: str,
    risk_score: Decimal,
    open_items: int,
) -> str:
    score = Decimal("0")
    health_map = {"green": Decimal("1.0"), "yellow": Decimal("0.5"), "red": Decimal("0.0")}
    score += health_map.get(budget_health, Decimal("0.5")) * Decimal("0.30")
    score += health_map.get(schedule_health, Decimal("0.5")) * Decimal("0.25")
    risk_norm = max(Decimal("0"), Decimal("1") - (Decimal(str(risk_score)) / Decimal("100")))
    score += risk_norm * Decimal("0.25")
    item_norm = max(Decimal("0"), Decimal("1") - (Decimal(str(min(open_items, 50))) / Decimal("50")))
    score += item_norm * Decimal("0.20")
    if score >= Decimal("0.70"):
        return "on_track"
    if score >= Decimal("0.40"):
        return "at_risk"
    return "critical"


def _build_health(project: dict[str, Any], milestones: list[dict[str, Any]] | None = None, open_items: int = 0) -> dict[str, str]:
    budget_h = compute_budget_health(
        _q(project.get("approved_budget")),
        _q(project.get("forecast_at_completion")),
        _q(project.get("contingency_remaining")),
    )
    schedule_h = compute_schedule_health(milestones or [])
    risk_score = _q(project.get("risk_score"))
    overall = compute_overall_health(budget_h, schedule_h, risk_score, open_items)
    return {
        "budget_health": budget_h,
        "schedule_health": schedule_h,
        "overall_health": overall,
        "risk_score": str(risk_score),
    }


# ── Portfolio ──────────────────────────────────────────────────────

def get_portfolio_summary(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.*,
              (SELECT COUNT(*) FROM pds_rfis r WHERE r.project_id = p.project_id AND r.status = 'open') AS open_rfis,
              (SELECT COUNT(*) FROM pds_submittals s WHERE s.project_id = p.project_id AND s.status IN ('pending','in_review')) AS open_submittals,
              (SELECT COUNT(*) FROM pds_submittals s2 WHERE s2.project_id = p.project_id AND s2.status IN ('pending','in_review') AND s2.required_date < CURRENT_DATE) AS overdue_submittals,
              (SELECT COUNT(*) FROM pds_punch_items pi WHERE pi.project_id = p.project_id AND pi.status = 'open') AS open_punch_items,
              (SELECT COUNT(*) FROM pds_change_orders co WHERE co.project_id = p.project_id AND co.status = 'pending') AS pending_cos
            FROM pds_projects p
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid AND p.status != 'archived'
            ORDER BY p.name
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall()

    projects = []
    kpis = {
        "total_approved_budget": Decimal("0"),
        "total_committed": Decimal("0"),
        "total_spent": Decimal("0"),
        "total_forecast": Decimal("0"),
        "total_budget_variance": Decimal("0"),
        "total_contingency_remaining": Decimal("0"),
        "projects_on_track": 0,
        "projects_at_risk": 0,
        "projects_critical": 0,
        "total_open_rfis": 0,
        "total_overdue_submittals": 0,
        "total_open_punch_items": 0,
    }

    for row in rows:
        open_items = int(row.get("open_rfis", 0)) + int(row.get("open_submittals", 0)) + int(row.get("open_punch_items", 0))
        health = _build_health(row, open_items=open_items)
        variance = _q(row.get("approved_budget")) - _q(row.get("forecast_at_completion"))

        projects.append({
            "project_id": str(row["project_id"]),
            "name": row["name"],
            "project_code": row.get("project_code"),
            "sector": row.get("sector"),
            "stage": row.get("stage", "planning"),
            "region": row.get("region"),
            "market": row.get("market"),
            "gc_name": row.get("gc_name"),
            "approved_budget": str(_q(row.get("approved_budget"))),
            "committed_amount": str(_q(row.get("committed_amount"))),
            "spent_amount": str(_q(row.get("spent_amount"))),
            "forecast_at_completion": str(_q(row.get("forecast_at_completion"))),
            "contingency_remaining": str(_q(row.get("contingency_remaining"))),
            "health": health,
            "open_rfis": int(row.get("open_rfis", 0)),
            "open_submittals": int(row.get("open_submittals", 0)),
            "open_punch_items": int(row.get("open_punch_items", 0)),
            "pending_change_orders": int(row.get("pending_cos", 0)),
        })

        kpis["total_approved_budget"] += _q(row.get("approved_budget"))
        kpis["total_committed"] += _q(row.get("committed_amount"))
        kpis["total_spent"] += _q(row.get("spent_amount"))
        kpis["total_forecast"] += _q(row.get("forecast_at_completion"))
        kpis["total_contingency_remaining"] += _q(row.get("contingency_remaining"))
        kpis["total_open_rfis"] += int(row.get("open_rfis", 0))
        kpis["total_overdue_submittals"] += int(row.get("overdue_submittals", 0))
        kpis["total_open_punch_items"] += int(row.get("open_punch_items", 0))
        oh = health["overall_health"]
        if oh == "on_track":
            kpis["projects_on_track"] += 1
        elif oh == "at_risk":
            kpis["projects_at_risk"] += 1
        else:
            kpis["projects_critical"] += 1

    kpis["total_budget_variance"] = kpis["total_approved_budget"] - kpis["total_forecast"]

    serialized_kpis = {k: str(v) if isinstance(v, Decimal) else v for k, v in kpis.items()}
    return {"kpis": serialized_kpis, "projects": projects}


# ── Project Dashboard ──────────────────────────────────────────────

def get_project_dashboard(*, project_id: UUID, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.*,
              (SELECT COUNT(*) FROM pds_rfis r WHERE r.project_id = p.project_id AND r.status = 'open') AS open_rfis,
              (SELECT COUNT(*) FROM pds_submittals s WHERE s.project_id = p.project_id AND s.status IN ('pending','in_review')) AS open_submittals,
              (SELECT COUNT(*) FROM pds_submittals s2 WHERE s2.project_id = p.project_id AND s2.status IN ('pending','in_review') AND s2.required_date < CURRENT_DATE) AS overdue_submittals,
              (SELECT COUNT(*) FROM pds_punch_items pi WHERE pi.project_id = p.project_id AND pi.status = 'open') AS open_punch_items,
              (SELECT COUNT(*) FROM pds_change_orders co WHERE co.project_id = p.project_id AND co.status = 'pending') AS pending_cos,
              (SELECT COUNT(*) FROM pds_risks rk WHERE rk.project_id = p.project_id AND rk.status = 'open') AS open_risks,
              (SELECT COUNT(*) FROM cp_meeting_item mi
                 JOIN cp_meeting m ON mi.meeting_id = m.meeting_id
                WHERE m.project_id = p.project_id AND mi.status IN ('open','in_progress')) AS open_action_items
            FROM pds_projects p
            WHERE p.project_id = %s::uuid AND p.env_id = %s::uuid AND p.business_id = %s::uuid
            """,
            (str(project_id), str(env_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Project {project_id} not found")

        # Milestones
        cur.execute(
            "SELECT * FROM pds_milestones WHERE project_id = %s::uuid ORDER BY baseline_date ASC NULLS LAST",
            (str(project_id),),
        )
        milestones = cur.fetchall()

        # Recent activity (last 10 events from various tables)
        cur.execute(
            """
            (SELECT 'change_order' AS type, change_order_ref AS label, status, created_at FROM pds_change_orders WHERE project_id = %s::uuid ORDER BY created_at DESC LIMIT 3)
            UNION ALL
            (SELECT 'rfi' AS type, subject AS label, status, created_at FROM pds_rfis WHERE project_id = %s::uuid ORDER BY created_at DESC LIMIT 3)
            UNION ALL
            (SELECT 'daily_log' AS type, work_completed AS label, 'completed' AS status, created_at FROM cp_daily_log WHERE project_id = %s::uuid ORDER BY log_date DESC LIMIT 2)
            UNION ALL
            (SELECT 'meeting' AS type, meeting_type AS label, status, created_at FROM cp_meeting WHERE project_id = %s::uuid ORDER BY meeting_date DESC LIMIT 2)
            ORDER BY created_at DESC LIMIT 10
            """,
            (str(project_id), str(project_id), str(project_id), str(project_id)),
        )
        recent = cur.fetchall()

    open_items = int(row.get("open_rfis", 0)) + int(row.get("open_submittals", 0)) + int(row.get("open_punch_items", 0))
    health = _build_health(row, milestones=milestones, open_items=open_items)
    variance = _q(row.get("approved_budget")) - _q(row.get("forecast_at_completion"))

    milestones_out = [
        {
            "milestone_id": str(m["milestone_id"]),
            "milestone_name": m["milestone_name"],
            "baseline_date": str(m["baseline_date"]) if m.get("baseline_date") else None,
            "current_date": str(m.get("current_date")) if m.get("current_date") else None,
            "actual_date": str(m.get("actual_date")) if m.get("actual_date") else None,
            "is_critical": m.get("is_critical", False),
            "is_on_critical_path": m.get("is_on_critical_path", False),
        }
        for m in milestones
    ]

    recent_out = [
        {
            "type": r.get("type"),
            "label": (r.get("label") or "")[:120],
            "status": r.get("status"),
            "created_at": str(r["created_at"]) if r.get("created_at") else None,
        }
        for r in recent
    ]

    return {
        "project_id": str(row["project_id"]),
        "name": row["name"],
        "project_code": row.get("project_code"),
        "description": row.get("description"),
        "sector": row.get("sector"),
        "project_type": row.get("project_type"),
        "stage": row.get("stage", "planning"),
        "status": row.get("status", "active"),
        "region": row.get("region"),
        "market": row.get("market"),
        "address": row.get("address"),
        "gc_name": row.get("gc_name"),
        "architect_name": row.get("architect_name"),
        "owner_rep": row.get("owner_rep"),
        "project_manager": row.get("project_manager"),
        "start_date": str(row["start_date"]) if row.get("start_date") else None,
        "target_end_date": str(row["target_end_date"]) if row.get("target_end_date") else None,
        "approved_budget": str(_q(row.get("approved_budget"))),
        "original_budget": str(_q(row.get("original_budget"))),
        "committed_amount": str(_q(row.get("committed_amount"))),
        "spent_amount": str(_q(row.get("spent_amount"))),
        "forecast_at_completion": str(_q(row.get("forecast_at_completion"))),
        "contingency_budget": str(_q(row.get("contingency_budget"))),
        "contingency_remaining": str(_q(row.get("contingency_remaining"))),
        "management_reserve": str(_q(row.get("management_reserve"))),
        "pending_change_order_amount": str(_q(row.get("pending_change_order_amount"))),
        "budget_variance": str(variance),
        "risk_score": str(_q(row.get("risk_score"))),
        "health": health,
        "open_rfis": int(row.get("open_rfis", 0)),
        "open_submittals": int(row.get("open_submittals", 0)),
        "overdue_submittals": int(row.get("overdue_submittals", 0)),
        "open_punch_items": int(row.get("open_punch_items", 0)),
        "pending_change_orders": int(row.get("pending_cos", 0)),
        "open_risks": int(row.get("open_risks", 0)),
        "open_action_items": int(row.get("open_action_items", 0)),
        "milestones": milestones_out,
        "recent_activity": recent_out,
    }


# ── Daily Logs ─────────────────────────────────────────────────────

def list_daily_logs(*, project_id: UUID, env_id: UUID, business_id: UUID, limit: int | None = None, offset: int | None = None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM cp_daily_log
            WHERE project_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY log_date DESC
            LIMIT %s OFFSET %s
            """,
            (str(project_id), str(env_id), str(business_id), _normalize_limit(limit), _normalize_offset(offset)),
        )
        return cur.fetchall()


def create_daily_log(*, project_id: UUID, env_id: UUID, business_id: UUID, payload: dict[str, Any]) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cp_daily_log (
              env_id, business_id, project_id, log_date,
              weather_high, weather_low, weather_conditions,
              manpower_count, superintendent, work_completed,
              visitors, incidents, deliveries, equipment,
              safety_observations, notes, photo_urls, created_by
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s, %s,
              %s, %s, %s::jsonb, %s
            )
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), payload["log_date"],
                payload.get("weather_high"), payload.get("weather_low"), payload.get("weather_conditions"),
                payload.get("manpower_count", 0), payload.get("superintendent"), payload.get("work_completed"),
                payload.get("visitors"), payload.get("incidents"), payload.get("deliveries"), payload.get("equipment"),
                payload.get("safety_observations"), payload.get("notes"),
                json.dumps(payload.get("photo_urls", [])), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Meetings ───────────────────────────────────────────────────────

def list_meetings(*, project_id: UUID, env_id: UUID, business_id: UUID, limit: int | None = None, offset: int | None = None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cp_meeting WHERE project_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid ORDER BY meeting_date DESC LIMIT %s OFFSET %s",
            (str(project_id), str(env_id), str(business_id), _normalize_limit(limit), _normalize_offset(offset)),
        )
        meetings = cur.fetchall()

        meeting_ids = [str(m["meeting_id"]) for m in meetings]
        items_by_meeting: dict[str, list[dict]] = {}
        if meeting_ids:
            placeholders = ",".join(["%s::uuid"] * len(meeting_ids))
            cur.execute(
                f"SELECT * FROM cp_meeting_item WHERE meeting_id IN ({placeholders}) ORDER BY item_number",
                meeting_ids,
            )
            for item in cur.fetchall():
                mid = str(item["meeting_id"])
                items_by_meeting.setdefault(mid, []).append(item)

        for m in meetings:
            m["items"] = items_by_meeting.get(str(m["meeting_id"]), [])
        return meetings


def create_meeting(*, project_id: UUID, env_id: UUID, business_id: UUID, payload: dict[str, Any]) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cp_meeting (
              env_id, business_id, project_id, meeting_type, meeting_date,
              location, called_by, attendees, agenda, minutes,
              next_meeting_date, status, created_by
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s, %s,
              %s, %s, %s::jsonb, %s, %s,
              %s, %s, %s
            )
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id),
                payload.get("meeting_type", "progress"), payload["meeting_date"],
                payload.get("location"), payload.get("called_by"),
                json.dumps(payload.get("attendees", [])), payload.get("agenda"), payload.get("minutes"),
                payload.get("next_meeting_date"),
                payload.get("status", "scheduled"), payload.get("created_by"),
            ),
        )
        meeting = cur.fetchone()
        meeting_id = meeting["meeting_id"]

        items = payload.get("items", [])
        meeting["items"] = []
        for idx, item in enumerate(items, start=1):
            cur.execute(
                """
                INSERT INTO cp_meeting_item (
                  env_id, business_id, meeting_id, item_number,
                  topic, discussion, action_required,
                  responsible_party, due_date, status, created_by
                ) VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    str(env_id), str(business_id), str(meeting_id), idx,
                    item["topic"], item.get("discussion"), item.get("action_required"),
                    item.get("responsible_party"), item.get("due_date"),
                    item.get("status", "open"), payload.get("created_by"),
                ),
            )
            meeting["items"].append(cur.fetchone())
        return meeting


# ── Drawings ───────────────────────────────────────────────────────

def list_drawings(*, project_id: UUID, env_id: UUID, business_id: UUID, limit: int | None = None, offset: int | None = None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cp_drawing WHERE project_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid ORDER BY discipline, sheet_number LIMIT %s OFFSET %s",
            (str(project_id), str(env_id), str(business_id), _normalize_limit(limit, default=100), _normalize_offset(offset)),
        )
        return cur.fetchall()


def create_drawing(*, project_id: UUID, env_id: UUID, business_id: UUID, payload: dict[str, Any]) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cp_drawing (
              env_id, business_id, project_id, discipline, sheet_number,
              title, revision, issue_date, received_date, status, notes, created_by
            ) VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id),
                payload["discipline"], payload["sheet_number"],
                payload["title"], payload.get("revision", "A"),
                payload.get("issue_date"), payload.get("received_date"),
                payload.get("status", "current"), payload.get("notes"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Pay Applications ───────────────────────────────────────────────

def list_pay_apps(*, project_id: UUID, env_id: UUID, business_id: UUID, limit: int | None = None, offset: int | None = None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT pa.*, v.vendor_name, c.contract_number
            FROM cp_pay_app pa
            LEFT JOIN pds_vendors v ON pa.vendor_id = v.vendor_id
            LEFT JOIN pds_contracts c ON pa.contract_id = c.contract_id
            WHERE pa.project_id = %s::uuid AND pa.env_id = %s::uuid AND pa.business_id = %s::uuid
            ORDER BY pa.pay_app_number DESC
            LIMIT %s OFFSET %s
            """,
            (str(project_id), str(env_id), str(business_id), _normalize_limit(limit), _normalize_offset(offset)),
        )
        return cur.fetchall()


def create_pay_app(*, project_id: UUID, env_id: UUID, business_id: UUID, payload: dict[str, Any]) -> dict:
    # Compute derived G702 fields
    wc_prev = Decimal(str(payload.get("work_completed_previous", 0)))
    wc_this = Decimal(str(payload.get("work_completed_this_period", 0)))
    sm_prev = Decimal(str(payload.get("stored_materials_previous", 0)))
    sm_curr = Decimal(str(payload.get("stored_materials_current", 0)))
    scheduled = Decimal(str(payload.get("scheduled_value", 0)))
    ret_pct = Decimal(str(payload.get("retainage_pct", "10.0000")))

    total_completed_stored = wc_prev + wc_this + sm_prev + sm_curr
    retainage_amount = (total_completed_stored * ret_pct / Decimal("100")).quantize(Decimal("0.01"))
    total_earned_less_retainage = total_completed_stored - retainage_amount
    previous_payments = Decimal("0")  # First app or caller supplies
    current_payment_due = total_earned_less_retainage - previous_payments
    balance_to_finish = scheduled - total_completed_stored

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cp_pay_app (
              env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
              billing_period_start, billing_period_end,
              scheduled_value, work_completed_previous, work_completed_this_period,
              stored_materials_previous, stored_materials_current,
              total_completed_stored, retainage_pct, retainage_amount,
              total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
              status, created_by
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s, %s, %s,
              %s, %s,
              %s, %s, %s,
              %s, %s,
              %s, %s, %s,
              %s, %s, %s, %s,
              'draft', %s
            )
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id),
                str(payload["contract_id"]) if payload.get("contract_id") else None,
                str(payload["vendor_id"]) if payload.get("vendor_id") else None,
                payload["pay_app_number"],
                payload.get("billing_period_start"), payload.get("billing_period_end"),
                str(scheduled), str(wc_prev), str(wc_this),
                str(sm_prev), str(sm_curr),
                str(total_completed_stored), str(ret_pct), str(retainage_amount),
                str(total_earned_less_retainage), str(previous_payments),
                str(current_payment_due), str(balance_to_finish),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def approve_pay_app(*, pay_app_id: UUID, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cp_pay_app WHERE pay_app_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid",
            (str(pay_app_id), str(env_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pay app {pay_app_id} not found")
        if row["status"] not in ("submitted", "under_review"):
            raise ValueError(f"Pay app cannot be approved from status '{row['status']}'")

        cur.execute(
            """
            UPDATE cp_pay_app
            SET status = 'approved', approved_date = CURRENT_DATE, updated_by = %s, updated_at = now()
            WHERE pay_app_id = %s::uuid
            RETURNING *
            """,
            (actor, str(pay_app_id)),
        )
        result = cur.fetchone()
        emit_log(level="info", service="backend", action="cp.pay_app.approved",
                 message=f"Pay app {pay_app_id} approved", context={"pay_app_id": str(pay_app_id)})
        return result
