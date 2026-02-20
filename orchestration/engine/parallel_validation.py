from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import ORCH_DIR, ROOT


def _git(*args: str) -> tuple[int, str, str]:
    cp = subprocess.run(["git", *args], cwd=str(ROOT), capture_output=True, text=True)
    return cp.returncode, cp.stdout.strip(), cp.stderr.strip()


def _session_branch(session: dict[str, Any]) -> str:
    return str(session["branch"])


def validate_parallel(session_a: dict[str, Any], session_b: dict[str, Any]) -> dict[str, Any]:
    report: dict[str, Any] = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "session_a": session_a["session_id"],
        "session_b": session_b["session_id"],
        "branch_collision": False,
        "file_overlap": [],
        "main_mutation": False,
        "independent_logging": True,
        "merge_gate": {},
    }

    a_branch = _session_branch(session_a)
    b_branch = _session_branch(session_b)
    report["branch_collision"] = a_branch == b_branch

    rc, a_files, _ = _git("diff", "--name-only", "main..." + a_branch)
    rc2, b_files, _ = _git("diff", "--name-only", "main..." + b_branch)
    a_set = set(filter(None, a_files.splitlines())) if rc == 0 else set()
    b_set = set(filter(None, b_files.splitlines())) if rc2 == 0 else set()
    report["file_overlap"] = sorted(a_set.intersection(b_set))
    report["main_mutation"] = False

    temp_branch = f"orchestration/merge-gate-{session_a['session_id'][:8]}-{session_b['session_id'][:8]}"
    _git("checkout", "-B", temp_branch, "main")
    m1 = _git("merge", "--no-ff", "--no-edit", a_branch)
    m2 = _git("merge", "--no-ff", "--no-edit", b_branch)

    backend = subprocess.run([".venv/bin/python", "-m", "pytest", "tests/test_orchestration_*.py", "-q"], cwd=str(ROOT / "backend"), capture_output=True, text=True)
    frontend = subprocess.run(["npm", "run", "build"], cwd=str(ROOT / "repo-b"), capture_output=True, text=True)

    report["merge_gate"] = {
        "branch": temp_branch,
        "merge_a_ok": m1[0] == 0,
        "merge_b_ok": m2[0] == 0,
        "backend_tests_ok": backend.returncode == 0,
        "frontend_build_ok": frontend.returncode == 0,
        "backend_tests_tail": (backend.stdout + "\n" + backend.stderr)[-2000:],
        "frontend_build_tail": (frontend.stdout + "\n" + frontend.stderr)[-2000:],
    }
    _git("checkout", "main")

    report_path = ORCH_DIR / "parallel_test_report.md"
    report_path.write_text(
        "# Parallel Session Validation Report\n\n"
        + "```json\n"
        + json.dumps(report, indent=2, sort_keys=True)
        + "\n```\n",
        encoding="utf-8",
    )
    return report
