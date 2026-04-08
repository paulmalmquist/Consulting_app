from __future__ import annotations

from dataclasses import dataclass

from app.services.unified_metric_registry import MetricContract
from app.sql_agent.query_templates import get_template

REPE_ENTITY_KEYS = frozenset({
    "fund",
    "deal",
    "asset",
    "property_asset",
    "partner",
    "loan",
    "monthly_noi",
    "asset_quarter_rollup",
    "asset_occupancy",
    "asset_quarter_state",
    "fund_quarter_state",
    "fund_quarter_metrics",
    "partner_quarter_metrics",
    "loan_covenant",
})


@dataclass(frozen=True)
class ExecutionCapability:
    key: str
    execution_kind: str
    canonical_source: str | None
    natural_grain: str | None
    supported_group_bys: tuple[str, ...] = ()
    supported_transformations: tuple[str, ...] = ()
    fallback_grain: str | None = None
    template_key: str | None = None
    service_function: str | None = None


CANONICAL_METRIC_SOURCES: dict[str, dict[str, str | tuple[str, ...] | None]] = {
    "rent": {"canonical_source": "acct_normalized_noi_monthly.RENT", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "other_income": {"canonical_source": "acct_normalized_noi_monthly.OTHER_INCOME", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "egi": {"canonical_source": "acct_normalized_noi_monthly.EGI", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "payroll": {"canonical_source": "acct_normalized_noi_monthly.PAYROLL", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "repairs_maint": {"canonical_source": "acct_normalized_noi_monthly.REPAIRS_MAINT", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "utilities": {"canonical_source": "acct_normalized_noi_monthly.UTILITIES", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "taxes": {"canonical_source": "acct_normalized_noi_monthly.TAXES", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "insurance": {"canonical_source": "acct_normalized_noi_monthly.INSURANCE", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "mgmt_fees": {"canonical_source": "acct_normalized_noi_monthly.MGMT_FEES", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "total_opex": {"canonical_source": "acct_normalized_noi_monthly.TOTAL_OPEX", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "noi": {"canonical_source": "acct_normalized_noi_monthly.NOI", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "noi_margin": {"canonical_source": "acct_normalized_noi_monthly.NOI_MARGIN", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "capex": {"canonical_source": "acct_normalized_noi_monthly.CAPEX", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "tenant_improvements": {"canonical_source": "acct_normalized_noi_monthly.TENANT_IMPROVEMENTS", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "leasing_commissions": {"canonical_source": "acct_normalized_noi_monthly.LEASING_COMMISSIONS", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "replacement_reserves": {"canonical_source": "acct_normalized_noi_monthly.REPLACEMENT_RESERVES", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "debt_service_int": {"canonical_source": "acct_normalized_noi_monthly.DEBT_SERVICE_INT", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "debt_service_prin": {"canonical_source": "acct_normalized_noi_monthly.DEBT_SERVICE_PRIN", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "total_debt_service": {"canonical_source": "acct_normalized_noi_monthly.TOTAL_DEBT_SERVICE", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "net_cash_flow": {"canonical_source": "acct_normalized_noi_monthly.NET_CASH_FLOW", "natural_grain": "asset_period", "fallback_grain": "asset_quarter"},
    "asset_value": {"canonical_source": "re_asset_quarter_state.asset_value", "natural_grain": "asset_quarter", "fallback_grain": "asset_latest"},
    "avg_rent": {"canonical_source": "re_asset_occupancy_quarter.avg_rent", "natural_grain": "asset_quarter", "fallback_grain": "asset_latest"},
    "debt_yield": {"canonical_source": "re_asset_quarter_state.debt_balance", "natural_grain": "asset_quarter", "fallback_grain": "asset_latest"},
    "weighted_ltv": {"canonical_source": "re_fund_quarter_state.weighted_ltv", "natural_grain": "fund_quarter", "fallback_grain": "portfolio_quarter"},
    "weighted_dscr": {"canonical_source": "re_fund_quarter_state.weighted_dscr", "natural_grain": "fund_quarter", "fallback_grain": "portfolio_quarter"},
    "fund_count": {"canonical_source": "re_env_portfolio.get_portfolio_kpis", "natural_grain": "portfolio", "fallback_grain": "portfolio_quarter"},
    "active_asset_count": {"canonical_source": "repe.count_assets", "natural_grain": "portfolio", "fallback_grain": "fund"},
    "total_commitments": {"canonical_source": "re_env_portfolio.get_portfolio_kpis", "natural_grain": "portfolio", "fallback_grain": "fund"},
    "portfolio_nav": {"canonical_source": "re_env_portfolio.get_portfolio_kpis", "natural_grain": "portfolio_quarter", "fallback_grain": "fund_quarter"},
    "gross_irr_weighted": {"canonical_source": "re_env_portfolio.get_portfolio_kpis", "natural_grain": "portfolio_quarter", "fallback_grain": "fund_quarter"},
    "net_irr_weighted": {"canonical_source": "re_env_portfolio.get_portfolio_kpis", "natural_grain": "portfolio_quarter", "fallback_grain": "fund_quarter"},
    "fund_list": {"canonical_source": "repe.list_funds", "natural_grain": "fund", "fallback_grain": None},
    "asset_count": {"canonical_source": "repe.count_assets", "natural_grain": "portfolio", "fallback_grain": "fund"},
    "performance_family": {"canonical_source": "re_fund_quarter_state", "natural_grain": "fund_quarter", "fallback_grain": "portfolio_quarter"},
    "noi_variance": {"canonical_source": "finance.noi_variance", "natural_grain": "asset_quarter", "fallback_grain": "asset_latest"},
}

SERVICE_CAPABILITIES: dict[str, dict[str, ExecutionCapability]] = {
    "portfolio_kpis": {
        "fund_count": ExecutionCapability(
            key="fund_count",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain="portfolio",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="portfolio_kpis",
        ),
        "total_commitments": ExecutionCapability(
            key="total_commitments",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain="portfolio",
            supported_group_bys=("quarter", "fund"),
            supported_transformations=("summary", "breakout"),
            fallback_grain="fund",
            service_function="portfolio_kpis",
        ),
        "portfolio_nav": ExecutionCapability(
            key="portfolio_nav",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain="portfolio_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="fund_quarter",
            service_function="portfolio_kpis",
        ),
        "active_asset_count": ExecutionCapability(
            key="active_asset_count",
            execution_kind="service",
            canonical_source="repe.count_assets",
            natural_grain="portfolio",
            supported_group_bys=("status",),
            supported_transformations=("summary", "filter"),
            fallback_grain="fund",
            service_function="portfolio_kpis",
        ),
        "gross_irr_weighted": ExecutionCapability(
            key="gross_irr_weighted",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain="portfolio_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="fund_quarter",
            service_function="portfolio_kpis",
        ),
        "net_irr_weighted": ExecutionCapability(
            key="net_irr_weighted",
            execution_kind="service",
            canonical_source="re_env_portfolio.get_portfolio_kpis",
            natural_grain="portfolio_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="fund_quarter",
            service_function="portfolio_kpis",
        ),
    },
    "fund_metrics": {
        "gross_irr": ExecutionCapability(
            key="gross_irr",
            execution_kind="service",
            canonical_source="re_fund_metrics_qtr",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="fund_metrics",
        ),
        "net_irr": ExecutionCapability(
            key="net_irr",
            execution_kind="service",
            canonical_source="re_fund_metrics_qtr",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="fund_metrics",
        ),
        "tvpi": ExecutionCapability(
            key="tvpi",
            execution_kind="service",
            canonical_source="re_fund_metrics_qtr",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="fund_metrics",
        ),
        "dpi": ExecutionCapability(
            key="dpi",
            execution_kind="service",
            canonical_source="re_fund_metrics_qtr",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="fund_metrics",
        ),
        "rvpi": ExecutionCapability(
            key="rvpi",
            execution_kind="service",
            canonical_source="re_fund_metrics_qtr",
            natural_grain="fund_quarter",
            supported_group_bys=("quarter",),
            supported_transformations=("summary",),
            fallback_grain="portfolio_quarter",
            service_function="fund_metrics",
        ),
    },
    "list_funds": {
        "fund_list": ExecutionCapability(
            key="fund_list",
            execution_kind="service",
            canonical_source="repe.list_funds",
            natural_grain="fund",
            supported_group_bys=("strategy", "status", "vintage_year"),
            supported_transformations=("list", "summary"),
            service_function="list_funds",
        ),
    },
    "count_assets": {
        "asset_count": ExecutionCapability(
            key="asset_count",
            execution_kind="service",
            canonical_source="repe.count_assets",
            natural_grain="portfolio",
            supported_group_bys=("status",),
            supported_transformations=("summary", "filter", "detail"),
            fallback_grain="fund",
            service_function="count_assets",
        ),
    },
    "list_property_assets": {
        "asset_inventory": ExecutionCapability(
            key="asset_inventory",
            execution_kind="service",
            canonical_source="repe.list_property_assets",
            natural_grain="asset",
            supported_group_bys=("fund", "status"),
            supported_transformations=("list", "detail"),
            service_function="list_property_assets",
        ),
    },
    "noi_variance": {
        "noi_variance": ExecutionCapability(
            key="noi_variance",
            execution_kind="service",
            canonical_source="finance.noi_variance",
            natural_grain="asset_quarter",
            supported_group_bys=("fund", "market", "property_type", "quarter"),
            supported_transformations=("rank", "filter", "list"),
            fallback_grain="asset_latest",
            service_function="noi_variance",
        ),
    },
}

SEMANTIC_EXECUTION_CAPABILITIES: dict[str, ExecutionCapability] = {
    key: ExecutionCapability(
        key=key,
        execution_kind="semantic",
        canonical_source=str(meta.get("canonical_source")),
        natural_grain=str(meta.get("natural_grain")),
        supported_group_bys=(),
        supported_transformations=("summary",),
        fallback_grain=str(meta.get("fallback_grain")) if meta.get("fallback_grain") else None,
    )
    for key, meta in CANONICAL_METRIC_SOURCES.items()
    if key not in {"fund_list", "asset_count", "performance_family", "noi_variance"}
}


def is_repe_metric_contract(contract: MetricContract) -> bool:
    return (contract.entity_key or "") in REPE_ENTITY_KEYS


def get_template_capability(template_key: str | None) -> ExecutionCapability | None:
    if not template_key:
        return None
    template = get_template(template_key)
    if not template or not template.canonical_source or not template.natural_grain:
        return None
    return ExecutionCapability(
        key=template.key,
        execution_kind="template",
        canonical_source=template.canonical_source,
        natural_grain=template.natural_grain,
        supported_group_bys=tuple(sorted(template.supported_group_bys)),
        supported_transformations=tuple(sorted(template.supported_transformations)),
        template_key=template.key,
    )


def get_service_capability(service_function: str | None, metric_key: str) -> ExecutionCapability | None:
    if not service_function:
        return None
    return SERVICE_CAPABILITIES.get(service_function, {}).get(metric_key.lower())


def resolve_execution_capability(contract: MetricContract) -> ExecutionCapability | None:
    template_capability = get_template_capability(contract.template_key)
    if template_capability is not None:
        return ExecutionCapability(
            key=contract.metric_key,
            execution_kind=template_capability.execution_kind,
            canonical_source=template_capability.canonical_source,
            natural_grain=template_capability.natural_grain,
            supported_group_bys=template_capability.supported_group_bys,
            supported_transformations=template_capability.supported_transformations,
            fallback_grain=CANONICAL_METRIC_SOURCES.get(contract.metric_key, {}).get("fallback_grain"),  # type: ignore[arg-type]
            template_key=contract.template_key,
        )

    service_capability = get_service_capability(contract.service_function, contract.metric_key)
    if service_capability is not None:
        return service_capability

    if contract.query_strategy in {"semantic", "computed"}:
        return SEMANTIC_EXECUTION_CAPABILITIES.get(contract.metric_key)

    return None


def resolve_canonical_source(metric_key: str) -> str | None:
    meta = CANONICAL_METRIC_SOURCES.get(metric_key.lower())
    value = meta.get("canonical_source") if meta else None
    return str(value) if value else None


def resolve_fallback_grain(metric_key: str) -> str | None:
    meta = CANONICAL_METRIC_SOURCES.get(metric_key.lower())
    value = meta.get("fallback_grain") if meta else None
    return str(value) if value else None


def resolve_validated_group_bys(contract: MetricContract) -> tuple[str, ...]:
    capability = resolve_execution_capability(contract)
    if capability is None:
        return ()
    return capability.supported_group_bys
