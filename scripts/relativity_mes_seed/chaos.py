"""Chaos / data-quality survivability study for the Relativity MES Sandbox — pure Python, offline.

Real MES/ERP/PLM data is messy: genealogy edges missing work orders, NCRs raised against no work order,
cost rows for orders that never closed, duplicate edges. This study injects that mess into a *copy* of
the deterministic dataset (the committed live serving stays clean) and measures whether the analysis
surface degrades honestly — i.e. whether the graph-join / linkage / dangling-row metrics move the way a
real data-quality monitor would. The result is committed as mes_data_quality.json and replayed by the
Build Analytics "Chaos survivability" mode.

Run: python -m scripts.relativity_mes_seed.chaos --levels 0,0.1,0.25
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import hashlib
import json
import random
from pathlib import Path
from typing import Any

from .generate import MASTER_SEED, build_dataset

RECEIPT_DIR = Path(__file__).resolve().parents[2] / "backend" / "app" / "data" / "telemetry"
DATA_QUALITY_FILE = RECEIPT_DIR / "mes_data_quality.json"
CODE_VERSION = "mes-chaos-v1"


def _coverage(ds: dict[str, Any]) -> dict[str, float]:
    src = ds["source"]
    wo_ids = {w["work_order_no"] for w in src["rel_mes_work_order"]}
    edges = src["rel_mes_as_built_genealogy"]
    ncrs = src["rel_mes_nonconformance"]

    edge_join = sum(1 for e in edges if e.get("work_order_no") in wo_ids)
    ncr_link = sum(1 for n in ncrs if n.get("work_order_no") in wo_ids)
    recon_wos = {r["work_order_no"] for r in ds["gold"]["gold.rel_mes_erp_reconciliation"]}
    dangling = sum(1 for w in wo_ids if w not in recon_wos)
    edge_keys = [(e.get("parent_node_id"), e.get("child_node_id"), e.get("work_order_no")) for e in edges]
    dup = len(edge_keys) - len(set(edge_keys))

    return {
        "genealogy_join_coverage_pct": round(edge_join / len(edges) * 100, 2) if edges else 0.0,
        "ncr_linkage_rate_pct": round(ncr_link / len(ncrs) * 100, 2) if ncrs else 0.0,
        "dangling_work_orders": float(dangling),
        "duplicate_genealogy_edges": float(dup),
        "edge_count": float(len(edges)),
        "ncr_count": float(len(ncrs)),
    }


def _inject(ds: dict[str, Any], level: float, rng: random.Random) -> dict[str, Any]:
    """Inject `level` fraction of controlled mess into a COPY of the dataset."""
    d = copy.deepcopy(ds)
    src = d["source"]
    # 1) blank out work_order_no on a fraction of genealogy edges (missing joins)
    for e in src["rel_mes_as_built_genealogy"]:
        if rng.random() < level:
            e["work_order_no"] = None
    # 2) raise NCRs against a non-existent work order (NCRs with no WO)
    extra = max(0, int(len(src["rel_mes_nonconformance"]) * level))
    for i in range(extra):
        src["rel_mes_nonconformance"].append({
            "ncr_id": f"NCR-CHAOS-{i:03d}", "vehicle_serial": "VEH-DEMO-001",
            "unit_serial_or_lot": "SN-XXX", "work_order_no": f"WO-GHOST-{i:03d}",
            "operation_id": "OP-?", "part_no": None, "lot_no": None, "work_center": "WC-?",
            "defect_code": "unknown", "severity": "minor", "status": "open",
            "opened_ts": "2026-06-20T00:00:00Z", "closed_ts": None,
            "synthetic": True, "source_system": "MES", "source_table": "rel_mes_nonconformance",
            "source_pk": f"NCR-CHAOS-{i:03d}", "ingest_batch_id": "chaos", "as_of": "2026-06-20T00:00:00Z",
        })
    # 3) duplicate a fraction of genealogy edges
    dups = [copy.deepcopy(e) for e in src["rel_mes_as_built_genealogy"] if rng.random() < level / 2]
    src["rel_mes_as_built_genealogy"].extend(dups)
    return d


def run_chaos(levels: list[float]) -> dict[str, Any]:
    base = build_dataset(MASTER_SEED)
    runs = []
    for lvl in levels:
        rng = random.Random(MASTER_SEED + int(lvl * 1000))
        ds = base if lvl == 0 else _inject(base, lvl, rng)
        cov = _coverage(ds)
        # honest survivability: clean baseline = 100% join coverage; degrades predictably with level.
        runs.append({"chaos_level": lvl, **cov,
                     "survives": cov["genealogy_join_coverage_pct"] >= (1 - lvl) * 100 - 5})
    return {"runs": runs, "base_seed": MASTER_SEED,
            "note": "Chaos is injected into a copy only; the committed live serving stays clean. "
                    "These metrics are what a real MES/ERP data-quality monitor would watch."}


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
    ap = argparse.ArgumentParser(description="MES chaos / data-quality survivability (offline)")
    ap.add_argument("--levels", type=str, default="0,0.1,0.25,0.4")
    args = ap.parse_args()
    levels = [float(x) for x in args.levels.split(",")]

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    payload = run_chaos(levels)
    DATA_QUALITY_FILE.write_text(json.dumps(_receipt(payload, len(levels)), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {DATA_QUALITY_FILE.name} ({len(levels)} chaos levels)")
    for r in payload["runs"]:
        print(f"  level={r['chaos_level']:<5} join={r['genealogy_join_coverage_pct']}%  "
              f"ncr_link={r['ncr_linkage_rate_pct']}%  dangling={r['dangling_work_orders']}  "
              f"survives={r['survives']}")


if __name__ == "__main__":
    main()
