# ML Signal Engine — Reference Architecture

Read this file when the market-rotation-engine needs to generate, train, evaluate, or deploy proprietary ML signals. This is the quantitative + qualitative intelligence layer that transforms raw research into predictive features.

---

## CORE PHILOSOPHY

The signal engine is NOT a black-box trading bot. It is a **feature factory** that:

1. Ingests raw data from Phase 1 research (prices, fundamentals, on-chain, text, flow)
2. Engineers features across multiple modalities (quantitative, textual, behavioral, structural)
3. Trains lightweight models that produce **scored signals** with confidence intervals
4. Feeds those signals back into the Segment Intelligence Brief as first-class citizens alongside human research
5. Logs every prediction for walk-forward evaluation — no silent failures

The goal is proprietary alpha generation: signals that Bloomberg, CoStar, and CoinGecko do NOT surface because they require combining data across modalities that those platforms silo.

---

## SIGNAL TAXONOMY

Signals are organized into five pillars. Each pillar produces scored outputs on a normalized 0–100 scale with a confidence band.

### Pillar 1: Mathematical Regression Signals

Classical quantitative finance — time series, cross-sectional, and panel regressions.

**1.1 — Momentum Regression**

```python
# Fama-French style cross-sectional momentum with decay estimation
# For each segment's ticker universe:

Features:
  - ret_1m:   trailing 1-month return (skip most recent week to avoid reversal)
  - ret_3m:   trailing 3-month return
  - ret_6m:   trailing 6-month return (classic Jegadeesh-Titman)
  - ret_12m:  trailing 12-month return (skip most recent month)
  - vol_adj:  return / realized_vol (risk-adjusted momentum)
  - rel_str:  return vs sector ETF return (idiosyncratic momentum)
  - breadth:  % of segment tickers above 50 DMA (segment-level health)

Model: OLS regression → predict forward 1-month return
       Also: quantile regression (10th, 50th, 90th) for tail risk estimation

Output:
  - momentum_score: 0-100 (percentile rank within universe)
  - momentum_direction: ACCELERATING | STABLE | DECELERATING | REVERSING
  - confidence_interval: [lower, upper] based on regression R² and residual dist
  - regime_context: momentum behaves differently in each regime — adjust interpretation
```

**1.2 — Mean Reversion Regression**

```python
# Bollinger-style z-score regression with adaptive lookback

Features:
  - zscore_20d:  (price - SMA20) / std20
  - zscore_50d:  (price - SMA50) / std50
  - rsi_14:      relative strength index (0-100)
  - pct_from_high: distance from 52-week high
  - pct_from_low:  distance from 52-week low
  - vol_compression: realized_vol_5d / realized_vol_20d (squeeze detection)
  - funding_rate:  for crypto — extreme funding = reversion signal

Model: Logistic regression → P(mean reversion within N days)
       Calibrate N = [5, 10, 20] separately

Output:
  - reversion_probability: 0.0 to 1.0 for each horizon
  - reversion_direction: OVERBOUGHT | NEUTRAL | OVERSOLD
  - signal_strength: weak | moderate | strong (based on z-score extremity)
```

**1.3 — Fundamental Regression (Equities only)**

```python
# Cross-sectional value/quality regression

Features:
  - fwd_pe:         forward P/E ratio
  - ev_ebitda:       EV/EBITDA
  - fcf_yield:       FCF / market cap
  - roic:            return on invested capital
  - revenue_growth:  YoY revenue growth
  - margin_delta:    operating margin change (QoQ)
  - earnings_revision: consensus EPS change (30-day)
  - accruals_ratio:  (net_income - operating_cf) / total_assets (quality signal)
  - insider_buy_ratio: insider buys / (buys + sells) over 90 days

Model: Ridge regression → predict forward 3-month excess return vs SPX
       XGBoost ensemble for non-linear interactions (PE × growth, ROIC × leverage)

Output:
  - fundamental_score: 0-100
  - value_growth_tilt: DEEP_VALUE | VALUE | GARP | GROWTH | HYPER_GROWTH
  - quality_flag: HIGH | MEDIUM | LOW (based on accruals + ROIC + margin stability)
  - earnings_momentum: ACCELERATING | STABLE | DECELERATING
```

**1.4 — Volatility Surface Regression (Derivatives)**

```python
# Model the vol surface and detect mispricings

Features:
  - iv_rank:          current IV percentile vs 1-year range
  - iv_percentile:    % of days IV was lower than current
  - rv_iv_spread:     realized vol - implied vol (vol risk premium)
  - term_slope:       (IV_3m - IV_1m) / IV_1m (term structure steepness)
  - skew_25d:         25-delta put IV - 25-delta call IV
  - skew_change_5d:   5-day change in skew (directional fear shifting)
  - vix_basis:        VIX - VIX3M (near-term fear premium)
  - gex_estimate:     dealer gamma exposure direction (pin risk)

Model: OLS → predict forward realized vol (is IV over/underpricing?)
       Logistic → P(IV crush > 20% within 30 days) for premium selling

Output:
  - vol_regime: COMPRESSED | NORMAL | ELEVATED | EXTREME
  - vol_direction: EXPANDING | STABLE | COMPRESSING
  - premium_opportunity: SELL_PREMIUM | NEUTRAL | BUY_PREMIUM
  - mispricing_score: 0-100 (how far IV is from model-predicted RV)
```

**1.5 — On-Chain Regression (Crypto only)**

```python
# Blockchain-native regression models

Features:
  - nvt_ratio:        network value / transaction volume (crypto P/E)
  - mvrv_zscore:      market value / realized value z-score (over/undervaluation)
  - active_addr_delta: 7-day change in active addresses
  - exchange_netflow:  net CEX inflow (positive = selling pressure)
  - whale_accum:       change in >1000 BTC wallets (or equivalent threshold)
  - stablecoin_supply_delta: 30-day change in aggregate stablecoin mcap
  - funding_rate_avg:  average perp funding across venues
  - oi_mcap_ratio:     open interest / market cap (leverage proxy)
  - tvl_mcap_ratio:    TVL / FDV (for DeFi protocols — capital efficiency)
  - fee_revenue_7d:    trailing 7-day protocol revenue (real usage)

Model: Gradient boosted trees (XGBoost) → predict forward 7-day return quintile
       Separate models for BTC, ETH, alt-L1s, DeFi tokens (different dynamics)

Output:
  - onchain_score: 0-100
  - accumulation_phase: ACCUMULATION | DISTRIBUTION | NEUTRAL
  - leverage_risk: LOW | MODERATE | HIGH | EXTREME
  - usage_trend: GROWING | STABLE | DECLINING
```

---

### Pillar 2: Text Sentiment & Narrative Signals

This is where the proprietary edge compounds. Most quant funds do price-based ML. Very few systematically process the *narrative layer* — earnings calls, crypto governance forums, analyst reports, social velocity — and fuse it with quantitative signals.

**2.1 — Earnings Call NLP**

```python
# Process earnings call transcripts for forward-looking signals

Input: Earnings call transcripts (from SEC EDGAR 8-K or transcript providers)

Feature Extraction Pipeline:
  1. Section segmentation: prepared_remarks vs Q&A
  2. Sentence-level sentiment: VADER polarity + subjectivity
  3. Management tone shift: compare current call sentiment vs prior quarter
  4. Forward guidance language:
     - Extract sentences containing: "expect", "anticipate", "guide", "outlook",
       "confident", "cautious", "uncertain", "headwind", "tailwind"
     - Classify each as: BULLISH | NEUTRAL | BEARISH
     - Weight Q&A higher than prepared remarks (less rehearsed = more signal)
  5. Hedge word frequency: "approximately", "roughly", "potentially", "may",
     "subject to" — increasing hedge words = decreasing confidence
  6. Specificity score: ratio of concrete numbers/dates vs vague qualifiers
  7. Analyst question sentiment: what are analysts worried about?
  8. CEO vs CFO tone divergence: disagreement between officers = risk signal

Model: Ensemble —
  - VADER for sentence-level polarity (fast, no GPU needed)
  - TF-IDF + logistic regression for topic classification
  - Claude API (claude-sonnet-4-20250514) for nuanced interpretation:
    → "Summarize the 3 most important forward-looking statements from this call.
       For each, rate confidence (1-10) and classify as bullish/neutral/bearish.
       Flag any statements where management hedged or contradicted prior guidance."

Output:
  - earnings_sentiment_score: -1.0 to +1.0
  - tone_shift: IMPROVING | STABLE | DETERIORATING (vs prior quarter)
  - guidance_direction: RAISED | MAINTAINED | LOWERED | WITHDRAWN
  - hedge_index: 0.0 to 1.0 (higher = more hedging)
  - key_narratives: [list of extracted forward-looking themes]
  - analyst_concern_topics: [what analysts asked about most]
```

**2.2 — Crypto Governance & Community Sentiment**

```python
# Crypto-native text signals from governance forums, Discord, Twitter/X

Input Sources:
  - Governance proposals (Snapshot, Tally, on-chain votes)
  - Protocol forum discussions (Discourse forums for major DAOs)
  - Twitter/X: high-signal accounts (protocol founders, researchers, VCs)
  - Reddit: protocol-specific subreddits (r/ethereum, r/solana, etc.)

Feature Extraction:
  1. Governance proposal sentiment:
     - Proposal type: PARAMETER_CHANGE | TREASURY_SPEND | PROTOCOL_UPGRADE | TOKEN_CHANGE
     - Vote distribution: FOR / AGAINST / ABSTAIN ratios
     - Quorum reached: yes/no (low turnout = apathy signal)
     - Controversy score: high AGAINST + active forum debate = contentious
  2. Developer sentiment (from forum posts by core contributors):
     - Burnout signals: decreased post frequency, negative tone shift
     - Excitement signals: increased frequency, forward-looking language
     - Internal disagreement: public debates between core devs
  3. Social velocity:
     - Mention count delta (7d vs 30d MA) — acceleration matters more than level
     - Sentiment polarity of mentions (VADER on tweet text)
     - Bot vs organic ratio (accounts < 30 days old, low followers = bot)
     - Influencer alignment: are top-50 CT accounts bullish or bearish?
  4. Narrative tracking:
     - What narrative is the token riding? (AI, DePIN, RWA, memecoin, L2, etc.)
     - Narrative lifecycle stage: EMERGING | PEAK_HYPE | DECLINING | DORMANT
     - Narrative rotation signal: capital flowing to new narrative

Model:
  - VADER + custom crypto lexicon for social sentiment
  - TF-IDF clustering for narrative detection and tracking
  - Claude API for governance proposal interpretation:
    → "Analyze this governance proposal. What is the likely impact on token value?
       Is this a positive sign for protocol health or a red flag?"

Output:
  - community_sentiment_score: -1.0 to +1.0
  - governance_health: STRONG | ADEQUATE | WEAK | DYSFUNCTIONAL
  - social_velocity: SURGING | RISING | STABLE | DECLINING | DEAD
  - narrative_tag: [current dominant narrative]
  - narrative_stage: EMERGING | PEAK_HYPE | DECLINING | DORMANT
  - developer_engagement: ACTIVE | STABLE | DECLINING
```

**2.3 — News & Analyst Sentiment**

```python
# Systematic processing of financial news and analyst commentary

Input Sources:
  - Financial news (via web search: Reuters, Bloomberg, WSJ, FT headlines)
  - Analyst reports (rating changes, price target changes from SEC filings)
  - Regulatory announcements (SEC, CFTC, OCC, Fed speeches)
  - Earnings previews and post-earnings commentary

Feature Extraction:
  1. Headline sentiment:
     - VADER polarity per headline
     - Entity extraction: which tickers/protocols mentioned
     - Event classification: EARNINGS | M&A | REGULATORY | PRODUCT | MACRO | LEGAL
  2. Analyst consensus shift:
     - Rating changes in last 14 days (upgrades vs downgrades)
     - Price target revisions (magnitude + direction)
     - Initiation of coverage (new analyst attention = signal)
     - Consensus dispersion: high spread in targets = uncertainty
  3. Regulatory tone:
     - Fed speech hawkish/dovish scoring
     - SEC enforcement language: "Wells notice", "settlement", "charges"
     - Constructive regulation vs hostile regulation classification
  4. News velocity:
     - Article count per entity (7d vs 30d MA)
     - Is volume increasing ahead of a known catalyst?
     - Unusual news volume without obvious catalyst = investigate

Model:
  - VADER for headline polarity
  - Custom keyword scoring for regulatory tone
  - Claude API for nuanced regulatory/macro interpretation

Output:
  - news_sentiment_score: -1.0 to +1.0
  - analyst_consensus_direction: UPGRADING | STABLE | DOWNGRADING
  - regulatory_risk_direction: IMPROVING | STABLE | WORSENING
  - news_velocity: SURGING | ELEVATED | NORMAL | QUIET
  - event_flags: [list of upcoming events that could move prices]
```

---

### Pillar 3: Behavioral & Structural Signals

These are the "creative data points" — signals derived from market microstructure, participant behavior, and structural patterns that most platforms ignore.

**3.1 — Options Market Behavior**

```python
# What the options market is pricing tells you what informed money expects

Features:
  - put_call_ratio_volume:  daily P/C ratio (extreme readings = contrarian signal)
  - put_call_ratio_oi:      open interest P/C (slower-moving, more structural)
  - skew_25delta:            OTM put premium vs OTM call premium
  - skew_velocity:           5-day rate of change in skew
  - term_structure_slope:    IV curve shape (contango vs backwardation)
  - max_pain_distance:       current price vs max pain (pin risk into expiry)
  - gex_direction:           estimated dealer gamma (positive = suppressed vol)
  - unusual_flow_score:      aggregated unusual activity (volume/OI spike + premium size)
  - smart_money_indicator:   large block trades (>$1M premium) direction

Behavioral Insight:
  - When skew steepens rapidly → informed money buying protection → risk-off signal
  - When GEX is deeply positive → dealers are short gamma → explosive move incoming
  - When put/call ratio hits extremes → contrarian opportunity (fear = bottoms, greed = tops)
  - When max pain clusters near round numbers → pinning behavior into expiry

Output:
  - options_behavior_score: 0-100 (bullish-to-bearish spectrum)
  - informed_flow_direction: BULLISH | NEUTRAL | BEARISH
  - vol_event_probability: P(>2 sigma move within 5 days)
  - pin_risk_level: LOW | MODERATE | HIGH
```

**3.2 — Market Microstructure**

```python
# Order flow and execution quality signals

Features — Equities:
  - dark_pool_percentage:     % of volume executed off-exchange
  - dark_pool_sentiment:      net buy vs sell in dark pools (FINRA ADF)
  - block_trade_direction:    large institutional prints (>10K shares) net direction
  - vwap_deviation:           intraday price vs VWAP (institutional execution benchmark)
  - relative_volume:          current volume / 20-day average volume
  - bid_ask_spread_percentile: current spread vs 90-day range (liquidity signal)
  - trade_size_distribution:  ratio of large trades to small trades (institutional vs retail)

Features — Crypto:
  - cex_order_book_depth:     bid/ask depth within 2% of mid (thin = fragile)
  - cex_vs_dex_volume_ratio:  migration to DEX = decentralization + less price discovery
  - funding_rate_divergence:  when funding diverges across venues = arb opportunity
  - liquidation_clustering:   where are leveraged positions concentrated?
  - whale_transaction_count:  transactions >$1M in 24h
  - exchange_reserve_change:  coins leaving exchanges = accumulation signal

Output:
  - microstructure_score: 0-100
  - institutional_direction: ACCUMULATING | NEUTRAL | DISTRIBUTING
  - liquidity_quality: DEEP | ADEQUATE | THIN | FRAGILE
  - smart_money_alignment: ALIGNED_BULLISH | NEUTRAL | ALIGNED_BEARISH
```

**3.3 — Cross-Asset Correlation Regime**

```python
# Correlation structure reveals regime shifts before prices do

Features:
  - spx_btc_corr_30d:        rolling 30-day correlation (>0.6 = macro regime)
  - spx_bonds_corr_30d:      equity-bond correlation (positive = inflation regime)
  - usd_gold_corr_30d:       dollar-gold relationship (breakdown = crisis signal)
  - sector_dispersion:        cross-sector return dispersion (low = crowded, high = rotational)
  - crypto_dispersion:        alt return dispersion vs BTC (low = BTC dominance, high = alt season)
  - correlation_eigenvalue:   first principal component % of variance (high = one-factor market)
  - tail_dependence:          copula-based tail correlation (extreme co-movement)

Behavioral Insight:
  - When correlations spike to 1.0 → panic regime, everything sells together
  - When sector dispersion rises → stock-picking environment, alpha opportunity
  - When crypto dispersion rises → alt season, rotate from BTC to alts
  - When eigenvalue concentration rises → macro is driving everything, reduce idiosyncratic bets

Output:
  - correlation_regime: DECORRELATED | NORMAL | ELEVATED | CRISIS
  - alpha_opportunity: HIGH | MODERATE | LOW (inverse of correlation)
  - rotation_signal: RISK_ON | NEUTRAL | RISK_OFF
  - regime_stability: STABLE | TRANSITIONING | UNSTABLE
```

**3.4 — Calendar & Seasonality Signals**

```python
# Structural patterns driven by market mechanics, not fundamentals

Features:
  - day_of_week:              encoded (Mondays historically weaker, Fridays options-driven)
  - month_of_year:            January effect, sell-in-May, Santa rally
  - days_to_opex:             proximity to monthly options expiration
  - days_to_fomc:             proximity to Fed decision (vol compression pre-FOMC)
  - quad_witching:            quarterly expiration (massive structural flows)
  - tax_loss_season:          October-December tax-loss selling pressure
  - earnings_season_phase:    EARLY | PEAK | LATE | OFF-SEASON
  - rebalance_proximity:      days to quarter-end (pension, endowment rebalancing)
  - crypto_btc_halving_cycle: days since/until halving (4-year cycle position)
  - crypto_unlock_proximity:  days until major token unlock events

Output:
  - seasonality_bias: BULLISH | NEUTRAL | BEARISH
  - structural_flow_direction: BUY_PRESSURE | NEUTRAL | SELL_PRESSURE
  - vol_calendar_signal: COMPRESSION_EXPECTED | NEUTRAL | EXPANSION_EXPECTED
  - cycle_position: EARLY | MID | LATE | TURN (for crypto 4-year cycle)
```

**3.5 — Alternative Data Signals**

```python
# Creative data points that serve as leading indicators

Features:
  - job_posting_velocity:     hiring = growing (LinkedIn/Indeed scrape by sector)
  - app_download_trends:      for consumer-facing companies (Sensor Tower proxy)
  - web_traffic_trends:       SimilarWeb estimates for relevant companies
  - patent_filing_rate:       USPTO filings by assignee (innovation pipeline)
  - satellite_imagery_proxy:  parking lot fill rates, shipping container counts
                              (available via free satellite APIs for select use cases)
  - congressional_trading:    Congress member trades (STOCK Act filings, 45-day lag)
  - corporate_jet_tracking:   flight patterns of company planes (M&A signal)
  - domain_registration:      new domains with company/product keywords (launch signal)
  - google_trends_velocity:   search interest acceleration (not level — change)

Output:
  - alt_data_composite: 0-100
  - leading_indicator_direction: POSITIVE | NEUTRAL | NEGATIVE
  - confidence: LOW | MODERATE | HIGH (alt data is noisy — be honest)
  - notable_signals: [list of specific alt data findings worth investigating]
```

---

### Pillar 4: Ensemble Signal Fusion

Individual pillars produce scored signals. The fusion layer combines them into a unified prediction with proper uncertainty quantification.

**4.1 — Feature Matrix Construction**

```python
# For each segment rotation, construct a unified feature matrix

import pandas as pd
import numpy as np

def build_feature_matrix(segment_id, run_date):
    """
    Collects outputs from all applicable pillars into a single feature row
    per ticker (or per segment if segment-level analysis).

    Returns: pd.DataFrame with columns:
      - ticker (or segment_id for segment-level)
      - All Pillar 1 scores and sub-features
      - All Pillar 2 sentiment scores
      - All Pillar 3 behavioral scores
      - All Pillar 4 regime/calendar features
      - Metadata: run_date, segment_id, regime_tag
    """

    features = {}

    # Pillar 1: Quantitative
    features['momentum_score'] = compute_momentum_regression(segment_id)
    features['reversion_prob'] = compute_reversion_regression(segment_id)
    features['fundamental_score'] = compute_fundamental_regression(segment_id)  # equities only
    features['vol_mispricing'] = compute_vol_regression(segment_id)            # derivatives
    features['onchain_score'] = compute_onchain_regression(segment_id)         # crypto only

    # Pillar 2: Textual
    features['earnings_sentiment'] = compute_earnings_nlp(segment_id)          # equities
    features['community_sentiment'] = compute_community_nlp(segment_id)        # crypto
    features['news_sentiment'] = compute_news_sentiment(segment_id)
    features['regulatory_risk'] = compute_regulatory_sentiment(segment_id)

    # Pillar 3: Behavioral
    features['options_behavior'] = compute_options_behavior(segment_id)
    features['microstructure'] = compute_microstructure_signals(segment_id)
    features['correlation_regime'] = compute_correlation_regime()
    features['seasonality'] = compute_calendar_signals(run_date)
    features['alt_data'] = compute_alt_data_signals(segment_id)

    # Null handling: not all pillars apply to all segment types
    # Equity segments: no onchain, no community_sentiment
    # Crypto segments: no fundamental, no earnings_sentiment, no options_behavior
    # Derivatives: primarily vol + options + microstructure
    # Macro: primarily regime + correlation + seasonality

    return pd.DataFrame([features])
```

**4.2 — Ensemble Model Architecture**

```python
# Three-layer ensemble: individual models → stacking → meta-learner

from sklearn.ensemble import StackingClassifier, StackingRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from xgboost import XGBClassifier, XGBRegressor
from sklearn.calibration import CalibratedClassifierCV

# Layer 1: Individual pillar models (already defined above)
# Each produces a score in [0, 100] or [-1.0, +1.0]

# Layer 2: Stacking — combine pillar outputs
def build_stacking_model(target='direction'):
    """
    target options:
      - 'direction':  UP | FLAT | DOWN (classification, 3-class)
      - 'magnitude':  predicted return (regression)
      - 'vol':        predicted realized vol (regression)
      - 'regime':     market regime (classification, 7-class)
    """

    if target == 'direction':
        base_estimators = [
            ('xgb', XGBClassifier(
                n_estimators=100, max_depth=4, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8,
                eval_metric='mlogloss', use_label_encoder=False
            )),
            ('ridge', LogisticRegression(
                C=1.0, penalty='l2', solver='lbfgs',
                multi_class='multinomial', max_iter=1000
            ))
        ]
        meta_learner = LogisticRegression(C=0.5, solver='lbfgs')

        model = StackingClassifier(
            estimators=base_estimators,
            final_estimator=meta_learner,
            cv=5,  # time-series aware CV (see 4.3)
            stack_method='predict_proba'
        )

        # Calibrate probabilities — critical for confidence intervals
        model = CalibratedClassifierCV(model, cv=3, method='isotonic')

    elif target == 'magnitude':
        base_estimators = [
            ('xgb', XGBRegressor(
                n_estimators=100, max_depth=4, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8
            )),
            ('ridge', Ridge(alpha=1.0))
        ]
        meta_learner = Ridge(alpha=0.5)

        model = StackingRegressor(
            estimators=base_estimators,
            final_estimator=meta_learner,
            cv=5
        )

    return model

# Layer 3: Regime-conditioned meta-learner
# Train separate ensemble weights per regime
# In RISK_OFF_PANIC: upweight behavioral signals, downweight momentum
# In RISK_ON_MOMENTUM: upweight momentum, moderate weight to fundamentals
# This prevents the model from averaging away regime-specific alpha

REGIME_WEIGHT_OVERRIDES = {
    'RISK_ON_MOMENTUM':   {'momentum': 1.3, 'behavioral': 0.8, 'sentiment': 1.0},
    'RISK_ON_BROADENING': {'momentum': 0.9, 'fundamental': 1.3, 'sentiment': 1.0},
    'RISK_OFF_DEFENSIVE': {'momentum': 0.7, 'behavioral': 1.3, 'sentiment': 1.2},
    'RISK_OFF_PANIC':     {'momentum': 0.5, 'behavioral': 1.5, 'sentiment': 0.8},
    'TRANSITION_UP':      {'momentum': 1.1, 'behavioral': 1.1, 'sentiment': 1.1},
    'TRANSITION_DOWN':    {'momentum': 0.8, 'behavioral': 1.2, 'sentiment': 1.1},
    'RANGE_BOUND':        {'momentum': 0.6, 'behavioral': 1.0, 'vol_surface': 1.4},
}
```

**4.3 — Walk-Forward Validation**

```python
# CRITICAL: No look-ahead bias. Ever.

from sklearn.model_selection import TimeSeriesSplit

def walk_forward_evaluate(features_df, target, n_splits=5, embargo_days=5):
    """
    Time-series aware cross-validation with embargo period.

    Standard k-fold is INVALID for financial data because:
    - Future data leaks into training
    - Autocorrelation violates i.i.d. assumption
    - Regime changes make random splits meaningless

    Walk-forward:
    - Train on [t0, t1], predict [t1+embargo, t2]
    - Train on [t0, t2], predict [t2+embargo, t3]
    - Expanding window captures regime evolution
    - Embargo prevents information leakage from adjacent periods

    Returns: dict with per-fold and aggregate metrics
    """

    tscv = TimeSeriesSplit(n_splits=n_splits, gap=embargo_days)
    results = []

    for fold, (train_idx, test_idx) in enumerate(tscv.split(features_df)):
        X_train = features_df.iloc[train_idx].drop(columns=[target])
        y_train = features_df.iloc[train_idx][target]
        X_test = features_df.iloc[test_idx].drop(columns=[target])
        y_test = features_df.iloc[test_idx][target]

        model = build_stacking_model(target='direction')
        model.fit(X_train, y_train)
        preds = model.predict_proba(X_test)

        fold_metrics = compute_metrics(y_test, preds, fold)
        results.append(fold_metrics)

    return aggregate_metrics(results)


def compute_metrics(y_true, y_pred_proba, fold):
    """
    Financial-relevant metrics, not just accuracy.

    - Accuracy: baseline check
    - Information Coefficient (IC): correlation between predicted score and realized return
    - Hit Rate: % of directional calls correct
    - Profit Factor: gross profits / gross losses (using predicted direction)
    - Brier Score: calibration of probability estimates
    - Regime-conditional IC: IC broken down by market regime
    """
    return {
        'fold': fold,
        'accuracy': ...,
        'information_coefficient': ...,
        'hit_rate': ...,
        'profit_factor': ...,
        'brier_score': ...,
        'regime_conditional_ic': {...}
    }
```

---

### Pillar 5: Claude-as-Analyst (LLM Integration Layer)

This is the most novel piece. Use Claude's API not as a chatbot but as a **structured analytical engine** that processes context no traditional ML model can handle.

**5.1 — Earnings Call Deep Analysis**

```python
# Use Claude API to extract structured signals from earnings transcripts

async def analyze_earnings_call(transcript: str, ticker: str, segment: str) -> dict:
    response = await call_claude_api(
        model="claude-sonnet-4-20250514",
        system="""You are a senior equity research analyst. Analyze this earnings
        call transcript and return ONLY a JSON object with these fields:
        {
          "overall_tone": "bullish|neutral|bearish",
          "tone_confidence": 0.0-1.0,
          "guidance_direction": "raised|maintained|lowered|withdrawn",
          "key_forward_statements": [
            {"statement": "...", "confidence": 0.0-1.0, "classification": "bullish|neutral|bearish"}
          ],
          "management_hedging_level": 0.0-1.0,
          "ceo_cfo_alignment": 0.0-1.0,
          "analyst_concern_topics": ["topic1", "topic2"],
          "competitive_mentions": ["competitor1", "competitor2"],
          "capex_signal": "increasing|stable|decreasing",
          "hiring_signal": "expanding|stable|contracting",
          "margin_outlook": "expanding|stable|compressing",
          "surprise_factor": "positive_surprise|in_line|negative_surprise",
          "one_sentence_summary": "..."
        }""",
        user=f"Ticker: {ticker}\nSegment: {segment}\n\nTranscript:\n{transcript}"
    )
    return json.loads(response)
```

**5.2 — Regulatory Impact Assessment**

```python
# Use Claude to interpret complex regulatory developments

async def assess_regulatory_impact(
    regulatory_text: str,
    affected_tickers: list,
    asset_class: str
) -> dict:
    response = await call_claude_api(
        model="claude-sonnet-4-20250514",
        system="""You are a regulatory analyst specializing in financial markets.
        Analyze this regulatory development and return ONLY a JSON object:
        {
          "severity": "minor|moderate|significant|transformative",
          "direction": "positive|neutral|negative" (for affected assets),
          "timeline": "immediate|short_term_3mo|medium_term_1yr|long_term",
          "affected_segments": ["segment1", "segment2"],
          "first_order_effects": ["effect1", "effect2"],
          "second_order_effects": ["effect1", "effect2"],
          "precedent_comparison": "similar to [historical event] because...",
          "probability_of_implementation": 0.0-1.0,
          "market_pricing_assessment": "underpriced|fairly_priced|overpriced"
        }""",
        user=f"Asset class: {asset_class}\nAffected tickers: {affected_tickers}\n\nRegulatory text:\n{regulatory_text}"
    )
    return json.loads(response)
```

**5.3 — Cross-Vertical Synthesis**

```python
# Use Claude to identify non-obvious connections between market segments

async def synthesize_cross_vertical(
    segment_brief: dict,
    repe_state: dict,
    credit_state: dict,
    macro_state: dict
) -> dict:
    response = await call_claude_api(
        model="claude-sonnet-4-20250514",
        system="""You are a multi-asset strategist who specializes in finding
        non-obvious connections between markets. Given a trading segment
        intelligence brief alongside the current state of REPE, credit, and
        macro modules, identify connections that a siloed analyst would miss.
        Return ONLY a JSON object:
        {
          "cross_vertical_signals": [
            {
              "connection": "description of the connection",
              "from_module": "trading|repe|credit|macro",
              "to_module": "trading|repe|credit|macro",
              "signal_strength": "weak|moderate|strong",
              "actionability": "informational|watchlist|trade_idea|risk_adjustment",
              "detail": "specific recommendation"
            }
          ],
          "regime_consistency_check": "all modules aligned|divergence detected",
          "divergence_detail": "if divergence, explain what and why",
          "highest_conviction_cross_signal": "the single best cross-vertical insight"
        }""",
        user=json.dumps({
            "trading_segment": segment_brief,
            "repe_state": repe_state,
            "credit_state": credit_state,
            "macro_state": macro_state
        })
    )
    return json.loads(response)
```

---

## MODEL LIFECYCLE

### Training Schedule

| Model Type | Retrain Frequency | Data Window | Minimum Observations |
|------------|-------------------|-------------|----------------------|
| Momentum regression | Weekly | Rolling 252 trading days | 200+ |
| Mean reversion | Weekly | Rolling 126 trading days | 100+ |
| Fundamental regression | Monthly | Rolling 8 quarters | 4+ quarters |
| Vol surface model | Daily | Rolling 60 trading days | 40+ |
| On-chain regression | Weekly | Rolling 180 days | 120+ |
| Stacking ensemble | Monthly | Expanding window (all history) | 500+ |
| Sentiment models | No retraining (VADER is lexicon-based; Claude API is zero-shot) | N/A | N/A |

### Model Storage (Supabase)

```sql
CREATE TABLE ml_models (
  model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL CHECK (model_type IN (
    'momentum','reversion','fundamental','vol_surface','onchain',
    'ensemble','sentiment','behavioral','regime'
  )),
  segment_scope TEXT,  -- NULL = universal, else segment_id or category
  version INTEGER NOT NULL DEFAULT 1,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  training_window_start DATE,
  training_window_end DATE,
  training_samples INTEGER,
  feature_names JSONB NOT NULL DEFAULT '[]',
  hyperparameters JSONB NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}',
  model_artifact_path TEXT,  -- path to serialized model (joblib/pickle)
  is_active BOOLEAN DEFAULT true,
  promoted_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE ml_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES ml_models(model_id),
  segment_id UUID REFERENCES market_segments(segment_id),
  ticker TEXT,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prediction_target TEXT NOT NULL,  -- 'direction_5d', 'return_1m', 'vol_30d', etc.
  prediction_value JSONB NOT NULL,  -- {"class": "UP", "probability": 0.72, "confidence": [0.65, 0.79]}
  features_snapshot JSONB NOT NULL, -- full feature vector used for this prediction
  regime_at_prediction TEXT,
  actual_outcome JSONB,             -- filled in after horizon passes
  outcome_recorded_at TIMESTAMPTZ,
  pnl_if_traded NUMERIC(12,4),     -- hypothetical PnL (no actual trading)
  notes TEXT
);

-- Index for walk-forward evaluation
CREATE INDEX idx_predictions_model_date ON ml_predictions(model_id, predicted_at);
CREATE INDEX idx_predictions_outcome ON ml_predictions(prediction_id) WHERE actual_outcome IS NOT NULL;
```

### Model Promotion Flow

```
1. Train new model version
2. Run walk-forward evaluation on out-of-sample data
3. Compare metrics to current active model:
   - IC must improve by >= 0.02 (not just noise)
   - Hit rate must not degrade by > 2%
   - Brier score must improve (better calibration)
4. If metrics pass → promote new version, retire old
5. If metrics fail → log the attempt, keep current model active
6. NEVER auto-deploy without metric comparison
```

### Prediction Tracking & Feedback Loop

```
Every prediction is logged with its full feature snapshot.

After the prediction horizon passes:
1. Record actual outcome
2. Compute accuracy for this prediction
3. Update running metrics for the model
4. If model accuracy drops below threshold over trailing 30 predictions:
   → Flag for retraining
   → Generate a Feature Card: "Model {name} accuracy degraded — investigate regime shift or feature staleness"

This creates a self-improving loop:
  Research → Features → Model → Prediction → Outcome → Evaluation → Research (gaps) → Better Features
```

---

## INTEGRATION WITH MARKET ROTATION ENGINE

### Modified Phase 1 (Research)

After the standard research protocol runs, the ML Signal Engine adds:

```
1. Compute all applicable pillar signals for the segment
2. Run the stacking ensemble to produce a composite ML score
3. Run Claude-as-Analyst for qualitative interpretation
4. Add ML signals to the Segment Intelligence Brief:
   {
     "ml_signals": {
       "composite_ml_score": 72,
       "direction_prediction": {"class": "UP", "probability": 0.68, "horizon": "5d"},
       "pillar_scores": {
         "momentum": 81, "reversion": 35, "fundamental": 65,
         "sentiment": 58, "behavioral": 70, "structural": 55
       },
       "regime_tag": "RISK_ON_MOMENTUM",
       "confidence_band": [64, 80],
       "model_version": "ensemble_v3_2026-03-15",
       "trailing_accuracy": 0.62,
       "notable_divergences": [
         "Momentum score (81) vs reversion signal (35) = strong trend, no mean-reversion setup",
         "Sentiment (58) lagging price action (81) = narrative hasn't caught up to move"
       ]
     }
   }
```

### Modified Phase 2 (Gap Detection)

ML-specific gap categories are added:

```
9. MODEL_PERFORMANCE_GAP
   "Momentum model IC dropped from 0.15 to 0.08 over last 30 predictions — regime changed?"
   → Feature Card: investigate new features or model retraining

10. DATA_QUALITY_GAP
    "On-chain data source returned stale data (>24h old) for 3 of 7 tokens"
    → Feature Card: add data freshness monitoring + fallback source

11. FEATURE_STALENESS_GAP
    "Google Trends API returned rate-limited results — feature is null for 40% of rows"
    → Feature Card: implement caching + rate limit handling
```

### Modified Phase 3 (Build Prompts)

Meta prompts now include ML-specific build directives:

```
- Model training pipeline (sklearn Pipeline with preprocessing + model)
- Feature engineering functions (with unit tests on known data)
- Prediction logging (Supabase insert with full feature snapshot)
- Walk-forward evaluation script
- Model promotion comparison script
- Dashboard component for model performance monitoring
```

---

## BANNED PATTERNS

```
- Training on future data (look-ahead bias)
- Using a single train/test split for financial data (must be walk-forward)
- Deploying a model without comparing to the current active model
- Treating ML predictions as certainties (always include confidence intervals)
- Overfitting to recent regime (expanding window prevents this)
- Ignoring transaction costs in backtest evaluation
- Using sentiment scores without source attribution
- Allowing null features to silently propagate (must be handled explicitly)
- Presenting ML output as financial advice (it is research, not recommendation)
- Running Claude API calls without structured output enforcement (always use JSON schema)
- Training models with fewer than minimum observation thresholds (see table above)
```

---

## COMPUTE REQUIREMENTS

The ML Signal Engine is designed to run WITHOUT GPU:

| Component | Compute | Latency | Notes |
|-----------|---------|---------|-------|
| Momentum regression | CPU (numpy/sklearn) | <1s | OLS on ~250 rows |
| XGBoost ensemble | CPU | 2-5s | 100 trees, shallow depth |
| VADER sentiment | CPU | <0.5s per document | Lexicon-based, no model |
| TF-IDF + logistic | CPU | <1s | Sparse matrix, fast |
| Claude API calls | API call | 3-8s each | Budget 2-3 calls per rotation |
| Walk-forward eval | CPU | 30-60s | 5-fold on expanding window |
| Full rotation with ML | CPU + API | 5-10 min | Well within daily cadence |

If GPU becomes available (RunPod, Modal):
- Swap VADER for a fine-tuned FinBERT model
- Add transformer-based embeddings for narrative clustering
- Run Monte Carlo simulations for options pricing
- These are enhancements, not requirements — the CPU path is fully functional
