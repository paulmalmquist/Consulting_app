#!/usr/bin/env python3
"""Read-only interrogation of Winston telemetry data in Databricks Lakebase."""
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
SCOPE_PREDICATE = "(c.relname LIKE 'tel\\_%' OR c.relname = 'business')"
_WRITE = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|vacuum|"
    r"reindex|merge|call|do|set|begin|commit|rollback|savepoint|lock|refresh|cluster|reset|"
    r"prepare|execute|listen|notify|import|attach)\b",
    re.I,
)


def _dbx() -> str:
    executable = shutil.which("databricks")
    if executable:
        return executable
    winget = os.path.expandvars(
        r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"
        r"\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe"
    )
    if os.path.exists(winget):
        return winget
    sys.exit("databricks CLI not found on PATH")


def _dbx_json(args: list[str]) -> dict | list:
    result = subprocess.run(
        [_dbx(), *args, "--profile", PROFILE, "-o", "json"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"databricks {' '.join(args)} failed: {result.stderr.strip()[:200]}")
    return json.loads(result.stdout)


def connect() -> psycopg.Connection:
    instance = _dbx_json(["database", "get-database-instance", INSTANCE])
    user = _dbx_json(["current-user", "me"])["userName"]
    credential = _dbx_json(
        [
            "database",
            "generate-database-credential",
            "--json",
            json.dumps({"instance_names": [INSTANCE]}),
        ]
    )
    connection = psycopg.connect(
        host=instance["read_write_dns"],
        port=5432,
        dbname=DBNAME,
        user=user,
        password=credential["token"],
        sslmode="require",
        connect_timeout=30,
        row_factory=psycopg.rows.dict_row,
    )
    with connection.cursor() as cursor:
        cursor.execute("SET default_transaction_read_only = on")
        cursor.execute(f"SET statement_timeout = '{STMT_TIMEOUT}'")
    connection.commit()
    return connection


def list_tables(connection) -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind IN ('r', 'p', 'v', 'm')
              AND {SCOPE_PREDICATE}
              AND NOT EXISTS (
                SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid
              )
            ORDER BY c.relname
            """
        )
        return [row["relname"] for row in cursor.fetchall()]


def columns(connection, table: str) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table,),
        )
        return cursor.fetchall()


def safe_table(connection, table: str) -> str:
    if table not in set(list_tables(connection)):
        sys.exit(f"unknown table '{table}'. Run: catalog")
    return table


def safe_columns(connection, table: str, names: list[str]) -> list[str]:
    valid = {column["column_name"] for column in columns(connection, table)}
    for name in names:
        if name not in valid:
            sys.exit(f"unknown column '{name}' on {table}. Cols: {', '.join(sorted(valid))}")
    return names


def assert_readonly(sql: str) -> str:
    statement = sql.strip().rstrip(";").strip()
    if ";" in statement:
        sys.exit("only a single statement is allowed")
    if not re.match(r"(?is)^\s*(select|with|explain|table|values)\b", statement):
        sys.exit("only read-only SELECT / WITH / EXPLAIN / TABLE / VALUES queries are allowed")
    if _WRITE.search(statement):
        sys.exit("query contains a forbidden write or DDL keyword")
    return statement


def where_clause(predicate: str | None) -> str:
    if not predicate:
        return ""
    validated = assert_readonly("select 1 where " + predicate)
    return " WHERE " + validated.split("where", 1)[1]


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
    for row in rows:
        for key in row:
            if key not in headers:
                headers.append(key)
    data = [["" if row.get(header) is None else str(row.get(header)) for header in headers] for row in rows]
    widths = [
        max(len(header), *(len(row[index]) for row in data))
        for index, header in enumerate(headers)
    ]
    print("  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in data:
        print("  ".join(cell.ljust(widths[index]) for index, cell in enumerate(row)))
    print(f"({len(rows)} row{'s' if len(rows) != 1 else ''})")


def count_rows(connection, table: str, predicate: str | None) -> int:
    query = f'SELECT count(*) AS n FROM public."{table}"{where_clause(predicate)}'
    with connection.cursor() as cursor:
        cursor.execute(query)
        return cursor.fetchone()["n"]


def command_catalog(connection, args) -> None:
    output = []
    for table in list_tables(connection):
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT count(*) AS n FROM public."{table}"')
            count = cursor.fetchone()["n"]
        output.append({"table": table, "rows": count, "columns": len(columns(connection, table))})
    emit(output, args.json, "telemetry data catalog")


def command_describe(connection, args) -> None:
    table = safe_table(connection, args.table)
    total = count_rows(connection, table, None)
    denominator = total or 1
    output = []
    for column in columns(connection, table):
        name = column["column_name"]
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT count("{name}") AS nn, count(DISTINCT "{name}") AS nd '
                f'FROM public."{table}"'
            )
            result = cursor.fetchone()
            stats = {
                "column": name,
                "type": column["data_type"],
                "null_pct": round(100 * (denominator - result["nn"]) / denominator, 2),
                "distinct": result["nd"],
            }
            try:
                cursor.execute(
                    f'SELECT min("{name}")::text AS mn, max("{name}")::text AS mx '
                    f'FROM public."{table}"'
                )
                bounds = cursor.fetchone()
                stats["min"], stats["max"] = bounds["mn"], bounds["mx"]
            except Exception:
                connection.rollback()
        output.append(stats)
    emit(output, args.json, f"describe {table} ({total} rows)")


def command_rows(connection, args) -> None:
    table = safe_table(connection, args.table)
    selected = "*"
    if args.cols:
        names = safe_columns(connection, table, args.cols.split(","))
        selected = ", ".join(f'"{name}"' for name in names)
    query = f'SELECT {selected} FROM public."{table}"{where_clause(args.where)}'
    if args.order:
        order_column, _, direction = args.order.partition(":")
        safe_columns(connection, table, [order_column])
        query += f' ORDER BY "{order_column}" {"DESC" if direction.lower() == "desc" else "ASC"}'
    query += f" LIMIT {int(args.limit)}"
    with connection.cursor() as cursor:
        cursor.execute(query)
        emit(cursor.fetchall(), args.json, f"rows {table}")


def command_pivot(connection, args) -> None:
    table = safe_table(connection, args.table)
    requested = [args.rows] + ([args.cols] if args.cols else []) + ([args.value] if args.value else [])
    safe_columns(connection, table, requested)
    aggregate = args.agg.lower()
    if aggregate not in {"count", "sum", "avg", "min", "max"}:
        sys.exit("--agg must be count|sum|avg|min|max")
    if aggregate != "count" and not args.value:
        sys.exit("--value is required for sum/avg/min/max")
    expression = "count(*)" if aggregate == "count" else f'{aggregate}("{args.value}")'
    where = where_clause(args.where)

    if not args.cols:
        query = (
            f'SELECT "{args.rows}" AS {args.rows}, {expression} AS {aggregate} '
            f'FROM public."{table}"{where} GROUP BY 1 ORDER BY 2 DESC'
        )
        with connection.cursor() as cursor:
            cursor.execute(query)
            emit(cursor.fetchall(), args.json, f"pivot {table}: {aggregate} by {args.rows}")
        return

    query = (
        f'SELECT "{args.rows}" AS rdim, "{args.cols}" AS cdim, {expression} AS v '
        f'FROM public."{table}"{where} GROUP BY 1,2'
    )
    with connection.cursor() as cursor:
        cursor.execute(query)
        grouped = cursor.fetchall()

    column_totals: dict = {}
    for group in grouped:
        column_totals[group["cdim"]] = column_totals.get(group["cdim"], 0) + (group["v"] or 0)
    top_columns = [
        column
        for column, _ in sorted(column_totals.items(), key=lambda item: item[1], reverse=True)[:20]
    ]
    matrix: dict = {}
    for group in grouped:
        if group["cdim"] in top_columns:
            matrix.setdefault(str(group["rdim"]), {})[str(group["cdim"])] = group["v"]
    output = []
    for row_key in sorted(matrix):
        row = {args.rows: row_key}
        for column_key in top_columns:
            row[str(column_key)] = matrix[row_key].get(str(column_key), 0)
        output.append(row)
    omitted = len(column_totals) - len(top_columns)
    if omitted > 0 and not args.json:
        print(f"[note] showing top {len(top_columns)} '{args.cols}' values; {omitted} omitted")
    emit(output, args.json, f"pivot {table}: {aggregate} by {args.rows} x {args.cols}")


def command_summary(connection, args) -> None:
    table = safe_table(connection, args.table)
    total = count_rows(connection, table, args.where)
    if not args.json:
        print(f"\n# summary {table}: {total} rows")
    table_columns = columns(connection, table)
    timestamp_columns = [
        column["column_name"]
        for column in table_columns
        if "timestamp" in column["data_type"] or column["data_type"] == "date"
    ]
    if not args.json:
        for name in timestamp_columns:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT max("{name}")::text AS mx FROM public."{table}"')
                print(f"  freshness {name}: {cursor.fetchone()['mx']}")

    output = []
    denominator = total or 1
    for column in table_columns:
        name = column["column_name"]
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT count("{name}") AS nn, count(DISTINCT "{name}") AS nd '
                f'FROM public."{table}"'
            )
            result = cursor.fetchone()
            stats = {
                "column": name,
                "type": column["data_type"],
                "null_pct": round(100 * (denominator - result["nn"]) / denominator, 2),
                "distinct": result["nd"],
            }
            if 0 < result["nd"] <= 25:
                cursor.execute(
                    f'SELECT "{name}"::text AS v, count(*) AS k FROM public."{table}" '
                    f"GROUP BY 1 ORDER BY 2 DESC LIMIT {int(args.top)}"
                )
                stats["top_values"] = "; ".join(
                    f"{row['v']}={row['k']}" for row in cursor.fetchall()
                )
        output.append(stats)
    emit(output, args.json)


def command_sql(connection, args) -> None:
    query = assert_readonly(args.query)
    with connection.cursor() as cursor:
        cursor.execute(query)
        emit(cursor.fetchall() if cursor.description else [], args.json, "sql")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("catalog", parents=[common])
    describe = subparsers.add_parser("describe", parents=[common])
    describe.add_argument("table")
    rows = subparsers.add_parser("rows", parents=[common])
    rows.add_argument("table")
    rows.add_argument("--where")
    rows.add_argument("--cols")
    rows.add_argument("--order")
    rows.add_argument("--limit", default=50)
    pivot = subparsers.add_parser("pivot", parents=[common])
    pivot.add_argument("table")
    pivot.add_argument("--rows", required=True)
    pivot.add_argument("--cols")
    pivot.add_argument("--value")
    pivot.add_argument("--agg", default="count")
    pivot.add_argument("--where")
    summary = subparsers.add_parser("summary", parents=[common])
    summary.add_argument("table")
    summary.add_argument("--where")
    summary.add_argument("--top", default=5)
    sql = subparsers.add_parser("sql", parents=[common])
    sql.add_argument("query")
    args = parser.parse_args()

    connection = connect()
    try:
        commands = {
            "catalog": command_catalog,
            "describe": command_describe,
            "rows": command_rows,
            "pivot": command_pivot,
            "summary": command_summary,
            "sql": command_sql,
        }
        commands[args.command](connection, args)
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
