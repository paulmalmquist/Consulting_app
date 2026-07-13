"""Per-repository relay configuration.

One copy of the relay serves many repositories. Everything repo-specific
lives here as data, not code: where plans live, the base ref, which path
prefixes are DB or auth surfaces, which dependency dirs to junction into a
worktree, and which test suites to infer from changed paths.

The defaults reproduce THIS repo's behavior exactly. A repository that wants
different behavior drops a `relay.config.json` at its root; `load_config`
merges that partial JSON over the defaults. With no config file present the
relay behaves as it always has.

Stdlib only. No file at rest carries anything repo-specific except the JSON
a downstream repo writes for itself.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

CONFIG_FILENAME = "relay.config.json"

# The interpreter placeholder in a suite command. run_suites substitutes the
# resolved backend/PATH interpreter for it; an empty resolution leaves the
# slot empty so the suite is SKIPPED honestly instead of failing with a 127.
PY_PLACEHOLDER = "{py}"


def _default_test_suites() -> list[dict]:
    """The suite catalog that reproduces the old infer_suites if-ladder.

    Each rule fires when any changed path starts with `when_touched`. The
    repe-lint rule uses `when_touched_any` (an OR over several prefixes)
    because it triggers on backend OR repo-b OR verification changes. Order
    is preserved: suites append in this list's order, matching the old
    ladder (backend, then repo-b, then rs_factory_seed, then repe-lint).
    """
    return [
        {
            "when_touched": "backend/",
            "name": "backend-ruff",
            "cwd": "backend",
            "cmd": [PY_PLACEHOLDER, "-m", "ruff", "check", "app", "tests"],
            "timeout": 600,
            "runner": "python",
        },
        {
            "when_touched": "backend/",
            "name": "backend-pytest",
            "cwd": "backend",
            "cmd": [PY_PLACEHOLDER, "-m", "pytest", "tests", "-q"],
            "timeout": 1800,
            "runner": "python",
        },
        {
            "when_touched": "repo-b/",
            "name": "frontend-lint",
            "cwd": "repo-b",
            "cmd": ["npm", "run", "lint"],
            "timeout": 900,
            "runner": "npm",
        },
        {
            "when_touched": "repo-b/",
            "name": "frontend-typecheck",
            "cwd": "repo-b",
            "cmd": ["npm", "run", "typecheck"],
            "timeout": 900,
            "runner": "npm",
        },
        {
            "when_touched": "repo-b/",
            "name": "frontend-unit",
            "cwd": "repo-b",
            "cmd": ["npm", "run", "test:unit"],
            "timeout": 900,
            "runner": "npm",
        },
        {
            "when_touched": "rs_factory_seed/",
            "name": "rs-factory-pytest",
            "cwd": "rs_factory_seed",
            "cmd": [PY_PLACEHOLDER, "-m", "pytest", "tests", "-q"],
            "timeout": 900,
            "runner": "python",
        },
        {
            "when_touched_any": ["backend/", "repo-b/", "verification/"],
            "name": "repe-lint",
            "cwd": ".",
            "cmd": [PY_PLACEHOLDER, "-m", "verification.lint.no_legacy_repe_reads", "--json"],
            "timeout": 300,
            "runner": "python",
        },
    ]


@dataclass
class RelayConfig:
    """Everything the relay needs to know about the repository it runs in.

    Defaults reproduce this repo. `test_suites` entries are dicts with the
    shape documented in `_default_test_suites`; a rule matches on either
    `when_touched` (single prefix) or `when_touched_any` (list of prefixes).
    """

    plan_dir: str = "docs/plans/03-implementation-plans/active"
    base_ref: str = "origin/main"
    migration_prefixes: list[str] = field(
        default_factory=lambda: ["supabase/", "repo-b/db/schema/", "migrations/"]
    )
    auth_prefixes: list[str] = field(
        default_factory=lambda: ["backend/", "repo-b/"]
    )
    dep_links: list[str] = field(
        default_factory=lambda: ["repo-b/node_modules", "backend/.venv"]
    )
    test_suites: list[dict] = field(default_factory=_default_test_suites)


def default_config() -> RelayConfig:
    return RelayConfig()


def venv_rel_from(cfg: RelayConfig, default: str = "backend/.venv") -> str:
    """The dep_links entry that names a virtualenv (ends in `.venv`), used to
    resolve the backend interpreter. Falls back to `default` if none match."""
    for rel in cfg.dep_links:
        if str(rel).replace("\\", "/").rstrip("/").endswith(".venv"):
            return rel
    return default


def config_to_dict(cfg: RelayConfig) -> dict:
    """Serialize a config back to the JSON shape --init-config writes."""
    return asdict(cfg)


def _known_keys() -> set[str]:
    return {f.name for f in fields(RelayConfig)}


def merge_config(overrides: dict) -> RelayConfig:
    """Build a config from defaults, replacing only the keys `overrides`
    names. Any unknown key raises a clear error naming it, so a typo in a
    repo's relay.config.json fails loudly instead of silently doing nothing.
    """
    if not isinstance(overrides, dict):
        raise ValueError(
            f"{CONFIG_FILENAME} must contain a JSON object, got {type(overrides).__name__}."
        )
    known = _known_keys()
    unknown = sorted(k for k in overrides if k not in known)
    if unknown:
        raise ValueError(
            f"{CONFIG_FILENAME} has unknown key(s): {', '.join(unknown)}. "
            f"Allowed keys: {', '.join(sorted(known))}."
        )
    base = default_config()
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def load_config(repo_root: Path) -> RelayConfig:
    """Return the repo's RelayConfig.

    Reads `<repo_root>/relay.config.json` when present and merges it over the
    defaults; otherwise returns the defaults unchanged. A malformed JSON file
    raises ValueError with the path, rather than silently falling back to
    defaults (a config that cannot be read must not be ignored).
    """
    path = repo_root / CONFIG_FILENAME
    if not path.is_file():
        return default_config()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"could not read {path}: {exc}") from exc
    return merge_config(raw)


def write_starter_config(repo_root: Path, force: bool = False) -> Path:
    """Write the defaults to `<repo_root>/relay.config.json`, pretty-printed.

    Refuses to overwrite an existing file unless `force` is set. Returns the
    path written.
    """
    path = repo_root / CONFIG_FILENAME
    if path.exists() and not force:
        raise FileExistsError(
            f"{path} already exists. Pass --force to overwrite it."
        )
    path.write_text(
        json.dumps(config_to_dict(default_config()), indent=2) + "\n",
        encoding="utf-8",
    )
    return path
