#!/usr/bin/env python3
"""One-off migration: telemetry tel_* tables  Supabase -> Databricks Lakebase (managed Postgres).

Direct cutover support tool. Schema is recreated from the committed repo DDL (the authoritative
source the Supabase tables were built from); data is streamed table-by-table via COPY, FK-topo
ordered, with a row-count verification pass at the end. Re-runnable: it TRUNCATEs the dest tel_*
tables before copying, so a partial run can be repeated safely.

Credentials come from the environment (set by the bash wrapper, never hard-coded):
  SUPABASE_URL      full postgres URL (from `railway variables`)
  LAKEBASE_HOST     Lakebase read/write DNS
  LAKEBASE_DB       Lakebase database (databricks_postgres)
  LAKEBASE_USER     Databricks principal (email)
  LAKEBASE_TOKEN    short-lived credential from `databricks database generate-database-credential`

Usage (from the bash wrapper that exports the above):
    python scripts/migrate_tel_to_lakebase.py [--schema-only|--data-only|--verify-only]
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2          # multi-statement DDL (simple query protocol, DO $$ blocks)
import psycopg as pg3    # psycopg3: streaming cross-connection COPY

REPO = Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO / "repo-b" / "db" / "schema"

# tel_* DDL files, in dependency order. These created the Supabase tables; re-applying them
# rebuilds the exact schema (RLS, comments, indexes, partitions, FKs, pgvector) on Lakebase.
TEL_SCHEMA_FILES = [
    "10006_telemetry_serving.sql",
    "10008_telemetry_backfill_metadata.sql",
    "10009_telemetry_fused_vectors.sql",
    "10010_telemetry_copilot.sql",
    "10011_telemetry_copilot_reports.sql",
    "10012_telemetry_copilot_fallback_reason.sql",
    "10014_telemetry_copilot_review_actions.sql",
    "10015_telemetry_streaming_slice.sql",
    "10016_factory_ncr_intelligence.sql",
    "10022_control_tower.sql",
    "10033_telemetry_kafka_stream_provenance.sql",
]


def log(msg: str) -> None:
    print(msg, flush=True)


def supabase_url() -> str:
    u = os.environ.get("SUPABASE_URL", "")
    if not u:
        sys.exit("SUPABASE_URL not set")
    # Prefer the session pooler (5432) over the transaction pooler (6543) for COPY streaming.
    return u.replace(":6543/", ":5432/")


def lb_kwargs() -> dict:
    for k in ("LAKEBASE_HOST", "LAKEBASE_DB", "LAKEBASE_USER", "LAKEBASE_TOKEN"):
        if not os.environ.get(k):
            sys.exit(f"{k} not set")
    return dict(
        host=os.environ["LAKEBASE_HOST"], port=5432, dbname=os.environ["LAKEBASE_DB"],
        user=os.environ["LAKEBASE_USER"], password=os.environ["LAKEBASE_TOKEN"], sslmode="require",
    )


# ── schema ────────────────────────────────────────────────────────────────────────────────────
def apply_schema() -> None:
    log("== PHASE A: schema (apply repo tel_* DDL to Lakebase) ==")
    conn = psycopg2.connect(**lb_kwargs(), connect_timeout=30)
    conn.autocommit = True
    cur = conn.cursor()
    for fname in TEL_SCHEMA_FILES:
        sql = (SCHEMA_DIR / fname).read_text(encoding="utf-8")
        cur.execute(sql)
        log(f"  applied {fname}")
    conn.close()


def reconcile_partitions() -> None:
    """Recreate any tel_stream_readings_bronze daily partitions that exist on Supabase."""
    log("== PHASE A2: reconcile bronze partitions ==")
    src = psycopg2.connect(supabase_url(), connect_timeout=30); src.autocommit = True
    dst = psycopg2.connect(**lb_kwargs(), connect_timeout=30); dst.autocommit = True
    q = """
        SELECT c.relname, pg_get_expr(c.relpartbound, c.oid)
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'tel_stream_readings_bronze'
          AND pg_get_expr(c.relpartbound, c.oid) NOT ILIKE '%DEFAULT%'
    """
    sc = src.cursor(); sc.execute(q); parts = sc.fetchall()
    dc = dst.cursor()
    for name, bound in parts:
        dc.execute(
            f'CREATE TABLE IF NOT EXISTS "{name}" PARTITION OF tel_stream_readings_bronze {bound}'
        )
        log(f"  partition ensured: {name} {bound}")
    src.close(); dst.close()


# ── data ──────────────────────────────────────────────────────────────────────────────────────
def base_tables(conn) -> list[str]:
    """tel_* tables to copy: ordinary tables + partitioned parents; EXCLUDE partition children
    (copied via their parent) so each row lands once and partition routing is preserved."""
    cur = conn.cursor()
    cur.execute("""
        SELECT c.relname, c.relkind
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname LIKE 'tel\\_%' AND c.relkind IN ('r','p')
          AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)  -- not a partition child
    """)
    return [r[0] for r in cur.fetchall()]


def fk_topo_order(conn, tables: list[str]) -> list[str]:
    """Order tables so FK parents precede children (no superuser / trigger-disable needed)."""
    cur = conn.cursor()
    cur.execute("""
        SELECT tc.table_name, ccu.table_name AS ref
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
    """)
    deps: dict[str, set] = {t: set() for t in tables}
    for child, ref in cur.fetchall():
        if child in deps and ref in deps and child != ref:
            deps[child].add(ref)
    ordered, seen = [], set()
    while len(ordered) < len(tables):
        progressed = False
        for t in tables:
            if t in seen:
                continue
            if deps[t] <= seen:
                ordered.append(t); seen.add(t); progressed = True
        if not progressed:  # cycle: append remainder (FKs are deferrable enough here)
            ordered += [t for t in tables if t not in seen]
            break
    return ordered


def shared_columns(s3, l3, table: str) -> list[str]:
    """Columns present in BOTH ends, ordered by the destination's ordinal (alignment-safe)."""
    def cols(conn):
        with conn.cursor() as c:
            c.execute("""SELECT column_name FROM information_schema.columns
                         WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""",
                      (table,))
            return [r[0] for r in c.fetchall()]
    s, l = set(cols(s3)), cols(l3)
    return [c for c in l if c in s]


def copy_data() -> None:
    log("== PHASE B: data (stream Supabase -> Lakebase via COPY) ==")
    s3 = pg3.connect(supabase_url(), sslmode="require", connect_timeout=30)
    l3 = pg3.connect(**lb_kwargs(), connect_timeout=30)
    l3.autocommit = False
    tables = base_tables(l3)
    order = fk_topo_order(l3, tables)
    log(f"  {len(order)} tables, copy order: {', '.join(order)}")

    # Clear seeds / prior partials in one shot (all FKs are within the set).
    with l3.cursor() as c:
        c.execute("TRUNCATE " + ", ".join(f'"{t}"' for t in order) + " CASCADE")
    l3.commit()

    for t in order:
        cols = shared_columns(s3, l3, t)
        collist = ", ".join(f'"{c}"' for c in cols)
        out_sql = f"COPY (SELECT {collist} FROM public.\"{t}\") TO STDOUT (FORMAT BINARY)"
        in_sql = f'COPY public."{t}" ({collist}) FROM STDIN (FORMAT BINARY)'
        try:
            with s3.cursor().copy(out_sql) as cout, l3.cursor().copy(in_sql) as cin:
                for block in cout:
                    cin.write(block)
            l3.commit()
        except Exception as e:  # binary mismatch fallback -> text
            l3.rollback()
            out_sql = f"COPY (SELECT {collist} FROM public.\"{t}\") TO STDOUT"
            in_sql = f'COPY public."{t}" ({collist}) FROM STDIN'
            with s3.cursor().copy(out_sql) as cout, l3.cursor().copy(in_sql) as cin:
                for block in cout:
                    cin.write(block)
            l3.commit()
            log(f"    {t}: text-COPY fallback ({type(e).__name__})")
        with l3.cursor() as c:
            c.execute(f'SELECT count(*) FROM public."{t}"')
            log(f"  copied {t}: {c.fetchone()[0]} rows")
    s3.close(); l3.close()


def verify() -> None:
    log("== VERIFY: row-count parity ==")
    s3 = pg3.connect(supabase_url(), sslmode="require", connect_timeout=30)
    l3 = pg3.connect(**lb_kwargs(), connect_timeout=30)
    tables = base_tables(l3)
    mismatches = 0
    for t in sorted(tables):
        with s3.cursor() as cs, l3.cursor() as cl:
            cs.execute(f'SELECT count(*) FROM public."{t}"'); n_src = cs.fetchone()[0]
            cl.execute(f'SELECT count(*) FROM public."{t}"'); n_dst = cl.fetchone()[0]
        flag = "OK" if n_src == n_dst else "MISMATCH"
        if n_src != n_dst:
            mismatches += 1
        log(f"  {flag:9} {t}: supabase={n_src} lakebase={n_dst}")
    s3.close(); l3.close()
    log(f"== {'ALL MATCH' if mismatches == 0 else str(mismatches) + ' MISMATCH(es)'} ==")
    if mismatches:
        sys.exit(1)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--all"
    if mode in ("--all", "--schema-only"):
        apply_schema(); reconcile_partitions()
    if mode in ("--all", "--data-only"):
        copy_data()
    if mode in ("--all", "--data-only", "--verify-only"):
        verify()
    log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
