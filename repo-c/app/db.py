import uuid
from contextlib import contextmanager
from typing import Iterable, Any

import psycopg

from .config import get_settings


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
                schema_name text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                is_active boolean NOT NULL DEFAULT true
            );
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
    conn: psycopg.Connection, schema_name: str, industry: str
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
                f"Initial {industry} ticket",
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
                f"Seed note for {industry} client.",
                "account:seed",
                "{}",
            ),
        )
        conn.commit()


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
