"""FOMC text series contract.

Text series, so `quant_slot` is always None (text is never a QUANT_FEATURE_ORDER
slot). `fomc_statement` is sourced; `fomc_minutes` is an explicit future series
(source_available=False → reported unavailable, never fetched). Keys are URL-safe.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER

CONNECTOR = "fomc_text"
_ID_RE = re.compile(r"^[a-z0-9_]+$")

FOMC_TEXT_SERIES: dict[str, dict[str, Any]] = {
    "fomc_statement": {
        "canonical_name": "fomc_statement_text", "cadence": "event",
        "source": "federalreserve.gov", "text_type": "statement",
        "source_available": True, "quant_slot": None,
        "note": "FOMC monetary-policy statement text. Stored in silver provenance "
                "(value is NULL for text); embedding is a separate deferred step.",
    },
    "fomc_minutes": {
        "canonical_name": "fomc_minutes_text", "cadence": "event",
        "source": "federalreserve.gov", "text_type": "minutes",
        "source_available": False, "null_reason": "minutes_source_not_configured",
        "quant_slot": None,
        "note": "FOMC minutes (released ~3 weeks after the decision). Future series; "
                "no parser wired in B5 → reported unavailable.",
    },
}


def registered_series_keys() -> list[str]:
    return list(FOMC_TEXT_SERIES.keys())


def get_series(series_key: str) -> dict[str, Any] | None:
    return FOMC_TEXT_SERIES.get(series_key)


# Guards: keys URL-safe; text series never claim a quant slot.
for _k, _m in FOMC_TEXT_SERIES.items():
    assert _ID_RE.match(_k), f"FOMC series key not URL-safe: {_k}"
    assert _m["quant_slot"] is None, f"FOMC text series must not claim a quant slot: {_k}"
_bad = [k for k, m in FOMC_TEXT_SERIES.items() if m["quant_slot"] is not None and m["quant_slot"] not in QUANT_FEATURE_ORDER]
assert not _bad
