# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 06 — Technical Features: pandas-ta Indicators for technical_quant Agent
# MAGIC **Runs:** Nightly at 17:45 UTC

# COMMAND ----------

# MAGIC %run ../shared/config
# MAGIC %run ../shared/utils
# MAGIC %run ../shared/db

# COMMAND ----------

import subprocess
subprocess.run(["pip", "install", "pandas-ta", "yfinance", "-q"], capture_output=True)

import json
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
import mlflow

try:
    import pandas_ta as ta
    USE_PANDAS_TA = True
except ImportError:
    USE_PANDAS_TA = False

LOOKBACK_DAYS = 280
print(f"[06_technical_features] as_of={AS_OF_TS[:19]}  pandas_ta={USE_PANDAS_TA}")

# COMMAND ----------

# MAGIC %md ## 1. OHLCV Pull

# COMMAND ----------

def pull_ohlcv(ticker: str) -> pd.DataFrame | None:
    as_of  = AS_OF_TS
    end_dt = datetime.utcnow()
    start  = (end_dt - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    try:
        raw = yf.download(ticker, start=start, end=end_dt.strftime("%Y-%m-%d"),
                          progress=False, auto_adjust=True)
        if raw.empty or len(raw) < 50:
            return None
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw[["Open","High","Low","Close","Volume"]].copy()
        df.columns = ["open","high","low","close","volume"]
        df = df.dropna(subset=["close"])
        snap(f"yfinance:{ticker}", {"rows": len(df), "last": str(df.index[-1].date())}, as_of)
        print(f"  {ticker:10s}: {len(df)} bars  last={df.index[-1].date()}  close={df['close'].iloc[-1]:.2f}")
        return df
    except Exception as e:
        print(f"  {ticker}: {e}")
        return None


price_data = {t: df for t in ALL_TICKERS if (df := pull_ohlcv(t)) is not None}
print(f"\n{len(price_data)}/{len(ALL_TICKERS)} assets loaded")

# COMMAND ----------

# MAGIC %md ## 2. Indicator Helpers (manual fallbacks for all indicators)

# COMMAND ----------

def rsi_manual(s, period=14):
    d = s.diff(); g = d.clip(lower=0); l = (-d).clip(lower=0)
    ag = g.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    al = l.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    return 100 - 100/(1 + ag/al.replace(0, np.nan))

def atr_manual(df, period=14):
    hl = df["high"]-df["low"]
    hc = (df["high"]-df["close"].shift()).abs()
    lc = (df["low"]-df["close"].shift()).abs()
    tr = pd.concat([hl,hc,lc],axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, min_periods=period, adjust=False).mean()

def macd_manual(s, fast=12, slow=26, signal=9):
    ml = s.ewm(span=fast,adjust=False).mean() - s.ewm(span=slow,adjust=False).mean()
    ms = ml.ewm(span=signal,adjust=False).mean()
    return ml, ms, ml-ms

def adx_manual(df, period=14):
    up = df["high"].diff(); dn = -df["low"].diff()
    pdm = up.where((up>dn)&(up>0), 0.0); mdm = dn.where((dn>up)&(dn>0), 0.0)
    tr  = atr_manual(df, period)
    pdi = 100*pdm.ewm(alpha=1/period,adjust=False).mean()/tr.replace(0,np.nan)
    mdi = 100*mdm.ewm(alpha=1/period,adjust=False).mean()/tr.replace(0,np.nan)
    dx  = 100*(pdi-mdi).abs()/(pdi+mdi).replace(0,np.nan)
    return dx.ewm(alpha=1/period,adjust=False).mean()

def obv_manual(df):
    return (np.sign(df["close"].diff()).fillna(0)*df["volume"]).cumsum()

def mfi_manual(df, period=14):
    tp  = (df["high"]+df["low"]+df["close"])/3
    rmf = tp*df["volume"]
    tc  = tp.diff()
    pos = rmf.where(tc>0, 0.0).rolling(period).sum()
    neg = rmf.where(tc<0, 0.0).rolling(period).sum()
    return 100 - 100/(1 + pos/neg.replace(0,np.nan))

def last(series):
    try:
        v = series.dropna().iloc[-1]
        return float(v) if not np.isnan(v) else None
    except Exception:
        return None

# COMMAND ----------

# MAGIC %md ## 3. Feature Computation

# COMMAND ----------

def compute_features(ticker: str, df: pd.DataFrame) -> dict:
    close = df["close"]
    n     = len(close)
    f     = {"ticker": ticker, "as_of_ts": AS_OF_TS, "n_bars": n}

    # RSI
    f["rsi_14"] = last(rsi_manual(close, 14))
    f["rsi_7"]  = last(rsi_manual(close, 7))
    if f["rsi_14"]:
        f["rsi_14_zone"] = ("oversold" if f["rsi_14"]<30 else "overbought" if f["rsi_14"]>70 else "neutral")

    # ROC
    f["roc_10"] = last(close.pct_change(10))
    f["roc_21"] = last(close.pct_change(21))

    # MACD
    if n >= 35:
        ml, ms, mh = macd_manual(close)
        f["macd_line"] = last(ml); f["macd_signal"] = last(ms); f["macd_hist"] = last(mh)
        if f.get("macd_line") and f.get("macd_signal"):
            f["macd_bullish"] = int(f["macd_line"] > f["macd_signal"])

    # EMA ratios
    if n >= 200:
        ema20  = last(close.ewm(span=20,adjust=False).mean())
        ema50  = last(close.ewm(span=50,adjust=False).mean())
        ema200 = last(close.ewm(span=200,adjust=False).mean())
        if ema50  and ema50  > 0: f["ema_20_50_ratio"]  = ema20/ema50
        if ema200 and ema200 > 0: f["ema_50_200_ratio"] = ema50/ema200 if ema50 else None
        f["above_ema50"]  = int(close.iloc[-1] > ema50)  if ema50  else None
        f["above_ema200"] = int(close.iloc[-1] > ema200) if ema200 else None

    # ADX
    if n >= 28:
        f["adx_14"] = last(adx_manual(df, 14))
        if f.get("adx_14"):
            f["trend_strength"] = ("strong" if f["adx_14"]>25 else "weak" if f["adx_14"]<15 else "moderate")

    # Bollinger
    if n >= 20:
        bm = close.rolling(20).mean(); bs = close.rolling(20).std()
        bu = bm + 2*bs; bl = bm - 2*bs
        f["bb_width"] = last((bu-bl)/bm)
        f["bb_pct_b"] = last((close-bl)/(bu-bl))

    # ATR
    f["atr_14"] = last(atr_manual(df, 14))
    if f.get("atr_14") and close.iloc[-1] > 0:
        f["atr_14_pct"] = f["atr_14"] / close.iloc[-1]

    # HV
    lr = np.log(close/close.shift(1))
    if n >= 21: f["hv_21"] = last(lr.rolling(21).std()) * np.sqrt(252)
    if n >= 63: f["hv_63"] = last(lr.rolling(63).std()) * np.sqrt(252)

    # OBV
    if df["volume"].sum() > 0:
        obv = obv_manual(df)
        f["obv_trend"] = float(np.sign(obv.iloc[-1] - obv.ewm(span=20,adjust=False).mean().iloc[-1]))

    # Volume ratio
    if df["volume"].sum() > 0 and n >= 20:
        v5 = df["volume"].rolling(5).mean().iloc[-1]
        v20= df["volume"].rolling(20).mean().iloc[-1]
        f["volume_ratio_5_20"] = float(v5/v20) if v20 > 0 else None

    # MFI
    if df["volume"].sum() > 0 and n >= 14:
        f["mfi_14"] = last(mfi_manual(df, 14))

    return f


features_by_ticker = {}
for ticker, df in price_data.items():
    f = compute_features(ticker, df)
    features_by_ticker[ticker] = f
    print(f"  {ticker:10s}  RSI14={fmt(f.get('rsi_14'),'.1f')}  "
          f"ADX={fmt(f.get('adx_14'),'.1f')}  HV21={fmt(f.get('hv_21'),'.1%') if f.get('hv_21') else 'N/A'}")

# COMMAND ----------

# MAGIC %md ## 4. Cross-Asset Correlations + Breadth

# COMMAND ----------

def xasset_corr(a, b, window=60):
    if a not in price_data or b not in price_data: return None
    ar = np.log(price_data[a]["close"]/price_data[a]["close"].shift(1))
    br = np.log(price_data[b]["close"]/price_data[b]["close"].shift(1))
    al = pd.concat([ar,br],axis=1).dropna()
    if len(al) < window: return None
    c = al.iloc[:,0].rolling(window).corr(al.iloc[:,1]).iloc[-1]
    return float(c) if not np.isnan(c) else None

cross_asset = {
    "corr_spy_tlt_60d": xasset_corr("SPY","TLT"),
    "corr_spy_gld_60d": xasset_corr("SPY","GLD"),
    "corr_spy_btc_60d": xasset_corr("SPY","BTC-USD"),
    "corr_spy_qqq_60d": xasset_corr("SPY","QQQ"),
    "corr_spy_iwm_60d": xasset_corr("SPY","IWM"),
}
for k, v in cross_asset.items():
    print(f"  {k}: {fmt(v,'+.3f')}")

above_50  = [f.get("above_ema50",0)  for f in features_by_ticker.values() if f.get("above_ema50") is not None]
above_200 = [f.get("above_ema200",0) for f in features_by_ticker.values() if f.get("above_ema200") is not None]
regime_breadth = {
    "pct_above_50d_ma":  float(np.mean(above_50))  if above_50  else None,
    "pct_above_200d_ma": float(np.mean(above_200)) if above_200 else None,
    "breadth_regime":    ("risk_on" if above_200 and np.mean(above_200)>0.70 else
                          "risk_off" if above_200 and np.mean(above_200)<0.40 else "mixed"),
    "as_of_ts": AS_OF_TS,
}
print(f"\nBreadth: {pct(regime_breadth.get('pct_above_200d_ma'))} above 200d MA  "
      f"({regime_breadth['breadth_regime']})")

# COMMAND ----------

# MAGIC %md ## 5. Write to Supabase + MLflow

# COMMAND ----------

# technical_features_log
rows = []
for f in features_by_ticker.values():
    rows.append((f.get("as_of_ts"), f.get("ticker"),
                 safe_float(f.get("rsi_14")), safe_float(f.get("rsi_7")), f.get("rsi_14_zone"),
                 safe_float(f.get("macd_hist")), safe_int(f.get("macd_bullish")),
                 safe_float(f.get("adx_14")), f.get("trend_strength"),
                 safe_int(f.get("above_ema50")), safe_int(f.get("above_ema200")),
                 safe_float(f.get("hv_21")), safe_float(f.get("hv_63")),
                 safe_float(f.get("bb_width")), safe_float(f.get("atr_14_pct")),
                 safe_float(f.get("volume_ratio_5_20")), safe_float(f.get("mfi_14"))))

n = upsert_rows("technical_features_log",
    ["as_of_ts","ticker","rsi_14","rsi_7","rsi_14_zone","macd_hist","macd_bullish",
     "adx_14","trend_strength","above_ema50","above_ema200","hv_21","hv_63",
     "bb_width","atr_14_pct","volume_ratio_5_20","mfi_14"],
    rows, ["as_of_ts","ticker"])
print(f"technical_features_log: {n} rows upserted")

# Update market_context_log with breadth + cross-asset
# (partial update — market_context_log row was created by 05_data_feeds)
with __import__("psycopg2").connect(__import__("os").environ.get("SUPABASE_DB_URL","")) as conn:
    pass  # breadth/corr columns updated via upsert in 07_supabase_backfill if 05 ran first

mlflow.set_experiment(EXPERIMENT_NAME)
with mlflow.start_run(run_name="06_technical_features") as run:
    mlflow.log_params({"as_of_ts": AS_OF_TS, "n_tickers": len(features_by_ticker)})
    for ticker, f in features_by_ticker.items():
        t = ticker.replace("-","_").lower()
        for m in ["rsi_14","adx_14","hv_21","hv_63","bb_width","volume_ratio_5_20"]:
            if f.get(m): mlflow.log_metric(f"{t}_{m}", float(f[m]))
    for k, v in cross_asset.items():
        if v: mlflow.log_metric(k, v)
    if regime_breadth.get("pct_above_200d_ma"):
        mlflow.log_metric("pct_above_200d_ma", regime_breadth["pct_above_200d_ma"])

    features_df = pd.DataFrame(list(features_by_ticker.values()))
    features_df.to_parquet("/tmp/technical_features.parquet", index=False)
    with open("/tmp/technical_quant_context.json","w") as f:
        json.dump({"regime_breadth": regime_breadth, "cross_asset": cross_asset,
                   "asset_signals": {t: {k: v for k,v in f.items()
                                         if k in ["rsi_14","rsi_14_zone","macd_bullish",
                                                  "trend_strength","above_ema200","hv_21"]}
                                     for t, f in features_by_ticker.items()}}, f, default=str)
    mlflow.log_artifact("/tmp/technical_features.parquet", artifact_path="data")
    mlflow.log_artifact("/tmp/technical_quant_context.json", artifact_path="data")
    log_snapshots_artifact(run)
    print(f"MLflow run: {run.info.run_id}")

# COMMAND ----------

# MAGIC %md ## 6. Invariants

# COMMAND ----------

rsi_vals = [f["rsi_14"] for f in features_by_ticker.values() if f.get("rsi_14") is not None]
assert all(0 <= r <= 100 for r in rsi_vals), f"RSI out of range: {rsi_vals}"
print("T1 PASS: RSI in [0,100]")

assert all(-1<=c<=1 for c in cross_asset.values() if c is not None), "Correlations out of [-1,1]"
print("T2 PASS: correlations in [-1,1]")

assert all(f.get("as_of_ts") for f in features_by_ticker.values()), "Missing as_of_ts"
print("T3 PASS: as_of_ts stamped")

if regime_breadth.get("pct_above_200d_ma") is not None:
    assert 0 <= regime_breadth["pct_above_200d_ma"] <= 1, "Breadth out of [0,1]"
    print("T4 PASS: breadth in [0,1]")

print("\nAll invariants passed.")
