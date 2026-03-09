from __future__ import annotations

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
    import json as _json
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
