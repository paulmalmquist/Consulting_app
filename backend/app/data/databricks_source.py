"""Databricks data source — stub for client deployments using Databricks SQL.

To activate: set DATA_SOURCE=databricks and configure:
  - DATABRICKS_HOST
  - DATABRICKS_HTTP_PATH
  - DATABRICKS_TOKEN
"""

from __future__ import annotations

from typing import Any

from app.data.source import DataSource, QueryResult, TableInfo


class DatabricksDataSource(DataSource):
    """Stub — implement with databricks-sql-connector when deploying to a Databricks client."""

    def execute_query(self, sql: str, params: list[Any] | None = None) -> QueryResult:
        raise NotImplementedError(
            "Databricks data source not yet implemented. "
            "Install databricks-sql-connector and configure DATABRICKS_HOST."
        )

    def get_tables(self) -> list[TableInfo]:
        raise NotImplementedError("Databricks data source not yet implemented.")

    def health_check(self) -> bool:
        return False
