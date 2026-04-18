# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 05 — Data Feeds: Sentiment, News, VIX Term Structure, Put/Call Ratio
# MAGIC **Runs:** Nightly at 17:30 UTC

# COMMAND ----------

# MAGIC %run ../shared/config
# MAGIC %run ../shared/utils
# MAGIC %run ../shared/db

# COMMAND ----------

import subprocess
subprocess.run(["pip", "install", "requests", "-q"], capture_output=True)

import json
import requests
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import mlflow

FINNHUB_KEY = ""
try:
    FINNHUB_KEY = dbutils.secrets.get(scope="winston", key="finnhub_api_key")  # noqa: F821
except Exception:
    import os
    FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
    if not FINNHUB_KEY:
        print("WARNING: No Finnhub key — news/analyst pulls will be skipped.")

print(f"[05_data_feeds] as_of={AS_OF_TS[:19]}  finnhub={'enabled' if FINNHUB_KEY else 'disabled'}")

# COMMAND ----------

# MAGIC %md ## 1. Finnhub News Sentiment

# COMMAND ----------

def pull_finnhub_news(symbol: str, days_back: int = 3) -> dict:
    if not FINNHUB_KEY:
        return {"symbol": symbol, "sentiment_score": None, "n_articles": 0,
                "as_of_ts": AS_OF_TS, "snapshot_id": None}

    end_date   = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days_back)).isoformat()
    as_of      = AS_OF_TS
    url = (f"https://finnhub.io/api/v1/company-news"
           f"?symbol={symbol}&from={start_date}&to={end_date}&token={FINNHUB_KEY}")
    try:
        resp     = requests.get(url, timeout=15)
        articles = resp.json()
        snap_id  = snap(f"finnhub:news:{symbol}", {"n": len(articles)}, as_of)
        if not articles:
            return {"symbol": symbol, "sentiment_score": 0.0, "n_articles": 0,
                    "as_of_ts": as_of, "snapshot_id": snap_id, "headlines": []}

        pos_kw = ["surge","rally","gain","rise","beat","strong","record",
                  "growth","upgrade","bullish","outperform","high"]
        neg_kw = ["fall","drop","plunge","miss","weak","cut","loss",
                  "crash","downgrade","bearish","underperform","low",
                  "concern","fear","risk","warn"]
        scores = []
        for a in articles[:20]:
            h   = (a.get("headline") or "").lower()
            pos = sum(1 for k in pos_kw if k in h)
            neg = sum(1 for k in neg_kw if k in h)
            scores.append((pos - neg) / max(pos + neg, 1))

        return {"symbol": symbol, "sentiment_score": float(np.mean(scores)),
                "n_articles": len(articles), "as_of_ts": as_of,
                "snapshot_id": snap_id,
                "headlines": [a.get("headline","") for a in articles[:5]]}
    except Exception as e:
        print(f"  finnhub news {symbol}: {e}")
        return {"symbol": symbol, "sentiment_score": None, "n_articles": 0,
                "as_of_ts": AS_OF_TS, "snapshot_id": None}


news_results = {}
for sym in EQUITY_SYMBOLS:
    r = pull_finnhub_news(sym)
    news_results[sym] = r
    s = f"{r['sentiment_score']:+.3f}" if r["sentiment_score"] is not None else "N/A"
    print(f"  {sym:5s}  sentiment={s}  articles={r['n_articles']}")

# COMMAND ----------

# MAGIC %md ## 2. Finnhub Analyst Dispersion (Phase 2 gate proxy)

# COMMAND ----------

def pull_analyst_dispersion(symbol: str) -> dict:
    if not FINNHUB_KEY:
        return {"symbol": symbol, "dispersion": None, "n_analysts": 0,
                "as_of_ts": AS_OF_TS, "snapshot_id": None}
    as_of = AS_OF_TS
    url   = f"https://finnhub.io/api/v1/stock/price-target?symbol={symbol}&token={FINNHUB_KEY}"
    try:
        data    = requests.get(url, timeout=15).json()
        snap_id = snap(f"finnhub:price_target:{symbol}", data, as_of)
        targets = [t for t in [data.get("targetHigh"), data.get("targetLow"),
                                data.get("targetMean"), data.get("targetMedian")]
                   if t and t > 0]
        if len(targets) < 2:
            return {"symbol": symbol, "dispersion": None, "n_analysts": 0,
                    "as_of_ts": as_of, "snapshot_id": snap_id}
        disp = float(np.std(targets) / np.mean(targets)) if np.mean(targets) > 0 else None
        spread = ((data.get("targetHigh",0) - data.get("targetLow",0))
                  / max(data.get("targetMean",1),1))
        return {"symbol": symbol, "dispersion": disp, "spread_pct": float(spread),
                "target_mean": data.get("targetMean"), "n_analysts": data.get("numberOfAnalysts",0),
                "as_of_ts": as_of, "snapshot_id": snap_id}
    except Exception as e:
        print(f"  analyst dispersion {symbol}: {e}")
        return {"symbol": symbol, "dispersion": None, "n_analysts": 0,
                "as_of_ts": AS_OF_TS, "snapshot_id": None}


analyst_results = {}
for sym in EQUITY_SYMBOLS:
    r = analyst_results[sym] = pull_analyst_dispersion(sym)
    d = f"{r['dispersion']:.4f}" if r.get("dispersion") is not None else "N/A"
    print(f"  {sym:5s}  dispersion={d}  n_analysts={r.get('n_analysts',0)}")

# COMMAND ----------

# MAGIC %md ## 3. Alternative.me Fear & Greed

# COMMAND ----------

def pull_fear_greed(limit_days: int = 90) -> pd.DataFrame:
    as_of = AS_OF_TS
    url   = f"https://api.alternative.me/fng/?limit={limit_days}&format=json"
    try:
        data    = requests.get(url, timeout=15).json()
        snap_id = snap("alternative.me:fng", {"limit": limit_days}, as_of)
        records = [{"date": pd.to_datetime(int(e["timestamp"]),unit="s").date(),
                    "fear_greed": int(e["value"]),
                    "classification": e["value_classification"],
                    "as_of_ts": as_of, "snapshot_id": snap_id}
                   for e in data.get("data", [])]
        df = pd.DataFrame(records).sort_values("date").reset_index(drop=True)
        print(f"  Fear & Greed: {len(df)} days  today={df.iloc[-1]['fear_greed']} "
              f"({df.iloc[-1]['classification']})")
        return df
    except Exception as e:
        print(f"  alternative.me: {e}")
        return pd.DataFrame()


fear_greed_df = pull_fear_greed()

# COMMAND ----------

# MAGIC %md ## 4. VIX Term Structure

# COMMAND ----------

def pull_vix_term_structure() -> dict:
    as_of  = AS_OF_TS
    vix_30 = fred_latest("VIXCLS", as_of)
    vix_93 = fred_latest("VXMT", as_of)
    vix_9  = None
    try:
        r    = requests.get("https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_VIX9D.json", timeout=15)
        data = r.json()
        if data.get("data"):
            vix_9 = float(data["data"][-1][4])
            snap("CBOE:VIX9D", {"close": vix_9}, as_of)
    except Exception as e:
        print(f"  VIX9D CBOE: {e}")
        vix_9 = fred_latest("VXST", as_of)

    if vix_9 and vix_30 and vix_93:
        if vix_9 < vix_30 < vix_93:  structure = "contango_full"
        elif vix_9 > vix_30:          structure = "backwardation"
        elif vix_30 < vix_93:         structure = "contango_partial"
        else:                          structure = "flat"
    else:
        structure = "unavailable"

    slope = (vix_93 - vix_9) / vix_9 if (vix_9 and vix_93) else None
    result = {"vix_9d": vix_9, "vix_30d": vix_30, "vix_93d": vix_93,
              "structure": structure, "slope_9_93": slope, "as_of_ts": as_of}
    print(f"  VIX 9d={vix_9}  30d={vix_30}  93d={vix_93}  → {structure}")
    return result


vix_term = pull_vix_term_structure()

# COMMAND ----------

# MAGIC %md ## 5. Put/Call Ratio

# COMMAND ----------

def pull_put_call_ratio() -> dict:
    as_of = AS_OF_TS
    try:
        r    = requests.get("https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_PC.json", timeout=15)
        data = r.json()
        if data.get("data"):
            df = pd.DataFrame(data["data"][-30:], columns=["date","open","high","low","close","volume"])
            df["close"] = pd.to_numeric(df["close"], errors="coerce")
            latest = float(df["close"].iloc[-1])
            ma5    = float(df["close"].tail(5).mean())
            ma20   = float(df["close"].tail(20).mean())
            snap_id = snap("CBOE:put_call_ratio", {"latest": latest}, as_of)
            signal = ("contrarian_bullish" if latest > 0.85 else
                      "contrarian_bearish" if latest < 0.55 else "neutral")
            print(f"  P/C ratio={latest:.3f}  5d={ma5:.3f}  20d={ma20:.3f}  → {signal}")
            return {"put_call_ratio": latest, "ma5": ma5, "ma20": ma20,
                    "signal": signal, "source": "CBOE", "as_of_ts": as_of, "snapshot_id": snap_id}
    except Exception as e:
        print(f"  CBOE P/C: {e}")

    # Fallback
    vix = fred_latest("VIXCLS", as_of)
    return {"put_call_ratio": vix/20.0 if vix else None,
            "signal": "unavailable_synthetic", "source": "synthetic_vix", "as_of_ts": as_of}


put_call = pull_put_call_ratio()

# COMMAND ----------

# MAGIC %md ## 6. Extended FRED Macro

# COMMAND ----------

macro_extended = {}
for name, series_id in FRED_MACRO_SERIES.items():
    val = fred_latest(series_id)
    macro_extended[name] = val
    print(f"  {name:25s} ({series_id}): {fmt(val)}")

# COMMAND ----------

# MAGIC %md ## 7. Compile ContextPackages + Write to Supabase

# COMMAND ----------

context_packages = {
    "macro_fundamentals": {
        "agent_id": "macro_fundamentals", "as_of_ts": AS_OF_TS,
        "data": {"macro_vector": macro_extended, "vix_term": vix_term},
    },
    "narrative_behavioral": {
        "agent_id": "narrative_behavioral", "as_of_ts": AS_OF_TS,
        "data": {
            "news_sentiment":    {s: r.get("sentiment_score") for s, r in news_results.items()},
            "fear_greed_today":  int(fear_greed_df.iloc[-1]["fear_greed"]) if not fear_greed_df.empty else None,
            "fear_greed_7d_avg": float(fear_greed_df.tail(7)["fear_greed"].mean()) if not fear_greed_df.empty else None,
            "fear_greed_class":  fear_greed_df.iloc[-1]["classification"] if not fear_greed_df.empty else None,
        },
    },
    "contrarian": {
        "agent_id": "contrarian", "as_of_ts": AS_OF_TS,
        "data": {
            "vix_term_structure": vix_term,
            "put_call_ratio":     put_call,
            "analyst_dispersion": {s: r.get("dispersion") for s, r in analyst_results.items()},
        },
    },
}

# Write market_context_log to Supabase
raw_blob = {"news_sentiment": {s: r.get("sentiment_score") for s, r in news_results.items()},
            "analyst_dispersion": {s: r.get("dispersion") for s, r in analyst_results.items()},
            "macro_full": macro_extended}

n = upsert_rows(
    table="market_context_log",
    columns=["as_of_ts","pct_above_50d_ma","pct_above_200d_ma","breadth_regime",
             "vix_9d","vix_30d","vix_93d","vix_structure",
             "fear_greed_today","fear_greed_7d_avg",
             "put_call_ratio","yield_2y","yield_10y","breakeven_10y",
             "unemployment","initial_claims","raw_context_json"],
    rows=[(AS_OF_TS, None, None, None,
           safe_float(vix_term.get("vix_9d")), safe_float(vix_term.get("vix_30d")),
           safe_float(vix_term.get("vix_93d")), vix_term.get("structure"),
           safe_int(fear_greed_df.iloc[-1]["fear_greed"]) if not fear_greed_df.empty else None,
           safe_float(fear_greed_df.tail(7)["fear_greed"].mean()) if not fear_greed_df.empty else None,
           safe_float(put_call.get("put_call_ratio")),
           safe_float(macro_extended.get("yield_2y")),
           safe_float(macro_extended.get("yield_10y")),
           safe_float(macro_extended.get("breakeven_10y")),
           safe_float(macro_extended.get("unemployment")),
           safe_float(macro_extended.get("initial_claims")),
           json.dumps(raw_blob))],
    conflict_cols=["as_of_ts"],
)
print(f"market_context_log: {n} rows upserted")

# COMMAND ----------

# MAGIC %md ## 8. MLflow

# COMMAND ----------

mlflow.set_experiment(EXPERIMENT_NAME)
with mlflow.start_run(run_name="05_data_feeds") as run:
    mlflow.log_params({"as_of_ts": AS_OF_TS, "finnhub_enabled": bool(FINNHUB_KEY),
                       "n_snapshots": len(get_snapshots())})

    for sym, r in news_results.items():
        if r.get("sentiment_score") is not None:
            mlflow.log_metric(f"news_sentiment_{sym}", r["sentiment_score"])
    if not fear_greed_df.empty:
        mlflow.log_metric("fear_greed_today", int(fear_greed_df.iloc[-1]["fear_greed"]))
    for k, v in vix_term.items():
        if isinstance(v, float):
            mlflow.log_metric(f"vix_{k}", v)
    if put_call.get("put_call_ratio"):
        mlflow.log_metric("put_call_ratio", put_call["put_call_ratio"])
    for name, val in macro_extended.items():
        if val is not None:
            mlflow.log_metric(f"macro_{name}", float(val))

    fear_greed_df.to_parquet("/tmp/fear_greed.parquet", index=False)
    with open("/tmp/context_packages.json", "w") as f:
        json.dump(context_packages, f, indent=2, default=str)
    mlflow.log_artifact("/tmp/fear_greed.parquet", artifact_path="data")
    mlflow.log_artifact("/tmp/context_packages.json", artifact_path="data")
    log_snapshots_artifact(run)

    print(f"MLflow run: {run.info.run_id}")
