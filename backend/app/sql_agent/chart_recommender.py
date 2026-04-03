"""Chart recommender — inspects query results and produces structured chart specs.

Deterministic: no LLM needed.  Outputs chart specifications that map
directly to the frontend's AssistantResponseBlock chart type.

Chart spec format matches repo-b/src/lib/commandbar/types.ts:
  { type: "chart", chart_type, x_key, y_keys, data, format?, series_key? }
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChartSpec:
    """Structured chart recommendation ready for the frontend."""
    chart_type: str  # "line" | "bar" | "grouped_bar" | "stacked_bar" | "area" | "scatter"
    x_key: str
    y_keys: list[str]
    format: str = "number"  # "dollar" | "percent" | "number" | "ratio"
    series_key: str | None = None
    title: str | None = None
    reason: str = ""

    def to_block(self, data: list[dict[str, Any]]) -> dict[str, Any]:
        """Convert to frontend AssistantResponseBlock format."""
        block: dict[str, Any] = {
            "type": "chart",
            "chart_type": self.chart_type,
            "x_key": self.x_key,
            "y_keys": self.y_keys,
            "data": data,
            "format": self.format,
        }
        if self.series_key:
            block["series_key"] = self.series_key
        return block


@dataclass
class ChartRecommendation:
    """Full recommendation with primary chart and alternatives."""
    primary: ChartSpec | None = None
    alternatives: list[ChartSpec] = field(default_factory=list)
    show_table: bool = True  # always show table alongside chart
    reason: str = ""


# Column name patterns for classification
_TIME_COLS = {"quarter", "period", "date", "month", "year", "period_month", "week"}
_ENTITY_COLS = {
    "name", "asset_name", "fund_name", "deal_name", "partner_name",
    "account_name", "full_name", "market", "property_type", "region",
    "service_line_key", "tool_name", "stage", "label", "tier",
    "governance_track", "role_level", "sponsor", "loan_type",
}
_DOLLAR_COLS = {
    "noi", "revenue", "opex", "capex", "amount", "debt_service",
    "net_cash_flow", "nav", "portfolio_nav", "asset_value",
    "total_value", "avg_deal_size", "loan_amount", "current_noi",
    "actual", "budget", "variance", "committed_amount", "spent_amount",
    "approved_budget", "prior_noi", "current_noi", "noi_change",
    "avg_rent", "total_committed", "total_called", "total_distributed",
    "base_noi", "dcf_value",
}
_PERCENT_COLS = {
    "occupancy", "utilization_pct", "avg_utilization", "adoption_rate_pct",
    "win_rate_pct", "change_pct", "gross_irr", "net_irr", "irr",
    "interest_rate", "delta_pct", "margin",
}
_RATIO_COLS = {
    "tvpi", "dpi", "rvpi", "dscr", "ltv", "debt_yield",
    "actual_value", "threshold_value",
}


def _detect_format(col: str) -> str:
    """Guess the display format for a column name."""
    cl = col.lower()
    if cl in _DOLLAR_COLS:
        return "dollar"
    if cl in _PERCENT_COLS:
        return "percent"
    if cl in _RATIO_COLS:
        return "ratio"
    return "number"


def _is_time_col(col: str) -> bool:
    return col.lower() in _TIME_COLS


def _is_entity_col(col: str) -> bool:
    return col.lower() in _ENTITY_COLS


def _is_numeric_col(col: str, rows: list[dict]) -> bool:
    """Check if a column contains numeric-looking data."""
    for row in rows[:10]:
        v = row.get(col)
        if v is None:
            continue
        if isinstance(v, (int, float)):
            return True
        if isinstance(v, str):
            try:
                float(v)
                return True
            except ValueError:
                return False
    return False


def recommend_chart(
    columns: list[str],
    rows: list[dict[str, Any]],
    *,
    query_type: str | None = None,
    template_chart: str | None = None,
) -> ChartRecommendation:
    """Recommend chart(s) based on column names, data shape, and query type.

    Args:
        columns: Column names from the result set.
        rows: Result rows (list of dicts).
        query_type: QueryType value from classifier.
        template_chart: Default chart from template (if template was used).

    Returns:
        ChartRecommendation with primary spec and alternatives.
    """
    if not columns or not rows:
        return ChartRecommendation(reason="No data to chart")

    col_count = len(columns)
    row_count = len(rows)

    # Find column categories
    time_cols = [c for c in columns if _is_time_col(c)]
    entity_cols = [c for c in columns if _is_entity_col(c)]
    numeric_cols = [c for c in columns if _is_numeric_col(c, rows) and c not in time_cols and c not in entity_cols]

    # Single scalar → no chart, just KPI
    if row_count == 1 and col_count == 1:
        return ChartRecommendation(reason="Single scalar value — KPI display preferred")

    # Small KPI group → no chart
    if row_count == 1 and col_count <= 4:
        return ChartRecommendation(reason="KPI group — no chart needed")

    # ── Time series: time column + numeric columns ──────────────────
    if time_cols and numeric_cols:
        x_key = time_cols[0]
        y_keys = numeric_cols[:4]  # cap at 4 series
        fmt = _detect_format(y_keys[0])

        primary = ChartSpec(
            chart_type="line",
            x_key=x_key,
            y_keys=y_keys,
            format=fmt,
            title=None,
            reason="Time-series data detected",
        )

        # If there's an entity column, suggest grouped bar as alternative
        alts = []
        if entity_cols:
            alts.append(ChartSpec(
                chart_type="grouped_bar",
                x_key=x_key,
                y_keys=y_keys[:2],
                format=fmt,
                series_key=entity_cols[0],
                reason="Grouped by entity over time",
            ))

        # Area chart as alternative for cumulative data
        alts.append(ChartSpec(
            chart_type="area",
            x_key=x_key,
            y_keys=y_keys,
            format=fmt,
            reason="Area chart alternative for trends",
        ))

        return ChartRecommendation(primary=primary, alternatives=alts, reason="Time-series pattern")

    # ── Ranked / categorical: entity column + numeric columns ───────
    if entity_cols and numeric_cols:
        x_key = entity_cols[0]
        y_keys = numeric_cols[:3]
        fmt = _detect_format(y_keys[0])

        # Decide bar vs grouped_bar
        if len(y_keys) >= 2 and query_type in ("variance_analysis", "grouped_aggregation"):
            chart_type = "grouped_bar"
        else:
            chart_type = "bar"

        primary = ChartSpec(
            chart_type=chart_type,
            x_key=x_key,
            y_keys=y_keys,
            format=fmt,
            reason="Categorical data detected",
        )

        alts = []
        # If variance, stacked bar is useful
        if query_type == "variance_analysis" and len(y_keys) >= 2:
            alts.append(ChartSpec(
                chart_type="stacked_bar",
                x_key=x_key,
                y_keys=y_keys[:2],
                format=fmt,
                reason="Stacked composition view",
            ))

        return ChartRecommendation(primary=primary, alternatives=alts, reason="Categorical pattern")

    # ── Two numeric columns: potential scatter ──────────────────────
    if len(numeric_cols) >= 2 and entity_cols:
        return ChartRecommendation(
            primary=ChartSpec(
                chart_type="scatter",
                x_key=numeric_cols[0],
                y_keys=[numeric_cols[1]],
                format=_detect_format(numeric_cols[0]),
                series_key=entity_cols[0],
                reason="Two numeric dimensions with labels",
            ),
            reason="Scatter pattern",
        )

    # ── Template default ────────────────────────────────────────────
    if template_chart and numeric_cols:
        x_key = (time_cols or entity_cols or columns)[:1]
        if x_key:
            return ChartRecommendation(
                primary=ChartSpec(
                    chart_type=template_chart,
                    x_key=x_key[0],
                    y_keys=numeric_cols[:3],
                    format=_detect_format(numeric_cols[0]),
                    reason=f"Template default: {template_chart}",
                ),
                reason="Template-suggested chart",
            )

    # ── Fallback: table only ────────────────────────────────────────
    return ChartRecommendation(reason="No clear chart pattern — table is best")
