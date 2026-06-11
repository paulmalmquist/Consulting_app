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


# ── Phase 7: Test Report Workflow ──────────────────────────────────────────────
_REPORT_STATE = {
    "run": {"id": "7e1e7a00-0000-4000-a000-000000000001", "run_key": "smap_msl:D-4:test",
            "dataset": "smap_msl", "spacecraft": "MSL"},
    "prediction": {"id": "f8e8f23e-1da9-4f27-8785-175bd59d9e6b", "verdict": "NO_GO",
                   "channel_name": "value", "window_start_t": 726, "window_end_t": 728,
                   "anomaly_score": 2.46062, "threshold": 0.135467204729745,
                   "model_name": "tel_anomaly_detector", "model_version": "1",
                   "mlflow_run_id": "4a48cb6af8714609b9581d66e904544c",
                   "attribution": [{"channel_name": "value", "contribution": 0.333333}]},
    "model": {"model_name": "tel_anomaly_detector", "model_version": "1", "model_alias": "champion",
              "promotion_state": "promoted", "mlflow_run_id": "4a48cb6af8714609b9581d66e904544c",
              "metrics": {"f1": 0.6386571, "precision": 0.5460287, "recall": 0.7691330}},
    "events": [],
}


def test_report_md_contains_required_evidence_trail():
    import uuid
    md = tc._build_report_md(_REPORT_STATE, report_id=uuid.uuid4(), prompt_version="testver",
                             generated_at="2026-06-02T00:00:00Z")
    # the report must cite the real evidence chain
    for token in ["smap_msl:D-4:test", "f8e8f23e-1da9-4f27-8785-175bd59d9e6b", "2.46062",
                  "0.135467", "tel_anomaly_detector", "4a48cb6af8714609b9581d66e904544c", "0.638657"]:
        assert token in md, f"report missing evidence token {token}"
    # the verdict must be attributed to the detector (model output), not framed as a test/hardware failure
    low = md.lower()
    assert "telemetry anomaly detector" in low and "returned a" in low
    assert "not a statement that the test, vehicle, or hardware failed" in low


def test_report_md_includes_human_review_disclaimer():
    import uuid
    md = tc._build_report_md(_REPORT_STATE, report_id=uuid.uuid4(), prompt_version="v",
                             generated_at="t")
    assert tc.REVIEW_DISCLAIMER in md
    assert "REQUIRES HUMAN REVIEW" in md


def test_report_md_omits_root_cause_and_safety_disposition():
    import uuid
    md = tc._build_report_md(_REPORT_STATE, report_id=uuid.uuid4(), prompt_version="v",
                             generated_at="t").lower()
    # statistical interpretation only — must explicitly NOT claim physical cause / safety disposition
    assert "physical root cause" in md
    assert "does not infer physical root cause" in md
    assert "final engineering or safety disposition" in md


def test_draft_report_unsupported_root_cause_is_refused_pre_llm():
    # The report is built from a fixed evidence chain; an out-of-scope "root cause" question never
    # reaches report generation because the classifier refuses it first.
    intent, refusal = policy.classify("Write a report on the physical root cause of the D-4 failure")
    assert intent is None and refusal == policy.NULL_UNSUPPORTED


def test_draft_report_missing_run_fails_closed(fake_cursor, monkeypatch):
    # get_triggering_prediction -> missing_run; no evidence -> no report, no persisted row.
    fake_cursor.push_result([{"tenant_id": TENANT}])   # resolve_tenant_id
    fake_cursor.push_result([])                        # run lookup -> none
    out = tc.draft_report(env_id=ENV, business_id=BIZ, run_key="smap_msl:NOPE:test", fire_tick=728)
    assert out["report_id"] is None
    assert out["generated_markdown"] is None
    assert out["null_reason"] in ("missing_run", "no_prediction_rows")
    # fail-closed: no INSERT into tel_copilot_reports was issued
    assert not any("INSERT INTO tel_copilot_reports" in q[0] for q in fake_cursor.queries)


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


# ── Phase 8: governance + evals (observability) ────────────────────────────────
def test_evals_reads_committed_artifact():
    # Serves the real pytest-run results artifact; never invents pass/fail.
    e = tc.evals()
    assert e["available"] is True
    assert e["summary"]["total"] == len(e["cases"]) and e["summary"]["total"] >= 5
    assert {"grounded_no_go", "refusal_proprietary_root_cause", "fail_closed_missing_input"} <= {c["key"] for c in e["cases"]}
    assert e.get("source", "").startswith("pytest")


def test_evals_fail_closed_when_artifact_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(tc, "_EVAL_PATH", tmp_path / "nope.json")
    e = tc.evals()
    assert e["available"] is False and e["null_reason"] == "eval_results_not_recorded"


def test_governance_summary_aggregates(fake_cursor):
    # 9 queries in order: agg, source_mix, null_reasons, active, fallback, tool_stats, recent,
    # refusals, blocked. production_smoke reads the committed artifact (no DB).
    fake_cursor.push_result([{"n": 10, "refusal_rate": 0.2, "grounded_rate": 0.8, "p50_ms": 2500, "p95_ms": 6000}])
    fake_cursor.push_result([{"answer_source": "live_llm", "n": 7}, {"answer_source": "fallback_template", "n": 2}, {"answer_source": "refusal", "n": 1}])
    fake_cursor.push_result([{"nr": "(none)", "n": 9}, {"nr": "unsupported_question", "n": 1}])
    fake_cursor.push_result([{"prompt_version": "e1d3a0daab52", "model": "gpt-5-mini"}])
    fake_cursor.push_result([{"fr": "(none)", "n": 8}, {"fr": "postvalidate_block", "n": 2}])
    fake_cursor.push_result([{"st": "success", "n": 20}, {"st": "skipped", "n": 5}, {"st": "error", "n": 1}])
    fake_cursor.push_result([{"created_at": "2026-06-02T10:00:00", "intent": "why_no_go", "is_refusal": False, "answer_source": "live_llm", "fallback_reason": None, "null_reason": None, "evidence_count": 5, "elapsed_ms": 3000, "question": "why no-go"}])
    fake_cursor.push_result([{"created_at": "2026-06-02T10:01:00", "question": "what caused it", "null_reason": "unsupported_question"}])
    fake_cursor.push_result([{"created_at": "2026-06-02T10:02:00", "question": "fabricated claim attempt"}])
    g = tc.governance_summary(env_id=ENV, business_id=BIZ)
    assert g["total_interactions"] == 10
    assert g["fallback_rate"] == 0.2 and g["live_llm_rate"] == 0.7
    assert g["postvalidator_block_count"] == 2
    assert g["tool_call_stats"] == {"success": 20, "skipped": 5, "error": 1}
    assert len(g["recent_interactions"]) == 1 and len(g["recent_refusals"]) == 1 and len(g["unsupported_blocked_examples"]) == 1
    assert g["production_smoke"]["status"] in ("pass", "not_available")  # reads committed artifact
    assert g["active_prompt_version"] == "e1d3a0daab52"


# ── Track B: operator usefulness (disposition capture + measurement) ────────────
REPORT_ID = str(uuid4())


def _gov_pushes(fake_cursor):
    """Queue the 9 governance_summary queries (with real anchor numbers) in order."""
    fake_cursor.push_result([{"n": 10, "refusal_rate": 0.2, "grounded_rate": 0.8, "p50_ms": 2500, "p95_ms": 6000}])
    fake_cursor.push_result([{"answer_source": "live_llm", "n": 8}, {"answer_source": "refusal", "n": 2}])
    fake_cursor.push_result([{"nr": "(none)", "n": 8}, {"nr": "unsupported_question", "n": 2}])
    fake_cursor.push_result([{"prompt_version": "e1d3a0daab52", "model": "gpt-5-mini"}])
    fake_cursor.push_result([{"fr": "(none)", "n": 9}, {"fr": "postvalidate_block", "n": 1}])
    fake_cursor.push_result([{"st": "success", "n": 12}])
    fake_cursor.push_result([])   # recent
    fake_cursor.push_result([])   # refusals
    fake_cursor.push_result([])   # blocked


def test_disposition_records_and_flags_override(fake_cursor):
    # query order: SELECT report (verdict+run_key) -> INSERT (no fetch)
    fake_cursor.push_result([{"verdict": "NO_GO", "run_key": "smap_msl:D-4:test"}])
    out = tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="assisted",
                                human_verdict="GO", fire_tick=728, confidence=4, time_to_verdict_ms=5200,
                                evidence_opened=3, pair_id=None)
    assert out["is_override"] is True and out["arm"] == "assisted" and out["null_reason"] is None
    assert out["action_id"] is not None
    assert any("INSERT INTO tel_copilot_review_actions" in q[0] for q in fake_cursor.queries)


def test_disposition_agree_is_not_override(fake_cursor):
    fake_cursor.push_result([{"verdict": "NO_GO", "run_key": "smap_msl:D-4:test"}])
    out = tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="assisted",
                                human_verdict="NO_GO", fire_tick=728)
    assert out["is_override"] is False


def test_disposition_defer_is_not_override(fake_cursor):
    fake_cursor.push_result([{"verdict": "GO", "run_key": "smap_msl:D-4:test"}])
    out = tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="unassisted",
                                human_verdict="DEFER")
    assert out["is_override"] is False


def test_disposition_bad_arm_fails_closed_no_write(fake_cursor):
    import pytest
    with pytest.raises(ValueError):
        tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="bogus",
                              human_verdict="GO")
    # validation happens BEFORE any DB access — no report SELECT, no INSERT
    assert fake_cursor.queries == []


def test_disposition_bad_confidence_fails_closed_no_write(fake_cursor):
    import pytest
    with pytest.raises(ValueError):
        tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="assisted",
                              human_verdict="GO", confidence=9)
    assert fake_cursor.queries == []


def test_disposition_missing_report_no_insert(fake_cursor):
    import pytest
    fake_cursor.push_result([])   # report SELECT returns nothing
    with pytest.raises(LookupError):
        tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="assisted",
                              human_verdict="GO")
    assert not any("INSERT INTO tel_copilot_review_actions" in q[0] for q in fake_cursor.queries)


def test_disposition_report_lookup_is_tenant_scoped(fake_cursor):
    fake_cursor.push_result([{"verdict": "NO_GO", "run_key": "smap_msl:D-4:test"}])
    tc.record_disposition(env_id=ENV, business_id=BIZ, report_id=REPORT_ID, arm="assisted",
                          human_verdict="GO")
    sel = next(q for q in fake_cursor.queries if "FROM tel_copilot_reports" in q[0])
    assert ENV in sel[1] and str(BIZ) in sel[1]   # scoped by env + business


def test_usefulness_n0_renders_not_measured_but_anchors_present(fake_cursor):
    # query order: per-arm core (empty), agreement/precision (empty), then 9 governance queries
    fake_cursor.push_result([])   # per-arm core: no sessions
    fake_cursor.push_result([])   # agreement/precision: no sessions
    _gov_pushes(fake_cursor)
    u = tc.usefulness_summary(env_id=ENV, business_id=BIZ)
    assert u["status"] == "not_measured" and u["null_reason"] == "no_sessions"
    # human-outcome metrics are None (NOT a fabricated 0) at N=0
    assert u["arms"]["assisted"]["n"] == 0 and u["arms"]["assisted"]["median_ttv_ms"] is None
    assert u["arms"]["assisted"]["agreement_rate"] is None
    assert u["delta"]["ttv_pct_faster"] is None
    # deterministic anchors are STILL real (they predate Track B sessions)
    assert u["anchors"]["refusal_rate"] == 0.2
    assert u["anchors"]["postvalidator_block_count"] == 1
    assert u["anchors"]["grounded_rate"] == 0.8


def test_usefulness_surfaces_per_arm_measures_and_delta(fake_cursor):
    # both arms have sessions; assisted faster + higher agreement -> a real delta
    fake_cursor.push_result([
        {"arm": "assisted", "n": 4, "median_ttv_ms": 4000, "mean_confidence": 4.0,
         "evidence_open_rate": 0.75, "override_rate": 0.25},
        {"arm": "unassisted", "n": 4, "median_ttv_ms": 10000, "mean_confidence": 3.0,
         "evidence_open_rate": 0.0, "override_rate": 0.5}])
    fake_cursor.push_result([
        {"arm": "assisted", "agreement_rate": 1.0, "n_overrides": 1, "override_precision": 1.0},
        {"arm": "unassisted", "agreement_rate": 0.75, "n_overrides": 2, "override_precision": 0.5}])
    _gov_pushes(fake_cursor)
    u = tc.usefulness_summary(env_id=ENV, business_id=BIZ)
    assert u["status"] == "measured"
    assert u["arms"]["assisted"]["median_ttv_ms"] == 4000
    assert u["arms"]["assisted"]["override_precision"] == 1.0
    # delta computed only because BOTH arms have N>0: (10000-4000)/10000 = 60%
    assert u["delta"]["ttv_pct_faster"] == 60.0
    assert u["delta"]["agreement_pp"] == 25.0   # (1.0 - 0.75) * 100


def test_usefulness_delta_blank_when_one_arm_empty(fake_cursor):
    fake_cursor.push_result([
        {"arm": "assisted", "n": 3, "median_ttv_ms": 3000, "mean_confidence": 4.0,
         "evidence_open_rate": 1.0, "override_rate": 0.0}])   # only assisted
    fake_cursor.push_result([
        {"arm": "assisted", "agreement_rate": 1.0, "n_overrides": 0, "override_precision": None}])
    _gov_pushes(fake_cursor)
    u = tc.usefulness_summary(env_id=ENV, business_id=BIZ)
    assert u["status"] == "measured"          # assisted has sessions
    assert u["arms"]["unassisted"]["n"] == 0
    assert u["delta"]["ttv_pct_faster"] is None   # never one-sided
    assert u["delta"]["agreement_pp"] is None


def test_usefulness_anchors_come_from_logs_not_constants(fake_cursor):
    # distinct anchor numbers must appear verbatim -> proves they trace to tel_copilot_interactions
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    fake_cursor.push_result([{"n": 50, "refusal_rate": 0.123, "grounded_rate": 0.917, "p50_ms": 1, "p95_ms": 2}])
    fake_cursor.push_result([{"answer_source": "live_llm", "n": 50}])
    fake_cursor.push_result([{"nr": "(none)", "n": 50}])
    fake_cursor.push_result([{"prompt_version": "zz", "model": "gpt-5-mini"}])
    fake_cursor.push_result([{"fr": "postvalidate_block", "n": 7}])
    fake_cursor.push_result([{"st": "success", "n": 1}])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    u = tc.usefulness_summary(env_id=ENV, business_id=BIZ)
    assert u["anchors"]["refusal_rate"] == 0.123
    assert u["anchors"]["grounded_rate"] == 0.917
    assert u["anchors"]["postvalidator_block_count"] == 7
    assert u["anchors"]["answer_source_mix"] == {"live_llm": 50}
