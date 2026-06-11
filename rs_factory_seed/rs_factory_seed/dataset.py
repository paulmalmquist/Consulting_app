"""In-memory table accumulator shared by generators and writers.

Each table declares a natural key + an owning source_system; writers sort by the key so
artifacts are byte-identical across runs. Every row is stamped with `source_system`
lineage. The manifest records per-table provenance (counts, sha256, scenario ids,
dependency order).
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
    source_system: str
    order: int  # dependency order (insertion order across generators)

    def sorted_rows(self) -> list[dict[str, Any]]:
        def sort_key(r: dict[str, Any]):
            return tuple(_norm(r.get(k)) for k in self.key)
        return sorted(self.rows, key=sort_key)

    def scenario_ids(self) -> list[str]:
        vals = {r.get("scenario_id") for r in self.rows if r.get("scenario_id")}
        return sorted(str(v) for v in vals)


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
        source_system: str,
        columns: Iterable[str] | None = None,
    ) -> Table:
        rows = list(rows)
        # Stamp source_system lineage on every row (consistent, last column).
        for r in rows:
            r.setdefault("source_system", source_system)
        key = tuple(key)
        if columns is not None:
            cols = tuple(columns)
            if "source_system" not in cols:
                cols = cols + ("source_system",)
        elif rows:
            cols = tuple(rows[0].keys())
        else:
            cols = tuple(key) + ("source_system",)
        if name in self.tables:
            raise ValueError(f"table {name!r} already added")
        t = Table(name=name, rows=rows, key=key, columns=cols,
                  source_system=source_system, order=len(self.tables))
        self.tables[name] = t
        return t

    def get(self, name: str) -> Table:
        return self.tables[name]

    def names(self) -> list[str]:
        return sorted(self.tables)

    def ordered(self) -> list[Table]:
        return sorted(self.tables.values(), key=lambda t: t.order)
