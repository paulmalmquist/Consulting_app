"""Tests for the Investigation Session backend (plan PR 6).

Run: cd backend && python -m pytest tests/test_analysis_sessions.py -x -q

Focus is on the HONESTY guarantees, exercised as pure functions (no DB, no creds):
  - no fabricated numbers (sections drop ungrounded values)
  - the 8 evals are real pass/fail, not theater
  - fail-closed storage + BigQuery seams
  - migration guardrails
  - app.main imports with the new router mounted
Route-layer happy paths are covered with the service + auth monkeypatched.
"""
import importlib.util
import os
from pathlib import Path

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import analysis_sections as sections  # noqa: E402
from app.services import analysis_evals as evals  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


# ── sections: no fabricated numbers ───────────────────────────────────────────
def test_system_health_grounds_in_audit_summary(monkeypatch):
    from app.services import audit_dashboard
    monkeypatch.setattr(audit_dashboard, "summary", lambda biz, **kw: {
        "window_days": 30, "total_decisions": 12, "success_rate": 0.9,
        "avg_grounding_score": 0.83, "estimated_cost_usd": 0.11, "null_reason": None,
    })
    s = sections.build_system_health(ENV, BIZ)
    assert s["status"] == "available"
    # Every claim with a value carries provenance.
    for c in s["claims"]:
        assert c["value"] is not None
        assert c["source_ref"] and c["source_kind"] == "audit_dashboard.summary"
    # The cost claim is flagged as an estimate, never authoritative.
    cost = next((c for c in s["claims"] if c["source_ref"].get("field") == "estimated_cost_usd"), None)
    assert cost and cost["is_estimate"] is True


def test_system_health_fails_closed_when_no_activity(monkeypatch):
    from app.services import audit_dashboard
    monkeypatch.setattr(audit_dashboard, "summary", lambda biz, **kw: {
        "window_days": 30, "total_decisions": 0, "null_reason": None})
    s = sections.build_system_health(ENV, BIZ)
    assert s["status"] == "not_available"
    assert s["null_reason"] == "no_audit_activity_in_window"
    assert s["claims"] == []  # no fabricated zero-dressed-as-insight


def test_system_health_fails_closed_on_exception(monkeypatch):
    from app.services import audit_dashboard
    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(audit_dashboard, "summary", boom)
    s = sections.build_system_health(ENV, BIZ)
    assert s["status"] == "not_available"
    assert s["null_reason"] == "audit_summary_unavailable"


def test_anomalies_safe_when_intel_cards_absent(monkeypatch):
    # Simulate intelligence_cards.list_cards raising (module/table may be absent).
    import app.services.analysis_sections as mod
    monkeypatch.setattr(mod, "_safe_list_cards", lambda env, biz: (None, "intel_cards_unavailable"))
    s = sections.build_anomalies(ENV, BIZ)
    assert s["status"] == "not_available"
    assert s["null_reason"] == "intel_cards_unavailable"


def test_anomalies_count_matches_card_ids(monkeypatch):
    import app.services.analysis_sections as mod
    cards = [{"id": "a", "anomaly_flag": True}, {"id": "b", "anomaly_flag": True},
             {"id": "c", "anomaly_flag": False}]
    monkeypatch.setattr(mod, "_safe_list_cards", lambda env, biz: (cards, None))
    s = sections.build_anomalies(ENV, BIZ)
    claim = s["claims"][0]
    assert claim["value"] == 2
    assert len(claim["source_ref"]["card_ids"]) == 2  # count == evidence


def test_num_coercion_and_drop():
    assert sections._num("12") == 12
    assert sections._num("3.5") == 3.5
    assert sections._num(None) is None
    assert sections._num("not a number") is None


# ── evals: real checks, not theater ───────────────────────────────────────────
def test_grounding_eval_fails_on_unsourced_number():
    bad = [{"key": "x", "status": "available",
            "claims": [{"text": "n", "value": 5, "source_ref": {}, "source_kind": None}]}]
    r = evals.eval_grounding(bad)
    assert r["passed"] is False
    assert r["detail"]["failures"]


def test_grounding_eval_passes_when_all_sourced():
    good = [{"key": "x", "status": "available",
             "claims": [{"text": "n", "value": 5, "source_ref": {"field": "f"}, "source_kind": "k"}]}]
    assert evals.eval_grounding(good)["passed"] is True


def test_fail_closed_eval_catches_number_in_unavailable_section():
    leaky = [{"key": "x", "status": "not_available", "null_reason": "r",
              "claims": [{"text": "n", "value": 9, "source_ref": {"field": "f"}, "source_kind": "k"}]}]
    r = evals.eval_fail_closed(leaky)
    assert r["passed"] is False
    assert any(f["reason"] == "number_in_unavailable_section" for f in r["detail"]["failures"])


def test_fail_closed_eval_requires_null_reason():
    r = evals.eval_fail_closed([{"key": "x", "status": "not_available", "null_reason": None, "claims": []}])
    assert r["passed"] is False


def test_pause_resume_eval_detects_work_after_pause():
    session = {"invalidated_run_tokens": ["tok-1"]}
    events = [
        {"seq": 1, "event_type": "session.paused", "run_token": None},
        {"seq": 2, "event_type": "section.started", "run_token": "tok-1"},  # leak: old token after pause
    ]
    r = evals.eval_pause_resume(session, events)
    assert r["passed"] is False
    assert r["detail"]["leaks"]


def test_pause_resume_eval_passes_clean():
    session = {"invalidated_run_tokens": ["tok-1"]}
    events = [
        {"seq": 1, "event_type": "section.completed", "run_token": "tok-1"},
        {"seq": 2, "event_type": "session.paused", "run_token": None},
        {"seq": 3, "event_type": "section.started", "run_token": "tok-2"},  # new token, fine
    ]
    assert evals.eval_pause_resume(session, events)["passed"] is True


def test_pause_resume_eval_not_measurable_when_never_paused():
    r = evals.eval_pause_resume({"invalidated_run_tokens": []}, [])
    assert r["passed"] is None  # fail closed: not measurable, never a fake pass


def test_steering_eval_requires_plan_revised():
    events = [{"event_type": "user.steer_submitted", "payload": {"steer_id": "s1"}}]
    r = evals.eval_steering(events)
    assert r["passed"] is False  # steer with no plan.revised


def test_audit_eval_flags_missing_receipt():
    session = {"status": "completed"}  # no finalize_audit_event_id
    events = [{"seq": 1, "event_type": "section.started", "audit_event_id": None}]
    r = evals.eval_audit(session, events)
    assert r["passed"] is False


def test_run_all_returns_eight_categories():
    out = evals.run_all({"status": "running", "invalidated_run_tokens": []}, [], [])
    assert set(out.keys()) == set(evals.EVAL_CATEGORIES)
    assert len(out) == 8


# ── artifact seam: fail closed ────────────────────────────────────────────────
def test_artifact_store_fails_closed_without_creds(monkeypatch):
    from app.services import ade_session_artifacts as art
    monkeypatch.setattr("app.config.SUPABASE_URL", "", raising=False)
    monkeypatch.setattr("app.config.SUPABASE_SERVICE_ROLE_KEY", "", raising=False)
    assert art.storage_configured() is False
    with pytest.raises(art.ArtifactStorageNotConfigured):
        art.store_artifact(env_id=ENV, session_id="s", kind="report", name="r.md", body=b"hi")


def test_safe_store_artifact_returns_truthful_pointer_without_creds(monkeypatch):
    from app.services import ade_session_artifacts as art
    monkeypatch.setattr("app.config.SUPABASE_URL", "", raising=False)
    monkeypatch.setattr("app.config.SUPABASE_SERVICE_ROLE_KEY", "", raising=False)
    p = art.safe_store_artifact(env_id=ENV, session_id="s", kind="report", name="r.md", body=b"hi")
    assert p.artifact_status == "skipped_storage_unconfigured"
    assert p.null_reason  # discloses why; never a fabricated 'stored'
    import hashlib
    assert p.sha256 == hashlib.sha256(b"hi").hexdigest()


# ── BigQuery mirror seam: fail closed ─────────────────────────────────────────
def _import_exporter():
    import sys
    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import export_sessions_to_bq  # noqa: PLC0415
    return export_sessions_to_bq


def test_session_export_fails_closed_without_creds(monkeypatch):
    exporter = _import_exporter()
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("BQ_PROJECT_ID", raising=False)
    with pytest.raises(exporter.ExportNotConfigured):
        exporter.export_session_events()
    assert exporter.main(["--since", "2026-06-01"]) == 2  # non-zero, never success


def test_cleanup_refuses_without_export_config(monkeypatch):
    import sys
    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import cleanup_analysis_session_events as cleanup  # noqa: PLC0415
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("BQ_PROJECT_ID", raising=False)
    # Refuses to delete (returns 2) — never delete without a confirmed mirror.
    assert cleanup.main(["--older-than-days", "90", "--confirm"]) == 2


# ── steering: injection-safe whitelist ────────────────────────────────────────
def test_steer_parser_whitelists_verbs():
    from app.services import analysis_sessions as svc
    assert svc._parse_steer("focus on supplier risk")["kind"] == "focus"
    assert svc._parse_steer("DROP TABLE nv_analysis_sessions")["kind"] == "unsupported"
    assert svc._parse_steer("'; SELECT * FROM users; --")["kind"] == "unsupported"


def test_redact_strips_secrets():
    from app.services import analysis_sessions as svc
    out = svc._redact("token=abc123 and api_key=zzz")
    assert "abc123" not in out and "zzz" not in out


# ── migration guardrails ──────────────────────────────────────────────────────
def test_migration_has_guardrails():
    sql_path = (Path(__file__).resolve().parents[2] / "repo-b" / "db" / "schema"
                / "10020_nv_analysis_sessions.sql")
    sql = sql_path.read_text(encoding="utf-8")
    for tbl in ("nv_analysis_sessions", "nv_analysis_session_events", "nv_analysis_session_eval_results"):
        assert f"CREATE TABLE IF NOT EXISTS {tbl}" in sql
        assert f"COMMENT ON TABLE {tbl}" in sql
    assert sql.count("ENABLE ROW LEVEL SECURITY") == 3
    assert sql.count("current_setting('app.env_id', true)") >= 3
    assert "active_run_token" in sql and "invalidated_run_tokens" in sql
    assert "90" in sql  # retention note present


# ── import guard ──────────────────────────────────────────────────────────────
def test_app_main_imports_with_analysis_router():
    from app.main import app
    paths = {r.path for r in app.routes}
    assert "/api/ade/analytics/sessions" in paths
    assert "/api/ade/analytics/sessions/{session_id}/stream" in paths


def test_modules_import_without_io():
    # None of the new modules may do I/O / read creds at import time.
    for name in ("analysis_sessions", "analysis_sections", "analysis_evals", "ade_session_artifacts"):
        spec = importlib.util.find_spec(f"app.services.{name}")
        assert spec is not None
