"""In-memory table accumulator shared by generators and writers.

Each table declares a natural key; writers sort by it so artifacts are byte-identical
across runs. Column order is the key order of the first row (generators build rows with
a stable key order).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass
class Table:
    name: str
    rows: list[dict[str, Any]]
    key: tuple[str, ...]
    columns: tuple[str, ...]

    def sorted_rows(self) -> list[dict[str, Any]]:
        def sort_key(r: dict[str, Any]):
            return tuple(_norm(r.get(k)) for k in self.key)
        return sorted(self.rows, key=sort_key)


def _norm(v: Any):
    # Stable, type-uniform sort key (avoids None/str/int comparison errors).
    if v is None:
        return (0, "")
    if isinstance(v, bool):
        return (1, int(v))
    if isinstance(v, (int, float)):
        return (2, float(v))
    return (3, str(v))


@dataclass
class Dataset:
    tables: dict[str, Table] = field(default_factory=dict)

    def add(
        self,
        name: str,
        rows: Iterable[dict[str, Any]],
        key: Iterable[str],
        columns: Iterable[str] | None = None,
    ) -> Table:
        rows = list(rows)
        key = tuple(key)
        if columns is not None:
            cols = tuple(columns)
        elif rows:
            cols = tuple(rows[0].keys())
        else:
            cols = key
        if name in self.tables:
            raise ValueError(f"table {name!r} already added")
        t = Table(name=name, rows=rows, key=key, columns=cols)
        self.tables[name] = t
        return t

    def get(self, name: str) -> Table:
        return self.tables[name]

    def names(self) -> list[str]:
        return sorted(self.tables)
