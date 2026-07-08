from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.safety import (  # noqa: E402
    DiffSnapshot,
    ESCALATE,
    STOP,
    escalations,
    scan,
    stops,
)

PLAN = "Build a widget counter page."
RELAY_PLAN = "Improve the coding relay loop module."


def snap(paths=None, deleted=None, diff="") -> DiffSnapshot:
    return DiffSnapshot(
        diff_text=diff,
        changed_paths=paths or [],
        deleted_paths=deleted or [],
        numstat=[],
    )


def rules(violations):
    return {v.rule for v in violations}


def test_clean_diff_has_no_violations(tmp_path):
    s = snap(paths=["repo-b/src/components/W.tsx"], diff="+ hello\n")
    assert scan(tmp_path, s, PLAN) == []


def test_mass_deletion_stop(tmp_path):
    s = snap(deleted=[f"old/{i}.py" for i in range(101)])
    v = scan(tmp_path, s, PLAN)
    assert "mass_deletion" in rules(stops(v))


def test_mass_deletion_boundary_100_allowed(tmp_path):
    s = snap(deleted=[f"old/{i}.py" for i in range(100)])
    assert "mass_deletion" not in rules(scan(tmp_path, s, PLAN))


def test_outside_worktree_traversal_stop(tmp_path):
    v = scan(tmp_path, snap(paths=["../evil.txt"]), PLAN)
    assert "outside_worktree_write" in rules(stops(v))


def test_outside_worktree_absolute_stop(tmp_path):
    abs_path = "C:/evil.txt" if sys.platform == "win32" else "/tmp/evil.txt"
    v = scan(tmp_path, snap(paths=[abs_path]), PLAN)
    assert "outside_worktree_write" in rules(stops(v))


def test_symlink_in_diff_stop(tmp_path):
    diff = (
        "diff --git a/link b/link\n"
        "new file mode 120000\n"
        "--- /dev/null\n"
        "+++ b/link\n"
        "+../outside\n"
    )
    v = scan(tmp_path, snap(paths=[], diff=diff), PLAN)
    assert "outside_worktree_write" in rules(stops(v))


def test_db_migration_stop_and_override(tmp_path):
    s = snap(paths=["repo-b/db/schema/300_new_table.sql"])
    assert "db_migration" in rules(stops(scan(tmp_path, s, PLAN)))
    assert "db_migration" not in rules(scan(tmp_path, s, PLAN, allow_migrations=True))
    s2 = snap(paths=["supabase/config.toml"])
    assert "db_migration" in rules(stops(scan(tmp_path, s2, PLAN)))


def test_secrets_in_diff_stop(tmp_path):
    diff = "+++ b/x\n+token = ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345\n"
    v = scan(tmp_path, snap(paths=["x"], diff=diff), PLAN)
    assert "secrets_in_diff" in rules(stops(v))


def test_secret_only_in_removed_line_is_not_a_stop(tmp_path):
    diff = "--- a/x\n-old = ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345\n+clean = value\n"
    assert "secrets_in_diff" not in rules(scan(tmp_path, snap(paths=["x"], diff=diff), PLAN))


def test_ordinary_token_code_is_not_a_stop(tmp_path):
    # The stop gate uses high-confidence literal shapes only; normal auth
    # code must never kill a run.
    diff = (
        "+++ b/x\n"
        "+token = create_access_token(user)\n"
        "+password = hash_password(raw_input)\n"
        "+token = secrets.token_urlsafe(32)\n"
    )
    assert "secrets_in_diff" not in rules(scan(tmp_path, snap(paths=["x"], diff=diff), PLAN))


def test_quoted_literal_secret_assignment_is_a_stop(tmp_path):
    fake_dapi = "dapi" + "0123456789abcdef" * 2  # assembled: no literal at rest
    diff = f'+++ b/x\n+DATABRICKS_TOKEN = "{fake_dapi}"\n'
    assert "secrets_in_diff" in rules(stops(scan(tmp_path, snap(paths=["x"], diff=diff), PLAN)))


def test_pem_and_jwt_added_lines_are_stops(tmp_path):
    diff = "+++ b/key\n+-----BEGIN PRIVATE KEY-----\n"
    assert "secrets_in_diff" in rules(stops(scan(tmp_path, snap(paths=["key"], diff=diff), PLAN)))
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef123"
    diff = f"+++ b/cfg\n+SUPABASE_KEY = {jwt}\n"
    assert "secrets_in_diff" in rules(stops(scan(tmp_path, snap(paths=["cfg"], diff=diff), PLAN)))


def test_workflow_and_hooks_escalate(tmp_path):
    v = scan(tmp_path, snap(paths=[".github/workflows/ci.yml"]), PLAN)
    assert "workflow_hooks" in rules(escalations(v))
    v = scan(tmp_path, snap(paths=[".githooks/pre-commit"]), PLAN)
    assert "workflow_hooks" in rules(escalations(v))
    # Host-executable root files also escalate.
    v = scan(tmp_path, snap(paths=["Makefile"]), PLAN)
    assert "workflow_hooks" in rules(escalations(v))
    v = scan(tmp_path, snap(paths=["dev.sh"]), PLAN)
    assert "workflow_hooks" in rules(escalations(v))


def test_auth_security_escalate(tmp_path):
    v = scan(tmp_path, snap(paths=["backend/app/routes/auth_login.py"]), PLAN)
    assert "auth_security" in rules(escalations(v))
    # Non-auth backend path does not escalate.
    v = scan(tmp_path, snap(paths=["backend/app/routes/widgets.py"]), PLAN)
    assert "auth_security" not in rules(v)


def test_self_edit_always_escalates_unless_flagged(tmp_path):
    s = snap(paths=["orchestration/coding_relay/loop.py"])
    # Plan text NEVER suppresses the escalation: it is author-controlled.
    assert "orchestration_self_edit" in rules(escalations(scan(tmp_path, s, PLAN)))
    assert "orchestration_self_edit" in rules(escalations(scan(tmp_path, s, RELAY_PLAN)))
    # Only the explicit, recorded flag suppresses it.
    assert "orchestration_self_edit" not in rules(
        scan(tmp_path, s, RELAY_PLAN, allow_relay_self_edit=True)
    )


def test_severities_are_partitioned(tmp_path):
    s = snap(
        paths=[".github/workflows/ci.yml", "../evil.txt"],
        deleted=[],
    )
    v = scan(tmp_path, s, PLAN)
    # Exact partition for this input, so a severity swap on either rule fails.
    assert rules(stops(v)) == {"outside_worktree_write"}
    assert rules(escalations(v)) == {"workflow_hooks"}
    assert all(x.severity == STOP for x in stops(v))
    assert all(x.severity == ESCALATE for x in escalations(v))
