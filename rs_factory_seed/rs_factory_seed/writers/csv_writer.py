"""Deterministic CSV writer. Sorts by natural key, fixed column order, LF newlines."""

from __future__ import annotations

import csv
from pathlib import Path

from ..dataset import Dataset


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def write_csv(ds: Dataset, out_dir: Path) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name in ds.names():
        t = ds.get(name)
        path = out_dir / f"{name}.csv"
        # newline="" + explicit \n keeps it identical across OSes.
        with open(path, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh, lineterminator="\n")
            w.writerow(t.columns)
            for row in t.sorted_rows():
                w.writerow([_fmt(row.get(c)) for c in t.columns])
        written.append(path)
    return written
