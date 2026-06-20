"""VIX series contract.

`vix_spot` is sourced from FRED VIXCLS (CBOE spot VIX). `vix_term_structure` is a
real canonical slot but has NO source wired here — spot VIX is not term structure,
which needs a VIX futures curve. It is reported unavailable
(`term_structure_source_not_configured`); contango/backwardation is NEVER computed
from spot alone. MOVE / rate-vol is omitted (no confirmed source in B4).

Guard: any non-None quant_slot must be a real QUANT_FEATURE_ORDER slot.
"""

from __future__ import annotations

from typing import Any

from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER

CONNECTOR = "vix"

VIX_SERIES: dict[str, dict[str, Any]] = {
    "vix_spot": {
        "fred_series_id": "VIXCLS", "cadence": "daily", "unit": "index",
        "quant_slot": "vix_spot", "source_available": True,
        "note": "CBOE VIX spot via FRED VIXCLS.",
    },
    "vix_term_structure": {
        "fred_series_id": None, "cadence": "daily", "unit": "ratio",
        "quant_slot": "vix_term_structure", "source_available": False,
        "null_reason": "term_structure_source_not_configured",
        "note": "Spot VIX is NOT term structure; a VIX futures curve is required. "
                "Do not compute contango/backwardation from spot alone.",
    },
}


def registered_series_keys() -> list[str]:
    return list(VIX_SERIES.keys())


def get_series(series_key: str) -> dict[str, Any] | None:
    return VIX_SERIES.get(series_key)


_bad = [k for k, m in VIX_SERIES.items() if m.get("quant_slot") is not None and m["quant_slot"] not in QUANT_FEATURE_ORDER]
assert not _bad, f"VIX_SERIES quant_slot must be a canonical QUANT_FEATURE_ORDER name; bad: {_bad}"
