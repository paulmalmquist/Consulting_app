"""
API adapter for truth parity verification.

Calls the API endpoints and normalizes results into MetricResult format
for comparison against SQL and Python layers.
"""
from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass
class MetricResult:
    source: str          # "sql" | "python" | "api" | "frontend" | "ai"
    metric: str          # "gross_irr" | "nav" | "tvpi" etc.
    entity_id: str       # fund_id, asset_id, etc.
    quarter: str
    model_id: str | None
    value: Decimal | None
    raw: dict            # full payload for debugging


class ApiAdapter:
    """Adapter that calls the BOS API endpoints and extracts metric values."""

    def __init__(self, base_url: str = "http://localhost:8000", env_id: str = ""):
        self.base_url = base_url.rstrip("/")
        self.env_id = env_id

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items() if v)
            url += f"?{qs}"

        req = urllib.request.Request(url)
        req.add_header("X-Env-Id", self.env_id)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    def get_fund_table(self, quarter: str, model_id: str | None = None) -> list[dict]:
        params = {"quarter": quarter}
        if model_id:
            params["model_id"] = model_id
        return self._get(f"/api/re/v2/environments/{self.env_id}/fund-table", params)

    def get_portfolio_kpis(self, quarter: str, model_id: str | None = None) -> dict:
        params = {"quarter": quarter}
        if model_id:
            params["scenario_id"] = model_id
        return self._get(f"/api/re/v2/environments/{self.env_id}/portfolio-kpis", params)

    def get_portfolio_signals(self, quarter: str) -> list[dict]:
        return self._get(
            f"/api/re/v2/environments/{self.env_id}/portfolio-signals",
            {"quarter": quarter},
        )

    def get_allocation_breakdown(self, quarter: str, group_by: str = "sector") -> dict:
        return self._get(
            f"/api/re/v2/environments/{self.env_id}/allocation-breakdown",
            {"quarter": quarter, "group_by": group_by},
        )

    def get_fund_comparison(self, quarter: str, metric: str) -> list[dict]:
        return self._get(
            f"/api/re/v2/environments/{self.env_id}/fund-comparison",
            {"quarter": quarter, "metric": metric},
        )

    def resolve_query(self, query: str, quarter: str) -> dict:
        return self._get(
            f"/api/re/v2/environments/{self.env_id}/query-resolve",
            {"q": query, "quarter": quarter},
        )

    # -- Metric extraction helpers --

    def extract_fund_metric(
        self,
        fund_table: list[dict],
        fund_id: str,
        metric: str,
        quarter: str,
        model_id: str | None = None,
    ) -> MetricResult:
        """Extract a specific metric for a fund from the fund table response."""
        row = next((r for r in fund_table if r["fund_id"] == fund_id), None)
        value = None
        if row and row.get(metric) is not None:
            value = Decimal(str(row[metric]))

        return MetricResult(
            source="api",
            metric=metric,
            entity_id=fund_id,
            quarter=quarter,
            model_id=model_id,
            value=value,
            raw=row or {},
        )

    def extract_kpi_metric(
        self,
        kpis: dict,
        metric: str,
        quarter: str,
        model_id: str | None = None,
    ) -> MetricResult:
        """Extract a specific KPI from the portfolio KPIs response."""
        raw_value = kpis.get(metric)
        value = Decimal(str(raw_value)) if raw_value is not None else None

        return MetricResult(
            source="api",
            metric=metric,
            entity_id="portfolio",
            quarter=quarter,
            model_id=model_id,
            value=value,
            raw=kpis,
        )
