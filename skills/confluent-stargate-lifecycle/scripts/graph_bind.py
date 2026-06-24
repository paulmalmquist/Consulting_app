#!/usr/bin/env python3
"""Write the broker cost-state row to tel_pipeline_status so it shows on the
Telemetry Mission Control PIPELINE panel.

The panel renders live.pipeline.surfaces verbatim from tel_pipeline_status
(env_id='telemetry-demo'). This adds/updates a single 'broker' surface row.

Usage:
    python graph_bind.py --status fresh --reason "serving · all stages live"
    python graph_bind.py --status warm  --reason "serving stopped · topics retained · $0.00/hr active"
    python graph_bind.py --status cold  --reason "parked · topics retained"
    python graph_bind.py --status gone  --reason "cluster deleted · recreate from export"

Connection: TELEMETRY_DATABASE_URL (Lakebase). Falls back to loading backend/.env.
Exits non-zero (fail closed) if the URL can't be resolved or the write fails.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ENV_ID = "telemetry-demo"
BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"
SURFACE = "broker"
VALID = {"fresh", "hot", "warm", "cold", "gone"}


def resolve_url() -> str:
    url = os.environ.get("TELEMETRY_DATABASE_URL")
    if url:
        return url
    # Fall back to backend/.env (the path the runners expect — see CLAUDE.md).
    repo_root = Path(__file__).resolve().parents[3]
    env_path = repo_root / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv  # type: ignore
            load_dotenv(env_path)
        except Exception:
            # Minimal parser if python-dotenv isn't installed.
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        url = os.environ.get("TELEMETRY_DATABASE_URL")
    if not url:
        sys.exit(
            "FAIL: TELEMETRY_DATABASE_URL not set and not found in backend/.env.\n"
            "  Pull it with: vercel env pull backend/.env --environment production --yes"
        )
    return url


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", required=True, choices=sorted(VALID))
    ap.add_argument("--reason", required=True)
    args = ap.parse_args()

    try:
        import psycopg2  # type: ignore
    except ImportError:
        sys.exit("FAIL: psycopg2 not installed. pip install psycopg2-binary")

    url = resolve_url()
    sql = """
        INSERT INTO tel_pipeline_status (env_id, business_id, surface, status, as_of_ts, reason)
        VALUES (%s, %s, %s, %s, now(), %s)
        ON CONFLICT (env_id, surface)
        DO UPDATE SET status = EXCLUDED.status, as_of_ts = now(), reason = EXCLUDED.reason
    """
    try:
        conn = psycopg2.connect(url)
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (ENV_ID, BUSINESS_ID, SURFACE, args.status, args.reason))
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:  # fail closed, surface the real error
        sys.exit(f"FAIL: graph write failed: {exc}")

    print(f"graph: broker = {args.status} · {args.reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
