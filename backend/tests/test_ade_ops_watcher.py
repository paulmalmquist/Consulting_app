"""ADE Ops PR 6A — post-change watcher. Evaluate + recommend; never roll back."""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import approvals, watcher  # noqa: E402
from app.services.ade_ops.watcher import Observation, WatcherVerdict  # noqa: E402

T0 = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def _executed(*, mode="nonprod", opened=T0, window="14-day", rollback="restore prior"):
    r = approvals.create_approval_request(
        {"recommendation_id": "r", "command_name": "ade.compute.recommend_rightsize",
         "category": "compute", "provider": "snowflake", "target_ref": "ADE_OPS_NONPROD_WH",
         "status": "degraded", "rollback_required": True, "observation_window": window,
         "risk_tier": 4, "evidence": []},
        now=T0, rollback_plan=rollback, observation_window=window)
    r.executed = True
    r.execution_mode = mode
    r.observation_window_opened_at = opened.isoformat()
    return r


# ── window parsing ────────────────────────────────────────────────────────────

def test_parse_window():
    assert watcher.parse_window_seconds("14-day") == 14 * 86400
    assert watcher.parse_window_seconds("6 hours") == 6 * 3600
    assert watcher.parse_window_seconds("30m") == 1800
    assert watcher.parse_window_seconds("next 3 refresh cycles") == watcher.DEFAULT_WINDOW_SECONDS
    assert watcher.parse_window_seconds(None) == watcher.DEFAULT_WINDOW_SECONDS


# ── the five verdicts ─────────────────────────────────────────────────────────

def test_not_executed_is_insufficient():
    r = _executed()
    r.executed = False
    res = watcher.evaluate(r, observation=None, now=T0)
    assert res.verdict is WatcherVerdict.INSUFFICIENT_EVIDENCE and res.null_reason == "not_executed"


def test_missing_evidence_after_window_is_insufficient_not_success():
    r = _executed(window="30m")
    res = watcher.evaluate(r, observation=Observation(evidence_status="missing"),
                           now=T0 + timedelta(hours=1))  # window closed
    assert res.verdict is WatcherVerdict.INSUFFICIENT_EVIDENCE
    assert res.null_reason == "no_observation_evidence"


def test_missing_evidence_within_window_is_still_observing():
    r = _executed(window="14-day")
    res = watcher.evaluate(r, observation=Observation(evidence_status="missing"), now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.STILL_OBSERVING and res.window_open is True


def test_failed_telemetry_is_degraded():
    r = _executed()
    res = watcher.evaluate(r, observation=Observation(evidence_status="failed", source="tel"), now=T0)
    assert res.verdict is WatcherVerdict.DEGRADED and res.null_reason == "telemetry_failed"


def test_stale_telemetry_is_degraded():
    r = _executed()
    res = watcher.evaluate(r, observation=Observation(evidence_status="stale", source="tel"), now=T0)
    assert res.verdict is WatcherVerdict.DEGRADED and res.null_reason == "telemetry_stale"


def test_improved_after_window_is_accepted():
    r = _executed(window="30m")
    obs = Observation(evidence_status="ok", metric="cost", expected=100.0, observed=80.0,
                      lower_is_better=True, source="bq")
    res = watcher.evaluate(r, observation=obs, now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.ACCEPTED
    assert "No rollback recommended" in res.recommendation


def test_stable_within_tolerance_after_window_is_accepted():
    r = _executed(window="30m")
    obs = Observation(evidence_status="ok", expected=100.0, observed=105.0, lower_is_better=True)
    res = watcher.evaluate(r, observation=obs, now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.ACCEPTED  # within 10% band


def test_worse_outcome_is_rollback_recommended():
    r = _executed(window="30m")
    obs = Observation(evidence_status="ok", metric="cost", expected=100.0, observed=150.0,
                      lower_is_better=True, source="bq")
    res = watcher.evaluate(r, observation=obs, now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.ROLLBACK_RECOMMENDED
    assert "not executed" in res.recommendation.lower()  # artifact only


def test_good_signal_within_window_keeps_observing():
    r = _executed(window="14-day")
    obs = Observation(evidence_status="ok", expected=100.0, observed=80.0)
    res = watcher.evaluate(r, observation=obs, now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.STILL_OBSERVING  # don't declare victory early


def test_no_observation_window_recorded():
    r = _executed()
    r.observation_window_opened_at = None
    res = watcher.evaluate(r, observation=Observation(evidence_status="ok", expected=1, observed=1), now=T0)
    assert res.verdict is WatcherVerdict.INSUFFICIENT_EVIDENCE
    assert res.null_reason == "observation_window_unavailable"


# ── recommendation is an artifact only; no rollback execution path ────────────

def test_rollback_recommendation_executes_nothing():
    r = _executed(window="30m")
    obs = Observation(evidence_status="ok", expected=100.0, observed=200.0)
    res = watcher.evaluate(r, observation=obs, now=T0 + timedelta(hours=1))
    assert res.verdict is WatcherVerdict.ROLLBACK_RECOMMENDED
    assert r.rolled_back is False         # watcher did not roll back
    assert r.executed is True             # unchanged


def test_no_execution_token_in_watcher_module():
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(watcher))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            b = node.body
            if b and isinstance(b[0], ast.Expr) and isinstance(getattr(b[0], "value", None), ast.Constant) \
                    and isinstance(b[0].value.value, str):
                b[0].value.value = ""
    code = ast.unparse(tree).lower()
    for tok in ("subprocess", "os.system", "alter warehouse", "execute_auto_suspend",
                "snowflake.connector", "client.execute", "record_real_execution"):
        assert tok not in code, f"watcher must not execute anything; found {tok!r}"
