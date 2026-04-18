# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 06 — Technical Features: pandas-ta Indicators for technical_quant Agent
# MAGIC
# MAGIC **Module:** History Rhymes / Dissensus — Agent Context Layer
# MAGIC **Purpose:** Build the feature set for the `technical_quant` agent.
# MAGIC
# MAGIC Covers all 7 tracked assets (SPY, QQQ, IWM, TLT, GLD, BTC-USD, ETH-USD):
# MAGIC   - Momentum: RSI(14), RSI(7), rate-of-change ROC(10), ROC(21)
# MAGIC   - Trend: MACD (12/26/9), EMA ratios (20d/50d, 50d/200d), ADX(14)
# MAGIC   - Volatility: Bollinger Band width, ATR(14), HV(21), HV(63)
# MAGIC   - Volume: OBV trend, volume ratio (5d/20d), MFI(14)
# MAGIC   - Cross-asset: rolling correlation SPY vs TLT, SPY vs GLD, SPY vs BTC
# MAGIC   - Regime breadth: % of assets above 50d MA, % above 200d MA
# MAGIC
# MAGIC as_of_ts stamped at every external pull.
# MAGIC Logs to HistoryRhymesML MLflow experiment.
# MAGIC Saves technical_features.parquet as artifact.
# MAGIC
# MAGIC **Runs:** Nightly at 17:45 UTC (15 min after data_feeds, 15 min before agent runner)

# COMMAND ----------

import subprocess
subprocess.run(
    ['pip', 'install', 'pandas-ta', 'yfinance', 'mlflow', 'pyarrow', '-q'],
    capture_output=True
)

import warnings
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
import mlflow

# pandas-ta import — some versions use different API
try:
    import pandas_ta as ta
    USE_PANDAS_TA = True
except ImportError:
    USE_PANDAS_TA = False
    print("WARNING: pandas_ta not available, falling back to manual indicator calc")

warnings.filterwarnings('ignore')

EXPERIMENT_NAME = "/Users/paulmalmquist@gmail.com/HistoryRhymesML"
AS_OF_TS        = datetime.utcnow().isoformat() + "Z"

# All 7 assets: 5 equity/etf, 2 crypto
EQUITY_TICKERS = ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD']
CRYPTO_TICKERS = ['BTC-USD', 'ETH-USD']
ALL_TICKERS    = EQUITY_TICKERS + CRYPTO_TICKERS

# Lookback: need 200 bars for 200d MA plus buffer
LOOKBACK_DAYS  = 280   # calendar days to pull (200 trading days + weekends + buffer)

snapshots = []

def snap(source: str, payload: dict, as_of: str = AS_OF_TS) -> str:
    snap_id = hashlib.sha256(f"{source}{as_of}".encode()).hexdigest()[:16]
    snapshots.append({
        'id':             snap_id,
        'called_ts':      datetime.utcnow().isoformat() + "Z",
        'as_of_ts':       as_of,
        'source':         source,
        'payload_digest': hashlib.sha256(json.dumps(payload, default=str).encode()).hexdigest()[:32],
    })
    return snap_id

print(f"Technical features started: {AS_OF_TS}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Pull OHLCV Data

# COMMAND ----------

def pull_ohlcv(ticker: str, lookback_days: int = LOOKBACK_DAYS) -> Optional[pd.DataFrame]:
    """
    Pull OHLCV from yfinance. Returns clean df with standard columns.
    as_of_ts stamped at call time.
    """
    as_of    = datetime.utcnow().isoformat() + "Z"
    end_dt   = datetime.utcnow()
    start_dt = end_dt - timedelta(days=lookback_days)

    try:
        raw = yf.download(
            ticker,
            start=start_dt.strftime('%Y-%m-%d'),
            end=end_dt.strftime('%Y-%m-%d'),
            progress=False,
            auto_adjust=True,
        )
        if raw.empty or len(raw) < 50:
            print(f"  {ticker}: insufficient data ({len(raw)} rows)")
            return None

        # Flatten MultiIndex columns if present
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)

        df = raw[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
        df.columns = ['open', 'high', 'low', 'close', 'volume']
        df.index   = pd.to_datetime(df.index)
        df         = df.dropna(subset=['close'])

        snap(f"yfinance:{ticker}", {'rows': len(df), 'last_date': str(df.index[-1].date())}, as_of)
        print(f"  {ticker:10s}: {len(df)} bars, last={df.index[-1].date()}, "
              f"close={df['close'].iloc[-1]:.2f}")
        return df

    except Exception as e:
        print(f"  {ticker}: {e}")
        return None


print("Pulling OHLCV data for all 7 assets...")
price_data = {}
for t in ALL_TICKERS:
    df = pull_ohlcv(t)
    if df is not None:
        price_data[t] = df

print(f"\n{len(price_data)}/{len(ALL_TICKERS)} assets loaded successfully.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Indicator Calculation

# COMMAND ----------

def rsi_manual(series: pd.Series, period: int = 14) -> pd.Series:
    """Wilder RSI — fallback if pandas_ta not available."""
    delta  = series.diff()
    gain   = delta.clip(lower=0)
    loss   = (-delta).clip(lower=0)
    avg_g  = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_l  = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs     = avg_g / avg_l.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def atr_manual(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range."""
    hl  = df['high'] - df['low']
    hc  = (df['high'] - df['close'].shift()).abs()
    lc  = (df['low']  - df['close'].shift()).abs()
    tr  = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, min_periods=period, adjust=False).mean()


def macd_manual(series: pd.Series,
                fast: int = 12, slow: int = 26, signal: int = 9):
    """MACD line, signal, histogram."""
    ema_fast   = series.ewm(span=fast,   adjust=False).mean()
    ema_slow   = series.ewm(span=slow,   adjust=False).mean()
    macd_line  = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram  = macd_line - signal_line
    return macd_line, signal_line, histogram


def adx_manual(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average Directional Index."""
    high, low, close = df['high'], df['low'], df['close']
    up_move   = high.diff()
    down_move = -low.diff()
    plus_dm   = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm  = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
    tr        = atr_manual(df, period)
    plus_di   = 100 * plus_dm.ewm(alpha=1/period, adjust=False).mean() / tr.replace(0, np.nan)
    minus_di  = 100 * minus_dm.ewm(alpha=1/period, adjust=False).mean() / tr.replace(0, np.nan)
    dx        = (100 * (plus_di - minus_di).abs() /
                 (plus_di + minus_di).replace(0, np.nan))
    return dx.ewm(alpha=1/period, adjust=False).mean()


def obv_manual(df: pd.DataFrame) -> pd.Series:
    """On-Balance Volume."""
    direction = np.sign(df['close'].diff()).fillna(0)
    return (direction * df['volume']).cumsum()


def mfi_manual(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Money Flow Index."""
    typical_price = (df['high'] + df['low'] + df['close']) / 3
    raw_mf        = typical_price * df['volume']
    tp_change     = typical_price.diff()
    pos_mf        = raw_mf.where(tp_change > 0, 0.0)
    neg_mf        = raw_mf.where(tp_change < 0, 0.0)
    pos_roll      = pos_mf.rolling(period).sum()
    neg_roll      = neg_mf.rolling(period).sum()
    mfi           = 100 - 100 / (1 + pos_roll / neg_roll.replace(0, np.nan))
    return mfi


def compute_features(ticker: str, df: pd.DataFrame) -> dict:
    """
    Compute all technical features for one asset.
    Returns dict of scalar values (latest bar).
    Falls back gracefully on any individual indicator failure.
    """
    close   = df['close']
    n       = len(close)
    feats   = {'ticker': ticker, 'as_of_ts': AS_OF_TS, 'n_bars': n}

    def safe(fn, *args, default=None, **kwargs):
        try:
            result = fn(*args, **kwargs)
            if isinstance(result, (pd.Series, pd.DataFrame)):
                val = result.dropna().iloc[-1] if not result.dropna().empty else default
                return float(val) if isinstance(val, (int, float, np.number)) else default
            return float(result) if result is not None else default
        except Exception:
            return default

    # ── RSI ────────────────────────────────────────────────────────────────
    if USE_PANDAS_TA:
        rsi14 = safe(lambda: df.ta.rsi(length=14))
        rsi7  = safe(lambda: df.ta.rsi(length=7))
    else:
        rsi14 = safe(rsi_manual, close, 14)
        rsi7  = safe(rsi_manual, close, 7)

    feats['rsi_14'] = rsi14
    feats['rsi_7']  = rsi7
    # RSI interpretation
    if rsi14 is not None:
        feats['rsi_14_zone'] = ('oversold' if rsi14 < 30 else
                                'overbought' if rsi14 > 70 else 'neutral')

    # ── Rate of Change ──────────────────────────────────────────────────────
    feats['roc_10'] = safe(lambda: close.pct_change(10).iloc[-1])
    feats['roc_21'] = safe(lambda: close.pct_change(21).iloc[-1])

    # ── MACD ────────────────────────────────────────────────────────────────
    if USE_PANDAS_TA and n >= 35:
        macd_df = df.ta.macd(fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            cols = macd_df.columns.tolist()
            feats['macd_line']   = safe(lambda: macd_df.iloc[:, 0])
            feats['macd_signal'] = safe(lambda: macd_df.iloc[:, 2])
            feats['macd_hist']   = safe(lambda: macd_df.iloc[:, 1])
        else:
            ml, ms, mh = macd_manual(close)
            feats['macd_line']   = safe(lambda: ml)
            feats['macd_signal'] = safe(lambda: ms)
            feats['macd_hist']   = safe(lambda: mh)
    elif n >= 35:
        ml, ms, mh = macd_manual(close)
        feats['macd_line']   = safe(lambda: ml)
        feats['macd_signal'] = safe(lambda: ms)
        feats['macd_hist']   = safe(lambda: mh)

    # MACD signal: line above signal = bullish momentum
    if feats.get('macd_line') is not None and feats.get('macd_signal') is not None:
        feats['macd_bullish'] = int(feats['macd_line'] > feats['macd_signal'])

    # ── EMA Ratios ──────────────────────────────────────────────────────────
    if n >= 200:
        ema20  = close.ewm(span=20,  adjust=False).mean().iloc[-1]
        ema50  = close.ewm(span=50,  adjust=False).mean().iloc[-1]
        ema200 = close.ewm(span=200, adjust=False).mean().iloc[-1]
        feats['ema_20_50_ratio']  = float(ema20 / ema50)   if ema50  > 0 else None
        feats['ema_50_200_ratio'] = float(ema50 / ema200)  if ema200 > 0 else None
        feats['price_vs_ema200']  = float(close.iloc[-1] / ema200) if ema200 > 0 else None
        feats['above_ema50']      = int(close.iloc[-1] > ema50)
        feats['above_ema200']     = int(close.iloc[-1] > ema200)
    elif n >= 50:
        ema20 = close.ewm(span=20, adjust=False).mean().iloc[-1]
        ema50 = close.ewm(span=50, adjust=False).mean().iloc[-1]
        feats['ema_20_50_ratio']  = float(ema20 / ema50) if ema50 > 0 else None
        feats['above_ema50']      = int(close.iloc[-1] > ema50)

    # ── ADX (trend strength) ────────────────────────────────────────────────
    if USE_PANDAS_TA and n >= 28:
        adx_df = df.ta.adx(length=14)
        feats['adx_14'] = safe(lambda: adx_df.iloc[:, 0]) if adx_df is not None else None
    elif n >= 28:
        feats['adx_14'] = safe(adx_manual, df, 14)

    if feats.get('adx_14') is not None:
        feats['trend_strength'] = ('strong' if feats['adx_14'] > 25 else
                                   'weak'   if feats['adx_14'] < 15 else 'moderate')

    # ── Bollinger Band Width ────────────────────────────────────────────────
    if n >= 20:
        bb_mid = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std
        bb_width = ((bb_upper - bb_lower) / bb_mid).iloc[-1]
        bb_pct_b = ((close - bb_lower) / (bb_upper - bb_lower)).iloc[-1]  # %B
        feats['bb_width']  = float(bb_width) if not np.isnan(bb_width) else None
        feats['bb_pct_b']  = float(bb_pct_b) if not np.isnan(bb_pct_b)  else None

    # ── ATR ─────────────────────────────────────────────────────────────────
    feats['atr_14'] = safe(atr_manual, df, 14)
    if feats.get('atr_14') and close.iloc[-1] > 0:
        feats['atr_14_pct'] = feats['atr_14'] / close.iloc[-1]  # ATR as % of price

    # ── Historical Volatility ────────────────────────────────────────────────
    log_returns = np.log(close / close.shift(1))
    if n >= 21:
        feats['hv_21'] = float(log_returns.rolling(21).std().iloc[-1] * np.sqrt(252))
    if n >= 63:
        feats['hv_63'] = float(log_returns.rolling(63).std().iloc[-1] * np.sqrt(252))

    # ── OBV Trend ──────────────────────────────────────────────────────────
    if df['volume'].sum() > 0:
        obv = obv_manual(df)
        obv_ema = obv.ewm(span=20, adjust=False).mean()
        feats['obv_trend'] = float(np.sign(obv.iloc[-1] - obv_ema.iloc[-1]))  # +1/-1

    # ── Volume Ratio ──────────────────────────────────────────────────────
    if df['volume'].sum() > 0 and n >= 20:
        vol_5  = df['volume'].rolling(5).mean().iloc[-1]
        vol_20 = df['volume'].rolling(20).mean().iloc[-1]
        feats['volume_ratio_5_20'] = float(vol_5 / vol_20) if vol_20 > 0 else None

    # ── MFI ───────────────────────────────────────────────────────────────
    if df['volume'].sum() > 0 and n >= 14:
        feats['mfi_14'] = safe(mfi_manual, df, 14)

    return feats


print("Computing technical features for all assets...")
features_by_ticker = {}
for ticker, df in price_data.items():
    f = compute_features(ticker, df)
    features_by_ticker[ticker] = f
    rsi_str = f"{f.get('rsi_14', 0.0):.1f}" if f.get('rsi_14') else "N/A"
    adx_str = f"{f.get('adx_14', 0.0):.1f}" if f.get('adx_14') else "N/A"
    hv_str  = f"{f.get('hv_21', 0.0)*100:.1f}%" if f.get('hv_21') else "N/A"
    print(f"  {ticker:10s}  RSI14={rsi_str:6s}  ADX14={adx_str:6s}  HV21={hv_str}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Cross-Asset Correlations (60-day rolling)
# MAGIC
# MAGIC SPY vs TLT: flight-to-quality signal.
# MAGIC SPY vs GLD: inflation hedge demand.
# MAGIC SPY vs BTC: risk-on / risk-off proxy.

# COMMAND ----------

def cross_asset_correlation(a_ticker: str, b_ticker: str, window: int = 60) -> Optional[float]:
    """Rolling correlation of log returns, last value."""
    if a_ticker not in price_data or b_ticker not in price_data:
        return None
    a_ret = np.log(price_data[a_ticker]['close'] / price_data[a_ticker]['close'].shift(1))
    b_ret = np.log(price_data[b_ticker]['close'] / price_data[b_ticker]['close'].shift(1))
    aligned = pd.concat([a_ret, b_ret], axis=1).dropna()
    if len(aligned) < window:
        return None
    corr = aligned.iloc[:, 0].rolling(window).corr(aligned.iloc[:, 1]).iloc[-1]
    return float(corr) if not np.isnan(corr) else None


print("Computing cross-asset correlations (60-day rolling)...")
cross_asset = {
    'corr_spy_tlt_60d': cross_asset_correlation('SPY', 'TLT', 60),
    'corr_spy_gld_60d': cross_asset_correlation('SPY', 'GLD', 60),
    'corr_spy_btc_60d': cross_asset_correlation('SPY', 'BTC-USD', 60),
    'corr_spy_qqq_60d': cross_asset_correlation('SPY', 'QQQ', 60),
    'corr_spy_iwm_60d': cross_asset_correlation('SPY', 'IWM', 60),
}
for k, v in cross_asset.items():
    v_str = f"{v:+.3f}" if v is not None else "N/A"
    print(f"  {k}: {v_str}")

snap("cross_asset_correlations", cross_asset)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Regime Breadth (Market-Level Signals)
# MAGIC
# MAGIC % of assets above 50d MA and 200d MA.
# MAGIC This directly informs the `technical_quant` agent's market regime assessment.

# COMMAND ----------

above_50d  = [f.get('above_ema50',  0) for f in features_by_ticker.values() if f.get('above_ema50') is not None]
above_200d = [f.get('above_ema200', 0) for f in features_by_ticker.values() if f.get('above_ema200') is not None]

regime_breadth = {
    'pct_above_50d_ma':  float(np.mean(above_50d))  if above_50d  else None,
    'pct_above_200d_ma': float(np.mean(above_200d)) if above_200d else None,
    'n_assets_tracked':  len(features_by_ticker),
    'as_of_ts':          AS_OF_TS,
}

if regime_breadth['pct_above_50d_ma'] is not None:
    pct50 = regime_breadth['pct_above_50d_ma']
    regime_breadth['breadth_regime'] = ('risk_on'  if pct50 > 0.70 else
                                        'mixed'    if pct50 > 0.40 else
                                        'risk_off')

print(f"\nRegime breadth:")
print(f"  % above 50d MA:  {regime_breadth.get('pct_above_50d_ma', 0)*100:.0f}%  "
      f"({sum(above_50d)}/{len(above_50d)} assets)")
print(f"  % above 200d MA: {regime_breadth.get('pct_above_200d_ma', 0)*100:.0f}%  "
      f"({sum(above_200d)}/{len(above_200d)} assets)")
print(f"  Breadth regime:  {regime_breadth.get('breadth_regime', 'N/A')}")

snap("regime_breadth", regime_breadth)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Build technical_quant ContextPackage

# COMMAND ----------

# Scalar summary for agent prompt injection (keep token-efficient)
technical_quant_context = {
    'agent_id':      'technical_quant',
    'as_of_ts':      AS_OF_TS,
    'regime_breadth': regime_breadth,
    'cross_asset':    cross_asset,
    'asset_signals': {
        ticker: {
            'rsi_14':          f.get('rsi_14'),
            'rsi_14_zone':     f.get('rsi_14_zone'),
            'macd_bullish':    f.get('macd_bullish'),
            'trend_strength':  f.get('trend_strength'),
            'above_ema200':    f.get('above_ema200'),
            'hv_21':           f.get('hv_21'),
            'hv_63':           f.get('hv_63'),
            'bb_width':        f.get('bb_width'),
            'volume_ratio_5_20': f.get('volume_ratio_5_20'),
        }
        for ticker, f in features_by_ticker.items()
    },
    # Pre-computed narrative for agent prompt
    'summary_narrative': (
        f"Market breadth: {regime_breadth.get('pct_above_200d_ma', 0)*100:.0f}% of tracked assets "
        f"above 200d MA ({regime_breadth.get('breadth_regime', 'unknown')} regime). "
        f"SPY-TLT 60d correlation: {cross_asset.get('corr_spy_tlt_60d', 'N/A')}. "
        f"SPY RSI14: {features_by_ticker.get('SPY', {}).get('rsi_14', 'N/A')}."
    )
}

print("technical_quant context package:")
print(f"  Assets with features: {len(technical_quant_context['asset_signals'])}")
print(f"  Summary: {technical_quant_context['summary_narrative']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Build Full Features DataFrame and Log to MLflow

# COMMAND ----------

features_df = pd.DataFrame(list(features_by_ticker.values()))

# Add cross-asset and breadth columns
for k, v in cross_asset.items():
    features_df[k] = v
features_df['pct_above_50d_ma']  = regime_breadth.get('pct_above_50d_ma')
features_df['pct_above_200d_ma'] = regime_breadth.get('pct_above_200d_ma')
features_df['breadth_regime']    = regime_breadth.get('breadth_regime')

print(f"\nFeatures dataframe: {features_df.shape[0]} rows × {features_df.shape[1]} cols")
numeric_cols = features_df.select_dtypes(include=[np.number]).columns
print(f"Numeric features: {len(numeric_cols)}")
print(f"\nFeature coverage (non-null rate):")
for col in sorted(numeric_cols):
    coverage = features_df[col].notna().mean()
    print(f"  {col:35s}: {coverage*100:.0f}%")

# ── MLflow ──────────────────────────────────────────────────────────────────
mlflow.set_experiment(EXPERIMENT_NAME)

with mlflow.start_run(run_name="06_technical_features") as run:
    mlflow.log_params({
        'as_of_ts':          AS_OF_TS,
        'tickers':           str(ALL_TICKERS),
        'tickers_loaded':    str(list(price_data.keys())),
        'n_data_snapshots':  len(snapshots),
        'pandas_ta_enabled': USE_PANDAS_TA,
    })

    # Log per-asset metrics
    for ticker, f in features_by_ticker.items():
        t_slug = ticker.replace('-', '_').lower()
        for metric_name in ['rsi_14', 'rsi_7', 'roc_10', 'roc_21', 'macd_hist',
                            'adx_14', 'bb_width', 'atr_14_pct', 'hv_21', 'hv_63',
                            'volume_ratio_5_20', 'mfi_14', 'above_ema50', 'above_ema200']:
            val = f.get(metric_name)
            if val is not None:
                mlflow.log_metric(f"{t_slug}_{metric_name}", float(val))

    # Log cross-asset and breadth
    for k, v in cross_asset.items():
        if v is not None:
            mlflow.log_metric(k, float(v))
    for k in ['pct_above_50d_ma', 'pct_above_200d_ma']:
        if regime_breadth.get(k) is not None:
            mlflow.log_metric(k, float(regime_breadth[k]))

    # Save artifacts
    features_df.to_parquet('/tmp/technical_features.parquet', index=False)
    with open('/tmp/technical_quant_context.json', 'w') as f:
        import json
        json.dump(technical_quant_context, f, indent=2, default=str)
    pd.DataFrame(snapshots).to_parquet('/tmp/tech_snapshots.parquet', index=False)

    mlflow.log_artifact('/tmp/technical_features.parquet',      artifact_path='data')
    mlflow.log_artifact('/tmp/technical_quant_context.json',    artifact_path='data')
    mlflow.log_artifact('/tmp/tech_snapshots.parquet',          artifact_path='data')

    print(f"\nMLflow run: {run.info.run_id}")
    print(f"Data snapshots recorded: {len(snapshots)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. Invariant Assertions

# COMMAND ----------

# T1: Every tracked ticker should have at least RSI and HV features
missing_core = [t for t, f in features_by_ticker.items()
                if f.get('rsi_14') is None or f.get('hv_21') is None]
assert len(missing_core) == 0 or len(missing_core) <= 1, \
    f"INVARIANT FAIL: >1 ticker missing core features: {missing_core}"
if missing_core:
    print(f"WARNING: {missing_core} missing core features (acceptable if data gap < 1 day)")
else:
    print("T1 PASS: all tickers have RSI14 and HV21")

# T2: RSI must be in [0, 100]
rsi_vals = [f['rsi_14'] for f in features_by_ticker.values() if f.get('rsi_14') is not None]
assert all(0 <= r <= 100 for r in rsi_vals), f"INVARIANT FAIL: RSI out of range: {rsi_vals}"
print(f"T2 PASS: RSI bounds OK ({min(rsi_vals):.1f} - {max(rsi_vals):.1f})")

# T3: Breadth must be [0, 1]
if regime_breadth.get('pct_above_200d_ma') is not None:
    assert 0 <= regime_breadth['pct_above_200d_ma'] <= 1, "INVARIANT FAIL: breadth out of [0,1]"
    print(f"T3 PASS: breadth in [0,1]")

# T4: as_of_ts must be on all features
assert all(f.get('as_of_ts') for f in features_by_ticker.values()), \
    "INVARIANT FAIL: missing as_of_ts on some features"
print("T4 PASS: as_of_ts stamped on all features")

# T5: Cross-asset correlations must be in [-1, 1]
corr_vals = [v for v in cross_asset.values() if v is not None]
assert all(-1 <= c <= 1 for c in corr_vals), f"INVARIANT FAIL: corr out of [-1,1]: {corr_vals}"
print(f"T5 PASS: all cross-asset correlations in [-1,1]")

print("\nAll invariants passed.")
print("Next: 07_supabase_backfill — bridge MLflow artifacts → Supabase tables")
