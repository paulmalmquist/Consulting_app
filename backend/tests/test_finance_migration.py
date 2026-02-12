"""Tests for finance waterfall migration safety."""

from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "repo-b"
    / "db"
    / "migrations"
    / "005_finance_waterfall_v1.sql"
)


def test_finance_migration_exists():
    assert MIGRATION_PATH.exists()


def test_finance_migration_core_tables_present():
    sql = MIGRATION_PATH.read_text()
    for table in [
        "app.investment_fund",
        "app.investment_deal",
        "app.investment_property",
        "app.partner",
        "app.deal_partner",
        "app.waterfall",
        "app.waterfall_tier",
        "app.cashflow_event",
        "app.scenario",
        "app.scenario_assumption",
        "app.model_run",
        "app.model_run_output_summary",
        "app.model_run_distribution",
        "app.model_run_tier_ledger",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql


def test_finance_migration_seed_data_present():
    sql = MIGRATION_PATH.read_text()
    assert "Sunset Commons JV" in sql
    assert "Blue Oak Capital" in sql
    assert "Winston Sponsor" in sql
    assert "generated_refinance_proceeds" not in sql  # runtime engine note, not migration data.
