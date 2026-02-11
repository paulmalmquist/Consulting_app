"""Tests for accounting-first migration safety."""

from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "repo-b"
    / "db"
    / "migrations"
    / "004_accounting_first_class.sql"
)


def test_accounting_migration_exists():
    assert MIGRATION_PATH.exists()


def test_accounting_migration_is_idempotent():
    sql = MIGRATION_PATH.read_text()
    assert "ON CONFLICT (key) DO UPDATE" in sql
    assert "ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true" in sql
    assert "ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true" in sql
    assert "CREATE TABLE IF NOT EXISTS app.accounts" in sql
    assert "CREATE TABLE IF NOT EXISTS app.journal_entries" in sql
    assert "CREATE TABLE IF NOT EXISTS app.journal_entry_lines" in sql
    assert "CREATE TABLE IF NOT EXISTS app.vendors" in sql
    assert "CREATE TABLE IF NOT EXISTS app.invoices" in sql
    assert "CREATE TABLE IF NOT EXISTS app.payments" in sql


def test_accounting_migration_caps_present():
    sql = MIGRATION_PATH.read_text()
    for key in [
        "general-ledger",
        "journal-entries",
        "accounts-payable",
        "accounts-receivable",
        "vendor-management",
        "reporting",
        "audit-log",
    ]:
        assert f"'{key}'" in sql
