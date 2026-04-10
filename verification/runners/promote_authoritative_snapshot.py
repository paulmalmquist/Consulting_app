#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from app.services import re_authoritative_snapshots  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote a Meridian authoritative snapshot version")
    parser.add_argument("--snapshot-version", required=True)
    parser.add_argument("--target-state", choices=("verified", "released"), required=True)
    parser.add_argument("--actor", default="meridian_authoritative_release")
    parser.add_argument("--summary-json", help="Optional JSON string for findings summary")
    args = parser.parse_args()

    findings_summary = json.loads(args.summary_json) if args.summary_json else None
    re_authoritative_snapshots.promote_snapshot_version(
        snapshot_version=args.snapshot_version,
        target_state=args.target_state,
        actor=args.actor,
        findings_summary=findings_summary,
    )
    print(
        json.dumps(
            {
                "snapshot_version": args.snapshot_version,
                "target_state": args.target_state,
                "actor": args.actor,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
