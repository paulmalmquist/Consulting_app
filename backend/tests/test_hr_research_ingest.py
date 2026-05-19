"""Tests for the History Rhymes research-brief auto-ingest script.

Pure + injected-transport — no network, no DB. Mirrors the offline-testable
style of the other hr_* tests. Does not touch the route, extractor, or any
existing tests.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import pytest

# scripts/ is not a package — make it importable for tests.
_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import hr_research_ingest as ingest  # noqa: E402

SAMPLE = (
    Path(__file__).parent / "fixtures" / "hr_weekly_brief_sample.md"
).read_text(encoding="utf-8")


# ── Deterministic metadata ────────────────────────────────────────────────────


def test_week_rotation_is_deterministic_4_cycle():
    seen = set()
    for iso_week in range(1, 9):
        d = datetime.fromisocalendar(2026, iso_week, 1)
        wt = ingest.week_type_for(d)
        assert wt in {"Week 1", "Week 2", "Week 3", "Week 4"}
        seen.add(wt)
    assert seen == {"Week 1", "Week 2", "Week 3", "Week 4"}


def test_pillar_matches_rotation():
    assert ingest.pillar_for("Week 1") == "Novel Signals & Data Sources"
    assert ingest.pillar_for("Week 4") == "Adversarial & Regime-Change Research"
    # Unknown week falls back deterministically (no crash, no fabrication).
    assert ingest.pillar_for("nonsense") == "Novel Signals & Data Sources"


def test_build_payload_derives_date_and_title_from_content_and_filename():
    payload = ingest.build_payload(
        SAMPLE, input_path="docs/HR_Weekly_Brief_2026-05-18.md"
    )
    assert payload["brief_date"] == "2026-05-18"
    assert payload["source_filename"] == "HR_Weekly_Brief_2026-05-18.md"
    assert payload["title"] == "HR Weekly Brief — 2026-05-18"
    assert payload["week_type"] in {"Week 1", "Week 2", "Week 3", "Week 4"}
    assert payload["pillar_name"] == ingest.pillar_for(payload["week_type"])
    assert payload["markdown_content"] == SAMPLE


def test_build_payload_explicit_args_win_and_stdin_has_no_filename():
    payload = ingest.build_payload(
        SAMPLE,
        input_path="-",
        brief_date_arg="2026-01-05",
        week_type_arg="Week 3",
        pillar_arg="Custom Pillar",
        title_arg="Override Title",
    )
    assert payload["brief_date"] == "2026-01-05"
    assert payload["week_type"] == "Week 3"
    assert payload["pillar_name"] == "Custom Pillar"
    assert payload["title"] == "Override Title"
    assert payload["source_filename"] is None


def test_build_payload_rejects_empty_markdown():
    with pytest.raises(ingest.IngestError):
        ingest.build_payload("   ")


# ── submit() with injected transport ──────────────────────────────────────────


def _resp(status: int, body: dict | str):
    raw = body if isinstance(body, str) else json.dumps(body)
    return lambda url, data, timeout: (status, raw)


def test_submit_success_returns_parsed_response():
    fake = _resp(
        200,
        {
            "brief": {"brief_id": "b1"},
            "candidates": [{"candidate_id": "c1"}, {"candidate_id": "c2"}],
            "warnings": [],
            "confidence": 1.0,
            "degraded": False,
        },
    )
    out = ingest.submit({"x": 1}, "http://test", _post=fake)
    assert out["brief"]["brief_id"] == "b1"
    assert out["degraded"] is False


def test_submit_raises_on_non_2xx():
    with pytest.raises(ingest.IngestError):
        ingest.submit({}, "http://test", _post=_resp(422, {"detail": "bad"}))


def test_submit_raises_on_non_json_body():
    with pytest.raises(ingest.IngestError):
        ingest.submit({}, "http://test", _post=_resp(200, "<html>not json"))


# ── main() exit codes ─────────────────────────────────────────────────────────


def test_main_dry_run_emits_payload_without_posting(tmp_path, capsys):
    f = tmp_path / "HR_Weekly_Brief_2026-05-18.md"
    f.write_text(SAMPLE, encoding="utf-8")
    rc = ingest.main(["--input", str(f), "--dry-run"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["dry_run"] is True
    assert out["payload"]["brief_date"] == "2026-05-18"
    assert "omitted in dry-run" in out["payload"]["markdown_content"]


def test_main_success_exit_0(tmp_path, capsys, monkeypatch):
    f = tmp_path / "brief.md"
    f.write_text(SAMPLE, encoding="utf-8")
    monkeypatch.setattr(
        ingest,
        "_default_post",
        _resp(
            200,
            {
                "brief": {"brief_id": "b9"},
                "candidates": [{"candidate_id": "c1"}],
                "warnings": [],
                "confidence": 1.0,
                "degraded": False,
            },
        ),
    )
    rc = ingest.main(["--input", str(f), "--base-url", "http://test"])
    assert rc == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["brief_id"] == "b9"
    assert summary["candidate_count"] == 1
    assert summary["degraded"] is False
    assert summary["posted_to"].endswith("/api/hr/v1/research/briefs")


def test_main_degraded_brief_still_exit_0_with_warnings(tmp_path, capsys, monkeypatch):
    f = tmp_path / "weak.md"
    f.write_text("# Weak brief\n\nno sections here\n", encoding="utf-8")
    monkeypatch.setattr(
        ingest,
        "_default_post",
        _resp(
            200,
            {
                "brief": {"brief_id": "b-degraded"},
                "candidates": [],
                "warnings": ["No Enhancement Path section found"],
                "confidence": 0.0,
                "degraded": True,
            },
        ),
    )
    rc = ingest.main(["--input", str(f), "--base-url", "http://test"])
    assert rc == 0  # degraded still persisted — fail-closed success
    summary = json.loads(capsys.readouterr().out)
    assert summary["degraded"] is True
    assert summary["candidate_count"] == 0
    assert summary["warnings"]


def test_main_hard_failure_exit_1(tmp_path, capsys, monkeypatch):
    f = tmp_path / "brief.md"
    f.write_text(SAMPLE, encoding="utf-8")
    monkeypatch.setattr(ingest, "_default_post", _resp(500, "boom"))
    rc = ingest.main(["--input", str(f), "--base-url", "http://test"])
    assert rc == 1
    err = json.loads(capsys.readouterr().err)
    assert "error" in err


def test_main_missing_input_exit_1(capsys):
    rc = ingest.main(["--input", "/no/such/brief.md"])
    assert rc == 1
    assert "error" in json.loads(capsys.readouterr().err)
