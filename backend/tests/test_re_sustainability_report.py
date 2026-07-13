from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4


RELEASED_STATE = {
    "entity_scope": "portfolio",
    "period_key": "2026Q2",
    "requested_period_key": "2026Q2",
    "period_exact": True,
    "state_origin": "authoritative",
    "snapshot_version": "sus-20260709T000000Z-abcd1234",
    "promotion_state": "released",
    "trust_status": "trusted",
    "null_reason": None,
    "metrics": [
        {
            "metric_key": "scope_1_emissions_tco2e",
            "value": 1234.56789,
            "unit": "tCO2e",
            "null_reason": None,
            "trust_status": "trusted",
        },
        {
            "metric_key": "scope_3_emissions_tco2e",
            "value": None,
            "unit": "tCO2e",
            "null_reason": "emission_factor_missing",
            "trust_status": "missing_source",
        },
    ],
    "evidence": [
        {
            "metric_key": "scope_1_emissions_tco2e",
            "source_table": "sus_utility_monthly",
            "source_row_ref": "utility_monthly_id=abc-123",
            "emission_factor_set_id": str(uuid4()),
            "ingestion_run_id": str(uuid4()),
            "formula_id": "sus.scope1.v1",
        }
    ],
}

UNAVAILABLE_STATE = {
    "entity_scope": "portfolio",
    "period_key": "2026Q2",
    "requested_period_key": "2026Q2",
    "period_exact": False,
    "state_origin": "authoritative",
    "snapshot_version": None,
    "promotion_state": None,
    "trust_status": "missing_source",
    "null_reason": "snapshot_unavailable",
    "metrics": [],
    "evidence": [],
}


def _boom(*_a, **_kw):  # pragma: no cover - fail if reached
    raise AssertionError("re_sustainability_report must not touch the database")


def test_bundle_carries_reader_governance_header():
    from app.services import re_sustainability_report

    with patch(
        "app.services.re_sustainability_authoritative.get_authoritative_state",
        return_value=RELEASED_STATE,
    ):
        bundle = re_sustainability_report.build_governed_report(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    assert bundle["snapshot_version"] == RELEASED_STATE["snapshot_version"]
    assert bundle["promotion_state"] == RELEASED_STATE["promotion_state"]
    assert bundle["trust_status"] == RELEASED_STATE["trust_status"]
    assert bundle["state_origin"] == "authoritative"
    assert bundle["metric_family"] == "emissions"
    assert isinstance(bundle["generated_at"], str) and bundle["generated_at"]


def test_report_reconciles_with_reader_metric_by_metric():
    """For the same reader payload, report bundle metrics equal reader metrics."""
    from app.services import re_sustainability_report

    with patch(
        "app.services.re_sustainability_authoritative.get_authoritative_state",
        return_value=RELEASED_STATE,
    ):
        bundle = re_sustainability_report.build_governed_report(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    reader_by_key = {m["metric_key"]: m for m in RELEASED_STATE["metrics"]}
    bundle_by_key = {m["metric_key"]: m for m in bundle["metrics"]}
    assert set(reader_by_key.keys()) == set(bundle_by_key.keys())
    for key, reader_m in reader_by_key.items():
        b = bundle_by_key[key]
        assert b["value"] == reader_m["value"]
        assert b["null_reason"] == reader_m["null_reason"]
        assert b["unit"] == reader_m["unit"]
        assert b["trust_status"] == reader_m["trust_status"]

    # A null metric in the reader is null in the report — never a substituted 0.
    scope3 = bundle_by_key["scope_3_emissions_tco2e"]
    assert scope3["value"] is None
    assert scope3["value"] != 0
    assert scope3["null_reason"] == "emission_factor_missing"

    # Evidence is passed through, not recomputed.
    assert bundle["evidence"] == list(RELEASED_STATE["evidence"])


def test_snapshot_unavailable_yields_null_reason_and_empty_metrics_no_fallback():
    from app.services import re_sustainability_report

    with patch(
        "app.services.re_sustainability_authoritative.get_authoritative_state",
        return_value=UNAVAILABLE_STATE,
    ):
        bundle = re_sustainability_report.build_governed_report(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    assert bundle["null_reason"] == "snapshot_unavailable"
    assert bundle["metrics"] == []
    assert bundle["evidence"] == []
    assert bundle["snapshot_version"] is None
    assert bundle["promotion_state"] is None
    assert bundle["trust_status"] == "missing_source"
    # No total, sum, or fabricated number of any kind.
    for banned_key in ("total", "totals", "sum", "aggregate", "aggregates"):
        assert banned_key not in bundle


def test_service_issues_no_database_call():
    """The report service must never invoke get_cursor — all data comes from the reader."""
    from app.services import re_sustainability_report

    with (
        patch(
            "app.services.re_sustainability_authoritative.get_authoritative_state",
            return_value=RELEASED_STATE,
        ),
        patch(
            "app.services.re_sustainability_authoritative.get_cursor",
            side_effect=_boom,
        ),
    ):
        bundle = re_sustainability_report.build_governed_report(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    # And the service module itself must not import or expose get_cursor.
    assert not hasattr(re_sustainability_report, "get_cursor")
    assert bundle["snapshot_version"] == RELEASED_STATE["snapshot_version"]
