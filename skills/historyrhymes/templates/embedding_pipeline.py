# Template: historyrhymes_embedding_pipeline
# Databricks notebook source
# =============================================================================
# Episode Embedding Pipeline
# Generates 256-dim state vectors for analog matching via pgvector
# =============================================================================

import mlflow
import json
import numpy as np
from datetime import datetime

# --- Config ---
EXPERIMENT_ID = "3740651530987773"
CATALOG = "novendor_1"
SCHEMA = "historyrhymes"
EMBEDDING_MODEL = "text-embedding-3-large"
TARGET_DIM = 256
QUANT_DIM = 64
TEXT_DIM = 128

mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

# --- Embedding Generation ---

def generate_text_embedding(text: str, api_key: str) -> list:
    """Generate text embedding via OpenAI API with MRL truncation."""
    import urllib.request

    body = json.dumps({
        "input": text,
        "model": EMBEDDING_MODEL,
        "dimensions": TEXT_DIM  # MRL truncation
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    return result["data"][0]["embedding"]


def build_quantitative_vector(signals: dict) -> np.ndarray:
    """
    Build 64-dim quantitative feature vector from episode signals.
    All features z-score normalized against rolling 2-year window.

    Signal groups (8 features each = 64 total):
    1. Equity returns & volatility (8)
    2. Rates & credit (8)
    3. Macro indicators (8)
    4. Crypto metrics (8)
    5. Real estate indicators (8)
    6. Behavioral / sentiment (8)
    7. Positioning (8)
    8. Cross-asset correlations (8)
    """
    # Map signal dict values to fixed positions
    # Missing values → 0.0 (neutral)
    feature_map = [
        # Group 1: Equity
        signals.get("sp500_return_1m", 0),
        signals.get("sp500_return_3m", 0),
        signals.get("sp500_return_12m", 0),
        signals.get("vix_level", 0),
        signals.get("vix_percentile", 0),
        signals.get("sp500_vol_20d", 0),
        signals.get("sp500_momentum_score", 0),
        signals.get("equity_breadth", 0),

        # Group 2: Rates & Credit
        signals.get("yield_curve_10y2y", 0),
        signals.get("fed_funds_rate", 0),
        signals.get("credit_spread_hy", 0),
        signals.get("credit_spread_ig", 0),
        signals.get("real_rate_10y", 0),
        signals.get("ted_spread", 0),
        signals.get("yield_curve_slope", 0),
        signals.get("yield_curve_curvature", 0),

        # Group 3: Macro
        signals.get("cpi_yoy", 0),
        signals.get("pmi_manufacturing", 0),
        signals.get("unemployment_rate", 0),
        signals.get("gdp_growth_qoq", 0),
        signals.get("m2_growth_yoy", 0),
        signals.get("consumer_confidence", 0),
        signals.get("industrial_production", 0),
        signals.get("retail_sales_yoy", 0),

        # Group 4: Crypto
        signals.get("btc_return_1m", 0),
        signals.get("btc_mvrv_zscore", 0),
        signals.get("crypto_fear_greed", 0),
        signals.get("btc_dominance", 0),
        signals.get("eth_return_1m", 0),
        signals.get("total_crypto_mcap_change", 0),
        signals.get("btc_funding_rate", 0),
        signals.get("stablecoin_supply_change", 0),

        # Group 5: Real Estate
        signals.get("case_shiller_yoy", 0),
        signals.get("housing_starts_saar", 0),
        signals.get("mortgage_rate_30y", 0),
        signals.get("cmbs_delinquency_rate", 0),
        signals.get("office_vacancy_rate", 0),
        signals.get("reit_return_1m", 0),
        signals.get("cap_rate_spread", 0),
        signals.get("construction_spending_yoy", 0),

        # Group 6: Behavioral
        signals.get("aaii_bull_pct", 0),
        signals.get("aaii_bear_pct", 0),
        signals.get("put_call_ratio", 0),
        signals.get("margin_debt_yoy", 0),
        signals.get("insider_buy_sell_ratio", 0),
        signals.get("ipo_volume", 0),
        signals.get("google_trends_recession", 0),
        signals.get("fear_greed_index", 0),

        # Group 7: Positioning
        signals.get("cot_net_speculative", 0),
        signals.get("short_interest_ratio", 0),
        signals.get("etf_flow_equity", 0),
        signals.get("etf_flow_bond", 0),
        signals.get("options_gamma_exposure", 0),
        signals.get("dark_pool_ratio", 0),
        signals.get("fund_flow_equity", 0),
        signals.get("leverage_ratio", 0),

        # Group 8: Cross-Asset
        signals.get("btc_spx_correlation", 0),
        signals.get("gold_dxy_correlation", 0),
        signals.get("stock_bond_correlation", 0),
        signals.get("em_dm_spread", 0),
        signals.get("oil_return_1m", 0),
        signals.get("dxy_level", 0),
        signals.get("gold_return_1m", 0),
        signals.get("vix_vxn_ratio", 0),
    ]

    return np.array(feature_map[:QUANT_DIM], dtype=np.float32)


def build_narrative_text(episode: dict) -> str:
    """Combine episode narrative fields into embedding input text."""
    parts = [
        episode.get("macro_conditions_entering", ""),
        episode.get("catalyst_trigger", ""),
        episode.get("narrative_arc", ""),
        episode.get("modern_analog_thesis", ""),
        episode.get("recovery_pattern", ""),
    ]
    return " ".join(p for p in parts if p)


def combine_to_state_vector(quant_vector: np.ndarray, text_embedding: list) -> np.ndarray:
    """
    Combine quantitative (64-dim) and text (128-dim) into 256-dim.

    For initial implementation: simple concatenation + padding to 256.
    TODO: Replace with trained autoencoder once we have enough historical vectors.
    """
    text_arr = np.array(text_embedding, dtype=np.float32)

    # Concatenate: 64 + 128 = 192
    combined = np.concatenate([quant_vector, text_arr])

    # Pad to 256 (or truncate if autoencoder reduces)
    if len(combined) < TARGET_DIM:
        combined = np.pad(combined, (0, TARGET_DIM - len(combined)))
    elif len(combined) > TARGET_DIM:
        combined = combined[:TARGET_DIM]

    # L2 normalize
    norm = np.linalg.norm(combined)
    if norm > 0:
        combined = combined / norm

    return combined


# --- Main Pipeline ---
# Uncomment and configure when running in Databricks:

# with mlflow.start_run(run_name=f"embedding_pipeline_{datetime.now().strftime('%Y-%m-%d')}"):
#     mlflow.log_param("embedding_model", EMBEDDING_MODEL)
#     mlflow.log_param("quant_dim", QUANT_DIM)
#     mlflow.log_param("text_dim", TEXT_DIM)
#     mlflow.log_param("target_dim", TARGET_DIM)
#
#     # Load episodes from Supabase (via API or direct connection)
#     # For each episode:
#     #   1. Build quantitative vector from episode_signals
#     #   2. Build narrative text from episode fields
#     #   3. Generate text embedding
#     #   4. Combine to 256-dim state vector
#     #   5. Store in episode_embeddings
#
#     mlflow.log_metric("episodes_embedded", episode_count)
