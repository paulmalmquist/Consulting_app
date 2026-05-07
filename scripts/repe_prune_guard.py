#!/usr/bin/env python
"""Guard REPE storage-prune plans from deleting canonical demo state."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
DEFAULT_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
DEFAULT_QUARTER = "2026Q2"

PROTECTED_TABLES = {
    "app.env_business_bindings": "env bindings are required to resolve workspace scope",
    "repe_fund": "canonical Meridian funds must not be pruned as storage cleanup",
    "repe_deal": "canonical Meridian investments/deals must not be pruned as storage cleanup",
    "repe_asset": "canonical Meridian assets must not be pruned as storage cleanup",
    "re_authoritative_fund_state_qtr": "current released fund snapshots are authoritative source rows",
    "re_authoritative_investment_state_qtr": "current released investment snapshots are authoritative source rows",
    "re_authoritative_asset_state_qtr": "current released asset snapshots are authoritative source rows",
}

SNAPSHOT_TABLES = {
    "re_authoritative_fund_state_qtr",
    "re_authoritative_investment_state_qtr",
    "re_authoritative_asset_state_qtr",
}


def load_backend_env() -> None:
    env_path = REPO_ROOT / "backend" / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def database_url() -> str:
    load_backend_env()
    url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        raise RuntimeError("DATABASE_URL or PG_POOLER_URL is required")
    return url


def normalize_table(name: str) -> str:
    return name.strip().strip('"')


def load_plan(path: str | None, tables: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = [{"table": table} for table in tables]
    if path:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("deletes", [])
        if not isinstance(data, list):
            raise ValueError("plan must be a JSON list or an object with a deletes list")
        rows.extend(item if isinstance(item, dict) else {"table": str(item)} for item in data)
    return rows


def static_blocks(plan: list[dict[str, Any]]) -> list[dict[str, str]]:
    blocked: list[dict[str, str]] = []
    for item in plan:
        table = normalize_table(str(item.get("table", "")))
        if table in PROTECTED_TABLES:
            blocked.append({"table": table, "reason": PROTECTED_TABLES[table]})
    return blocked


def live_blocks(env_id: str, business_id: str, quarter: str) -> list[dict[str, str]]:
    blocked: list[dict[str, str]] = []
    with psycopg.connect(database_url(), row_factory=dict_row, connect_timeout=10) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*) AS cnt
                FROM app.env_business_bindings
                WHERE env_id=%s::uuid AND business_id=%s::uuid
                """,
                (env_id, business_id),
            )
            if int(cur.fetchone()["cnt"] or 0) > 0:
                blocked.append({
                    "table": "app.env_business_bindings",
                    "reason": "Meridian env/business binding exists and is protected",
                })
            for table in sorted(SNAPSHOT_TABLES):
                cur.execute(
                    f"""
                    SELECT count(*) AS cnt
                    FROM {table}
                    WHERE env_id=%s AND business_id=%s::uuid
                      AND quarter=%s AND promotion_state='released'
                    """,
                    (env_id, business_id, quarter),
                )
                count = int(cur.fetchone()["cnt"] or 0)
                if count > 0:
                    blocked.append({
                        "table": table,
                        "reason": f"{count} current-quarter released row(s) exist for {quarter}",
                    })
    return blocked


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", help="JSON delete plan. Accepts a list or {deletes: [...]}.")
    parser.add_argument("--table", action="append", default=[], help="Table proposed for deletion. May be repeated.")
    parser.add_argument("--env-id", default=DEFAULT_ENV_ID)
    parser.add_argument("--business-id", default=DEFAULT_BUSINESS_ID)
    parser.add_argument("--quarter", default=DEFAULT_QUARTER)
    parser.add_argument("--check-live", action="store_true", help="Also verify protected rows currently exist.")
    parser.add_argument("--allow-empty-plan", action="store_true")
    args = parser.parse_args()

    plan = load_plan(args.plan, args.table)
    if not plan and not args.allow_empty_plan:
        raise SystemExit("No prune plan supplied. Use --table, --plan, or --allow-empty-plan.")

    blocked = static_blocks(plan)
    if args.check_live:
        blocked.extend(live_blocks(args.env_id, args.business_id, args.quarter))

    result = {
        "allowed": not blocked,
        "dry_run": True,
        "blocked": blocked,
        "checked_items": plan,
    }
    print(json.dumps(result, indent=2))
    return 2 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
