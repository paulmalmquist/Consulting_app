"""Snowflake data source — stub for client deployments using Snowflake.

To activate: set DATA_SOURCE=snowflake and configure:
  - SNOWFLAKE_ACCOUNT
  - SNOWFLAKE_USER
  - SNOWFLAKE_PASSWORD
  - SNOWFLAKE_WAREHOUSE
  - SNOWFLAKE_DATABASE
"""

from __future__ import annotations

from typing import Any

from app.data.source import DataSource, QueryResult, TableInfo


class SnowflakeDataSource(DataSource):
    """Stub — implement with snowflake-connector-python when deploying to a Snowflake client."""

    def execute_query(self, sql: str, params: list[Any] | None = None) -> QueryResult:
        raise NotImplementedError(
            "Snowflake data source not yet implemented. "
            "Install snowflake-connector-python and configure SNOWFLAKE_ACCOUNT."
        )

    def get_tables(self) -> list[TableInfo]:
        raise NotImplementedError("Snowflake data source not yet implemented.")

    def health_check(self) -> bool:
        return False
