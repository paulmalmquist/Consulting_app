# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 05 — Data Feeds: Sentiment, News, VIX Term Structure, Put/Call Ratio
# MAGIC
# MAGIC **Module:** History Rhymes / Dissensus — Agent Context Layer
# MAGIC **Purpose:** Build the data pipes for three of the five LLM agents:
# MAGIC   - `narrative_behavioral` → Finnhub news + Alternative.me Fear & Greed
# MAGIC   - `contrarian`           → VIX term structure + CBOE put/call ratio
# MAGIC   - `macro_fundamentals`   → Extended FRED macro beyond the OOD vector
# MAGIC
# MAGIC Also produces `finnhub_analyst_dispersion` — required for Phase 2 proxy
# MAGIC correlation gate: corr(D_t, finnhub_dispersion) >= 0.20 by month 6.
# MAGIC
# MAGIC Every external pull stamps as_of_ts at the moment of the call.
# MAGIC Every pull writes a data_snapshots record (written to MLflow artifact
# MAGIC here; written to Supabase once Step 3 of the meta prompt is executed).
# MAGIC
# MAGIC **Runs:** Nightly at 17:30 UTC (30 min before agent runner)

# COMMAND ----------

import subprocess
subprocess.run(['pip', 'install', 'finnhub-python', 'requests', 'pyarrow', 'mlflow', '-q'],
               capture_output=True)

import json
import hashlib
import warnings
from datetime import datetime, timedelta, date
from typing import Optional

import numpy as np
import pandas as pd
import requests
import mlflow

warnings.filterwarnings('ignore')

EXPERIMENT_NAME = "/Users/paulmalmquist@gmail.com/HistoryRhymesML"
AS_OF_TS        = datetime.utcnow().isoformat() + "Z"

# Assets tracked
EQUITY_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD']
CRYPTO_SYMBOLS = ['BTC', 'ETH']
ALL_SYMBOLS    = EQUITY_SYMBOLS + CRYPTO_SYMBOLS

# Finnhub API key — from Databricks secret or env
try:
    FINNHUB_KEY = dbutils.secrets.get(scope="winston", key="finnhub_api_key")
except Exception:
    import os
    FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
    if not FINNHUB_KEY:
        print("WARNING: No Finnhub API key found. News and analyst pulls will be skipped.")
        print("Add to Databricks secrets: scope=winston, key=finnhub_api_key")

snapshots = []  # accumulate data_snapshots records throughout run

def snap(source: str, payload: dict, as_of: str = AS_OF_TS) -> str:
    """Record a data snapshot. Returns snapshot id."""
    snap_id = hashlib.sha256(f"{source}{as_of}".encode()).hexdigest()[:16]
    snapshots.append({
        'id':             snap_id,
        'called_ts':      datetime.utcnow().isoformat() + "Z",
        'as_of_ts':       as_of,
        'source':         source,
        'payload_digest': hashlib.sha256(json.dumps(payload, default=str).encode()).hexdigest()[:32],
    })
    return snap_id

print(f"Data feeds started: {AS_OF_TS}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Finnhub: News Sentiment

# COMMAND ----------

def pull_finnhub_news(symbol: str, days_back: int = 3, api_key: str = FINNHUB_KEY) -> dict:
    """
    Pull recent news headlines and sentiment for a symbol.
    Returns aggregated sentiment score and headline list.
    as_of_ts stamped at call time.
    """
    if not api_key:
        return {'symbol': symbol, 'sentiment_score': None, 'n_articles': 0,
                'as_of_ts': AS_OF_TS, 'snapshot_id': None}

    end_date   = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days_back)).isoformat()
    as_of      = datetime.utcnow().isoformat() + "Z"

    url = (f"https://finnhub.io/api/v1/company-news"
           f"?symbol={symbol}&from={start_date}&to={end_date}&token={api_key}")

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        articles = resp.json()

        snap_id = snap(f"finnhub:news:{symbol}", {'n': len(articles)}, as_of)

        if not articles:
            return {'symbol': symbol, 'sentiment_score': 0.0, 'n_articles': 0,
                    'as_of_ts': as_of, 'snapshot_id': snap_id, 'headlines': []}

        # Simple sentiment: count positive/negative keywords in headlines
        pos_kw = ['surge', 'rally', 'gain', 'rise', 'beat', 'strong', 'record',
                  'growth', 'upgrade', 'bullish', 'outperform', 'high']
        neg_kw = ['fall', 'drop', 'plunge', 'miss', 'weak', 'cut', 'loss',
                  'crash', 'downgrade', 'bearish', 'underperform', 'low',
                  'concern', 'fear', 'risk', 'warn']

        scores = []
        headlines = []
        for a in articles[:20]:
            headline = (a.get('headline') or '').lower()
            headlines.append(a.get('headline', ''))
            pos = sum(1 for k in pos_kw if k in headline)
            neg = sum(1 for k in neg_kw if k in headline)
            scores.append((pos - neg) / max(pos + neg, 1))

        sentiment = float(np.mean(scores)) if scores else 0.0
        return {
            'symbol':          symbol,
            'sentiment_score': sentiment,   # -1 to +1
            'n_articles':      len(articles),
            'as_of_ts':        as_of,
            'snapshot_id':     snap_id,
            'headlines':       headlines[:5],
        }
    except Exception as e:
        print(f"  Finnhub news {symbol}: {e}")
        return {'symbol': symbol, 'sentiment_score': None, 'n_articles': 0,
                'as_of_ts': AS_OF_TS, 'snapshot_id': None}


print("Pulling Finnhub news sentiment...")
news_results = {}
for sym in EQUITY_SYMBOLS:
    r = pull_finnhub_news(sym)
    news_results[sym] = r
    score_str = f"{r['sentiment_score']:+.3f}" if r['sentiment_score'] is not None else "N/A"
    print(f"  {sym:5s}  sentiment={score_str:8s}  n_articles={r['n_articles']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Finnhub: Analyst Estimates and Dispersion
# MAGIC
# MAGIC This is the critical series for Phase 2 gate:
# MAGIC corr(D_t, finnhub_analyst_dispersion) >= 0.20 by month 6.
# MAGIC Must be collected from day 1.

# COMMAND ----------

def pull_analyst_dispersion(symbol: str, api_key: str = FINNHUB_KEY) -> dict:
    """
    Pull analyst price target estimates and compute dispersion.
    Dispersion = std(price_targets) / mean(price_targets) — coefficient of variation.
    High dispersion among analysts proxies for high uncertainty / disagreement.
    """
    if not api_key:
        return {'symbol': symbol, 'dispersion': None, 'n_analysts': 0,
                'as_of_ts': AS_OF_TS, 'snapshot_id': None}

    as_of = datetime.utcnow().isoformat() + "Z"
    url   = f"https://finnhub.io/api/v1/stock/price-target?symbol={symbol}&token={api_key}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        snap_id = snap(f"finnhub:price_target:{symbol}", data, as_of)

        targets = [t for t in [
            data.get('targetHigh'), data.get('targetLow'),
            data.get('targetMean'), data.get('targetMedian')
        ] if t and t > 0]

        if len(targets) < 2:
            return {'symbol': symbol, 'dispersion': None, 'n_analysts': 0,
                    'as_of_ts': as_of, 'snapshot_id': snap_id}

        # Coefficient of variation as dispersion proxy
        dispersion = float(np.std(targets) / np.mean(targets)) if np.mean(targets) > 0 else None
        spread_pct = (data.get('targetHigh', 0) - data.get('targetLow', 0)) / max(data.get('targetMean', 1), 1)

        return {
            'symbol':      symbol,
            'dispersion':  dispersion,
            'spread_pct':  float(spread_pct),
            'target_mean': data.get('targetMean'),
            'target_high': data.get('targetHigh'),
            'target_low':  data.get('targetLow'),
            'n_analysts':  data.get('numberOfAnalysts', 0),
            'as_of_ts':    as_of,
            'snapshot_id': snap_id,
        }
    except Exception as e:
        print(f"  Analyst dispersion {symbol}: {e}")
        return {'symbol': symbol, 'dispersion': None, 'n_analysts': 0,
                'as_of_ts': AS_OF_TS, 'snapshot_id': None}


print("Pulling Finnhub analyst dispersion...")
analyst_results = {}
for sym in EQUITY_SYMBOLS:
    r = pull_analyst_dispersion(sym)
    analyst_results[sym] = r
    d_str = f"{r['dispersion']:.4f}" if r.get('dispersion') is not None else "  N/A"
    n_str = str(r.get('n_analysts', 0))
    print(f"  {sym:5s}  dispersion={d_str}  n_analysts={n_str}")

analyst_df = pd.DataFrame(analyst_results.values())
print(f"\nAnalyst dispersion summary:\n{analyst_df[['symbol','dispersion','spread_pct','n_analysts']].to_string(index=False)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Alternative.me Fear & Greed Index (Crypto)
# MAGIC
# MAGIC Free API, no key required. Primary sentiment proxy for BTC/ETH agents.

# COMMAND ----------

def pull_fear_greed(limit_days: int = 30) -> pd.DataFrame:
    """
    Pull Alternative.me Fear & Greed Index history.
    Returns daily index (0=extreme fear, 100=extreme greed) with classification.
    """
    as_of = datetime.utcnow().isoformat() + "Z"
    url   = f"https://api.alternative.me/fng/?limit={limit_days}&format=json"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        snap_id = snap("alternative.me:fng", {'limit': limit_days}, as_of)

        records = []
        for entry in data.get('data', []):
            records.append({
                'date':           pd.to_datetime(int(entry['timestamp']), unit='s').date(),
                'fear_greed':     int(entry['value']),
                'classification': entry['value_classification'],
                'as_of_ts':       as_of,
                'snapshot_id':    snap_id,
            })

        df = pd.DataFrame(records).sort_values('date').reset_index(drop=True)
        print(f"  Fear & Greed: {len(df)} days  |  "
              f"Today: {df.iloc[-1]['fear_greed']} ({df.iloc[-1]['classification']})")
        return df

    except Exception as e:
        print(f"  Alternative.me failed: {e}")
        return pd.DataFrame()


print("Pulling Alternative.me Fear & Greed...")
fear_greed_df = pull_fear_greed(limit_days=90)
if not fear_greed_df.empty:
    print(f"\n  30-day avg: {fear_greed_df.tail(30)['fear_greed'].mean():.1f}")
    print(f"  7-day avg:  {fear_greed_df.tail(7)['fear_greed'].mean():.1f}")
    print(f"  Today:      {fear_greed_df.iloc[-1]['fear_greed']}  "
          f"({fear_greed_df.iloc[-1]['classification']})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. VIX Term Structure (Contango / Backwardation)
# MAGIC
# MAGIC Contrarian agent needs this. Contango (VIX9D < VIX < VXMT) = complacency.
# MAGIC Backwardation (VIX9D > VIX) = near-term fear spike.
# MAGIC Uses free FRED series: VIXCLS (30d), VXMT (93d). VIX9D pulled directly.

# COMMAND ----------

def pull_vix_term_structure() -> dict:
    """
    Pull VIX term structure: 9-day, 30-day, 93-day implied vol.
    Classifies as contango (normal) or backwardation (stressed).
    """
    as_of = datetime.utcnow().isoformat() + "Z"

    def fred_latest(series_id: str) -> Optional[float]:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
        try:
            df = pd.read_csv(url, parse_dates=['DATE']).replace('.', np.nan)
            df.columns = ['date', 'value']
            df['value'] = pd.to_numeric(df['value'], errors='coerce')
            latest = df.dropna().iloc[-1]
            snap(f"FRED:{series_id}", {'date': str(latest['date']), 'value': float(latest['value'])}, as_of)
            return float(latest['value'])
        except Exception as e:
            print(f"  FRED {series_id}: {e}")
            return None

    vix_30d  = fred_latest('VIXCLS')
    vix_93d  = fred_latest('VXMT')

    # VIX9D not on FRED — pull from CBOE via their public data endpoint
    vix_9d = None
    try:
        cboe_url = "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_VIX9D.json"
        r = requests.get(cboe_url, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get('data'):
            last = data['data'][-1]
            vix_9d = float(last[4]) if last[4] else None  # close price
            snap("CBOE:VIX9D", {'close': vix_9d}, as_of)
    except Exception as e:
        print(f"  VIX9D CBOE: {e} (using FRED VXST fallback)")
        vix_9d = fred_latest('VXST')

    # Term structure classification
    structure = "unavailable"
    if vix_9d and vix_30d and vix_93d:
        if vix_9d < vix_30d < vix_93d:
            structure = "contango_full"       # calm, vol rising with time
        elif vix_9d > vix_30d:
            structure = "backwardation"        # near-term fear spike
        elif vix_30d < vix_93d:
            structure = "contango_partial"
        else:
            structure = "flat"

    # Contrarian signal: slope of term structure
    slope_9_93 = (vix_93d - vix_9d) / vix_9d if (vix_9d and vix_93d) else None

    result = {
        'vix_9d':     vix_9d,
        'vix_30d':    vix_30d,
        'vix_93d':    vix_93d,
        'structure':  structure,
        'slope_9_93': slope_9_93,
        'as_of_ts':   as_of,
    }
    print(f"  VIX 9d={vix_9d}  30d={vix_30d}  93d={vix_93d}  → {structure}")
    if slope_9_93:
        print(f"  Term slope (9d→93d): {slope_9_93:+.3f}  "
              f"({'upward = complacency' if slope_9_93 > 0 else 'downward = stress'})")
    return result


print("Pulling VIX term structure...")
vix_term = pull_vix_term_structure()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Put/Call Ratio
# MAGIC
# MAGIC Free from CBOE public data. Equity P/C ratio > 0.85 historically precedes
# MAGIC rallies (contrarian bullish). < 0.55 historically precedes corrections.

# COMMAND ----------

def pull_put_call_ratio() -> dict:
    """
    Pull CBOE equity put/call ratio via their public delayed data endpoint.
    Falls back to FRED PCALLPUT if CBOE endpoint is unavailable.
    """
    as_of = datetime.utcnow().isoformat() + "Z"

    # Try CBOE first
    cboe_url = "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_PC.json"
    try:
        r = requests.get(cboe_url, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get('data'):
            recent = pd.DataFrame(data['data'][-30:],
                                  columns=['date','open','high','low','close','volume'])
            recent['close'] = pd.to_numeric(recent['close'], errors='coerce')
            latest_pc     = float(recent['close'].iloc[-1])
            ma5_pc        = float(recent['close'].tail(5).mean())
            ma20_pc       = float(recent['close'].tail(20).mean())
            snap_id       = snap("CBOE:put_call_ratio", {'latest': latest_pc}, as_of)

            signal = "neutral"
            if latest_pc > 0.85:
                signal = "contrarian_bullish"   # extreme put buying = fear = potential rally
            elif latest_pc < 0.55:
                signal = "contrarian_bearish"   # extreme call buying = complacency = caution

            result = {
                'put_call_ratio': latest_pc,
                'ma5':            ma5_pc,
                'ma20':           ma20_pc,
                'signal':         signal,
                'as_of_ts':       as_of,
                'snapshot_id':    snap_id,
                'source':         'CBOE',
            }
            print(f"  Put/call ratio: {latest_pc:.3f}  "
                  f"(5d avg={ma5_pc:.3f}, 20d avg={ma20_pc:.3f})  → {signal}")
            return result
    except Exception as e:
        print(f"  CBOE P/C endpoint: {e}")

    # Fallback: construct from FRED CBOEVXO proxy
    print("  Falling back to FRED equity sentiment proxy...")
    as_of2 = datetime.utcnow().isoformat() + "Z"
    try:
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS"
        df  = pd.read_csv(url, parse_dates=['DATE']).replace('.', np.nan)
        df.columns = ['date', 'vix']
        df['vix'] = pd.to_numeric(df['vix'], errors='coerce')
        latest_vix = float(df.dropna().iloc[-1]['vix'])
        # VIX as coarse P/C proxy: high VIX → high put demand
        synthetic_pc = latest_vix / 20.0  # rough scaling
        return {
            'put_call_ratio': synthetic_pc,
            'signal':         'unavailable_synthetic',
            'as_of_ts':       as_of2,
            'source':         'synthetic_vix',
        }
    except Exception as e2:
        print(f"  P/C fallback also failed: {e2}")
        return {'put_call_ratio': None, 'signal': 'unavailable', 'as_of_ts': as_of}


print("Pulling put/call ratio...")
put_call = pull_put_call_ratio()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Extended FRED Macro (macro_fundamentals agent)
# MAGIC
# MAGIC Beyond the 5-dim OOD vector: initial claims, PMI proxies, yield curve detail.

# COMMAND ----------

def pull_fred_series(series_id: str) -> Optional[float]:
    """Pull latest value of a single FRED series."""
    as_of = datetime.utcnow().isoformat() + "Z"
    url   = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    try:
        df = pd.read_csv(url, parse_dates=['DATE']).replace('.', np.nan)
        df.columns = ['date', 'value']
        df['value'] = pd.to_numeric(df['value'], errors='coerce')
        val = float(df.dropna().iloc[-1]['value'])
        snap(f"FRED:{series_id}", {'value': val}, as_of)
        return val
    except Exception as e:
        print(f"  FRED {series_id}: {e}")
        return None


print("Pulling extended FRED macro...")
MACRO_EXTENDED = {
    'initial_claims':     'ICSA',       # weekly initial jobless claims
    'continued_claims':   'CCSA',       # continued claims
    'sp500':              'SP500',      # SP500 level from FRED
    'real_gdp_growth':    'A191RL1Q225SBEA',  # real GDP growth QoQ
    'cpi_yoy':            'CPIAUCSL',   # CPI level (compute YoY in agent)
    'pce_yoy':            'PCEPI',      # PCE deflator
    'retail_sales':       'RSAFS',      # retail sales
    'industrial_prod':    'INDPRO',     # industrial production
    'consumer_sentiment': 'UMCSENT',    # Michigan consumer sentiment
    'yield_2y':           'DGS2',       # 2y treasury
    'yield_10y':          'DGS10',      # 10y treasury
    'yield_30y':          'DGS30',      # 30y treasury
    'tips_10y':           'DFII10',     # 10y TIPS (real rate proxy)
    'breakeven_5y':       'T5YIE',      # 5y inflation breakeven
    'breakeven_10y':      'T10YIE',     # 10y inflation breakeven
    'dollar_index':       'DTWEXBGS',   # trade-weighted dollar
    'oil_wti':            'DCOILWTICO', # WTI crude
    'nfp':                'PAYEMS',     # nonfarm payrolls
    'unemployment':       'UNRATE',     # unemployment rate
}

macro_extended = {}
for name, series_id in MACRO_EXTENDED.items():
    val = pull_fred_series(series_id)
    macro_extended[name] = val
    val_str = f"{val:.2f}" if val is not None else "N/A"
    print(f"  {name:25s} ({series_id}): {val_str}")

macro_df = pd.DataFrame([{'series': k, 'value': v} for k, v in macro_extended.items()])

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. Compile ContextPackage Snapshots per Agent

# COMMAND ----------

today_str = date.today().isoformat()

context_packages = {
    'macro_fundamentals': {
        'agent_id':    'macro_fundamentals',
        'as_of_ts':    AS_OF_TS,
        'data': {
            'macro_vector':   macro_extended,
            'vix_term':       vix_term,
        }
    },
    'narrative_behavioral': {
        'agent_id':    'narrative_behavioral',
        'as_of_ts':    AS_OF_TS,
        'data': {
            'news_sentiment':     {s: r.get('sentiment_score') for s, r in news_results.items()},
            'fear_greed_today':   int(fear_greed_df.iloc[-1]['fear_greed']) if not fear_greed_df.empty else None,
            'fear_greed_7d_avg':  float(fear_greed_df.tail(7)['fear_greed'].mean()) if not fear_greed_df.empty else None,
            'fear_greed_class':   fear_greed_df.iloc[-1]['classification'] if not fear_greed_df.empty else None,
        }
    },
    'contrarian': {
        'agent_id':    'contrarian',
        'as_of_ts':    AS_OF_TS,
        'data': {
            'vix_term_structure': vix_term,
            'put_call_ratio':     put_call,
            'analyst_dispersion': {s: r.get('dispersion') for s, r in analyst_results.items()},
        }
    },
}

print("Context packages compiled:")
for agent, pkg in context_packages.items():
    n_data_points = sum(1 for v in pkg['data'].values() if v is not None)
    print(f"  {agent:30s}: {n_data_points} data blocks, as_of={pkg['as_of_ts'][:19]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 8. Log to MLflow

# COMMAND ----------

mlflow.set_experiment(EXPERIMENT_NAME)

with mlflow.start_run(run_name="05_data_feeds") as run:
    mlflow.log_params({
        "as_of_ts":         AS_OF_TS,
        "equity_symbols":   str(EQUITY_SYMBOLS),
        "crypto_symbols":   str(CRYPTO_SYMBOLS),
        "finnhub_enabled":  bool(FINNHUB_KEY),
        "n_data_snapshots": len(snapshots),
    })

    # News sentiment
    for sym, r in news_results.items():
        if r.get('sentiment_score') is not None:
            mlflow.log_metric(f"news_sentiment_{sym}", r['sentiment_score'])
        mlflow.log_metric(f"news_n_articles_{sym}", r.get('n_articles', 0))

    # Analyst dispersion
    for sym, r in analyst_results.items():
        if r.get('dispersion') is not None:
            mlflow.log_metric(f"analyst_dispersion_{sym}", r['dispersion'])

    # Fear & greed
    if not fear_greed_df.empty:
        mlflow.log_metric("fear_greed_today",  int(fear_greed_df.iloc[-1]['fear_greed']))
        mlflow.log_metric("fear_greed_7d_avg", float(fear_greed_df.tail(7)['fear_greed'].mean()))

    # VIX term structure
    for k, v in vix_term.items():
        if isinstance(v, (int, float)) and v is not None:
            mlflow.log_metric(f"vix_term_{k}", float(v))

    # Put/call
    if put_call.get('put_call_ratio') is not None:
        mlflow.log_metric("put_call_ratio", put_call['put_call_ratio'])

    # Extended macro
    for name, val in macro_extended.items():
        if val is not None:
            mlflow.log_metric(f"macro_{name}", float(val))

    # Save artifacts
    fear_greed_df.to_parquet('/tmp/fear_greed.parquet', index=False)
    pd.DataFrame(snapshots).to_parquet('/tmp/data_snapshots.parquet', index=False)
    with open('/tmp/context_packages.json', 'w') as f:
        json.dump(context_packages, f, indent=2, default=str)

    mlflow.log_artifact('/tmp/fear_greed.parquet',      artifact_path='data')
    mlflow.log_artifact('/tmp/data_snapshots.parquet',  artifact_path='data')
    mlflow.log_artifact('/tmp/context_packages.json',   artifact_path='data')

    print(f"\nMLflow run: {run.info.run_id}")
    print(f"Data snapshots recorded: {len(snapshots)}")
    print("Next: 06_technical_features — ta indicators for technical_quant agent")
