"""Local tests for the promoter — fully mocked backend, no Databricks/MLflow/network."""
import pytest

from pipeline import run_promoter as RP
from pipeline.run_promoter import FailClosed

# Real logged metrics (2026-06-22), in backend shape {run_name: {run_id, metrics}}.
MAD_RUN, PCA_RUN = "anom_mad_run", "anom_pca_run"
LIN_RUN, GBM_RUN = "rul_lin_run", "rul_gbm_run"

ANOM_M = {
    "anomaly_baseline_mad": {"run_id": MAD_RUN, "metrics": {
        "f1": 0.63866, "f1_pointwise": 0.30859, "event_recall": 0.76923,
        "alarm_precision": 0.31869, "affiliation_f1": 0.46568}},
    "anomaly_pca_recon": {"run_id": PCA_RUN, "metrics": {
        "f1": 0.41962, "f1_pointwise": 0.02737, "event_recall": 0.48077,
        "alarm_precision": 0.26353, "affiliation_f1": 0.36307}},
}
RUL_M = {
    "rul_linear_baseline": {"run_id": LIN_RUN, "metrics": {
        "rmse": 21.7024, "phm": 1036.14, "rul_model_vs_naive_rmse_ratio": 0.5204,
        "rul_phm_improvement": 29717.17, "rul_late_prediction_rate": 0.59, "rul_leakage_control_passed": 1.0}},
    "rul_gbm": {"run_id": GBM_RUN, "metrics": {
        "rmse": 20.3219, "phm": 1423.33, "rul_model_vs_naive_rmse_ratio": 0.4873,
        "rul_phm_improvement": 29329.98, "rul_late_prediction_rate": 0.58, "rul_leakage_control_passed": 1.0}},
}
SAFE_RUL = {"run_id": "rul_safe_run", "metrics": {
    "rmse": 18.0, "phm": 800.0, "rul_model_vs_naive_rmse_ratio": 0.45,
    "rul_phm_improvement": 30000.0, "rul_late_prediction_rate": 0.40, "rul_leakage_control_passed": 1.0}}


class FakeRegistry:
    def __init__(self, metrics=None, champions=None, versions=None, ambiguous=False, verify_fail=False):
        self.metrics = metrics if metrics is not None else {**ANOM_M, **RUL_M}
        self.champions = champions or {}
        self.versions = versions or {}   # {model: {version: run_id}}
        self.ambiguous = ambiguous
        self.verify_fail = verify_fail
        self.writes = []                  # records every set_alias call

    def latest_metrics(self, run_names):
        if self.ambiguous:
            raise FailClosed("ambiguous latest run for 'rul_gbm': two runs share start_time 123")
        return {n: self.metrics[n] for n in run_names if n in self.metrics}

    def champion(self, model_full):
        return self.champions.get(model_full)

    def version_for_run(self, model_full, run_id):
        for v, rid in self.versions.get(model_full, {}).items():
            if rid == run_id:
                return v
        return None

    def set_alias(self, model_full, alias, version):
        self.writes.append((model_full, alias, version))
        run_id = self.versions.get(model_full, {}).get(version)
        # verify_fail simulates a write that doesn't take (champion reflects wrong/None run).
        self.champions[model_full] = {"version": 999, "run_id": None} if self.verify_fail else \
            {"version": version, "run_id": run_id}


def _versions_all():
    return {RP.ANOMALY_MODEL: {3: MAD_RUN, 2: MAD_RUN, 1: "old_anom"},
            RP.RUL_MODEL: {2: GBM_RUN, 1: "old_rul"}}


# 10. CLI default is dry-run.
def test_default_is_dry_run(tmp_path):
    fake = FakeRegistry()
    rc = RP.run([], backend=fake, receipt_dir=tmp_path)
    assert rc == 0 and fake.writes == []


# 1. Dry-run never writes.
def test_dry_run_never_writes(tmp_path):
    fake = FakeRegistry(champions={RP.ANOMALY_MODEL: {"version": 1, "run_id": "old_anom"}})
    rc = RP.run(["--dry-run"], backend=fake, receipt_dir=tmp_path)
    assert rc == 0 and fake.writes == []


# 2 + 6. --apply writes only gate-passing families: anomaly MAD promoted, RUL (GBM) blocked -> not written.
def test_apply_writes_only_passing_family(tmp_path):
    fake = FakeRegistry(
        champions={RP.ANOMALY_MODEL: {"version": 1, "run_id": "old_anom"},
                   RP.RUL_MODEL: {"version": 2, "run_id": GBM_RUN}},
        versions=_versions_all())
    rc = RP.run(["--apply"], backend=fake, receipt_dir=tmp_path)
    assert rc == 0
    written_models = [w[0] for w in fake.writes]
    assert RP.ANOMALY_MODEL in written_models          # MAD promoted -> written
    assert RP.RUL_MODEL not in written_models           # GBM fails late-rate gate -> NOT written


# 6 (explicit). GBM late-rate failure -> rul not promoted in the plan.
def test_gbm_fails_late_rate_not_promoted(tmp_path):
    plan = RP.plan_promotion(FakeRegistry())
    rul = next(f for f in plan["families"] if f["family"] == "rul")
    assert rul["decision"] == "model_not_promoted"
    assert any("late_rate_under_ceiling" in r.get("reason", "") for r in rul["rejected"])


# 7. MAD passes, PCA fails.
def test_mad_passes_pca_fails():
    plan = RP.plan_promotion(FakeRegistry())
    anom = next(f for f in plan["families"] if f["family"] == "anomaly")
    assert anom["winner"] == "anomaly_baseline_mad"
    assert plan["decision"]["anomaly"]["honest_gate_pass"] == \
        {"anomaly_baseline_mad": True, "anomaly_pca_recon": False}


# 9. Output includes rejected candidates with reasons.
def test_plan_lists_rejected_with_reasons():
    plan = RP.plan_promotion(FakeRegistry())
    anom = next(f for f in plan["families"] if f["family"] == "anomaly")
    pca = next(r for r in anom["rejected"] if r["candidate"] == "anomaly_pca_recon")
    assert "honest gate fail" in pca["reason"]


# 3. Missing credentials/backend init fails closed (monkeypatch the real backend to raise).
def test_missing_credentials_fails_closed(tmp_path, monkeypatch):
    class Boom:
        def __init__(self, *a, **k):
            raise RuntimeError("DATABRICKS_PAT not set and claude_token.txt missing")
    monkeypatch.setattr(RP, "DatabricksBackend", Boom)
    rc = RP.run(["--dry-run"], backend=None, receipt_dir=tmp_path)
    assert rc == 2


# 4. Missing required metrics fails closed.
def test_missing_metrics_fails_closed(tmp_path):
    bad = {**ANOM_M, **RUL_M}
    bad["rul_gbm"] = {"run_id": GBM_RUN, "metrics": {"rmse": 20.0}}  # drop required RUL fields
    rc = RP.run(["--dry-run"], backend=FakeRegistry(metrics=bad), receipt_dir=tmp_path)
    assert rc == 2


# 4b. Missing candidate run fails closed.
def test_missing_candidate_run_fails_closed(tmp_path):
    bad = dict(RUL_M); bad.update({k: v for k, v in ANOM_M.items() if k != "anomaly_pca_recon"})
    rc = RP.run(["--dry-run"], backend=FakeRegistry(metrics=bad), receipt_dir=tmp_path)
    assert rc == 2


# 5. Ambiguous candidate selection fails closed.
def test_ambiguous_fails_closed(tmp_path):
    rc = RP.run(["--dry-run"], backend=FakeRegistry(ambiguous=True), receipt_dir=tmp_path)
    assert rc == 2


# 8. Alias write verification failure returns nonzero (3).
def test_apply_verify_failure_returns_nonzero(tmp_path):
    # A safe RUL candidate so the family IS promoted and a write is attempted, but the write won't verify.
    metrics = {**ANOM_M, **RUL_M, "rul_gbm": SAFE_RUL}  # make the gbm slot a safe model so RUL promotes
    fake = FakeRegistry(
        metrics=metrics,
        champions={RP.RUL_MODEL: {"version": 1, "run_id": "old_rul"},
                   RP.ANOMALY_MODEL: {"version": 3, "run_id": MAD_RUN}},  # anomaly already champion -> noop
        versions={RP.RUL_MODEL: {5: "rul_safe_run"}, RP.ANOMALY_MODEL: {3: MAD_RUN}},
        verify_fail=True)
    rc = RP.run(["--apply"], backend=fake, receipt_dir=tmp_path)
    assert rc == 3


# Receipt is written even when the --receipt parent dir doesn't exist yet.
def test_receipt_explicit_path_creates_parent(tmp_path):
    receipt = tmp_path / "nested" / "deep" / "r.json"
    rc = RP.run(["--dry-run", "--receipt", str(receipt)], backend=FakeRegistry(), receipt_dir=tmp_path)
    assert rc == 0 and receipt.exists()


# Apply is a no-op when the winner is already champion.
def test_apply_noop_when_already_champion(tmp_path):
    fake = FakeRegistry(
        champions={RP.ANOMALY_MODEL: {"version": 3, "run_id": MAD_RUN},
                   RP.RUL_MODEL: {"version": 2, "run_id": GBM_RUN}},
        versions=_versions_all())
    rc = RP.run(["--apply"], backend=fake, receipt_dir=tmp_path)
    assert rc == 0 and fake.writes == []   # MAD already champion; RUL not promoted -> nothing written
