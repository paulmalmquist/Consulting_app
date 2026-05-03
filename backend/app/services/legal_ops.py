from __future__ import annotations

import json as _json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(value).quantize(Decimal("0.000000000001"))


def list_matters(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_matter(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_matters
            (env_id, business_id, matter_number, title, matter_type, related_entity_type, related_entity_id,
             counterparty, outside_counsel, internal_owner, risk_level, budget_amount, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), payload["matter_number"], payload["title"], payload["matter_type"],
                payload.get("related_entity_type"), str(payload["related_entity_id"]) if payload.get("related_entity_id") else None,
                payload.get("counterparty"), payload.get("outside_counsel"), payload.get("internal_owner"), payload.get("risk_level") or "medium",
                _q(payload.get("budget_amount")), payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def get_matter(*, env_id: UUID, business_id: UUID, matter_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND matter_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(matter_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Matter not found")
        return row


def create_contract(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_contracts
            (env_id, business_id, matter_id, contract_ref, contract_type, counterparty_name, effective_date,
             expiration_date, governing_law, auto_renew, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["contract_ref"], payload["contract_type"], payload.get("counterparty_name"),
                payload.get("effective_date"), payload.get("expiration_date"), payload.get("governing_law"), bool(payload.get("auto_renew", False)),
                payload.get("status") or "draft", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_deadline(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_deadlines
            (env_id, business_id, matter_id, deadline_type, due_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["deadline_type"], payload["due_date"],
                payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_approval(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_approvals
            (env_id, business_id, matter_id, approval_type, approver, status, approved_at, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s,
                    CASE WHEN %s = 'approved' THEN now() ELSE NULL END,
                    %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["approval_type"], payload.get("approver"),
                payload.get("status") or "pending", payload.get("status") or "pending", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_spend_entry(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_spend_entries
            (env_id, business_id, matter_id, outside_counsel, invoice_ref, amount, incurred_date, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload.get("outside_counsel"), payload.get("invoice_ref"),
                _q(payload["amount"]), payload.get("incurred_date"), payload.get("created_by"), payload.get("created_by")
            ),
        )
        entry = cur.fetchone()
        cur.execute(
            """
            UPDATE legal_matters
            SET actual_spend = actual_spend + %s,
                updated_by = %s,
                updated_at = now()
            WHERE matter_id = %s::uuid
            """,
            (_q(payload["amount"]), payload.get("created_by"), str(matter_id)),
        )
        return entry


# ── Expansion service functions ──────────────────────────────────────────────

def get_dashboard_summary(*, env_id: UUID, business_id: UUID) -> dict:
    from datetime import timedelta
    today = date.today()
    window_30d = today + timedelta(days=30)

    with get_cursor() as cur:
        # Open matters count + risk breakdown + budget/spend
        cur.execute(
            """
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) AS high_risk,
              COALESCE(SUM(actual_spend), 0) AS total_spend,
              COALESCE(SUM(budget_amount), 0) AS total_budget
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND status = 'open'
            """,
            (str(env_id), str(business_id)),
        )
        matter_row = cur.fetchone() or {}

        # Contracts pending review + expiring soon
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN status IN ('draft','review','negotiation') THEN 1 ELSE 0 END) AS pending_review,
              SUM(CASE WHEN expiration_date <= %s AND status = 'executed' THEN 1 ELSE 0 END) AS expiring_soon
            FROM legal_contracts
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            """,
            (window_30d, str(env_id), str(business_id)),
        )
        contract_row = cur.fetchone() or {}

        # Regulatory deadlines next 30 days
        cur.execute(
            """
            SELECT COUNT(*) AS upcoming_regulatory
            FROM legal_regulatory_items
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND status = 'open'
              AND deadline BETWEEN %s AND %s
            """,
            (str(env_id), str(business_id), today, window_30d),
        )
        reg_row = cur.fetchone() or {}

        # Litigation exposure total
        cur.execute(
            """
            SELECT COALESCE(SUM(lc.exposure_estimate), 0) AS total_exposure
            FROM legal_litigation_cases lc
            JOIN legal_matters m ON m.matter_id = lc.matter_id
            WHERE m.env_id = %s::uuid AND m.business_id = %s::uuid AND lc.status = 'open'
            """,
            (str(env_id), str(business_id)),
        )
        lit_row = cur.fetchone() or {}

        # Contract pipeline stage counts
        cur.execute(
            """
            SELECT status, COUNT(*) AS cnt
            FROM legal_contracts
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            GROUP BY status
            """,
            (str(env_id), str(business_id)),
        )
        stage_rows = cur.fetchall()

        # High risk matters (risk radar)
        cur.execute(
            """
            SELECT matter_id, matter_number, title, matter_type, risk_level,
                   actual_spend, internal_owner, status
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND risk_level = 'high'
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (str(env_id), str(business_id)),
        )
        risk_radar = cur.fetchall()

        # Upcoming deadlines (next 30 days)
        cur.execute(
            """
            SELECT d.deadline_id, d.deadline_type, d.due_date, d.status,
                   m.matter_number, m.title
            FROM legal_deadlines d
            JOIN legal_matters m ON m.matter_id = d.matter_id
            WHERE m.env_id = %s::uuid AND m.business_id = %s::uuid
              AND d.due_date BETWEEN %s AND %s
              AND d.status = 'open'
            ORDER BY d.due_date ASC
            LIMIT 10
            """,
            (str(env_id), str(business_id), today, window_30d),
        )
        deadlines = cur.fetchall()

        # Governance alerts (pending items)
        cur.execute(
            """
            SELECT governance_item_id, item_type, title, scheduled_date, status, owner, entity_name
            FROM legal_governance_items
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND status = 'pending'
            ORDER BY scheduled_date ASC NULLS LAST
            LIMIT 5
            """,
            (str(env_id), str(business_id)),
        )
        governance_alerts = cur.fetchall()

    pipeline: dict[str, int] = {}
    for r in stage_rows:
        pipeline[str(r["status"])] = int(r["cnt"])

    def _dec(v: object) -> str:
        return str(_q(v))  # type: ignore[arg-type]

    def _int(v: object) -> int:
        try:
            return int(v or 0)
        except (TypeError, ValueError):
            return 0

    return {
        "kpis": {
            "open_matters": _int(matter_row.get("total")),
            "high_risk_matters": _int(matter_row.get("high_risk")),
            "litigation_exposure": _dec(lit_row.get("total_exposure")),
            "contracts_pending_review": _int(contract_row.get("pending_review")),
            "contracts_expiring_soon": _int(contract_row.get("expiring_soon")),
            "regulatory_deadlines_30d": _int(reg_row.get("upcoming_regulatory")),
            "outside_counsel_spend_ytd": _dec(matter_row.get("total_spend")),
            "total_budget": _dec(matter_row.get("total_budget")),
        },
        "risk_radar": [dict(r) for r in risk_radar],
        "contract_pipeline": pipeline,
        "upcoming_deadlines": [dict(d) for d in deadlines],
        "spend_summary": {
            "ytd_spend": _dec(matter_row.get("total_spend")),
            "ytd_budget": _dec(matter_row.get("total_budget")),
        },
        "governance_alerts": [dict(g) for g in governance_alerts],
    }


def list_firms(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT f.*,
                   COUNT(DISTINCT m.matter_id) AS matter_count,
                   COALESCE(SUM(s.amount), 0) AS ytd_spend
            FROM legal_law_firms f
            LEFT JOIN legal_matters m
              ON m.outside_counsel = f.firm_name
             AND m.env_id = f.env_id AND m.business_id = f.business_id
            LEFT JOIN legal_spend_entries s
              ON s.outside_counsel = f.firm_name
             AND s.env_id = f.env_id AND s.business_id = f.business_id
            WHERE f.env_id = %s::uuid AND f.business_id = %s::uuid
            GROUP BY f.firm_id
            ORDER BY ytd_spend DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_firm(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_law_firms
            (env_id, business_id, firm_name, primary_contact, contact_email,
             contact_phone, billing_rates_json, specialties, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), payload["firm_name"],
                payload.get("primary_contact"), payload.get("contact_email"),
                payload.get("contact_phone"),
                _json.dumps(payload.get("billing_rates_json") or {}),
                payload.get("specialties") or [],
                payload.get("status") or "active",
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        row = dict(cur.fetchone())
        row["matter_count"] = 0
        row["ytd_spend"] = Decimal("0")
        return row


def list_contracts(*, env_id: UUID, business_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        sql = """
            SELECT * FROM legal_contracts
            WHERE env_id = %s::uuid AND business_id = %s::uuid
        """
        params: list = [str(env_id), str(business_id)]
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def list_regulatory(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM legal_regulatory_items
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY deadline ASC NULLS LAST
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def list_governance(*, env_id: UUID, business_id: UUID, item_type: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        sql = """
            SELECT * FROM legal_governance_items
            WHERE env_id = %s::uuid AND business_id = %s::uuid
        """
        params: list = [str(env_id), str(business_id)]
        if item_type:
            sql += " AND item_type = %s"
            params.append(item_type)
        sql += " ORDER BY scheduled_date ASC NULLS LAST"
        cur.execute(sql, params)
        return cur.fetchall()


def list_spend_entries(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.*, m.matter_number, m.title AS matter_title
            FROM legal_spend_entries s
            JOIN legal_matters m ON m.matter_id = s.matter_id
            WHERE s.env_id = %s::uuid AND s.business_id = %s::uuid
            ORDER BY s.incurred_date DESC NULLS LAST
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def list_litigation_cases(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT lc.*, m.matter_number, m.title AS matter_title
            FROM legal_litigation_cases lc
            JOIN legal_matters m ON m.matter_id = lc.matter_id
            WHERE m.env_id = %s::uuid AND m.business_id = %s::uuid
            ORDER BY lc.exposure_estimate DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT matter_id FROM legal_matters WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchone()
        if existing:
            return {"seeded": False, "matter_ids": [str(existing["matter_id"])]}

    matter_a = create_matter(
        env_id=env_id,
        business_id=business_id,
        payload={
            "matter_number": "LEG-2001",
            "title": "Main Street Acquisition PSA",
            "matter_type": "Acquisition",
            "counterparty": "Cedar Holdings",
            "outside_counsel": "Foster & Bell LLP",
            "internal_owner": "General Counsel",
            "risk_level": "high",
            "budget_amount": Decimal("240000"),
            "status": "open",
            "created_by": actor,
        },
    )
    mid_a = UUID(str(matter_a["matter_id"]))
    create_contract(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={
            "contract_ref": "PSA-2026-014",
            "contract_type": "PSA",
            "counterparty_name": "Cedar Holdings",
            "effective_date": date.today(),
            "governing_law": "NY",
            "auto_renew": False,
            "status": "negotiation",
            "created_by": actor,
        },
    )
    create_deadline(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={"deadline_type": "Closing", "due_date": date.today(), "status": "open", "created_by": actor},
    )
    create_approval(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={"approval_type": "Signature Authority", "approver": "CFO", "status": "pending", "created_by": actor},
    )

    matter_b = create_matter(
        env_id=env_id,
        business_id=business_id,
        payload={
            "matter_number": "LEG-2002",
            "title": "Vendor MSA Renewal",
            "matter_type": "Vendor",
            "counterparty": "Prime Build Co",
            "outside_counsel": "In-house",
            "internal_owner": "Deputy GC",
            "risk_level": "medium",
            "budget_amount": Decimal("40000"),
            "status": "open",
            "created_by": actor,
        },
    )
    mid_b = UUID(str(matter_b["matter_id"]))
    create_spend_entry(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_b,
        payload={"outside_counsel": "In-house", "invoice_ref": "INT-001", "amount": Decimal("8500"), "incurred_date": date.today(), "created_by": actor},
    )

    # Seed litigation case on matter A
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_litigation_cases
            (env_id, business_id, matter_id, jurisdiction, claims, exposure_estimate, reserve_amount, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (str(env_id), str(business_id), str(mid_a), "New York Supreme Court",
             "Breach of purchase agreement", Decimal("3400000"), Decimal("500000"), "open", actor, actor),
        )

    # Seed law firms
    for firm in [
        {"firm_name": "Foster & Bell LLP", "primary_contact": "James Foster", "contact_email": "jfoster@fosterbell.com",
         "specialties": ["Real Estate", "M&A"], "status": "active"},
        {"firm_name": "Marcus & Chen LLP", "primary_contact": "Linda Chen", "contact_email": "lchen@marcuschen.com",
         "specialties": ["Employment", "Litigation"], "status": "active"},
    ]:
        try:
            create_firm(env_id=env_id, business_id=business_id, payload={**firm, "created_by": actor})
        except Exception:
            pass  # already exists

    # Seed regulatory items
    with get_cursor() as cur:
        for item in [
            {"agency": "SEC", "regulation_ref": "Form 10-K", "obligation_text": "Annual report filing",
             "deadline": "2026-04-15", "owner": "General Counsel", "status": "open"},
            {"agency": "EPA", "regulation_ref": "40 CFR 122", "obligation_text": "Annual environmental compliance certification",
             "deadline": "2026-03-31", "owner": "Legal Ops", "status": "open"},
            {"agency": "OSHA", "regulation_ref": "29 CFR 1904", "obligation_text": "Annual injury/illness reporting (OSHA 300A)",
             "deadline": "2026-03-02", "owner": "HR Legal", "status": "open"},
        ]:
            cur.execute(
                """
                INSERT INTO legal_regulatory_items
                (env_id, business_id, agency, regulation_ref, obligation_text, deadline, owner, status, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (str(env_id), str(business_id), item["agency"], item.get("regulation_ref"),
                 item["obligation_text"], item.get("deadline"), item.get("owner"),
                 item.get("status", "open"), actor, actor),
            )

    # Seed governance items
    with get_cursor() as cur:
        for gov in [
            {"item_type": "board_meeting", "title": "Q1 Board of Directors Meeting",
             "scheduled_date": "2026-04-10", "status": "pending", "owner": "Corporate Secretary"},
            {"item_type": "resolution", "title": "Annual Shareholder Resolution — Dividend Authorization",
             "scheduled_date": "2026-05-01", "status": "pending", "owner": "General Counsel"},
        ]:
            cur.execute(
                """
                INSERT INTO legal_governance_items
                (env_id, business_id, item_type, title, scheduled_date, status, owner, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (str(env_id), str(business_id), gov["item_type"], gov["title"],
                 gov.get("scheduled_date"), gov.get("status", "pending"),
                 gov.get("owner"), actor, actor),
            )

    return {"seeded": True, "matter_ids": [str(mid_a), str(mid_b)]}


# ── Phase 1: Knowledge Base + Legal Memory CRUD ─────────────────────────────
# Tables provisioned in 539_legal_ops_brain.sql.
# Buyer-facing names: Playbooks, Clauses, Approval Rules, Approver Registry,
# Legal Memory (prior decisions), Policy Sources.
#
# Tenant isolation: every query filters by env_id + business_id. Matches the
# existing legal_* WHERE-clause style. No RLS on legal tables.


# ── Playbooks ───────────────────────────────────────────────────────────────

def list_playbooks(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_playbooks
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY contract_type, name, version_no DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall() or []


def create_playbook(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_playbooks
            (env_id, business_id, name, contract_type, jurisdiction, owner, status,
             effective_from, effective_to, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                payload["name"], payload["contract_type"],
                payload.get("jurisdiction"), payload.get("owner"),
                payload.get("status") or "active",
                payload.get("effective_from"), payload.get("effective_to"),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def list_playbook_positions(*, env_id: UUID, business_id: UUID, playbook_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_playbook_positions
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND playbook_id = %s::uuid
            ORDER BY clause_label
            """,
            (str(env_id), str(business_id), str(playbook_id)),
        )
        return cur.fetchall() or []


def create_playbook_position(
    *, env_id: UUID, business_id: UUID, playbook_id: UUID, payload: dict
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_playbook_positions
            (env_id, business_id, playbook_id, clause_key, clause_label,
             preferred_text, fallback_text, deal_breaker_text,
             sample_external_comment, internal_escalation_note,
             approval_required_if, severity, source_reference,
             created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s,
                    %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(playbook_id),
                payload["clause_key"], payload["clause_label"],
                payload.get("preferred_text"), payload.get("fallback_text"),
                payload.get("deal_breaker_text"),
                payload.get("sample_external_comment"),
                payload.get("internal_escalation_note"),
                _json.dumps(payload.get("approval_required_if") or {}),
                payload.get("severity") or "medium",
                payload.get("source_reference"),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Clause library ──────────────────────────────────────────────────────────

def list_clauses(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_clause_library
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY clause_label
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall() or []


def create_clause(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_clause_library
            (env_id, business_id, clause_key, clause_label, canonical_text,
             tags_json, jurisdiction, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                payload["clause_key"], payload["clause_label"],
                payload.get("canonical_text"),
                _json.dumps(payload.get("tags_json") or []),
                payload.get("jurisdiction"),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Approval rules ──────────────────────────────────────────────────────────

def list_approval_rules(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_approval_rules
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY rule_name
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall() or []


def create_approval_rule(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_approval_rules
            (env_id, business_id, rule_name, contract_type, trigger_json,
             required_approver, escalation_level, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                payload["rule_name"], payload.get("contract_type"),
                _json.dumps(payload.get("trigger_json") or {}),
                payload["required_approver"],
                payload.get("escalation_level") or "standard",
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Approver registry (default ApproverRegistryAdapter backing) ─────────────

def list_approvers(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_approver_registry
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY role_label
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall() or []


def create_approver(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_approver_registry
            (env_id, business_id, role_label, person_name, contact, scope_json,
             created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                payload["role_label"], payload.get("person_name"),
                payload.get("contact"),
                _json.dumps(payload.get("scope_json") or {}),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Legal Memory (prior decisions) ──────────────────────────────────────────

def list_prior_decisions(
    *, env_id: UUID, business_id: UUID,
    contract_type: str | None = None, clause_key: str | None = None,
) -> list[dict]:
    sql = (
        "SELECT * FROM legal_prior_decisions "
        "WHERE env_id = %s::uuid AND business_id = %s::uuid"
    )
    params: list = [str(env_id), str(business_id)]
    if contract_type:
        sql += " AND contract_type = %s"
        params.append(contract_type)
    if clause_key:
        sql += " AND clause_key = %s"
        params.append(clause_key)
    sql += " ORDER BY decided_at DESC NULLS LAST, created_at DESC"
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() or []


def create_prior_decision(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_prior_decisions
            (env_id, business_id, matter_id, contract_type, clause_key,
             accepted_text, rejected_text, decided_by, decided_at, rationale,
             attorney_disposition_id, outside_counsel_guidance,
             created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                str(payload["matter_id"]) if payload.get("matter_id") else None,
                payload.get("contract_type"), payload.get("clause_key"),
                payload.get("accepted_text"), payload.get("rejected_text"),
                payload.get("decided_by"), payload.get("decided_at"),
                payload.get("rationale"),
                str(payload["attorney_disposition_id"])
                if payload.get("attorney_disposition_id") else None,
                payload.get("outside_counsel_guidance"),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Policy sources ──────────────────────────────────────────────────────────

def list_policy_sources(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_policy_sources
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY title
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall() or []


def create_policy_source(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_policy_sources
            (env_id, business_id, title, source_url, document_id,
             effective_from, version_history, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id),
                payload["title"], payload.get("source_url"),
                str(payload["document_id"]) if payload.get("document_id") else None,
                payload.get("effective_from"),
                _json.dumps(payload.get("version_history") or []),
                payload.get("created_by"), payload.get("created_by"),
            ),
        )
        return cur.fetchone()


# ── Phase 1: KB demo seed ───────────────────────────────────────────────────
# Idempotent seeder for the knowledge-base / Legal Memory side. Called by
# seed_kb_demo via POST /seed-kb. Separate from seed_demo_workspace so the
# Phase 1 demo doesn't depend on Phase 2-6 work being landed.

def seed_kb_demo(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    """Seed Phase 1 KB content: 3 playbooks (NDA / MSA / DPA), positions,
    clause library, approval rules, approver registry, prior decisions
    (Legal Memory), and policy sources. Idempotent — checks for existing
    rows first.
    """
    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM legal_playbooks WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        if cur.fetchone():
            return {"seeded": False, "reason": "already_seeded"}

    # Approver registry — default ApproverRegistryAdapter backing
    for app_row in [
        {"role_label": "General Counsel", "person_name": "Jordan Pelletier", "contact": "gc@example.com",
         "scope_json": {"actions": ["approve", "escalate", "close"], "max_liability": "uncapped"}},
        {"role_label": "Deputy General Counsel", "person_name": "Marisa Allen", "contact": "deputygc@example.com",
         "scope_json": {"actions": ["approve", "revise", "request_info"], "max_liability": 5_000_000}},
        {"role_label": "CFO", "person_name": "Wen Hu", "contact": "cfo@example.com",
         "scope_json": {"actions": ["approve"], "scope": "financial_terms"}},
        {"role_label": "Privacy Officer", "person_name": "Ana Velez", "contact": "privacy@example.com",
         "scope_json": {"actions": ["approve", "request_info"], "scope": "data_protection"}},
        {"role_label": "Legal Ops Lead", "person_name": "Theo Kapur", "contact": "legalops@example.com",
         "scope_json": {"actions": ["request_info"], "scope": "intake_routing"}},
        {"role_label": "Information Security", "person_name": "Sara Quinn", "contact": "infosec@example.com",
         "scope_json": {"actions": ["approve", "request_info"], "scope": "infosec"}},
        {"role_label": "VP Sales", "person_name": "Devon Park", "contact": "vp-sales@example.com",
         "scope_json": {"actions": ["approve"], "scope": "commercial_terms"}},
        {"role_label": "Procurement", "person_name": "Lila Mehta", "contact": "procurement@example.com",
         "scope_json": {"actions": ["approve"], "scope": "vendor_terms"}},
    ]:
        create_approver(env_id=env_id, business_id=business_id, payload={**app_row, "created_by": actor})

    # Playbooks: NDA / MSA / DPA
    nda = create_playbook(env_id=env_id, business_id=business_id, payload={
        "name": "Mutual NDA", "contract_type": "NDA", "jurisdiction": "US",
        "owner": "General Counsel", "status": "active", "created_by": actor,
    })
    msa = create_playbook(env_id=env_id, business_id=business_id, payload={
        "name": "SaaS MSA (Customer-Facing)", "contract_type": "MSA", "jurisdiction": "US",
        "owner": "General Counsel", "status": "active", "created_by": actor,
    })
    dpa = create_playbook(env_id=env_id, business_id=business_id, payload={
        "name": "Data Processing Addendum", "contract_type": "DPA", "jurisdiction": "US/EU",
        "owner": "Privacy Officer", "status": "active", "created_by": actor,
    })

    # Playbook positions (6-10 per playbook)
    nda_positions = [
        {"clause_key": "definition_of_confidential_info",
         "clause_label": "Definition of Confidential Information",
         "preferred_text": "All non-public information disclosed by either party, marked or reasonably understood as confidential.",
         "fallback_text": "Information identified in writing as confidential at time of disclosure.",
         "deal_breaker_text": "Catch-all definitions covering publicly available information.",
         "severity": "medium"},
        {"clause_key": "term_of_confidentiality",
         "clause_label": "Term of Confidentiality",
         "preferred_text": "5 years from date of disclosure for general info; perpetual for trade secrets.",
         "fallback_text": "3 years from date of disclosure.",
         "deal_breaker_text": "Less than 2 years for non-trade-secret info.", "severity": "medium"},
        {"clause_key": "permitted_use",
         "clause_label": "Permitted Use",
         "preferred_text": "Solely for the purpose of evaluating or performing the contemplated transaction.",
         "fallback_text": "Solely for the stated business purpose.",
         "deal_breaker_text": "Any clause permitting use beyond the stated purpose.", "severity": "high"},
        {"clause_key": "return_or_destruction",
         "clause_label": "Return or Destruction",
         "preferred_text": "On request: return or destroy all confidential information; certify destruction in writing.",
         "fallback_text": "Return or destroy on request.",
         "deal_breaker_text": "No return/destruction obligation.", "severity": "medium"},
        {"clause_key": "no_license_granted",
         "clause_label": "No License Granted",
         "preferred_text": "No license to any IP is granted by this agreement.",
         "fallback_text": "Implied licenses are excluded.",
         "deal_breaker_text": "Any explicit IP grant tied to disclosure.", "severity": "high"},
        {"clause_key": "governing_law",
         "clause_label": "Governing Law",
         "preferred_text": "Governed by Delaware law.",
         "fallback_text": "Governed by New York law.",
         "deal_breaker_text": "Foreign jurisdiction without protective carve-outs.", "severity": "medium"},
        {"clause_key": "publicity",
         "clause_label": "Publicity",
         "preferred_text": "No public announcement of the relationship without written consent.",
         "fallback_text": "Logo use permitted with prior written approval.",
         "deal_breaker_text": "Unrestricted right to publicize.", "severity": "low"},
    ]
    for pos in nda_positions:
        create_playbook_position(
            env_id=env_id, business_id=business_id,
            playbook_id=UUID(str(nda["playbook_id"])),
            payload={**pos, "created_by": actor},
        )

    msa_positions = [
        {"clause_key": "liability_cap",
         "clause_label": "Limitation of Liability",
         "preferred_text": "Liability capped at fees paid in prior 12 months.",
         "fallback_text": "Capped at 2x fees paid in prior 12 months for direct damages.",
         "deal_breaker_text": "Uncapped liability for general damages.",
         "approval_required_if": {"clause_key": "liability_cap", "comparator": ">", "threshold": 1_000_000},
         "severity": "high"},
        {"clause_key": "indemnification",
         "clause_label": "Indemnification",
         "preferred_text": "Mutual indemnification for IP infringement, gross negligence, and willful misconduct.",
         "fallback_text": "Mutual indemnification for IP infringement.",
         "deal_breaker_text": "One-sided indemnification favoring counterparty.", "severity": "high"},
        {"clause_key": "service_levels",
         "clause_label": "Service Levels",
         "preferred_text": "99.9% monthly uptime with service credits for breach.",
         "fallback_text": "99.5% monthly uptime.",
         "deal_breaker_text": "No SLA or remedies.", "severity": "medium"},
        {"clause_key": "data_security",
         "clause_label": "Data Security",
         "preferred_text": "SOC 2 Type II maintained; written notice of material changes.",
         "fallback_text": "Reasonable industry-standard security.",
         "deal_breaker_text": "No security obligations.", "severity": "high"},
        {"clause_key": "termination_for_convenience",
         "clause_label": "Termination for Convenience",
         "preferred_text": "Either party with 60 days written notice; pro-rated refund for unused fees.",
         "fallback_text": "Customer may terminate with 90 days notice; no refund.",
         "deal_breaker_text": "No termination for convenience.", "severity": "medium"},
        {"clause_key": "audit_rights",
         "clause_label": "Audit Rights",
         "preferred_text": "Annual audit on 30 days notice during business hours.",
         "fallback_text": "Audit limited to SOC 2 report sharing.",
         "deal_breaker_text": "No audit rights or report access.", "severity": "medium"},
        {"clause_key": "assignment",
         "clause_label": "Assignment",
         "preferred_text": "No assignment without written consent; allowed for affiliates and acquirers.",
         "fallback_text": "Assignment allowed to acquirer in M&A.",
         "deal_breaker_text": "Unrestricted right to assign.", "severity": "medium"},
        {"clause_key": "payment_terms",
         "clause_label": "Payment Terms",
         "preferred_text": "Net 30 from invoice date; 1.5%/mo late fee.",
         "fallback_text": "Net 45.",
         "deal_breaker_text": "Net 90+ or no late fee provision.", "severity": "low"},
    ]
    for pos in msa_positions:
        create_playbook_position(
            env_id=env_id, business_id=business_id,
            playbook_id=UUID(str(msa["playbook_id"])),
            payload={**pos, "created_by": actor},
        )

    dpa_positions = [
        {"clause_key": "subprocessors",
         "clause_label": "Subprocessors",
         "preferred_text": "Prior written notice; opt-out right; flow-down obligations.",
         "fallback_text": "Notice via website; flow-down obligations.",
         "deal_breaker_text": "No subprocessor disclosure.", "severity": "high"},
        {"clause_key": "international_transfers",
         "clause_label": "International Transfers",
         "preferred_text": "Standard Contractual Clauses incorporated.",
         "fallback_text": "Equivalent transfer mechanism (e.g., adequacy).",
         "deal_breaker_text": "No transfer mechanism named.", "severity": "high"},
        {"clause_key": "breach_notification",
         "clause_label": "Breach Notification",
         "preferred_text": "Notice without undue delay, in any case within 48 hours.",
         "fallback_text": "Notice within 72 hours of discovery.",
         "deal_breaker_text": "Notice >7 days or 'reasonable time'.", "severity": "high"},
        {"clause_key": "data_subject_rights",
         "clause_label": "Data Subject Rights Assistance",
         "preferred_text": "Reasonable assistance with DSARs at no extra cost up to a stated volume.",
         "fallback_text": "Reasonable assistance, time-and-materials beyond stated volume.",
         "deal_breaker_text": "No assistance obligation.", "severity": "medium"},
        {"clause_key": "deletion_on_termination",
         "clause_label": "Deletion on Termination",
         "preferred_text": "Delete or return personal data within 30 days; written certification.",
         "fallback_text": "Delete within 60 days.",
         "deal_breaker_text": "Retention rights without specified basis.", "severity": "medium"},
        {"clause_key": "audit_dpa",
         "clause_label": "Audit (DPA)",
         "preferred_text": "Annual audit or third-party report (SOC 2 / ISO 27001).",
         "fallback_text": "Third-party report sharing only.",
         "deal_breaker_text": "No audit or report rights.", "severity": "medium"},
    ]
    for pos in dpa_positions:
        create_playbook_position(
            env_id=env_id, business_id=business_id,
            playbook_id=UUID(str(dpa["playbook_id"])),
            payload={**pos, "created_by": actor},
        )

    # Clause library (~12 entries)
    for clause in [
        {"clause_key": "liability_cap", "clause_label": "Limitation of Liability",
         "canonical_text": "Each party's aggregate liability shall not exceed the fees paid by Customer to Vendor in the 12 months preceding the claim.",
         "tags_json": ["commercial", "risk"], "jurisdiction": "US"},
        {"clause_key": "indemnification", "clause_label": "Indemnification",
         "canonical_text": "Each party shall defend, indemnify, and hold harmless the other from third-party claims arising out of …",
         "tags_json": ["risk", "ip"], "jurisdiction": "US"},
        {"clause_key": "confidentiality", "clause_label": "Confidentiality",
         "canonical_text": "Each party shall maintain the other's Confidential Information in strict confidence …",
         "tags_json": ["confidentiality"], "jurisdiction": "US"},
        {"clause_key": "data_security", "clause_label": "Data Security",
         "canonical_text": "Vendor shall maintain administrative, technical, and physical safeguards consistent with SOC 2 Type II …",
         "tags_json": ["security", "data"], "jurisdiction": "US"},
        {"clause_key": "service_levels", "clause_label": "Service Levels",
         "canonical_text": "Vendor shall achieve at least 99.9% Monthly Uptime, calculated as …",
         "tags_json": ["sla", "operations"], "jurisdiction": "US"},
        {"clause_key": "termination_for_convenience", "clause_label": "Termination for Convenience",
         "canonical_text": "Either party may terminate this Agreement for convenience upon sixty (60) days written notice.",
         "tags_json": ["termination"], "jurisdiction": "US"},
        {"clause_key": "governing_law", "clause_label": "Governing Law",
         "canonical_text": "This Agreement shall be governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.",
         "tags_json": ["jurisdiction"], "jurisdiction": "US"},
        {"clause_key": "assignment", "clause_label": "Assignment",
         "canonical_text": "Neither party may assign this Agreement without the other party's prior written consent, except to an affiliate or in connection with a merger, acquisition, or sale of substantially all assets.",
         "tags_json": ["transfer"], "jurisdiction": "US"},
        {"clause_key": "publicity", "clause_label": "Publicity",
         "canonical_text": "Neither party shall issue a press release or use the other party's name or logo for marketing purposes without the other party's prior written approval.",
         "tags_json": ["marketing"], "jurisdiction": "US"},
        {"clause_key": "payment_terms", "clause_label": "Payment Terms",
         "canonical_text": "All undisputed invoices shall be paid net thirty (30) days from invoice date.",
         "tags_json": ["commercial"], "jurisdiction": "US"},
        {"clause_key": "audit_rights", "clause_label": "Audit Rights",
         "canonical_text": "Customer may, upon 30 days written notice and not more than once per year, audit Vendor's compliance with this Agreement during normal business hours.",
         "tags_json": ["governance"], "jurisdiction": "US"},
        {"clause_key": "subprocessors", "clause_label": "Subprocessors",
         "canonical_text": "Vendor shall provide Customer with prior written notice of new Subprocessors and an opportunity to object on reasonable grounds.",
         "tags_json": ["data", "privacy"], "jurisdiction": "US/EU"},
    ]:
        create_clause(env_id=env_id, business_id=business_id, payload={**clause, "created_by": actor})

    # Approval rules
    for rule in [
        {"rule_name": "Uncapped general liability requires GC + CFO",
         "contract_type": "MSA",
         "trigger_json": {"clause_key": "liability_cap", "match": "uncapped"},
         "required_approver": "General Counsel + CFO", "escalation_level": "executive"},
        {"rule_name": "Liability cap above $1M requires GC",
         "contract_type": "MSA",
         "trigger_json": {"clause_key": "liability_cap", "comparator": ">", "threshold": 1_000_000},
         "required_approver": "General Counsel", "escalation_level": "standard"},
        {"rule_name": "DPA without SCCs requires Privacy Officer",
         "contract_type": "DPA",
         "trigger_json": {"clause_key": "international_transfers", "missing": True},
         "required_approver": "Privacy Officer", "escalation_level": "standard"},
        {"rule_name": "NDA term <2 years requires Deputy GC",
         "contract_type": "NDA",
         "trigger_json": {"clause_key": "term_of_confidentiality", "comparator": "<", "threshold_years": 2},
         "required_approver": "Deputy General Counsel", "escalation_level": "standard"},
    ]:
        create_approval_rule(env_id=env_id, business_id=business_id, payload={**rule, "created_by": actor})

    # Legal Memory (prior decisions) — 6 entries
    for dec in [
        {"contract_type": "MSA", "clause_key": "liability_cap",
         "accepted_text": "Liability capped at 2x fees paid in prior 12 months",
         "rejected_text": "Uncapped liability except for IP infringement",
         "decided_by": "General Counsel",
         "rationale": "Acceptable when paired with carve-outs for IP, confidentiality, and willful misconduct.",
         "outside_counsel_guidance": "Foster & Bell — 2024-09 memo on liability carve-outs."},
        {"contract_type": "NDA", "clause_key": "term_of_confidentiality",
         "accepted_text": "5 years from disclosure; perpetual for trade secrets",
         "rejected_text": "3 years for trade secrets",
         "decided_by": "Deputy General Counsel",
         "rationale": "Trade-secret carve-out is non-negotiable per IP committee guidance."},
        {"contract_type": "DPA", "clause_key": "subprocessors",
         "accepted_text": "Notice via portal with 14-day opt-out window",
         "rejected_text": "Catalog updated quarterly with no opt-out",
         "decided_by": "Privacy Officer",
         "rationale": "Aligns with EU SCC Module 2 controller-to-processor expectations."},
        {"contract_type": "MSA", "clause_key": "termination_for_convenience",
         "accepted_text": "Either party with 60 days notice; pro-rated refund",
         "rejected_text": "Customer-only termination right",
         "decided_by": "General Counsel",
         "rationale": "Mutuality is preferred for vendor relationships above $250K ARR."},
        {"contract_type": "MSA", "clause_key": "audit_rights",
         "accepted_text": "Annual SOC 2 Type II report + remediation plan for material findings",
         "rejected_text": "Customer on-site audit on 7-day notice",
         "decided_by": "Information Security",
         "rationale": "On-site audit is reserved for >$1M ARR or regulated workloads."},
        {"contract_type": "NDA", "clause_key": "permitted_use",
         "accepted_text": "Solely for the purpose of evaluating or performing the contemplated transaction",
         "rejected_text": "Use for any business purpose of Recipient",
         "decided_by": "General Counsel",
         "rationale": "Purpose limitation is a hard line; broad permitted use is rejected."},
    ]:
        create_prior_decision(env_id=env_id, business_id=business_id, payload={**dec, "created_by": actor})

    # Policy sources (4 entries)
    for policy in [
        {"title": "Information Security Policy", "source_url": "https://example.com/security",
         "effective_from": date.today()},
        {"title": "Privacy Policy", "source_url": "https://example.com/privacy",
         "effective_from": date.today()},
        {"title": "Vendor Risk Management Standard", "source_url": "https://example.com/vendor-risk",
         "effective_from": date.today()},
        {"title": "Code of Conduct", "source_url": "https://example.com/code-of-conduct",
         "effective_from": date.today()},
    ]:
        create_policy_source(env_id=env_id, business_id=business_id, payload={**policy, "created_by": actor})

    return {
        "seeded": True,
        "playbooks": [str(nda["playbook_id"]), str(msa["playbook_id"]), str(dpa["playbook_id"])],
    }
