"""Census series contract — New Residential Construction (resconst), SAAR.

Public source (no key required). Pinned query params per series make the source
contract inspectable/auditable. `quant_slot` is the canonical QUANT_FEATURE_ORDER
name a series fills, or None for an AUXILIARY silver series that is not (yet) in
the 32-slot quant block. Import-time guard: any non-None quant_slot must be a
real canonical slot (promotion of an auxiliary series to the spine is a deliberate
encoder-version bump — out of scope here).

NOTE: the resconst category/data-type codes are pinned here as the contract; they
must be confirmed against the live Census `eits/resconst` dataset before a real
ingest (not run in this PR — fixtures only).
"""

from __future__ import annotations

from typing import Any

from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER

CONNECTOR = "census"

# series_key -> contract. scale converts Census thousands-SAAR → millions to match
# the canonical housing_starts_saar scale (~1.45). value None when missing.
CENSUS_SERIES: dict[str, dict[str, Any]] = {
    "housing_starts_saar": {
        "dataset": "resconst", "category_code": "STARTS", "data_type_code": "TOTAL",
        "seasonally_adj": "yes", "cadence": "monthly", "unit": "millions_saar",
        "scale": 0.001, "quant_slot": "housing_starts_saar",
        "note": "New residential construction — housing starts, total, SAAR.",
    },
    "housing_permits_saar": {
        "dataset": "resconst", "category_code": "PERMITS", "data_type_code": "TOTAL",
        "seasonally_adj": "yes", "cadence": "monthly", "unit": "millions_saar",
        "scale": 0.001, "quant_slot": None,
        "note": "Building permits, total, SAAR. AUXILIARY silver series — not a "
                "QUANT_FEATURE_ORDER slot; promoting it to the spine is an explicit "
                "encoder-version bump (deferred).",
    },
}


def registered_series_keys() -> list[str]:
    return list(CENSUS_SERIES.keys())


def get_series(series_key: str) -> dict[str, Any] | None:
    return CENSUS_SERIES.get(series_key)


# Guard: any non-None quant_slot must be a canonical slot (mirrors the A1 registry).
_bad = [k for k, m in CENSUS_SERIES.items() if m.get("quant_slot") is not None and m["quant_slot"] not in QUANT_FEATURE_ORDER]
assert not _bad, f"CENSUS_SERIES quant_slot must be a canonical QUANT_FEATURE_ORDER name; bad: {_bad}"
