from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .paths import ROOT


DROP_RE = re.compile(r"\bDROP\s+(TABLE|COLUMN|SCHEMA)\b", re.IGNORECASE)


def _git_diff_for_file(path: str, cwd: Path | None = None) -> str:
    cp = subprocess.run(["git", "diff", "--", path], cwd=str(cwd or ROOT), capture_output=True, text=True)
    return cp.stdout


def detect_high_risk_requirements(changed_files: list[str], plan_preview_id: str | None = None) -> tuple[list[str], bool]:
    errors: list[str] = []
    requires_high = False
    deleted = [f for f in changed_files if not Path(ROOT / f).exists()]
    if deleted:
        errors.append("Detected file deletion(s); requires soft-delete ledger entry")
        requires_high = True

    sql_files = [f for f in changed_files if f.endswith(".sql")]
    has_migration = any(re.match(r"repo-b/db/schema/\d+_.+\.sql$", f) for f in changed_files)
    for sf in sql_files:
        diff = _git_diff_for_file(sf)
        if DROP_RE.search(diff) and not has_migration:
            errors.append("Schema drop detected without migration file")
            requires_high = True
            break

    env_touched = [f for f in changed_files if "/.env" in f or f.startswith(".env") or f.endswith(".env")]
    if env_touched:
        errors.append("Environment file change requires CONFIRM HIGH RISK")
        requires_high = True

    orch_self = [f for f in changed_files if f.startswith("orchestration/") or f.startswith(".orchestration/")]
    if orch_self:
        errors.append("Orchestration self-change requires CONFIRM HIGH RISK")
        requires_high = True

    if len(changed_files) >= 20 and not plan_preview_id:
        errors.append("Wide multi-file replacement requires plan preview id")

    return errors, requires_high
