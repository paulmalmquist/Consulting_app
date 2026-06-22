"""Tests for the analyzer -> intel card persistence seam (connective PR).

Run: cd backend && python -m pytest tests/test_analyzer_persist.py -x -q

Proves: a finding dict round-trips through from_dict -> to_intel_card -> upsert_card with the
right kwargs and source_ref (idempotency carrier); the written count is accurate; an empty
list is a no-op; and a per-finding failure is skipped, not raised (best-effort, fail-closed).
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import analyzer_persist  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


def _finding(fid="tel-001", severity="warning", confidence=0.8, evidence=("anomaly_rate=0.15",)):
    """A valid finding dict as the analyzer services emit (AnalyzerFinding.to_dict())."""
    return {
        "finding_id": fid,
        "env_id": ENV,
        "analyzer_type": "telemetry",
        "source_ref": {"source": "telemetry_serving.monitoring", "field": "anomaly_rate"},
        "severity": severity,
        "what_changed": "Anomaly rate elevated",
        "why_it_matters": "Sustained anomalies degrade serving quality.",
        "confidence": confidence,
        "evidence_refs": list(evidence),
        "metric_refs": ["anomaly_rate"],
        "driver_math": None,
        "null_reasons": [],
        "recommendations": [],
        "next_questions": [],
        "cost_to_generate_usd": None,
        "latency_ms": 12,
        "eval_status": None,
    }


def _capture_upserts(monkeypatch):
    from app.services import intelligence_cards
    calls = []
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: calls.append((env, str(biz), kw)) or {"id": f"card-{len(calls)}"})
    return calls


# ── happy path ────────────────────────────────────────────────────────────────
def test_persists_one_card_per_finding(monkeypatch):
    calls = _capture_upserts(monkeypatch)
    n = analyzer_persist.persist_findings_as_cards(ENV, BIZ, [_finding("a"), _finding("b")])
    assert n == 2
    assert len(calls) == 2


def test_upsert_kwargs_match_to_intel_card(monkeypatch):
    calls = _capture_upserts(monkeypatch)
    analyzer_persist.persist_findings_as_cards(ENV, BIZ, [_finding("a", severity="critical",
                                                                   confidence=0.95)])
    env, biz, kw = calls[0]
    assert env == ENV and biz == BIZ
    # critical -> alert card with anomaly_flag (deterministic mapping, no LLM)
    assert kw["card_type"] == "alert"
    assert kw["anomaly_flag"] is True
    assert kw["created_by"] == "analyzer:telemetry"
    # source_ref carries the finding id so re-running updates rather than duplicates
    assert kw["source_ref"]["type"] == "analyzer_finding"
    assert kw["source_ref"]["finding_id"] == "a"


def test_empty_findings_is_noop(monkeypatch):
    calls = _capture_upserts(monkeypatch)
    assert analyzer_persist.persist_findings_as_cards(ENV, BIZ, []) == 0
    assert calls == []


# ── fail closed ───────────────────────────────────────────────────────────────
def test_one_bad_finding_is_skipped_not_raised(monkeypatch):
    calls = _capture_upserts(monkeypatch)
    # second finding is invalid (high confidence, no evidence) -> from_dict raises, skipped
    bad = _finding("bad", confidence=0.9, evidence=())
    good = _finding("good")
    n = analyzer_persist.persist_findings_as_cards(ENV, BIZ, [bad, good])
    assert n == 1            # only the valid one written
    assert len(calls) == 1
    assert calls[0][2]["source_ref"]["finding_id"] == "good"


def test_upsert_exception_is_swallowed(monkeypatch):
    from app.services import intelligence_cards

    def boom(env, biz, **kw):
        raise RuntimeError("db down")

    monkeypatch.setattr(intelligence_cards, "upsert_card", boom)
    # never raises; reports zero written
    assert analyzer_persist.persist_findings_as_cards(ENV, BIZ, [_finding("a")]) == 0
