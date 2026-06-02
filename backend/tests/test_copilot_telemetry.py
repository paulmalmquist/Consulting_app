"""Tests for the Test Intelligence Copilot (Phase 6).

These assert the STRUCTURAL safety guarantees the demo's credibility rests on, with no live LLM:
  * refusals fire pre-LLM (deterministic classifier),
  * supported intents classify correctly (incl. "why did this flip to NO-GO" is NOT a refusal),
  * the post-validator rejects any id/number not present in the evidence (anti-fabrication),
  * empty evidence fails closed,
  * the allow-list is the tool boundary,
  * the flagship serving read fails closed on a missing run.

The full eval suite (Phase 8) reuses copilot_eval_fixtures; here we assert the phase-6 subset.
"""
import os
import sys
from uuid import uuid4

sys.path.insert(0, os.path.dirname(__file__))  # make the sibling fixtures module importable

from app.services import telemetry_copilot as tc
from app.services import telemetry_copilot_policy as policy
from copilot_eval_fixtures import REFUSAL_CASES, INTENT_CASES, phase6

ENV = "telemetry-demo"
BIZ = str(uuid4())
TENANT = str(uuid4())


# ── deterministic refusal gate ─────────────────────────────────────────────────
def test_phase6_refusals_fire_pre_llm():
    for case in phase6(REFUSAL_CASES):
        intent, refusal = policy.classify(case["q"])
        assert intent is None, f"{case['name']} should not match a supported intent"
        assert refusal == policy.NULL_UNSUPPORTED, f"{case['name']} should refuse"


def test_phase6_supported_intents_classify():
    for case in phase6(INTENT_CASES):
        intent, refusal = policy.classify(case["q"])
        assert refusal is None, f"{case['name']} should not be refused"
        assert intent == case["intent"], f"{case['name']} -> {intent} != {case['intent']}"


def test_flagship_question_is_not_refused():
    # The single most important non-refusal: explaining a NO-GO must be supported, not refused.
    intent, refusal = policy.classify("Why did this run flip to NO-GO?")
    assert refusal is None
    assert intent == "why_no_go"


def test_empty_question_refused():
    intent, refusal = policy.classify("")
    assert intent is None and refusal == policy.NULL_UNSUPPORTED


# ── allow-list is the tool boundary ────────────────────────────────────────────
def test_active_intents_only_use_allowlisted_tools():
    for name in policy.ACTIVE_INTENTS:
        for tool in policy.INTENT_PLAN[name]["tools"]:
            assert tool in tc.ALLOWED_TOOLS, f"{name} uses non-allowlisted tool {tool}"


# ── post-validator: anti-fabrication ───────────────────────────────────────────
_EVIDENCE = [
    {"type": "run", "id": "7e1e7a00-0000-4000-a000-000000000001", "label": "test run",
     "value": "smap_msl:D-4:test", "metadata": {"spacecraft": "MSL"}},
    {"type": "prediction", "id": "f8e8f23e-1da9-4f27-8785-175bd59d9e6b", "label": "NO_GO receipt",
     "value": 2.46062, "metadata": {"window_start_t": 726, "window_end_t": 728,
                                    "attribution": [{"channel_name": "value", "contribution": 0.333333}]}},
    {"type": "threshold", "id": None, "label": "threshold", "value": 0.135467204729745, "metadata": {}},
    {"type": "mlflow", "id": "4a48cb6af8714609b9581d66e904544c", "label": "mlflow", "value": None, "metadata": {}},
    {"type": "model", "id": "1", "label": "tel_anomaly_detector (champion)", "value": 0.6386571043323628,
     "metadata": {"precision": 0.5460286697630902, "recall": 0.7691330132730867}},
]


def test_postvalidate_passes_grounded_prose():
    prose = ("Run smap_msl:D-4:test (7e1e7a00-0000-4000-a000-000000000001) flipped to NO_GO with a "
             "score of 2.46 over window 726-728, above the threshold 0.135. Receipt "
             "f8e8f23e-1da9-4f27-8785-175bd59d9e6b; model tel_anomaly_detector v1 (MLflow 4a48cb6a) "
             "with F1 0.64. Human review: inspect the channel around the window.")
    ok, offenders = tc._postvalidate(prose, _EVIDENCE)
    assert ok, f"grounded prose should pass; offenders={offenders}"


def test_postvalidate_rejects_fabricated_id():
    prose = ("The verdict cites prediction receipt deadbeefcafe1234 and MLflow run 99998888. "
             "Score 2.46, threshold 0.135.")
    ok, offenders = tc._postvalidate(prose, _EVIDENCE)
    assert not ok
    assert any("deadbeef" in o.lower() for o in offenders)


def test_postvalidate_rejects_fabricated_number():
    prose = "The score was 7.99 over window 726-728 — far above threshold 0.135."  # 7.99 not in evidence
    ok, offenders = tc._postvalidate(prose, _EVIDENCE)
    assert not ok
    assert "7.99" in offenders


# ── fail-closed: empty evidence yields no answer ───────────────────────────────
def test_assemble_evidence_empty_state_is_fail_closed():
    assert tc._assemble_evidence({}) == []


# ── flagship serving read: fail closed on a missing run ────────────────────────
def test_get_triggering_prediction_missing_run(fake_cursor):
    from app.services import telemetry_serving as svc
    fake_cursor.push_result([{"tenant_id": TENANT}])   # resolve_tenant_id
    fake_cursor.push_result([])                        # run lookup -> none
    out = svc.get_triggering_prediction(env_id=ENV, business_id=BIZ,
                                        run_key="smap_msl:NOPE:test", fire_tick=728)
    assert out["prediction"] is None
    assert out["null_reason"] == "missing_run"


def test_get_triggering_prediction_returns_no_go_receipt(fake_cursor):
    from app.services import telemetry_serving as svc
    fake_cursor.push_result([{"tenant_id": TENANT}])                 # resolve_tenant_id
    fake_cursor.push_result([{"id": "run-1"}])                       # run lookup
    fake_cursor.push_result([{                                        # NO_GO prediction
        "id": "f8e8f23e-1da9-4f27-8785-175bd59d9e6b", "run_id": "run-1", "channel_name": "value",
        "window_start_t": 726, "window_end_t": 728, "anomaly_score": 2.46062,
        "threshold": 0.135467204729745, "verdict": "NO_GO", "model_name": "tel_anomaly_detector",
        "model_version": "1", "mlflow_run_id": "4a48cb6af8714609b9581d66e904544c",
        "attribution": [{"channel_name": "value", "contribution": 0.333333}], "created_at": None}])
    fake_cursor.push_result([{"id": "run-1", "run_key": "smap_msl:D-4:test", "dataset": "smap_msl",
                              "unit_or_channel": "D-4", "spacecraft": "MSL", "row_count": 8473,
                              "status": "ingested", "created_at": None}])
    out = svc.get_triggering_prediction(env_id=ENV, business_id=BIZ,
                                        run_key="smap_msl:D-4:test", fire_tick=728)
    assert out["null_reason"] is None
    assert out["prediction"]["verdict"] == "NO_GO"
    assert out["prediction"]["id"] == "f8e8f23e-1da9-4f27-8785-175bd59d9e6b"
    assert out["run"]["run_key"] == "smap_msl:D-4:test"
