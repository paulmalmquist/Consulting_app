"""Evidence-freeze guard for the five frozen telemetry ML evidence artifacts.

These JSONs (telemetry-platform/*_evidence.json) carry the numbers and caveats the telemetry
surface presents as proof. Any refactor that silently drifts a number or weakens a caveat must fail
here. The expected values below are hardcoded literals: mutating a JSON without mutating this test
fails the assertion, which is the whole point. We also guard the verbatim frontend copies
(repo-b/src/lib/telemetry/*Evidence.json) against drift from their telemetry-platform source.

This lives under backend/tests so it runs in CI (the backend-lint job runs `pytest tests`); the
telemetry-platform/test_*_core.py files are NOT in CI. It only reads files, so no DB or network.
"""
import json
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]
_TEL = _REPO / "telemetry-platform"
_FE = _REPO / "repo-b" / "src" / "lib" / "telemetry"


def _load(path: Path) -> dict:
    # utf-8-sig tolerates a BOM on the frontend copies without breaking json.loads.
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _has_caveat(limitations: list[str], needle: str) -> bool:
    return any(needle in line for line in limitations)


# ── conformal RUL ─────────────────────────────────────────────────────────────────────────

def test_rul_conformal_frozen():
    d = _load(_TEL / "rul_conformal_evidence.json")
    assert d["dataset"] == "C-MAPSS FD001"
    assert d["model"].startswith("GradientBoostingRegressor")
    assert "capped at 125" in d["target"]
    assert d["coverage_target"] == 0.9
    assert d["n_test_units"] == 100
    assert d["n_calibration_units"] == 30
    assert d["metrics"]["picp_two_sided"] == 0.86
    assert d["metrics"]["lower_bound_coverage_one_sided"] == 0.85
    # The load-bearing "point GO but lower bound flags" disagreement count.
    assert d["gate"]["point_go_but_lower_bound_flags"] == 15
    assert d["gate"]["disagreement_units"] == 22
    assert _has_caveat(d["limitations"], "coverage transfers as a pattern, not a guarantee")
    assert _has_caveat(d["limitations"], "Intervals are marginal")


# ── regime anomaly ────────────────────────────────────────────────────────────────────────

def test_regime_anomaly_frozen():
    d = _load(_TEL / "regime_anomaly_evidence.json")
    assert d["dataset"] == "C-MAPSS FD004 (six operating conditions)"
    assert d["n_regimes"] == 6
    m = d["metrics"]
    assert m["global_worst_regime_fp"] == 1.0
    assert m["regime_conditioned_worst_regime_fp"] == 0.102
    assert m["worst_regime_fp_reduction_pct"] == 89.8
    assert m["mean_fp_reduction_pct"] == 93.3
    # eta-squared style: recon error variance fully explained by regime globally, ~0 conditioned.
    assert m["recon_error_variance_explained_by_regime_global"] == 1.0
    assert m["recon_error_variance_explained_by_regime_conditioned"] == 0.002
    assert "100% explained by operating condition" in d["finding"]
    assert _has_caveat(d["limitations"], "no anomaly labels")
    assert _has_caveat(d["limitations"], "Not a strawman")


# ── competence envelope ───────────────────────────────────────────────────────────────────

def test_competence_envelope_frozen():
    d = _load(_TEL / "competence_envelope_evidence.json")
    assert d["training_reference"] == "C-MAPSS FD001 (single operating condition)"
    # The caveat that the challenge set is NOT hot-fire data must survive verbatim.
    assert "regime-shift stress test, NOT rocket hot-fire data" in d["challenge_set"]
    m = d["metrics"]
    assert m["tau_mahalanobis_sq"] == 61.6
    assert m["k_out"] == 3.0
    assert m["fd001_in_envelope_rate"] == 0.9891
    assert m["fd004_out_of_envelope_rate"] == 0.9054
    assert "Never a confident GO outside the trained envelope" in d["gate"]
    assert _has_caveat(d["limitations"], "in-envelope does not mean the prediction is right")


# ── lead-lag attribution ──────────────────────────────────────────────────────────────────

def test_lead_lag_attribution_frozen():
    d = _load(_TEL / "lead_lag_attribution_evidence.json")
    assert d["n_units"] == 100
    m = d["metrics"]
    assert m["median_sensors_deviating_at_failure"] == 14.0
    assert m["channel_attribution_redundancy_pct"] == 93.3
    assert m["lead_sensors"] == ["sensor_9", "sensor_14", "sensor_11"]
    assert m["median_downstream_lag_cycles"] == 11.0
    assert _has_caveat(d["limitations"], "it does not assign blame")


# ── event-windowed analog retrieval ───────────────────────────────────────────────────────

def test_event_windowed_analog_frozen():
    d = _load(_TEL / "event_windowed_analog_evidence.json")
    assert d["dataset"].startswith("SMAP/MSL (NASA telemanom)")
    p = d["params"]
    assert p["window_len"] == 48
    assert p["dtw_band"] == 8
    assert p["top_k"] == 5
    m = d["metrics"]
    assert m["whole_series_cosine_anomalous_match_rate"] == 0.415
    assert m["event_windowed_dtw_anomalous_match_rate"] == 0.45
    assert m["event_windowing_lift_pct"] == 8.4
    assert m["topk_overlap"] == 0.09
    assert _has_caveat(d["limitations"], "Shown as unavailable rather than fabricated")


# ── source ↔ frontend-copy drift guard ────────────────────────────────────────────────────

_VERBATIM_COPIES = {
    "rul_conformal_evidence.json": "rulConformalEvidence.json",
    "regime_anomaly_evidence.json": "regimeAnomalyEvidence.json",
    "competence_envelope_evidence.json": "competenceEnvelopeEvidence.json",
}


@pytest.mark.parametrize("src,fe", sorted(_VERBATIM_COPIES.items()))
def test_frontend_copy_matches_source(src, fe):
    """The card-facing JSON in repo-b must stay value-identical to its telemetry-platform source, so
    the displayed numbers can never drift from the evidence of record."""
    assert _load(_TEL / src) == _load(_FE / fe), (
        f"{fe} has drifted from telemetry-platform/{src}; re-sync the frontend copy"
    )
