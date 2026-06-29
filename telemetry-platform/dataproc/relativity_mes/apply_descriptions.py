"""Ticket 5 — set table descriptions on the silver/gold medallion tables (audit found 0 descriptions).

Cheap credibility + governance: every silver/gold table gets a one-line description stating its layer,
what it does, and its source. Read-modify-write of table metadata only (no data touched). Idempotent.

Run:  python telemetry-platform/dataproc/relativity_mes/apply_descriptions.py
"""
from __future__ import annotations

import argparse
import sys

SILVER_DESC = ("Silver (conformed) — typed, vocabulary-normalized, deduplicated, DQ-gated view of "
               "bronze_{entity}, produced by the Dataproc PySpark medallion (rel_silver.py). "
               "Bad rows are quarantined to silver_rel_{entity}_reject. SYNTHETIC.")
REJECT_DESC = ("Silver quarantine sink — rows from bronze_{entity} that failed a data-quality rule "
               "(see reject_reason). Excluded from the conformed silver table. SYNTHETIC.")
GOLD_DESC = {
    "gold_rel_build_overview": "Gold mart — per-vehicle build KPIs (counts, cost, variance, readiness), "
                               "derived from silver via rel_gold.py. SYNTHETIC.",
    "gold_rel_as_built_genealogy": "Gold mart — as-built genealogy edges enriched with inspection / NCR "
                                   "/ disposition, derived from silver. SYNTHETIC.",
    "gold_rel_ncr_traceability": "Gold mart — NCRs enriched with disposition, where-used vehicle count, "
                                 "and rework estimate, derived from silver. SYNTHETIC.",
    "gold_rel_build_cost_rollup": "Gold mart — per-work-order material/labor/overhead/rework cost "
                                  "rollup, derived from silver. SYNTHETIC.",
    "gold_rel_mes_erp_reconciliation": "Gold mart — per-work-order MES actual vs ERP standard cost with "
                                       "variance category and exception flag, derived from silver. SYNTHETIC.",
}


def main() -> int:
    from google.cloud import bigquery

    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="relativity_mes")
    args = ap.parse_args()
    client = bigquery.Client(project=args.project)
    DS = f"{args.project}.{args.dataset}"

    n = 0
    for t in client.list_tables(DS):
        name = t.table_id
        desc = None
        if name.startswith("silver_rel_") and name.endswith("_reject"):
            entity = name[len("silver_rel_"):-len("_reject")]
            desc = REJECT_DESC.format(entity=entity)
        elif name.startswith("silver_rel_"):
            entity = name[len("silver_rel_"):]
            desc = SILVER_DESC.format(entity=entity)
        elif name in GOLD_DESC:
            desc = GOLD_DESC[name]
        if desc:
            tbl = client.get_table(f"{DS}.{name}")
            tbl.description = desc
            client.update_table(tbl, ["description"])
            n += 1
            print(f"[desc] {name}")
    print(f"[desc] set descriptions on {n} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
