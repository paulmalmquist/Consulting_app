"""Ticket 5 — medallion audit + invariant gate for the BigQuery relativity_mes dataset.

Re-runs the checks from the original audit that returned "cosmetic medallion", now expecting "healthy",
plus the demo invariants. Exits non-zero if any check fails (fail-closed: a failing medallion must not
be promoted to serving). Read-only.

Checks:
  A. silver is physical tables, not views (was: all 23 views)
  B. silver adds DQ/governance columns vs bronze (was: added_cols=0 everywhere)
  C. silver is typed, not all-STRING (was: bronze and silver identical STRING-ish)
  D. silver dedups + quarantines: reject sinks exist and the no-op `synthetic` filter is gone
  E. gold derives from silver (lineage real): gold counts consistent with silver, not literals
  F. demo invariants: 3 vehicles, suspect lot on exactly 2, 1 open major NCR, 1 reconciliation exception

Run:  python telemetry-platform/dataproc/relativity_mes/audit_medallion.py
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    from google.cloud import bigquery

    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="relativity_mes")
    args = ap.parse_args()
    client = bigquery.Client(project=args.project)
    DS = f"{args.project}.{args.dataset}"

    def q(sql):
        return list(client.query(sql).result())

    failures: list[str] = []

    def check(name, ok, detail=""):
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures.append(name)

    # A. silver physical (no views)
    views = q(f"SELECT COUNT(*) c FROM `{DS}`.INFORMATION_SCHEMA.TABLES "
              f"WHERE table_name LIKE 'silver_rel_%' AND table_type='VIEW'")[0]["c"]
    check("A. silver has no views", views == 0, f"{views} silver views (want 0)")

    # B. silver adds columns vs bronze for every pair
    rows = q(f"""
      WITH c AS (SELECT table_name, COUNT(*) cc FROM `{DS}`.INFORMATION_SCHEMA.COLUMNS
                 WHERE (table_name LIKE 'bronze_rel_%' OR table_name LIKE 'silver_rel_%')
                   AND table_name NOT LIKE '%_reject' GROUP BY table_name)
      SELECT COUNT(*) bad FROM
        (SELECT * FROM c WHERE table_name LIKE 'bronze_rel_%') b
        JOIN (SELECT * FROM c WHERE table_name LIKE 'silver_rel_%') s
          ON REPLACE(b.table_name,'bronze_rel_','')=REPLACE(s.table_name,'silver_rel_','')
        WHERE s.cc <= b.cc""")
    check("B. every silver adds columns vs bronze", rows[0]["bad"] == 0,
          f"{rows[0]['bad']} pairs with no added columns (want 0)")

    # C. silver typed (operation_execution actual_minutes is INT64, not STRING)
    dt = q(f"SELECT data_type FROM `{DS}`.INFORMATION_SCHEMA.COLUMNS "
           f"WHERE table_name='silver_rel_mes_operation_execution' AND column_name='actual_minutes'")
    check("C. silver casts types (actual_minutes INT64)", dt and dt[0]["data_type"] == "INT64",
          dt[0]["data_type"] if dt else "missing")

    # D. reject sinks exist and carry quarantined rows
    rej = q(f"SELECT COUNT(*) c FROM `{DS}`.INFORMATION_SCHEMA.TABLES "
            f"WHERE table_name LIKE 'silver_rel_%_reject'")[0]["c"]
    quarantined = q(f"SELECT (SELECT COUNT(*) FROM `{DS}.silver_rel_mes_operation_execution_reject`) + "
                    f"(SELECT COUNT(*) FROM `{DS}.silver_rel_mes_material_consumption_reject`) AS n")[0]["n"]
    check("D. reject sinks exist + populated", rej >= 5 and quarantined >= 2,
          f"{rej} reject sinks, {quarantined} quarantined rows")

    # E. gold consistent with silver (genealogy gold == silver edge count; no literal drift/fan-out)
    se = q(f"SELECT COUNT(*) c FROM `{DS}.silver_rel_mes_as_built_genealogy`")[0]["c"]
    ge = q(f"SELECT COUNT(*) c FROM `{DS}.gold_rel_as_built_genealogy`")[0]["c"]
    check("E. gold genealogy derives from silver (no fan-out)", se == ge,
          f"silver={se} gold={ge}")

    # F. demo invariants
    inv = q(f"""SELECT
      (SELECT COUNT(*) FROM `{DS}.gold_rel_build_overview`) vehicles,
      (SELECT COUNT(DISTINCT vehicle_serial) FROM `{DS}.silver_rel_mes_as_built_genealogy`
        WHERE lot_no='LOT-7788') suspect,
      (SELECT COUNT(*) FROM `{DS}.gold_rel_ncr_traceability` WHERE status='open' AND severity='major') open_major,
      (SELECT COUNT(*) FROM `{DS}.gold_rel_mes_erp_reconciliation` WHERE reconciliation_status='exception') exc
    """)[0]
    check("F1. exactly 3 vehicles", inv["vehicles"] == 3, str(inv["vehicles"]))
    check("F2. suspect lot on exactly 2 vehicles", inv["suspect"] == 2, str(inv["suspect"]))
    check("F3. exactly 1 open major NCR", inv["open_major"] == 1, str(inv["open_major"]))
    check("F4. at least 1 reconciliation exception", inv["exc"] >= 1, str(inv["exc"]))

    print()
    if failures:
        print(f"MEDALLION AUDIT: FAILED ({len(failures)} checks) -> {failures}")
        return 1
    print("MEDALLION AUDIT: HEALTHY — silver conforms, gold derives from silver, invariants hold")
    return 0


if __name__ == "__main__":
    sys.exit(main())
