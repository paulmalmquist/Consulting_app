from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.engine.parallel_validation import validate_parallel  # noqa: E402


class _CP:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_parallel_validation_writes_report(monkeypatch, tmp_path):
    def _run(*args, **kwargs):
        cmd = args[0]
        if isinstance(cmd, list) and cmd[:3] == ["git", "diff", "--name-only"]:
            branch = cmd[-1]
            if branch.endswith("ui_refactor"):
                return _CP(0, "repo-b/src/app/page.tsx\n")
            return _CP(0, "backend/app/main.py\n")
        if isinstance(cmd, list) and cmd[:2] == [".venv/bin/python", "-m"]:
            return _CP(0, "ok", "")
        if isinstance(cmd, list) and cmd[:2] == ["npm", "run"]:
            return _CP(0, "build ok", "")
        return _CP(0, "", "")

    monkeypatch.setattr("orchestration.engine.parallel_validation.subprocess.run", _run)

    session_a = {
        "session_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "branch": "feature/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ui_refactor",
    }
    session_b = {
        "session_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "branch": "feature/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/schema_change",
    }

    report = validate_parallel(session_a, session_b)
    assert report["branch_collision"] is False
    assert report["file_overlap"] == []
    assert report["merge_gate"]["backend_tests_ok"] is True
    assert report["merge_gate"]["frontend_build_ok"] is True

    report_path = ROOT / "orchestration" / "parallel_test_report.md"
    assert report_path.exists()
    assert "Parallel Session Validation Report" in report_path.read_text(encoding="utf-8")
