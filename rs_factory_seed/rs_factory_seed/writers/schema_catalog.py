"""Emit schema_catalog.csv — one row per (table, column) with inferred type + counts."""

from __future__ import annotations

import csv
from pathlib import Path

from ..dataset import Dataset


def _infer_type(rows, col: str) -> str:
    for row in rows[:100]:
        v = row.get(col)
        if isinstance(v, bool):
            return "boolean"
        if isinstance(v, int):
            return "integer"
        if isinstance(v, float):
            return "real"
        if v not in (None, ""):
            return "text"
    return "text"


def write_schema_catalog(ds: Dataset, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["table", "column", "type", "natural_key", "row_count"])
        for name in ds.names():
            t = ds.get(name)
            for col in t.columns:
                w.writerow([
                    name, col, _infer_type(t.rows, col),
                    "yes" if col in t.key else "no", len(t.rows),
                ])
    return out_path
