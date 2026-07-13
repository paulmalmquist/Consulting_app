"""The governed report must fail closed when the authoritative reader raises.

Found by the T12 acceptance evals: ``build_governed_report`` called
``get_authoritative_state`` unguarded, so a reader that raised (database down,
bad scope, driver error) propagated the exception out of the report service
instead of degrading to an honest "no value" bundle.

The rule the sustainability platform claims is that it never fabricates a
number and never blows up in place of one: a value it cannot serve comes back
as ``None`` with a reason. That has to hold on the error path too, not just
when the reader politely reports ``snapshot_unavailable``.
"""
from __future__ import annotations


from app.services import re_sustainability_report


SCOPE = {
    "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
    "env_id": "env-demo",
    "entity_scope": "portfolio",
    "period_key": "2026Q1",
    "metric_family": "sustainability",
}


def test_reader_error_fails_closed_instead_of_raising(monkeypatch):
    """A raising reader yields a bundle, not an exception."""

    def boom(**_kwargs):
        raise RuntimeError("database is unreachable")

    monkeypatch.setattr(
        re_sustainability_report.re_sustainability_authoritative,
        "get_authoritative_state",
        boom,
    )

    bundle = re_sustainability_report.build_governed_report(**SCOPE)

    # It degraded rather than propagating.
    assert isinstance(bundle, dict)
    assert bundle["trust_status"] == "missing_source"
    assert bundle["snapshot_version"] is None
    assert bundle.get("null_reason")


def test_reader_error_fabricates_no_number(monkeypatch):
    """The degraded bundle carries no value for any metric, and no zero total.

    Zero is the dangerous answer here: a report that quietly says 0 tCO2e when
    the reader is down reads as "we emitted nothing," which is worse than
    saying nothing at all.
    """

    def boom(**_kwargs):
        raise RuntimeError("database is unreachable")

    monkeypatch.setattr(
        re_sustainability_report.re_sustainability_authoritative,
        "get_authoritative_state",
        boom,
    )

    bundle = re_sustainability_report.build_governed_report(**SCOPE)

    assert bundle["metrics"] == []
    assert bundle["evidence"] == []
    for key, value in bundle.items():
        if key in ("metrics", "evidence"):
            continue
        # Booleans are excluded on purpose: `period_exact` is a legitimate
        # False flag, and in Python `False == 0`. What must never appear is a
        # fabricated *numeric* value standing in for one we could not read.
        if isinstance(value, bool):
            continue
        assert not isinstance(value, (int, float)) or value != 0, (
            f"{key} fabricated a zero on the error path"
        )


def test_healthy_reader_is_unaffected(monkeypatch):
    """The guard must not swallow or reshape a normal successful read."""
    payload = {
        "entity_scope": "portfolio",
        "period_key": "2026Q1",
        "requested_period_key": "2026Q1",
        "period_exact": True,
        "state_origin": "authoritative",
        "snapshot_version": "sus-2026Q1-001",
        "promotion_state": "released",
        "trust_status": "trusted",
        "null_reason": None,
        "metrics": [
            {
                "metric_key": "scope1_tco2e",
                "value": 42.5,
                "unit": "tco2e",
                "null_reason": None,
                "trust_status": "trusted",
            }
        ],
        "evidence": [],
    }
    monkeypatch.setattr(
        re_sustainability_report.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_kwargs: payload,
    )

    bundle = re_sustainability_report.build_governed_report(**SCOPE)

    assert bundle["snapshot_version"] == "sus-2026Q1-001"
    assert bundle["trust_status"] == "trusted"
    assert bundle["metrics"][0]["metric_key"] == "scope1_tco2e"
    assert bundle["metrics"][0]["value"] == 42.5
