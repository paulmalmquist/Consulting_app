# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # 07 — Supabase Backfill: MLflow Artifacts → Supabase Tables
# MAGIC
# MAGIC **Module:** History Rhymes / Dissensus — Persistence Layer
# MAGIC **Purpose:** Bridge MLflow run artifacts into Supabase Postgres tables so
# MAGIC   FastAPI endpoints and the DissensusPanel frontend can query them without
# MAGIC   touching MLflow directly.
# MAGIC
# MAGIC Tables written (defined in META_PROMPT_DISSENSUS.md schema):
# MAGIC   - dissensus_runs          — one row per scorer invocation
# MAGIC   - dissensus_agent_outputs — one row per agent per run
# MAGIC   - data_snapshots          — audit trail of every external data pull
# MAGIC   - technical_features_log  — daily technical indicator snapshots
# MAGIC   - market_context_log      — daily macro + sentiment context package
# MAGIC
# MAGIC Idempotent: uses INSERT ... ON CONFLICT DO NOTHING on run_id + as_of_ts.
# MAGIC
# MAGIC **Runs:** Nightly at 18:30 UTC (after both data_feeds and technical_features)

# COMMAND ----------

import subprocess
subprocess.run(
    ['pip', 'install', 'mlflow', 'psycopg2-binary', 'pyarrow', 'pandas', '-q'],
    capture_output=True
)

import json
import os
import hashlib
from datetime import datetime
from typing import Optional

import pandas as pd
import mlflow
from mlflow.tracking import MlflowClient

# ── Supabase connection ──────────────────────────────────────────────────────
# Pull from Databricks secrets. Run once to register:
#   databricks secrets create-scope --scope winston
#   databricks secrets put --scope winston --key supabase_db_url
# Value format: postgresql://postgres.[project]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

try:
    SUPABASE_DB_URL = dbutils.secrets.get(scope="winston", key="supabase_db_url")
except Exception:
    SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL", "")
    if not SUPABASE_DB_URL:
        raise RuntimeError(
            "No Supabase DB URL found.\n"
            "Set Databricks secret: scope=winston, key=supabase_db_url\n"
            "Format: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres"
        )

EXPERIMENT_NAME = "/Users/paulmalmquist@gmail.com/HistoryRhymesML"
AS_OF_TS        = datetime.utcnow().isoformat() + "Z"

import psycopg2
import psycopg2.extras

def get_conn():
    return psycopg2.connect(SUPABASE_DB_URL, connect_timeout=15)

# Verify connectivity
try:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version()")
            ver = cur.fetchone()[0]
    print(f"Supabase connected: {ver[:60]}")
except Exception as e:
    raise RuntimeError(f"Supabase connection failed: {e}")

client = MlflowClient()
exp    = client.get_experiment_by_name(EXPERIMENT_NAME)
if exp is None:
    raise RuntimeError(f"MLflow experiment not found: {EXPERIMENT_NAME}")
print(f"MLflow experiment: {exp.experiment_id}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Schema Bootstrap
# MAGIC
# MAGIC Creates tables if they don't exist. Safe to re-run — all idempotent.

# COMMAND ----------

SCHEMA_SQL = """
-- dissensus_runs: one row per DisagreementScorer.score() call
CREATE TABLE IF NOT EXISTS dissensus_runs (
    id              BIGSERIAL PRIMARY KEY,
    run_id          TEXT        NOT NULL,       -- MLflow run_id
    as_of_ts        TIMESTAMPTZ NOT NULL,
    d_t             FLOAT,                       -- composite disagreement score
    d_t_z           FLOAT,                       -- rolling z-score
    regime          TEXT,                        -- normal | elevated | high | extreme
    ood_flag        BOOLEAN     DEFAULT FALSE,
    suspicious_consensus BOOLEAN DEFAULT FALSE,
    n_agents        INTEGER,
    w1_mean         FLOAT,
    jsd             FLOAT,
    dir_var         FLOAT,
    ci_adj          FLOAT,
    alpha_adj       FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (run_id, as_of_ts)
);

-- dissensus_agent_outputs: per-agent bear/base/bull distributions per run
CREATE TABLE IF NOT EXISTS dissensus_agent_outputs (
    id              BIGSERIAL PRIMARY KEY,
    run_id          TEXT        NOT NULL,
    as_of_ts        TIMESTAMPTZ NOT NULL,
    agent_id        TEXT        NOT NULL,
    p_bear          FLOAT       NOT NULL,
    p_base          FLOAT       NOT NULL,
    p_bull          FLOAT       NOT NULL,
    rationale_hash  TEXT,                        -- SHA256 of rationale text
    model_version   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (run_id, agent_id, as_of_ts)
);

-- data_snapshots: audit trail of every external data pull
CREATE TABLE IF NOT EXISTS data_snapshots (
    id              TEXT        PRIMARY KEY,     -- SHA256 snap_id
    called_ts       TIMESTAMPTZ NOT NULL,
    as_of_ts        TIMESTAMPTZ NOT NULL,
    source          TEXT        NOT NULL,        -- e.g. "FRED:VIXCLS", "finnhub:news:SPY"
    payload_digest  TEXT        NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- technical_features_log: daily technical indicator snapshots per asset
CREATE TABLE IF NOT EXISTS technical_features_log (
    id              BIGSERIAL PRIMARY KEY,
    as_of_ts        TIMESTAMPTZ NOT NULL,
    ticker          TEXT        NOT NULL,
    rsi_14          FLOAT,
    rsi_7           FLOAT,
    rsi_14_zone     TEXT,
    macd_hist       FLOAT,
    macd_bullish    INTEGER,
    adx_14          FLOAT,
    trend_strength  TEXT,
    above_ema50     INTEGER,
    above_ema200    INTEGER,
    hv_21           FLOAT,
    hv_63           FLOAT,
    bb_width        FLOAT,
    atr_14_pct      FLOAT,
    volume_ratio_5_20 FLOAT,
    mfi_14          FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (as_of_ts, ticker)
);

-- market_context_log: daily macro + sentiment snapshot
CREATE TABLE IF NOT EXISTS market_context_log (
    id              BIGSERIAL PRIMARY KEY,
    as_of_ts        TIMESTAMPTZ NOT NULL,
    -- breadth
    pct_above_50d_ma  FLOAT,
    pct_above_200d_ma FLOAT,
    breadth_regime    TEXT,
    -- cross-asset correlations
    corr_spy_tlt_60d  FLOAT,
    corr_spy_gld_60d  FLOAT,
    corr_spy_btc_60d  FLOAT,
    -- VIX term structure
    vix_9d            FLOAT,
    vix_30d           FLOAT,
    vix_93d           FLOAT,
    vix_structure     TEXT,
    -- fear & greed
    fear_greed_today  INTEGER,
    fear_greed_7d_avg FLOAT,
    -- put/call
    put_call_ratio    FLOAT,
    -- macro scalars
    yield_2y          FLOAT,
    yield_10y         FLOAT,
    breakeven_10y     FLOAT,
    unemployment      FLOAT,
    initial_claims    FLOAT,
    -- raw JSON blob for anything not in typed columns
    raw_context_json  JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (as_of_ts)
);
"""

with get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()
print("Schema bootstrap complete (all CREATE IF NOT EXISTS)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Backfill data_snapshots from run 05_data_feeds

# COMMAND ----------

def get_latest_run(run_name: str) -> Optional[mlflow.entities.Run]:
    """Get most recent MLflow run matching run_name."""
    runs = client.search_runs(
        experiment_ids=[exp.experiment_id],
        filter_string=f"tags.mlflow.runName = '{run_name}'",
        order_by=["start_time DESC"],
        max_results=1,
    )
    return runs[0] if runs else None


def download_artifact_df(run: mlflow.entities.Run, artifact_path: str) -> Optional[pd.DataFrame]:
    """Download a parquet artifact from an MLflow run into a DataFrame."""
    try:
        local_path = client.download_artifacts(run.info.run_id, artifact_path)
        return pd.read_parquet(local_path)
    except Exception as e:
        print(f"  Artifact download failed ({artifact_path}): {e}")
        return None


def download_artifact_json(run: mlflow.entities.Run, artifact_path: str) -> Optional[dict]:
    """Download a JSON artifact from an MLflow run."""
    try:
        local_path = client.download_artifacts(run.info.run_id, artifact_path)
        with open(local_path) as f:
            return json.load(f)
    except Exception as e:
        print(f"  JSON artifact download failed ({artifact_path}): {e}")
        return None


print("Fetching run: 05_data_feeds...")
run_05 = get_latest_run("05_data_feeds")

if run_05:
    snapshots_df = download_artifact_df(run_05, "data/data_snapshots.parquet")
    ctx_pkg      = download_artifact_json(run_05, "data/context_packages.json")
    fg_df        = download_artifact_df(run_05, "data/fear_greed.parquet")
    print(f"  run_id: {run_05.info.run_id}")
    print(f"  snapshots: {len(snapshots_df) if snapshots_df is not None else 0} rows")
else:
    print("  WARNING: 05_data_feeds run not found in MLflow. Run that notebook first.")
    snapshots_df = None
    ctx_pkg      = None
    fg_df        = None

# COMMAND ----------

# Upsert data_snapshots
if snapshots_df is not None and not snapshots_df.empty:
    upsert_sql = """
        INSERT INTO data_snapshots (id, called_ts, as_of_ts, source, payload_digest)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    rows = []
    for _, row in snapshots_df.iterrows():
        rows.append((
            str(row['id']),
            row['called_ts'],
            row['as_of_ts'],
            str(row['source']),
            str(row['payload_digest']),
        ))

    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, upsert_sql, rows)
        conn.commit()
    print(f"data_snapshots: upserted {len(rows)} rows")
else:
    print("data_snapshots: no data to upsert")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Backfill technical_features_log from run 06_technical_features

# COMMAND ----------

print("Fetching run: 06_technical_features...")
run_06 = get_latest_run("06_technical_features")

if run_06:
    tech_df = download_artifact_df(run_06, "data/technical_features.parquet")
    tq_ctx  = download_artifact_json(run_06, "data/technical_quant_context.json")
    print(f"  run_id: {run_06.info.run_id}")
    print(f"  features: {tech_df.shape if tech_df is not None else 'none'}")
else:
    print("  WARNING: 06_technical_features run not found. Run that notebook first.")
    tech_df = None
    tq_ctx  = None

# COMMAND ----------

if tech_df is not None and not tech_df.empty:
    upsert_sql = """
        INSERT INTO technical_features_log (
            as_of_ts, ticker, rsi_14, rsi_7, rsi_14_zone,
            macd_hist, macd_bullish, adx_14, trend_strength,
            above_ema50, above_ema200, hv_21, hv_63,
            bb_width, atr_14_pct, volume_ratio_5_20, mfi_14
        ) VALUES %s
        ON CONFLICT (as_of_ts, ticker) DO NOTHING
    """

    def safe_float(v):
        try:
            f = float(v)
            return None if (f != f) else f  # NaN check
        except Exception:
            return None

    def safe_int(v):
        try:
            return int(v)
        except Exception:
            return None

    rows = []
    for _, row in tech_df.iterrows():
        rows.append((
            row.get('as_of_ts'),
            str(row.get('ticker', '')),
            safe_float(row.get('rsi_14')),
            safe_float(row.get('rsi_7')),
            row.get('rsi_14_zone'),
            safe_float(row.get('macd_hist')),
            safe_int(row.get('macd_bullish')),
            safe_float(row.get('adx_14')),
            row.get('trend_strength'),
            safe_int(row.get('above_ema50')),
            safe_int(row.get('above_ema200')),
            safe_float(row.get('hv_21')),
            safe_float(row.get('hv_63')),
            safe_float(row.get('bb_width')),
            safe_float(row.get('atr_14_pct')),
            safe_float(row.get('volume_ratio_5_20')),
            safe_float(row.get('mfi_14')),
        ))

    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, upsert_sql, rows)
        conn.commit()
    print(f"technical_features_log: upserted {len(rows)} rows")
else:
    print("technical_features_log: no data to upsert")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Backfill market_context_log from run 05 context packages + run 06 breadth

# COMMAND ----------

if ctx_pkg and tq_ctx:
    macro_data  = ctx_pkg.get('macro_fundamentals', {}).get('data', {})
    macro_vec   = macro_data.get('macro_vector', {})
    vix_term    = macro_data.get('vix_term', {})
    narr_data   = ctx_pkg.get('narrative_behavioral', {}).get('data', {})
    cont_data   = ctx_pkg.get('contrarian', {}).get('data', {})
    put_call    = cont_data.get('put_call_ratio', {})
    breadth     = tq_ctx.get('regime_breadth', {})
    cross_asset = tq_ctx.get('cross_asset', {})

    # Build raw JSON blob for columns not broken out
    raw_blob = {
        'news_sentiment':     narr_data.get('news_sentiment'),
        'analyst_dispersion': cont_data.get('analyst_dispersion'),
        'macro_full':         macro_vec,
    }

    upsert_sql = """
        INSERT INTO market_context_log (
            as_of_ts,
            pct_above_50d_ma, pct_above_200d_ma, breadth_regime,
            corr_spy_tlt_60d, corr_spy_gld_60d, corr_spy_btc_60d,
            vix_9d, vix_30d, vix_93d, vix_structure,
            fear_greed_today, fear_greed_7d_avg,
            put_call_ratio,
            yield_2y, yield_10y, breakeven_10y, unemployment, initial_claims,
            raw_context_json
        ) VALUES %s
        ON CONFLICT (as_of_ts) DO NOTHING
    """

    as_of = ctx_pkg.get('macro_fundamentals', {}).get('as_of_ts', AS_OF_TS)

    rows = [(
        as_of,
        safe_float(breadth.get('pct_above_50d_ma')),
        safe_float(breadth.get('pct_above_200d_ma')),
        breadth.get('breadth_regime'),
        safe_float(cross_asset.get('corr_spy_tlt_60d')),
        safe_float(cross_asset.get('corr_spy_gld_60d')),
        safe_float(cross_asset.get('corr_spy_btc_60d')),
        safe_float(vix_term.get('vix_9d')),
        safe_float(vix_term.get('vix_30d')),
        safe_float(vix_term.get('vix_93d')),
        vix_term.get('structure'),
        safe_int(narr_data.get('fear_greed_today')),
        safe_float(narr_data.get('fear_greed_7d_avg')),
        safe_float(put_call.get('put_call_ratio')),
        safe_float(macro_vec.get('yield_2y')),
        safe_float(macro_vec.get('yield_10y')),
        safe_float(macro_vec.get('breakeven_10y')),
        safe_float(macro_vec.get('unemployment')),
        safe_float(macro_vec.get('initial_claims')),
        json.dumps(raw_blob),
    )]

    with get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, upsert_sql, rows)
        conn.commit()
    print(f"market_context_log: upserted 1 row (as_of={as_of[:19]})")
else:
    print("market_context_log: context packages not available — run 05 and 06 first")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Backfill dissensus_runs from run 04 simulation

# COMMAND ----------

print("Fetching run: 04_dissensus_scorer...")
run_04 = get_latest_run("04_dissensus_scorer")

if run_04:
    # Try to pull the historical simulation artifact if it was saved
    sim_df = download_artifact_df(run_04, "data/spf_simulation.parquet")
    if sim_df is not None:
        print(f"  Simulation data: {sim_df.shape}")
        print(f"  Columns: {list(sim_df.columns)}")
    else:
        print("  No simulation parquet found — scorer ran but didn't save per-period output")
        print("  dissensus_runs backfill will be seeded from live agent runs only")
else:
    print("  WARNING: 04_dissensus_scorer run not found")
    sim_df = None

# Backfill dissensus_runs if simulation data exists and has the right schema
if sim_df is not None and not sim_df.empty:
    expected_cols = {'d_t', 'as_of_ts', 'regime'}
    if expected_cols.issubset(sim_df.columns):
        upsert_sql = """
            INSERT INTO dissensus_runs (
                run_id, as_of_ts, d_t, d_t_z, regime,
                ood_flag, suspicious_consensus, n_agents
            ) VALUES %s
            ON CONFLICT (run_id, as_of_ts) DO NOTHING
        """
        rows = []
        for _, row in sim_df.iterrows():
            rows.append((
                run_04.info.run_id,
                row.get('as_of_ts'),
                safe_float(row.get('d_t')),
                safe_float(row.get('d_t_z')),
                str(row.get('regime', 'normal')),
                bool(row.get('ood_flag', False)),
                bool(row.get('suspicious_consensus', False)),
                safe_int(row.get('n_agents', 5)),
            ))

        with get_conn() as conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(cur, upsert_sql, rows)
            conn.commit()
        print(f"dissensus_runs: upserted {len(rows)} historical rows from SPF simulation")
    else:
        missing = expected_cols - set(sim_df.columns)
        print(f"  Simulation df missing columns: {missing} — skipping backfill")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Verification Queries

# COMMAND ----------

print("=== Supabase Table Counts ===")
tables = [
    'dissensus_runs',
    'dissensus_agent_outputs',
    'data_snapshots',
    'technical_features_log',
    'market_context_log',
]

with get_conn() as conn:
    with conn.cursor() as cur:
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            print(f"  {table:35s}: {count:>6} rows")

# COMMAND ----------

# Spot-check latest technical_features_log
print("\n=== Latest technical_features_log ===")
with get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ticker, rsi_14, adx_14, hv_21, above_ema200
            FROM technical_features_log
            ORDER BY as_of_ts DESC, ticker
            LIMIT 10
        """)
        rows = cur.fetchall()
        print(f"  {'ticker':10s} {'rsi_14':>8} {'adx_14':>8} {'hv_21':>8} {'above_200':>9}")
        for r in rows:
            rsi = f"{r[1]:.1f}" if r[1] else "N/A"
            adx = f"{r[2]:.1f}" if r[2] else "N/A"
            hv  = f"{r[3]*100:.1f}%" if r[3] else "N/A"
            a200 = "Yes" if r[4] else "No"
            print(f"  {r[0]:10s} {rsi:>8} {adx:>8} {hv:>8} {a200:>9}")

# COMMAND ----------

# Spot-check latest market_context_log
print("\n=== Latest market_context_log ===")
with get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT as_of_ts, breadth_regime, vix_30d, fear_greed_today,
                   put_call_ratio, yield_10y
            FROM market_context_log
            ORDER BY as_of_ts DESC
            LIMIT 3
        """)
        rows = cur.fetchall()
        for r in rows:
            print(f"  {str(r[0])[:19]}  regime={r[1]}  VIX={r[2]}  "
                  f"FG={r[3]}  P/C={r[4]}  10y={r[5]}")

print("\nBackfill complete.")
print("Next: 08_agent_context_builders — 5 LLM agent context package factories")
