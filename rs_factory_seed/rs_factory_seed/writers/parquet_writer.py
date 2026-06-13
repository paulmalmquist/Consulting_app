"""Deterministic Parquet output for lakehouse-oriented demos."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ..dataset import Dataset


def write_parquet(ds: Dataset, out_dir: Path) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for table in ds.ordered():
        path = out_dir / f"{table.name}.parquet"
        rows = [{column: row.get(column) for column in table.columns}
                for row in table.sorted_rows()]
        arrow = pa.Table.from_pylist(rows)
        pq.write_table(
            arrow,
            path,
            compression="zstd",
            use_dictionary=False,
            write_statistics=True,
            data_page_version="1.0",
        )
        written.append(path)
    return written
