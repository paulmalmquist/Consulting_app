from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.unified_metrics import router
from app.services.unified_metric_registry import MetricContract, UnifiedMetricRegistry


def _contract(**overrides) -> MetricContract:
    defaults = dict(
        metric_key="gross_irr",
        display_name="Gross IRR",
        description="Fund gross IRR",
        aliases=("gross irr",),
        metric_family="returns",
        query_strategy="template",
        template_key="repe.fund_returns",
        service_function=None,
        sql_template=None,
        unit="percent",
        aggregation="latest",
        format_hint_fe="percent",
        polarity="up_good",
        entity_key="fund",
        allowed_breakouts=("quarter", "strategy"),
        time_behavior="latest_snapshot",
    )
    defaults.update(overrides)
    return MetricContract(**defaults)


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_inventory_api_scope_platform(monkeypatch):
    client = _client()

    monkeypatch.setattr(
        "app.routes.unified_metrics.build_metric_inventory_response",
        lambda **kwargs: {
            "business_id": kwargs["business_id"],
            "env_id": kwargs["env_id"],
            "generated_at": datetime(2026, 4, 8, 12, 0, tzinfo=UTC),
            "inventory_hash": "abc123",
            "summary": {
                "declared_metric_count": 4,
                "executable_metric_count": 3,
                "meridian_askable_count": 2,
                "drift_issue_count": 1,
            },
            "platform_metrics": [
                {
                    "metric_key": "gross_irr",
                    "display_name": "Gross IRR",
                    "aliases": ["gross irr"],
                    "metric_family": "returns",
                    "entity_key": "fund",
                    "query_strategy": "template",
                    "template_key": "repe.fund_returns",
                    "service_function": None,
                    "canonical_source": "re_fund_quarter_state",
                    "natural_grain": "fund_quarter",
                    "declared_breakouts": ["quarter", "strategy"],
                    "validated_group_bys": ["quarter", "strategy"],
                    "supported_transformations_platform": ["rank", "list"],
                    "supported_transformations_meridian": ["rank"],
                    "time_behavior": "latest_snapshot",
                    "fallback_grain": None,
                    "inventory_status": "meridian_askable",
                    "warnings": [],
                }
            ],
            "meridian_askable_metrics": [],
            "drift_issues": [
                {
                    "metric_key": "rent",
                    "issue_type": "declared_breakouts_not_validated",
                    "message": "Declared breakouts exceed validated group-bys.",
                }
            ],
        },
    )

    response = client.get(
        "/api/metrics/v2/inventory",
        params={
            "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
            "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
            "scope": "platform",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["executable_metric_count"] == 3
    assert body["platform_metrics"][0]["metric_key"] == "gross_irr"
    assert body["meridian_askable_metrics"] == []


def test_inventory_api_scope_meridian(monkeypatch):
    client = _client()

    monkeypatch.setattr(
        "app.routes.unified_metrics.build_metric_inventory_response",
        lambda **kwargs: {
            "business_id": kwargs["business_id"],
            "env_id": kwargs["env_id"],
            "generated_at": datetime(2026, 4, 8, 12, 0, tzinfo=UTC),
            "inventory_hash": "xyz789",
            "summary": {
                "declared_metric_count": 4,
                "executable_metric_count": 3,
                "meridian_askable_count": 2,
                "drift_issue_count": 0,
            },
            "platform_metrics": [],
            "meridian_askable_metrics": [
                {
                    "metric_key": "total_commitments",
                    "display_name": "Total Commitments",
                    "aliases": ["commitments"],
                    "metric_family": "capital",
                    "entity_key": "fund",
                    "query_strategy": "service",
                    "template_key": None,
                    "service_function": "portfolio_kpis",
                    "canonical_source": "re_env_portfolio.get_portfolio_kpis",
                    "natural_grain": "portfolio",
                    "declared_breakouts": ["fund"],
                    "validated_group_bys": ["fund"],
                    "supported_transformations_platform": ["summary", "breakout"],
                    "supported_transformations_meridian": ["summary", "breakout"],
                    "time_behavior": "latest_snapshot",
                    "fallback_grain": "fund",
                    "inventory_status": "meridian_askable",
                    "warnings": [],
                }
            ],
            "drift_issues": [],
        },
    )

    response = client.get(
        "/api/metrics/v2/inventory",
        params={
            "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
            "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
            "scope": "meridian",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["platform_metrics"] == []
    assert body["meridian_askable_metrics"][0]["metric_key"] == "total_commitments"


def test_catalog_route_shape_unchanged(monkeypatch):
    client = _client()
    registry = UnifiedMetricRegistry([_contract(metric_key="gross_irr")])

    monkeypatch.setattr("app.routes.unified_metrics.get_registry", lambda **_kwargs: registry)

    response = client.get(
        "/api/metrics/v2/catalog",
        params={"business_id": "a1b2c3d4-0001-0001-0001-000000000001"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "metric_key": "gross_irr",
            "display_name": "Gross IRR",
            "description": "Fund gross IRR",
            "aliases": ["gross irr"],
            "metric_family": "returns",
            "query_strategy": "template",
            "template_key": "repe.fund_returns",
            "unit": "percent",
            "aggregation": "latest",
            "format_hint_fe": "percent",
            "polarity": "up_good",
            "entity_key": "fund",
            "allowed_breakouts": ["quarter", "strategy"],
            "time_behavior": "latest_snapshot",
        }
    ]
