"""DefiLlama series contract — total stablecoin supply + observed growth windows.

None of these are QUANT_FEATURE_ORDER slots (stablecoin supply is not in the
32-slot quant block), so every entry is AUXILIARY (`quant_slot=None`). No
spine-contract change. Growth is computed from observed supply history only;
insufficient history fails closed (never a fabricated trend).
"""

from __future__ import annotations

import re
from typing import Any

from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER

CONNECTOR = "defillama"
_ID_RE = re.compile(r"^[a-z0-9_]+$")

DEFILLAMA_SERIES: dict[str, dict[str, Any]] = {
    "stablecoin_supply_usd": {
        "kind": "level", "cadence": "daily", "unit": "usd", "quant_slot": None,
        "source_available": True,
        "note": "Total stablecoin circulating supply (DefiLlama). Crypto-liquidity PROXY, "
                "NOT a market-liquidity measure.",
    },
    "stablecoin_supply_growth_7d": {
        "kind": "growth", "window_days": 7, "cadence": "daily", "unit": "ratio",
        "quant_slot": None, "source_available": True,
        "note": "7-day change in total stablecoin supply; needs ≥8 observed daily points.",
    },
    "stablecoin_supply_growth_30d": {
        "kind": "growth", "window_days": 30, "cadence": "daily", "unit": "ratio",
        "quant_slot": None, "source_available": True,
        "note": "30-day change in total stablecoin supply; needs ≥31 observed daily points.",
    },
}


def registered_series_keys() -> list[str]:
    return list(DEFILLAMA_SERIES.keys())


def get_series(series_key: str) -> dict[str, Any] | None:
    return DEFILLAMA_SERIES.get(series_key)


for _k, _m in DEFILLAMA_SERIES.items():
    assert _ID_RE.match(_k), f"DefiLlama series key not URL-safe: {_k}"
_bad = [k for k, m in DEFILLAMA_SERIES.items() if m["quant_slot"] is not None and m["quant_slot"] not in QUANT_FEATURE_ORDER]
assert not _bad
