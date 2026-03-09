from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def list_accounts(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM nv_accounts
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               ORDER BY updated_at DESC""",
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def get_account(*, env_id: UUID, business_id: UUID, account_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM nv_accounts
               WHERE account_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid""",
            (str(account_id), str(env_id), str(business_id)),
        )
        return cur.fetchone()


def create_account(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_accounts
               (env_id, business_id, company_name, industry, sub_industry,
                employee_count, annual_revenue, headquarters, website_url,
                primary_contact_name, primary_contact_email, primary_contact_role,
                champion_name, champion_email, engagement_stage, pain_summary, notes)
               VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(env_id), str(business_id),
                payload["company_name"],
                payload.get("industry"),
                payload.get("sub_industry"),
                payload.get("employee_count"),
                payload.get("annual_revenue"),
                payload.get("headquarters"),
                payload.get("website_url"),
                payload.get("primary_contact_name"),
                payload.get("primary_contact_email"),
                payload.get("primary_contact_role"),
                payload.get("champion_name"),
                payload.get("champion_email"),
                payload.get("engagement_stage", "discovery"),
                payload.get("pain_summary"),
                payload.get("notes"),
            ),
        )
        return cur.fetchone()


def update_account(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict | None:
    sets = []
    params: list = []
    for key in (
        "company_name", "industry", "sub_industry", "employee_count",
        "annual_revenue", "headquarters", "website_url",
        "primary_contact_name", "primary_contact_email", "primary_contact_role",
        "champion_name", "champion_email", "engagement_stage",
        "pain_summary", "notes", "status",
    ):
        if key in payload and payload[key] is not None:
            sets.append(f"{key} = %s")
            params.append(payload[key])
    if not sets:
        return get_account(env_id=env_id, business_id=business_id, account_id=account_id)
    sets.append("updated_at = now()")
    params.extend([str(account_id), str(env_id), str(business_id)])
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE nv_accounts SET {', '.join(sets)}
                WHERE account_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid
                RETURNING *""",
            params,
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

def list_contacts(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_account_contacts WHERE account_id = %s::uuid ORDER BY created_at",
            (str(account_id),),
        )
        return cur.fetchall()


def create_contact(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_account_contacts
               (account_id, env_id, business_id, full_name, email, phone,
                role, department, is_champion, is_decision_maker, notes)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(account_id), str(env_id), str(business_id),
                payload["full_name"],
                payload.get("email"),
                payload.get("phone"),
                payload.get("role"),
                payload.get("department"),
                payload.get("is_champion", False),
                payload.get("is_decision_maker", False),
                payload.get("notes"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Source Systems
# ---------------------------------------------------------------------------

def list_systems(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_source_systems WHERE account_id = %s::uuid ORDER BY system_name",
            (str(account_id),),
        )
        return cur.fetchall()


def create_system(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_source_systems
               (account_id, env_id, business_id, system_name, vendor_name,
                system_category, system_role, department, annual_cost, user_count,
                integration_count, data_quality_score, exportability, pain_level,
                disposition, lock_in_risk, replacement_candidate, notes)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(account_id), str(env_id), str(business_id),
                payload["system_name"],
                payload.get("vendor_name"),
                payload.get("system_category", "other"),
                payload.get("system_role", "work"),
                payload.get("department"),
                payload.get("annual_cost"),
                payload.get("user_count"),
                payload.get("integration_count", 0),
                payload.get("data_quality_score"),
                payload.get("exportability", "unknown"),
                payload.get("pain_level", "low"),
                payload.get("disposition", "unknown"),
                payload.get("lock_in_risk", "unknown"),
                payload.get("replacement_candidate", False),
                payload.get("notes"),
            ),
        )
        row = cur.fetchone()
        # Update system count on account
        cur.execute(
            """UPDATE nv_accounts SET system_count = (
                 SELECT count(*) FROM nv_source_systems WHERE account_id = %s::uuid
               ), updated_at = now()
               WHERE account_id = %s::uuid""",
            (str(account_id), str(account_id)),
        )
        return row


def update_system(*, account_id: UUID, system_id: UUID, payload: dict) -> dict | None:
    sets = []
    params: list = []
    for key in (
        "system_name", "vendor_name", "system_category", "system_role",
        "department", "annual_cost", "user_count", "integration_count",
        "data_quality_score", "exportability", "pain_level", "disposition",
        "lock_in_risk", "replacement_candidate", "notes",
    ):
        if key in payload and payload[key] is not None:
            sets.append(f"{key} = %s")
            params.append(payload[key])
    if not sets:
        return None
    sets.append("updated_at = now()")
    params.extend([str(system_id), str(account_id)])
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE nv_source_systems SET {', '.join(sets)}
                WHERE system_id = %s::uuid AND account_id = %s::uuid
                RETURNING *""",
            params,
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

def list_vendors(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_vendors WHERE account_id = %s::uuid ORDER BY vendor_name",
            (str(account_id),),
        )
        return cur.fetchall()


def create_vendor(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_vendors
               (account_id, env_id, business_id, vendor_name, category,
                annual_spend, contract_end_date, lock_in_risk,
                replacement_difficulty, capabilities, notes)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(account_id), str(env_id), str(business_id),
                payload["vendor_name"],
                payload.get("category"),
                payload.get("annual_spend"),
                payload.get("contract_end_date"),
                payload.get("lock_in_risk", "unknown"),
                payload.get("replacement_difficulty", "medium"),
                payload.get("capabilities"),
                payload.get("notes"),
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """UPDATE nv_accounts SET vendor_count = (
                 SELECT count(*) FROM nv_vendors WHERE account_id = %s::uuid
               ), updated_at = now()
               WHERE account_id = %s::uuid""",
            (str(account_id), str(account_id)),
        )
        return row


# ---------------------------------------------------------------------------
# Discovery Sessions
# ---------------------------------------------------------------------------

def list_sessions(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_discovery_sessions WHERE account_id = %s::uuid ORDER BY session_date DESC",
            (str(account_id),),
        )
        return cur.fetchall()


def create_session(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_discovery_sessions
               (account_id, env_id, business_id, session_date, attendees,
                notes, files_requested, next_steps)
               VALUES (%s::uuid, %s::uuid, %s::uuid, COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s)
               RETURNING *""",
            (
                str(account_id), str(env_id), str(business_id),
                payload.get("session_date"),
                payload.get("attendees"),
                payload.get("notes"),
                payload.get("files_requested"),
                payload.get("next_steps"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Pain Points
# ---------------------------------------------------------------------------

def list_pain_points(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_pain_points WHERE account_id = %s::uuid ORDER BY severity DESC, created_at DESC",
            (str(account_id),),
        )
        return cur.fetchall()


def create_pain_point(*, env_id: UUID, business_id: UUID, account_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_pain_points
               (account_id, env_id, business_id, category, title,
                description, severity, estimated_annual_cost, affected_systems, source)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(account_id), str(env_id), str(business_id),
                payload.get("category", "process"),
                payload["title"],
                payload.get("description"),
                payload.get("severity", "medium"),
                payload.get("estimated_annual_cost"),
                payload.get("affected_systems"),
                payload.get("source", "manual"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def get_dashboard(*, env_id: UUID, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT count(*) as cnt FROM nv_accounts WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (str(env_id), str(business_id)),
        )
        total_accounts = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT count(*) as cnt FROM nv_accounts
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               AND engagement_stage NOT IN ('closed')""",
            (str(env_id), str(business_id)),
        )
        active = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT count(*) as cnt FROM nv_source_systems s
               JOIN nv_accounts a ON a.account_id = s.account_id
               WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid""",
            (str(env_id), str(business_id)),
        )
        total_systems = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT count(*) as cnt FROM nv_vendors v
               JOIN nv_accounts a ON a.account_id = v.account_id
               WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid""",
            (str(env_id), str(business_id)),
        )
        total_vendors = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT count(*) as cnt FROM nv_source_artifacts sa
               JOIN nv_accounts a ON a.account_id = sa.account_id
               WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid""",
            (str(env_id), str(business_id)),
        )
        total_artifacts = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT COALESCE(SUM(v.annual_spend), 0) as total FROM nv_vendors v
               JOIN nv_accounts a ON a.account_id = v.account_id
               WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid""",
            (str(env_id), str(business_id)),
        )
        total_vendor_spend = (cur.fetchone() or {}).get("total", Decimal("0"))

        cur.execute(
            """SELECT count(*) as cnt FROM nv_pain_points p
               JOIN nv_accounts a ON a.account_id = p.account_id
               WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid""",
            (str(env_id), str(business_id)),
        )
        total_pain = (cur.fetchone() or {}).get("cnt", 0)

        cur.execute(
            """SELECT engagement_stage, count(*) as cnt FROM nv_accounts
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               GROUP BY engagement_stage""",
            (str(env_id), str(business_id)),
        )
        stage_counts = {row["engagement_stage"]: row["cnt"] for row in cur.fetchall()}

        return {
            "total_accounts": total_accounts,
            "active_engagements": active,
            "total_systems": total_systems,
            "total_vendors": total_vendors,
            "total_artifacts": total_artifacts,
            "total_vendor_spend": total_vendor_spend or Decimal("0"),
            "total_pain_points": total_pain,
            "stage_counts": stage_counts,
        }
