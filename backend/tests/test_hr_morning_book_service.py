"""Unit tests for the History Rhymes Morning Book delta service.

Pure tests — no DB, no LLM. `today` is injected for determinism. Mirrors the
synthetic-input style of test_hr_decision_runner.py / test_hr_enhancement_extractor.py.
"""

from __future__ import annotations

from datetime import date

from app.services.hr_morning_book import (
    ACT_NOW,
    NO_CHANGE_MARKER,
    RESEARCH_ONLY,
    WATCH,
    compute_morning_book,
)

TODAY = date(2026, 5, 20)


def _brief(
    *,
    brief_id: str,
    brief_date: str,
    regime: str | None = "late_cycle",
    confidence: float | None = 0.70,
    degraded: bool = False,
):
    return {
        "brief_id": brief_id,
        "brief_date": brief_date,
        "confidence": confidence,
        "freshness_score": 0.9,
        "created_at": f"{brief_date}T12:00:00Z",
        "parsed_json": {
            "regime_call": regime,
            "confidence": confidence,
            "degraded": degraded,
        },
    }


def _cand(title, *, verdict=None, priority="medium", brief_id="b", created="2026-05-18"):
    return {
        "candidate_id": f"c-{title}",
        "brief_id": brief_id,
        "title": title,
        "priority": priority,
        "status": "new",
        "adversarial_verdict": verdict,
        "confidence": None,
        "created_at": f"{created}T12:00:00Z",
    }


# ── No-data / single-brief (initialization) ───────────────────────────────────


def test_zero_briefs_returns_initialization_shape():
    r = compute_morning_book(
        latest_brief=None, previous_brief=None,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.triage == RESEARCH_ONLY
    assert r.current_regime is None
    assert r.top_risks == [] and r.top_new_enhancements == []
    assert any("initialization mode" in w for w in r.warnings)
    assert any("No research briefs found" in w for w in r.warnings)


def test_single_brief_is_initialization_mode_not_broken():
    latest = _brief(brief_id="b1", brief_date="2026-05-18")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=None,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.triage == RESEARCH_ONLY
    assert r.current_regime == "late_cycle"
    assert r.confidence["previous"] is None
    assert any("initialization mode" in w for w in r.warnings)
    assert any("Only one brief available" in w for w in r.warnings)
    assert r.what_changed == [
        "No previous brief to diff against; this is the first ingested brief."
    ]


# ── Regime / confidence deltas ────────────────────────────────────────────────


def test_regime_change_is_act_now():
    latest = _brief(brief_id="b2", brief_date="2026-05-18", regime="crisis")
    prev = _brief(brief_id="b1", brief_date="2026-05-11", regime="late_cycle")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.triage == ACT_NOW
    assert r.what_changed[0] == "Regime call shifted: late_cycle → crisis"


def test_large_confidence_drop_is_act_now():
    latest = _brief(brief_id="b2", brief_date="2026-05-18", confidence=0.50)
    prev = _brief(brief_id="b1", brief_date="2026-05-11", confidence=0.72)
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.triage == ACT_NOW
    assert r.confidence["status"] == "deteriorating"
    assert any("Confidence decreased from 0.72 to 0.5" in b for b in r.what_changed)


def test_small_confidence_drop_is_watch():
    latest = _brief(brief_id="b2", brief_date="2026-05-18", confidence=0.62)
    prev = _brief(brief_id="b1", brief_date="2026-05-11", confidence=0.70)
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.triage == WATCH


def test_identical_briefs_emit_no_change_marker():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.what_changed == [NO_CHANGE_MARKER]
    assert r.triage == RESEARCH_ONLY


# ── Risk verdict distinction ──────────────────────────────────────────────────


def test_new_fail_risk_is_act_now():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("False normalization", verdict="FAIL", brief_id="b2")],
        previous_candidates=[], today=TODAY,
    )
    assert r.triage == ACT_NOW
    assert "New risk: False normalization" in r.what_changed


def test_new_caution_risk_is_watch_not_act_now():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("Crowding risk", verdict="CAUTION", brief_id="b2")],
        previous_candidates=[], today=TODAY,
    )
    assert r.triage == WATCH
    assert "New risk: Crowding risk" in r.what_changed


def test_new_hold_risk_is_watch_and_not_a_bullet():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("License review", verdict="HOLD", brief_id="b2")],
        previous_candidates=[], today=TODAY,
    )
    assert r.triage == WATCH
    # HOLD is a Watch signal but NOT a "New risk:" bullet (FAIL/CAUTION only).
    assert not any(b.startswith("New risk:") for b in r.what_changed)


def test_top_risks_caps_at_three_and_orders_by_priority():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    cands = [
        _cand("low risk", verdict="FAIL", priority="low", brief_id="b2"),
        _cand("crit risk", verdict="FAIL", priority="critical", brief_id="b2"),
        _cand("high risk", verdict="CAUTION", priority="high", brief_id="b2"),
        _cand("med risk", verdict="HOLD", priority="medium", brief_id="b2"),
    ]
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=cands, previous_candidates=[], today=TODAY,
    )
    assert len(r.top_risks) == 3
    assert r.top_risks[0] == "crit risk"


# ── Enhancements ──────────────────────────────────────────────────────────────


def test_new_high_priority_enhancement_is_watch():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("Add yield_curve_velocity", priority="high", brief_id="b2")],
        previous_candidates=[], today=TODAY,
    )
    assert r.triage == WATCH
    assert "New enhancement: Add yield_curve_velocity" in r.what_changed
    assert r.top_new_enhancements == ["Add yield_curve_velocity"]


def test_repeated_enhancement_is_not_flagged_new():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("  Add MVRV signal ", priority="medium", brief_id="b2")],
        previous_candidates=[_cand("Add MVRV Signal", priority="medium", brief_id="b1")],
        today=TODAY,
    )
    # Case/whitespace-normalized title match => not "new".
    assert r.top_new_enhancements == []
    assert not any(b.startswith("New enhancement:") for b in r.what_changed)


# ── Freshness ─────────────────────────────────────────────────────────────────


def test_stale_latest_brief_is_watch():
    latest = _brief(brief_id="b2", brief_date="2026-05-08")  # 12 days before TODAY
    prev = _brief(brief_id="b1", brief_date="2026-05-01")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.freshness["status"] == "stale"
    assert r.triage == WATCH


# ── Fail-closed ───────────────────────────────────────────────────────────────


def test_degraded_latest_clamps_triage_to_research_only():
    # Otherwise-Act-Now signals (regime change) must NOT escalate when degraded.
    latest = _brief(brief_id="b2", brief_date="2026-05-18", regime="crisis", degraded=True)
    prev = _brief(brief_id="b1", brief_date="2026-05-11", regime="late_cycle")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[_cand("Big risk", verdict="FAIL", brief_id="b2")],
        previous_candidates=[], today=TODAY,
    )
    assert r.triage == RESEARCH_ONLY
    assert any("degraded" in w for w in r.warnings)


def test_malformed_parsed_json_does_not_raise_and_nulls_fields():
    latest = {
        "brief_id": "b2", "brief_date": "2026-05-18", "confidence": None,
        "created_at": "2026-05-18T12:00:00Z", "parsed_json": "not a dict",
    }
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    r = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    )
    assert r.current_regime is None
    assert r.confidence["current"] is None
    assert any("no regime_call" in w.lower() for w in r.warnings)


def test_to_dict_shape_is_complete():
    latest = _brief(brief_id="b2", brief_date="2026-05-18")
    prev = _brief(brief_id="b1", brief_date="2026-05-11")
    d = compute_morning_book(
        latest_brief=latest, previous_brief=prev,
        latest_candidates=[], previous_candidates=[], today=TODAY,
    ).to_dict()
    assert set(d.keys()) == {
        "current_regime", "what_changed", "confidence", "freshness",
        "top_risks", "top_new_enhancements", "triage", "warnings",
    }
    assert set(d["confidence"].keys()) == {"current", "previous", "delta", "status"}
    assert set(d["freshness"].keys()) == {
        "latest_brief_date", "previous_brief_date", "status",
    }
