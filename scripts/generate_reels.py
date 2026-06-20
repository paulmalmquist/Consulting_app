#!/usr/bin/env python3
"""Generate analytics reels (story cards) for an environment, on demand.

Rolls up an environment's persisted analyzer finding/alert cards into story-type "reel"
cards via app.services.analytics_reels. Deterministic, no LLM. Run the analyzers first so
there are findings to roll up.

Usage:
    python scripts/generate_reels.py --env <env_id> --business <business_id>

Schedule (planned, NOT yet wired): daily 7:00 AM, after the overnight analyzer runs.
This script is the on-demand runner; cron registration is a deferred follow-up.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate analytics reels for an environment.")
    parser.add_argument("--env", required=True, help="env_id to generate reels for")
    parser.add_argument("--business", required=True, help="business_id (tenant) for the env")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.services import analytics_reels

    try:
        result = analytics_reels.generate_reels(args.env, args.business)
    except Exception as exc:  # noqa: BLE001 — surface a clear failure, exit non-zero
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1

    print(json.dumps({"ok": True, **result}, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
