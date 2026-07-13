"""T6 (plan 0018): governed sustainability metrics in the unified registry.

Note on API naming: plan 0018 refers to the registry's validation contract as
``validate()``. The canonical method on ``UnifiedMetricRegistry`` is
``validate_schema()`` (see ``backend/app/services/unified_metric_registry.py``);
this test exercises that method — it is the single validation path the plan is
naming. Renaming the method would be an unrelated refactor and is out of scope
for T6.

Verifies, without touching a real DB, that:

1. The service dispatch map exposes ``sustainability_authoritative`` as a
   callable — the registry's ``validate_schema()`` rejects any
   ``service``-strategy metric whose ``service_function`` is missing from the
   map.
2. A ``MetricContract`` built for each of the six v1 sustainability metric keys
   with ``query_strategy='service'`` +
   ``service_function='sustainability_authoritative'`` passes the registry's
   own ``validate_schema()`` with no issue naming those keys.
3. The dispatch callable resolves through
   ``re_sustainability_authoritative.get_metric`` and returns whatever
   ``null_reason`` the reader produced, unchanged (no fabricated number).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import unified_metric_registry as umr
from app.services.unified_metric_registry import (
    MetricContract,
    UnifiedMetricRegistry,
)

SUSTAINABILITY_METRIC_KEYS = (
    "scope1_tco2e",
    "scope2_location_tco2e",
    "scope2_market_tco2e",
    "scope3_tco2e",
    "energy_intensity_kwh_per_sqft",
    "water_intensity_gal_per_sqft",
)


@pytest.fixture(autouse=True)
def _reset_service_map():
    # Force _get_service_map() to rebuild so monkeypatches on
    # re_sustainability_authoritative land through the module attribute lookup.
    umr._SERVICE_MAP = None
    yield
    umr._SERVICE_MAP = None


def _make_sus_contract(metric_key: str) -> MetricContract:
    return MetricContract(
        metric_key=metric_key,
        display_name=metric_key.replace("_", " ").title(),
        description=None,
        aliases=(metric_key.replace("_", " "),),
        metric_family="sustainability",
        query_strategy="service",
        template_key=None,
        service_function="sustainability_authoritative",
        sql_template="-- served via sustainability_authoritative reader",
        unit="tco2e",
        aggregation="sum",
        format_hint_fe="number",
        polarity="down_good",
        entity_key="asset",
        allowed_breakouts=("fund", "asset", "quarter"),
        time_behavior="additive_period",
    )


def test_service_map_registers_sustainability_authoritative():
    svc_map = umr._get_service_map()
    assert "sustainability_authoritative" in svc_map
    assert callable(svc_map["sustainability_authoritative"])


def test_all_six_sustainability_metrics_pass_validate():
    contracts = [_make_sus_contract(k) for k in SUSTAINABILITY_METRIC_KEYS]
    registry = UnifiedMetricRegistry(contracts)

    issues = registry.validate_schema()

    for key in SUSTAINABILITY_METRIC_KEYS:
        offending = [i for i in issues if i.startswith(f"{key}:")]
        assert offending == [], (
            f"validate_schema() flagged {key}: {offending}"
        )


def test_dispatch_callable_returns_reader_null_reason_unchanged(monkeypatch):
    captured: dict[str, Any] = {}

    def _fake_get_metric(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {
            "value": None,
            "unit": None,
            "null_reason": "snapshot_unavailable",
            "trust_status": "missing_source",
            "snapshot_version": None,
            "state_origin": "authoritative",
        }

    from app.services import re_sustainability_authoritative as sus_auth

    monkeypatch.setattr(sus_auth, "get_metric", _fake_get_metric)

    dispatch = umr._get_service_map()["sustainability_authoritative"]
    result = dispatch(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="repe-demo",
        entity_scope="portfolio",
        period_key="2025Q4",
        metric_family="sustainability",
        metric_key="scope1_tco2e",
    )

    assert result["value"] is None
    assert result["null_reason"] == "snapshot_unavailable"
    assert result["trust_status"] == "missing_source"
    assert captured["metric_key"] == "scope1_tco2e"
    assert captured["metric_family"] == "sustainability"
