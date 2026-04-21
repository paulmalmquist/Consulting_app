#!/usr/bin/env python3
"""Daily History Rhymes decision cron entry point.

Schedule: weekday 7:00 AM ET (market-open prep), per docs/LATEST.md.

Invokes the execution-layer decision runner, prints a one-line summary, and
exits 0 on success / 1 on unexpected failure. Intentionally minimal: the
runner handles failure-mode logic (degraded response) internally, so this
wrapper only guards against hard exceptions (DB unreachable, etc).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.services.hr_decision_runner import run_daily_decision

    try:
        result = run_daily_decision(source="daily_decision_job")
    except Exception as exc:  # noqa: BLE001 — cron wrapper, we want to see any error
        print(f"[hr_daily_decision] FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    summary = {
        "decision_id": result.get("decision_id"),
        "regime": result.get("regime"),
        "confidence": result.get("confidence"),
        "positions": len(result.get("positions") or []),
        "alerts": len(result.get("alerts") or []),
        "freshness_verdict": result.get("freshness_verdict"),
    }
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
