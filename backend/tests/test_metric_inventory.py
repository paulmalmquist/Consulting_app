from __future__ import annotations

from datetime import UTC, datetime

from app.services.metric_capability_metadata import ExecutionCapability
from app.services.metric_inventory import (
    _build_inventory,
    build_metric_inventory_response,
    render_metric_inventory_markdown,
)
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


def test_declared_metric_without_execution_metadata_is_declared_only():
    registry = UnifiedMetricRegistry(
        [
            _contract(
                metric_key="mystery_metric",
                display_name="Mystery Metric",
                query_strategy="semantic",
                template_key=None,
                sql_template="SUM(mystery_value)",
                entity_key="asset",
                allowed_breakouts=("fund",),
            ),
        ]
    )

    built = _build_inventory(registry)
    entry = next(item for item in built["entries"] if item["metric_key"] == "mystery_metric")

    assert entry["inventory_status"] == "declared_only"
    assert entry["_include_in_platform"] is False
    assert any(issue["issue_type"] == "missing_execution_path" for issue in built["drift_issues"])


def test_template_metric_without_canonical_source_is_drifted(monkeypatch):
    registry = UnifiedMetricRegistry([_contract(metric_key="gross_irr")])

    monkeypatch.setattr(
        "app.services.metric_inventory.resolve_execution_capability",
        lambda _contract: ExecutionCapability(
            key="gross_irr",
            execution_kind="template",
            canonical_source=None,
            natural_grain="fund_quarter",
            supported_group_bys=("quarter", "strategy"),
            supported_transformations=("rank",),
        ),
    )

    built = _build_inventory(registry)
    entry = next(item for item in built["entries"] if item["metric_key"] == "gross_irr")

    assert entry["inventory_status"] == "drifted"
    assert any(issue["issue_type"] == "missing_canonical_source" for issue in built["drift_issues"])


def test_service_metric_without_natural_grain_is_drifted(monkeypatch):
    registry = UnifiedMetricRegistry(
        [
            _contract(
                metric_key="total_commitments",
                display_name="Total Commitments",
                query_strategy="service",
                template_key=None,
                service_function="portfolio_kpis",
                unit="dollar",
                entity_key="fund",
            ),
        ]
    )

    monkeypatch.setattr(
        "app.services.metric_inventory.resolve_execution_capability",
        lambda _contract: ExecutionCapability(
            key="total_commitments",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain=None,
            supported_group_bys=("fund",),
            supported_transformations=("summary", "breakout"),
            service_function="portfolio_kpis",
        ),
    )

    built = _build_inventory(registry)
    entry = next(item for item in built["entries"] if item["metric_key"] == "total_commitments")

    assert entry["inventory_status"] == "drifted"
    assert any(issue["issue_type"] == "missing_canonical_source" for issue in built["drift_issues"])


def test_validated_group_bys_can_be_narrower_than_declared_breakouts(monkeypatch):
    registry = UnifiedMetricRegistry(
        [_contract(metric_key="tvpi", display_name="TVPI", aliases=("tvpi",))]
    )

    monkeypatch.setattr(
        "app.services.metric_inventory.resolve_execution_capability",
        lambda _contract: ExecutionCapability(
            key="tvpi",
            execution_kind="template",
            canonical_source="re_fund_quarter_state",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("rank",),
            template_key="repe.tvpi_ranked",
        ),
    )

    built = _build_inventory(registry)
    entry = next(item for item in built["entries"] if item["metric_key"] == "tvpi")

    assert entry["validated_group_bys"] == ["quarter"]
    assert entry["inventory_status"] == "drifted"
    assert "strategy" in entry["warnings"][0]


def test_meridian_askable_requires_runtime_support_and_execution_proof(monkeypatch):
    registry = UnifiedMetricRegistry(
        [
            _contract(
                metric_key="total_commitments",
                display_name="Total Commitments",
                query_strategy="service",
                template_key=None,
                service_function="portfolio_kpis",
                unit="dollar",
                entity_key="fund",
                allowed_breakouts=("fund", "quarter"),
            ),
        ]
    )

    monkeypatch.setattr("app.services.metric_inventory.resolve_execution_capability", lambda _contract: None)

    built = _build_inventory(registry)
    entry = next(item for item in built["entries"] if item["metric_key"] == "total_commitments")

    assert entry["inventory_status"] == "drifted"
    assert entry["_include_in_meridian"] is False
    assert any(issue["issue_type"] == "runtime_support_missing_inventory_proof" for issue in built["drift_issues"])


def test_inventory_hash_is_stable_and_changes_when_metadata_changes():
    registry = UnifiedMetricRegistry([_contract(metric_key="gross_irr")])
    generated_at = datetime(2026, 4, 8, 12, 0, tzinfo=UTC)

    baseline = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
        generated_at=generated_at,
    )
    repeat = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
        generated_at=generated_at,
    )
    changed_registry = UnifiedMetricRegistry(
        [_contract(metric_key="gross_irr", allowed_breakouts=("quarter",))]
    )
    changed = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=changed_registry,
        generated_at=generated_at,
    )

    assert baseline["inventory_hash"] == repeat["inventory_hash"]
    assert baseline["inventory_hash"] != changed["inventory_hash"]


def test_markdown_snapshot_includes_required_sections():
    registry = UnifiedMetricRegistry([_contract(metric_key="gross_irr")])
    response = build_metric_inventory_response(
        business_id="a1b2c3d4-0001-0001-0001-000000000001",
        env_id="a1b2c3d4-0001-0001-0003-000000000001",
        registry=registry,
        generated_at=datetime(2026, 4, 8, 12, 0, tzinfo=UTC),
    )

    markdown = render_metric_inventory_markdown(response)

    assert "# Meridian Metric Inventory" in markdown
    assert "## Platform Metrics" in markdown
    assert "## Askable Examples" in markdown
    assert "gross_irr" in markdown
