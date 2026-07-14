#!/usr/bin/env python3
"""seed_sustainability_demo.py — release the demo sustainability snapshot.

Drives the T13a materialization/release path (create_snapshot ->
persist_metric_values -> persist_evidence -> promote(verified) ->
promote(released)) for a fixed demo snapshot version, so the live
``/app/sustainability`` surface has a governed released snapshot to render.

Idempotent: re-running is a no-op if the snapshot is already released.

Usage (from repo root, with backend/.env populated by ``vercel env pull``):

    python scripts/seed_sustainability_demo.py
    python scripts/seed_sustainability_demo.py --env-id sus-demo \
        --business-id a1b2c3d4-0001-0001-0001-000000000001
    python scripts/seed_sustainability_demo.py --force-version sus-demo-2026Q1-002
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Allow ``from app.*`` imports when run from repo root.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "backend"))

from app.services.environment_seed_packs_v2 import sustainability_demo  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--business-id", default=sustainability_demo.DEMO_BUSINESS_ID)
    parser.add_argument("--env-id", default=sustainability_demo.DEMO_ENV_ID)
    parser.add_argument(
        "--snapshot-version",
        default=sustainability_demo.DEMO_SNAPSHOT_VERSION,
        help="Snapshot version to release. Default is the fixed demo version.",
    )
    parser.add_argument(
        "--force-version",
        default=None,
        help=(
            "If set, mint a NEW snapshot version instead of the default demo "
            "version. Use this for a corrected reseed — the released row is "
            "immutable, so corrections mint a new version."
        ),
    )
    parser.add_argument("--actor", default="sus-demo-seed")
    args = parser.parse_args()

    if args.force_version:
        result = sustainability_demo.reseed(
            force_version=args.force_version,
            business_id=args.business_id,
            env_id=args.env_id,
            actor=args.actor,
        )
    else:
        result = sustainability_demo.seed_sustainability_demo_snapshot(
            business_id=args.business_id,
            env_id=args.env_id,
            snapshot_version=args.snapshot_version,
            actor=args.actor,
        )
    json.dump(result, sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
