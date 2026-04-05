"""Lead Ingest Service — parse Job Search search.md into CRM records.

Reads the structured markdown tables from Paul's job search pipeline and
creates crm_account, crm_contact, and crm_opportunity records with dedup.

Each company becomes an account. Each named contact becomes a contact.
Direct firm outreach entries get opportunities; recruiters do not.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path
from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import resolve_tenant_id

DEFAULT_SOURCE_PATH = "/Users/paulmalmquist/VSCodeProjects/Job Search/search.md"

# ──────────────────────────────────────────────────────────────────────────────
# Industry inference
# ──────────────────────────────────────────────────────────────────────────────

_INDUSTRY_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"real estate|repe|cre |multifamily|proptech|residential|homes|reit", re.I), "REPE"),
    (re.compile(r"healthcare|pharma|biotech|medical", re.I), "Healthcare"),
    (re.compile(r"\blaw\b|legal|attorney", re.I), "Legal"),
    (re.compile(r"construction|engineering|infrastructure|pds", re.I), "PDS"),
    (re.compile(r"private equity|\bpe\b|portfolio ops|back.?office|fund|capital|invest|asset manage", re.I), "PE_BackOffice"),
    (re.compile(r"fintech|quant|trading|financial service", re.I), "PE_BackOffice"),
    (re.compile(r"recruit|staffing|search|headhunt", re.I), "Other"),
]


def infer_industry(company_name: str, notes: str = "") -> str:
    combined = f"{company_name} {notes}"
    for pattern, industry in _INDUSTRY_RULES:
        if pattern.search(combined):
            return industry
    return "Other"


# ──────────────────────────────────────────────────────────────────────────────
# Markdown table parser
# ──────────────────────────────────────────────────────────────────────────────

def _strip_md(text: str) -> str:
    """Remove bold markers, leading/trailing whitespace."""
    return re.sub(r"\*\*", "", text).strip()


def _parse_table(lines: list[str]) -> list[dict]:
    """Parse a markdown table from a list of lines into dicts."""
    rows: list[dict] = []
    headers: list[str] = []

    for line in lines:
        line = line.strip()
        if not line.startswith("|"):
            if headers:
                break  # End of table
            continue

        cells = [c.strip() for c in line.split("|")[1:-1]]

        # Skip separator rows (|---|---|)
        if all(re.match(r"^[-:]+$", c) for c in cells):
            continue

        if not headers:
            headers = [_strip_md(h).lower().replace(" ", "_") for h in cells]
            continue

        row = {}
        for i, h in enumerate(headers):
            row[h] = _strip_md(cells[i]) if i < len(cells) else ""
        rows.append(row)

    return rows


def _split_sections(content: str) -> dict[str, list[str]]:
    """Split markdown content into sections by ## headers."""
    sections: dict[str, list[str]] = {}
    current_key = ""
    current_lines: list[str] = []

    for line in content.splitlines():
        if line.startswith("## ") or line.startswith("### "):
            if current_key:
                sections[current_key] = current_lines
            # Strip emoji and whitespace
            current_key = re.sub(r"[^\w\s:/—-]", "", line.lstrip("#").strip()).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_key:
        sections[current_key] = current_lines

    return sections


# ──────────────────────────────────────────────────────────────────────────────
# Contact name extraction
# ──────────────────────────────────────────────────────────────────────────────

def _extract_contact_info(raw: str) -> list[dict]:
    """Extract name(s), email(s), and role(s) from a contact string.

    Handles formats like:
      "Jennifer Feliz (HR), Jos Sebastian + Vijay Chakravarthula (hiring)"
      "Luis Suarez (CTO)"
      "Team"
    """
    contacts = []
    if not raw or raw.lower() in ("team", "—", "-", "n/a"):
        return contacts

    # Split on comma or +
    parts = re.split(r"[,+/]", raw)
    for part in parts:
        part = part.strip()
        if not part or part.lower() == "team":
            continue

        # Extract parenthetical role
        role_match = re.search(r"\(([^)]+)\)", part)
        role = role_match.group(1).strip() if role_match else None
        name = re.sub(r"\([^)]*\)", "", part).strip()

        # Extract email if present
        email_match = re.search(r"[\w.+-]+@[\w.-]+\.\w+", name)
        email = email_match.group(0) if email_match else None
        if email:
            name = name.replace(email, "").strip(" ,;-")

        if name and len(name) > 1:
            contacts.append({"name": name, "title": role, "email": email})

    return contacts


def _extract_email(raw: str) -> str | None:
    """Extract first email from a string."""
    match = re.search(r"[\w.+-]+@[\w.-]+\.\w+", raw)
    return match.group(0) if match else None


# ──────────────────────────────────────────────────────────────────────────────
# Status mapping
# ──────────────────────────────────────────────────────────────────────────────

def _map_status_to_stage(status_text: str) -> str:
    """Map the search.md status text to a pipeline stage key."""
    s = status_text.upper()
    if "INTERVIEW" in s or "ROUND" in s:
        return "engaged"
    if "ACTIVE" in s:
        return "contacted"
    if "REPLIED" in s:
        return "contacted"
    if "SENT" in s:
        return "contacted"
    if "DRAFTED" in s:
        return "identified"
    if "REJECTED" in s or "CLOSED" in s or "BOUNCED" in s:
        return "closed_lost"
    return "research"


# ──────────────────────────────────────────────────────────────────────────────
# Main ingest function
# ──────────────────────────────────────────────────────────────────────────────

def ingest_from_search_md(
    *,
    env_id: str,
    business_id: UUID,
    file_path: str | None = None,
) -> dict:
    """Parse search.md and create CRM records.

    Returns counts of created/skipped records.
    """
    path = Path(file_path or DEFAULT_SOURCE_PATH)
    if not path.exists():
        return {
            "accounts_created": 0,
            "contacts_created": 0,
            "opportunities_created": 0,
            "skipped_dupes": 0,
            "errors": [f"File not found: {path}"],
        }

    content = path.read_text(encoding="utf-8")
    sections = _split_sections(content)

    accounts_created = 0
    contacts_created = 0
    opportunities_created = 0
    skipped_dupes = 0
    errors: list[str] = []

    with get_cursor() as cur:
        tenant_id = str(resolve_tenant_id(cur, business_id))
        bid = str(business_id)

        # Get pipeline stage IDs
        cur.execute(
            "SELECT key, crm_pipeline_stage_id FROM crm_pipeline_stage WHERE business_id = %s",
            (bid,),
        )
        stage_map = {row["key"]: str(row["crm_pipeline_stage_id"]) for row in cur.fetchall()}
        default_stage_id = stage_map.get("research")

        # ── Active Interview Processes ─────────────────────────────
        for section_key, lines in sections.items():
            if "active interview" in section_key.lower():
                rows = _parse_table(lines)
                for row in rows:
                    company = row.get("company", "").strip()
                    if not company:
                        continue
                    try:
                        status_text = row.get("status", "")
                        stage_key = _map_status_to_stage(status_text)
                        stage_id = stage_map.get(stage_key, default_stage_id)

                        acct_id, is_new = _upsert_account(
                            cur, tenant_id, bid, company,
                            industry=infer_industry(company, row.get("role", "")),
                        )
                        if is_new:
                            accounts_created += 1
                        else:
                            skipped_dupes += 1

                        # Create contacts
                        contact_infos = _extract_contact_info(row.get("contact", ""))
                        for ci in contact_infos:
                            if _create_contact(cur, tenant_id, bid, acct_id, ci):
                                contacts_created += 1

                        # Create opportunity (active interviews are high priority)
                        if _create_opportunity(
                            cur, tenant_id, env_id, bid, acct_id, company,
                            stage_id=stage_id,
                            thesis=f"Active interview process — {row.get('role', 'leadership role')}",
                            pain="Hiring signals operational gaps or growth",
                            winston_angle="AI-enabled execution system replaces need for additional hires",
                            amount=15000,
                        ):
                            opportunities_created += 1
                    except Exception as e:
                        errors.append(f"Active interview {company}: {e}")

        # ── Direct Firm Outreach (all priority tiers) ──────────────
        for section_key, lines in sections.items():
            lower_key = section_key.lower()
            if ("priority" in lower_key or "direct firm" in lower_key or
                    "sent today" in lower_key or "active" in lower_key and "in process" in lower_key):
                rows = _parse_table(lines)
                for row in rows:
                    company = row.get("firm", "").strip()
                    if not company:
                        continue
                    try:
                        status_text = row.get("status", "")
                        stage_key = _map_status_to_stage(status_text)
                        stage_id = stage_map.get(stage_key, default_stage_id)

                        notes = " ".join(row.get(k, "") for k in row.keys())
                        industry = infer_industry(company, notes)

                        acct_id, is_new = _upsert_account(
                            cur, tenant_id, bid, company,
                            industry=industry,
                        )
                        if is_new:
                            accounts_created += 1
                        else:
                            skipped_dupes += 1

                        # Contact from explicit contact column or email column
                        contact_raw = row.get("contact", "")
                        email_raw = row.get("email", "")
                        contact_infos = _extract_contact_info(contact_raw)
                        if not contact_infos and email_raw:
                            email = _extract_email(email_raw)
                            if email:
                                contact_infos = [{"name": company, "title": None, "email": email}]
                        for ci in contact_infos:
                            if not ci.get("email") and email_raw:
                                ci["email"] = _extract_email(email_raw)
                            if _create_contact(cur, tenant_id, bid, acct_id, ci):
                                contacts_created += 1

                        # Create opportunity
                        if _create_opportunity(
                            cur, tenant_id, env_id, bid, acct_id, company,
                            stage_id=stage_id,
                            thesis="Identified via job search — hiring signals operational gaps",
                            pain="Hiring signals workflow/data inefficiency or scale issues",
                            winston_angle="Replace need for hires with AI-enabled execution system",
                            amount=7500,
                        ):
                            opportunities_created += 1
                    except Exception as e:
                        errors.append(f"Direct firm {company}: {e}")

        # ── Recruiter Pipeline (no opportunities — channel partners) ──
        for section_key, lines in sections.items():
            lower_key = section_key.lower()
            if "tier" in lower_key and ("recruiter" in lower_key or
                    any(t in lower_key for t in ["boutique", "specialist", "national", "quant", "fintech"])):
                rows = _parse_table(lines)
                for row in rows:
                    company = row.get("firm", "").strip()
                    if not company:
                        continue
                    try:
                        acct_id, is_new = _upsert_account(
                            cur, tenant_id, bid, company,
                            industry="Other",
                        )
                        if is_new:
                            accounts_created += 1

                        contact_name = row.get("contact", "").strip()
                        email_raw = row.get("email", "")
                        email = _extract_email(email_raw)
                        if contact_name and contact_name.lower() not in ("team", "—"):
                            if _create_contact(
                                cur, tenant_id, bid, acct_id,
                                {"name": contact_name, "title": row.get("specialization"), "email": email},
                            ):
                                contacts_created += 1
                    except Exception as e:
                        errors.append(f"Recruiter {company}: {e}")

        # ── Networking / Warm Contacts ─────────────────────────────
        for section_key, lines in sections.items():
            if "networking" in section_key.lower() or "warm contact" in section_key.lower():
                rows = _parse_table(lines)
                for row in rows:
                    person = row.get("person", "").strip()
                    company = row.get("company", "").strip()
                    if not person or not company:
                        continue
                    try:
                        acct_id, is_new = _upsert_account(
                            cur, tenant_id, bid, company,
                            industry=infer_industry(company, row.get("notes", "")),
                        )
                        if is_new:
                            accounts_created += 1

                        if _create_contact(
                            cur, tenant_id, bid, acct_id,
                            {"name": person, "title": None, "email": None},
                        ):
                            contacts_created += 1
                    except Exception as e:
                        errors.append(f"Networking {person}: {e}")

    return {
        "accounts_created": accounts_created,
        "contacts_created": contacts_created,
        "opportunities_created": opportunities_created,
        "skipped_dupes": skipped_dupes,
        "errors": errors if errors else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────────────────────────────────

def _upsert_account(
    cur, tenant_id: str, business_id: str, name: str,
    *, industry: str = "Other",
) -> tuple[str, bool]:
    """Find or create a crm_account. Returns (account_id, is_new)."""
    cur.execute(
        """
        SELECT crm_account_id FROM crm_account
        WHERE business_id = %s AND lower(name) = lower(%s)
        LIMIT 1
        """,
        (business_id, name),
    )
    row = cur.fetchone()
    if row:
        # Update industry if currently null
        cur.execute(
            """
            UPDATE crm_account SET industry = COALESCE(industry, %s)
            WHERE crm_account_id = %s AND industry IS NULL
            """,
            (industry, str(row["crm_account_id"])),
        )
        return str(row["crm_account_id"]), False

    cur.execute(
        """
        INSERT INTO crm_account (tenant_id, business_id, name, industry, created_at)
        VALUES (%s, %s, %s, %s, now())
        RETURNING crm_account_id
        """,
        (tenant_id, business_id, name, industry),
    )
    return str(cur.fetchone()["crm_account_id"]), True


def _create_contact(
    cur, tenant_id: str, business_id: str, account_id: str,
    info: dict,
) -> bool:
    """Create a crm_contact if one doesn't exist with the same name on the account."""
    name = info.get("name", "").strip()
    if not name or name.lower() in ("team", "—", "-"):
        return False

    # Dedup by name + account
    cur.execute(
        """
        SELECT crm_contact_id FROM crm_contact
        WHERE crm_account_id = %s AND lower(full_name) = lower(%s)
        LIMIT 1
        """,
        (account_id, name),
    )
    if cur.fetchone():
        return False

    cur.execute(
        """
        INSERT INTO crm_contact
          (tenant_id, business_id, crm_account_id, full_name, title, email, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, now())
        """,
        (
            tenant_id, business_id, account_id,
            name, info.get("title"), info.get("email"),
        ),
    )
    return True


def _create_opportunity(
    cur, tenant_id: str, env_id: str, business_id: str, account_id: str,
    company_name: str,
    *,
    stage_id: str | None,
    thesis: str,
    pain: str,
    winston_angle: str,
    amount: int = 7500,
) -> bool:
    """Create an opportunity if one doesn't already exist for this account."""
    # Dedup: one active opportunity per account
    cur.execute(
        """
        SELECT crm_opportunity_id FROM crm_opportunity
        WHERE crm_account_id = %s AND business_id = %s AND status = 'open'
        LIMIT 1
        """,
        (account_id, business_id),
    )
    if cur.fetchone():
        return False

    cur.execute(
        """
        INSERT INTO crm_opportunity
          (tenant_id, business_id, crm_account_id, crm_pipeline_stage_id,
           name, amount, status, thesis, pain, winston_angle, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, 'open', %s, %s, %s, now(), now())
        RETURNING crm_opportunity_id
        """,
        (
            tenant_id, business_id, account_id, stage_id,
            f"{company_name} — Consulting Engagement",
            amount, thesis, pain, winston_angle,
        ),
    )
    opp_row = cur.fetchone()
    opp_id = str(opp_row["crm_opportunity_id"])

    # Create initial next action — cro_next_action uses env_id (not tenant_id)
    cur.execute(
        """
        INSERT INTO cro_next_action
          (env_id, business_id, entity_type, entity_id,
           action_type, description, due_date, status, priority)
        VALUES (%s, %s, 'opportunity', %s, 'research',
                %s, %s, 'pending', 'normal')
        """,
        (
            env_id, business_id, opp_id,
            f"Research {company_name} + identify decision maker",
            str(date.today() + timedelta(days=1)),
        ),
    )
    return True
