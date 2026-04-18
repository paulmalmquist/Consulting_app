# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 08 — Agent Context Builders: 5 ContextPackage Factories
# MAGIC
# MAGIC **Module:** History Rhymes / Dissensus — Agent Prompt Layer
# MAGIC **Purpose:** For each of the 5 LLM agents, produce a fully-formed ContextPackage
# MAGIC   ready to be injected into the agent's system prompt.
# MAGIC
# MAGIC Agents:
# MAGIC   1. macro_fundamentals  — FRED macro, yield curve, inflation, labor market
# MAGIC   2. narrative_behavioral — news sentiment, Fear & Greed, earnings narrative
# MAGIC   3. technical_quant     — RSI, MACD, ADX, volatility, breadth, cross-asset corr
# MAGIC   4. contrarian          — VIX term structure, put/call ratio, analyst dispersion
# MAGIC   5. geopolitical_risk   — EPU index, geopolitical risk index, FRED uncertainty
# MAGIC
# MAGIC Each factory pulls from Supabase (latest market_context_log + technical_features_log)
# MAGIC and returns a ContextPackage: {agent_id, as_of_ts, prompt_block, raw_data}.
# MAGIC
# MAGIC The prompt_block is the exact text injected before the agent's forecast question.
# MAGIC It is token-budgeted: <= 600 tokens per agent (enforced by assertion T6).
# MAGIC
# MAGIC Saves context_packages_full.json to MLflow.
# MAGIC
# MAGIC **Runs:** Nightly at 19:00 UTC (30 min before agent runner at 19:30)

# COMMAND ----------

import subprocess
subprocess.run(
    ['pip', 'install', 'psycopg2-binary', 'mlflow', 'tiktoken', 'pyarrow', '-q'],
    capture_output=True
)

import json
import os
from datetime import datetime
from typing import Optional

import psycopg2
import psycopg2.extras
import mlflow

# tiktoken for token counting (GPT-4 tokenizer, conservative proxy)
try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text: str) -> int:
        return len(_enc.encode(text))
    print("tiktoken loaded for token counting")
except ImportError:
    def count_tokens(text: str) -> int:
        return len(text.split()) * 4 // 3   # rough proxy
    print("tiktoken not available, using word-count proxy")

try:
    SUPABASE_DB_URL = dbutils.secrets.get(scope="winston", key="supabase_db_url")
except Exception:
    SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL", "")
    if not SUPABASE_DB_URL:
        raise RuntimeError("Set Databricks secret: scope=winston, key=supabase_db_url")

EXPERIMENT_NAME   = "/Users/paulmalmquist@gmail.com/HistoryRhymesML"
AS_OF_TS          = datetime.utcnow().isoformat() + "Z"
TOKEN_BUDGET      = 600  # per agent, hard ceiling

def get_conn():
    return psycopg2.connect(SUPABASE_DB_URL, connect_timeout=15)

print(f"Agent context builders started: {AS_OF_TS}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 0. Load Latest Supabase Snapshots

# COMMAND ----------

def load_latest_market_context() -> dict:
    """Pull the most recent row from market_context_log."""
    sql = """
        SELECT *
        FROM market_context_log
        ORDER BY as_of_ts DESC
        LIMIT 1
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            row = cur.fetchone()
    if row is None:
        raise RuntimeError("market_context_log is empty — run 05, 06, 07 first")
    return dict(row)


def load_latest_technical_features() -> dict:
    """Pull the most recent technical_features_log rows, keyed by ticker."""
    sql = """
        SELECT *
        FROM technical_features_log
        WHERE as_of_ts = (SELECT MAX(as_of_ts) FROM technical_features_log)
        ORDER BY ticker
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    if not rows:
        raise RuntimeError("technical_features_log is empty — run 06, 07 first")
    return {r['ticker']: dict(r) for r in rows}


def load_latest_dissensus() -> Optional[dict]:
    """Pull the most recent dissensus_runs row for trend context."""
    sql = """
        SELECT d_t, d_t_z, regime, ood_flag, suspicious_consensus
        FROM dissensus_runs
        ORDER BY as_of_ts DESC
        LIMIT 1
    """
    try:
        with get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                row = cur.fetchone()
        return dict(row) if row else None
    except Exception:
        return None


print("Loading latest snapshots from Supabase...")
mkt   = load_latest_market_context()
techs = load_latest_technical_features()
diss  = load_latest_dissensus()

print(f"  market_context as_of: {str(mkt.get('as_of_ts', ''))[:19]}")
print(f"  technical_features:   {len(techs)} tickers")
print(f"  dissensus_runs:       {'found' if diss else 'empty (first run)'}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Helper: ContextPackage builder

# COMMAND ----------

def _fmt(val, fmt=".2f", fallback="N/A"):
    if val is None:
        return fallback
    try:
        return format(float(val), fmt)
    except Exception:
        return str(val)


def _pct(val, fallback="N/A"):
    if val is None:
        return fallback
    try:
        return f"{float(val)*100:.0f}%"
    except Exception:
        return fallback


def build_package(agent_id: str, prompt_block: str, raw_data: dict) -> dict:
    """
    Wrap prompt_block and raw_data into a ContextPackage.
    Enforces TOKEN_BUDGET and stamps as_of_ts.
    """
    n_tokens = count_tokens(prompt_block)
    if n_tokens > TOKEN_BUDGET:
        # Hard truncate at sentence boundary
        words = prompt_block.split()
        while count_tokens(" ".join(words)) > TOKEN_BUDGET and len(words) > 10:
            words = words[:-5]
        prompt_block = " ".join(words) + " [truncated]"
        n_tokens     = count_tokens(prompt_block)

    return {
        'agent_id':     agent_id,
        'as_of_ts':     AS_OF_TS,
        'n_tokens':     n_tokens,
        'prompt_block': prompt_block,
        'raw_data':     raw_data,
    }


# Pre-extract commonly used values
raw_ctx = mkt.get('raw_context_json') or {}
if isinstance(raw_ctx, str):
    raw_ctx = json.loads(raw_ctx)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent 1: macro_fundamentals

# COMMAND ----------

def build_macro_fundamentals() -> dict:
    macro = raw_ctx.get('macro_full', {})

    # Yield curve shape
    y2   = mkt.get('yield_2y')
    y10  = mkt.get('yield_10y')
    spread = (float(y10) - float(y2)) if (y2 and y10) else None
    curve_shape = ("inverted" if spread and spread < 0 else
                   "flat"     if spread and abs(spread) < 0.25 else
                   "normal steep")

    # Inflation regime
    be10 = mkt.get('breakeven_10y')
    inf_regime = ("above_target" if be10 and be10 > 2.5 else
                  "at_target"   if be10 and be10 >= 1.8 else
                  "below_target" if be10 else "unknown")

    unemp = mkt.get('unemployment')
    claims = mkt.get('initial_claims')

    prompt = f"""=== MACRO FUNDAMENTALS CONTEXT (as of {str(mkt.get('as_of_ts',''))[:10]}) ===

YIELD CURVE: 2y={_fmt(y2)}% / 10y={_fmt(y10)}%  |  Spread: {_fmt(spread, '+.2f')}bps  |  Shape: {curve_shape}

INFLATION: 10y breakeven={_fmt(be10)}%  ({inf_regime})
REAL RATES: TIPS 10y={_fmt(macro.get('tips_10y'))}%

LABOR MARKET: Unemployment={_fmt(unemp)}%  |  Initial claims={_fmt(claims, ',.0f')}

GROWTH: Real GDP growth={_fmt(macro.get('real_gdp_growth'))}% QoQ
CONSUMER: Michigan sentiment={_fmt(macro.get('consumer_sentiment'))}  |  Retail sales={_fmt(macro.get('retail_sales'))}

ASSET CONTEXT: Dollar index={_fmt(macro.get('dollar_index'))}  |  WTI crude={_fmt(macro.get('oil_wti'))}

TASK: Based on this macro backdrop, assign bear/base/bull probabilities for
SPY total return over the NEXT 12 MONTHS. Bear=<−10%, Base=−10% to +15%, Bull=>+15%.
Probabilities must sum to 1.00."""

    return build_package('macro_fundamentals', prompt, {
        'yield_curve': {'y2': y2, 'y10': y10, 'spread': spread, 'shape': curve_shape},
        'inflation': {'breakeven_10y': be10, 'regime': inf_regime},
        'labor': {'unemployment': unemp, 'initial_claims': claims},
        'macro_full': macro,
    })


pkg_macro = build_macro_fundamentals()
print(f"macro_fundamentals: {pkg_macro['n_tokens']} tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent 2: narrative_behavioral

# COMMAND ----------

def build_narrative_behavioral() -> dict:
    news   = raw_ctx.get('news_sentiment', {}) or {}
    fg_val = mkt.get('fear_greed_today')
    fg_avg = mkt.get('fear_greed_7d_avg')

    # Fear & Greed interpretation
    fg_label = ("Extreme Fear" if fg_val and fg_val < 25 else
                "Fear"         if fg_val and fg_val < 45 else
                "Neutral"      if fg_val and fg_val < 55 else
                "Greed"        if fg_val and fg_val < 75 else
                "Extreme Greed" if fg_val else "Unknown")

    # News sentiment summary
    pos_sym  = [s for s, v in news.items() if v is not None and v > 0.1]
    neg_sym  = [s for s, v in news.items() if v is not None and v < -0.1]
    avg_sent = sum(v for v in news.values() if v is not None) / max(len([v for v in news.values() if v is not None]), 1)

    # Previous dissensus trend for context
    diss_ctx = ""
    if diss:
        diss_ctx = (f"\nPREVIOUS DISSENSUS SIGNAL: D_t={_fmt(diss.get('d_t'))} "
                    f"(regime={diss.get('regime')}, "
                    f"OOD={'yes' if diss.get('ood_flag') else 'no'})")

    prompt = f"""=== NARRATIVE & BEHAVIORAL CONTEXT (as of {str(mkt.get('as_of_ts',''))[:10]}) ===

FEAR & GREED INDEX: {fg_val} ({fg_label})  |  7-day avg: {_fmt(fg_avg, '.1f')}

NEWS SENTIMENT (equity ETFs):
  Positive momentum: {', '.join(pos_sym) or 'none'}
  Negative momentum: {', '.join(neg_sym) or 'none'}
  Avg sentiment score: {_fmt(avg_sent, '+.3f')} (scale: -1 to +1)
{diss_ctx}

INTERPRETATION GUIDE:
  Extreme Fear (<25) historically precedes rallies (contrarian bullish signal).
  Extreme Greed (>75) historically precedes corrections.
  Current reading suggests: {fg_label.lower()} market tone.

TASK: Based on investor sentiment and narrative dynamics, assign bear/base/bull
probabilities for SPY over NEXT 12 MONTHS. Bear=<−10%, Base=−10% to +15%, Bull=>+15%.
Weight behavioral signals against your assessment of whether sentiment is a
leading or lagging indicator in the current environment."""

    return build_package('narrative_behavioral', prompt, {
        'fear_greed': {'today': fg_val, '7d_avg': fg_avg, 'label': fg_label},
        'news_sentiment': news,
        'avg_sentiment': avg_sent,
    })


pkg_narr = build_narrative_behavioral()
print(f"narrative_behavioral: {pkg_narr['n_tokens']} tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent 3: technical_quant

# COMMAND ----------

def build_technical_quant() -> dict:
    spy   = techs.get('SPY', {})
    qqq   = techs.get('QQQ', {})
    tlt   = techs.get('TLT', {})
    btc   = techs.get('BTC-USD', {})

    breadth_50  = _pct(mkt.get('pct_above_50d_ma'))
    breadth_200 = _pct(mkt.get('pct_above_200d_ma'))
    br_regime   = mkt.get('breadth_regime', 'unknown')

    spy_rsi   = _fmt(spy.get('rsi_14'), '.1f')
    spy_adx   = _fmt(spy.get('adx_14'), '.1f')
    spy_hv    = _fmt(spy.get('hv_21'), '.1%') if spy.get('hv_21') else "N/A"
    spy_trend = spy.get('trend_strength', 'N/A')
    spy_200   = "above" if spy.get('above_ema200') else "below"

    corr_tlt = _fmt(mkt.get('corr_spy_tlt_60d'), '+.2f')
    corr_gld = _fmt(mkt.get('corr_spy_gld_60d'), '+.2f')
    corr_btc = _fmt(mkt.get('corr_spy_btc_60d'), '+.2f')

    prompt = f"""=== TECHNICAL & QUANTITATIVE CONTEXT (as of {str(mkt.get('as_of_ts',''))[:10]}) ===

MARKET BREADTH: {breadth_50} assets above 50d MA | {breadth_200} above 200d MA | Regime: {br_regime}

SPY TECHNICALS:
  RSI(14)={spy_rsi} ({spy.get('rsi_14_zone','N/A')}) | ADX(14)={spy_adx} (trend: {spy_trend})
  Price vs 200d MA: {spy_200} | 21d HV={spy_hv}
  MACD: {'bullish' if spy.get('macd_bullish') else 'bearish'}

QQQ: RSI={_fmt(qqq.get('rsi_14'),'.1f')} | {'above' if qqq.get('above_ema200') else 'below'} 200d MA
TLT: RSI={_fmt(tlt.get('rsi_14'),'.1f')} | {'above' if tlt.get('above_ema200') else 'below'} 200d MA
BTC: RSI={_fmt(btc.get('rsi_14'),'.1f')} | HV21={_fmt(btc.get('hv_21'),'.1%') if btc.get('hv_21') else 'N/A'}

CROSS-ASSET CORRELATIONS (60d rolling):
  SPY vs TLT: {corr_tlt} ({'flight-to-quality active' if mkt.get('corr_spy_tlt_60d') and mkt.get('corr_spy_tlt_60d') < -0.3 else 'correlation muted'})
  SPY vs GLD: {corr_gld}
  SPY vs BTC: {corr_btc} ({'risk-on sync' if mkt.get('corr_spy_btc_60d') and mkt.get('corr_spy_btc_60d') > 0.4 else 'decoupled'})

TASK: Based on technical and quantitative signals, assign bear/base/bull probabilities
for SPY over NEXT 12 MONTHS. Bear=<−10%, Base=−10% to +15%, Bull=>+15%.
Weight momentum, trend, breadth, and volatility signals appropriately."""

    return build_package('technical_quant', prompt, {
        'spy': spy,
        'qqq': qqq,
        'tlt': tlt,
        'btc': btc,
        'breadth': {'pct_50': mkt.get('pct_above_50d_ma'), 'pct_200': mkt.get('pct_above_200d_ma'), 'regime': br_regime},
        'correlations': {
            'spy_tlt': mkt.get('corr_spy_tlt_60d'),
            'spy_gld': mkt.get('corr_spy_gld_60d'),
            'spy_btc': mkt.get('corr_spy_btc_60d'),
        },
    })


pkg_tech = build_technical_quant()
print(f"technical_quant: {pkg_tech['n_tokens']} tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent 4: contrarian

# COMMAND ----------

def build_contrarian() -> dict:
    pc_ratio  = mkt.get('put_call_ratio')
    vix_9d    = mkt.get('vix_9d')
    vix_30d   = mkt.get('vix_30d')
    vix_93d   = mkt.get('vix_93d')
    vix_struct = mkt.get('vix_structure', 'unknown')

    raw_analyst = raw_ctx.get('analyst_dispersion') or {}

    # Put/call interpretation
    pc_signal = ("extreme_put_buying"  if pc_ratio and pc_ratio > 0.90 else
                 "elevated_put_buying" if pc_ratio and pc_ratio > 0.75 else
                 "neutral"             if pc_ratio and 0.55 <= pc_ratio <= 0.75 else
                 "extreme_call_buying" if pc_ratio and pc_ratio < 0.55 else "unknown")

    # Contrarian lean
    lean = ""
    if pc_signal in ("extreme_put_buying",):
        lean = "CONTRARIAN BULLISH: Extreme put buying historically precedes rallies."
    elif pc_signal == "extreme_call_buying":
        lean = "CONTRARIAN BEARISH: Extreme call buying historically precedes corrections."
    else:
        lean = "NEUTRAL: Put/call ratio in normal range, no contrarian signal."

    # VIX term structure signal
    vix_signal = ""
    if vix_struct == "backwardation":
        vix_signal = "BACKWARDATION — near-term fear spike, typically mean-reverts within 4–8 weeks."
    elif vix_struct == "contango_full":
        vix_signal = "FULL CONTANGO — calm, vol rising with time, complacency risk."
    else:
        vix_signal = f"{vix_struct} — no strong contrarian signal from term structure."

    # Analyst dispersion (Phase 2 gate proxy)
    analyst_lines = []
    for sym, disp in list(raw_analyst.items())[:4]:
        if disp is not None:
            analyst_lines.append(f"{sym}={_fmt(disp, '.4f')}")
    analyst_str = "  |  ".join(analyst_lines) or "N/A"

    prompt = f"""=== CONTRARIAN CONTEXT (as of {str(mkt.get('as_of_ts',''))[:10]}) ===

PUT/CALL RATIO: {_fmt(pc_ratio, '.3f')} ({pc_signal})
{lean}

VIX TERM STRUCTURE: 9d={_fmt(vix_9d)} | 30d={_fmt(vix_30d)} | 93d={_fmt(vix_93d)}
Structure: {vix_struct}
Signal: {vix_signal}

ANALYST DISPERSION (CoV of price targets — proxy for expert disagreement):
  {analyst_str}
  High dispersion (>0.15) = high expert uncertainty = potential alpha in divergent call.

TASK: As a contrarian agent, you INTENTIONALLY lean against consensus. Assign bear/base/bull
probabilities for SPY over NEXT 12 MONTHS. Bear=<−10%, Base=−10% to +15%, Bull=>+15%.
Give extra weight to behavioral signals that suggest the crowd is wrong."""

    return build_package('contrarian', prompt, {
        'put_call': {'ratio': pc_ratio, 'signal': pc_signal},
        'vix_term': {'vix_9d': vix_9d, 'vix_30d': vix_30d, 'vix_93d': vix_93d, 'structure': vix_struct},
        'analyst_dispersion': raw_analyst,
    })


pkg_cont = build_contrarian()
print(f"contrarian: {pkg_cont['n_tokens']} tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent 5: geopolitical_risk

# COMMAND ----------

def build_geopolitical_risk() -> dict:
    """
    Geopolitical Risk agent uses EPU (Economic Policy Uncertainty) from FRED
    and narratively assesses current geopolitical landscape.
    EPU is already in macro_full if pulled in 05_data_feeds (USEPUINDXD series).
    Falls back to a text-only assessment if EPU not available.
    """
    import requests as req
    from datetime import timedelta
    from datetime import date

    macro = raw_ctx.get('macro_full', {})

    # EPU from FRED (already pulled in 05_data_feeds as part of OOD vector)
    # Try to get it from Supabase raw_context_json or re-pull from FRED
    epu_val = macro.get('epu') or macro.get('USEPUINDXD')

    if epu_val is None:
        # Quick re-pull: EPU from FRED
        try:
            url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=USEPUINDXD"
            import pandas as _pd
            df = _pd.read_csv(url, parse_dates=['DATE']).replace('.', None)
            df.columns = ['date', 'value']
            df['value'] = _pd.to_numeric(df['value'], errors='coerce')
            epu_val = float(df.dropna().iloc[-1]['value'])
            print(f"  EPU re-pulled from FRED: {epu_val:.1f}")
        except Exception as e:
            print(f"  EPU FRED pull failed: {e}")
            epu_val = None

    # Geopolitical Risk Index (Caldara & Iacoviello) — free from their website
    gpri_val = None
    try:
        gpr_url = "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls"
        import pandas as _pd
        gpr_df = _pd.read_excel(gpr_url, engine='xlrd')
        # Last non-null value in first numeric column after date
        gpr_df.columns = [str(c).strip() for c in gpr_df.columns]
        gpr_col = [c for c in gpr_df.columns if 'gpr' in c.lower() and 'act' not in c.lower()]
        if gpr_col:
            gpri_val = float(gpr_df[gpr_col[0]].dropna().iloc[-1])
            print(f"  GPRI loaded: {gpri_val:.1f}")
    except Exception as e:
        print(f"  GPRI pull failed (non-critical): {e}")

    # EPU interpretation
    epu_regime = ("elevated"  if epu_val and epu_val > 200 else
                  "moderate"  if epu_val and epu_val > 130 else
                  "low"       if epu_val else "unknown")

    gpri_line = f"GEOPOLITICAL RISK INDEX (GPRI): {_fmt(gpri_val, '.1f')} " + \
                ("(elevated — active conflicts / escalation risk)" if gpri_val and gpri_val > 200 else
                 "(moderate)"                                       if gpri_val and gpri_val > 100 else
                 "(low)"                                            if gpri_val else "(unavailable)")

    prompt = f"""=== GEOPOLITICAL RISK CONTEXT (as of {str(mkt.get('as_of_ts',''))[:10]}) ===

ECONOMIC POLICY UNCERTAINTY (EPU): {_fmt(epu_val, '.1f')} ({epu_regime})
  Historical avg ~100. Values >200 associated with elevated equity risk premia.

{gpri_line}

KEY RISK FACTORS TO ASSESS (use your training knowledge):
  - Active military conflicts and escalation probability
  - Trade policy uncertainty and tariff risk
  - Central bank policy divergence (Fed vs ECB vs BoJ)
  - Election and political transition risks in major economies
  - Commodity supply disruption probability (energy, food, semiconductors)

TASK: As the geopolitical risk agent, assign bear/base/bull probabilities for SPY
over NEXT 12 MONTHS. Bear=<−10%, Base=−10% to +15%, Bull=>+15%.
Ground your forecast in concrete geopolitical scenarios, not just the EPU index.
Identify the single most important geopolitical variable for the forecast period."""

    return build_package('geopolitical_risk', prompt, {
        'epu': {'value': epu_val, 'regime': epu_regime},
        'gpri': {'value': gpri_val},
    })


pkg_geo = build_geopolitical_risk()
print(f"geopolitical_risk: {pkg_geo['n_tokens']} tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Token Budget Assertions

# COMMAND ----------

all_packages = {
    'macro_fundamentals':  pkg_macro,
    'narrative_behavioral': pkg_narr,
    'technical_quant':     pkg_tech,
    'contrarian':          pkg_cont,
    'geopolitical_risk':   pkg_geo,
}

print("\n=== Token budget check ===")
for agent_id, pkg in all_packages.items():
    n = pkg['n_tokens']
    status = "OK" if n <= TOKEN_BUDGET else "OVER BUDGET"
    print(f"  {agent_id:25s}: {n:>4} tokens  {status}")
    assert n <= TOKEN_BUDGET, f"T6 FAIL: {agent_id} exceeds {TOKEN_BUDGET} token budget ({n} tokens)"

print(f"\nAll agents within {TOKEN_BUDGET}-token budget. ✓")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Save to MLflow and Print Sample Prompt

# COMMAND ----------

mlflow.set_experiment(EXPERIMENT_NAME)

with mlflow.start_run(run_name="08_agent_context_builders") as run:
    mlflow.log_params({
        'as_of_ts':     AS_OF_TS,
        'n_agents':     len(all_packages),
        'token_budget': TOKEN_BUDGET,
    })

    for agent_id, pkg in all_packages.items():
        mlflow.log_metric(f"{agent_id}_tokens", pkg['n_tokens'])

    # Save full context package set
    import json
    out = {k: {kk: vv for kk, vv in v.items() if kk != 'raw_data'}
           for k, v in all_packages.items()}
    with open('/tmp/context_packages_full.json', 'w') as f:
        json.dump(all_packages, f, indent=2, default=str)

    mlflow.log_artifact('/tmp/context_packages_full.json', artifact_path='data')
    print(f"\nMLflow run: {run.info.run_id}")

# Print sample prompt block for inspection
print("\n" + "="*60)
print("SAMPLE — macro_fundamentals prompt_block:")
print("="*60)
print(pkg_macro['prompt_block'])
print("="*60)
print(f"\nContext packages ready. Total tokens across all agents: "
      f"{sum(p['n_tokens'] for p in all_packages.values())}")
print("Next: 09_nightly_agent_runner — calls LLM APIs and produces DisagreementScorer inputs")
