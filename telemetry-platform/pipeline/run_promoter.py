"""Telemetry ML — local promoter (PRODUCTION promotion path, dry-run by default).

Reads the latest candidate MLflow runs, shapes them for the shared pure governance function
`pipeline.promote.decide`, prints a promotion plan, and writes UC `champion` aliases ONLY when invoked
with `--apply` AND the same local gate logic passes. It never duplicates metric/gate formulas — all
governance lives in `pipeline.metrics` / `pipeline.gates` / `pipeline.promote`.

Design for CI-safe testing: all registry I/O goes through an injectable backend (duck-typed). Unit
tests pass a fake backend, so they need no Databricks, MLflow server, or network. The default real
backend talks to Databricks via the repo's `DatabricksClient` (REST).

Usage:
    python telemetry-platform/pipeline/run_promoter.py            # dry-run (default)
    python telemetry-platform/pipeline/run_promoter.py --dry-run
    python telemetry-platform/pipeline/run_promoter.py --apply
    python telemetry-platform/pipeline/run_promoter.py --tracking-uri <uri> --experiment <id> --dry-run

Exit codes: 0 ok · 2 fail-closed (config/metrics/ambiguous) · 3 apply/verify failure.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make `pipeline` importable whether run as a script or imported as a module.
_ROOT = Path(__file__).resolve().parents[1]          # telemetry-platform/
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from pipeline import promote  # noqa: E402

# ── Contract: which runs/models, and which metric fields decide() requires. ─────────────────────────
CATALOG_SCHEMA = "novendor_1.telemetry"
ANOMALY_RUNS = ["anomaly_baseline_mad", "anomaly_pca_recon"]
RUL_RUNS = ["rul_linear_baseline", "rul_gbm"]
ANOMALY_MODEL = f"{CATALOG_SCHEMA}.tel_anomaly_detector"
RUL_MODEL = f"{CATALOG_SCHEMA}.tel_rul_regressor"

REQUIRED_ANOMALY_FIELDS = ["f1_pointwise", "event_recall", "alarm_precision", "affiliation_f1", "f1"]
REQUIRED_RUL_FIELDS = ["rmse", "phm", "rul_model_vs_naive_rmse_ratio", "rul_phm_improvement",
                       "rul_late_prediction_rate", "rul_leakage_control_passed"]


class FailClosed(Exception):
    """Raised on any ambiguous / missing / malformed condition. Never falls back to notebook behavior."""


# ── Backend protocol (duck-typed). The real one uses DatabricksClient; tests inject a fake. ──────────
class DatabricksBackend:
    """Real registry backend over the repo's DatabricksClient (REST). Read methods are network calls;
    constructed only when a real run is requested, so unit tests never touch it."""

    def __init__(self, experiment_id: str | None = None):
        sys.path.insert(0, str(_ROOT / "databricks"))
        from _bootstrap import get_client  # raises if no PAT -> fail closed at construction
        self.client = get_client()
        self.experiment_id = experiment_id or self.client.experiment_id

    def latest_metrics(self, run_names: list[str]) -> dict:
        body = {"experiment_ids": [self.experiment_id], "max_results": 1000}
        runs = self.client._request("POST", "/api/2.0/mlflow/runs/search", body).get("runs", [])
        by_name: dict[str, list] = {}
        for r in runs:
            name = next((t["value"] for t in r["data"].get("tags", []) if t["key"] == "mlflow.runName"), None)
            if name in run_names:
                by_name.setdefault(name, []).append(r)
        out = {}
        for name, rs in by_name.items():
            rs.sort(key=lambda r: r["info"].get("start_time", 0), reverse=True)
            top = rs[0]["info"].get("start_time", 0)
            if len(rs) > 1 and rs[1]["info"].get("start_time", 0) == top:
                raise FailClosed(f"ambiguous latest run for '{name}': two runs share start_time {top}")
            out[name] = {"run_id": rs[0]["info"]["run_id"],
                         "metrics": {m["key"]: m["value"] for m in rs[0]["data"].get("metrics", [])}}
        return out

    def champion(self, model_full: str):
        try:
            a = self.client._request("GET", f"/api/2.1/unity-catalog/models/{model_full}/aliases/champion")
            return {"version": a.get("version"), "run_id": a.get("run_id")}
        except Exception:
            return None

    def version_for_run(self, model_full: str, run_id: str):
        vers = self.client._request("GET", f"/api/2.1/unity-catalog/models/{model_full}/versions").get("model_versions", [])
        match = sorted([v.get("version") for v in vers if v.get("run_id") == run_id], reverse=True)
        if match:
            return match[0]
        # No registry version yet for this run — create one from the run's logged model artifact.
        created = self.client._request(
            "POST", f"/api/2.1/unity-catalog/models/{model_full}/versions",
            {"source": f"runs:/{run_id}/model", "run_id": run_id})
        return created.get("version")

    def set_alias(self, model_full: str, alias: str, version) -> None:
        self.client._request("PUT", f"/api/2.1/unity-catalog/models/{model_full}/aliases/{alias}",
                             {"version_num": int(version)})


# ── Plan (no writes) ────────────────────────────────────────────────────────────────────────────────
def _validate(metrics_by_name: dict, required_runs: list[str], required_fields: list[str], family: str):
    for run in required_runs:
        if run not in metrics_by_name:
            raise FailClosed(f"{family}: missing candidate run '{run}' (have {sorted(metrics_by_name)})")
        m = metrics_by_name[run]["metrics"]
        missing = [f for f in required_fields if f not in m]
        if missing:
            raise FailClosed(f"{family}: run '{run}' missing required metrics {missing}")


def _rejected_anomaly(decision: dict, anomaly_metrics: dict) -> list:
    out = []
    for name, passed in decision["anomaly"]["honest_gate_pass"].items():
        if name != decision["anomaly"]["winner"]:
            why = "honest gate fail" if not passed else "not selected (lower affiliation_f1)"
            out.append({"candidate": name, "reason": why,
                        "affiliation_f1": anomaly_metrics[name].get("affiliation_f1")})
    return out


def _rejected_rul(decision: dict) -> list:
    out = []
    for name, failed in decision["rul"]["failed_checks"].items():
        if name != decision["rul"]["winner"] or decision["rul"]["decision"] != "promoted":
            out.append({"candidate": name,
                        "reason": ("failed: " + ", ".join(failed)) if failed else "not selected",
                        "gate": decision["rul"]["gate_eval"][name]["checks"]})
    return out


def plan_promotion(backend) -> dict:
    """Read candidates, validate, decide, compute alias deltas. NO writes."""
    metrics = backend.latest_metrics(ANOMALY_RUNS + RUL_RUNS)
    anom_named = {n: metrics[n] for n in metrics if n in ANOMALY_RUNS}
    rul_named = {n: metrics[n] for n in metrics if n in RUL_RUNS}
    _validate(anom_named, ANOMALY_RUNS, REQUIRED_ANOMALY_FIELDS, "anomaly")
    _validate(rul_named, RUL_RUNS, REQUIRED_RUL_FIELDS, "rul")

    anomaly_metrics = {n: anom_named[n]["metrics"] for n in ANOMALY_RUNS}
    rul_metrics = {n: rul_named[n]["metrics"] for n in RUL_RUNS}
    decision = promote.decide(anomaly_metrics, rul_metrics)

    families = []
    for fam, model, named, rejected in [
        ("anomaly", ANOMALY_MODEL, anom_named, _rejected_anomaly(decision, anomaly_metrics)),
        ("rul", RUL_MODEL, rul_named, _rejected_rul(decision)),
    ]:
        winner = decision[fam]["winner"]
        promoted = decision[fam]["decision"] == "promoted"
        winner_run_id = named[winner]["run_id"] if winner in named else None
        current = backend.champion(model)
        would_change = bool(promoted and winner_run_id and (current is None or current.get("run_id") != winner_run_id))
        families.append({
            "family": fam, "model": model, "winner": winner, "decision": decision[fam]["decision"],
            "winner_run_id": winner_run_id, "current_champion": current,
            "alias_would_change": would_change, "rejected": rejected,
        })
    return {"families": families, "decision": decision}


# ── Apply (writes, gated + verified) ────────────────────────────────────────────────────────────────
def apply_promotion(backend, plan: dict) -> dict:
    results = []
    for fam in plan["families"]:
        if fam["decision"] != "promoted":
            results.append({"family": fam["family"], "action": "skipped_not_promoted"})
            continue
        if not fam["alias_would_change"]:
            results.append({"family": fam["family"], "action": "noop_already_champion",
                            "version": (fam["current_champion"] or {}).get("version")})
            continue
        model, run_id = fam["model"], fam["winner_run_id"]
        version = backend.version_for_run(model, run_id)
        if version is None:
            raise FailClosed(f"{fam['family']}: no registry version for run {run_id} and could not create one")
        before = backend.champion(model)
        backend.set_alias(model, "champion", version)
        after = backend.champion(model)
        if not after or str(after.get("version")) != str(version) or after.get("run_id") != run_id:
            raise FailClosed(f"{fam['family']}: alias write NOT verified (after={after}, expected v{version}/{run_id})")
        results.append({"family": fam["family"], "action": "champion_set",
                        "before": before, "after": after, "version": version})
    return {"applied": results}


# ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────
def _print_plan(plan: dict, mode: str) -> None:
    print(f"=== Telemetry promotion plan ({mode}) ===")
    for f in plan["families"]:
        cur = f["current_champion"]
        cur_s = f"v{cur['version']} ({str(cur['run_id'])[:8]})" if cur else "none"
        print(f"\n[{f['family']}] model={f['model']}")
        print(f"  decision : {f['decision']}  winner={f['winner']} ({str(f['winner_run_id'])[:8] if f['winner_run_id'] else '-'})")
        print(f"  champion : current={cur_s}  alias_would_change={f['alias_would_change']}")
        for r in f["rejected"]:
            print(f"  rejected : {r['candidate']} -> {r['reason']}")


def run(argv=None, backend=None, receipt_dir=None) -> int:
    ap = argparse.ArgumentParser(description="Local telemetry promoter (dry-run by default).")
    ap.add_argument("--apply", action="store_true", help="Write champion aliases (only for gate-passing families).")
    ap.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior).")
    ap.add_argument("--tracking-uri", default=None)
    ap.add_argument("--experiment", default=None, help="MLflow experiment id override.")
    ap.add_argument("--receipt", default=None, help="Path to write the JSON receipt.")
    args = ap.parse_args(argv)
    mode = "APPLY" if args.apply else "DRY-RUN"   # default = dry-run even if neither flag given

    receipt = {"mode": mode, "tracking_uri": args.tracking_uri, "experiment": args.experiment}
    try:
        if backend is None:
            try:
                backend = DatabricksBackend(experiment_id=args.experiment)
            except Exception as e:  # missing creds / config -> fail closed
                raise FailClosed(f"could not initialize registry backend: {e}")
        plan = plan_promotion(backend)
        _print_plan(plan, mode)
        receipt["plan"] = plan
        if args.apply:
            applied = apply_promotion(backend, plan)
            receipt["apply"] = applied
            print("\n=== APPLY result ===")
            print(json.dumps(applied, indent=2))
        else:
            print("\nDRY-RUN: no aliases written. Re-run with --apply to promote gate-passing families.")
        receipt["status"] = "ok"
        rc = 0
    except FailClosed as e:
        receipt["status"] = "fail_closed"
        receipt["reason"] = str(e)
        print(f"FAIL-CLOSED: {e}", file=sys.stderr)
        rc = 2 if not args.apply or "verified" not in str(e) else 3
        if "verified" in str(e):
            rc = 3
    _write_receipt(receipt, args.receipt, receipt_dir)
    return rc


def _write_receipt(receipt: dict, explicit_path, receipt_dir) -> None:
    if explicit_path:
        path = Path(explicit_path)
    else:
        d = Path(receipt_dir) if receipt_dir else (_ROOT / "pipeline" / "receipts")
        path = d / "promote_receipt_latest.json"
    path.parent.mkdir(parents=True, exist_ok=True)   # create parent for BOTH branches
    path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(f"\nreceipt -> {path}")


if __name__ == "__main__":
    sys.exit(run())
