"""Run identity and the run-folder write choke point.

A relay run owns one folder under <repo-root>/.orchestration/runs/<run_id>/.
Every artifact write goes through RunPaths.write(), which applies secret
redaction. Nothing else in the relay writes into the run folder directly.

Manifest (see docs/reference/CODING_RELAY.md):
    run.json
    plan/original-plan.md          plan/normalized-criteria.md
    env/preflight.json             env/<cli>-help.txt
    iterations/NN/...              (prompts, outputs, diff, safety, tests, verdict)
    report/final-report.md         report/PR_BODY.md   report/pr.json | MANUAL_PR.md
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from orchestration.coding_relay.redact import redact

RUNS_DIRNAME = ".orchestration/runs"


def safe_slug(title: str, max_len: int = 24) -> str:
    """Lowercase [a-z0-9-] slug for branch and folder names."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:max_len].rstrip("-") or "task"


def new_run_id(slug: str, now: datetime | None = None) -> str:
    # Seconds in the stamp: a fast-failing run followed by an immediate
    # rerun must never reuse (and corrupt) the previous run's receipts.
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{slug}"


class RunPaths:
    """All paths for one run, plus the redacting write choke point."""

    def __init__(self, repo_root: Path, run_id: str):
        self.repo_root = repo_root
        self.run_id = run_id
        self.root = repo_root / RUNS_DIRNAME / run_id

    # -- layout ----------------------------------------------------------
    @property
    def plan_dir(self) -> Path:
        return self.root / "plan"

    @property
    def env_dir(self) -> Path:
        return self.root / "env"

    @property
    def report_dir(self) -> Path:
        return self.root / "report"

    def iteration_dir(self, n: int) -> Path:
        return self.root / "iterations" / f"{n:02d}"

    def review_bundle_dir(self, n: int) -> Path:
        return self.iteration_dir(n) / "review-bundle"

    def tests_dir(self, n: int) -> Path:
        return self.iteration_dir(n) / "tests"

    @property
    def run_json(self) -> Path:
        return self.root / "run.json"

    # -- writes ----------------------------------------------------------
    def write(self, relpath: str, text: str) -> Path:
        """Write one artifact, redacted, UTF-8. relpath is run-folder relative."""
        target = self.root / relpath
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(redact(text), encoding="utf-8")
        return target

    def write_json(self, relpath: str, payload: Any) -> Path:
        return self.write(relpath, json.dumps(payload, indent=2, default=str) + "\n")

    def update_run_json(self, **fields: Any) -> dict[str, Any]:
        """Merge fields into run.json (read-modify-write; single process)."""
        data: dict[str, Any] = {}
        if self.run_json.is_file():
            try:
                data = json.loads(self.run_json.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {}
        data.update(fields)
        self.write_json("run.json", data)
        return data
