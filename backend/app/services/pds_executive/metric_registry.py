"""Central registry of PDS Executive metrics.

Every metric surface (orchestrator, overview, command router, driver engine,
reconciliation service) looks up its compute function through this registry.
No alternate SQL path may exist outside metric_functions.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from app.services.pds_executive import metric_functions as mf
from app.services.pds_executive.filter_normalizer import NormalizedFilters


TOLERANCE_EXACT = "exact"
TOLERANCE_CURRENCY = "currency"
TOLERANCE_PERCENTAGE = "percentage"

TOLERANCE_VALUES: dict[str, float] = {
    TOLERANCE_EXACT: 0.0,
    TOLERANCE_CURRENCY: 1.0,          # $1 rounding tolerance
    TOLERANCE_PERCENTAGE: 0.001,      # 0.1%
}


@dataclass
class MetricDefinition:
    name: str
    definition: str
    supported_grains: tuple[str, ...]
    source_tables: tuple[str, ...]
    compute_fn: Callable[[Any, NormalizedFilters], mf.MetricResult]
    validation_checks: tuple[str, ...] = field(default_factory=tuple)
    tolerance_class: str = TOLERANCE_CURRENCY

    def compute(self, cur, nf: NormalizedFilters) -> mf.MetricResult:
        if nf.grain not in self.supported_grains:
            raise ValueError(
                f"metric {self.name!r} does not support grain {nf.grain!r}; "
                f"supported: {self.supported_grains}"
            )
        return self.compute_fn(cur, nf)

    def to_metadata(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "definition": self.definition,
            "supported_grains": list(self.supported_grains),
            "source_tables": list(self.source_tables),
            "compute_fn": f"{self.compute_fn.__module__}.{self.compute_fn.__name__}",
            "validation_checks": list(self.validation_checks),
            "tolerance_class": self.tolerance_class,
            "tolerance_value": TOLERANCE_VALUES[self.tolerance_class],
        }


_REGISTRY: dict[str, MetricDefinition] = {
    "total_managed": MetricDefinition(
        name="total_managed",
        definition=(
            "Sum of approved budget across active in-scope PDS projects. "
            "Represents the dollar amount under PDS management at the selected grain."
        ),
        supported_grains=("portfolio", "account", "project"),
        source_tables=("pds_projects",),
        compute_fn=mf.compute_total_managed,
        validation_checks=(
            "approved_budget NOT NULL",
            "status = 'active'",
            "env_id + business_id scoping applied",
        ),
        tolerance_class=TOLERANCE_CURRENCY,
    ),
    "net_variance": MetricDefinition(
        name="net_variance",
        definition=(
            "Approved budget minus forecast at completion. Negative values indicate "
            "projects forecasted to overrun approved budget (pressure)."
        ),
        supported_grains=("portfolio", "account", "project"),
        source_tables=("pds_projects",),
        compute_fn=mf.compute_net_variance,
        validation_checks=(
            "approved_budget NOT NULL",
            "forecast_at_completion NOT NULL",
            "status = 'active'",
        ),
        tolerance_class=TOLERANCE_CURRENCY,
    ),
    "directional_delta": MetricDefinition(
        name="directional_delta",
        definition=(
            "Forecast at completion minus spent amount. Positive = headroom "
            "remaining; negative = burning past forecast."
        ),
        supported_grains=("portfolio", "account", "project"),
        source_tables=("pds_projects",),
        compute_fn=mf.compute_directional_delta,
        validation_checks=(
            "forecast_at_completion NOT NULL",
            "spent_amount NOT NULL",
            "status = 'active'",
        ),
        tolerance_class=TOLERANCE_CURRENCY,
    ),
    "accounts_at_risk": MetricDefinition(
        name="accounts_at_risk",
        definition=(
            "Count of in-scope entities where intervention_state is 'yellow' or "
            "'red'. At grain=portfolio this is a single integer; at coarser grains "
            "it is a breakdown by group."
        ),
        supported_grains=("portfolio", "account", "project"),
        source_tables=("pds_projects",),
        compute_fn=mf.compute_accounts_at_risk,
        validation_checks=(
            "intervention_state NOT NULL",
            "status = 'active'",
        ),
        tolerance_class=TOLERANCE_EXACT,
    ),
    "posture": MetricDefinition(
        name="posture",
        definition=(
            "Categorical portfolio posture derived from at-risk ratio: "
            "stable < watching (>0) < pressured (>=25%) < critical (>=50%)."
        ),
        supported_grains=("portfolio",),
        source_tables=("pds_projects",),
        compute_fn=mf.compute_posture,
        validation_checks=(
            "intervention_state NOT NULL",
            "status = 'active'",
        ),
        tolerance_class=TOLERANCE_EXACT,
    ),
}


def list_metrics() -> list[str]:
    return sorted(_REGISTRY.keys())


def get_metric(name: str) -> MetricDefinition:
    try:
        return _REGISTRY[name]
    except KeyError as exc:
        raise LookupError(f"Unknown PDS metric: {name!r}") from exc


def iter_metrics():
    return _REGISTRY.items()
