#!/usr/bin/env python3
"""Generate the deterministic executive morning brief for an environment, on demand.

Calls the same service path as POST /api/ade/intel/morning-brief/generate
(app.services.morning_brief.generate) — the on-demand route is the source of truth and this
script is a thin wrapper around it, so behaviour is identical. Idempotent: one story card per
(env, brief_date); re-running the same day updates in place. Deterministic; the optional LLM
narration only runs when MORNING_BRIEF_SUMMARY_ENABLED is set and a provider key is present
(fail-closed otherwise).

Usage:
    python scripts/generate_morning_brief.py --env <env_id> --business <business_id>
    python scripts/generate_morning_brief.py --env <env_id> --business <business_id> --date 2026-06-16

Schedule (planned, NOT yet wired): daily 7:00 AM, after the overnight analyzer/reel/agent
runs. A live GitHub Actions cron is a deferred follow-up because it would require production
secrets in CI and an environment-discovery/fanout step; see
docs/runbooks/morning-brief-schedule.md. This script is the runnable, env-scoped entry point.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the morning brief for an environment.")
    parser.add_argument("--env", required=True, help="env_id to generate the brief for")
    parser.add_argument("--business", required=True, help="business_id (tenant) for the env")
    parser.add_argument("--date", default=None, help="brief_date YYYY-MM-DD (defaults to server today)")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.services import morning_brief

    try:
        result = morning_brief.generate(args.env, args.business, brief_date=args.date)
    except Exception as exc:  # noqa: BLE001 — surface a clear failure, exit non-zero
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1

    # Fail closed visibly: a null_reason means the brief could not be produced from real data.
    ok = result.get("card_id") is not None
    print(json.dumps({"ok": ok, "card_id": result.get("card_id"),
                      "null_reason": result.get("null_reason"),
                      "brief_date": (result.get("brief") or {}).get("brief_date")}, default=str))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
