#!/usr/bin/env python
"""Read-only REPE post-prune recovery audit.

Phase 0A compares the browser/Next response with the direct FastAPI/runtime
response before any seed logic. The DB inventory is intentionally read-only and
uses the Meridian production seed IDs from docs/tips.md.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import psycopg
from psycopg.rows import dict_row


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
DEFAULT_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
DEFAULT_QUARTER = "2026Q2"
REPORT_PATH = REPO_ROOT / "audit" / "db_prune_recovery" / "gap_report.md"


def load_backend_env() -> None:
    env_path = BACKEND_DIR / ".env"
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


@dataclass(frozen=True)
class ResponseSummary:
    status: int | None
    env_id: str | None
    business_id: str | None
    quarter: str | None
    fund_rows_length: int | None
    diagnostics_length: int | None
    error_body: Any = None
    url: str | None = None


def summarize_response(status: int | None, body: Any, url: str | None = None) -> ResponseSummary:
    if not isinstance(body, dict):
        return ResponseSummary(
            status=status,
            env_id=None,
            business_id=None,
            quarter=None,
            fund_rows_length=None,
            diagnostics_length=None,
            error_body=body,
            url=url,
        )
    fund_rows = body.get("fund_rows")
    diagnostics = body.get("diagnostics")
    error_body = None if status and 200 <= status < 300 else body
    return ResponseSummary(
        status=status,
        env_id=str(body.get("env_id")) if body.get("env_id") is not None else None,
        business_id=str(body.get("business_id")) if body.get("business_id") is not None else None,
        quarter=str(body.get("quarter")) if body.get("quarter") is not None else None,
        fund_rows_length=len(fund_rows) if isinstance(fund_rows, list) else None,
        diagnostics_length=len(diagnostics) if isinstance(diagnostics, list) else None,
        error_body=error_body,
        url=url,
    )


def classify_phase0a(
    *,
    browser: ResponseSummary | None,
    backend: ResponseSummary | None,
    expected_quarter: str,
) -> list[str]:
    classes: list[str] = []
    if backend is None:
        classes.append("ROUTE_FAILURE")
        return classes
    if backend.status is None or backend.status >= 500:
        classes.append("ROUTE_FAILURE")
    if backend.quarter and backend.quarter != expected_quarter:
        classes.append("PERIOD_MISMATCH")
    if browser is None:
        return classes
    if browser.status is None or browser.status >= 500:
        if backend.status is not None and 200 <= backend.status < 300:
            classes.append("ROUTE_FAILURE")
        else:
            classes.append("PROXY_GAP")
    if browser.quarter and browser.quarter != expected_quarter:
        classes.append("PERIOD_MISMATCH")
    backend_rows = backend.fund_rows_length or 0
    browser_rows = browser.fund_rows_length or 0
    if backend_rows > 0 and browser_rows == 0:
        if browser.status is not None and 200 <= browser.status < 300:
            classes.append("RUNTIME_ENV_MISMATCH")
        else:
            classes.append("PROXY_GAP")
    if browser.env_id and backend.env_id and browser.env_id != backend.env_id:
        classes.append("RUNTIME_ENV_MISMATCH")
    if browser.business_id and backend.business_id and browser.business_id != backend.business_id:
        classes.append("RUNTIME_ENV_MISMATCH")
    return sorted(set(classes))


def get_json_url(url: str) -> ResponseSummary:
    try:
        with httpx.Client(timeout=20.0, follow_redirects=False) as client:
            response = client.get(url)
        try:
            body: Any = response.json()
        except Exception:
            body = response.text[:2000]
        return summarize_response(response.status_code, body, url=url)
    except Exception as exc:
        return ResponseSummary(
            status=None,
            env_id=None,
            business_id=None,
            quarter=None,
            fund_rows_length=None,
            diagnostics_length=None,
            error_body={"error": type(exc).__name__, "message": str(exc)},
            url=url,
        )


def direct_backend_response(env_id: str, quarter: str, backend_origin: str | None) -> ResponseSummary:
    if backend_origin:
        base = backend_origin.rstrip("/")
        return get_json_url(f"{base}/api/re/v2/environments/{env_id}/fund-portfolio?quarter={quarter}")

    sys.path.insert(0, str(BACKEND_DIR))
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        response = client.get(f"/api/re/v2/environments/{env_id}/fund-portfolio?quarter={quarter}")
    try:
        body: Any = response.json()
    except Exception:
        body = response.text[:2000]
    return summarize_response(response.status_code, body, url="fastapi-testclient")


def table_exists(cur: Any, fq_name: str) -> bool:
    schema, table = fq_name.split(".", 1) if "." in fq_name else ("public", fq_name)
    cur.execute("SELECT to_regclass(%s) AS regclass", (f"{schema}.{table}",))
    return cur.fetchone()["regclass"] is not None


def fetch_one_count(cur: Any, label: str, sql: str, params: tuple[Any, ...]) -> dict[str, Any]:
    try:
        cur.execute(sql, params)
        return {"label": label, "count": int(cur.fetchone()["cnt"]), "error": None}
    except Exception as exc:
        cur.connection.rollback()
        cur.connection.read_only = True
        return {"label": label, "count": None, "error": f"{type(exc).__name__}: {exc}"}


def db_inventory(env_id: str, business_id: str, quarter: str) -> dict[str, Any]:
    checks = [
        ("binding", "SELECT count(*) AS cnt FROM app.env_business_bindings WHERE env_id=%s::uuid AND business_id=%s::uuid", (env_id, business_id)),
        ("funds", "SELECT count(*) AS cnt FROM repe_fund WHERE business_id=%s::uuid", (business_id,)),
        ("deals", "SELECT count(*) AS cnt FROM repe_deal d JOIN repe_fund f ON f.fund_id=d.fund_id WHERE f.business_id=%s::uuid", (business_id,)),
        ("assets", "SELECT count(*) AS cnt FROM repe_asset a JOIN repe_deal d ON d.deal_id=a.deal_id JOIN repe_fund f ON f.fund_id=d.fund_id WHERE f.business_id=%s::uuid", (business_id,)),
        ("fund_auth_q_all", "SELECT count(*) AS cnt FROM re_authoritative_fund_state_qtr WHERE env_id=%s AND business_id=%s::uuid AND quarter=%s", (env_id, business_id, quarter)),
        ("fund_auth_q_released", "SELECT count(*) AS cnt FROM re_authoritative_fund_state_qtr WHERE env_id=%s AND business_id=%s::uuid AND quarter=%s AND promotion_state='released'", (env_id, business_id, quarter)),
        ("investment_auth_q_released", "SELECT count(*) AS cnt FROM re_authoritative_investment_state_qtr WHERE env_id=%s AND business_id=%s::uuid AND quarter=%s AND promotion_state='released'", (env_id, business_id, quarter)),
        ("asset_auth_q_released", "SELECT count(*) AS cnt FROM re_authoritative_asset_state_qtr WHERE env_id=%s AND business_id=%s::uuid AND quarter=%s AND promotion_state='released'", (env_id, business_id, quarter)),
        ("included_v_q", "SELECT count(*) AS cnt FROM re_fund_portfolio_included_v WHERE env_id=%s AND business_id=%s::uuid AND quarter=%s", (env_id, business_id, quarter)),
        ("excluded_v", "SELECT count(*) AS cnt FROM re_fund_portfolio_excluded_v WHERE env_id=%s AND business_id=%s::uuid", (env_id, business_id)),
        ("opportunities", "SELECT count(*) AS cnt FROM repe_opportunities WHERE env_id=%s", (env_id,)),
        ("signals", "SELECT count(*) AS cnt FROM repe_signals WHERE env_id=%s", (env_id,)),
    ]
    with psycopg.connect(database_url(), row_factory=dict_row, connect_timeout=10) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            tables = [
                "app.env_business_bindings",
                "repe_fund",
                "repe_deal",
                "repe_asset",
                "re_authoritative_snapshot_run",
                "re_authoritative_fund_state_qtr",
                "re_authoritative_investment_state_qtr",
                "re_authoritative_asset_state_qtr",
                "re_fund_portfolio_included_v",
                "re_fund_portfolio_excluded_v",
                "repe_opportunities",
                "repe_signals",
                "repe_opportunity_signal_links",
                "repe_opportunity_model_runs",
            ]
            existence = {name: table_exists(cur, name) for name in tables}
            counts = [fetch_one_count(cur, label, sql, params) for label, sql, params in checks]
            cur.execute(
                """
                SELECT quarter, promotion_state, count(*)::int AS count
                FROM re_authoritative_fund_state_qtr
                WHERE env_id=%s AND business_id=%s::uuid
                GROUP BY quarter, promotion_state
                ORDER BY quarter, promotion_state
                """,
                (env_id, business_id),
            )
            fund_states = list(cur.fetchall())
            cur.execute(
                """
                SELECT fund_id::text, name, status
                FROM repe_fund
                WHERE business_id=%s::uuid
                ORDER BY name
                """,
                (business_id,),
            )
            funds = list(cur.fetchall())
    return {"tables": existence, "counts": counts, "fund_snapshot_states": fund_states, "funds": funds}


def classify_inventory(inv: dict[str, Any]) -> list[str]:
    counts = {row["label"]: row["count"] for row in inv["counts"]}
    classes: list[str] = []
    if counts.get("binding", 0) == 0:
        classes.append("DATA_DELETED")
    if counts.get("funds", 0) == 0:
        classes.append("DATA_DELETED")
    if counts.get("fund_auth_q_released", 0) == 0:
        any_released = any(
            row["promotion_state"] == "released"
            for row in inv.get("fund_snapshot_states", [])
        )
        classes.append("PERIOD_MISMATCH" if any_released else "DATA_DELETED")
    if counts.get("included_v_q", 0) == 0 and counts.get("fund_auth_q_released", 0):
        classes.append("SELECTOR_TOO_STRICT")
    if counts.get("opportunities", 0) == 0 and counts.get("signals", 0):
        classes.append("FRONTEND_EMPTY_STATE_GAP")
    return sorted(set(classes))


def md_table(rows: list[dict[str, Any]], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join("---" for _ in columns) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(col, "")) for col in columns) + " |")
    return "\n".join(lines)


def render_report(
    *,
    env_id: str,
    business_id: str,
    quarter: str,
    backend: ResponseSummary,
    browser: ResponseSummary | None,
    next_api: ResponseSummary | None,
    inventory: dict[str, Any],
    classifications: list[str],
) -> str:
    generated = datetime.now(timezone.utc).isoformat()
    response_rows = [
        {"surface": "direct_backend", **backend.__dict__},
        {"surface": "browser_or_next", **(browser.__dict__ if browser else {"status": "not_captured", "error_body": "run with --browser-origin"})},
        {"surface": "next_api", **(next_api.__dict__ if next_api else {"status": "not_captured", "error_body": "run with --browser-origin"})},
    ]
    count_rows = inventory["counts"]
    return f"""# REPE DB Prune Recovery Gap Report

Generated: `{generated}`

## Scope

- env_id: `{env_id}`
- business_id: `{business_id}`
- quarter: `{quarter}`
- classifications: `{", ".join(classifications) if classifications else "NONE"}`

## Phase 0A Runtime Comparison

{md_table(response_rows, ["surface", "status", "env_id", "business_id", "quarter", "fund_rows_length", "diagnostics_length", "url", "error_body"])}

## Inventory Counts

{md_table(count_rows, ["label", "count", "error"])}

## Table Existence

{md_table([{"table": k, "exists": v} for k, v in inventory["tables"].items()], ["table", "exists"])}

## Fund Snapshot States

{md_table(inventory["fund_snapshot_states"], ["quarter", "promotion_state", "count"])}

## Funds

{md_table(inventory["funds"], ["fund_id", "name", "status"])}

## Recovery Decision

Do not run seed recovery unless this report classifies the issue as `DATA_DELETED`
for the target runtime. If direct backend returns released fund rows while the
browser/Next surface is empty, treat it as `RUNTIME_ENV_MISMATCH`, `PROXY_GAP`,
`PERIOD_MISMATCH`, or `ROUTE_FAILURE` and fix the runtime path first.
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", default=DEFAULT_ENV_ID)
    parser.add_argument("--business-id", default=DEFAULT_BUSINESS_ID)
    parser.add_argument("--quarter", default=DEFAULT_QUARTER)
    parser.add_argument("--backend-origin", default=None, help="Optional running FastAPI origin. Defaults to in-process TestClient.")
    parser.add_argument("--browser-origin", default=None, help="Optional Next/browser origin, e.g. http://localhost:3000.")
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_out")
    args = parser.parse_args()

    backend = direct_backend_response(args.env_id, args.quarter, args.backend_origin)
    browser = None
    next_api = None
    if args.browser_origin:
        base = args.browser_origin.rstrip("/")
        browser = get_json_url(f"{base}/api/re/v2/environments/{args.env_id}/fund-portfolio?quarter={args.quarter}")
        next_api = get_json_url(f"{base}/bos/api/re/v2/environments/{args.env_id}/fund-portfolio?quarter={args.quarter}")
    inventory = db_inventory(args.env_id, args.business_id, args.quarter)
    phase0a_classes: list[str] = []
    if browser is not None:
        phase0a_classes.extend(
            classify_phase0a(browser=browser, backend=backend, expected_quarter=args.quarter)
        )
    if next_api is not None:
        phase0a_classes.extend(
            classify_phase0a(browser=next_api, backend=backend, expected_quarter=args.quarter)
        )
    if browser is None and next_api is None:
        phase0a_classes.extend(
            classify_phase0a(browser=None, backend=backend, expected_quarter=args.quarter)
        )
    classifications = sorted(set(phase0a_classes + classify_inventory(inventory)))
    report = render_report(
        env_id=args.env_id,
        business_id=args.business_id,
        quarter=args.quarter,
        backend=backend,
        browser=browser,
        next_api=next_api,
        inventory=inventory,
        classifications=classifications,
    )
    if args.write_report:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(report, encoding="utf-8")
    if args.json_out:
        print(json.dumps({
            "classifications": classifications,
            "backend": backend.__dict__,
            "browser": browser.__dict__ if browser else None,
            "next_api": next_api.__dict__ if next_api else None,
            "inventory": inventory,
        }, default=str, indent=2))
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
