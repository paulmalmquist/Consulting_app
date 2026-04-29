"""Engagement Routing service.

Control layer for how work becomes Novendor revenue. Owns the routing health
computation, engagement CRUD, contracts, revenue streams, invoices, attribution,
and pipeline-deal-to-engagement conversion.

Routing health is computed deterministically server-side. The frontend only
displays it; never recomputes.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id


NOVENDOR_ENTITY = "Novendor LLC"

ROUTING_STATUSES = {
    "draft", "routing_review", "active", "paused",
    "renewal_risk", "closed", "lost",
}

CONTRACT_TYPES = {
    "MSA", "SOW", "amendment", "contractor_agreement",
    "subcontractor_agreement", "NDA", "other",
}

CONTRACT_STATUSES = {
    "draft", "sent", "partially_signed", "fully_signed", "expired", "superseded",
}

REVENUE_TYPES = {"fixed", "hourly", "retainer", "milestone", "success_fee", "hybrid"}

ATTRIBUTION_ROLES = {
    "originator", "seller", "relationship_owner", "delivery_owner",
    "delivery_support", "partner", "admin_support",
}


# ── Routing health (pure function) ──────────────────────────────────────────


def calculate_routing_health(
    *,
    engagement: dict,
    contracts: list[dict],
    revenue_streams: list[dict],
    invoices: list[dict],
    attribution: list[dict],
) -> dict:
    """Deterministic routing health.

    Inputs are plain dicts so this is unit-testable without a database.

    Returns a RoutingHealth-shaped dict:
        routing_health_status: green | yellow | red
        routing_health_reasons: list[str]
        properly_routed: bool
        personal_risk: bool
        novendor_compounding_status: compounds | partial | non_compounding
    """
    contracting_entity = (engagement.get("contracting_entity") or "").strip()
    routing_status = engagement.get("routing_status") or "draft"
    is_active = routing_status in {"active", "routing_review", "renewal_risk"}

    has_signed_contract = any(c.get("status") == "fully_signed" for c in contracts)
    has_revenue_stream = bool(revenue_streams)
    has_attribution = bool(attribution)
    has_invoice_activity = bool(invoices)
    has_relationship_owner = bool(engagement.get("relationship_owner_user_id"))
    has_delivery_owner = bool(engagement.get("delivery_owner_user_id"))
    has_next_action = bool(
        engagement.get("next_action_text") or engagement.get("next_action_task_id")
    )

    reasons: list[str] = []

    # ── RED triggers ────────────────────────────────────────────────────────
    is_red = False

    if not contracting_entity:
        reasons.append("Contracting entity is not set")
        is_red = True
    elif contracting_entity != NOVENDOR_ENTITY:
        reasons.append("Contracting entity is not Novendor LLC")
        is_red = True

    if is_active and not contracts:
        reasons.append("No signed contract attached")
        is_red = True

    if has_invoice_activity and not has_revenue_stream:
        reasons.append("Invoice activity with no revenue stream")
        is_red = True

    if is_red:
        return {
            "routing_health_status": "red",
            "routing_health_reasons": reasons,
            "properly_routed": False,
            "personal_risk": contracting_entity != NOVENDOR_ENTITY,
            "novendor_compounding_status": "non_compounding",
        }

    # ── YELLOW gaps (Novendor-routed but missing items) ─────────────────────
    yellow_reasons: list[str] = []

    if not has_signed_contract:
        yellow_reasons.append("Missing signed contract")
    if not has_revenue_stream:
        yellow_reasons.append("Revenue structure missing")
    if not has_attribution:
        yellow_reasons.append("Economics split missing")
    if not has_relationship_owner:
        yellow_reasons.append("No relationship owner")
    if not has_delivery_owner:
        yellow_reasons.append("No delivery owner")
    if is_active and not has_next_action:
        yellow_reasons.append("No next action")

    # Economics percentages should sum to ~1.0 when present.
    if has_attribution:
        money_roles = {"originator", "seller", "relationship_owner",
                       "delivery_owner", "delivery_support", "partner"}
        econ_total = sum(
            float(a.get("economics_percentage") or 0)
            for a in attribution
            if a.get("role") in money_roles and a.get("economics_percentage") is not None
        )
        if attribution and econ_total > 0 and abs(econ_total - 1.0) > 0.001:
            yellow_reasons.append(
                f"Economics split totals {econ_total:.2f}, expected 1.00"
            )

    if yellow_reasons:
        return {
            "routing_health_status": "yellow",
            "routing_health_reasons": yellow_reasons,
            "properly_routed": False,
            "personal_risk": False,
            "novendor_compounding_status": "partial",
        }

    # ── GREEN ───────────────────────────────────────────────────────────────
    return {
        "routing_health_status": "green",
        "routing_health_reasons": [],
        "properly_routed": True,
        "personal_risk": False,
        "novendor_compounding_status": "compounds",
    }


def recommend_next_actions(*, health: dict, engagement: dict) -> list[str]:
    """Translate routing health gaps into recommended actions for the rail."""
    actions: list[str] = []
    reasons = set(health.get("routing_health_reasons") or [])

    if "Contracting entity is not Novendor LLC" in reasons:
        actions.append("Convert to Novendor contracting path")
    if "No signed contract attached" in reasons or "Missing signed contract" in reasons:
        actions.append("Add signed contract")
    if "Revenue structure missing" in reasons:
        actions.append("Add revenue stream")
    if "Economics split missing" in reasons:
        actions.append("Define economics split")
    if any("Economics split totals" in r for r in reasons):
        actions.append("Fix economics split to total 1.00")
    if "No relationship owner" in reasons:
        actions.append("Assign relationship owner")
    if "No delivery owner" in reasons:
        actions.append("Assign delivery owner")
    if "No next action" in reasons:
        actions.append("Set next action")
    if "Invoice activity with no revenue stream" in reasons:
        actions.append("Add revenue stream covering existing invoices")

    if engagement.get("marketing_permission_status") == "unknown":
        actions.append("Capture marketing permission status")
    if not engagement.get("expected_roi_angle"):
        actions.append("Capture expected ROI angle for case study readiness")

    return actions


# ── Internal helpers ────────────────────────────────────────────────────────


def _ensure_client(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID | None,
    client_name: str,
) -> tuple[UUID, UUID]:
    """Find or create a (crm_account, cro_client) pair and return both IDs.

    Engagement Routing keeps cro_engagement.client_id NOT NULL by always
    provisioning a real cro_client row. The personal-vs-Novendor signal
    lives in contracting_entity, never in the absence of a client.
    """
    tenant_id = resolve_tenant_id(cur, business_id)

    # Step 1: resolve crm_account
    if crm_account_id is None:
        cur.execute(
            """
            SELECT crm_account_id FROM crm_account
            WHERE tenant_id = %s AND business_id = %s AND name = %s
            """,
            (tenant_id, str(business_id), client_name),
        )
        row = cur.fetchone()
        if row:
            crm_account_id = UUID(str(row["crm_account_id"]))
        else:
            cur.execute(
                """
                INSERT INTO crm_account (tenant_id, business_id, name, account_type)
                VALUES (%s, %s, %s, 'customer')
                RETURNING crm_account_id
                """,
                (tenant_id, str(business_id), client_name),
            )
            crm_account_id = UUID(str(cur.fetchone()["crm_account_id"]))

    # Step 2: find or create cro_client for this (account, env)
    cur.execute(
        """
        SELECT id FROM cro_client
        WHERE crm_account_id = %s AND env_id = %s
        """,
        (str(crm_account_id), env_id),
    )
    row = cur.fetchone()
    if row:
        return crm_account_id, UUID(str(row["id"]))

    cur.execute(
        """
        INSERT INTO cro_client
          (env_id, business_id, crm_account_id, start_date)
        VALUES (%s, %s, %s, CURRENT_DATE)
        RETURNING id
        """,
        (env_id, str(business_id), str(crm_account_id)),
    )
    return crm_account_id, UUID(str(cur.fetchone()["id"]))


def _log_event(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    event_type: str,
    summary: str,
    actor_user_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO cro_routing_event
          (env_id, business_id, engagement_id, event_type, actor_user_id,
           summary, metadata_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            env_id, str(business_id), str(engagement_id), event_type,
            actor_user_id, summary,
            _jsonify(metadata or {}),
        ),
    )


def _jsonify(payload: dict) -> str:
    import json
    return json.dumps(payload, default=str)


def _create_next_action_task(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    title: str,
    why_now: str,
    next_action: str,
    due_date: date | None = None,
    linked_deal_id: UUID | None = None,
    linked_contact_id: UUID | None = None,
) -> UUID:
    cur.execute(
        """
        INSERT INTO cro_execution_task
          (env_id, business_id, title, next_action, why_now, type, status,
           linked_deal_id, linked_contact_id, due_date, auto_source)
        VALUES (%s, %s, %s, %s, %s, 'follow_up', 'today', %s, %s, %s, 'manual')
        RETURNING id
        """,
        (
            env_id, str(business_id), title, next_action, why_now,
            str(linked_deal_id) if linked_deal_id else None,
            str(linked_contact_id) if linked_contact_id else None,
            due_date,
        ),
    )
    return UUID(str(cur.fetchone()["id"]))


def _engagement_select_columns() -> str:
    return """
        e.id, e.env_id, e.business_id, e.client_id, e.name, e.engagement_type,
        e.status, e.routing_status, e.contracting_entity,
        e.originated_by_user_id, e.relationship_owner_user_id,
        e.delivery_owner_user_id, e.lead_source,
        e.start_date AS expected_start_date,
        e.end_date AS expected_end_date,
        e.budget, e.actual_spend, e.margin_pct, e.notes,
        e.current_pain, e.what_winston_replaces, e.expected_roi_angle,
        e.marketing_permission_status,
        e.next_action_task_id, e.next_action_text, e.next_action_due_date,
        e.source_deal_id, e.client_name_override,
        e.created_at, e.updated_at,
        a.crm_account_id, a.name AS crm_account_name
    """


def _engagement_from_row(row: dict) -> dict:
    """Normalize a joined cro_engagement + crm_account row into the dict shape
    the API/Pydantic layer expects."""
    client_name = (
        row.get("client_name_override")
        or row.get("crm_account_name")
        or "Unnamed engagement"
    )
    return {
        "id": row["id"],
        "name": row["name"],
        "client_name": client_name,
        "client_id": row.get("client_id"),
        "crm_account_id": row.get("crm_account_id"),
        "crm_account_name": row.get("crm_account_name"),
        "contracting_entity": row.get("contracting_entity") or NOVENDOR_ENTITY,
        "routing_status": row.get("routing_status") or "draft",
        "engagement_type": row.get("engagement_type"),
        "originated_by_user_id": row.get("originated_by_user_id"),
        "relationship_owner_user_id": row.get("relationship_owner_user_id"),
        "delivery_owner_user_id": row.get("delivery_owner_user_id"),
        "lead_source": row.get("lead_source"),
        "expected_start_date": row.get("expected_start_date"),
        "expected_end_date": row.get("expected_end_date"),
        "current_pain": row.get("current_pain"),
        "what_winston_replaces": row.get("what_winston_replaces"),
        "expected_roi_angle": row.get("expected_roi_angle"),
        "marketing_permission_status": row.get("marketing_permission_status") or "unknown",
        "next_action_task_id": row.get("next_action_task_id"),
        "next_action_text": row.get("next_action_text"),
        "next_action_due_date": row.get("next_action_due_date"),
        "source_deal_id": row.get("source_deal_id"),
        "notes": row.get("notes"),
        "description": row.get("notes"),  # cro_engagement only has notes; reuse
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "budget": row.get("budget"),
    }


def _fetch_contracts(cur, env_id: str, engagement_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, engagement_id, contract_type, status,
               signed_by_client, signed_by_novendor,
               effective_date, expiration_date, file_url, file_storage_key,
               billing_terms, legal_notes, created_at, updated_at
        FROM cro_engagement_contract
        WHERE env_id = %s AND engagement_id = %s
        ORDER BY created_at ASC
        """,
        (env_id, str(engagement_id)),
    )
    rows = cur.fetchall()
    for r in rows:
        r["is_fully_executed"] = (
            bool(r["signed_by_client"]) and bool(r["signed_by_novendor"])
        )
    return rows


def _fetch_revenue_streams(cur, env_id: str, engagement_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, engagement_id, revenue_type, total_contract_value,
               hourly_rate, estimated_hours, retainer_amount, billing_frequency,
               margin_split_json, start_date, end_date, revenue_notes,
               created_at
        FROM cro_revenue_schedule
        WHERE env_id = %s AND engagement_id = %s AND is_revenue_stream = true
        ORDER BY created_at ASC
        """,
        (env_id, str(engagement_id)),
    )
    rows = cur.fetchall()
    for r in rows:
        split = r.get("margin_split_json") or {}
        if isinstance(split, str):
            import json
            split = json.loads(split)
        total = sum(float(v or 0) for v in split.values())
        warning = None
        if split and abs(total - 1.0) > 0.001:
            warning = f"Margin split totals {total:.2f}, expected 1.00"
        r["margin_split_json"] = split
        r["margin_split_warning"] = warning
    return rows


def _fetch_invoices(cur, env_id: str, engagement_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, engagement_id, period_date AS issued_date, due_date,
               paid_at, invoiced_at, amount, invoice_status AS status,
               invoice_number, notes, created_at,
               NULL::uuid AS revenue_stream_id
        FROM cro_revenue_schedule
        WHERE env_id = %s AND engagement_id = %s
          AND (is_revenue_stream = false OR invoice_status IN ('invoiced','paid','overdue','written_off'))
        ORDER BY created_at DESC
        """,
        (env_id, str(engagement_id)),
    )
    rows = cur.fetchall()
    today = date.today()
    for r in rows:
        paid_date = r.get("paid_at")
        if isinstance(paid_date, datetime):
            paid_date = paid_date.date()
        r["paid_date"] = paid_date
        is_overdue = (
            r["status"] != "paid"
            and r.get("due_date") is not None
            and r["due_date"] < today
        )
        r["is_overdue"] = is_overdue
        r["days_overdue"] = (
            (today - r["due_date"]).days if is_overdue else 0
        )
    return rows


def _fetch_attribution(cur, env_id: str, engagement_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, engagement_id, user_id, operator_name, role,
               credit_percentage, economics_percentage, notes,
               created_at, updated_at
        FROM cro_engagement_attribution
        WHERE env_id = %s AND engagement_id = %s
        ORDER BY created_at ASC
        """,
        (env_id, str(engagement_id)),
    )
    return cur.fetchall()


def _fetch_events(cur, env_id: str, engagement_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, engagement_id, event_type, event_date, actor_user_id,
               summary, metadata_json
        FROM cro_routing_event
        WHERE env_id = %s AND engagement_id = %s
        ORDER BY event_date DESC
        """,
        (env_id, str(engagement_id)),
    )
    rows = cur.fetchall()
    for r in rows:
        meta = r.get("metadata_json")
        if isinstance(meta, str):
            import json
            r["metadata_json"] = json.loads(meta)
        elif meta is None:
            r["metadata_json"] = {}
    return rows


def _compute_rollups(invoices: list[dict], revenue_streams: list[dict]) -> dict:
    billed = Decimal("0")
    collected = Decimal("0")
    contract_value = Decimal("0")

    for inv in invoices:
        amt = Decimal(str(inv.get("amount") or 0))
        if inv.get("status") in {"invoiced", "paid", "overdue", "sent"}:
            billed += amt
        if inv.get("status") == "paid":
            collected += amt

    for rs in revenue_streams:
        v = rs.get("total_contract_value")
        if v is not None:
            contract_value += Decimal(str(v))

    outstanding = billed - collected
    return {
        "billed": billed,
        "collected": collected,
        "outstanding": outstanding,
        "contract_value": contract_value,
    }


# ── Engagement CRUD ─────────────────────────────────────────────────────────


def create_engagement(
    *,
    env_id: str,
    business_id: UUID,
    payload: dict,
    actor_user_id: str | None = None,
) -> dict:
    routing_status = payload.get("routing_status") or "draft"
    if routing_status not in ROUTING_STATUSES:
        raise ValueError(f"Invalid routing_status: {routing_status}")

    if routing_status in {"active", "routing_review", "renewal_risk"}:
        if not payload.get("next_action_text") and not payload.get("next_action_task_id"):
            raise ValueError(
                "Active engagements require a next_action_text or next_action_task_id"
            )

    with get_cursor() as cur:
        crm_account_id, client_id = _ensure_client(
            cur,
            env_id=env_id,
            business_id=business_id,
            crm_account_id=(
                UUID(str(payload["crm_account_id"]))
                if payload.get("crm_account_id") else None
            ),
            client_name=payload["client_name"],
        )

        cur.execute(
            """
            INSERT INTO cro_engagement
              (env_id, business_id, client_id, name, engagement_type, status,
               routing_status, contracting_entity,
               originated_by_user_id, relationship_owner_user_id,
               delivery_owner_user_id, lead_source,
               start_date, end_date, notes,
               current_pain, what_winston_replaces, expected_roi_angle,
               marketing_permission_status,
               next_action_text, next_action_due_date,
               source_deal_id, client_name_override)
            VALUES (%s, %s, %s, %s, %s, 'planning',
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id), str(client_id),
                payload["name"],
                payload.get("engagement_type") or "other",
                routing_status,
                payload.get("contracting_entity") or NOVENDOR_ENTITY,
                payload.get("originated_by_user_id"),
                payload.get("relationship_owner_user_id"),
                payload.get("delivery_owner_user_id"),
                payload.get("lead_source"),
                payload.get("expected_start_date"),
                payload.get("expected_end_date"),
                payload.get("notes") or payload.get("description"),
                payload.get("current_pain"),
                payload.get("what_winston_replaces"),
                payload.get("expected_roi_angle"),
                payload.get("marketing_permission_status") or "unknown",
                payload.get("next_action_text"),
                payload.get("next_action_due_date"),
                str(payload["source_deal_id"]) if payload.get("source_deal_id") else None,
                (
                    payload.get("client_name")
                    if payload["client_name"] != (payload.get("client_name") or "")
                       and payload.get("crm_account_id") is None
                    else None
                ),
            ),
        )
        engagement_id = UUID(str(cur.fetchone()["id"]))

        if payload.get("next_action_text"):
            task_id = _create_next_action_task(
                cur,
                env_id=env_id,
                business_id=business_id,
                engagement_id=engagement_id,
                title=f"{payload['name']} — next action",
                why_now=f"Engagement {payload['name']} routing in '{routing_status}'",
                next_action=payload["next_action_text"],
                due_date=payload.get("next_action_due_date"),
            )
            cur.execute(
                "UPDATE cro_engagement SET next_action_task_id = %s WHERE id = %s",
                (str(task_id), str(engagement_id)),
            )

        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="created",
            actor_user_id=actor_user_id,
            summary=f"Engagement created: {payload['name']}",
            metadata={"contracting_entity": payload.get("contracting_entity") or NOVENDOR_ENTITY},
        )

    emit_log(
        level="info",
        service="backend",
        action="engagement_routing.created",
        message=f"Engagement created: {payload['name']}",
        context={"engagement_id": str(engagement_id)},
    )
    return get_engagement_detail(env_id=env_id, business_id=business_id, engagement_id=engagement_id)


def update_engagement(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    patch: dict,
    actor_user_id: str | None = None,
) -> dict:
    allowed = {
        "name", "contracting_entity", "originated_by_user_id",
        "relationship_owner_user_id", "delivery_owner_user_id",
        "lead_source", "routing_status", "engagement_type",
        "expected_start_date", "expected_end_date",
        "current_pain", "what_winston_replaces", "expected_roi_angle",
        "marketing_permission_status", "next_action_task_id",
        "next_action_text", "next_action_due_date", "notes",
        "client_name_override",
    }
    column_map = {
        "expected_start_date": "start_date",
        "expected_end_date": "end_date",
    }
    sets = []
    params: list = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        col = column_map.get(key, key)
        sets.append(f"{col} = %s")
        if isinstance(value, UUID):
            params.append(str(value))
        else:
            params.append(value)
    if not sets:
        return get_engagement_detail(env_id=env_id, business_id=business_id, engagement_id=engagement_id)
    sets.append("updated_at = now()")
    params.extend([env_id, str(engagement_id)])
    sql = f"""
        UPDATE cro_engagement
        SET {', '.join(sets)}
        WHERE env_id = %s AND id = %s
        RETURNING id, routing_status
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")

        if "routing_status" in patch and patch["routing_status"]:
            _log_event(
                cur,
                env_id=env_id,
                business_id=business_id,
                engagement_id=engagement_id,
                event_type="routing_status_changed",
                actor_user_id=actor_user_id,
                summary=f"Routing status set to {patch['routing_status']}",
            )

    return get_engagement_detail(env_id=env_id, business_id=business_id, engagement_id=engagement_id)


def get_engagement_detail(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_engagement_select_columns()}
            FROM cro_engagement e
            JOIN cro_client c ON c.id = e.client_id
            JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            WHERE e.env_id = %s AND e.business_id = %s AND e.id = %s
            """,
            (env_id, str(business_id), str(engagement_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")
        engagement = _engagement_from_row(row)

        contracts = _fetch_contracts(cur, env_id, engagement_id)
        revenue_streams = _fetch_revenue_streams(cur, env_id, engagement_id)
        invoices = _fetch_invoices(cur, env_id, engagement_id)
        attribution = _fetch_attribution(cur, env_id, engagement_id)
        events = _fetch_events(cur, env_id, engagement_id)

    health = calculate_routing_health(
        engagement=engagement,
        contracts=contracts,
        revenue_streams=revenue_streams,
        invoices=invoices,
        attribution=attribution,
    )
    rollups = _compute_rollups(invoices, revenue_streams)

    contract_status_summary = _summarize_contracts(contracts)
    attribution_status_summary = _summarize_attribution(attribution)

    list_item = {
        **engagement,
        "routing_health": health,
        "contract_status_summary": contract_status_summary,
        "attribution_status_summary": attribution_status_summary,
        "billed_amount": rollups["billed"],
        "collected_amount": rollups["collected"],
        "outstanding_amount": rollups["outstanding"],
        "contract_value": rollups["contract_value"],
    }

    return {
        "engagement": list_item,
        "contracts": contracts,
        "revenue_streams": revenue_streams,
        "invoices": invoices,
        "attribution": attribution,
        "events": events,
        "crm_account_id": engagement.get("crm_account_id"),
        "crm_account_name": engagement.get("crm_account_name"),
        "crm_contact_id": None,
        "source_deal_id": engagement.get("source_deal_id"),
        "description": engagement.get("description"),
        "current_pain": engagement.get("current_pain"),
        "what_winston_replaces": engagement.get("what_winston_replaces"),
        "expected_roi_angle": engagement.get("expected_roi_angle"),
        "marketing_permission_status": engagement.get("marketing_permission_status"),
        "notes": engagement.get("notes"),
        "recommended_next_actions": recommend_next_actions(
            health=health, engagement=engagement
        ),
    }


def _summarize_contracts(contracts: list[dict]) -> str | None:
    if not contracts:
        return "No contract"
    fully = [c for c in contracts if c.get("status") == "fully_signed"]
    if fully:
        return f"{len(fully)} fully signed"
    drafts = [c for c in contracts if c.get("status") == "draft"]
    if drafts:
        return "Draft only"
    return contracts[0].get("status")


def _summarize_attribution(attribution: list[dict]) -> str | None:
    if not attribution:
        return "Not defined"
    money_roles = {"originator", "seller", "relationship_owner",
                   "delivery_owner", "delivery_support", "partner"}
    econ_total = sum(
        float(a.get("economics_percentage") or 0)
        for a in attribution
        if a.get("role") in money_roles
    )
    if abs(econ_total - 1.0) <= 0.001:
        return "Economics 100%"
    if econ_total == 0:
        return f"{len(attribution)} roles, no economics"
    return f"Economics {econ_total*100:.0f}%"


def list_engagements(
    *,
    env_id: str,
    business_id: UUID,
    filters: dict | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    filters = filters or {}
    where = ["e.env_id = %s", "e.business_id = %s"]
    params: list = [env_id, str(business_id)]

    if filters.get("routing_status"):
        where.append("e.routing_status = %s")
        params.append(filters["routing_status"])
    if filters.get("contracting_entity"):
        where.append("e.contracting_entity = %s")
        params.append(filters["contracting_entity"])
    if filters.get("originator_user_id"):
        where.append("e.originated_by_user_id = %s")
        params.append(filters["originator_user_id"])
    if filters.get("relationship_owner_user_id"):
        where.append("e.relationship_owner_user_id = %s")
        params.append(filters["relationship_owner_user_id"])
    if filters.get("delivery_owner_user_id"):
        where.append("e.delivery_owner_user_id = %s")
        params.append(filters["delivery_owner_user_id"])
    if filters.get("client_name"):
        where.append("(a.name ILIKE %s OR e.client_name_override ILIKE %s)")
        like = f"%{filters['client_name']}%"
        params.extend([like, like])
    if filters.get("search"):
        where.append("(e.name ILIKE %s OR a.name ILIKE %s OR e.notes ILIKE %s)")
        like = f"%{filters['search']}%"
        params.extend([like, like, like])

    where_sql = " AND ".join(where)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM cro_engagement e
            JOIN cro_client c ON c.id = e.client_id
            JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            WHERE {where_sql}
            """,
            tuple(params),
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT {_engagement_select_columns()}
            FROM cro_engagement e
            JOIN cro_client c ON c.id = e.client_id
            JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            WHERE {where_sql}
            ORDER BY e.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [limit, offset]),
        )
        rows = cur.fetchall()

        items: list[dict] = []
        for row in rows:
            engagement = _engagement_from_row(row)
            engagement_id = UUID(str(engagement["id"]))
            contracts = _fetch_contracts(cur, env_id, engagement_id)
            revenue_streams = _fetch_revenue_streams(cur, env_id, engagement_id)
            invoices = _fetch_invoices(cur, env_id, engagement_id)
            attribution = _fetch_attribution(cur, env_id, engagement_id)
            health = calculate_routing_health(
                engagement=engagement,
                contracts=contracts,
                revenue_streams=revenue_streams,
                invoices=invoices,
                attribution=attribution,
            )
            if filters.get("routing_health_status") and health["routing_health_status"] != filters["routing_health_status"]:
                continue
            rollups = _compute_rollups(invoices, revenue_streams)
            items.append({
                **engagement,
                "routing_health": health,
                "contract_status_summary": _summarize_contracts(contracts),
                "attribution_status_summary": _summarize_attribution(attribution),
                "billed_amount": rollups["billed"],
                "collected_amount": rollups["collected"],
                "outstanding_amount": rollups["outstanding"],
                "contract_value": rollups["contract_value"],
            })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ── Contracts / revenue / invoices / attribution CRUD ───────────────────────


def add_contract(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    payload: dict,
    actor_user_id: str | None = None,
) -> dict:
    if payload["contract_type"] not in CONTRACT_TYPES:
        raise ValueError(f"Invalid contract_type: {payload['contract_type']}")
    status = payload.get("status") or "draft"
    if status not in CONTRACT_STATUSES:
        raise ValueError(f"Invalid contract status: {status}")

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_engagement_contract
              (env_id, business_id, engagement_id, contract_type, status,
               signed_by_client, signed_by_novendor,
               effective_date, expiration_date, file_url, file_storage_key,
               billing_terms, legal_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, engagement_id, contract_type, status,
                      signed_by_client, signed_by_novendor,
                      effective_date, expiration_date, file_url,
                      billing_terms, legal_notes, created_at, updated_at
            """,
            (
                env_id, str(business_id), str(engagement_id),
                payload["contract_type"], status,
                payload.get("signed_by_client", False),
                payload.get("signed_by_novendor", False),
                payload.get("effective_date"),
                payload.get("expiration_date"),
                payload.get("file_url"),
                payload.get("file_storage_key"),
                payload.get("billing_terms"),
                payload.get("legal_notes"),
            ),
        )
        row = cur.fetchone()
        row["is_fully_executed"] = (
            bool(row["signed_by_client"]) and bool(row["signed_by_novendor"])
        )
        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="contract_signed" if row["is_fully_executed"] else "contract_added",
            actor_user_id=actor_user_id,
            summary=f"{payload['contract_type']} {status}",
        )
    return row


def add_revenue_stream(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    payload: dict,
    actor_user_id: str | None = None,
) -> dict:
    if payload["revenue_type"] not in REVENUE_TYPES:
        raise ValueError(f"Invalid revenue_type: {payload['revenue_type']}")

    if not any(payload.get(k) is not None for k in
               ("total_contract_value", "hourly_rate", "retainer_amount")):
        raise ValueError(
            "Revenue stream must have at least one of total_contract_value, "
            "hourly_rate, or retainer_amount"
        )

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT client_id FROM cro_engagement WHERE env_id = %s AND id = %s
            """,
            (env_id, str(engagement_id)),
        )
        eng = cur.fetchone()
        if not eng:
            raise LookupError(f"Engagement {engagement_id} not found")
        client_id = eng["client_id"]

        amount = (
            payload.get("total_contract_value")
            or payload.get("retainer_amount")
            or (
                Decimal(str(payload["hourly_rate"])) * Decimal(str(payload.get("estimated_hours") or 0))
                if payload.get("hourly_rate") else Decimal("0")
            )
            or Decimal("0")
        )

        cur.execute(
            """
            INSERT INTO cro_revenue_schedule
              (env_id, business_id, engagement_id, client_id,
               period_date, amount, notes, revenue_type, hourly_rate,
               estimated_hours, retainer_amount, total_contract_value,
               billing_frequency, margin_split_json, start_date, end_date,
               revenue_notes, is_revenue_stream, invoice_status)
            VALUES (%s, %s, %s, %s,
                    COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s,
                    %s, %s, %s, %s, %s::jsonb, %s, %s, %s, true, 'scheduled')
            RETURNING id, engagement_id, revenue_type, total_contract_value,
                      hourly_rate, estimated_hours, retainer_amount,
                      billing_frequency, margin_split_json, start_date, end_date,
                      revenue_notes, created_at
            """,
            (
                env_id, str(business_id), str(engagement_id), str(client_id),
                payload.get("start_date"),
                str(amount),
                payload.get("revenue_notes"),
                payload["revenue_type"],
                str(payload["hourly_rate"]) if payload.get("hourly_rate") else None,
                str(payload["estimated_hours"]) if payload.get("estimated_hours") else None,
                str(payload["retainer_amount"]) if payload.get("retainer_amount") else None,
                str(payload["total_contract_value"]) if payload.get("total_contract_value") else None,
                payload.get("billing_frequency"),
                _jsonify(payload.get("margin_split_json") or {}),
                payload.get("start_date"),
                payload.get("end_date"),
                payload.get("revenue_notes"),
            ),
        )
        row = cur.fetchone()
        split = row.get("margin_split_json") or {}
        if isinstance(split, str):
            import json
            split = json.loads(split)
        total = sum(float(v or 0) for v in split.values())
        warning = None
        if split and abs(total - 1.0) > 0.001:
            warning = f"Margin split totals {total:.2f}, expected 1.00"
        row["margin_split_json"] = split
        row["margin_split_warning"] = warning

        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="revenue_defined",
            actor_user_id=actor_user_id,
            summary=f"Revenue stream defined: {payload['revenue_type']}",
        )
    return row


def add_invoice(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    payload: dict,
    actor_user_id: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT client_id FROM cro_engagement WHERE env_id = %s AND id = %s",
            (env_id, str(engagement_id)),
        )
        eng = cur.fetchone()
        if not eng:
            raise LookupError(f"Engagement {engagement_id} not found")
        client_id = eng["client_id"]

        cur.execute(
            """
            INSERT INTO cro_revenue_schedule
              (env_id, business_id, engagement_id, client_id,
               period_date, due_date, amount, invoice_number, notes,
               invoice_status, paid_at, is_revenue_stream)
            VALUES (%s, %s, %s, %s,
                    COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s,
                    %s, %s, false)
            RETURNING id, engagement_id, period_date AS issued_date, due_date,
                      amount, invoice_number, notes, invoice_status AS status,
                      paid_at, created_at
            """,
            (
                env_id, str(business_id), str(engagement_id), str(client_id),
                payload.get("issued_date"),
                payload.get("due_date"),
                str(payload["amount"]),
                payload.get("invoice_number"),
                payload.get("notes"),
                payload.get("status") or "draft",
                payload.get("paid_date"),
            ),
        )
        row = cur.fetchone()
        today = date.today()
        paid_date = row.get("paid_at")
        if isinstance(paid_date, datetime):
            paid_date = paid_date.date()
        row["paid_date"] = paid_date
        row["revenue_stream_id"] = None
        is_overdue = (
            row["status"] != "paid"
            and row.get("due_date") is not None
            and row["due_date"] < today
        )
        row["is_overdue"] = is_overdue
        row["days_overdue"] = (today - row["due_date"]).days if is_overdue else 0

        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="invoice_added",
            actor_user_id=actor_user_id,
            summary=f"Invoice {payload.get('invoice_number') or '(no number)'} for {payload['amount']}",
        )
    return row


def patch_invoice(
    *,
    env_id: str,
    invoice_id: UUID,
    patch: dict,
    actor_user_id: str | None = None,
) -> dict:
    sets = []
    params: list = []
    column_map = {
        "issued_date": "period_date",
        "paid_date": "paid_at",
        "status": "invoice_status",
    }
    for key, value in patch.items():
        if value is None:
            continue
        col = column_map.get(key, key)
        sets.append(f"{col} = %s")
        params.append(value)

    if patch.get("status") == "paid" and not patch.get("paid_date"):
        sets.append("paid_at = COALESCE(paid_at, now())")

    if not sets:
        raise ValueError("Empty invoice patch")

    sets.append("updated_at = now()")
    params.extend([env_id, str(invoice_id)])

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_revenue_schedule
            SET {', '.join(sets)}
            WHERE env_id = %s AND id = %s
            RETURNING id, engagement_id, period_date AS issued_date, due_date,
                      amount, invoice_number, notes, invoice_status AS status,
                      paid_at, created_at
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Invoice {invoice_id} not found")

        if patch.get("status") == "paid":
            _log_event(
                cur,
                env_id=env_id,
                business_id=UUID(str(_business_id_for_invoice(cur, row["id"]))),
                engagement_id=row["engagement_id"],
                event_type="invoice_paid",
                actor_user_id=actor_user_id,
                summary=f"Invoice {row.get('invoice_number') or row['id']} paid",
            )

    today = date.today()
    paid_date = row.get("paid_at")
    if isinstance(paid_date, datetime):
        paid_date = paid_date.date()
    row["paid_date"] = paid_date
    row["revenue_stream_id"] = None
    is_overdue = (
        row["status"] != "paid"
        and row.get("due_date") is not None
        and row["due_date"] < today
    )
    row["is_overdue"] = is_overdue
    row["days_overdue"] = (today - row["due_date"]).days if is_overdue else 0
    return row


def _business_id_for_invoice(cur, invoice_id) -> str:
    cur.execute(
        "SELECT business_id FROM cro_revenue_schedule WHERE id = %s",
        (str(invoice_id),),
    )
    return cur.fetchone()["business_id"]


def add_attribution(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    payload: dict,
    actor_user_id: str | None = None,
) -> dict:
    if payload["role"] not in ATTRIBUTION_ROLES:
        raise ValueError(f"Invalid attribution role: {payload['role']}")
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_engagement_attribution
              (env_id, business_id, engagement_id, user_id, operator_name,
               role, credit_percentage, economics_percentage, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, engagement_id, user_id, operator_name, role,
                      credit_percentage, economics_percentage, notes,
                      created_at, updated_at
            """,
            (
                env_id, str(business_id), str(engagement_id),
                payload.get("user_id"), payload.get("operator_name"),
                payload["role"],
                str(payload["credit_percentage"]) if payload.get("credit_percentage") is not None else None,
                str(payload["economics_percentage"]) if payload.get("economics_percentage") is not None else None,
                payload.get("notes"),
            ),
        )
        row = cur.fetchone()
        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="attribution_changed",
            actor_user_id=actor_user_id,
            summary=f"Attribution: {payload.get('operator_name') or payload.get('user_id')} as {payload['role']}",
        )
    return row


def patch_attribution(
    *,
    env_id: str,
    attribution_id: UUID,
    patch: dict,
) -> dict:
    sets = []
    params: list = []
    for key in ("operator_name", "role", "credit_percentage",
                "economics_percentage", "notes"):
        if key in patch and patch[key] is not None:
            sets.append(f"{key} = %s")
            params.append(
                str(patch[key]) if key in ("credit_percentage", "economics_percentage")
                else patch[key]
            )
    if not sets:
        raise ValueError("Empty attribution patch")
    sets.append("updated_at = now()")
    params.extend([env_id, str(attribution_id)])
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_engagement_attribution
            SET {', '.join(sets)}
            WHERE env_id = %s AND id = %s
            RETURNING id, engagement_id, user_id, operator_name, role,
                      credit_percentage, economics_percentage, notes,
                      created_at, updated_at
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Attribution {attribution_id} not found")
    return row


# ── Convert / dashboard / from-deal ─────────────────────────────────────────


def convert_to_novendor(
    *,
    env_id: str,
    business_id: UUID,
    engagement_id: UUID,
    create_next_action_task: bool = True,
    actor_user_id: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_engagement
            SET contracting_entity = %s,
                routing_status = 'routing_review',
                updated_at = now()
            WHERE env_id = %s AND id = %s
            RETURNING id, name
            """,
            (NOVENDOR_ENTITY, env_id, str(engagement_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")

        if create_next_action_task:
            task_id = _create_next_action_task(
                cur,
                env_id=env_id,
                business_id=business_id,
                engagement_id=engagement_id,
                title=f"{row['name']} — confirm Novendor contracting",
                why_now="Engagement was just routed to Novendor; contract path needs to be confirmed",
                next_action="Confirm Novendor contracting path",
            )
            cur.execute(
                "UPDATE cro_engagement SET next_action_task_id = %s, next_action_text = %s WHERE id = %s",
                (str(task_id), "Confirm Novendor contracting path", str(engagement_id)),
            )

        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=engagement_id,
            event_type="routing_status_changed",
            actor_user_id=actor_user_id,
            summary="Converted to Novendor routing",
        )

    return get_engagement_detail(env_id=env_id, business_id=business_id, engagement_id=engagement_id)


def preview_deal_conversion(
    *,
    env_id: str,
    business_id: UUID,
    deal_id: UUID,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id AS source_deal_id, o.name AS deal_name,
                   o.crm_account_id, a.name AS crm_account_name,
                   o.primary_contact_id AS crm_contact_id,
                   o.owner_actor_id::text AS owner_user_id
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            WHERE o.crm_opportunity_id = %s AND o.business_id = %s
            """,
            (str(deal_id), str(business_id)),
        )
        deal = cur.fetchone()
        if not deal:
            raise LookupError(f"Deal {deal_id} not found")

        # Pull pain / ROI hints from cro_lead_profile if it exists for this account.
        pain = None
        roi = None
        if deal.get("crm_account_id"):
            cur.execute(
                """
                SELECT pain_category, ai_maturity
                FROM cro_lead_profile
                WHERE crm_account_id = %s AND env_id = %s
                LIMIT 1
                """,
                (str(deal["crm_account_id"]), env_id),
            )
            lead = cur.fetchone()
            if lead:
                pain = lead.get("pain_category")

    return {
        "source_deal_id": deal["source_deal_id"],
        "deal_name": deal["deal_name"],
        "crm_account_id": deal.get("crm_account_id"),
        "crm_account_name": deal.get("crm_account_name"),
        "crm_contact_id": deal.get("crm_contact_id"),
        "suggested_engagement_name": deal["deal_name"],
        "suggested_client_name": deal.get("crm_account_name") or deal["deal_name"],
        "suggested_contracting_entity": NOVENDOR_ENTITY,
        "suggested_routing_status": "routing_review",
        "suggested_originator_user_id": deal.get("owner_user_id"),
        "suggested_current_pain": pain,
        "suggested_expected_roi_angle": roi,
    }


def convert_deal_to_engagement(
    *,
    env_id: str,
    business_id: UUID,
    deal_id: UUID,
    body: dict,
    actor_user_id: str | None = None,
) -> dict:
    preview = preview_deal_conversion(
        env_id=env_id, business_id=business_id, deal_id=deal_id
    )
    payload = {
        "name": preview["suggested_engagement_name"],
        "client_name": preview["suggested_client_name"],
        "crm_account_id": preview.get("crm_account_id"),
        "crm_contact_id": preview.get("crm_contact_id"),
        "source_deal_id": deal_id,
        "contracting_entity": preview["suggested_contracting_entity"],
        "routing_status": preview["suggested_routing_status"],
        "originated_by_user_id": (
            body.get("originated_by_user_id") or preview.get("suggested_originator_user_id")
        ),
        "relationship_owner_user_id": body.get("relationship_owner_user_id"),
        "delivery_owner_user_id": body.get("delivery_owner_user_id"),
        "current_pain": preview.get("suggested_current_pain"),
        "expected_roi_angle": preview.get("suggested_expected_roi_angle"),
        "next_action_text": (
            body.get("next_action_text")
            if body.get("create_next_action_task", True)
            else None
        ),
    }
    detail = create_engagement(
        env_id=env_id,
        business_id=business_id,
        payload=payload,
        actor_user_id=actor_user_id,
    )

    with get_cursor() as cur:
        _log_event(
            cur,
            env_id=env_id,
            business_id=business_id,
            engagement_id=UUID(str(detail["engagement"]["id"])),
            event_type="converted_from_deal",
            actor_user_id=actor_user_id,
            summary=f"Converted from deal {preview['deal_name']}",
            metadata={"source_deal_id": str(deal_id)},
        )

    return detail


def get_dashboard(
    *,
    env_id: str,
    business_id: UUID,
) -> dict:
    listing = list_engagements(
        env_id=env_id,
        business_id=business_id,
        filters=None,
        limit=500,
        offset=0,
    )
    items = listing["items"]

    counts = {"green": 0, "yellow": 0, "red": 0}
    total_contract = Decimal("0")
    total_billed = Decimal("0")
    total_collected = Decimal("0")
    total_outstanding = Decimal("0")
    non_compounding_revenue = Decimal("0")
    personal_count = 0
    missing_contracts = 0
    missing_revenue = 0
    missing_attribution = 0
    next_due_today = 0
    next_overdue = 0
    today = date.today()

    by_originator: dict[str, dict] = {}
    by_relationship: dict[str, dict] = {}
    by_delivery: dict[str, dict] = {}
    by_client: dict[str, dict] = {}

    not_yet_routable: list[dict] = []

    for it in items:
        health = it["routing_health"]
        counts[health["routing_health_status"]] += 1
        total_contract += Decimal(str(it["contract_value"] or 0))
        total_billed += Decimal(str(it["billed_amount"] or 0))
        total_collected += Decimal(str(it["collected_amount"] or 0))
        total_outstanding += Decimal(str(it["outstanding_amount"] or 0))
        if health["personal_risk"]:
            non_compounding_revenue += Decimal(str(it["contract_value"] or 0))
            personal_count += 1

        reasons = set(health["routing_health_reasons"])
        if "Missing signed contract" in reasons or "No signed contract attached" in reasons:
            missing_contracts += 1
        if "Revenue structure missing" in reasons:
            missing_revenue += 1
        if "Economics split missing" in reasons:
            missing_attribution += 1

        if it.get("next_action_due_date"):
            if it["next_action_due_date"] == today:
                next_due_today += 1
            elif it["next_action_due_date"] < today:
                next_overdue += 1

        for bucket, key, label_key in (
            (by_originator, it.get("originated_by_user_id"), "originated_by_user_id"),
            (by_relationship, it.get("relationship_owner_user_id"), "relationship_owner_user_id"),
            (by_delivery, it.get("delivery_owner_user_id"), "delivery_owner_user_id"),
        ):
            if key:
                e = bucket.setdefault(key, {
                    "user_id": key, "operator_name": key,
                    "contract_value": Decimal("0"),
                    "billed": Decimal("0"),
                    "collected": Decimal("0"),
                })
                e["contract_value"] += Decimal(str(it["contract_value"] or 0))
                e["billed"] += Decimal(str(it["billed_amount"] or 0))
                e["collected"] += Decimal(str(it["collected_amount"] or 0))

        c = by_client.setdefault(it["client_name"], {
            "client_name": it["client_name"],
            "contract_value": Decimal("0"),
            "billed": Decimal("0"),
            "collected": Decimal("0"),
        })
        c["contract_value"] += Decimal(str(it["contract_value"] or 0))
        c["billed"] += Decimal(str(it["billed_amount"] or 0))
        c["collected"] += Decimal(str(it["collected_amount"] or 0))

        if (
            health["routing_health_status"] != "green"
            or health["personal_risk"]
        ):
            not_yet_routable.append({
                "engagement_id": it["id"],
                "name": it["name"],
                "client_name": it["client_name"],
                "contracting_entity": it["contracting_entity"],
                "contract_value": Decimal(str(it["contract_value"] or 0)),
                "routing_health_status": health["routing_health_status"],
                "reasons": health["routing_health_reasons"],
            })

    total = max(len(items), 1)
    percent_routed = round((counts["green"] / total) * 100.0, 1)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE invoice_status IN ('invoiced','overdue','sent')) AS unpaid,
              COUNT(*) FILTER (
                WHERE invoice_status <> 'paid'
                  AND due_date IS NOT NULL
                  AND due_date < CURRENT_DATE
              ) AS overdue
            FROM cro_revenue_schedule
            WHERE env_id = %s AND business_id = %s
            """,
            (env_id, str(business_id)),
        )
        invoice_counts = cur.fetchone() or {"unpaid": 0, "overdue": 0}

    return {
        "total_contract_value": total_contract,
        "total_billed": total_billed,
        "total_collected": total_collected,
        "total_outstanding": total_outstanding,
        "revenue_by_originator": list(by_originator.values()),
        "revenue_by_relationship_owner": list(by_relationship.values()),
        "revenue_by_delivery_owner": list(by_delivery.values()),
        "revenue_by_client": list(by_client.values()),
        "count_by_routing_health": counts,
        "percent_properly_routed": percent_routed,
        "personal_deal_count": personal_count,
        "non_compounding_revenue_amount": non_compounding_revenue,
        "unpaid_invoice_count": int(invoice_counts.get("unpaid") or 0),
        "overdue_invoice_count": int(invoice_counts.get("overdue") or 0),
        "engagements_missing_contracts": missing_contracts,
        "engagements_missing_revenue": missing_revenue,
        "engagements_missing_attribution": missing_attribution,
        "next_actions_due_today": next_due_today,
        "next_actions_overdue": next_overdue,
        "revenue_not_yet_routable": not_yet_routable,
    }
