"""Result interpreter — maps query result shapes to visualization types.

Deterministic: no LLM needed. Inspects column names and row counts
to pick the right frontend visualization.
"""
from __future__ import annotations


# Visualization types that the frontend knows how to render
VIZ_TYPES = {
    "kpi",              # Single big number
    "kpi_group",        # Multiple related KPIs
    "bar_chart",        # Categorical bars
    "trend_line",       # Time-series line chart
    "table",            # Generic data table
    "waterfall_chart",  # Waterfall (NOI bridge, IRR bridge)
    "histogram",        # Distribution (Monte Carlo)
    "comparison_bar",   # Side-by-side comparison
    "dashboard_spec",   # Full dashboard with multiple widgets
}

# Python function → known visualization
PYTHON_VIZ: dict[str, str] = {
    "xirr": "kpi",
    "waterfall": "waterfall_chart",
    "rollforward": "table",
    "irr_bridge": "waterfall_chart",
    "monte_carlo": "histogram",
    "dcf": "kpi_group",
    "what_if_valuation": "comparison_bar",
    "ratio_calc": "kpi",
}

# Time-period column names
_TIME_COLS = {"quarter", "date", "period", "period_month", "year", "month"}

# Entity/name column names
_ENTITY_COLS = {"name", "asset", "fund", "deal", "partner", "market", "property_type"}


def interpret(
    columns: list[str],
    rows: list[dict],
    *,
    route: str = "sql",
    python_fn: str | None = None,
) -> str:
    """Given result columns and rows, return the best visualization type."""
    # Python results have known shapes
    if route == "python" and python_fn:
        return PYTHON_VIZ.get(python_fn, "table")

    col_count = len(columns)
    row_count = len(rows)
    col_lower = [c.lower() for c in columns]

    # Single scalar
    if row_count == 1 and col_count == 1:
        return "kpi"

    # Small number of scalars (e.g. multiple KPIs in one row)
    if row_count == 1 and col_count <= 6:
        return "kpi_group"

    # Time-series: first column is a period
    if col_lower and col_lower[0] in _TIME_COLS:
        if col_count <= 3:
            return "trend_line"
        return "table"

    # Entity + metric: first column is a name, second is numeric
    if col_lower and col_lower[0] in _ENTITY_COLS and col_count >= 2:
        if col_count <= 3 and row_count <= 20:
            return "bar_chart"
        return "table"

    # Wide result with entity + many metrics → multi-widget dashboard
    if col_count >= 5 and col_lower[0] in _ENTITY_COLS:
        return "dashboard_spec"

    # Default
    return "table"
