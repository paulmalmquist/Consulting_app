#!/usr/bin/env python3
"""Track A — merge range-aware / conformal / honest-gate keys into ONLY the anomaly champion row.

Reads the eval result JSON produced by eval_honest_metrics.py and performs ONE idempotent jsonb merge
into tel_model_runs for the frozen anomaly champion. It:
  - touches ONLY id=27db381a-… AND model_alias='champion' AND model_kind='anomaly'
  - merges additively (`metrics = metrics || jsonb_build_object(...)`) — legacy keys preserved, no migration
  - is re-runnable (same input -> same row)
  - reads back and ASSERTS the RUL + PCA-challenger rows are unchanged (their metrics carry no Track A keys)

It does NOT retrain, move the @champion alias, or touch the live /score path. The champion is frozen;
this only records the declared honest gate + the affiliation / conformal diagnostics beside the legacy F1.

Runs SQL via the Supabase CLI (`supabase db query --linked`) — the same path used in Stage 0.

Usage:
  python telemetry-platform/update_track_a_champion_metrics.py \
      --result telemetry-platform/docs/honest_metrics_result.json [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

CHAMPION_ID = "27db381a-88dd-4e3c-9ca6-cf62bdf3caa7"
PCA_NAME = "tel_anomaly_pca"          # challenger — must stay free of Track A keys
RUL_KIND = "rul"                      # RUL rows — must stay free of Track A keys


def _q(sql: str) -> str:
    """Run SQL through the Supabase CLI and return stdout (raises on non-zero)."""
    p = subprocess.run(["supabase", "db", "query", "--linked"], input=sql,
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"supabase db query failed: {p.stderr[-400:]}")
    return p.stdout


def _rows(out: str) -> list[dict]:
    """Extract the JSON rows array from the CLI output (it prints a JSON object with a 'rows' key)."""
    start = out.find("{")
    while start != -1:
        try:
            obj = json.loads(out[start:out.rfind("}") + 1])
            return obj.get("rows", [])
        except json.JSONDecodeError:
            start = out.find("{", start + 1)
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--result", required=True, help="path to eval_honest_metrics result JSON")
    ap.add_argument("--dry-run", action="store_true", help="print the SQL, do not execute")
    args = ap.parse_args()

    res = json.loads(Path(args.result).read_text(encoding="utf-8"))
    aff = res["affiliation"]
    con = res["conformal"]
    vus = res["vus"]
    gate = res["honest_gate"]

    # The exact additive key set (Track A). Legacy + Stage-0 keys are left untouched by the `||` merge.
    keys = {
        "affiliation_precision": aff["affiliation_precision"],
        "affiliation_recall": aff["affiliation_recall"],
        "affiliation_f1": aff["affiliation_f1"],
        "affiliation_cap_d_ticks": aff["cap_d_ticks"],
        "vus_pr": vus["vus_pr"],
        "vus_roc": vus["vus_roc"],
        "vus_status": vus["vus_status"],
        "conformal_alpha": con["conformal_alpha"],
        "conformal_threshold_quantile": con["conformal_threshold_quantile"],
        "conformal_calib_coverage": con["conformal_calib_coverage"],
        "conformal_measured_false_alarm_rate": con["conformal_measured_false_alarm_rate"],
        "conformal_frozen_k": con["conformal_frozen_k"],
        "honest_gate": gate,            # nested object: thresholds + values + checks + passed
        "track_a_note": "Affiliation = capped proximity (D=50, not window length). Conformal = blocked "
                        "nominal-train diagnostic, not a distribution-free guarantee. VUS only if a vetted "
                        "library runs cleanly. Champion frozen; gate declared before recompute.",
    }
    payload = json.dumps(keys)
    payload_sql = payload.replace("'", "''")   # SQL-escape: values (e.g. vus_status) may contain quotes

    update_sql = (
        "UPDATE tel_model_runs "
        f"SET metrics = metrics || '{payload_sql}'::jsonb "
        f"WHERE id = '{CHAMPION_ID}' AND model_alias = 'champion' AND model_kind = 'anomaly' "
        "RETURNING id, model_name, model_alias;"   # simple cols only — expressions break RETURNING via the CLI
    )

    if args.dry_run:
        print(update_sql)
        return 0

    # 1) Apply the idempotent merge to the single champion row.
    upd = _rows(_q(update_sql))
    if len(upd) != 1:
        print(f"FAIL: expected to update exactly 1 champion row, got {len(upd)}", file=sys.stderr)
        return 1
    print("champion row updated:", json.dumps(upd[0]))

    # 2) Read back: champion has the Track A keys; RUL + PCA rows do NOT.
    check_sql = (
        "SELECT model_name, model_kind, model_alias, (metrics ? 'affiliation_f1') AS has_track_a, "
        "(metrics->>'affiliation_f1') AS affiliation_f1, (metrics->>'f1') AS legacy_f1 "
        "FROM tel_model_runs WHERE model_kind IN ('anomaly','rul') ORDER BY model_kind, model_name;"
    )
    rows = _rows(_q(check_sql))
    ok = True
    for r in rows:
        is_champ = r["model_name"] == "tel_anomaly_detector" and r["model_alias"] == "champion"
        expected = is_champ            # only the champion should carry Track A keys
        got = bool(r["has_track_a"])
        flag = "OK" if got == expected else "VIOLATION"
        if got != expected:
            ok = False
        print(f"  {flag:9s} {r['model_name']:22s} kind={r['model_kind']:7s} "
              f"alias={r['model_alias']} has_track_a={got} (expected {expected}) "
              f"affiliation_f1={r.get('affiliation_f1')} legacy_f1={r.get('legacy_f1')}")

    if not ok:
        print("FAIL: a non-champion row carries Track A keys, or champion is missing them.", file=sys.stderr)
        return 1
    print("read-back OK: only the anomaly champion carries Track A keys; RUL/PCA rows unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
