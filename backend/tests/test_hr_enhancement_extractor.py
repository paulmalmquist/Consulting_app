"""Unit tests for the History Rhymes brief extractor + planning generator.

Pure tests — no DB, no LLM. Mirrors the synthetic-input style of
test_hr_decision_runner.py.
"""

from __future__ import annotations

from pathlib import Path

from app.services.hr_enhancement_extractor import (
    CANONICAL_SECTIONS,
    extract_enhancements,
)
from app.services.hr_planning_markdown import (
    PLANNING_HEADINGS,
    build_planning_markdown,
)

FIXTURE = Path(__file__).parent / "fixtures" / "hr_weekly_brief_sample.md"

# The real skeletal brief shape (docs/historyrhymes/briefs/2026-04-20.md).
SKELETAL_BRIEF = """# HR Weekly Brief — 2026-04-20

**Regime call:** late_cycle
**Confidence:** 0.72
**Freshness score:** 0.88

## Themes
- **Yield curve inversion normalizing** — 10Y-2Y back to +30bps
- **CRE stress rising** — CMBS delinquency +40bps QoQ

## Analogs
- 2000 Q1 dot-com peak (rhyme 0.87)

## Source
seed
"""


def _sample() -> str:
    return FIXTURE.read_text(encoding="utf-8")


# ── Happy path: full 7-section brief ──────────────────────────────────────────


def test_parses_all_seven_sections():
    result = extract_enhancements(_sample())
    assert not result.degraded
    assert sorted(result.found_sections) == sorted(CANONICAL_SECTIONS)
    assert len(result.found_sections) == 7
    assert result.confidence == 1.0
    assert result.regime_call == "late_cycle"
    assert result.freshness_score == 0.88
    assert result.warnings == [] or all(isinstance(w, str) for w in result.warnings)


def test_extracts_multiple_enhancement_items():
    result = extract_enhancements(_sample())
    titles = [c.title for c in result.candidates]
    assert "Add MVRV-Z divergence signal" in titles
    assert "Backfill non-event episodes" in titles
    assert "Tighten honeypot cosine threshold" in titles
    assert len(result.candidates) == 3

    mvrv = next(c for c in result.candidates if c.title.startswith("Add MVRV-Z"))
    assert mvrv.effort_days == 3.0
    assert mvrv.priority == "high"
    assert mvrv.category == "signal"
    assert "signal snapshot pipeline" in mvrv.dependencies
    assert "FRED loader" in mvrv.dependencies
    assert mvrv.why and "hit rate" in mvrv.why


def test_preserves_adversarial_verdicts():
    result = extract_enhancements(_sample())
    by_title = {c.title: c.adversarial_verdict for c in result.candidates}
    assert by_title["Add MVRV-Z divergence signal"] == "PASS"
    assert by_title["Backfill non-event episodes"] == "HOLD"
    assert by_title["Tighten honeypot cosine threshold"] == "FAIL"


def test_missing_subfields_are_none_not_fabricated():
    result = extract_enhancements(_sample())
    tighten = next(
        c for c in result.candidates if c.title.startswith("Tighten honeypot")
    )
    # Only Why + Priority + inline desc were provided.
    assert tighten.effort_days is None
    assert tighten.expected_impact is None
    assert tighten.category is None
    assert tighten.confidence is None
    assert tighten.dependencies == []
    assert tighten.priority == "low"
    assert tighten.what == "reduce false trap flags"  # inline description only


def test_missing_section_handled_without_hallucination():
    md = _sample().split("## Signal Pulse")[0].rstrip() + "\n"
    result = extract_enhancements(md)
    # 4 sections remain (exec, thematic, enhancement, adversarial) — still valid.
    assert "signal_pulse" not in result.found_sections
    assert "honeypot_alert" not in result.found_sections
    assert "signal_pulse" not in result.sections
    assert not result.degraded
    assert len(result.candidates) == 3


# ── Fail-closed: weak structure ───────────────────────────────────────────────


def test_skeletal_brief_is_degraded_low_confidence_no_candidates():
    result = extract_enhancements(SKELETAL_BRIEF)
    assert result.degraded is True
    assert result.confidence < 0.5
    assert result.candidates == []
    assert any("Enhancement Path" in w for w in result.warnings)


def test_empty_markdown_degrades_cleanly():
    result = extract_enhancements("   ")
    assert result.degraded is True
    assert result.candidates == []
    assert result.confidence == 0.0
    assert result.warnings


def test_garbage_input_does_not_raise_and_fails_closed():
    result = extract_enhancements("not markdown at all, no headings, no structure")
    assert result.degraded is True
    assert result.candidates == []


# ── Planning markdown generator ───────────────────────────────────────────────


def test_planning_markdown_has_all_sixteen_headings():
    result = extract_enhancements(_sample())
    cand = result.candidates[0]
    md = build_planning_markdown(
        cand.to_dict(),
        {"brief_date": "2026-05-18", "week_type": "Week 1", "pillar_name": "Novel Signals"},
    )
    for heading in PLANNING_HEADINGS:
        assert f"# {heading}" in md, f"missing heading: {heading}"
    assert len(PLANNING_HEADINGS) == 16


def test_planning_markdown_placeholder_for_unknown_fields():
    md = build_planning_markdown({"title": "Bare candidate"}, {})
    assert "# Objective" in md
    assert "_Not specified in source brief._" in md
    assert "Bare candidate" in md
