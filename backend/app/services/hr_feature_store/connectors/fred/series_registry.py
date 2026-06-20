"""FRED series contract — pinned series IDs mapped to canonical feature names.

Inspectable + auditable: each entry pins the FRED `series_id`, the cadence (drives
cadence-aware staleness), and the canonical `QUANT_FEATURE_ORDER` slot it fills.
Some series are revisable (e.g. the term-premium estimate) — pinning the id here
makes the source contract explicit. Every key MUST be a canonical quant name so
gold/spine consumption stays aligned.
"""

from __future__ import annotations

from typing import Any

from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER

# canonical_name -> {series_id, cadence, units, note}
FRED_SERIES: dict[str, dict[str, Any]] = {
    "yield_curve_10y2y": {"series_id": "T10Y2Y", "cadence": "daily", "units": "percent",
                          "note": "10Y minus 2Y Treasury constant-maturity spread."},
    "fed_funds_rate": {"series_id": "DFF", "cadence": "daily", "units": "percent",
                       "note": "Effective federal funds rate (daily)."},
    "term_premium": {"series_id": "ACMTP10", "cadence": "daily", "units": "percent",
                     "note": "ACM 10Y term premium estimate (revisable)."},
    "mortgage_rate_30y": {"series_id": "MORTGAGE30US", "cadence": "weekly", "units": "percent",
                          "note": "30Y fixed mortgage rate (Freddie Mac PMMS)."},
    "hy_credit_spread": {"series_id": "BAMLH0A0HYM2", "cadence": "daily", "units": "percent",
                         "note": "ICE BofA US High Yield OAS."},
    "ig_credit_spread": {"series_id": "BAMLC0A0CM", "cadence": "daily", "units": "percent",
                         "note": "ICE BofA US Corporate (IG) OAS."},
}

CONNECTOR = "fred"


def canonical_for_series_id(series_id: str) -> str | None:
    for name, meta in FRED_SERIES.items():
        if meta["series_id"] == series_id:
            return name
    return None


def registered_canonical_names() -> list[str]:
    return list(FRED_SERIES.keys())


# Validation at import: every key is a real canonical quant slot.
_unknown = [n for n in FRED_SERIES if n not in QUANT_FEATURE_ORDER]
assert not _unknown, f"FRED_SERIES keys must be canonical QUANT_FEATURE_ORDER names; unknown: {_unknown}"
