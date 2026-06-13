"""Warehouse export seam for the governed fabric audit trail.

PR 1b establishes the seam, not the implementation. Audit events live
operationally in Postgres (`app.audit_events`); historical compliance and cost
analytics belong in BigQuery (`winston_ops.audit_events_bq`). This module is the
single named target a later PR fills in — a function seam, not a comment, so the
work has an address.

Design contract (enforced when implemented):
  - Reads `app.audit_events` from Postgres (the operational source of truth).
  - Batch-loads to BigQuery via the `google-cloud-bigquery` SDK.
  - Fails closed on missing credentials: never reports success when
    GOOGLE_APPLICATION_CREDENTIALS / BQ_PROJECT_ID are unset.
  - Idempotent by event id so re-runs do not duplicate rows.

Until then every entry point raises NotImplementedError with a pointer to the
plan, so nothing silently believes the export ran.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime

_PLAN_REF = "docs/plans/automated-data-engineering/roadmap.md (Audit BigQuery Export)"


@dataclass(frozen=True)
class ExportResult:
    """Outcome of a warehouse export run. Populated only by a real implementation."""

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


def export_audit_events_to_warehouse(since: datetime | None = None) -> ExportResult:
    """Mirror `app.audit_events` to BigQuery `winston_ops.audit_events_bq`.

    Demo-scale: not yet configured — raises NotImplementedError.
    Production-scale: streaming insert or scheduled batch load (see plan ref).

    Fails closed: if credentials are missing this still raises rather than
    returning a misleading empty ExportResult.
    """
    if not warehouse_export_configured():
        raise NotImplementedError(
            "BigQuery export not configured — set GOOGLE_APPLICATION_CREDENTIALS "
            f"and BQ_PROJECT_ID. Implementation target: {_PLAN_REF}"
        )
    raise NotImplementedError(
        f"Audit warehouse export not yet implemented. Implementation target: {_PLAN_REF}"
    )
