"""
ML Signal Engine — Feature Engineering Library
================================================
Computes quantitative, textual, and behavioral features for the
Market Rotation Engine. Designed to run on CPU without GPU dependencies.

Usage:
    from ml_features import FeatureEngine
    engine = FeatureEngine()
    features = engine.compute_all(segment_id='eq-semi-ai-accel', tickers=['NVDA','AMD','AVGO'])

Dependencies:
    pip install numpy pandas scipy scikit-learn statsmodels xgboost vaderSentiment textblob
"""

import numpy as np
import pandas as pd
from scipy import stats
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Optional
import json
import warnings
warnings.filterwarnings('ignore')


# ============================================================================
# PILLAR 1: MATHEMATICAL REGRESSION FEATURES
# ============================================================================

class MomentumFeatures:
    """Fama-French style cross-sectional momentum with decay estimation."""

    @staticmethod
    def compute(prices_df: pd.DataFrame) -> pd.DataFrame:
        """
        Args:
            prices_df: DataFrame with columns = tickers, index = dates, values = adj close

        Returns:
            DataFrame with momentum features per ticker
        """
        results = {}

        for ticker in prices_df.columns:
            px = prices_df[ticker].dropna()
            if len(px) < 252:
                continue

            latest = px.iloc[-1]

            # Returns at various horizons (skip most recent week for 1m)
            ret_1m = (px.iloc[-5] / px.iloc[-26]) - 1 if len(px) >= 26 else np.nan
            ret_3m = (latest / px.iloc[-63]) - 1 if len(px) >= 63 else np.nan
            ret_6m = (latest / px.iloc[-126]) - 1 if len(px) >= 126 else np.nan
            ret_12m_skip1m = (px.iloc[-21] / px.iloc[-252]) - 1 if len(px) >= 252 else np.nan

            # Risk-adjusted momentum
            vol_20d = px.pct_change().iloc[-20:].std() * np.sqrt(252)
            vol_adj = ret_6m / vol_20d if vol_20d > 0 else 0

            # Moving average signals
            sma_50 = px.iloc[-50:].mean() if len(px) >= 50 else np.nan
            sma_200 = px.iloc[-200:].mean() if len(px) >= 200 else np.nan
            above_50dma = 1 if latest > sma_50 else 0
            above_200dma = 1 if latest > sma_200 else 0
            golden_cross = 1 if sma_50 > sma_200 else 0

            # Momentum acceleration (is momentum itself accelerating?)
            ret_3m_prior = (px.iloc[-63] / px.iloc[-126]) - 1 if len(px) >= 126 else np.nan
            momentum_accel = ret_3m - ret_3m_prior if ret_3m_prior is not np.nan else np.nan

            results[ticker] = {
                'ret_1m': ret_1m,
                'ret_3m': ret_3m,
                'ret_6m': ret_6m,
                'ret_12m_skip1m': ret_12m_skip1m,
                'vol_adj_momentum': vol_adj,
                'above_50dma': above_50dma,
                'above_200dma': above_200dma,
                'golden_cross': golden_cross,
                'momentum_acceleration': momentum_accel,
                'realized_vol_20d': vol_20d,
            }

        df = pd.DataFrame(results).T

        # Percentile rank within universe (the actual signal)
        for col in ['ret_6m', 'vol_adj_momentum', 'momentum_acceleration']:
            if col in df.columns:
                df[f'{col}_rank'] = df[col].rank(pct=True) * 100

        return df

    @staticmethod
    def classify_direction(features: pd.Series) -> str:
        accel = features.get('momentum_acceleration', 0)
        ret_6m = features.get('ret_6m', 0)
        if accel > 0.02 and ret_6m > 0:
            return 'ACCELERATING'
        elif ret_6m > 0:
            return 'STABLE'
        elif accel < -0.02:
            return 'REVERSING'
        else:
            return 'DECELERATING'


class MeanReversionFeatures:
    """Z-score based mean reversion signals with adaptive lookback."""

    @staticmethod
    def compute(prices_df: pd.DataFrame) -> pd.DataFrame:
        results = {}

        for ticker in prices_df.columns:
            px = prices_df[ticker].dropna()
            if len(px) < 50:
                continue

            latest = px.iloc[-1]

            # Z-scores at multiple lookbacks
            sma20, std20 = px.iloc[-20:].mean(), px.iloc[-20:].std()
            sma50, std50 = px.iloc[-50:].mean(), px.iloc[-50:].std()
            zscore_20 = (latest - sma20) / std20 if std20 > 0 else 0
            zscore_50 = (latest - sma50) / std50 if std50 > 0 else 0

            # RSI(14)
            delta = px.diff().iloc[-14:]
            gain = delta.where(delta > 0, 0).mean()
            loss = -delta.where(delta < 0, 0).mean()
            rs = gain / loss if loss != 0 else 100
            rsi_14 = 100 - (100 / (1 + rs))

            # Distance from extremes
            high_52w = px.iloc[-252:].max() if len(px) >= 252 else px.max()
            low_52w = px.iloc[-252:].min() if len(px) >= 252 else px.min()
            pct_from_high = (latest - high_52w) / high_52w
            pct_from_low = (latest - low_52w) / low_52w

            # Volatility compression (Bollinger squeeze detection)
            vol_5d = px.pct_change().iloc[-5:].std()
            vol_20d = px.pct_change().iloc[-20:].std()
            vol_compression = vol_5d / vol_20d if vol_20d > 0 else 1.0

            results[ticker] = {
                'zscore_20d': zscore_20,
                'zscore_50d': zscore_50,
                'rsi_14': rsi_14,
                'pct_from_52w_high': pct_from_high,
                'pct_from_52w_low': pct_from_low,
                'vol_compression_ratio': vol_compression,
            }

        df = pd.DataFrame(results).T

        # Classify reversion state
        df['reversion_state'] = df.apply(
            lambda r: 'OVERBOUGHT' if r['zscore_20d'] > 2 and r['rsi_14'] > 70
            else ('OVERSOLD' if r['zscore_20d'] < -2 and r['rsi_14'] < 30
                  else 'NEUTRAL'),
            axis=1
        )

        return df


class FundamentalFeatures:
    """Cross-sectional value, quality, and growth features for equities."""

    @staticmethod
    def compute(fundamentals_dict: dict) -> pd.DataFrame:
        """
        Args:
            fundamentals_dict: {ticker: {fwd_pe, ev_ebitda, fcf_yield, roic,
                                         rev_growth, margin_delta, eps_revision,
                                         net_debt_ebitda, insider_buy_ratio}}
        """
        df = pd.DataFrame(fundamentals_dict).T

        # Composite scores
        if 'fcf_yield' in df.columns and 'roic' in df.columns:
            df['quality_score'] = (
                df['fcf_yield'].rank(pct=True) * 0.3 +
                df['roic'].rank(pct=True) * 0.4 +
                (1 - df.get('net_debt_ebitda', pd.Series(dtype=float)).rank(pct=True).fillna(0.5)) * 0.3
            ) * 100

        if 'fwd_pe' in df.columns and 'rev_growth' in df.columns:
            # PEG-like ratio (lower = better value for growth)
            df['peg_ratio'] = df['fwd_pe'] / (df['rev_growth'] * 100).clip(lower=1)

        # Value-growth classification
        def classify_style(row):
            pe = row.get('fwd_pe', 20)
            growth = row.get('rev_growth', 0.1)
            if pe < 12 and growth < 0.05:
                return 'DEEP_VALUE'
            elif pe < 18:
                return 'VALUE' if growth < 0.15 else 'GARP'
            elif pe < 30:
                return 'GROWTH'
            else:
                return 'HYPER_GROWTH'

        df['style_classification'] = df.apply(classify_style, axis=1)

        # Earnings momentum
        if 'eps_revision' in df.columns:
            df['earnings_momentum'] = df['eps_revision'].apply(
                lambda x: 'ACCELERATING' if x > 0.02
                else ('DECELERATING' if x < -0.02 else 'STABLE')
            )

        return df


class VolatilitySurfaceFeatures:
    """Options-derived volatility surface analysis."""

    @staticmethod
    def compute(vol_data: dict) -> dict:
        """
        Args:
            vol_data: {
                'iv_current': float, 'iv_1yr_high': float, 'iv_1yr_low': float,
                'rv_20d': float, 'rv_60d': float,
                'iv_1m': float, 'iv_3m': float, 'iv_6m': float,
                'put_25d_iv': float, 'call_25d_iv': float,
                'vix': float, 'vix3m': float
            }
        """
        iv = vol_data.get('iv_current', 0)
        iv_high = vol_data.get('iv_1yr_high', 1)
        iv_low = vol_data.get('iv_1yr_low', 0)

        # IV Rank and Percentile
        iv_rank = (iv - iv_low) / (iv_high - iv_low) * 100 if (iv_high - iv_low) > 0 else 50
        rv_20 = vol_data.get('rv_20d', iv)
        rv_60 = vol_data.get('rv_60d', iv)

        # Vol risk premium
        vrp = iv - rv_20

        # Term structure
        iv_1m = vol_data.get('iv_1m', iv)
        iv_3m = vol_data.get('iv_3m', iv)
        term_slope = (iv_3m - iv_1m) / iv_1m if iv_1m > 0 else 0

        # Skew
        put_iv = vol_data.get('put_25d_iv', iv)
        call_iv = vol_data.get('call_25d_iv', iv)
        skew = put_iv - call_iv

        # VIX basis
        vix = vol_data.get('vix', 20)
        vix3m = vol_data.get('vix3m', 20)
        vix_basis = vix - vix3m  # positive = near-term fear

        # Classifications
        def vol_regime(iv_rank):
            if iv_rank < 20: return 'COMPRESSED'
            elif iv_rank < 50: return 'NORMAL'
            elif iv_rank < 80: return 'ELEVATED'
            else: return 'EXTREME'

        def premium_action(iv_rank, vrp):
            if iv_rank > 60 and vrp > 5:
                return 'SELL_PREMIUM'
            elif iv_rank < 25 and vrp < -2:
                return 'BUY_PREMIUM'
            else:
                return 'NEUTRAL'

        return {
            'iv_rank': iv_rank,
            'vol_risk_premium': vrp,
            'term_structure_slope': term_slope,
            'skew_25d': skew,
            'vix_basis': vix_basis,
            'vol_regime': vol_regime(iv_rank),
            'premium_recommendation': premium_action(iv_rank, vrp),
            'mispricing_score': min(abs(vrp) / iv * 100, 100) if iv > 0 else 0,
        }


class OnChainFeatures:
    """Blockchain-native regression features for crypto segments."""

    @staticmethod
    def compute(onchain_data: dict) -> dict:
        """
        Args:
            onchain_data: {
                'market_cap': float, 'realized_cap': float,
                'tx_volume_24h': float, 'active_addresses_7d': float,
                'active_addresses_7d_prior': float,
                'exchange_netflow_7d': float,
                'whale_balance_change_30d': float,
                'funding_rate_avg': float,
                'open_interest': float,
                'tvl': float, 'fdv': float,
                'fee_revenue_7d': float, 'fee_revenue_7d_prior': float,
                'stablecoin_supply_delta_30d': float
            }
        """
        mcap = onchain_data.get('market_cap', 1)
        rcap = onchain_data.get('realized_cap', mcap)
        tvl = onchain_data.get('tvl', 0)
        fdv = onchain_data.get('fdv', mcap)
        oi = onchain_data.get('open_interest', 0)

        # NVT ratio (network value to transactions — crypto P/E)
        tx_vol = onchain_data.get('tx_volume_24h', 1)
        nvt = mcap / (tx_vol * 365) if tx_vol > 0 else 999

        # MVRV z-score (market value vs realized value)
        mvrv = mcap / rcap if rcap > 0 else 1
        # Simplified z-score (would use historical distribution in production)
        mvrv_zscore = (mvrv - 1.5) / 0.8  # centered around historical mean of ~1.5

        # Active address momentum
        aa_current = onchain_data.get('active_addresses_7d', 0)
        aa_prior = onchain_data.get('active_addresses_7d_prior', aa_current)
        aa_delta = (aa_current - aa_prior) / aa_prior if aa_prior > 0 else 0

        # Exchange flow (negative = outflow = accumulation)
        exchange_netflow = onchain_data.get('exchange_netflow_7d', 0)

        # Leverage metrics
        oi_mcap_ratio = oi / mcap if mcap > 0 else 0
        funding = onchain_data.get('funding_rate_avg', 0)

        # DeFi metrics
        tvl_mcap_ratio = tvl / fdv if fdv > 0 else 0
        fee_7d = onchain_data.get('fee_revenue_7d', 0)
        fee_7d_prior = onchain_data.get('fee_revenue_7d_prior', fee_7d)
        fee_growth = (fee_7d - fee_7d_prior) / fee_7d_prior if fee_7d_prior > 0 else 0

        # Classifications
        def accumulation_phase(netflow, whale_change):
            if netflow < 0 and whale_change > 0:
                return 'ACCUMULATION'
            elif netflow > 0 and whale_change < 0:
                return 'DISTRIBUTION'
            return 'NEUTRAL'

        def leverage_risk(oi_ratio, funding):
            if oi_ratio > 0.5 or abs(funding) > 0.05:
                return 'EXTREME'
            elif oi_ratio > 0.3 or abs(funding) > 0.03:
                return 'HIGH'
            elif oi_ratio > 0.15 or abs(funding) > 0.01:
                return 'MODERATE'
            return 'LOW'

        whale_change = onchain_data.get('whale_balance_change_30d', 0)

        return {
            'nvt_ratio': nvt,
            'mvrv_zscore': mvrv_zscore,
            'active_address_delta': aa_delta,
            'exchange_netflow': exchange_netflow,
            'oi_mcap_ratio': oi_mcap_ratio,
            'funding_rate_avg': funding,
            'tvl_mcap_ratio': tvl_mcap_ratio,
            'fee_revenue_growth': fee_growth,
            'accumulation_phase': accumulation_phase(exchange_netflow, whale_change),
            'leverage_risk': leverage_risk(oi_mcap_ratio, funding),
            'usage_trend': 'GROWING' if fee_growth > 0.1 else ('DECLINING' if fee_growth < -0.1 else 'STABLE'),
            'onchain_score': np.clip(
                50 + (aa_delta * 100) - (mvrv_zscore * 10) - (exchange_netflow / mcap * 1000),
                0, 100
            ),
        }


# ============================================================================
# PILLAR 2: TEXT SENTIMENT FEATURES
# ============================================================================

class SentimentFeatures:
    """Text sentiment extraction using VADER + custom financial lexicon."""

    def __init__(self):
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        self.vader = SentimentIntensityAnalyzer()

        # Extend VADER with financial domain terms
        financial_lexicon = {
            # Bullish terms
            'bullish': 2.5, 'outperform': 2.0, 'upgrade': 2.0, 'breakout': 1.8,
            'accumulation': 1.5, 'catalyst': 1.5, 'tailwind': 1.5, 'beat': 1.8,
            'exceeded': 1.5, 'surpassed': 1.5, 'accelerating': 1.5, 'robust': 1.3,
            'record': 1.5, 'expansion': 1.2, 'momentum': 1.0, 'raised': 1.5,
            'overweight': 1.5, 'conviction': 1.3, 'reaffirmed': 0.8,

            # Bearish terms
            'bearish': -2.5, 'underperform': -2.0, 'downgrade': -2.0, 'breakdown': -1.8,
            'distribution': -1.5, 'headwind': -1.5, 'miss': -1.8, 'missed': -1.8,
            'disappointing': -2.0, 'decelerating': -1.5, 'contraction': -1.5,
            'lowered': -1.5, 'cut': -1.5, 'underweight': -1.5, 'cautious': -1.0,
            'withdrawn': -2.0, 'challenged': -1.2, 'uncertain': -1.0, 'volatile': -0.8,

            # Hedge words (mildly negative — indicate reduced confidence)
            'approximately': -0.3, 'roughly': -0.3, 'potentially': -0.3,
            'subject to': -0.5, 'may': -0.2, 'might': -0.2, 'could': -0.1,

            # Crypto-specific
            'moon': 1.5, 'pump': 1.0, 'dump': -2.0, 'rug': -3.0, 'rugged': -3.0,
            'exploit': -2.5, 'hack': -2.5, 'drained': -2.0, 'airdrop': 1.0,
            'staking': 0.5, 'unstaking': -0.5, 'unlock': -1.0, 'vesting': -0.5,
            'tvl': 0.3, 'whale': 0.0, 'liquidation': -1.5, 'depegged': -2.5,
        }
        self.vader.lexicon.update(financial_lexicon)

    def analyze_text(self, text: str) -> dict:
        """Analyze a single text string for sentiment."""
        scores = self.vader.polarity_scores(text)
        return {
            'compound': scores['compound'],
            'positive': scores['pos'],
            'negative': scores['neg'],
            'neutral': scores['neu'],
        }

    def analyze_headlines(self, headlines: list[str]) -> dict:
        """
        Analyze a batch of headlines and produce aggregate sentiment.

        Args:
            headlines: list of headline strings

        Returns:
            Aggregate sentiment with distribution stats
        """
        if not headlines:
            return {
                'mean_sentiment': 0.0,
                'median_sentiment': 0.0,
                'sentiment_std': 0.0,
                'pct_positive': 0.0,
                'pct_negative': 0.0,
                'pct_neutral': 0.0,
                'strongest_positive': None,
                'strongest_negative': None,
                'headline_count': 0,
            }

        sentiments = [self.analyze_text(h) for h in headlines]
        compounds = [s['compound'] for s in sentiments]

        # Find strongest signals
        pos_idx = np.argmax(compounds) if compounds else 0
        neg_idx = np.argmin(compounds) if compounds else 0

        return {
            'mean_sentiment': np.mean(compounds),
            'median_sentiment': np.median(compounds),
            'sentiment_std': np.std(compounds),
            'pct_positive': sum(1 for c in compounds if c > 0.05) / len(compounds),
            'pct_negative': sum(1 for c in compounds if c < -0.05) / len(compounds),
            'pct_neutral': sum(1 for c in compounds if -0.05 <= c <= 0.05) / len(compounds),
            'strongest_positive': headlines[pos_idx] if compounds[pos_idx] > 0 else None,
            'strongest_negative': headlines[neg_idx] if compounds[neg_idx] < 0 else None,
            'headline_count': len(headlines),
        }

    def analyze_earnings_transcript(self, transcript: str) -> dict:
        """
        Analyze earnings call transcript for structured signals.
        Uses VADER for speed; Claude API for depth (called separately).
        """
        sentences = [s.strip() for s in transcript.split('.') if len(s.strip()) > 20]

        # Overall sentiment
        sentiments = [self.analyze_text(s) for s in sentences]
        compounds = [s['compound'] for s in sentiments]

        # Forward-looking language detection
        forward_keywords = ['expect', 'anticipate', 'guide', 'outlook', 'forecast',
                            'confident', 'believe', 'target', 'project', 'plan']
        hedge_keywords = ['approximately', 'roughly', 'potentially', 'may', 'might',
                          'subject to', 'could', 'uncertain', 'risk']

        forward_sentences = [s for s in sentences if any(kw in s.lower() for kw in forward_keywords)]
        forward_sentiments = [self.analyze_text(s)['compound'] for s in forward_sentences]

        hedge_count = sum(1 for s in sentences for kw in hedge_keywords if kw in s.lower())
        hedge_ratio = hedge_count / len(sentences) if sentences else 0

        # Specificity score: ratio of sentences with numbers
        has_number = sum(1 for s in sentences if any(c.isdigit() for c in s))
        specificity = has_number / len(sentences) if sentences else 0

        return {
            'overall_sentiment': np.mean(compounds) if compounds else 0,
            'forward_looking_sentiment': np.mean(forward_sentiments) if forward_sentiments else 0,
            'hedge_ratio': hedge_ratio,
            'specificity_score': specificity,
            'sentence_count': len(sentences),
            'forward_sentence_count': len(forward_sentences),
            'sentiment_trajectory': self._compute_trajectory(compounds),
        }

    def _compute_trajectory(self, compounds: list) -> str:
        """Is sentiment improving or deteriorating through the document?"""
        if len(compounds) < 10:
            return 'INSUFFICIENT_DATA'
        mid = len(compounds) // 2
        first_half = np.mean(compounds[:mid])
        second_half = np.mean(compounds[mid:])
        diff = second_half - first_half
        if diff > 0.1:
            return 'IMPROVING'
        elif diff < -0.1:
            return 'DETERIORATING'
        return 'STABLE'


# ============================================================================
# PILLAR 3: BEHAVIORAL FEATURES
# ============================================================================

class CalendarFeatures:
    """Structural calendar and seasonality signals."""

    @staticmethod
    def compute(date: datetime) -> dict:
        dow = date.weekday()  # 0=Mon, 4=Fri
        month = date.month
        day = date.day

        # Day of week effect
        dow_bias = {0: -0.3, 1: 0.0, 2: 0.1, 3: 0.1, 4: 0.2}  # Monday weakness

        # Monthly seasonality (simplified — historical S&P 500 bias)
        month_bias = {
            1: 0.5, 2: -0.2, 3: 0.3, 4: 0.8, 5: 0.1, 6: -0.1,
            7: 0.5, 8: -0.3, 9: -0.8, 10: 0.2, 11: 0.7, 12: 0.8
        }

        # Tax loss season
        tax_loss_pressure = month in [10, 11, 12] and day > 15

        # Quarter-end rebalancing
        quarter_end_proximity = (
            month in [3, 6, 9, 12] and day >= 20
        )

        # January effect (small-cap outperformance)
        january_effect = month == 1 and day <= 15

        # Santa rally (last 5 trading days of year + first 2 of January)
        santa_rally = (month == 12 and day >= 24) or (month == 1 and day <= 3)

        return {
            'day_of_week': dow,
            'dow_bias': dow_bias.get(dow, 0),
            'month': month,
            'month_bias': month_bias.get(month, 0),
            'tax_loss_season': tax_loss_pressure,
            'quarter_end_rebalance': quarter_end_proximity,
            'january_effect': january_effect,
            'santa_rally': santa_rally,
            'seasonality_composite': (
                dow_bias.get(dow, 0) * 0.2 +
                month_bias.get(month, 0) * 0.5 +
                (0.3 if january_effect or santa_rally else 0) +
                (-0.2 if tax_loss_pressure else 0)
            ),
        }


class CorrelationRegimeFeatures:
    """Cross-asset correlation structure analysis."""

    @staticmethod
    def compute(returns_dict: dict, window: int = 30) -> dict:
        """
        Args:
            returns_dict: {asset_name: pd.Series of daily returns}
                          Must include at least: 'SPX', 'BTC', 'UST_10Y', 'DXY', 'GOLD'
            window: rolling correlation window

        Returns:
            Correlation regime features
        """
        df = pd.DataFrame(returns_dict).dropna()

        if len(df) < window:
            return {
                'regime': 'INSUFFICIENT_DATA',
                'spx_btc_corr': np.nan,
                'spx_bond_corr': np.nan,
            }

        recent = df.iloc[-window:]

        # Key correlations
        corr_matrix = recent.corr()
        spx_btc = corr_matrix.loc['SPX', 'BTC'] if 'BTC' in corr_matrix else np.nan
        spx_bond = corr_matrix.loc['SPX', 'UST_10Y'] if 'UST_10Y' in corr_matrix else np.nan
        usd_gold = corr_matrix.loc['DXY', 'GOLD'] if all(k in corr_matrix for k in ['DXY', 'GOLD']) else np.nan

        # Sector dispersion (if sector returns provided)
        sector_cols = [c for c in df.columns if c.startswith('SECTOR_')]
        dispersion = recent[sector_cols].std(axis=1).mean() if sector_cols else np.nan

        # PCA concentration (how much variance is explained by first factor)
        try:
            from sklearn.decomposition import PCA
            pca = PCA(n_components=min(3, len(df.columns)))
            pca.fit(recent.fillna(0))
            first_component_var = pca.explained_variance_ratio_[0]
        except Exception:
            first_component_var = np.nan

        # Regime classification
        def classify_regime(spx_btc, spx_bond, first_pc):
            if first_pc and first_pc > 0.7:
                return 'CRISIS'  # one factor driving everything
            elif spx_btc and abs(spx_btc) > 0.6:
                return 'ELEVATED'  # macro regime, risk-on/off together
            elif spx_bond and spx_bond > 0.3:
                return 'ELEVATED'  # positive stock-bond correlation = inflation regime
            else:
                return 'DECORRELATED'  # normal, diversification working

        return {
            'spx_btc_corr': spx_btc,
            'spx_bond_corr': spx_bond,
            'usd_gold_corr': usd_gold,
            'sector_dispersion': dispersion,
            'first_pc_variance': first_component_var,
            'correlation_regime': classify_regime(spx_btc, spx_bond, first_component_var),
            'alpha_opportunity': 'HIGH' if (dispersion and dispersion > 0.02) else 'LOW',
        }


# ============================================================================
# ORCHESTRATOR: FEATURE ENGINE
# ============================================================================

class FeatureEngine:
    """
    Orchestrates feature computation across all pillars.
    Handles null features for non-applicable segment types.
    """

    def __init__(self):
        self.momentum = MomentumFeatures()
        self.mean_reversion = MeanReversionFeatures()
        self.fundamentals = FundamentalFeatures()
        self.vol_surface = VolatilitySurfaceFeatures()
        self.onchain = OnChainFeatures()
        self.sentiment = SentimentFeatures()
        self.calendar = CalendarFeatures()
        self.correlation = CorrelationRegimeFeatures()

    def compute_all(
        self,
        segment_id: str,
        category: str,
        tickers: list[str],
        prices_df: Optional[pd.DataFrame] = None,
        fundamentals_dict: Optional[dict] = None,
        vol_data: Optional[dict] = None,
        onchain_data: Optional[dict] = None,
        headlines: Optional[list[str]] = None,
        transcript: Optional[str] = None,
        cross_asset_returns: Optional[dict] = None,
        run_date: Optional[datetime] = None,
    ) -> dict:
        """
        Compute all applicable features for a segment.

        Returns:
            {
                'segment_id': str,
                'category': str,
                'run_date': str,
                'pillar_1_quantitative': {...},
                'pillar_2_sentiment': {...},
                'pillar_3_behavioral': {...},
                'feature_count': int,
                'null_features': [list of features that couldn't be computed],
                'applicable_pillars': [list of pillars that ran],
            }
        """
        run_date = run_date or datetime.now()
        result = {
            'segment_id': segment_id,
            'category': category,
            'run_date': run_date.isoformat(),
            'pillar_1_quantitative': {},
            'pillar_2_sentiment': {},
            'pillar_3_behavioral': {},
            'null_features': [],
            'applicable_pillars': [],
        }

        # ---- PILLAR 1: Quantitative ----

        # Momentum (all categories with price data)
        if prices_df is not None and not prices_df.empty:
            try:
                result['pillar_1_quantitative']['momentum'] = (
                    self.momentum.compute(prices_df).to_dict('index')
                )
                result['applicable_pillars'].append('momentum')
            except Exception as e:
                result['null_features'].append(f'momentum: {str(e)}')

            try:
                result['pillar_1_quantitative']['mean_reversion'] = (
                    self.mean_reversion.compute(prices_df).to_dict('index')
                )
                result['applicable_pillars'].append('mean_reversion')
            except Exception as e:
                result['null_features'].append(f'mean_reversion: {str(e)}')

        # Fundamentals (equities only)
        if category == 'equities' and fundamentals_dict:
            try:
                result['pillar_1_quantitative']['fundamentals'] = (
                    self.fundamentals.compute(fundamentals_dict).to_dict('index')
                )
                result['applicable_pillars'].append('fundamentals')
            except Exception as e:
                result['null_features'].append(f'fundamentals: {str(e)}')

        # Vol surface (derivatives + equities with options)
        if vol_data:
            try:
                result['pillar_1_quantitative']['vol_surface'] = (
                    self.vol_surface.compute(vol_data)
                )
                result['applicable_pillars'].append('vol_surface')
            except Exception as e:
                result['null_features'].append(f'vol_surface: {str(e)}')

        # On-chain (crypto only)
        if category == 'crypto' and onchain_data:
            try:
                result['pillar_1_quantitative']['onchain'] = (
                    self.onchain.compute(onchain_data)
                )
                result['applicable_pillars'].append('onchain')
            except Exception as e:
                result['null_features'].append(f'onchain: {str(e)}')

        # ---- PILLAR 2: Sentiment ----

        if headlines:
            try:
                result['pillar_2_sentiment']['news'] = (
                    self.sentiment.analyze_headlines(headlines)
                )
                result['applicable_pillars'].append('news_sentiment')
            except Exception as e:
                result['null_features'].append(f'news_sentiment: {str(e)}')

        if transcript and category == 'equities':
            try:
                result['pillar_2_sentiment']['earnings'] = (
                    self.sentiment.analyze_earnings_transcript(transcript)
                )
                result['applicable_pillars'].append('earnings_sentiment')
            except Exception as e:
                result['null_features'].append(f'earnings_sentiment: {str(e)}')

        # ---- PILLAR 3: Behavioral ----

        try:
            result['pillar_3_behavioral']['calendar'] = (
                self.calendar.compute(run_date)
            )
            result['applicable_pillars'].append('calendar')
        except Exception as e:
            result['null_features'].append(f'calendar: {str(e)}')

        if cross_asset_returns:
            try:
                result['pillar_3_behavioral']['correlation_regime'] = (
                    self.correlation.compute(cross_asset_returns)
                )
                result['applicable_pillars'].append('correlation_regime')
            except Exception as e:
                result['null_features'].append(f'correlation_regime: {str(e)}')

        # Feature count
        def count_features(d):
            count = 0
            for v in d.values():
                if isinstance(v, dict):
                    count += count_features(v)
                elif v is not None and v is not np.nan:
                    count += 1
            return count

        result['feature_count'] = (
            count_features(result['pillar_1_quantitative']) +
            count_features(result['pillar_2_sentiment']) +
            count_features(result['pillar_3_behavioral'])
        )

        return result


# ============================================================================
# QUICK TEST
# ============================================================================

if __name__ == '__main__':
    print("ML Feature Engine — Smoke Test")
    print("=" * 50)

    # Generate synthetic price data for testing
    np.random.seed(42)
    dates = pd.date_range('2025-01-01', periods=300, freq='B')
    tickers = ['NVDA', 'AMD', 'AVGO']
    prices = pd.DataFrame(
        {t: 100 * np.cumprod(1 + np.random.normal(0.001, 0.02, len(dates)))
         for t in tickers},
        index=dates
    )

    engine = FeatureEngine()

    # Test equity segment
    result = engine.compute_all(
        segment_id='eq-semi-ai-accel',
        category='equities',
        tickers=tickers,
        prices_df=prices,
        headlines=[
            "NVDA beats earnings expectations, raises guidance",
            "AMD faces headwinds in data center market",
            "Broadcom reports strong AI networking demand",
            "Semiconductor stocks rally on AI spending forecasts",
            "Analysts warn of overvaluation in chip sector",
        ],
        run_date=datetime(2026, 3, 22),
    )

    print(f"\nSegment: {result['segment_id']}")
    print(f"Category: {result['category']}")
    print(f"Features computed: {result['feature_count']}")
    print(f"Applicable pillars: {result['applicable_pillars']}")
    print(f"Null features: {result['null_features']}")

    # Print momentum scores
    if 'momentum' in result['pillar_1_quantitative']:
        print("\nMomentum Scores:")
        for ticker, data in result['pillar_1_quantitative']['momentum'].items():
            print(f"  {ticker}: 6m return = {data.get('ret_6m', 'N/A'):.3f}, "
                  f"vol-adj = {data.get('vol_adj_momentum', 'N/A'):.3f}")

    # Print sentiment
    if 'news' in result['pillar_2_sentiment']:
        news = result['pillar_2_sentiment']['news']
        print(f"\nNews Sentiment: mean={news['mean_sentiment']:.3f}, "
              f"positive={news['pct_positive']:.0%}, negative={news['pct_negative']:.0%}")

    # Print calendar
    if 'calendar' in result['pillar_3_behavioral']:
        cal = result['pillar_3_behavioral']['calendar']
        print(f"\nCalendar: month_bias={cal['month_bias']:.1f}, "
              f"composite={cal['seasonality_composite']:.2f}")

    print("\n✅ Smoke test passed!")
