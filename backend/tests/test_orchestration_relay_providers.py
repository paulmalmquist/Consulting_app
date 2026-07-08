"""Provider command construction: the artifact-only contract in unit form."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.providers import AdapterResult, CliCapabilities  # noqa: E402
from orchestration.coding_relay.providers.claude import (  # noqa: E402
    build_coding_command,
    scrubbed_env,
)
from orchestration.coding_relay.providers.codex import (  # noqa: E402
    BYPASS_FLAG,
    _looks_like_sandbox_failure,
    build_review_command,
)


def test_default_review_command_is_artifact_only(tmp_path):
    bundle = tmp_path / "review-bundle"
    cmd, note = build_review_command("codex", bundle)
    assert cmd[:4] == ["codex", "exec", "--cd", str(bundle)]
    assert BYPASS_FLAG not in cmd
    assert "--skip-git-repo-check" in cmd
    assert cmd[-1] == "-"
    assert note is None


def test_repo_access_adds_bypass_from_the_start(tmp_path):
    cmd, _ = build_review_command("codex", tmp_path, bypass_sandbox=True)
    assert BYPASS_FLAG in cmd


def test_model_flag_gated_on_capabilities(tmp_path):
    caps_without = CliCapabilities(exe="codex", help_text="", flags={"--cd"})
    cmd, note = build_review_command("codex", tmp_path, model="gpt-5.4", caps=caps_without)
    assert "-m" not in cmd
    assert note and "does not advertise" in note
    caps_with = CliCapabilities(exe="codex", help_text="", flags={"-m"})
    cmd, note = build_review_command("codex", tmp_path, model="gpt-5.4", caps=caps_with)
    assert cmd[cmd.index("-m") + 1] == "gpt-5.4"
    assert note is None


def test_sandbox_failure_detection_is_stderr_only():
    def res(exit_code, stdout="", stderr=""):
        return AdapterResult(
            agent="codex", adapter="x", command=["codex"],
            exit_code=exit_code, duration_ms=1, stdout=stdout, stderr=stderr,
        )

    # The stdout banner "sandbox: read-only" must never trigger the bypass.
    assert not _looks_like_sandbox_failure(res(1, stdout="sandbox: read-only\nauth error"))
    assert not _looks_like_sandbox_failure(res(0, stderr="error 1312"))  # success: no retry
    assert _looks_like_sandbox_failure(res(1, stderr="CreateProcessAsUserW failed"))
    assert _looks_like_sandbox_failure(res(1, stderr="spawn failed: error 1312"))


def test_claude_command_and_model_gating(tmp_path):
    cmd, note = build_coding_command("claude", tmp_path)
    assert cmd == ["claude", "-p", "--permission-mode", "acceptEdits", "--add-dir", str(tmp_path)]
    caps = CliCapabilities(exe="claude", help_text="", flags={"--model"})
    cmd, note = build_coding_command("claude", tmp_path, model="opus", caps=caps)
    assert "--model" in cmd and note is None
    cmd, note = build_coding_command("claude", tmp_path, model="opus", caps=CliCapabilities("claude", "", set()))
    assert "--model" not in cmd and note is not None


def test_scrubbed_env_drops_claude_vars(monkeypatch):
    monkeypatch.setenv("CLAUDECODE", "1")
    monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", "cli")
    monkeypatch.setenv("UNRELATED_VAR", "keep")
    env = scrubbed_env(keep=False)
    assert env is not None
    assert "CLAUDECODE" not in env
    assert "CLAUDE_CODE_ENTRYPOINT" not in env
    assert env.get("UNRELATED_VAR") == "keep"
    assert scrubbed_env(keep=True) is None
