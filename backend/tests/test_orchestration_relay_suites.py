from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.test_runner import (  # noqa: E402
    Suite,
    infer_suites,
    resolve_python,
    run_suites,
)

PY = "python"


def names(suites):
    return [s.name for s in suites]


def test_backend_changes_map_to_ruff_pytest_and_repe_lint():
    got = names(infer_suites(["backend/app/services/x.py"], PY))
    assert got == ["backend-ruff", "backend-pytest", "repe-lint"]


def test_frontend_changes_map_to_lint_typecheck_unit_and_repe_lint():
    got = names(infer_suites(["repo-b/src/components/W.tsx"], PY))
    assert got == ["frontend-lint", "frontend-typecheck", "frontend-unit", "repe-lint"]


def test_rs_factory_maps_to_pytest_only():
    got = names(infer_suites(["rs_factory_seed/generator.py"], PY))
    assert got == ["rs-factory-pytest"]


def test_docs_only_changes_run_nothing():
    assert infer_suites(["docs/reference/X.md", "README.md"], PY) == []


def test_windows_style_paths_are_normalized():
    got = names(infer_suites(["backend\\app\\x.py"], PY))
    assert "backend-pytest" in got


def test_missing_node_modules_is_honest_skip(tmp_path, monkeypatch):
    import orchestration.coding_relay.test_runner as tr

    # Deterministic branch: npm "exists", node_modules does not.
    monkeypatch.setattr(tr.shutil, "which", lambda name: "/fake/npm" if name == "npm" else None)
    (tmp_path / "repo-b").mkdir()
    suites = [Suite("frontend-unit", "repo-b", ["npm", "run", "test:unit"], 60, "npm")]
    results = run_suites(tmp_path, suites, "iterations/01/tests")
    assert results[0].skipped
    assert "node_modules" in results[0].reason
    # The skip reason carries the exact manual command.
    assert "npm ci" in results[0].reason
    assert "npm run test:unit" in results[0].reason
    assert results[0].exit_code is None


def test_no_python_interpreter_is_honest_skip(tmp_path):
    # infer_suites keeps command[0] empty when no interpreter resolved.
    suites = infer_suites(["backend/app/x.py"], None)
    assert suites[0].command[0] == ""
    (tmp_path / "backend").mkdir()
    results = run_suites(tmp_path, suites[:1], "t")
    assert results[0].skipped
    assert "no python interpreter" in results[0].reason
    assert "run manually" in results[0].reason


def test_missing_directory_is_honest_skip(tmp_path):
    suites = [Suite("backend-pytest", "backend", [PY, "-m", "pytest"], 60, "python")]
    results = run_suites(tmp_path, suites, "iterations/01/tests")
    assert results[0].skipped
    assert "missing directory" in results[0].reason


def test_real_command_runs_and_logs(tmp_path):
    (tmp_path / "proj").mkdir()
    suites = [
        Suite("echo", "proj", [sys.executable, "-c", "print('suite-ran-ok')"], 60, "python")
    ]
    written = {}

    def write(rel, text):
        written[rel] = text

    results = run_suites(tmp_path, suites, "iterations/01/tests", "test-python", write=write)
    assert results[0].exit_code == 0 and results[0].ok
    assert "iterations/01/tests/echo.log" in written
    assert "suite-ran-ok" in written["iterations/01/tests/echo.log"]


def test_failure_is_reported_not_faked(tmp_path):
    (tmp_path / "proj").mkdir()
    suites = [Suite("boom", "proj", [sys.executable, "-c", "raise SystemExit(3)"], 60, "python")]
    results = run_suites(tmp_path, suites, "t")
    assert not results[0].ok
    assert results[0].exit_code == 3
    assert "FAIL" in results[0].summary_line()


def test_resolve_python_prefers_worktree_venv(tmp_path):
    wt = tmp_path / "wt"
    exe_rel = ("Scripts", "python.exe") if sys.platform == "win32" else ("bin", "python")
    venv_py = wt / "backend" / ".venv" / exe_rel[0] / exe_rel[1]
    venv_py.parent.mkdir(parents=True)
    venv_py.write_text("", encoding="utf-8")
    py, desc = resolve_python(wt, None)
    assert py == str(venv_py)
    assert "venv" in desc
