"""Config layer for the Coding Relay: defaults, overrides, and portability.

The relay ships defaults that reproduce THIS repo exactly, so a checkout with
no relay.config.json behaves as it always has. A different repo drops in a
relay.config.json to describe its own layout. These tests pin both halves: the
defaults must not drift, and an override must actually take effect.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.config import (  # noqa: E402
    CONFIG_FILENAME,
    RelayConfig,
    default_config,
    load_config,
    merge_config,
    venv_rel_from,
    write_starter_config,
)
from orchestration.coding_relay.test_runner import infer_suites  # noqa: E402


# --- defaults must reproduce this repo -----------------------------------

def test_defaults_reproduce_this_repo():
    cfg = default_config()
    assert cfg.plan_dir == "docs/plans/03-implementation-plans/active"
    assert cfg.base_ref == "origin/main"
    assert "repo-b/db/schema/" in cfg.migration_prefixes
    assert "supabase/" in cfg.migration_prefixes
    assert "backend/" in cfg.auth_prefixes
    assert "repo-b/node_modules" in cfg.dep_links
    assert "backend/.venv" in cfg.dep_links
    assert cfg.test_suites, "default test_suites must not be empty"


def test_venv_rel_picks_the_venv_dep_link():
    assert venv_rel_from(default_config()) == "backend/.venv"
    # A repo with no .venv dep link falls back to the supplied default.
    cfg = RelayConfig(dep_links=["web/node_modules"])
    assert venv_rel_from(cfg, default="x/.venv") == "x/.venv"


# --- override behavior ----------------------------------------------------

def test_partial_override_leaves_other_keys_at_default():
    cfg = merge_config({"plan_dir": "docs/plans", "base_ref": "origin/trunk"})
    assert cfg.plan_dir == "docs/plans"
    assert cfg.base_ref == "origin/trunk"
    # untouched keys keep their defaults
    assert cfg.migration_prefixes == default_config().migration_prefixes
    assert cfg.test_suites == default_config().test_suites


def test_unknown_key_fails_loudly():
    with pytest.raises(ValueError) as exc:
        merge_config({"plan_directory": "docs/plans"})
    assert "plan_directory" in str(exc.value)


def test_load_config_returns_defaults_when_no_file(tmp_path):
    assert load_config(tmp_path) == default_config()


def test_load_config_reads_a_foreign_repo_config(tmp_path):
    """A different repo describes its own layout and the relay honors it."""
    (tmp_path / CONFIG_FILENAME).write_text(
        json.dumps(
            {
                "plan_dir": "planning/tickets",
                "base_ref": "origin/develop",
                "migration_prefixes": ["db/migrate/"],
                "dep_links": ["web/node_modules"],
                "test_suites": [
                    {
                        "when_touched": "web/",
                        "name": "web-test",
                        "cwd": "web",
                        "cmd": ["npm", "test"],
                        "timeout": 600,
                        "runner": "npm",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    cfg = load_config(tmp_path)
    assert cfg.plan_dir == "planning/tickets"
    assert cfg.base_ref == "origin/develop"
    assert cfg.migration_prefixes == ["db/migrate/"]
    assert cfg.dep_links == ["web/node_modules"]
    assert len(cfg.test_suites) == 1
    assert cfg.test_suites[0]["name"] == "web-test"
    # keys the foreign config did not name stay at the defaults
    assert cfg.auth_prefixes == default_config().auth_prefixes


def test_malformed_config_raises_rather_than_silently_defaulting(tmp_path):
    (tmp_path / CONFIG_FILENAME).write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_config(tmp_path)


# --- suite inference is driven by config, and defaults are unchanged ------

def _names(touched: list[str], cfg: RelayConfig | None = None) -> set[str]:
    # A real interpreter path so the `{py}` slot resolves and python suites are
    # emitted rather than honestly skipped.
    return {s.name for s in infer_suites(touched, sys.executable, config=cfg)}


def test_default_suite_inference_matches_this_repo():
    # backend change -> ruff + pytest + the repe state-lock lint
    backend = _names(["backend/app/services/x.py"])
    assert "backend-ruff" in backend
    assert "backend-pytest" in backend
    assert "repe-lint" in backend

    # frontend change -> npm suites + the repe lint
    frontend = _names(["repo-b/src/app/page.tsx"])
    assert {"frontend-lint", "frontend-typecheck", "frontend-unit"} <= frontend
    assert "repe-lint" in frontend

    # rs_factory_seed -> its own pytest
    assert "rs-factory-pytest" in _names(["rs_factory_seed/gen.py"])

    # verification/ alone still triggers the repe lint
    assert "repe-lint" in _names(["verification/lint/x.py"])


def test_paths_outside_the_config_run_no_suites():
    assert _names(["docs/plans/x.md"]) == set()


def test_a_foreign_config_drives_its_own_suites():
    cfg = RelayConfig(
        test_suites=[
            {
                "when_touched": "web/",
                "name": "web-test",
                "cwd": "web",
                "cmd": ["npm", "test"],
                "timeout": 600,
                "runner": "npm",
            }
        ]
    )
    assert _names(["web/src/index.ts"], cfg) == {"web-test"}
    # this repo's paths mean nothing to a foreign config
    assert _names(["backend/app/x.py"], cfg) == set()


# --- init-config ----------------------------------------------------------

def test_write_starter_config_writes_defaults_and_refuses_overwrite(tmp_path):
    path = write_starter_config(tmp_path)
    assert path.is_file()
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["plan_dir"] == default_config().plan_dir
    assert written["test_suites"] == default_config().test_suites

    with pytest.raises(FileExistsError):
        write_starter_config(tmp_path)

    # force overwrites
    path2 = write_starter_config(tmp_path, force=True)
    assert path2 == path


def test_starter_config_round_trips_through_load(tmp_path):
    write_starter_config(tmp_path)
    assert load_config(tmp_path) == default_config()
