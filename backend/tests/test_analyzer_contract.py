"""Tests for the Universal AnalyzerFinding contract (plan PR 8.5).

Run: cd backend && python -m pytest tests/test_analyzer_contract.py -x -q

Proves the contract fails closed: a high-confidence or critical finding with no evidence
is rejected; severity is rule-based; to_intel_card maps deterministically.
"""
import os

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from app.services.analyzer_contract import (  # noqa: E402
    AnalyzerFinding, FindingValidationError, to_intel_card, from_dict,
    SEVERITIES, ANALYZER_TYPES, HIGH_CONFIDENCE,
)


def _finding(**over):
    base = dict(
        finding_id="f-001", env_id="env-1", analyzer_type="business",
        source_ref={"metric_key": "fpy"}, severity="warning",
        what_changed="First-pass yield fell 6 points", why_it_matters="Concentrated at one station",
        confidence=0.8, evidence_refs=["row-1"], metric_refs=["first_pass_yield"],
    )
    base.update(over)
    return AnalyzerFinding(**base)


# ── construction + happy path ─────────────────────────────────────────────────
def test_valid_finding_constructs():
    f = _finding()
    assert f.finding_id == "f-001"
    assert f.severity in SEVERITIES
    assert f.analyzer_type in ANALYZER_TYPES


def test_to_dict_roundtrips_through_from_dict():
    f = _finding()
    f2 = from_dict(f.to_dict())
    assert f2.to_dict() == f.to_dict()


# ── the load-bearing honesty rules ────────────────────────────────────────────
def test_high_confidence_without_evidence_is_rejected():
    with pytest.raises(FindingValidationError, match="evidence_refs"):
        _finding(confidence=HIGH_CONFIDENCE, evidence_refs=[])


def test_low_confidence_without_evidence_is_allowed():
    # Below the high-confidence threshold, no evidence is permitted (informational).
    f = _finding(confidence=0.4, severity="info", evidence_refs=[])
    assert f.confidence == 0.4


def test_critical_without_evidence_is_rejected():
    # No evidence_refs -> rejected. (At confidence 0.9 the high-confidence rule fires
    # first; both paths forbid an evidence-free critical finding.)
    with pytest.raises(FindingValidationError, match="evidence_refs"):
        _finding(severity="critical", evidence_refs=[], confidence=0.9)


def test_critical_without_evidence_at_mid_confidence_is_rejected():
    # At confidence 0.6 the high-confidence rule does NOT fire, so the critical-needs-
    # evidence rule is the one that rejects it.
    with pytest.raises(FindingValidationError, match="critical"):
        _finding(severity="critical", evidence_refs=[], confidence=0.6)


def test_critical_with_low_confidence_is_rejected():
    with pytest.raises(FindingValidationError, match="critical"):
        _finding(severity="critical", confidence=0.4, evidence_refs=["row-1"])


def test_critical_with_evidence_and_confidence_is_allowed():
    f = _finding(severity="critical", confidence=0.92, evidence_refs=["row-1", "row-2"])
    assert f.severity == "critical"


# ── field validation ──────────────────────────────────────────────────────────
def test_unknown_severity_rejected():
    with pytest.raises(FindingValidationError, match="severity"):
        _finding(severity="catastrophic")


def test_unknown_analyzer_type_rejected():
    with pytest.raises(FindingValidationError, match="analyzer_type"):
        _finding(analyzer_type="weather")


def test_confidence_out_of_range_rejected():
    with pytest.raises(FindingValidationError, match="confidence"):
        _finding(confidence=1.4)


def test_empty_what_changed_rejected():
    with pytest.raises(FindingValidationError, match="what_changed"):
        _finding(what_changed="  ")


def test_bad_finding_id_rejected():
    with pytest.raises(FindingValidationError, match="finding_id"):
        _finding(finding_id="bad id with spaces")


def test_negative_cost_rejected():
    with pytest.raises(FindingValidationError, match="cost"):
        _finding(cost_to_generate_usd=-1.0)


# ── to_intel_card mapping (deterministic) ─────────────────────────────────────
def test_to_intel_card_critical_maps_to_alert_with_anomaly():
    f = _finding(severity="critical", confidence=0.95, evidence_refs=["r1"])
    card = to_intel_card(f)
    assert card["card_type"] == "alert"
    assert card["anomaly_flag"] is True
    assert card["created_by"] == "analyzer:business"
    assert card["source_ref"]["finding_id"] == "f-001"
    assert 0.0 <= card["priority_score"] <= 1.0


def test_to_intel_card_warning_maps_to_finding_no_anomaly():
    card = to_intel_card(_finding(severity="warning"))
    assert card["card_type"] == "finding"
    assert card["anomaly_flag"] is False


def test_to_intel_card_priority_scales_with_confidence_and_severity():
    hi = to_intel_card(_finding(severity="critical", confidence=0.95, evidence_refs=["r"]))
    lo = to_intel_card(_finding(severity="info", confidence=0.5))
    assert hi["priority_score"] > lo["priority_score"]


def test_to_intel_card_kwargs_are_upsert_card_compatible():
    # Mirrors intelligence_cards.upsert_card signature (card_type, title, summary,
    # source_ref, priority_score, anomaly_flag, created_by).
    card = to_intel_card(_finding())
    assert set(card.keys()) == {
        "card_type", "title", "summary", "source_ref", "priority_score",
        "anomaly_flag", "created_by",
    }
