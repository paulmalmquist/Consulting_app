"""Run the full History Rhymes pipeline: load -> features -> classify -> score -> export.

This is the daily batch job. Each step is idempotent (MERGE/ON CONFLICT).
The warehouse is started once at the top and stopped once at the end.

===== TEACHING NOTES (plain language) =====
WHAT THIS FILE DOES:
  This is the daily ORCHESTRATOR — the conductor that runs the four analysis steps
  in the right order and checks each one's work before moving on. It does no math
  itself; it just calls the other notebooks in sequence:
    01 load     -> pull the raw market signals into signals_raw
    02 features -> turn raw values into z-scores/deltas/percentiles (the comparable
                   "how unusual is today" numbers)
    03 classify -> apply the rule set to label today's regime (market mood)
    04 score    -> find the top-3 historical episodes most like today
    05 export   -> push the results out to Supabase for the UI to read
  "Idempotent" means running it twice on the same day is safe: each step overwrites
  today's row instead of piling up duplicates.

WHERE YOU SEE THIS:
  Indirectly everywhere in History Rhymes — this is the job that refreshes all the
  data the UI displays. If a regime label or analog looks stale, this is the run
  that should have updated it.

INPUTS -> OUTPUT:
  Input: yesterday's tables + today's fresh signals. Output: today's row written to
  every History Rhymes table, plus a pass/warn/fail summary printed per step.

HOW TO READ THE OUTPUT:
  After each step it runs validate_row_count() — a sanity check that the step
  actually wrote at least one row for today. OK = step produced data; WARNING = the
  step ran but its table has 0 rows for today (likely an upstream gap); FAILED = the
  step threw an error. The warehouse (the compute that runs the SQL) is started once
  up front and stopped once at the end to avoid wasteful start/stop cost.

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

# The ordered recipe: (module to import, human label, table to sanity-check after).
# Order matters — each step consumes the table the previous step wrote. The third
# tuple element is the table validate_row_count() checks; None means "no check."
STEPS = [
    ("01_load_signals", "Load raw signals", "novendor_1.historyrhymes.signals_raw"),
    ("02_build_features", "Build features", "novendor_1.historyrhymes.signals_featured"),
    ("03_classify_regime", "Classify regime", "novendor_1.historyrhymes.market_state_daily"),
    ("04_score_analogs", "Score analogs", "novendor_1.historyrhymes.history_rhymes_daily"),
    ("05_export_to_supabase", "Export to Supabase", None),
]


def validate_row_count(client: DatabricksClient, table: str, min_rows: int = 1) -> bool:
    """Check that a table has at least min_rows rows for today.

    Plain language: confirm the step we just ran actually produced output for the
    latest date. Returns True if the table has data for its newest as_of_date,
    False if it's empty — which the orchestrator surfaces as a WARNING.
    """
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
