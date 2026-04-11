"""Structural era discount — prevents 1970s-vs-2022 false equivalence.

An episode from 1973 has zero crypto signal, zero VIX (VIX starts 1990), zero
perpetual futures funding rate. When today's state vector includes those
modalities, naive cosine similarity will still rank old episodes high — but
the comparison is meaningless because the missing modalities are zero by
construction on the old side.

This module applies a multiplicative discount to the Rhyme Score for episodes
from eras predating critical signal modalities present in today's state.
Compounded, floored at 0.50 to prevent collapse to noise.

See PLAN.md Section 5.2. Order is fixed: era discount is applied AFTER the
base Rhyme Score (cosine + DTW + categorical) and BEFORE Hoyt amplification.

This is the SINGLE source of truth for era-discount math. Both the Databricks
notebooks and the backend FastAPI service import from here.
"""

from __future__ import annotations

from typing import Any

# Floor — the compounded discount can never drop below this.
ERA_DISCOUNT_FLOOR: float = 0.50

# Rules: list of (year_threshold, modality_key, multiplier).
# If episode.start_year < year_threshold AND current_state[modality_key] is not None,
# multiply the discount by `multiplier`.
#
# Thresholds anchor to the first year the corresponding signal series became
# available/meaningful:
#   - VIX: CBOE launched 1990 (VXO in 1986, VIX formula updated 1990)
#   - HY OAS: Merrill Lynch started tracking high-yield 1996
#   - BTC: Bitcoin genesis block 2009-01-03
#   - Perp funding rates: BitMEX launched perpetual futures mid-2016; mainstream 2018
ERA_DISCOUNT_RULES: list[tuple[int, str, float]] = [
    (1990, "vix_z",          0.85),
    (1996, "hy_oas_z",       0.90),
    (2009, "btc_z",          0.80),
    (2018, "perp_funding_z", 0.90),
]


def apply_structural_era_discount(
    rhyme_score: float,
    episode_start_year: int,
    current_state: dict[str, Any],
) -> float:
    """Return rhyme_score multiplied by the compounded era discount.

    current_state is a dict of modality keys — only modalities that are non-None
    in today's state vector trigger their corresponding discount rule.

    Example: comparing a 1973 episode against a state with VIX, HY, BTC, and
    perp funding all present:
        discount = 0.85 * 0.90 * 0.80 * 0.90 = 0.5508
        rhyme_score * max(discount, 0.50) = rhyme_score * 0.5508
    """
    discount = 1.0
    for year_threshold, modality_key, multiplier in ERA_DISCOUNT_RULES:
        if episode_start_year < year_threshold and current_state.get(modality_key) is not None:
            discount *= multiplier
    return rhyme_score * max(discount, ERA_DISCOUNT_FLOOR)
