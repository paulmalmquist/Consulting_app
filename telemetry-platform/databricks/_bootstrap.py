"""
Telemetry Platform — shared Databricks bootstrap.

Loads DATABRICKS_PAT from the environment, or from the repo-root claude_token.txt if the env var is
unset, WITHOUT printing/logging the value. Returns a DatabricksClient configured for the telemetry
schema via fully-qualified SQL (it does NOT edit the shared databricks.json).

Usage:
    from _bootstrap import get_client, TEL
    client = get_client()                 # raises if no usable PAT
    client.execute_sql(f"SELECT 1")
    # tables are addressed as f"{TEL}.bronze_cmapss" etc.
"""

import os
import sys
from pathlib import Path

# Make the historyrhymes client importable without copying it.
_HR_SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "historyrhymes" / "scripts"
if str(_HR_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_HR_SCRIPTS))

from databricks_client import DatabricksClient  # noqa: E402

# Fully-qualified telemetry namespace. We never touch the shared config's `schema` (historyrhymes).
CATALOG = "novendor_1"
SCHEMA = "telemetry"
TEL = f"{CATALOG}.{SCHEMA}"

_REPO_ROOT = Path(__file__).resolve().parents[2]
_TOKEN_FILE = _REPO_ROOT / "claude_token.txt"


def _load_pat_into_env() -> bool:
    """Ensure DATABRICKS_PAT is in os.environ. Never prints the value. Returns True if available."""
    if os.environ.get("DATABRICKS_PAT"):
        return True
    if _TOKEN_FILE.exists():
        token = _TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            os.environ["DATABRICKS_PAT"] = token
            return True
    return False


def get_client() -> DatabricksClient:
    """Return a DatabricksClient. Raises ValueError if no PAT is available (never echoes the token)."""
    if not _load_pat_into_env():
        raise ValueError(
            "DATABRICKS_PAT not set and claude_token.txt missing/empty. "
            "Cannot authenticate Databricks."
        )
    return DatabricksClient()


def pat_source() -> str:
    """Report WHERE the PAT came from, without revealing it. For honest logging."""
    if os.environ.get("DATABRICKS_PAT") and not _TOKEN_FILE.exists():
        return "env:DATABRICKS_PAT"
    if _TOKEN_FILE.exists():
        return "file:claude_token.txt"
    return "none"
