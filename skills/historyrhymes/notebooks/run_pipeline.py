"""Run the full History Rhymes pipeline: load -> features -> classify -> score -> export.

This is the daily batch job. Each step is idempotent (MERGE/ON CONFLICT).
The warehouse is started once at the top and stopped once at the end.

Fixes applied:
  - Single warehouse lifecycle (no start/stop thrashing)
  - Shared DatabricksClient passed to each step
  - Inter-step row-count validation
  - Per-step status reporting

Usage:
    python -m skills.historyrhymes.notebooks.run_pipeline
"""
from __future__ import annotations

import importlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient

STEPS = [
    ("01_load_signals", "Load raw signals", "novendor_1.historyrhymes.signals_raw"),
    ("02_build_features", "Build features", "novendor_1.historyrhymes.signals_featured"),
    ("03_classify_regime", "Classify regime", "novendor_1.historyrhymes.market_state_daily"),
    ("04_score_analogs", "Score analogs", "novendor_1.historyrhymes.history_rhymes_daily"),
    ("05_export_to_supabase", "Export to Supabase", None),
]


def validate_row_count(client: DatabricksClient, table: str, min_rows: int = 1) -> bool:
    """Check that a table has at least min_rows rows for today."""
    result = client.execute_sql(f"""
        SELECT COUNT(*) FROM {table}
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM {table})
    """)
    rows = result.get("result", {}).get("data_array", [])
    count = int(rows[0][0]) if rows else 0
    return count >= min_rows


def main():
    print("=" * 60)
    print("History Rhymes Daily Pipeline")
    print("=" * 60)

    total_start = time.time()

    # Single warehouse lifecycle
    client = DatabricksClient()
    print("\nStarting warehouse (single lifecycle)...")
    client.start_warehouse()
    client.wait_for_warehouse("RUNNING")
    print("Warehouse running.\n")

    results = []

    for module_name, label, validate_table in STEPS:
        print(f"{'─' * 40}")
        print(f"Step: {label}")
        print(f"{'─' * 40}")
        step_start = time.time()

        try:
            # Import from the notebooks package
            mod = importlib.import_module(
                f"skills.historyrhymes.notebooks.{module_name}"
            )
            # Pass the shared client to avoid warehouse start/stop thrashing
            mod.main(client=client)
            elapsed = time.time() - step_start

            # Validate output if applicable
            if validate_table:
                ok = validate_row_count(client, validate_table)
                if not ok:
                    print(f"  WARNING: {validate_table} has 0 rows for latest date")
                    results.append((label, "WARNING", elapsed))
                else:
                    print(f"  Validated: {validate_table} has data")
                    results.append((label, "OK", elapsed))
            else:
                results.append((label, "OK", elapsed))

            print(f"  Completed in {elapsed:.1f}s\n")

        except Exception as e:
            elapsed = time.time() - step_start
            print(f"  FAILED after {elapsed:.1f}s: {e}\n")
            results.append((label, f"FAILED: {e}", elapsed))

    # Stop warehouse
    print("Stopping warehouse...")
    try:
        client.stop_warehouse()
    except Exception as e:
        print(f"  Warning: could not stop warehouse: {e}")

    total = time.time() - total_start

    # Summary
    print(f"\n{'=' * 60}")
    print(f"Pipeline Summary ({total:.1f}s total)")
    print(f"{'=' * 60}")
    for label, status, elapsed in results:
        icon = "OK" if status == "OK" else "WARN" if "WARNING" in status else "FAIL"
        print(f"  [{icon}] {label} ({elapsed:.1f}s)")

    failed = [r for r in results if "FAILED" in r[1]]
    if failed:
        print(f"\n{len(failed)} step(s) failed. Check output above.")
        sys.exit(1)

    print("\nPipeline complete.")


if __name__ == "__main__":
    main()
