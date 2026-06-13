"""Deterministic dataset manifest (manifest.json).

Records, per table: source_system, dependency order, row count, natural key, columns,
scenario ids touched, and the sha256 of its CSV artifact; plus the sqlite dump sha256 and
build metadata (generator version, master seed, profile, as_of). Relative paths only, so
the manifest is byte-identical across builds. Proof for ETL / seed-pack loading later.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..dataset import Dataset
from ..lineage import GENERATOR_VERSION
from .. import MASTER_SEED
from .sqlite_writer import sqlite_dump


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_manifest(ds: Dataset, ctx, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    csv_dir = out_dir / "csv"
    sqlite_path = out_dir / "sqlite" / "relativity_factory_demo.sqlite"

    tables = []
    for t in sorted(ds.tables.values(), key=lambda x: x.name):
        csv_path = csv_dir / f"{t.name}.csv"
        tables.append({
            "name": t.name,
            "source_system": t.source_system,
            "dependency_order": t.order,
            "row_count": len(t.rows),
            "natural_key": list(t.key),
            "columns": list(t.columns),
            "scenario_ids": t.scenario_ids(),
            "csv_path": f"csv/{t.name}.csv",
            "csv_sha256": _sha256_file(csv_path) if csv_path.exists() else None,
        })

    artifacts = []
    for path in sorted(out_dir.rglob("*")):
        if not path.is_file() or path.name == "manifest.json" or path.suffix == ".sqlite":
            continue
        artifacts.append({
            "path": path.relative_to(out_dir).as_posix(),
            "sha256": _sha256_file(path),
        })

    manifest = {
        "generator": "rs_factory_seed",
        "generator_version": GENERATOR_VERSION,
        "master_seed": MASTER_SEED,
        "profile": ctx.profile,
        "as_of": ctx.as_of.isoformat(),       # fixed; NOT wall-clock
        "timeline_start": ctx.start.isoformat(),
        "table_count": len(tables),
        "total_rows": sum(t["row_count"] for t in tables),
        "sqlite": {
            "path": "sqlite/relativity_factory_demo.sqlite",
            "dump_sha256": hashlib.sha256(sqlite_dump(sqlite_path).encode("utf-8")).hexdigest()
            if sqlite_path.exists() else None,
        },
        "artifacts": artifacts,
        "tables": tables,
    }

    out_path = out_dir / "manifest.json"
    out_path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return out_path
