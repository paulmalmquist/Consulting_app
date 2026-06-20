"""Tests for the optional single-call LLM brief narration (plan PR 16b).

Proves: AT MOST one model call per generation; ZERO calls when disabled/unconfigured; a
model failure does not fail the brief; a narration that invents a number is rejected and the
deterministic text kept; an audit receipt is recorded; and the deterministic brief still
works with the model disabled.

Run: cd backend && python -m pytest tests/test_morning_brief_summary.py -x -q
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import morning_brief_summary as sumsvc  # noqa: E402

ENV = "env-A"
BIZ = "00000000-0000-0000-0000-000000000001"

_BRIEF = {
    "brief_date": "2026-06-16",
    "confidence": "high",
    "counts": {"anomaly_count": 2, "watch_count": 1, "cards_scanned": 5},
    "what_changed": [{"title": "PSI drift", "priority_score": 1.0}],
    "why_it_matters": [{"reason": "drift erodes serving quality"}],
    "what_to_watch": [{"title": "overdue tasks", "priority_score": 0.7}],
    "recommended_actions": [],
    "null_reasons": [],
}
_DIGEST = "Morning brief: 2 signals changed, 1 to watch. Lead: PSI drift"


class _Resp:
    def __init__(self, text):
        self.choices = [type("C", (), {"message": type("M", (), {"content": text})()})()]
        self.usage = type("U", (), {"prompt_tokens": 10, "completion_tokens": 8})()


def _patch_config(monkeypatch, *, enabled, key="sk-test"):
    from app import config
    monkeypatch.setattr(config, "MORNING_BRIEF_SUMMARY_ENABLED", enabled, raising=False)
    monkeypatch.setattr(config, "OPENAI_API_KEY", key, raising=False)


def _patch_openai(monkeypatch, text="A short grounded summary of 2 signals."):
    """Patch openai.OpenAI so .chat.completions.create returns _Resp(text). Counts calls."""
    calls = {"n": 0}

    class _Client:
        def __init__(self, **kw):
            pass

        class chat:  # noqa: N801
            class completions:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    calls["n"] += 1
                    return _Resp(text)

    import openai
    monkeypatch.setattr(openai, "OpenAI", _Client)
    return calls


def _patch_receipt(monkeypatch):
    from app.services import governance
    receipts = []
    monkeypatch.setattr(governance, "record_decision", lambda **kw: receipts.append(kw) or "rid")
    return receipts


# ── zero calls when disabled / unconfigured ───────────────────────────────────
def test_disabled_makes_no_model_call(monkeypatch):
    _patch_config(monkeypatch, enabled=False)
    calls = _patch_openai(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert calls["n"] == 0
    assert out["used_llm"] is False
    assert out["summary_text"] == _DIGEST
    assert out["null_reason"] == "summary_disabled"


def test_no_provider_makes_no_model_call(monkeypatch):
    _patch_config(monkeypatch, enabled=True, key="")  # enabled but no key
    calls = _patch_openai(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert calls["n"] == 0
    assert out["used_llm"] is False
    assert out["null_reason"] == "summary_provider_unavailable"


# ── exactly one call when enabled ─────────────────────────────────────────────
def test_enabled_makes_exactly_one_call_and_uses_narration(monkeypatch):
    _patch_config(monkeypatch, enabled=True)
    calls = _patch_openai(monkeypatch, text="Two signals changed today; one item to watch.")
    receipts = _patch_receipt(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert calls["n"] == 1                                   # AT MOST one — exactly one here
    assert out["used_llm"] is True
    assert out["summary_text"] == "Two signals changed today; one item to watch."
    assert len(receipts) == 1                                # audit receipt recorded
    assert receipts[0]["decision_type"] == "response"
    assert receipts[0]["tool_name"] == "morning_brief_summary"
    assert receipts[0]["model_used"]


# ── validation: invented number rejected ──────────────────────────────────────
def test_narration_with_uncited_number_is_rejected(monkeypatch):
    _patch_config(monkeypatch, enabled=True)
    # 2, 1, 5 (counts), 1.0/0.7 (priorities), 2026-06-16 are allowed; "47%" is invented.
    calls = _patch_openai(monkeypatch, text="Anomalies rose 47% overnight.")
    receipts = _patch_receipt(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert calls["n"] == 1
    assert out["used_llm"] is False                          # narration discarded
    assert out["summary_text"] == _DIGEST                    # deterministic kept
    assert out["null_reason"] == "summary_unsupported_claim"
    assert receipts[0]["output_summary"]["used_llm"] is False


def test_narration_reusing_brief_numbers_is_accepted(monkeypatch):
    _patch_config(monkeypatch, enabled=True)
    _patch_openai(monkeypatch, text="2 signals changed and 1 needs watching on 2026-06-16.")
    _patch_receipt(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert out["used_llm"] is True                           # all numbers are from the brief


# ── model failure is non-fatal ────────────────────────────────────────────────
def test_model_failure_falls_back_to_deterministic(monkeypatch):
    _patch_config(monkeypatch, enabled=True)
    import openai

    class _Boom:
        def __init__(self, **kw):
            pass

        class chat:  # noqa: N801
            class completions:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    raise RuntimeError("api down")

    monkeypatch.setattr(openai, "OpenAI", _Boom)
    receipts = _patch_receipt(monkeypatch)
    out = sumsvc.summarize_brief(_BRIEF, env_id=ENV, business_id=BIZ, deterministic_digest=_DIGEST)
    assert out["used_llm"] is False
    assert out["summary_text"] == _DIGEST
    assert out["null_reason"] == "summary_failed"
    assert receipts[0]["success"] is False                  # receipt records the failure


# ── integration: generate uses deterministic text when disabled ───────────────
def test_generate_uses_deterministic_text_when_summary_disabled(monkeypatch):
    from app.services import morning_brief as mb
    from app import config
    monkeypatch.setattr(config, "MORNING_BRIEF_SUMMARY_ENABLED", False, raising=False)
    from app.services import intelligence_cards, enterprise_memory
    alert = {"id": "al", "card_type": "alert", "title": "PSI drift", "summary": "drift",
             "anomaly_flag": True, "priority_score": 1.0, "source_ref": {}, "is_dismissed": False}
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: [alert] if card_type == "alert" else [])
    captured = {}
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: captured.update(kw) or {"id": "c1"})
    monkeypatch.setattr(enterprise_memory, "search", lambda *a, **k: {"items": [], "null_reason": None})
    out = mb.generate(ENV, BIZ, brief_date="2026-06-16")
    # summary metadata records the LLM was not used; card summary is the deterministic digest
    assert out["brief"]["summary"]["used_llm"] is False
    assert "Morning brief" in captured["summary"]


# ── NO tools / no data access in the module ───────────────────────────────────
def test_module_does_not_import_tools_or_registry():
    import ast
    import inspect
    banned = ("mcp", "registry", "rag_indexer", "get_cursor")  # narration must not query data
    tree = ast.parse(inspect.getsource(sumsvc))
    imported = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            imported += [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            imported.append(n.module or "")
    for name in imported:
        assert not any(b in name for b in banned), f"narration must not import {name!r}"
