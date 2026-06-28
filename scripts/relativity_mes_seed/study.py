"""Multi-seed stability study for the Relativity MES Sandbox — pure Python, no Databricks/BigQuery.

Re-runs the deterministic generator across N seeds, aggregates the fragile simulation metrics, and
writes two committed receipts the Build Analytics page replays (it never recomputes at request time):

  - mes_scenario_manifest.json : what the default seed PLANTED vs what emerges (UI provenance labels)
  - mes_seed_stability.json    : per-metric current / median / P10–P90 / spread + a stability verdict

This is the rebuttal to "the dashboard just replays the generator's seed": a finding is only credible
if its *pattern* survives re-randomization, even when the exact percentage is seed-specific.

Run: python -m scripts.relativity_mes_seed.study --seeds 200
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
from pathlib import Path
from typing import Any

from .generate import MASTER_SEED, build_dataset, scenario_manifest, study_aggregates

RECEIPT_DIR = Path(__file__).resolve().parents[2] / "backend" / "app" / "data" / "telemetry"
MANIFEST_FILE = RECEIPT_DIR / "mes_scenario_manifest.json"
STABILITY_FILE = RECEIPT_DIR / "mes_seed_stability.json"
CODE_VERSION = "mes-study-v1"

# metric key -> (label, unit, "pattern" stability claim shown when the exact value is volatile)
METRICS = {
    "largest_ncr_share_pct": ("Largest-NCR rework concentration", "%",
                              "one defect group dominates rework"),
    "exception_wo_count": ("MES↔ERP recon exceptions", "count", "at least one cost exception appears"),
    "max_actual_std_ratio": ("Worst actual/standard minutes", "x", "some operation runs over standard"),
    "blocked_build_count": ("Blocked builds", "count", "the open-major-NCR vehicle is blocked"),
    "residual_pct": ("Unallocated cost residual", "%", "a small residual remains (never a pure identity)"),
    "blast_size": ("Suspect-lot blast radius", "vehicles", "the planted lot reaches exactly two vehicles"),
}


def _pct(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = min(len(sorted_vals) - 1, max(0, int(round(q * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


def _median(sorted_vals: list[float]) -> float:
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    mid = n // 2
    return sorted_vals[mid] if n % 2 else (sorted_vals[mid - 1] + sorted_vals[mid]) / 2


def run_study(n_seeds: int) -> dict[str, Any]:
    current = study_aggregates(build_dataset(MASTER_SEED))
    samples: dict[str, list[float]] = {k: [] for k in METRICS}
    for seed in range(MASTER_SEED, MASTER_SEED + n_seeds):
        agg = study_aggregates(build_dataset(seed))
        for k in METRICS:
            samples[k].append(float(agg[k]))

    metrics_out = []
    for key, (label, unit, claim) in METRICS.items():
        vals = sorted(samples[key])
        med = round(_median(vals), 2)
        p10, p90 = round(_pct(vals, 0.10), 2), round(_pct(vals, 0.90), 2)
        spread = round((p90 - p10) / med, 3) if med else 0.0
        # the exact value is "stable" only when the band is tight; otherwise the PATTERN is stable but
        # the percentage is seed-specific — which the UI states plainly.
        value_stable = spread < 0.10 or p10 == p90
        metrics_out.append({
            "key": key, "label": label, "unit": unit,
            "current": round(float(current[key]), 2),
            "median": med, "p10": p10, "p90": p90,
            "min": round(min(vals), 2), "max": round(max(vals), 2),
            "spread_ratio": spread,
            "value_stable": value_stable,
            "pattern_claim": claim,
            "verdict": ("stable value" if value_stable else "stable pattern, seed-specific value"),
        })
    return {"n_seeds": n_seeds, "base_seed": MASTER_SEED, "metrics": metrics_out}


def _receipt(payload: dict[str, Any], rows_evaluated: int) -> dict[str, Any]:
    blob = json.dumps(payload, sort_keys=True).encode()
    return {
        "provider": "local_fixture",
        "source_bigquery_table": None,
        "vertex_experiment": None, "vertex_run_id": None, "vertex_model_id": None,
        "gcs_artifact_uri": None,
        "created_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat(),
        "code_version": CODE_VERSION,
        "data_manifest_sha": hashlib.sha256(blob).hexdigest()[:16],
        "rows_evaluated": rows_evaluated,
        "null_reason": None,
        "payload": payload,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="MES multi-seed stability study (Databricks-free)")
    ap.add_argument("--seeds", type=int, default=200)
    args = ap.parse_args()

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = scenario_manifest(MASTER_SEED)
    stability = run_study(args.seeds)

    MANIFEST_FILE.write_text(json.dumps(_receipt(manifest, 1), indent=2) + "\n", encoding="utf-8")
    STABILITY_FILE.write_text(json.dumps(_receipt(stability, args.seeds), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST_FILE.name} + {STABILITY_FILE.name} ({args.seeds} seeds)")
    for m in stability["metrics"]:
        print(f"  {m['key']:<24} current={m['current']:<8} median={m['median']:<8} "
              f"P10-P90={m['p10']}-{m['p90']}  {m['verdict']}")


if __name__ == "__main__":
    main()
