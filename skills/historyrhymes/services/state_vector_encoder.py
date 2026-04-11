"""State vector encoder — builds the 256-dim vector for History Rhymes.

Per PLAN.md Section 2, the Phase 1 encoder is deterministic concatenation of
two L2-normalized halves:

    quant_block (128-dim, from z-scored FRED/CoinGecko/VIX features)
                    ||
    text_embedding (128-dim, from OpenAI text-embedding-3-large with MRL truncation)

The autoencoder upgrade path is gated on ≥500 daily state vectors existing
in wss_signal_state_vector. Until then, this function is the canonical path.
Swap the implementation behind `encode_state_vector()` when the threshold is hit.

TODO(history-rhymes): Replace with trained autoencoder once ≥500 daily state
vectors exist in wss_signal_state_vector. Do not change the function signature —
downstream callers (06_state_vector.py, 10_detect_non_events.py, backend service)
depend on the list[float] return type.
"""

from __future__ import annotations

import math
import os
from typing import Any

# Canonical feature ordering for the quant block. The ordering is load-bearing:
# it determines which slot in the 128-dim block each signal lives in, which
# determines what vector-space "direction" each signal contributes to.
# Changing this ordering invalidates every stored episode_embedding — the
# model_version column in episode_embeddings captures this.
QUANT_FEATURE_ORDER: list[str] = [
    # Yield curve + rates
    "yield_curve_10y2y",
    "fed_funds_rate",
    "term_premium",
    # Inflation
    "cpi_yoy",
    "pce_yoy",
    # Labor
    "initial_claims",
    "unemployment_rate",
    "nonfarm_payrolls_3mo",
    # Housing
    "housing_starts_saar",
    "case_shiller_yoy",
    "mortgage_rate_30y",
    # Credit
    "hy_credit_spread",
    "ig_credit_spread",
    "libor_ois_spread",
    # Volatility
    "vix_spot",
    "vix_term_structure",
    "move_index",
    # Equity
    "sp500_return_1m",
    "sp500_return_3m",
    "sp500_drawdown_60d",
    # Crypto
    "btc_price_usd",
    "btc_return_1m",
    "btc_mvrv_zscore",
    "crypto_fear_greed",
    "btc_dominance",
    "perp_funding_rate",
    # Macro uncertainty (Section 5.1 — EPU additions)
    "epu_us_daily",
    "epu_world_weekly",
    # Behavioral / positioning
    "aaii_bull_bear_spread",
    "put_call_ratio",
    "margin_debt_yoy",
    # Hoyt cycle (Section 5.3 — derived signal)
    "hoyt_cycle_position",
]

# The quant block is padded to 128 even though we only have ~32 features today.
# Extra slots are zero-filled. When we add new features, they go at the NEXT
# empty slot and the model_version gets bumped.
QUANT_BLOCK_DIM = 128
TEXT_BLOCK_DIM = 128
STATE_VECTOR_DIM = QUANT_BLOCK_DIM + TEXT_BLOCK_DIM  # 256


def _pad_or_truncate(feature_dict: dict[str, float | None], target_dim: int) -> list[float]:
    """Project a sparse feature dict into a fixed-length dense vector.

    Uses QUANT_FEATURE_ORDER for slot assignment. NaN/None → 0.0.
    Pads with zeros to target_dim. Truncates if more features than slots
    (shouldn't happen unless the feature list grows beyond 128).
    """
    vec: list[float] = []
    for name in QUANT_FEATURE_ORDER[:target_dim]:
        val = feature_dict.get(name)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            vec.append(0.0)
        else:
            vec.append(float(val))
    # Pad the rest with zeros
    while len(vec) < target_dim:
        vec.append(0.0)
    return vec[:target_dim]


def _l2_normalize(vec: list[float]) -> list[float]:
    """L2-normalize a vector in place and return it. Zero-vectors return unchanged."""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-12:
        return vec
    return [x / norm for x in vec]


def _openai_embed(text: str, dimensions: int = TEXT_BLOCK_DIM) -> list[float]:
    """Call OpenAI text-embedding-3-large with MRL truncation.

    Returns a `dimensions`-length list of floats. On empty text or API failure,
    returns a zero vector — the concatenation is still valid, just uninformative
    on the text half.
    """
    if not text or not text.strip():
        return [0.0] * dimensions

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Fail-soft: no key → zero text half. Quant half still contributes.
        return [0.0] * dimensions

    try:
        import openai  # type: ignore[import-not-found]
    except ImportError:
        return [0.0] * dimensions

    try:
        client = openai.OpenAI(api_key=api_key)
        resp = client.embeddings.create(
            model="text-embedding-3-large",
            input=text,
            dimensions=dimensions,  # MRL: truncate to dimensions at server side
        )
        return list(resp.data[0].embedding)
    except Exception:
        return [0.0] * dimensions


def encode_state_vector(
    quant_features: dict[str, float | None],
    narrative_text: str,
) -> list[float]:
    """Build the 256-dim History Rhymes state vector.

    Deterministic concatenation of L2(quant_128) || L2(text_128). Both halves
    are normalized independently before concatenation so cosine distance in the
    combined space is a weighted average of the two subspace distances.

    Pure function (modulo the OpenAI call for the text half). Same inputs →
    same output. Safe to call from backtests for historical dates.

    See skills/historyrhymes/PLAN.md Section 2 for the reasoning behind
    concatenation-vs-PCA-vs-autoencoder. The autoencoder upgrade path is gated
    on ≥500 daily state vectors in wss_signal_state_vector — track progress
    via `SELECT COUNT(*) FROM wss_signal_state_vector`.
    """
    quant_vec = _pad_or_truncate(quant_features, QUANT_BLOCK_DIM)
    quant_vec = _l2_normalize(quant_vec)

    text_vec = _openai_embed(narrative_text, dimensions=TEXT_BLOCK_DIM)
    text_vec = _l2_normalize(text_vec)

    combined = quant_vec + text_vec
    assert len(combined) == STATE_VECTOR_DIM, (
        f"state vector dim mismatch: expected {STATE_VECTOR_DIM}, got {len(combined)}"
    )
    return combined


def current_modality_flags(as_of_quant: dict[str, Any]) -> dict[str, Any]:
    """Return the modality-present flags consumed by apply_structural_era_discount.

    Returns a dict with keys vix_z, hy_oas_z, btc_z, perp_funding_z. Each value
    is the raw feature if present and non-zero, else None. The era discount
    only triggers for modalities that return non-None from this function.
    """
    def _non_null_or_none(val: Any) -> Any:
        if val is None:
            return None
        if isinstance(val, float) and (math.isnan(val) or val == 0.0):
            return None
        return val

    return {
        "vix_z":          _non_null_or_none(as_of_quant.get("vix_spot")),
        "hy_oas_z":       _non_null_or_none(as_of_quant.get("hy_credit_spread")),
        "btc_z":          _non_null_or_none(as_of_quant.get("btc_price_usd")),
        "perp_funding_z": _non_null_or_none(as_of_quant.get("perp_funding_rate")),
    }
