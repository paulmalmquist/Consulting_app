"""Tests for ingestion migration safety."""

from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "repo-b"
    / "db"
    / "migrations"
    / "006_ingestion_pipeline.sql"
)


def test_ingestion_migration_exists():
    assert MIGRATION_PATH.exists()


def test_ingestion_migration_core_tables_present():
    sql = MIGRATION_PATH.read_text()
    for table in [
        "app.ingest_source",
        "app.ingest_source_version",
        "app.ingest_recipe",
        "app.ingest_recipe_mapping",
        "app.ingest_run",
        "app.ingest_run_error",
        "app.ingested_table",
        "app.ingested_row",
        "app.metrics_data_point_registry",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql


def test_ingestion_migration_canonical_targets_present():
    sql = MIGRATION_PATH.read_text()
    for table in [
        "app.ingest_vendor",
        "app.ingest_customer",
        "app.ingest_cashflow_event",
        "app.gl_transaction",
        "app.trial_balance",
        "app.deal_pipeline_deal",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql
