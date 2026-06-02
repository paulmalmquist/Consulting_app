#!/usr/bin/env python3
"""Run the Test Intelligence Copilot eval suite and write a committed results artifact.

Maps the five governance eval cases to real tests in backend/tests/test_copilot_telemetry.py, runs
pytest per case, and writes backend/app/data/telemetry/eval_results.json. The governance dashboard
serves that artifact labeled with the run timestamp + source — so eval pass/fail on the page is a
REAL pytest result, never invented. Re-run after changing copilot behavior.

Usage (from repo root):  PYTHONPATH=backend python telemetry-platform/run_governance_evals.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTFILE = "backend/tests/test_copilot_telemetry.py"
OUT = ROOT / "backend" / "app" / "data" / "telemetry" / "eval_results.json"

CASES = [
    {"key": "grounded_no_go",
     "title": "Grounded NO-GO explanation cites the real receipt",
     "k": "test_get_triggering_prediction_returns_no_go_receipt or test_postvalidate_passes_grounded_prose"},
    {"key": "refusal_proprietary_root_cause",
     "title": "Proprietary / physical-root-cause questions refused before tools/LLM",
     "k": "test_phase6_refusals_fire_pre_llm or test_flagship_question_is_not_refused"},
    {"key": "report_evidence_and_disclaimer",
     "title": "Draft report includes the evidence trail + human-review disclaimer",
     "k": "test_report_md_contains_required_evidence_trail or test_report_md_includes_human_review_disclaimer"},
    {"key": "fail_closed_missing_input",
     "title": "Malformed / missing input fails closed (no fabricated answer/report)",
     "k": "test_draft_report_missing_run_fails_closed or test_get_triggering_prediction_missing_run"},
    {"key": "no_invented_cause_or_disposition",
     "title": "No invented root cause or safety disposition; ungrounded tokens blocked",
     "k": "test_report_md_omits_root_cause_and_safety_disposition or test_postvalidate_rejects_fabricated_id"},
]


def run_case(k: str) -> tuple[str, str]:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", TESTFILE, "-k", k, "-q", "-p", "no:warnings"],
        cwd=ROOT, capture_output=True, text=True,
        env={**__import__("os").environ, "PYTHONPATH": str(ROOT / "backend")})
    tail = (proc.stdout or "").strip().splitlines()
    summary = tail[-1] if tail else ""
    return ("pass" if proc.returncode == 0 else "fail"), summary


def main() -> int:
    results = []
    for c in CASES:
        status, summary = run_case(c["k"])
        results.append({**c, "status": status, "pytest_summary": summary})
        print(f"  [{status.upper():4}] {c['key']}: {summary}")
    passed = sum(1 for r in results if r["status"] == "pass")
    payload = {
        "available": True,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": f"pytest {TESTFILE}",
        "summary": {"passed": passed, "total": len(results)},
        "cases": results,
        "note": "Deterministic structural evals (no live LLM). Live-LLM faithfulness is exercised "
                "separately by the production cold smoke recorded in last_smoke.json / PROOF.md.",
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({passed}/{len(results)} passed)")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
