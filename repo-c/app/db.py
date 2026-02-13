import uuid
import re
from contextlib import contextmanager
from typing import Iterable, Any

import psycopg

from .config import get_settings


GENERAL_PIPELINE_STAGES: list[tuple[str, str, str]] = [
    ("lead", "Lead", "slate"),
    ("qualified", "Qualified", "blue"),
    ("proposal", "Proposal", "amber"),
    ("negotiation", "Negotiation", "purple"),
    ("closed_won", "Closed Won", "green"),
]


PIPELINE_STAGE_TEMPLATES: dict[str, list[tuple[str, str, str]]] = {
    "real_estate_private_equity": [
        ("deal_sourced", "Deal Sourced", "slate"),
        ("underwriting", "Underwriting", "blue"),
        ("loi_submitted", "LOI Submitted", "amber"),
        ("loi_executed", "LOI Executed", "purple"),
        ("due_diligence", "Due Diligence", "teal"),
        ("debt_secured", "Debt Secured", "orange"),
        ("ic_approved", "IC Approved", "rose"),
        ("closed", "Closed", "green"),
        ("asset_mgmt", "Asset Mgmt", "cyan"),
        ("exit_prep", "Exit Prep", "indigo"),
        ("disposed", "Disposed", "emerald"),
    ],
    "construction_project_management": [
        ("lead", "Lead", "slate"),
        ("rfp", "RFP", "blue"),
        ("bid", "Bid", "amber"),
        ("awarded", "Awarded", "purple"),
        ("precon", "Precon", "teal"),
        ("active", "Active", "orange"),
        ("substantial_completion", "Substantial Completion", "cyan"),
        ("closeout", "Closeout", "green"),
        ("warranty", "Warranty", "indigo"),
    ],
    "media_planning_buying": [
        ("brief", "Brief", "slate"),
        ("strategy", "Strategy", "blue"),
        ("channel_plan", "Channel Plan", "amber"),
        ("budget", "Budget", "purple"),
        ("launch", "Launch", "teal"),
        ("optimize", "Optimize", "orange"),
        ("reporting", "Reporting", "cyan"),
        ("renewal", "Renewal", "green"),
    ],
    "professional_services_consulting_firms": [
        ("lead", "Lead", "slate"),
        ("diagnostic", "Diagnostic", "blue"),
        ("proposal", "Proposal", "amber"),
        ("signed", "Signed", "purple"),
        ("active", "Active", "teal"),
        ("review", "Review", "orange"),
        ("delivered", "Delivered", "cyan"),
        ("renewal", "Renewal", "green"),
    ],
    "healthcare_operator": [
        ("site", "Site", "slate"),
        ("feasibility", "Feasibility", "blue"),
        ("licensing", "Licensing", "amber"),
        ("buildout", "Buildout", "purple"),
        ("staffing", "Staffing", "teal"),
        ("launch", "Launch", "orange"),
        ("stabilization", "Stabilization", "cyan"),
        ("expansion", "Expansion", "green"),
    ],
    "manufacturing_industrial": [
        ("concept", "Concept", "slate"),
        ("feasibility", "Feasibility", "blue"),
        ("engineering", "Engineering", "amber"),
        ("tooling", "Tooling", "purple"),
        ("pilot", "Pilot", "teal"),
        ("full_prod", "Full Prod", "orange"),
        ("distribution", "Distribution", "cyan"),
        ("optimization", "Optimization", "green"),
    ],
    "saas_technology_company": [
        ("idea", "Idea", "slate"),
        ("prototype", "Prototype", "blue"),
        ("mvp", "MVP", "amber"),
        ("beta", "Beta", "purple"),
        ("ga", "GA", "teal"),
        ("growth", "Growth", "orange"),
        ("scale", "Scale", "cyan"),
        ("enterprise_expansion", "Enterprise Expansion", "green"),
    ],
    "family_office": [
        ("opportunity", "Opportunity", "slate"),
        ("preliminary", "Preliminary", "blue"),
        ("diligence", "Diligence", "amber"),
        ("structuring", "Structuring", "purple"),
        ("execution", "Execution", "teal"),
        ("portfolio_mgmt", "Portfolio Mgmt", "orange"),
        ("exit", "Exit", "green"),
    ],
    "hospitality_senior_housing_operator": [
        ("acquisition", "Acquisition", "slate"),
        ("entitlements", "Entitlements", "blue"),
        ("development", "Development", "amber"),
        ("lease_up", "Lease-Up", "purple"),
        ("stabilization", "Stabilization", "teal"),
        ("refi", "Refi", "orange"),
        ("hold", "Hold", "cyan"),
        ("sale", "Sale", "green"),
    ],
    "custom": GENERAL_PIPELINE_STAGES,
}


INDUSTRY_TYPE_ALIASES: dict[str, str] = {
    "repe": "real_estate_private_equity",
    "real_estate": "real_estate_private_equity",
    "real_estate_pe": "real_estate_private_equity",
    "construction": "construction_project_management",
    "construction_project": "construction_project_management",
    "media": "media_planning_buying",
    "media_planning": "media_planning_buying",
    "professional_services": "professional_services_consulting_firms",
    "consulting": "professional_services_consulting_firms",
    "consulting_firm": "professional_services_consulting_firms",
    "healthcare": "healthcare_operator",
    "healthcare_ops": "healthcare_operator",
    "manufacturing": "manufacturing_industrial",
    "industrial": "manufacturing_industrial",
    "saas": "saas_technology_company",
    "technology": "saas_technology_company",
    "tech": "saas_technology_company",
    "hospitality": "hospitality_senior_housing_operator",
    "senior_housing": "hospitality_senior_housing_operator",
}


@contextmanager
def get_conn():
    settings = get_settings()
    if not settings.supabase_db_url:
        raise RuntimeError("SUPABASE_DB_URL is not configured")
    conn = psycopg.connect(settings.supabase_db_url)
    try:
        yield conn
    finally:
        conn.close()


def ensure_extensions(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        cur.execute("CREATE SCHEMA IF NOT EXISTS platform;")
        conn.commit()


def ensure_platform_tables(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS platform.environments (
                env_id uuid PRIMARY KEY,
                client_name text NOT NULL,
                industry text NOT NULL,
                industry_type text NOT NULL DEFAULT 'general',
                pipeline_stage_name text,
                schema_name text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                is_active boolean NOT NULL DEFAULT true
            );
            """
        )
        cur.execute(
            """
            ALTER TABLE platform.environments
            ADD COLUMN IF NOT EXISTS industry_type text;
            """
        )
        cur.execute(
            """
            ALTER TABLE platform.environments
            ADD COLUMN IF NOT EXISTS pipeline_stage_name text;
            """
        )
        cur.execute(
            """
            UPDATE platform.environments
            SET industry_type = industry
            WHERE industry_type IS NULL OR btrim(industry_type) = '';
            """
        )
        cur.execute(
            """
            ALTER TABLE platform.environments
            ALTER COLUMN industry_type SET DEFAULT 'general';
            """
        )
        cur.execute(
            """
            ALTER TABLE platform.environments
            ALTER COLUMN industry_type SET NOT NULL;
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS platform.audit_log (
                id uuid PRIMARY KEY,
                env_id uuid NOT NULL,
                at timestamptz NOT NULL DEFAULT now(),
                actor text NOT NULL,
                action text NOT NULL,
                entity_type text NOT NULL,
                entity_id text NOT NULL,
                details jsonb NOT NULL DEFAULT '{}'::jsonb
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS platform.hitl_queue (
                id uuid PRIMARY KEY,
                env_id uuid NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                status text NOT NULL,
                requested_action jsonb NOT NULL,
                risk_level text NOT NULL,
                decision_reason text,
                decided_at timestamptz,
                decided_by text
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS platform.pipeline_stages (
                stage_id uuid PRIMARY KEY,
                env_id uuid NOT NULL REFERENCES platform.environments(env_id) ON DELETE CASCADE,
                stage_key text NOT NULL,
                stage_name text NOT NULL,
                order_index int NOT NULL,
                color_token text,
                metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                is_deleted boolean NOT NULL DEFAULT false,
                deleted_at timestamptz,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS platform.pipeline_cards (
                card_id uuid PRIMARY KEY,
                env_id uuid NOT NULL REFERENCES platform.environments(env_id) ON DELETE CASCADE,
                stage_id uuid NOT NULL REFERENCES platform.pipeline_stages(stage_id),
                title text NOT NULL,
                account_name text,
                owner text,
                value_cents bigint,
                priority text NOT NULL DEFAULT 'medium',
                rank int NOT NULL DEFAULT 100,
                due_date date,
                notes text,
                metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                is_deleted boolean NOT NULL DEFAULT false,
                deleted_at timestamptz,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_pipeline_stages_env_active
            ON platform.pipeline_stages (env_id, order_index)
            WHERE is_deleted = false;
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_pipeline_cards_env_active
            ON platform.pipeline_cards (env_id, stage_id, rank)
            WHERE is_deleted = false;
            """
        )
        conn.commit()


def generate_env_id() -> uuid.UUID:
    return uuid.uuid4()


def env_schema_name(env_id: uuid.UUID) -> str:
    return f"env_{str(env_id).replace('-', '')[:12]}"


def create_env_schema(conn: psycopg.Connection, schema_name: str) -> None:
    with conn.cursor() as cur:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name};")
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {schema_name}.tickets (
                ticket_id uuid PRIMARY KEY,
                created_at timestamptz NOT NULL DEFAULT now(),
                status text NOT NULL,
                title text NOT NULL,
                body text NOT NULL,
                intent text,
                risk text,
                source text,
                metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {schema_name}.crm_notes (
                id uuid PRIMARY KEY,
                created_at timestamptz NOT NULL DEFAULT now(),
                note text NOT NULL,
                related_entity text,
                metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {schema_name}.documents (
                doc_id uuid PRIMARY KEY,
                created_at timestamptz NOT NULL DEFAULT now(),
                filename text NOT NULL,
                storage_path text NOT NULL,
                mime_type text NOT NULL,
                size_bytes int NOT NULL
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {schema_name}.doc_chunks (
                chunk_id uuid PRIMARY KEY,
                doc_id uuid NOT NULL,
                chunk_index int NOT NULL,
                content text NOT NULL,
                embedding vector(1536),
                metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb
            );
            """
        )
        conn.commit()


def seed_environment(
    conn: psycopg.Connection, schema_name: str, industry_type: str
) -> None:
    with conn.cursor() as cur:
        ticket_id = uuid.uuid4()
        cur.execute(
            f"""
            INSERT INTO {schema_name}.tickets
            (ticket_id, status, title, body, intent, risk, source, metadata)
            VALUES (%s, 'open', %s, %s, 'review', 'low', 'seed', %s::jsonb)
            """,
            (
                ticket_id,
                f"Initial {industry_type} ticket",
                "Seeded ticket created for demo.",
                "{}",
            ),
        )
        note_id = uuid.uuid4()
        cur.execute(
            f"""
            INSERT INTO {schema_name}.crm_notes
            (id, note, related_entity, metadata)
            VALUES (%s, %s, %s, %s::jsonb)
            """,
            (
                note_id,
                f"Seed note for {industry_type} client.",
                "account:seed",
                "{}",
            ),
        )
        conn.commit()


def normalize_industry_type(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if not value:
        return "general"
    value = re.sub(r"[^a-z0-9_]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    if not value:
        return "general"
    return INDUSTRY_TYPE_ALIASES.get(value, value)


def get_pipeline_stage_template(industry_type: str | None) -> list[tuple[str, str, str]]:
    normalized = normalize_industry_type(industry_type)
    return PIPELINE_STAGE_TEMPLATES.get(normalized, GENERAL_PIPELINE_STAGES)


def ensure_pipeline_seed(
    conn: psycopg.Connection,
    env_id: uuid.UUID,
    industry_type: str | None,
) -> None:
    with conn.cursor() as cur:
        existing = cur.execute(
            """
            SELECT COUNT(*)
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            """,
            (env_id,),
        ).fetchone()
        count = int(existing[0] or 0) if existing else 0
        if count > 0:
            return

        template = get_pipeline_stage_template(industry_type)
        for idx, (stage_key, stage_name, color_token) in enumerate(template):
            cur.execute(
                """
                INSERT INTO platform.pipeline_stages
                (stage_id, env_id, stage_key, stage_name, order_index, color_token)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    uuid.uuid4(),
                    env_id,
                    stage_key,
                    stage_name,
                    (idx + 1) * 10,
                    color_token,
                ),
            )


def insert_audit_log(
    conn: psycopg.Connection,
    env_id: uuid.UUID,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO platform.audit_log
            (id, env_id, actor, action, entity_type, entity_id, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                uuid.uuid4(),
                env_id,
                actor,
                action,
                entity_type,
                entity_id,
                psycopg.types.json.Jsonb(details),
            ),
        )
        conn.commit()


def fetch_all(conn: psycopg.Connection, query: str, params: Iterable[Any] | None = None):
    with conn.cursor() as cur:
        cur.execute(query, params or ())
        return cur.fetchall()
