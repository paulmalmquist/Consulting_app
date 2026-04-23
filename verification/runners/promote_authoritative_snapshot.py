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
    parser = argparse.ArgumentParser(
        description=(
            "Promote a Meridian authoritative snapshot version. "
            "When --fund-id and --quarter are both provided, promotes only that "
            "single (fund, quarter) row (scoped path). When omitted, promotes all "
            "rows in the snapshot_version (snapshot-wide path)."
        )
    )
    parser.add_argument("--snapshot-version", required=True)
    parser.add_argument("--target-state", choices=("verified", "released"), required=True)
    parser.add_argument("--actor", default="meridian_authoritative_release")
    parser.add_argument("--summary-json", help="Optional JSON string for findings summary")
    parser.add_argument(
        "--fund-id",
        default=None,
        help="UUID of a single fund to promote (scoped path). Requires --quarter.",
    )
    parser.add_argument(
        "--quarter",
        default=None,
        help="Quarter string (e.g. 2026Q2) to promote (scoped path). Requires --fund-id.",
    )
    args = parser.parse_args()

    if bool(args.fund_id) != bool(args.quarter):
        parser.error("--fund-id and --quarter must be used together, or neither.")

    findings_summary = json.loads(args.summary_json) if args.summary_json else None

    if args.fund_id and args.quarter:
        result = re_authoritative_snapshots.promote_fund_snapshot(
            snapshot_version=args.snapshot_version,
            fund_id=args.fund_id,
            quarter=args.quarter,
            target_state=args.target_state,
            actor=args.actor,
            findings_summary=findings_summary,
        )
        print(json.dumps(result, indent=2, default=str))
    else:
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
                    "scope": "snapshot_wide",
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
