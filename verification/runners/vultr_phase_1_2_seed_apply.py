#!/usr/bin/env python3
"""Apply the cloud_infra_starter seed pack against the sentinel verification env.

Sentinel markers (Phase 1-2 verification protocol):
  env_id      = env_vultr_verify_2026_05_02
  business_id = uuid5(NAMESPACE_DNS, 'vultr-verify-2026-05-02:business')

This runner is the only sanctioned writer for the sentinel env. All cleanup
is handled by `vultr_phase_1_2_seed_cleanup.py`.

Usage:
  python verification/runners/vultr_phase_1_2_seed_apply.py [--rerun]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from uuid import NAMESPACE_DNS, uuid5

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from app.services.environment_seed_packs_v2 import cloud_infra_starter  # noqa: E402

SENTINEL_ENV_ID = str(uuid5(NAMESPACE_DNS, "vultr-verify-2026-05-02:env"))
SENTINEL_BUSINESS_ID = str(uuid5(NAMESPACE_DNS, "vultr-verify-2026-05-02:business"))
SENTINEL_DISPLAY = "Vultr Verify 2026-05-02 DO NOT USE"
SENTINEL_ACTOR = "vultr-phase-1-2-verify"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rerun", action="store_true",
                   help="Run a second time to verify idempotency")
    args = p.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 2

    print(f"sentinel env_id     = {SENTINEL_ENV_ID}", flush=True)
    print(f"sentinel business_id = {SENTINEL_BUSINESS_ID}", flush=True)
    print(f"rerun mode           = {args.rerun}", flush=True)
    print("connecting...", flush=True)

    with psycopg.connect(db_url) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            try:
                result = cloud_infra_starter.apply(
                    cur,
                    env_id=SENTINEL_ENV_ID,
                    business_id=SENTINEL_BUSINESS_ID,
                    actor=SENTINEL_ACTOR,
                )
            except Exception as exc:
                conn.rollback()
                print(f"FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
                raise
            conn.commit()

    print(f"\npack         = {result.pack_name} v{result.pack_version}", flush=True)
    print("rows_created:", flush=True)
    for table, count in sorted(result.rows_created.items()):
        print(f"  {table:50s} {count}", flush=True)
    print("\nnotes:", flush=True)
    for n in result.notes:
        print(f"  - {n}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
