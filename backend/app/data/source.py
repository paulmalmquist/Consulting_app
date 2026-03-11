"""Data source ABC — storage-agnostic query execution.

DATA_SOURCE env var selects the implementation:
  - postgres   (default) — uses the existing psycopg3 get_cursor()
  - databricks — stub for Databricks SQL warehouse
  - snowflake  — stub for Snowflake

This abstraction lets the analytics workspace run queries against
whatever warehouse a client has, without changing service code.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

_DATA_SOURCE_KEY = os.getenv("DATA_SOURCE", "postgres")
_source_instance: DataSource | None = None


@dataclass
class ColumnInfo:
    name: str
    data_type: str
    description: str = ""


@dataclass
class TableInfo:
    name: str
    columns: list[ColumnInfo]
    description: str = ""


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    elapsed_ms: int = 0


class DataSource(ABC):
    """Abstract base for pluggable data sources."""

    @abstractmethod
    def execute_query(self, sql: str, params: list[Any] | None = None) -> QueryResult:
        """Execute a read-only SQL query and return results."""
        ...

    @abstractmethod
    def get_tables(self) -> list[TableInfo]:
        """Return the list of available tables with column metadata."""
        ...

    @abstractmethod
    def health_check(self) -> bool:
        """Return True if the data source is reachable."""
        ...


def get_data_source() -> DataSource:
    """Return the singleton data source instance (lazy-init)."""
    global _source_instance
    if _source_instance is not None:
        return _source_instance

    if _DATA_SOURCE_KEY == "databricks":
        from app.data.databricks_source import DatabricksDataSource
        _source_instance = DatabricksDataSource()
    elif _DATA_SOURCE_KEY == "snowflake":
        from app.data.snowflake_source import SnowflakeDataSource
        _source_instance = SnowflakeDataSource()
    else:
        from app.data.postgres_source import PostgresDataSource
        _source_instance = PostgresDataSource()

    return _source_instance
