"""Warehouse export seam for the governed fabric audit trail.

PR 1b established the seam; PR 3 wires it to the manual export scaffold. Audit
events live operationally in Postgres (`app.audit_events`); historical compliance
and cost analytics belong in BigQuery (`winston_ops.audit_events_bq`).

The actual export lives in the repo-root script `scripts/export_audit_to_bq.py`
(the single, deliberate, NOT-scheduled entry point). This seam delegates to that
script's importable core so backend callers have one address.

Design contract:
  - Reads `app.audit_events` from Postgres (the operational source of truth).
  - Batch-loads to BigQuery via the `google-cloud-bigquery` SDK.
  - Fails closed on missing credentials: never reports success when
    GOOGLE_APPLICATION_CREDENTIALS / BQ_PROJECT_ID are unset.
  - Idempotent by event id so re-runs do not duplicate rows.
  - No continuous replication, no scheduled export (PR 3 scope).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

_PLAN_REF = "docs/plans/automated-data-engineering/roadmap.md (Audit BigQuery Export)"
_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "scripts"


@dataclass(frozen=True)
class ExportResult:
    """Outcome of a warehouse export run."""

    exported: int
    skipped: int
    target_table: str
    since: datetime | None


def warehouse_export_configured() -> bool:
    """True only when both BigQuery credentials and a project ref are present.

    Lets callers (and the governance-stats surface) report export readiness
    honestly without attempting a connection.
    """
    return bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")) and bool(os.getenv("BQ_PROJECT_ID"))


def export_audit_events_to_warehouse(since: datetime | None = None, *, dry_run: bool = False) -> ExportResult:
    """Mirror `app.audit_events` to BigQuery `winston_ops.audit_events_bq`.

    Delegates to scripts/export_audit_to_bq.py::export_audit_events. Fails closed:
    raises ExportNotConfigured (NOT a misleading empty result) when creds are unset.

    See plan ref for the deferral note: this is the manual path only — no scheduled
    export, no continuous replication.
    """
    if str(_SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS_DIR))
    import export_audit_to_bq as exporter  # repo-root scripts/

    result = exporter.export_audit_events(since, dry_run=dry_run)
    return ExportResult(
        exported=result.exported,
        skipped=0,
        target_table=result.target_table,
        since=result.since,
    )
