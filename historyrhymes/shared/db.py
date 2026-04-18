# Databricks notebook source
# MAGIC %md
# MAGIC # shared/db — Supabase connection factory
# MAGIC
# MAGIC %run AFTER config and utils:
# MAGIC   %run ../shared/config
# MAGIC   %run ../shared/utils
# MAGIC   %run ../shared/db

# COMMAND ----------

import subprocess
subprocess.run(["pip", "install", "psycopg2-binary", "-q"], capture_output=True)

import os
import psycopg2
import psycopg2.extras

# ── Secret resolution ─────────────────────────────────────────────────────────
def _resolve_db_url() -> str:
    """
    Resolution order:
      1. Databricks secret: scope=winston, key=supabase_db_url
      2. Env var: SUPABASE_DB_URL
    Connection string format:
      postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    """
    try:
        return dbutils.secrets.get(scope="winston", key="supabase_db_url")  # noqa: F821
    except Exception:
        url = os.environ.get("SUPABASE_DB_URL", "")
        if url:
            return url
        raise RuntimeError(
            "Supabase DB URL not found.\n"
            "Register it once:\n"
            "  databricks secrets create-scope --scope winston\n"
            "  databricks secrets put-secret winston supabase_db_url\n"
            "Value: postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres"
        )

_DB_URL: str = _resolve_db_url()

# ── Connection factory ────────────────────────────────────────────────────────
def get_conn() -> psycopg2.extensions.connection:
    """Return a new psycopg2 connection. Callers use as context manager."""
    return psycopg2.connect(_DB_URL, connect_timeout=15)

def execute_sql(sql: str, params=None) -> list:
    """Execute a single SQL statement and return fetchall rows."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            try:
                return cur.fetchall()
            except Exception:
                return []

def upsert_rows(table: str, columns: list[str], rows: list[tuple],
                conflict_cols: list[str]) -> int:
    """
    Bulk upsert via execute_values with ON CONFLICT DO NOTHING.
    Returns number of rows attempted.
    """
    if not rows:
        return 0
    col_list      = ", ".join(columns)
    conflict_list = ", ".join(conflict_cols)
    sql = f"""
        INSERT INTO {table} ({col_list})
        VALUES %s
        ON CONFLICT ({conflict_list}) DO NOTHING
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
    return len(rows)

def table_count(table: str) -> int:
    rows = execute_sql(f"SELECT COUNT(*) FROM {table}")
    return rows[0][0] if rows else -1

# ── Connectivity check ────────────────────────────────────────────────────────
try:
    _ver = execute_sql("SELECT version()")[0][0]
    print(f"[db] Supabase connected: {_ver[:55]}")
except Exception as e:
    raise RuntimeError(f"[db] Supabase connection failed: {e}")
