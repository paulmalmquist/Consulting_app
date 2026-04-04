#!/usr/bin/env python3
"""Sync backend eval scenarios (with playwright=true) into frontend eval-cases.json.

Reads scenario_registry.json + golden_corpus.json, selects scenarios tagged with
"playwright": true, and generates corresponding entries in eval-cases.json.
Manually-added eval cases (without a matching scenario_id) are preserved.

Usage:
    python scripts/sync-eval-cases.py              # writes to eval-cases.json
    python scripts/sync-eval-cases.py --dry-run     # prints generated cases without writing
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SCENARIO_FILES = (
    ROOT / "eval_loop" / "scenario_registry.json",
    ROOT / "eval_loop" / "golden_corpus.json",
)
EVAL_CASES_PATH = ROOT / "repo-b" / "tests" / "ai-evals" / "eval-cases.json"

# Page-level defaults mirrored from environment_matrix._PAGE_DEFAULTS
# Maps page_type -> nav_path template (env_id placeholder resolved at runtime)
_PAGE_NAV_PATHS: dict[str, str] = {
    "fund_detail": "/lab/env/env-{env_slug}/re/funds",
    "asset_detail": "/lab/env/env-{env_slug}/re/assets",
    "re_overview": "/lab/env/env-{env_slug}/re",
    "deals": "/lab/env/env-{env_slug}/re/deals",
    "operations": "/lab/env/env-{env_slug}/consulting/operations",
}

_ENV_NAV_PATHS: dict[str, str] = {
    "meridian": "/lab/env/env-meridian/re/funds",
    "novendor": "/lab/env/env-novendor",
    "resume": "/lab/env/env-resume/resume",
    "stone-pds": "/lab/env/env-stone-pds/pds",
    "trading": "/lab/env/env-trading/markets",
}


def _load_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []
    for path in SCENARIO_FILES:
        if path.exists():
            payload = json.loads(path.read_text())
            scenarios.extend(payload.get("scenarios", []))
    return scenarios


def _scenario_to_eval_case(scenario: dict[str, Any]) -> dict[str, Any] | None:
    env = scenario.get("environment")
    if not env:
        return None

    expected = scenario.get("expected", {})
    message = scenario.get("message", "")
    scenario_id = scenario.get("id", "")

    # Determine nav_path from page_type or environment default
    page_type = scenario.get("page_type")
    if page_type and page_type in _PAGE_NAV_PATHS:
        nav_path = _PAGE_NAV_PATHS[page_type].format(env_slug=env)
    else:
        nav_path = _ENV_NAV_PATHS.get(env)

    prompt: dict[str, Any] = {"user": message}

    require = expected.get("answer_must_include", [])
    if require:
        prompt["require_contains_any"] = require

    reject = expected.get("answer_must_not_include", [])
    if reject:
        prompt["reject_contains_any"] = reject

    # Generate human-readable description
    page_label = page_type.replace("_", " ") if page_type else "default"
    description = f"[synced] {env}/{page_label}: {message[:50]}"

    return {
        "id": f"synced-{scenario_id}",
        "description": description,
        "env_slug": env,
        "nav_path": nav_path,
        "prompts": [prompt],
    }


def sync(dry_run: bool = False) -> None:
    scenarios = _load_scenarios()
    playwright_scenarios = [s for s in scenarios if s.get("playwright")]

    generated_cases = []
    for scenario in playwright_scenarios:
        case = _scenario_to_eval_case(scenario)
        if case:
            generated_cases.append(case)

    # Load existing eval cases and preserve manually-added ones
    existing_cases: list[dict[str, Any]] = []
    if EVAL_CASES_PATH.exists():
        existing_cases = json.loads(EVAL_CASES_PATH.read_text())

    manual_cases = [c for c in existing_cases if not c.get("id", "").startswith("synced-")]
    synced_ids = {c["id"] for c in generated_cases}

    merged = manual_cases + generated_cases

    if dry_run:
        print(f"Would generate {len(generated_cases)} synced eval cases:")
        for case in generated_cases:
            print(f"  {case['id']}: {case['description']}")
        print(f"\nTotal cases (manual + synced): {len(merged)}")
        print(f"Manual cases preserved: {len(manual_cases)}")
        return

    EVAL_CASES_PATH.write_text(json.dumps(merged, indent=2) + "\n")
    print(f"Wrote {len(merged)} eval cases to {EVAL_CASES_PATH}")
    print(f"  Manual: {len(manual_cases)}")
    print(f"  Synced: {len(generated_cases)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync eval scenarios to Playwright eval-cases.json")
    parser.add_argument("--dry-run", action="store_true", help="Print generated cases without writing")
    args = parser.parse_args()
    sync(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
