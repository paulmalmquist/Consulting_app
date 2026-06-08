"""Pydantic response shapes for the Healthcare Subscription Analytics module (hha).

SYNTHETIC / NO-PHI. These are read-only analytics payloads — exec KPI strip plus a
health probe. Money is exposed as decimal dollars (cast from integer minor units at the
service edge); rates are exposed as [0,1] fractions and formatted client-side.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class HhaMetricDefinition(BaseModel):
    """One governed metric definition — the 'one definition per metric' contract,
    surfaced in the UI metric drawer."""

    key: str
    label: str
    formula: str
    grain: str
    owner: str
    source: str


class HhaKpi(BaseModel):
    """A single exec KPI with its value, render format, and governed definition."""

    key: str
    label: str
    value: float | int | None
    unit: str  # 'usd' | 'fraction' | 'ratio' | 'months' | 'count'
    fmt: str  # 'currency' | 'percent' | 'ratio' | 'months' | 'count'
    definition: HhaMetricDefinition


class HhaOverview(BaseModel):
    """Exec overview payload: the KPI strip plus freshness/provenance for the footer."""

    env_id: str
    as_of_date: str | None
    source_freshness_at: str | None
    provenance_label: str | None
    synthetic: bool = True
    phi: bool = False
    disclaimer: str
    kpis: list[HhaKpi] = Field(default_factory=list)


class HhaHealth(BaseModel):
    """Liveness + row-count probe for the env's hha_ serving tables."""

    ok: bool
    env_id: str
    row_counts: dict[str, int]
    source_freshness_at: str | None
    provenance_label: str | None
    synthetic: bool = True
    phi: bool = False
