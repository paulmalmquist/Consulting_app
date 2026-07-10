from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from tests.conftest import FakeCursor


def _make_fake_cursor(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


def test_released_snapshot_returns_authoritative_state_with_metrics_and_evidence():
    from app.services import re_sustainability_authoritative

    business_id = uuid4()
    emission_factor_set_id = uuid4()
    ingestion_run_id = uuid4()

    cur = FakeCursor()
    # snapshot header
    cur.push_result(
        [
            {
                "snapshot_version": "sus-20260709T000000Z-abcd1234",
                "promotion_state": "released",
                "trust_status": "trusted",
                "period_key": "2026Q2",
                "entity_scope": "portfolio",
                "metric_family": "emissions",
            }
        ]
    )
    # metric value rows
    cur.push_result(
        [
            {
                "metric_key": "scope_1_emissions_tco2e",
                "value_numeric": Decimal("1234.567890000000"),
                "unit": "tCO2e",
                "null_reason": None,
                "trust_status": "trusted",
            },
            {
                "metric_key": "scope_2_emissions_tco2e",
                "value_numeric": Decimal("789.100000000000"),
                "unit": "tCO2e",
                "null_reason": None,
                "trust_status": "trusted",
            },
        ]
    )
    # evidence rows
    cur.push_result(
        [
            {
                "metric_key": "scope_1_emissions_tco2e",
                "source_table": "sus_utility_monthly",
                "source_row_ref": "utility_monthly_id=abc-123",
                "emission_factor_set_id": emission_factor_set_id,
                "ingestion_run_id": ingestion_run_id,
                "formula_id": "sus.scope1.v1",
            }
        ]
    )

    with patch(
        "app.services.re_sustainability_authoritative.get_cursor",
        _make_fake_cursor(cur),
    ):
        payload = re_sustainability_authoritative.get_authoritative_state(
            business_id=business_id,
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    assert payload["state_origin"] == "authoritative"
    assert payload["trust_status"] == "trusted"
    assert payload["snapshot_version"] == "sus-20260709T000000Z-abcd1234"
    assert payload["promotion_state"] == "released"
    assert payload["null_reason"] is None
    assert payload["period_exact"] is True
    assert payload["requested_period_key"] == "2026Q2"
    assert payload["period_key"] == "2026Q2"

    assert len(payload["metrics"]) == 2
    scope1 = payload["metrics"][0]
    assert scope1["metric_key"] == "scope_1_emissions_tco2e"
    assert scope1["value"] == Decimal("1234.567890000000")
    assert scope1["unit"] == "tCO2e"
    assert scope1["null_reason"] is None
    assert scope1["trust_status"] == "trusted"

    assert len(payload["evidence"]) == 1
    ev = payload["evidence"][0]
    assert ev["metric_key"] == "scope_1_emissions_tco2e"
    assert ev["source_table"] == "sus_utility_monthly"
    assert ev["emission_factor_set_id"] == str(emission_factor_set_id)
    assert ev["ingestion_run_id"] == str(ingestion_run_id)
    assert ev["formula_id"] == "sus.scope1.v1"


def test_no_released_row_returns_snapshot_unavailable_and_empty_lists():
    from app.services import re_sustainability_authoritative

    cur = FakeCursor()
    cur.push_result([])  # snapshot header lookup returns nothing

    with patch(
        "app.services.re_sustainability_authoritative.get_cursor",
        _make_fake_cursor(cur),
    ):
        payload = re_sustainability_authoritative.get_authoritative_state(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    assert payload["null_reason"] == "snapshot_unavailable"
    assert payload["trust_status"] == "missing_source"
    assert payload["state_origin"] == "authoritative"
    assert payload["snapshot_version"] is None
    assert payload["promotion_state"] is None
    assert payload["period_exact"] is False
    assert payload["metrics"] == []
    assert payload["evidence"] == []


def test_null_value_numeric_returns_none_and_stored_null_reason_never_zero():
    from app.services import re_sustainability_authoritative

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "snapshot_version": "sus-null-1",
                "promotion_state": "released",
                "trust_status": "untrusted",
                "period_key": "2026Q2",
                "entity_scope": "portfolio",
                "metric_family": "emissions",
            }
        ]
    )
    cur.push_result(
        [
            {
                "metric_key": "scope_3_emissions_tco2e",
                "value_numeric": None,
                "unit": "tCO2e",
                "null_reason": "emission_factor_missing",
                "trust_status": "missing_source",
            }
        ]
    )
    cur.push_result([])  # no evidence rows

    with patch(
        "app.services.re_sustainability_authoritative.get_cursor",
        _make_fake_cursor(cur),
    ):
        payload = re_sustainability_authoritative.get_authoritative_state(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
        )

    assert len(payload["metrics"]) == 1
    metric = payload["metrics"][0]
    assert metric["value"] is None
    assert metric["value"] != 0
    assert metric["value"] != "0"
    assert metric["null_reason"] == "emission_factor_missing"
    assert metric["trust_status"] == "missing_source"


def test_get_metric_unknown_key_returns_metric_definition_missing():
    from app.services import re_sustainability_authoritative

    cur = FakeCursor()
    cur.push_result(
        [
            {
                "snapshot_version": "sus-known-1",
                "promotion_state": "released",
                "trust_status": "trusted",
                "period_key": "2026Q2",
                "entity_scope": "portfolio",
                "metric_family": "emissions",
            }
        ]
    )
    cur.push_result(
        [
            {
                "metric_key": "scope_1_emissions_tco2e",
                "value_numeric": Decimal("42.000000000000"),
                "unit": "tCO2e",
                "null_reason": None,
                "trust_status": "trusted",
            }
        ]
    )
    cur.push_result([])  # no evidence rows

    with patch(
        "app.services.re_sustainability_authoritative.get_cursor",
        _make_fake_cursor(cur),
    ):
        payload = re_sustainability_authoritative.get_metric(
            business_id=uuid4(),
            env_id="env-demo",
            entity_scope="portfolio",
            period_key="2026Q2",
            metric_family="emissions",
            metric_key="scope_3_emissions_tco2e",
        )

    assert payload["value"] is None
    assert payload["null_reason"] == "metric_definition_missing"
    assert payload["trust_status"] == "missing_source"
    assert payload["state_origin"] == "authoritative"
    assert payload["snapshot_version"] == "sus-known-1"
