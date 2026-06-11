#!/usr/bin/env python3
"""Bronze loader: rs_factory_seed parquet -> novendor_1.rs_factory.bronze_*.

Fail closed: every loaded table's COUNT(*) must equal the row_count in the
seed's output/manifest.json or the loader exits non-zero. Provenance: every
bronze table carries _loaded_at plus _build_sha (the manifest's sqlite dump
sha), pinning exactly which deterministic build the medallion was built from.

    python load_to_databricks.py                       # the ML-relevant tables
    python load_to_databricks.py --tables raw_test_runs,dim_part
    python load_to_databricks.py --transport dbfs      # if UC Volumes is unavailable
    python load_to_databricks.py --source-dir ..\\..\\..\\rs_factory_seed\\output
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from databricks_client import RsFactoryClient

# The medallion's source set — the digital-thread chain the ML pipeline needs.
DEFAULT_TABLES = [
    "raw_test_runs",
    "raw_test_articles",
    "raw_iot_telemetry_samples",
    "fact_process_feature_window",
    "raw_test_limit_violations",
    "raw_qms_inspection_results",
    "raw_qms_ncrs",
    "raw_mes_work_orders",
    "raw_mes_operation_executions",
    "dim_serialized_item",
    "dim_part",
    "dim_model",
    "dim_model_version",
    "fact_ml_prediction",
    "gold_serial_part_readiness",
    "gold_vehicle_launch_readiness",
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_source = Path(__file__).resolve().parents[3] / "rs_factory_seed" / "output"
    parser.add_argument("--source-dir", type=Path, default=default_source)
    parser.add_argument("--tables", type=str, default="")
    parser.add_argument("--transport", choices=["volumes", "dbfs"], default="volumes")
    args = parser.parse_args()

    manifest_path = args.source_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"FAIL: no manifest at {manifest_path} - run `python -m rs_factory_seed build` first")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    build_sha = manifest["sqlite"]["dump_sha256"]
    counts = {t["name"]: t["row_count"] for t in manifest["tables"]}
    tables = [t.strip() for t in args.tables.split(",") if t.strip()] or DEFAULT_TABLES

    client = RsFactoryClient()
    print(f"target: {client.qualified_schema}  build_sha: {build_sha[:12]}…  profile: {manifest['profile']}")

    client.start_warehouse()
    client.wait_for_warehouse()
    try:
        client.sql(f"CREATE SCHEMA IF NOT EXISTS {client.qualified_schema} "
                   f"COMMENT 'RS Factory ML medallion - deterministic rs_factory_seed build {build_sha[:12]}'")
        if args.transport == "volumes":
            client.sql(f"CREATE VOLUME IF NOT EXISTS {client.catalog}.{client.schema}.{client.landing_volume}")

        failures: list[str] = []
        for table in tables:
            parquet = args.source_dir / "parquet" / f"{table}.parquet"
            if not parquet.exists():
                failures.append(f"{table}: parquet missing at {parquet}")
                continue
            if args.transport == "volumes":
                target = client.upload_to_volume(parquet, f"{table}.parquet")
            else:
                target = client.upload_to_dbfs(parquet, f"{table}.parquet")
            client.sql(
                f"CREATE OR REPLACE TABLE {client.qualified_schema}.bronze_{table} "
                f"COMMENT 'Bronze landing of rs_factory_seed {table} (deterministic synthetic)' AS "
                f"SELECT *, current_timestamp() AS _loaded_at, '{build_sha}' AS _build_sha "
                f"FROM read_files('{target}', format => 'parquet')"
            )
            loaded = int(client.sql_scalar(
                f"SELECT COUNT(*) FROM {client.qualified_schema}.bronze_{table}"
            ))
            expected = counts.get(table)
            status = "OK " if loaded == expected else "FAIL"
            print(f"  {status} bronze_{table}: loaded={loaded} manifest={expected}")
            if loaded != expected:
                failures.append(f"{table}: loaded {loaded} != manifest {expected}")

        if failures:
            print("FAIL CLOSED - count mismatches:")
            for f in failures:
                print(f"  {f}")
            return 1
        print(f"bronze complete: {len(tables)} tables match the manifest exactly")
        return 0
    finally:
        pass  # warehouse lifecycle is owned by run_pipeline (one start/stop per run)


if __name__ == "__main__":
    sys.exit(main())
