"""Tests for tasks migration safety and expected schema surface."""

from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "repo-b"
    / "db"
    / "migrations"
    / "007_tasks_module.sql"
)


def test_tasks_migration_exists():
    assert MIGRATION_PATH.exists()


def test_tasks_migration_core_tables_present():
    sql = MIGRATION_PATH.read_text()
    for table in [
        "app.task_project",
        "app.task_board",
        "app.task_status",
        "app.task_sprint",
        "app.task_issue",
        "app.task_comment",
        "app.task_activity",
        "app.task_issue_link",
        "app.task_issue_attachment",
        "app.task_issue_context_link",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql


def test_tasks_migration_indexes_present():
    sql = MIGRATION_PATH.read_text()
    assert "task_issue_project_issue_key_idx" in sql
    assert "task_issue_project_status_sprint_idx" in sql
    assert "task_issue_labels_gin_idx" in sql
    assert "task_issue_search_idx" in sql


def test_tasks_migration_metrics_registry_seeded():
    sql = MIGRATION_PATH.read_text()
    for key in [
        "tasks.created_count",
        "tasks.completed_count",
        "tasks.cycle_time_days",
        "tasks.wip_count",
        "tasks.by_status",
    ]:
        assert f"'{key}'" in sql
