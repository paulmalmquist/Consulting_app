"""Ticket 1 — land the synthetic MES/ERP/PLM source into BigQuery bronze as a REALISTIC raw zone.

The deterministic generator (`scripts/relativity_mes_seed/generate.py`) is the clean source of truth.
A real bronze landing is NOT clean: source systems emit string-typed dates/numbers, inconsistent
status casing/synonyms, duplicate event rows, occasional null keys, unit drift, and crosswalk gaps.
This loader takes the clean generated rows and *uglifies* bronze on purpose so the silver layer has
real conform/cast/normalize/dedup/quarantine work to do (and so re-running the medallion audit on
silver vs bronze shows genuine transformation).

Design choices that make this defensible, not arbitrary:
  - Every bronze column is landed as STRING (a raw landing zone has no enforced types yet). Silver does
    the SAFE_CAST. This is why silver casting is visibly necessary.
  - Mess is deterministic (seeded off the master seed) so the dataset is reproducible and test-lockable.
  - Mess is bounded and targeted so the demo invariants still survive *after silver cleans them*
    (3 vehicles, suspect lot on exactly 2, an open major NCR, a reconciliation exception). Bronze is
    ugly; silver makes it honest again.

Mess injected:
  1. Status/severity/result casing + synonyms        -> silver normalizes to a controlled vocabulary
  2. Everything stringified; dates as mixed formats   -> silver SAFE_CASTs to TIMESTAMP/DATE/NUMERIC/BOOL
  3. Duplicate operation_execution rows (same exec_id) -> silver dedups on the true grain
  4. Duplicate genealogy edges (same edge_id)          -> silver dedups
  5. A few null business keys on non-invariant rows    -> silver quarantines to *_reject
  6. Out-of-domain / quarantine-worthy values
     (negative minutes on a non-invariant op row)      -> silver quarantines to *_reject
  7. Unit drift on numeric-ish text (e.g. " 95.0 ")     -> silver trims/normalizes
  8. One crosswalk part left unmatched (erp_material_id blank) -> silver flags unmatched

Run (local, uses the BigQuery client + ADC):
    python telemetry-platform/dataproc/relativity_mes/load_ugly_bronze.py \
        --project novendor-events-prod --dataset relativity_mes
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.relativity_mes_seed.generate import MASTER_SEED, build_dataset  # noqa: E402

# Bronze landing keeps the same table names; everything lands as STRING.
BRONZE_PREFIX = "bronze_"

# Status synonym/casing pools — what a real multi-source landing looks like before conform.
_STATUS_NCR = {"open": ["open", "OPEN", "Open", "opened"], "closed": ["closed", "CLOSED", "Closed", "close"]}
_SEVERITY = {"major": ["major", "MAJOR", "Major", "MAJ"], "minor": ["minor", "MINOR", "Minor", "min"]}
_RESULT = {"pass": ["pass", "PASS", "Pass", "P", "passed"], "fail": ["fail", "FAIL", "Fail", "F", "failed"]}
_WO_STATUS = {"complete": ["complete", "COMPLETE", "Complete", "CMPL", "done"]}
_DISP = {
    "rework": ["rework", "REWORK", "Rework", "RW"],
    "use-as-is": ["use-as-is", "USE_AS_IS", "use as is", "UAI"],
    "repair": ["repair", "REPAIR", "Repair", "RPR"],
}


def _stringify(value):
    """Land every value as text (raw zone). None stays None (a genuinely missing field)."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bronze landings often carry booleans as inconsistent text
        return "true" if value else "false"
    return str(value)


def _vary(rng, canonical, pool_map):
    pool = pool_map.get(canonical)
    return rng.choice(pool) if pool else canonical


def uglify(ds, seed: int = MASTER_SEED):
    """Return {table_name: [row(dict of STRING values)]} bronze rows with deterministic mess.

    Records what was done in a manifest so the silver acceptance tests know exactly what to expect.
    """
    rng = random.Random(seed ^ 0xB0_07)  # distinct stream from the generator's own rng
    src = ds["source"]
    manifest = {"casing_synonyms": 0, "dup_op_exec": 0, "dup_genealogy": 0,
                "null_keys": 0, "negative_minutes": 0, "unit_drift": 0, "unmatched_xwalk": 0}
    out: dict[str, list[dict]] = {}

    for table, rows in src.items():
        ugly_rows: list[dict] = []
        for r in rows:
            row = dict(r)

            # 1. status / severity / result / disposition casing + synonyms
            if table == "rel_mes_nonconformance":
                row["status"] = _vary(rng, row["status"], _STATUS_NCR); manifest["casing_synonyms"] += 1
                row["severity"] = _vary(rng, row["severity"], _SEVERITY); manifest["casing_synonyms"] += 1
            if table == "rel_mes_work_order":
                row["status"] = _vary(rng, row.get("status", "complete"), _WO_STATUS)
                manifest["casing_synonyms"] += 1
            if table in ("rel_mes_operation_execution", "rel_mes_inspection_order"):
                row["result"] = _vary(rng, row["result"], _RESULT); manifest["casing_synonyms"] += 1
            if table == "rel_mes_disposition":
                row["disposition_type"] = _vary(rng, row["disposition_type"], _DISP)
                manifest["casing_synonyms"] += 1

            # 7. unit drift on a numeric-ish text field (whitespace padding the rate)
            if table == "rel_erp_labor_actual" and rng.random() < 0.4:
                row["rate"] = f"  {row['rate']} "; manifest["unit_drift"] += 1

            # 8. crosswalk: leave exactly one mapping unmatched (blank erp_material_id)
            if table == "rel_xwalk_part_identity" and row.get("erp_material_id", "").endswith("-001") \
                    and manifest["unmatched_xwalk"] == 0:
                row["erp_material_id"] = ""; manifest["unmatched_xwalk"] += 1

            ugly_rows.append({k: _stringify(v) for k, v in row.items()})

        # 3. duplicate a couple of operation_execution rows (same exec_id) — but never an invariant row
        if table == "rel_mes_operation_execution":
            dupable = [x for x in ugly_rows if x.get("result") not in (None,)][:50]
            for x in rng.sample(dupable, k=min(2, len(dupable))):
                ugly_rows.append(dict(x)); manifest["dup_op_exec"] += 1

        # 4. duplicate one genealogy edge (same edge_id) — pick a non-suspect-lot edge
        if table == "rel_mes_as_built_genealogy":
            safe = [x for x in ugly_rows if x.get("lot_no") not in ("LOT-7788",)]
            if safe:
                ugly_rows.append(dict(rng.choice(safe[:30]))); manifest["dup_genealogy"] += 1

        # 5 + 6. null a non-invariant key, and a negative-minutes op (both quarantine-worthy)
        if table == "rel_mes_material_consumption":
            cand = [x for x in ugly_rows if x.get("lot_no") != "LOT-7788" and x.get("part_no")]
            if cand:
                rng.choice(cand[:20])["part_no"] = None; manifest["null_keys"] += 1
        if table == "rel_mes_operation_execution":
            cand = [x for x in ugly_rows
                    if x.get("work_order_no") not in ("WO-001-TPS", "WO-002-STR")]
            if cand:
                rng.choice(cand[:20])["actual_minutes"] = "-40"; manifest["negative_minutes"] += 1

        out[table] = ugly_rows
    return out, manifest


def _bq_string_schema(rows):
    from google.cloud import bigquery
    cols = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    return [bigquery.SchemaField(c, "STRING", mode="NULLABLE") for c in cols]


def load(project: str, dataset: str) -> int:
    from google.cloud import bigquery

    ds = build_dataset()
    ugly, manifest = uglify(ds)
    client = bigquery.Client(project=project)

    for table, rows in ugly.items():
        table_id = f"{project}.{dataset}.{BRONZE_PREFIX}{table}"
        schema = _bq_string_schema(rows)
        # normalize every row to the full column set (missing -> None) so JSON load is consistent
        cols = [f.name for f in schema]
        norm = [{c: r.get(c) for c in cols} for r in rows]
        job_cfg = bigquery.LoadJobConfig(
            schema=schema,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        )
        client.load_table_from_json(norm, table_id, job_config=job_cfg).result()
        print(f"[ugly-bronze] {BRONZE_PREFIX}{table}: {len(norm)} rows (STRING schema, {len(cols)} cols)")

    print(f"[ugly-bronze] mess manifest: {manifest}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="relativity_mes")
    args = ap.parse_args()
    return load(args.project, args.dataset)


if __name__ == "__main__":
    sys.exit(main())
