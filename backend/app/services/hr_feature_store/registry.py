"""Static feature registry — 20 families represented, 6 signature features real.

Pure data. `id` matches ^[a-z0-9_]+$; any non-null `quant_slot` MUST exist in
`contract.QUANT_FEATURE_ORDER` (the encoder-promotion guard). Engineered features
have `quant_slot=None` until promoted with a model_obs_version bump.
"""

from __future__ import annotations

from typing import Any

_NO_BLIND = "no_blind_imputation:carry_forward_max_2d_else_null"


def _f(**kw: Any) -> dict[str, Any]:
    kw.setdefault("quant_slot", None)
    kw.setdefault("availability_at_prediction_time", True)
    kw.setdefault("leakage_risk", "low")
    kw.setdefault("imputation_policy", _NO_BLIND)
    kw.setdefault("cadence", "daily")
    return kw


FEATURE_REGISTRY: list[dict[str, Any]] = [
    _f(id="vix_spot_level", name="VIX Level", family="level",
       definition="Current observed VIX spot level.",
       formula="vix_spot[t]", source_dependencies=["vix_spot"], quant_slot="vix_spot",
       models_using=["logistic_regression", "random_forest", "svm", "knn", "pca"],
       demo_explanation="A raw level reading — useful, but says nothing about whether the regime is changing."),
    _f(id="yield_curve_10y2y_velocity_30d", name="Yield Curve Velocity, 30d", family="velocity",
       definition="30-day change in the 10y-2y Treasury spread.",
       formula="yield_curve_10y2y[t] - yield_curve_10y2y[t-30]",
       source_dependencies=["yield_curve_10y2y"],
       models_using=["linear_regression", "logistic_regression", "random_forest", "svm", "knn", "pca"],
       demo_explanation="Level says where we are; velocity says whether the regime is turning."),
    _f(id="yield_curve_10y2y_acceleration_30d", name="Yield Curve Acceleration, 30d", family="acceleration",
       definition="30-day change in the 30-day yield-curve velocity (2nd derivative).",
       formula="velocity_30d[t] - velocity_30d[t-30]",
       source_dependencies=["yield_curve_10y2y"],
       models_using=["random_forest", "logistic_regression"],
       demo_explanation="Acceleration catches sudden regime transitions a velocity reading lags."),
    _f(id="vix_spot_mean_20d", name="VIX 20d Mean", family="rolling",
       definition="20-day rolling mean of VIX spot.",
       formula="mean(vix_spot[t-19:t])", source_dependencies=["vix_spot"],
       models_using=["random_forest", "svm"],
       demo_explanation="Rolling windows turn noisy point-in-time data into a usable state estimate."),
    _f(id="vix_percentile_252d", name="VIX 1y Percentile", family="percentile_regime",
       definition="Trailing 1-year percentile rank of VIX spot.",
       formula="pct_rank(vix_spot, window=252)", source_dependencies=["vix_spot"],
       models_using=["pca", "kmeans", "svm", "random_forest"],
       demo_explanation="A value is not high or low in isolation — only relative to its own history."),
    _f(id="credit_complacency_gap", name="Credit Complacency Gap", family="cross_signal_divergence",
       definition="HY credit-spread z minus composite macro-stress z.",
       formula="z2y(hy_credit_spread) - macro_stress_z",
       source_dependencies=["hy_credit_spread", "vix_spot", "initial_claims", "yield_curve_10y2y"],
       models_using=["logistic_regression", "random_forest"],
       demo_explanation="Most useful signals are disagreements between columns, not columns. Credit can look calm while fundamentals weaken."),
    _f(id="macro_stress_score", name="Macro Stress Score", family="composite_stress",
       definition="Composite of yield-curve, volatility, and labor stress.",
       formula="mean(z2y(vix_spot), z2y(initial_claims), -z2y(yield_curve_10y2y))",
       source_dependencies=["vix_spot", "initial_claims", "yield_curve_10y2y"],
       models_using=["logistic_regression", "random_forest", "pca"],
       demo_explanation="A decomposable composite — the weighted ingredients are shown, not hidden."),
    _f(id="vix_x_credit_spread", name="VIX × Credit Spread", family="interaction",
       definition="Interaction of standardized VIX and HY credit spread.",
       formula="z2y(vix_spot) * z2y(hy_credit_spread)",
       source_dependencies=["vix_spot", "hy_credit_spread"],
       models_using=["linear_regression", "logistic_regression"],
       demo_explanation="Interaction terms let simple models see conditional behavior."),
    _f(id="yield_curve_10y2y_lag_30d", name="Yield Curve, 30d Lag", family="lag",
       definition="The 10y-2y spread 30 business days ago.",
       formula="yield_curve_10y2y[t-30]", source_dependencies=["yield_curve_10y2y"],
       models_using=["random_forest"],
       demo_explanation="Lags show whether the model responds to today's value or recent memory."),
    _f(id="btc_mvrv_missing_flag", name="BTC MVRV Missing Flag", family="missingness_as_signal",
       definition="1 when btc_mvrv_zscore is missing (often during stress provider outages).",
       formula="is_null(btc_mvrv_zscore)", source_dependencies=["btc_mvrv_zscore"],
       models_using=["random_forest", "logistic_regression"],
       demo_explanation="In real pipelines missing data is often not random — absence is itself a signal."),
    _f(id="housing_starts_freshness_score", name="Housing Starts Freshness", family="freshness",
       definition="Freshness weight from staleness vs the monthly release cadence.",
       formula="decay(staleness_seconds, cadence=monthly)", source_dependencies=["housing_starts_saar"],
       cadence="monthly",
       models_using=["linear_regression"],
       demo_explanation="A stale feature is not neutral — output is only as current as its slowest important feature."),
    _f(id="resolved_trap_label", name="Resolved Trap Label (LEAKY)", family="leakage_guard",
       definition="Whether the setup resolved as a trap — known only AFTER the prediction window.",
       formula="outcome label observed at t+30 (NOT available at t)",
       source_dependencies=["forward_return_30d"],
       availability_at_prediction_time=False, leakage_risk="high",
       imputation_policy="forbidden:label_leakage",
       models_using=[],
       demo_explanation="If a feature was not knowable at prediction time, the score is invalid. Readiness is forced to 0."),
    _f(id="fomc_hawkishness_embedding", name="FOMC Hawkishness Embedding", family="narrative_embedding",
       definition="Embedding-derived hawkishness from FOMC text (synthetic proxy in Phase A).",
       formula="z2y(epu_us_daily) [Phase A proxy; real text embedding in Phase B]",
       source_dependencies=["epu_us_daily"], cadence="event",
       leakage_risk="medium",
       models_using=["naive_bayes"],
       demo_explanation="Fed/SEC/news text embedded into narrative themes and semantic-shift vectors."),
    _f(id="panic_language_velocity", name="Panic Language Velocity", family="narrative_velocity",
       definition="Speed of panic-narrative adoption (proxy: 7d velocity of policy-uncertainty).",
       formula="z2y(velocity(epu_us_daily, 7))", source_dependencies=["epu_us_daily"],
       leakage_risk="medium",
       models_using=["naive_bayes", "logistic_regression"],
       demo_explanation="The level of a narrative matters; the speed of its adoption matters more."),
    _f(id="narrative_flow_mismatch", name="Narrative-Flow Mismatch", family="flow_vs_narrative_mismatch",
       definition="Panic-narrative velocity z minus capital-flow-stress z.",
       formula="z2y(panic_narrative_velocity) - z2y(capital_flow_stress)",
       source_dependencies=["epu_us_daily", "sp500_drawdown_60d"],
       models_using=["naive_bayes", "logistic_regression"],
       demo_explanation="Narratives are cheap; flows are harder to fake. This is how the trap detector avoids loud-but-unconfirmed stories."),
    _f(id="cross_asset_crowding_score", name="Cross-Asset Crowding", family="crowding_consensus",
       definition="Blend of sentiment + positioning extremes (AAII, put/call).",
       formula="z2y(aaii_bull_bear_spread) + z2y(put_call_ratio)",
       source_dependencies=["aaii_bull_bear_spread", "put_call_ratio"],
       models_using=["logistic_regression", "knn"],
       demo_explanation="When every signal agrees, ask whether the trade is crowded."),
    _f(id="non_event_counterexample_score", name="Non-Event Counterexample", family="non_event_counterexample",
       definition="Similarity to benign non-event analogs minus similarity to crisis analogs.",
       formula="nearest_non_event_similarity - nearest_crisis_similarity",
       source_dependencies=["vix_spot", "hy_credit_spread", "yield_curve_10y2y", "sp500_drawdown_60d", "move_index"],
       models_using=["knn", "random_forest"],
       demo_explanation="Not only 'what crash does this look like?' but 'how many times did this setup NOT break?'"),
    _f(id="btc_mvrv_drift_psi", name="BTC MVRV Drift (PSI)", family="distribution_drift",
       definition="Out-of-training-range flag for btc_mvrv_zscore (PSI deepened in Phase C).",
       formula="abs(z2y(btc_mvrv_zscore)) > 3", source_dependencies=["btc_mvrv_zscore"],
       models_using=["logistic_regression", "svm"],
       demo_explanation="A feature outside its training distribution means model confidence should be treated as degraded."),
    _f(id="model_readiness_score", name="Model Readiness Score", family="model_readiness",
       definition="freshness × completeness × lineage × leakage_safety × drift_stability.",
       formula="product(freshness, completeness, lineage, leakage_safety, drift_stability); leakage_high => 0",
       source_dependencies=["*"],
       models_using=["*"],
       demo_explanation="The data-engineering layer is part of the model. Shows the downgrade reason when score < 0.80."),
    _f(id="liquidity_fragmentation_score", name="Liquidity Fragmentation", family="composite_catch_all",
       definition="Crypto-liquidity z minus TradFi-liquidity z (synthetic proxy in Phase A).",
       formula="z2y(btc_dominance) - (-z2y(libor_ois_spread))",
       source_dependencies=["btc_dominance", "libor_ois_spread"],
       models_using=["random_forest", "kmeans"],
       demo_explanation="Positive = crypto liquidity expanding faster than TradFi. Real stablecoin/CB-liquidity inputs arrive with the DefiLlama connector."),
]

FEATURE_BY_ID: dict[str, dict[str, Any]] = {f["id"]: f for f in FEATURE_REGISTRY}


def get_feature(feature_id: str) -> dict[str, Any] | None:
    return FEATURE_BY_ID.get(feature_id)
