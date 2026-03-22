"""Tests for risk assessment (no DB required)."""

from app.actions import assess_risk


def test_risk_high():
    assert assess_risk("Please approve this document") == "high"
    assert assess_risk("Review the diagnosis") == "high"
    assert assess_risk("Final settlement amount") == "high"


def test_risk_medium():
    assert assess_risk("Change the policy terms") == "medium"
    assert assess_risk("Process this invoice") == "medium"


def test_risk_low():
    assert assess_risk("Hello, how are you?") == "low"
    assert assess_risk("List my documents") == "low"


def test_risk_case_insensitive():
    assert assess_risk("APPROVE THIS") == "high"
    assert assess_risk("Change Policy") == "medium"
