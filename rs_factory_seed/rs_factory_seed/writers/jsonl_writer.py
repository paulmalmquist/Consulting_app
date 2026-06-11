"""Canonical JSONL artifacts for RAG chunks and AI audit records."""

from __future__ import annotations

import json
from pathlib import Path

from ..dataset import Dataset

JSONL_TABLES = (
    "raw_docs_chunks",
    "fact_ai_action_log",
    "fact_human_feedback",
    "data_quality_findings",
)


def write_jsonl(ds: Dataset, out_dir: Path) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name in JSONL_TABLES:
        if name not in ds.tables:
            continue
        table = ds.get(name)
        path = out_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            for row in table.sorted_rows():
                payload = {column: row.get(column) for column in table.columns}
                handle.write(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n")
        written.append(path)
    return written
