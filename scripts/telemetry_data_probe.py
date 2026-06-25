#!/usr/bin/env python3
"""Read-only interrogation of the telemetry environment's data (Databricks Lakebase).

The telemetry lab env now serves from the `novendor-telemetry` Lakebase Postgres instance (tel_*
tables + the business dimension). This tool slices ROWS, builds PIVOTS, and SUMMARIZES that data
without any write risk: it connects as the Databricks identity (owner, so RLS is transparent),
forces a read-only transaction + a statement timeout, and rejects any non-SELECT SQL.

Credentials are discovered live from the databricks CLI (no stored secrets): the instance endpoint
from `get-database-instance`, the principal from `current-user me`, and a short-lived password from
`generate-database-credential`.

Commands:
  catalog                          list tel_* (+ business) tables with row + column counts
  describe TABLE                   per-column type / null-rate / distinct / min / max / sample
  rows TABLE [--where ..] [--cols ..] [--order ..] [--limit N]
  pivot TABLE --rows DIM [--cols DIM2] [--value COL] [--agg count|sum|avg|min|max] [--where ..]
  summary TABLE [--where ..] [--top N]   row count + freshness + per-column null/distinct/top-values
  sql "SELECT ..."                 arbitrary read-only query (single statement)

Examples:
  python scripts/telemetry_data_probe.py catalog
  python scripts/telemetry_data_probe.py summary tel_predictions
  python scripts/telemetry_data_probe.py pivot tel_predictions --rows verdict --cols model_name --agg count
  python scripts/telemetry_data_probe.py rows tel_test_runs --cols run_key,dataset,status --order created_at:desc --limit 10
  python scripts/telemetry_data_probe.py sql "SELECT dataset, count(*) FROM tel_test_runs GROUP BY 1"

Env overrides: TEL_LAKEBASE_INSTANCE (novendor-telemetry), TEL_LAKEBASE_DB (databricks_postgres),
DATABRICKS_PROFILE (PaulMain). --json emits machine-readable output.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import psycopg

INSTANCE = os.environ.get("TEL_LAKEBASE_INSTANCE", "novendor-telemetry")
DBNAME = os.environ.get("TEL_LAKEBASE_DB", "databricks_postgres")
PROFILE = os.environ.get("DATABRICKS_PROFILE", "PaulMain")
STMT_TIMEOUT = os.environ.get("TEL_PROBE_TIMEOUT", "30s")

# Tables in scope: tel_* serving tables + the business tenant dimension the env reads.
SCOPE_PREDICATE = "(c.relname LIKE 'tel\\_%' OR c.relname = 'business')"

_IDENT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_WRITE = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|vacuum|"
    r"reindex|merge|call|do|set|begin|commit|rollback|savepoint|lock|refresh|cluster|reset|"
    r"prepare|execute|listen|notify|import|attach)\b",
    re.I,
)


# ── credential discovery (databricks CLI, no stored secrets) ─────────────────────────────────────
def _dbx() -> str:
    exe = shutil.which("databricks")
    if exe:
        return exe
    winget = os.path.expandvars(
        r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"
        r"\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe"
    )
    if os.path.exists(winget):
        return winget
    sys.exit("databricks CLI not found on PATH")


def _dbx_json(args: list[str]) -> dict | list:
    out = subprocess.run([_dbx(), *args, "--profile", PROFILE, "-o", "json"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"databricks {' '.join(args)} failed: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout)


def connect() -> psycopg.Connection:
    inst = _dbx_json(["database", "get-database-instance", INSTANCE])
    host = inst["read_write_dns"]
    user = _dbx_json(["current-user", "me"])["userName"]
    cred = _dbx_json(["database", "generate-database-credential",
                      "--json", json.dumps({"instance_names": [INSTANCE]})])
    conn = psycopg.connect(host=host, port=5432, dbname=DBNAME, user=user,
                           password=cred["token"], sslmode="require", connect_timeout=30,
                           row_factory=psycopg.rows.dict_row)
    with conn.cursor() as cur:
        cur.execute("SET default_transaction_read_only = on")
        cur.execute(f"SET statement_timeout = '{STMT_TIMEOUT}'")
    conn.commit()
    return conn


# ── introspection + identifier safety ────────────────────────────────────────────────────────────
def list_tables(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND {SCOPE_PREDICATE}
              AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid)
            ORDER BY c.relname""")
        return [r["relname"] for r in cur.fetchall()]


def columns(conn, table: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("""SELECT column_name, data_type FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""",
                    (table,))
        return cur.fetchall()


def _safe_table(conn, table: str, _cache={}) -> str:
    if "tables" not in _cache:
        _cache["tables"] = set(list_tables(conn))
    if table not in _cache["tables"]:
        sys.exit(f"unknown table '{table}'. Run: catalog")
    return table


def _safe_cols(conn, table: str, names: list[str]) -> list[str]:
    valid = {c["column_name"] for c in columns(conn, table)}
    for n in names:
        if n not in valid:
            sys.exit(f"unknown column '{n}' on {table}. Cols: {', '.join(sorted(valid))}")
    return names


def assert_readonly(sql: str) -> str:
    s = sql.strip().rstrip(";").strip()
    if ";" in s:
        sys.exit("only a single statement is allowed")
    if not re.match(r"(?is)^\s*(select|with|explain|table|values)\b", s):
        sys.exit("only read-only SELECT / WITH / EXPLAIN / TABLE / VALUES queries are allowed")
    if _WRITE.search(s):
        sys.exit("query contains a forbidden (write/DDL) keyword")
    return s


# ── output ───────────────────────────────────────────────────────────────────────────────────────
def emit(rows: list[dict], as_json: bool, title: str | None = None) -> None:
    if as_json:
        print(json.dumps(rows, default=str, indent=2))
        return
    if title:
        print(f"\n# {title}")
    if not rows:
        print("(no rows)")
        return
    headers: list[str] = []
    for r in rows:  # union of keys (summary rows vary: categorical cols add top_values)
        for k in r:
            if k not in headers:
                headers.append(k)
    data = [[("" if r.get(h) is None else str(r.get(h))) for h in headers] for r in rows]
    widths = [max(len(h), *(len(row[i]) for row in data)) if data else len(h)
              for i, h in enumerate(headers)]
    line = lambda cells: "  ".join(c.ljust(widths[i]) for i, c in enumerate(cells))
    print(line(headers))
    print("  ".join("-" * w for w in widths))
    for row in data:
        print(line(row))
    print(f"({len(rows)} row{'s' if len(rows) != 1 else ''})")


def _count(conn, table: str, where: str | None) -> int:
    q = f'SELECT count(*) AS n FROM public."{table}"'
    if where:
        q += " WHERE " + assert_readonly("select 1 where " + where).split("where", 1)[1]
    with conn.cursor() as cur:
        cur.execute(q)
        return cur.fetchone()["n"]


# ── commands ─────────────────────────────────────────────────────────────────────────────────────
def cmd_catalog(conn, a) -> None:
    out = []
    for t in list_tables(conn):
        with conn.cursor() as cur:
            cur.execute(f'SELECT count(*) AS n FROM public."{t}"')
            n = cur.fetchone()["n"]
        out.append({"table": t, "rows": n, "columns": len(columns(conn, t))})
    emit(out, a.json, "telemetry-env data catalog (Lakebase)")


def cmd_describe(conn, a) -> None:
    t = _safe_table(conn, a.table)
    n = _count(conn, t, None) or 1
    out = []
    for col in columns(conn, t):
        c = col["column_name"]
        with conn.cursor() as cur:
            cur.execute(f'SELECT count("{c}") AS nn, count(DISTINCT "{c}") AS nd FROM public."{t}"')
            r = cur.fetchone()
            stat = {"column": c, "type": col["data_type"],
                    "null_pct": round(100 * (n - r["nn"]) / n, 2), "distinct": r["nd"]}
            try:
                cur.execute(f'SELECT min("{c}")::text AS mn, max("{c}")::text AS mx FROM public."{t}"')
                m = cur.fetchone(); stat["min"], stat["max"] = m["mn"], m["mx"]
            except Exception:
                conn.rollback()
        out.append(stat)
    emit(out, a.json, f"describe {t} ({n} rows)")


def cmd_rows(conn, a) -> None:
    t = _safe_table(conn, a.table)
    cols = "*"
    if a.cols:
        cols = ", ".join(f'"{c}"' for c in _safe_cols(conn, t, a.cols.split(",")))
    q = f'SELECT {cols} FROM public."{t}"'
    if a.where:
        q += " WHERE " + assert_readonly("select 1 where " + a.where).split("where", 1)[1]
    if a.order:
        oc, _, od = a.order.partition(":")
        _safe_cols(conn, t, [oc])
        q += f' ORDER BY "{oc}" {"DESC" if od.lower()=="desc" else "ASC"}'
    q += f" LIMIT {int(a.limit)}"
    with conn.cursor() as cur:
        cur.execute(q)
        emit(cur.fetchall(), a.json, f"rows {t}")


def cmd_pivot(conn, a) -> None:
    t = _safe_table(conn, a.table)
    _safe_cols(conn, t, [a.rows] + ([a.cols] if a.cols else []) + ([a.value] if a.value else []))
    agg = a.agg.lower()
    if agg not in {"count", "sum", "avg", "min", "max"}:
        sys.exit("--agg must be count|sum|avg|min|max")
    expr = "count(*)" if agg == "count" else f'{agg}("{a.value}")'
    if agg != "count" and not a.value:
        sys.exit("--value is required for sum/avg/min/max")
    where = ""
    if a.where:
        where = " WHERE " + assert_readonly("select 1 where " + a.where).split("where", 1)[1]
    if not a.cols:
        q = f'SELECT "{a.rows}" AS {a.rows}, {expr} AS {agg} FROM public."{t}"{where} GROUP BY 1 ORDER BY 2 DESC'
        with conn.cursor() as cur:
            cur.execute(q)
            emit(cur.fetchall(), a.json, f"pivot {t}: {agg} by {a.rows}")
        return
    # 2-D crosstab: GROUP BY row,col then reshape in Python (cap columns to avoid explosion)
    q = (f'SELECT "{a.rows}" AS rdim, "{a.cols}" AS cdim, {expr} AS v FROM public."{t}"{where} '
         f"GROUP BY 1,2")
    with conn.cursor() as cur:
        cur.execute(q)
        grouped = cur.fetchall()
    col_totals: dict = {}
    for g in grouped:
        col_totals[g["cdim"]] = col_totals.get(g["cdim"], 0) + (g["v"] or 0)
    top_cols = [c for c, _ in sorted(col_totals.items(), key=lambda kv: kv[1], reverse=True)][:20]
    dropped = len(col_totals) - len(top_cols)
    matrix: dict = {}
    for g in grouped:
        if g["cdim"] in top_cols:
            matrix.setdefault(str(g["rdim"]), {})[str(g["cdim"])] = g["v"]
    out = []
    for rk in sorted(matrix):
        row = {a.rows: rk}
        for ck in top_cols:
            row[str(ck)] = matrix[rk].get(str(ck), 0)
        out.append(row)
    if dropped > 0:
        print(f"[note] showing top {len(top_cols)} '{a.cols}' values by {agg}; {dropped} others omitted")
    emit(out, a.json, f"pivot {t}: {agg}('{a.value or '*'}') by {a.rows} x {a.cols}")


def cmd_summary(conn, a) -> None:
    t = _safe_table(conn, a.table)
    n = _count(conn, t, a.where)
    print(f"\n# summary {t}: {n} rows" + (f" (where {a.where})" if a.where else ""))
    cols = columns(conn, t)
    # freshness: newest value across timestamp columns
    ts_cols = [c["column_name"] for c in cols if "timestamp" in c["data_type"] or c["data_type"] == "date"]
    for tc in ts_cols:
        with conn.cursor() as cur:
            cur.execute(f'SELECT max("{tc}")::text AS mx FROM public."{t}"')
            print(f"  freshness {tc}: {cur.fetchone()['mx']}")
    out = []
    base = n or 1
    for col in cols:
        c = col["column_name"]
        with conn.cursor() as cur:
            cur.execute(f'SELECT count("{c}") AS nn, count(DISTINCT "{c}") AS nd FROM public."{t}"')
            r = cur.fetchone()
            stat = {"column": c, "type": col["data_type"],
                    "null_pct": round(100 * (base - r["nn"]) / base, 2), "distinct": r["nd"]}
            if 0 < r["nd"] <= 25:  # categorical -> top values
                cur.execute(f'SELECT "{c}"::text AS v, count(*) AS k FROM public."{t}" '
                            f"GROUP BY 1 ORDER BY 2 DESC LIMIT {int(a.top)}")
                stat["top_values"] = "; ".join(f"{x['v']}={x['k']}" for x in cur.fetchall())
        out.append(stat)
    emit(out, a.json)


def cmd_sql(conn, a) -> None:
    q = assert_readonly(a.query)
    with conn.cursor() as cur:
        cur.execute(q)
        emit(cur.fetchall() if cur.description else [], a.json, "sql")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    common = argparse.ArgumentParser(add_help=False)  # --json works after any subcommand
    common.add_argument("--json", action="store_true", help="machine-readable JSON output")
    common.add_argument("--show-sql", action="store_true", help="print every executed SQL to stderr (audit)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("catalog", parents=[common])
    d = sub.add_parser("describe", parents=[common]); d.add_argument("table")
    r = sub.add_parser("rows", parents=[common]); r.add_argument("table")
    r.add_argument("--where"); r.add_argument("--cols"); r.add_argument("--order"); r.add_argument("--limit", default=50)
    pv = sub.add_parser("pivot", parents=[common]); pv.add_argument("table")
    pv.add_argument("--rows", required=True); pv.add_argument("--cols"); pv.add_argument("--value")
    pv.add_argument("--agg", default="count"); pv.add_argument("--where")
    s = sub.add_parser("summary", parents=[common]); s.add_argument("table"); s.add_argument("--where"); s.add_argument("--top", default=5)
    sq = sub.add_parser("sql", parents=[common]); sq.add_argument("query")
    a = p.parse_args()

    if getattr(a, "show_sql", False):  # audit: echo every statement to stderr (keeps stdout clean for --json)
        _orig = psycopg.Cursor.execute
        def _logged(self, query, *args, **kwargs):
            q = query.decode() if isinstance(query, (bytes, bytearray)) else str(query)
            sys.stderr.write("[SQL] " + " ".join(q.split()) + "\n")
            if args and args[0]:
                sys.stderr.write("[PARAMS] " + repr(args[0]) + "\n")
            return _orig(self, query, *args, **kwargs)
        psycopg.Cursor.execute = _logged

    conn = connect()
    try:
        {"catalog": cmd_catalog, "describe": cmd_describe, "rows": cmd_rows,
         "pivot": cmd_pivot, "summary": cmd_summary, "sql": cmd_sql}[a.cmd](conn, a)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
