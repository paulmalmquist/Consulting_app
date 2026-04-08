from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class MeridianStructuredCapability:
    inventory_key: str
    display_name: str
    key_kind: str
    canonical_source: str
    natural_grain: str
    supported_transformations: tuple[str, ...]
    supported_group_bys: tuple[str, ...] = ()
    fallback_grain: str | None = None
    runtime_metric_keys: tuple[str, ...] = ()
    runtime_fact_keys: tuple[str, ...] = ()
    continuation_support: tuple[str, ...] = ()
    template_keys: tuple[str, ...] = ()
    service_keys: tuple[str, ...] = ()


MERIDIAN_STRUCTURED_CAPABILITIES: tuple[MeridianStructuredCapability, ...] = (
    MeridianStructuredCapability(
        inventory_key="fund_list",
        display_name="Fund Inventory",
        key_kind="fact",
        canonical_source="repe.list_funds",
        natural_grain="fund",
        supported_transformations=("list", "summary"),
        runtime_fact_keys=("inventory",),
        service_keys=("list_funds",),
    ),
    MeridianStructuredCapability(
        inventory_key="performance_family",
        display_name="Fund Performance",
        key_kind="fact",
        canonical_source="re_fund_quarter_state",
        natural_grain="fund_quarter",
        supported_transformations=("summary",),
        supported_group_bys=("fund",),
        runtime_fact_keys=("performance_family",),
        template_keys=("repe.fund_performance_summary",),
    ),
    MeridianStructuredCapability(
        inventory_key="gross_irr",
        display_name="Gross IRR",
        key_kind="metric",
        canonical_source="re_fund_quarter_state",
        natural_grain="fund_quarter",
        supported_transformations=("rank",),
        supported_group_bys=("quarter", "vintage_year", "strategy"),
        fallback_grain="fund_quarter",
        runtime_metric_keys=("gross_irr",),
        template_keys=("repe.irr_ranked",),
    ),
    MeridianStructuredCapability(
        inventory_key="asset_count",
        display_name="Asset Count",
        key_kind="fact",
        canonical_source="repe.count_assets",
        natural_grain="portfolio",
        supported_transformations=("summary", "filter", "detail"),
        supported_group_bys=("status",),
        fallback_grain="fund",
        runtime_metric_keys=("asset_count",),
        continuation_support=("other", "remaining", "which_ones", "not_active"),
        service_keys=("count_assets", "list_property_assets"),
    ),
    MeridianStructuredCapability(
        inventory_key="total_commitments",
        display_name="Total Commitments",
        key_kind="metric",
        canonical_source="re_env_portfolio.get_portfolio_kpis",
        natural_grain="portfolio",
        supported_transformations=("summary", "breakout"),
        supported_group_bys=("fund",),
        fallback_grain="fund",
        runtime_metric_keys=("commitments",),
        service_keys=("portfolio_kpis",),
        template_keys=("repe.commitments_by_fund",),
    ),
    MeridianStructuredCapability(
        inventory_key="noi_variance",
        display_name="NOI Variance",
        key_kind="metric",
        canonical_source="finance.noi_variance",
        natural_grain="asset_quarter",
        supported_transformations=("rank", "filter"),
        fallback_grain="asset_latest",
        runtime_metric_keys=("noi_variance",),
        template_keys=("repe.noi_variance_ranked", "repe.noi_variance_filtered"),
    ),
    MeridianStructuredCapability(
        inventory_key="occupancy",
        display_name="Occupancy",
        key_kind="metric",
        canonical_source="repe_property_asset.occupancy",
        natural_grain="asset_latest",
        supported_transformations=("filter",),
        fallback_grain="asset_quarter",
        runtime_metric_keys=("occupancy",),
        template_keys=("repe.occupancy_filtered",),
    ),
)


MERIDIAN_SUPPORTED_METRIC_KEYS = frozenset(
    capability.inventory_key
    for capability in MERIDIAN_STRUCTURED_CAPABILITIES
    if capability.key_kind == "metric"
)

MERIDIAN_SUPPORTED_FACT_KEYS = frozenset(
    capability.inventory_key
    for capability in MERIDIAN_STRUCTURED_CAPABILITIES
    if capability.key_kind == "fact"
)


def list_meridian_structured_capabilities() -> list[MeridianStructuredCapability]:
    return list(MERIDIAN_STRUCTURED_CAPABILITIES)


def find_meridian_capability(
    *,
    inventory_key: str | None = None,
    runtime_metric_key: str | None = None,
    runtime_fact_key: str | None = None,
) -> MeridianStructuredCapability | None:
    for capability in MERIDIAN_STRUCTURED_CAPABILITIES:
        if inventory_key and capability.inventory_key == inventory_key:
            return capability
        if runtime_metric_key and runtime_metric_key in capability.runtime_metric_keys:
            return capability
        if runtime_fact_key and runtime_fact_key in capability.runtime_fact_keys:
            return capability
    return None


def resolve_inventory_key(*, metric: str | None, fact: str | None) -> str | None:
    if metric:
        capability = find_meridian_capability(runtime_metric_key=metric)
        if capability is not None:
            return capability.inventory_key
    if fact:
        capability = find_meridian_capability(runtime_fact_key=fact)
        if capability is not None:
            return capability.inventory_key
    return metric or fact


def evaluate_meridian_contract_support(contract: Any) -> tuple[bool, str | None, str | None]:
    metric = getattr(contract, "metric", None)
    fact = getattr(contract, "fact", None)
    transformation = getattr(contract, "transformation", None)
    group_by = getattr(contract, "group_by", None)

    inventory_key = resolve_inventory_key(metric=metric, fact=fact)
    capability = find_meridian_capability(inventory_key=inventory_key)
    if capability is None:
        return False, "missing_execution_path", inventory_key
    if not capability.canonical_source:
        return False, "missing_canonical_source", capability.inventory_key
    if transformation and transformation not in capability.supported_transformations:
        return False, "missing_transformation_support", capability.inventory_key
    if group_by and group_by not in capability.supported_group_bys:
        return False, "missing_group_by_support", capability.inventory_key
    return True, None, capability.inventory_key
