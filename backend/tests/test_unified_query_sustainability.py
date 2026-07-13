"""T10: verify sustainability metrics resolve through the unified executor.

The T6 seed routes every governed sustainability metric through the shared
service strategy with ``service_function = 'sustainability_authoritative'``.
Before T10 that branch fell into the executor's ``else`` and returned an
empty result — the copilot could name the metrics but never retrieve them.

These tests exercise the new branch without a database: the service map is
monkeypatched so the reader is a plain callable. Fail-closed contract is the
headline assertion — a ``null_reason`` payload must surface with
``value=None`` (never zero), and a raising reader must degrade to
``_empty_result``.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from app.services import unified_metric_registry
from app.services import unified_query_builder as uqb
from app.services.unified_metric_registry import MetricContract, UnifiedMetricRegistry


BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"


def _sus_contract(metric_key: str = "scope1_tco2e") -> MetricContract:
    return MetricContract(
        metric_key=metric_key,
        display_name="Scope 1 Emissions (tCO2e)",
        description=None,
        aliases=(),
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
        allowed_breakouts=(),
        time_behavior="additive_period",
    )


def _portfolio_contract(metric_key: str = "fund_count") -> MetricContract:
    return MetricContract(
        metric_key=metric_key,
        display_name="Fund Count",
        description=None,
        aliases=(),
        metric_family="portfolio",
        query_strategy="service",
        template_key=None,
        service_function="portfolio_kpis",
        sql_template=None,
        unit="count",
        aggregation="sum",
        format_hint_fe="number",
        polarity="up_good",
        entity_key="fund",
        allowed_breakouts=(),
        time_behavior="point_in_time",
    )


def _make_query(metric_key: str) -> uqb.MetricQuery:
    return uqb.MetricQuery(
        metric_keys=[metric_key],
        business_id=BUSINESS_ID,
        env_id="repe",
        entity_type="portfolio",
        quarter="2026Q2",
    )


def _install_service_map(monkeypatch: pytest.MonkeyPatch, mapping: dict[str, Any]) -> None:
    monkeypatch.setattr(
        unified_metric_registry,
        "_get_service_map",
        lambda: mapping,
    )
    # The executor imports the symbol directly at module load; patch that too.
    monkeypatch.setattr(uqb, "_get_service_map", lambda: mapping)


class TestSustainabilityServiceBranch:
    def test_returns_reader_payload_not_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        contract = _sus_contract("scope1_tco2e")
        snapshot_id = str(uuid4())

        calls: list[dict[str, Any]] = []

        def fake_reader(**kwargs: Any) -> dict[str, Any]:
            calls.append(kwargs)
            return {
                "value": "1234.5",
                "unit": "tco2e",
                "null_reason": None,
                "trust_status": "released",
                "snapshot_version": snapshot_id,
                "state_origin": "authoritative",
            }

        _install_service_map(monkeypatch, {"sustainability_authoritative": fake_reader})
        registry = UnifiedMetricRegistry([contract])
        results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)

        assert len(results) == 1
        r = results[0]
        assert r.metric_key == "scope1_tco2e"
        assert r.source == "service"
        assert r.value == "1234.5"
        assert r.unit == "tco2e"
        assert r.trust_status == "released"
        assert r.snapshot_version == snapshot_id
        assert r.null_reason is None

        assert len(calls) == 1
        call = calls[0]
        assert call["business_id"] == BUSINESS_ID
        assert call["env_id"] == "repe"
        assert call["entity_scope"] == "portfolio"
        assert call["period_key"] == "2026Q2"
        assert call["metric_family"] == "sustainability"
        assert call["metric_key"] == "scope1_tco2e"

    def test_null_reason_passes_through_and_is_not_zero(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        contract = _sus_contract("scope1_tco2e")

        def fake_reader(**kwargs: Any) -> dict[str, Any]:
            return {
                "value": None,
                "unit": None,
                "null_reason": "snapshot_unavailable",
                "trust_status": "missing_source",
                "snapshot_version": None,
                "state_origin": "authoritative",
            }

        _install_service_map(monkeypatch, {"sustainability_authoritative": fake_reader})
        registry = UnifiedMetricRegistry([contract])
        results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)

        assert len(results) == 1
        r = results[0]
        assert r.value is None
        assert r.value != "0"
        assert r.value != 0
        assert r.null_reason == "snapshot_unavailable"
        assert r.trust_status == "missing_source"
        assert r.snapshot_version is None
        # Unit falls back to the contract when the reader has none.
        assert r.unit == "tco2e"

    def test_raising_reader_fails_closed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        contract = _sus_contract("scope1_tco2e")

        def fake_reader(**kwargs: Any) -> dict[str, Any]:
            raise RuntimeError("database exploded")

        _install_service_map(monkeypatch, {"sustainability_authoritative": fake_reader})
        registry = UnifiedMetricRegistry([contract])
        results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)

        assert len(results) == 1
        r = results[0]
        assert r.value is None
        assert r.value != "0"
        assert r.null_reason is None
        assert r.trust_status is None
        assert r.snapshot_version is None
        assert r.source == "service"


class TestPortfolioKpisUnaffected:
    def test_portfolio_kpis_branch_still_runs(self, monkeypatch: pytest.MonkeyPatch) -> None:
        contract = _portfolio_contract("fund_count")

        captured: list[dict[str, Any]] = []

        def fake_portfolio(**kwargs: Any) -> dict[str, Any]:
            captured.append(kwargs)
            return {"fund_count": 7}

        # Include a sustainability entry too so we prove routing didn't collide.
        _install_service_map(
            monkeypatch,
            {
                "portfolio_kpis": fake_portfolio,
                "sustainability_authoritative": lambda **_: pytest.fail(
                    "sustainability reader must not be called for portfolio_kpis",
                ),
            },
        )
        registry = UnifiedMetricRegistry([contract])
        results, _ = uqb.execute_unified_query(_make_query("fund_count"), registry)

        assert len(results) == 1
        r = results[0]
        assert r.metric_key == "fund_count"
        assert r.value == "7"
        assert r.source == "service"
        # Portfolio branch signature is unchanged: env_id / business_id / quarter / scenario_id.
        assert len(captured) == 1
        call = captured[0]
        assert set(call.keys()) == {"env_id", "business_id", "quarter", "scenario_id"}
        assert call["business_id"] == BUSINESS_ID
        assert call["quarter"] == "2026Q2"
