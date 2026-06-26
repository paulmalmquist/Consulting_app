"""Deterministic synthetic seed generator for the Relativity MES/Lakebase Sandbox.

Everything this package emits is SYNTHETIC and clearly labeled. It is shaped like a documented
Manufacturo MES + a generic ERP/PLM facsimile; it is NOT a real schema, a real API, or real
program data. No real Relativity / Manufacturo identifiers are used (a test enforces this).

The generator is the single source of truth: one in-memory build of fictional vehicles, lots,
work orders, NCRs, and costs is rendered to (a) committed JSON fixtures the frontend dashboards
read and (b) SQL seed migrations that populate the `rel_*` source tables and `gold.rel_*` marts in
Lakebase Postgres. Both targets come from the same data so fixtures and Lakebase never drift.
"""

from .generate import build_dataset, MASTER_SEED  # noqa: F401
