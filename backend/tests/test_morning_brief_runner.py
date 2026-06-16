"""Tests for the manual morning-brief runner (plan PR 16c).

The runner is a thin wrapper over app.services.morning_brief.generate (the same path the POST
route uses), so idempotency/determinism are covered by test_morning_brief.py. Here we prove
the runner threads its args through and fails closed (non-zero exit + null_reason) when the
brief can't be produced.

Run: cd backend && python -m pytest tests/test_morning_brief_runner.py -x -q
"""
import importlib.util
import os
import sys
from pathlib import Path

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

_SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "generate_morning_brief.py"


def _load_runner():
    spec = importlib.util.spec_from_file_location("generate_morning_brief", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_runner_threads_args_and_succeeds(monkeypatch, capsys):
    runner = _load_runner()
    from app.services import morning_brief
    seen = {}
    monkeypatch.setattr(morning_brief, "generate",
                        lambda env, biz, **kw: seen.update(env=env, biz=biz, date=kw.get("brief_date"))
                        or {"card_id": "c1", "brief": {"brief_date": "2026-06-16"}, "null_reason": None})
    monkeypatch.setattr(sys, "argv",
                        ["generate_morning_brief.py", "--env", "env-A", "--business", "biz-1",
                         "--date", "2026-06-16"])
    rc = runner.main()
    assert rc == 0
    assert seen == {"env": "env-A", "biz": "biz-1", "date": "2026-06-16"}
    out = capsys.readouterr().out
    assert '"ok": true' in out and '"card_id": "c1"' in out


def test_runner_fails_closed_on_null_reason(monkeypatch, capsys):
    runner = _load_runner()
    from app.services import morning_brief
    monkeypatch.setattr(morning_brief, "generate",
                        lambda env, biz, **kw: {"card_id": None, "brief": None,
                                                "null_reason": "morning_brief_unavailable"})
    monkeypatch.setattr(sys, "argv",
                        ["generate_morning_brief.py", "--env", "env-A", "--business", "biz-1"])
    rc = runner.main()
    assert rc == 1                                    # non-zero exit when no card produced
    assert "morning_brief_unavailable" in capsys.readouterr().out


def test_runner_reports_error_on_exception(monkeypatch, capsys):
    runner = _load_runner()
    from app.services import morning_brief
    monkeypatch.setattr(morning_brief, "generate",
                        lambda env, biz, **kw: (_ for _ in ()).throw(RuntimeError("db down")))
    monkeypatch.setattr(sys, "argv",
                        ["generate_morning_brief.py", "--env", "env-A", "--business", "biz-1"])
    rc = runner.main()
    assert rc == 1
    assert "db down" in capsys.readouterr().err
