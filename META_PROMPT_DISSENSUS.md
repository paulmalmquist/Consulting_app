# META PROMPT — Dissensus: Agent Disagreement as a First-Class Signal
# Target: Winston trading & market intelligence platform
# Executor: Claude Code (autonomous, multi-step)
# Status: ACTIVE BUILD DIRECTIVE

---

## ORIENTATION — READ BEFORE WRITING ANY CODE

You are building the Dissensus module inside Winston. This is a production feature,
not a prototype. Read every section before writing a single line.

### What Already Exists

Four validated Databricks notebooks live at:
  /Users/paulmalmquist@gmail.com/Drafts/ in workspace dbc-2504bec5-b5ab.cloud.databricks.com

  01_spf_ingest       — Downloads Philly Fed SPF microdata, computes W1/JSD/directional
                        disagreement per quarter, builds composite D_t with rolling
                        z-scores, logs spf_master.parquet to MLflow experiment
                        /Users/paulmalmquist@gmail.com/HistoryRhymesML

  02_spf_backtest     — Runs 4 pre-registered regressions (realized vol, drawdown,
                        recession probit, credit spread delta) with expanding-window
                        OOS from 1996Q1 and block bootstrap. Logs results to MLflow.

  03_ood_detector     — Pulls VIX/term spread/HY credit/EPU/realized vol daily.
                        Ledoit-Wolf rolling covariance. Mahalanobis distance. OOD flag
                        at 99th pct. Validated against GFC/COVID/SVB. Logs ood_state.parquet.

  04_dissensus_scorer — Production DisagreementScorer class. W1/JSD/directional/semantic.
                        Composite D_t, rolling z-scores, hysteresis, regime flags,
                        suspicious_consensus. AggregatorIntegration (CI + extremization).
                        10 unit tests. Logs scorer_simulation.parquet.

These notebooks have validated the signal exists in SPF proxy data. They are NOT
connected to any Supabase table, FastAPI route, or frontend component yet.
Do not modify the notebooks. Build on top of them.

### Design Invariants (non-negotiable)

D1 — Agents never see each other's outputs. Enforce structurally, not by convention.
D2 — W1 dominates the composite score. W1(bear,bull) > W1(bear,base) always.
D3 — Every LLM call records model_version (e.g. "gpt-4o-2024-08-06"). NOT nullable.
D4 — Every data pull writes as_of_ts to data_snapshots. No agent sees future data.
D5 — Provider diversity: 2 OpenAI, 2 Anthropic, 1 other. Never all same family.
D6 — OOD + low disagreement = suspicious_consensus = maximum caution.
D7 — Heavy compute (rolling stats, regressions, covariance) runs in Databricks.
D8 — No Celery, no Redis. Databricks pipeline runner + Supabase for state.
D9 — Free data sources first. No paid sources without written trade-off justification.
D10 — Phase gates are hard gates. Build gate-check queries alongside each phase.

### Winston Stack Reference

  Frontend:  repo-b/  — Next.js 14, Tailwind bm-* classes, theme-aware chart getters
  Backend:   backend/ — FastAPI, Supabase Postgres w/ pgvector
  ML:        Databricks notebooks, MLflow experiment HistoryRhymesML
  DB:        Supabase — schema prefix `forecasting`, existing schemas include `repe`
  Agents:    OpenAI GPT-4o + Anthropic Claude API
  Data:      FRED, yfinance, Finnhub, CoinGecko, Alternative.me

  Key existing patterns to follow:
  - Route file pattern:  backend/app/routes/nv_ai_copilot.py
  - Service pattern:     backend/app/services/ai_gateway.py
  - Frontend chart:      repo-b/src/components/history-rhymes/HistoryRhymesTab.tsx
  - Supabase migration:  repo-b/db/schema/ — NNN_module_description.sql format
  - DB guardrails:       Every new table needs RLS + env_id + business_id (see CLAUDE.md)
  - Episode embeddings:  HNSW index pattern from existing episode_embeddings table

---

## BUILD ORDER — EXECUTE IN SEQUENCE, COMMIT AFTER EACH STEP

Do not start Step N+1 until Step N is committed and CI is green.

  Step 1:  Supabase migration (schema + indexes + RLS)
  Step 2:  Seed data (agents registry, assets registry, horizons registry)
  Step 3:  Databricks → Supabase write bridge (backfill SPF simulation data)
  Step 4:  Five LLM agent definitions + isolated context builders
  Step 5:  Nightly agent runner Databricks job
  Step 6:  Outcome resolution pipeline
  Step 7:  Proxy correlation audit nightly job
  Step 8:  Probe set job + CUSUM detector
  Step 9:  Adversarial defense layer + kill switch
  Step 10: FastAPI endpoints (3 routes)
  Step 11: Frontend DissensusPanel component

---

## STEP 1 — SUPABASE MIGRATION

File: repo-b/db/schema/{NNN}_dissensus.sql
File: repo-b/db/schema/{NNN}_dissensus_down.sql

Use the next available sequential number. Check existing files to confirm.

### Tables to create (all in `forecasting` schema)

Every table must have:
  - `env_id TEXT NOT NULL` and `business_id UUID NOT NULL` except shared reference
    tables (agents, horizons, assets are shared dimensions — exempt per ARCHITECTURE.md)
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  - Tenant isolation policy using `env_id = current_setting('app.env_id', true)`
    on non-exempt tables
  - `COMMENT ON TABLE` explaining purpose and owning module

```sql
-- 1. agents — agent registry
CREATE TABLE forecasting.agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  provider        TEXT NOT NULL,          -- 'openai' | 'anthropic' | 'google' | 'mistral'
  model_family    TEXT NOT NULL,          -- 'gpt-4o' | 'claude-3-5' etc
  role            TEXT NOT NULL,          -- 'macro_fundamentals' | 'technical_quant' |
                                          --  'narrative_behavioral' | 'contrarian' |
                                          --  'adversarial_red_team'
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. assets — asset registry
CREATE TABLE forecasting.assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL UNIQUE,
  asset_class TEXT NOT NULL,   -- 'equity_index' | 'crypto' | 'bond_etf' | 'commodity'
  subclass    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. horizons — horizon registry
CREATE TABLE forecasting.horizons (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label   TEXT NOT NULL UNIQUE,   -- '1w' | '1m' | '3m'
  days    INTEGER NOT NULL,
  active  BOOLEAN NOT NULL DEFAULT true
);

-- 4. agent_forecasts — TimescaleDB hypertable (partition monthly)
CREATE TABLE forecasting.agent_forecasts (
  id               UUID        NOT NULL DEFAULT gen_random_uuid(),
  forecast_ts      TIMESTAMPTZ NOT NULL,
  agent_id         UUID        NOT NULL REFERENCES forecasting.agents(id),
  asset_id         UUID        NOT NULL REFERENCES forecasting.assets(id),
  horizon_id       UUID        NOT NULL REFERENCES forecasting.horizons(id),
  env_id           TEXT        NOT NULL,
  business_id      UUID        NOT NULL,
  p_bear           NUMERIC(8,6) NOT NULL CHECK (p_bear BETWEEN 0 AND 1),
  p_base           NUMERIC(8,6) NOT NULL CHECK (p_base BETWEEN 0 AND 1),
  p_bull           NUMERIC(8,6) NOT NULL CHECK (p_bull BETWEEN 0 AND 1),
  CHECK (ABS(p_bear + p_base + p_bull - 1.0) < 1e-5),
  confidence       NUMERIC(5,4),
  rationale_text   TEXT,
  rationale_embedding VECTOR(1536),
  model_version    TEXT        NOT NULL,   -- e.g. 'gpt-4o-2024-08-06'  NEVER NULL
  temperature      NUMERIC(4,3),
  random_seed      INTEGER,
  as_of_ts         TIMESTAMPTZ NOT NULL,
  data_snapshot_id UUID,
  PRIMARY KEY (id, forecast_ts)
);
SELECT create_hypertable('forecasting.agent_forecasts', 'forecast_ts',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);

-- 5. aggregated_forecasts
CREATE TABLE forecasting.aggregated_forecasts (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_ts                     TIMESTAMPTZ NOT NULL,
  asset_id                        UUID NOT NULL REFERENCES forecasting.assets(id),
  horizon_id                      UUID NOT NULL REFERENCES forecasting.horizons(id),
  env_id                          TEXT NOT NULL,
  business_id                     UUID NOT NULL,
  p_bear                          NUMERIC(8,6) NOT NULL CHECK (p_bear BETWEEN 0 AND 1),
  p_base                          NUMERIC(8,6) NOT NULL CHECK (p_base BETWEEN 0 AND 1),
  p_bull                          NUMERIC(8,6) NOT NULL CHECK (p_bull BETWEEN 0 AND 1),
  CHECK (ABS(p_bear + p_base + p_bull - 1.0) < 1e-5),
  agent_weights                   JSONB NOT NULL,
  extremization_alpha_used        NUMERIC(6,4),
  extremization_alpha_adjusted    NUMERIC(6,4),
  ci_width_base                   NUMERIC(6,4),
  ci_width_adjusted               NUMERIC(6,4),
  aggregation_method              TEXT NOT NULL DEFAULT 'extremized_log_pool'
);

-- 6. disagreement — core Dissensus output
CREATE TABLE forecasting.disagreement (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_ts               TIMESTAMPTZ NOT NULL,
  asset_id                  UUID NOT NULL REFERENCES forecasting.assets(id),
  horizon_id                UUID NOT NULL REFERENCES forecasting.horizons(id),
  env_id                    TEXT NOT NULL,
  business_id               UUID NOT NULL,
  aggregated_forecast_id    UUID REFERENCES forecasting.aggregated_forecasts(id),
  w1_pairwise_mean          NUMERIC(10,8),
  jsd_mean_pairwise         NUMERIC(10,8),
  jsd_vs_centroid           NUMERIC(10,8),
  directional_disagreement  NUMERIC(10,8),
  magnitude_disagreement    NUMERIC(10,8),
  prob_variance             NUMERIC(10,8),
  rationale_mean_cosine_dist NUMERIC(10,8),
  composite_D               NUMERIC(10,6),
  composite_D_z252          NUMERIC(10,6),
  composite_D_pct252        NUMERIC(8,6),
  z_w1                      NUMERIC(10,6),
  z_jsd                     NUMERIC(10,6),
  z_dir                     NUMERIC(10,6),
  regime_flag               TEXT NOT NULL
    CHECK (regime_flag IN ('normal','elevated','high','extreme',
                           'suspicious_consensus','warmup')),
  ood_flag                  BOOLEAN NOT NULL DEFAULT false,
  n_effective_agents        NUMERIC(6,3),
  mean_p_bear               NUMERIC(8,6),
  mean_p_base               NUMERIC(8,6),
  mean_p_bull               NUMERIC(8,6),
  frac_bullish              NUMERIC(6,4),
  n_agents                  INTEGER
);

-- 7. outcomes — TimescaleDB hypertable
CREATE TABLE forecasting.outcomes (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  forecast_id           UUID        NOT NULL,
  asset_id              UUID        NOT NULL REFERENCES forecasting.assets(id),
  env_id                TEXT        NOT NULL,
  business_id           UUID        NOT NULL,
  resolution_ts         TIMESTAMPTZ NOT NULL,
  actual_return         NUMERIC(10,6),
  actual_bin            TEXT CHECK (actual_bin IN ('bear','base','bull')),
  brier_score_agent     NUMERIC(10,8),
  brier_score_aggregate NUMERIC(10,8),
  realized_vol_h        NUMERIC(10,6),
  max_drawdown_h        NUMERIC(10,6),
  PRIMARY KEY (id, resolution_ts)
);
SELECT create_hypertable('forecasting.outcomes', 'resolution_ts',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);

-- 8. data_snapshots — point-in-time audit
CREATE TABLE forecasting.data_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_ts       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  as_of_ts        TIMESTAMPTZ NOT NULL,
  source          TEXT NOT NULL,   -- e.g. 'FRED:DGS10' | 'yfinance:SPY'
  tool_call_hash  TEXT,
  payload_digest  TEXT
);

-- 9. regime_events
CREATE TABLE forecasting.regime_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type          TEXT NOT NULL CHECK (event_type IN (
                        'disagreement_spike','monoculture_suspected',
                        'confident_wrong_risk','ood_input',
                        'provider_correlation_breach',
                        'silent_model_update_detected',
                        'prompt_injection_detected',
                        'divergence_from_human_consensus')),
  asset_id            UUID REFERENCES forecasting.assets(id),
  horizon_id          UUID REFERENCES forecasting.horizons(id),
  env_id              TEXT,
  business_id         UUID,
  triggering_metrics  JSONB,
  severity            TEXT NOT NULL CHECK (severity IN ('watch','action','kill')),
  resolved_at         TIMESTAMPTZ
);

-- 10. probe_set_results
CREATE TABLE forecasting.probe_set_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_ts         TIMESTAMPTZ NOT NULL,
  agent_id         UUID NOT NULL REFERENCES forecasting.agents(id),
  probe_question_id TEXT NOT NULL,
  p_bear           NUMERIC(8,6) CHECK (p_bear BETWEEN 0 AND 1),
  p_base           NUMERIC(8,6) CHECK (p_base BETWEEN 0 AND 1),
  p_bull           NUMERIC(8,6) CHECK (p_bull BETWEEN 0 AND 1),
  brier_score      NUMERIC(10,8),
  model_version    TEXT NOT NULL
);

-- 11. ood_state — written nightly by Databricks
CREATE TABLE forecasting.ood_state (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE NOT NULL UNIQUE,
  mahalanobis_d    NUMERIC(10,6),
  percentile       NUMERIC(8,4),
  ood_flag         BOOLEAN NOT NULL DEFAULT false,
  vix              NUMERIC(8,4),
  term_spread      NUMERIC(8,4),
  hy_credit_spread NUMERIC(8,4),
  log_realized_vol NUMERIC(8,6),
  log_epu          NUMERIC(8,6),
  as_of_ts         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. proxy_correlation_audit — nightly Databricks job
CREATE TABLE forecasting.proxy_correlation_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at     DATE NOT NULL,
  asset_id        UUID REFERENCES forecasting.assets(id),
  horizon_id      UUID REFERENCES forecasting.horizons(id),
  corr_D_epu      NUMERIC(8,6),
  corr_D_vix      NUMERIC(8,6),
  corr_D_finnhub  NUMERIC(8,6),
  corr_D_fwd_vol  NUMERIC(8,6),
  n_obs           INTEGER,
  note            TEXT
);
```

### Indexes (aggressive — spec requirement)

```sql
-- agent_forecasts
CREATE INDEX ON forecasting.agent_forecasts (asset_id, horizon_id, forecast_ts DESC);
CREATE INDEX ON forecasting.agent_forecasts (agent_id, forecast_ts DESC);
CREATE INDEX ON forecasting.agent_forecasts (model_version, forecast_ts DESC);
CREATE INDEX USING hnsw ON forecasting.agent_forecasts (rationale_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 256);

-- disagreement
CREATE INDEX ON forecasting.disagreement (asset_id, horizon_id, forecast_ts DESC);
CREATE INDEX ON forecasting.disagreement (regime_flag, forecast_ts DESC);
CREATE INDEX ON forecasting.disagreement (ood_flag, forecast_ts DESC) WHERE ood_flag = true;

-- aggregated_forecasts
CREATE INDEX ON forecasting.aggregated_forecasts (asset_id, horizon_id, forecast_ts DESC);

-- regime_events
CREATE INDEX ON forecasting.regime_events (asset_id, horizon_id, event_ts DESC);
CREATE INDEX ON forecasting.regime_events (severity, resolved_at) WHERE resolved_at IS NULL;

-- outcomes
CREATE INDEX ON forecasting.outcomes (forecast_id);
CREATE INDEX ON forecasting.outcomes (asset_id, resolution_ts DESC);

-- ood_state
CREATE INDEX ON forecasting.ood_state (date DESC);
```

### Materialized view

```sql
CREATE MATERIALIZED VIEW forecasting.agent_brier_rolling AS
SELECT
  af.agent_id,
  af.asset_id,
  af.horizon_id,
  AVG(CASE WHEN o.resolution_ts >= NOW() - INTERVAL '30 days'
           THEN o.brier_score_agent END)  AS brier_30d,
  AVG(CASE WHEN o.resolution_ts >= NOW() - INTERVAL '90 days'
           THEN o.brier_score_agent END)  AS brier_90d,
  AVG(CASE WHEN o.resolution_ts >= NOW() - INTERVAL '180 days'
           THEN o.brier_score_agent END)  AS brier_180d,
  COUNT(*) FILTER (WHERE o.resolution_ts >= NOW() - INTERVAL '90 days') AS n_resolved_90d
FROM forecasting.agent_forecasts af
JOIN forecasting.outcomes o ON o.forecast_id = af.id
GROUP BY af.agent_id, af.asset_id, af.horizon_id;

CREATE UNIQUE INDEX ON forecasting.agent_brier_rolling (agent_id, asset_id, horizon_id);
```

### Phase 1 gate check queries (ship alongside migration)

File: repo-b/db/queries/dissensus_phase1_gates.sql

```sql
-- Gate 1: >= 90 resolved forecasts per agent per (asset, horizon)
SELECT agent_id, asset_id, horizon_id, COUNT(*) as n_resolved
FROM forecasting.outcomes o
JOIN forecasting.agent_forecasts af ON o.forecast_id = af.id
GROUP BY 1,2,3
HAVING COUNT(*) >= 90;

-- Gate 2: trailing 90-day Brier < 0.25 per agent
SELECT agent_id, AVG(brier_score_agent) AS brier_90d
FROM forecasting.outcomes o
JOIN forecasting.agent_forecasts af ON o.forecast_id = af.id
WHERE o.resolution_ts >= NOW() - INTERVAL '90 days'
GROUP BY 1
HAVING AVG(brier_score_agent) < 0.25;

-- Gate 3: zero PIT violations
SELECT COUNT(*) AS pit_violations
FROM forecasting.data_snapshots ds
JOIN forecasting.agent_forecasts af ON ds.id = af.data_snapshot_id
WHERE ds.as_of_ts > af.forecast_ts;
-- MUST BE 0

-- Gate 4: HHI < 0.4
WITH w AS (
  SELECT af.agent_id, 1.0/NULLIF(AVG(o.brier_score_agent),0) AS inv_b
  FROM forecasting.outcomes o
  JOIN forecasting.agent_forecasts af ON o.forecast_id = af.id
  WHERE o.resolution_ts >= NOW() - INTERVAL '90 days'
  GROUP BY 1
), normed AS (
  SELECT agent_id, inv_b / SUM(inv_b) OVER () AS w FROM w
)
SELECT SUM(w*w) AS hhi FROM normed;
-- MUST BE < 0.4
```

---

## STEP 2 — SEED DATA

File: repo-b/db/seeds/dissensus_seed.sql

```sql
-- Five agents (provider diversity enforced: 2 OpenAI, 2 Anthropic, 1 Google)
INSERT INTO forecasting.agents (name, provider, model_family, role) VALUES
  ('macro_fundamentals',    'openai',    'gpt-4o',       'macro_fundamentals'),
  ('technical_quant',       'openai',    'gpt-4o',       'technical_quant'),
  ('narrative_behavioral',  'anthropic', 'claude-3-5',   'narrative_behavioral'),
  ('contrarian',            'anthropic', 'claude-3-5',   'contrarian'),
  ('adversarial_red_team',  'google',    'gemini-1-5',   'adversarial_red_team');

-- Assets
INSERT INTO forecasting.assets (symbol, asset_class, subclass) VALUES
  ('SPY',  'equity_index', 'us_large_cap'),
  ('QQQ',  'equity_index', 'us_tech'),
  ('IWM',  'equity_index', 'us_small_cap'),
  ('TLT',  'bond_etf',     'us_long_duration'),
  ('GLD',  'commodity',    'gold'),
  ('BTC',  'crypto',       'bitcoin'),
  ('ETH',  'crypto',       'ethereum');

-- Horizons
INSERT INTO forecasting.horizons (label, days) VALUES
  ('1w',  7),
  ('1m',  30),
  ('3m',  90);
```

---

## STEP 3 — DATABRICKS → SUPABASE WRITE BRIDGE

File: notebooks/05_supabase_backfill.py (upload to Databricks Drafts)

This notebook reads the scorer_simulation.parquet artifact from the 04_dissensus_scorer
MLflow run and writes the historical SPF-proxy disagreement data into:
  forecasting.disagreement (one row per quarter, asset=SPY, horizon=3m, env_id='system')
  forecasting.ood_state    (from ood_state.parquet, 03_ood_detector MLflow run)

Purpose: seeds the rolling z-score history so the scorer has a warm baseline
on day one of live operation. Without this backfill, the scorer is in warmup
for 20+ quarters of live data before producing valid regime flags.

Connection: use SUPABASE_URL and SUPABASE_SERVICE_KEY from Databricks secrets
scope "winston" (keys: supabase_url, supabase_service_key).

Use the supabase-py client. Upsert on (forecast_ts, asset_id, horizon_id) —
idempotent so the notebook is safe to re-run.

Write a `data_snapshots` row for every batch: source='spf_backfill',
as_of_ts = the quarter's period_date, called_ts = NOW().

After writing, verify row counts match expected (one row per quarter per table).
Log verification results to MLflow run 05_supabase_backfill.

---

## STEP 4 — FIVE LLM AGENT DEFINITIONS

File: backend/app/services/dissensus/agents/base.py
File: backend/app/services/dissensus/agents/macro_fundamentals.py
File: backend/app/services/dissensus/agents/technical_quant.py
File: backend/app/services/dissensus/agents/narrative_behavioral.py
File: backend/app/services/dissensus/agents/contrarian.py
File: backend/app/services/dissensus/agents/adversarial_red_team.py
File: backend/app/services/dissensus/agents/context_builder.py

### Architecture rules (enforce structurally)

Each agent receives a context object built exclusively from its own data pipe.
No shared context objects. No agent reads another agent's output.
The context_builder.py factory function builds one ContextPackage per agent,
pulling from independent data sources per the table below.

```
Agent                   Primary data sources          Model (pinned)
─────────────────────   ──────────────────────────    ──────────────────────────
macro_fundamentals      FRED macro, SEC EDGAR, GDP    gpt-4o-2024-08-06
technical_quant         yfinance OHLCV, ta-lib         gpt-4o-2024-08-06
narrative_behavioral    Finnhub news, Alternative.me  claude-sonnet-4-5-20251022
contrarian              VIX term structure, put/call   claude-sonnet-4-5-20251022
adversarial_red_team    All of the above (read-only)  gemini-1.5-pro-002
```

Note: adversarial_red_team gets a read-only view of all data but is explicitly
instructed to argue the opposite of the consensus. It does NOT see agent outputs.

### ContextPackage dataclass

```python
@dataclass
class ContextPackage:
    agent_id:        str
    asset_symbol:    str
    horizon_label:   str
    forecast_ts:     datetime
    as_of_ts:        datetime        # MUST equal forecast_ts — no lookahead
    data_snapshot_id: Optional[str]  # written to data_snapshots before agent call
    facts:           dict            # agent-specific data dict
    instructions:    str             # system prompt for this agent
```

### Agent prompt template

Each agent's system prompt must include:
1. Its specific role and data sources
2. Output format instruction (EXACTLY):
   Return JSON: {"p_bear": float, "p_base": float, "p_bull": float,
                 "confidence": float, "rationale": string}
   p_bear + p_base + p_bull must sum to 1.0.
   bear = asset likely down >5% over horizon
   base = asset flat to modest move (-5% to +10%)
   bull = asset likely up >10% over horizon
3. Explicit instruction: "Do not reference what other analysts think."
4. Model version pin in the API call kwargs

### BaseAgent class must:

- Accept ContextPackage, call the LLM with pinned model_version
- Validate output probabilities sum to 1.0 (raise if not, retry once)
- Write a data_snapshots row before every external API call
- Return AgentOutput (dataclass from 04_dissensus_scorer.py)
- Record model_version in AgentOutput.model_version — NOT nullable
- Never catch and swallow exceptions silently — surface to caller

---

## STEP 5 — NIGHTLY AGENT RUNNER JOB

File: notebooks/06_agent_runner.py (upload to Databricks Drafts)

Runs daily at 18:00 UTC (after US market close).

For each (asset, horizon) pair in forecasting.assets × forecasting.horizons
where active=true:

1. Snapshot current timestamp as forecast_ts
2. Build 5 independent ContextPackages via context_builder.py
3. Run all 5 agents in parallel (asyncio.gather or ThreadPoolExecutor)
4. Validate: every agent returned before proceeding
5. Load ood_flag from forecasting.ood_state WHERE date = TODAY
6. Run DisagreementScorer.score(agent_outputs, ood_flag)
7. Run extremized log-opinion pooling aggregator with DissensusResult
8. Write to forecasting.agent_forecasts (one row per agent)
9. Write to forecasting.aggregated_forecasts (one row)
10. Write to forecasting.disagreement (one row)
11. Emit regime_events rows for any triggered flags
12. Log run summary to MLflow run "06_agent_runner_{date}"

Failure handling:
- If an agent fails, log the error and continue with remaining agents
- If fewer than 3 agents return, abort the run and emit a regime_event
  (severity='action', event_type='monoculture_suspected')
- Never write partial disagreement rows — atomic write or nothing

Cost guard: before running, estimate token cost. If estimated cost > $50 for
the day's run, log a warning and halt. Paul reviews before re-enabling.

---

## STEP 6 — OUTCOME RESOLUTION PIPELINE

File: notebooks/07_outcome_resolution.py (upload to Databricks Drafts)

Runs daily at 06:00 UTC (before market open).

For every row in forecasting.aggregated_forecasts where:
  - No matching outcome exists in forecasting.outcomes
  - forecast_ts + horizon.days <= NOW() - 1 day (fully resolved)

1. Pull actual price from yfinance for the asset at resolution date
2. Compute actual_return = (price_at_resolution / price_at_forecast) - 1
3. Assign actual_bin:
     bear if actual_return < -0.05
     bull if actual_return > +0.10
     base otherwise
4. Compute Brier score per agent:
     brier = (p_assigned_bin - 1)^2 + sum((p_other_bins)^2)
5. Write to forecasting.outcomes
6. Refresh materialized view forecasting.agent_brier_rolling
7. Log resolution count to MLflow

This is what enables Brier-weighted aggregation and the Phase 1 gate checks.

---

## STEP 7 — PROXY CORRELATION AUDIT

File: notebooks/08_proxy_correlation_audit.py (upload to Databricks Drafts)

Runs nightly. For each (asset, horizon) pair:

1. Pull last 180 days of composite_D from forecasting.disagreement
2. Pull VIX, EPU from forecasting.ood_state for the same dates
3. Pull Finnhub analyst dispersion for covered equity tickers
4. Pull SP500 forward realized vol (1m) from yfinance
5. Compute Spearman rank correlations:
     corr(D_t, VIX_t)
     corr(D_t, EPU_t)
     corr(D_t, finnhub_dispersion_t)   -- where available
     corr(D_t, realized_vol_{t+1m})    -- OOS
6. Upsert to forecasting.proxy_correlation_audit

Month-6 targets (log warnings when below):
  corr(D, EPU)     >= 0.30
  corr(D, VIX)     >= 0.30
  corr(D, finnhub) >= 0.20
  corr(D, fwd_vol) >= 0.20

---

## STEP 8 — PROBE SET + CUSUM DETECTOR

File: notebooks/09_probe_set.py (upload to Databricks Drafts)

### 20 probe questions (fixed, never change without versioning)

These are stable, decidable within 24 hours, using public data only.

  Probe ID  | Question template
  ─────────────────────────────────────────────────────────────────────
  P01       | Will SPY close higher tomorrow than today? (binary)
  P02       | Will SPY's tomorrow close be in the top 50% of its 30d range?
  P03       | Will VIX be higher tomorrow than today?
  P04       | Will BTC close higher tomorrow than today?
  P05       | Will the 10Y yield be higher tomorrow than today?
  P06       | Will SPY close higher in 5 days than today?
  P07       | Will GLD close higher in 5 days than today?
  P08       | Will VIX be above its 20-day moving average in 5 days?
  P09       | Will QQQ outperform IWM over the next 5 days?
  P10       | Will BTC be above its 7-day moving average in 3 days?
  P11–P15   | Factual recall probes — historical questions with known answers
             (e.g., "What was SP500 return in Q1 2020?") — test for
             model knowledge drift, not market prediction
  P16–P20   | Macro regime probes — "Is current US unemployment above 5%?",
             "Is the 2y-10y yield curve currently inverted?" etc.
             Answers are deterministic from public data. Drift here = model update.

For each probe, each agent returns {p_bear, p_base, p_bull} where the
question is mapped to the 3-bin structure (bear=No, base=Uncertain, bull=Yes).

### CUSUM detector

After each day's probe run:
1. Compute Brier score per (agent, probe_question)
2. Update running CUSUM: S_t = max(0, S_{t-1} + (brier_t - brier_baseline) - k)
   where k = 0.01 (slack parameter) and brier_baseline = trailing 90-day mean
3. Change point when S_t > h = 5 (detection threshold)
4. On detection:
   a. Emit regime_events row: event_type='silent_model_update_detected', severity='action'
   b. Halve that agent's brier_weight in aggregated_forecasts going forward
   c. Require human review before restoring full weight

---

## STEP 9 — ADVERSARIAL DEFENSE LAYER + KILL SWITCH

### Defense 1: Prompt injection canary

File: backend/app/services/dissensus/defenses/injection_canary.py

At 1-in-20 calls to narrative_behavioral agent, append a rotating canary string
to the retrieved context. Canary strings are in a hardcoded list of 20 nonsense
phrases (e.g. "PURPLE_FLAMINGO_7734"). If any canary appears in the agent's
rationale output, emit regime_events (event_type='prompt_injection_detected',
severity='action'). Rotate canary after detection.

### Defense 2: Monoculture detector

File: backend/app/services/dissensus/defenses/monoculture.py

After each scorer run: check if one agent deviates >3σ while the other 4
cluster within 1σ of each other (on composite W1 distance from centroid).
If true: emit regime_events (event_type='monoculture_suspected', severity='action').
In Phase 3+: reduce position sizing to 0.5× until human review.

### Defense 3: Error correlation audit

File: notebooks/10_error_correlation_audit.py (run quarterly)

For all resolved forecasts, compute pairwise Pearson correlation of
(p_assigned_bin - actual_bin_indicator) across agents.
Any pair with ρ > 0.5: emit regime_events (event_type='provider_correlation_breach').
Surface max_pairwise_rho in the DissensusPanel frontend card.

### Defense 4: Human consensus divergence

File: backend/app/services/dissensus/defenses/human_divergence.py

Daily, compare Winston's aggregate p_bull to:
  - SPF Anxious Index (from FRED series ANXINDX, if available)
  - Finnhub analyst consensus (for SPY/QQQ)
  - Alternative.me Fear & Greed Index (crypto assets)

When LLM p_bull > 0.7 AND any human proxy signals bearish (<0.4 equivalent):
emit regime_events (event_type='divergence_from_human_consensus', severity='watch').

### Kill switch

File: backend/app/services/dissensus/kill_switch.py

```python
class DissensusKillSwitch:
    """
    Halts all Phase 3+ trading actions. Reverts to Phase 2 (diagnostic only).
    Requires explicit re-enablement with root-cause analysis.
    """
    TRIGGERS = [
        'lap_test_failure',           # look-ahead probability test fails any agent
        'silent_model_update_detected', # from probe set CUSUM
        'probe_set_brier_collapse',    # trailing 30d Brier up >50% vs 90d on >=2 agents
        'prompt_injection_detected_3x', # 3+ in trailing 24h
        'manual_override',             # insert row in kill_switch_overrides table
    ]
```

Check kill switch status at the top of every Phase 3+ action. Log every
check to kill_switch_log table (create this table in the migration).
Manual override: Paul or designated operator inserts a row into
forecasting.kill_switch_overrides (id, triggered_at, reason, triggered_by).

---

## STEP 10 — FASTAPI ENDPOINTS

File: backend/app/routes/dissensus.py

Register in backend/app/main.py under prefix /api/v1/dissensus.
Follow the pattern from backend/app/routes/nv_ai_copilot.py.

### Route 1: Current disagreement reading

```
GET /api/v1/dissensus/current?asset={symbol}&horizon={label}

Response 200:
{
  "period_ts":               string,    // ISO8601
  "composite_D":             number,
  "z_D":                     number,
  "pct_D":                   number,    // 0–1
  "regime_flag":             string,
  "ood_flag":                boolean,
  "w1_pairwise_mean":        number,
  "jsd_mean":                number,
  "directional_disagreement": number,
  "z_w1":                    number,
  "z_jsd":                   number,
  "z_dir":                   number,
  "n_eff":                   number,
  "n_agents":                integer,
  "mean_p_bear":             number,
  "mean_p_base":             number,
  "mean_p_bull":             number,
  "frac_bullish":            number,
  "max_pairwise_rho":        number | null,
  "ci_width_base":           number,
  "ci_width_adjusted":       number,
  "alpha_adjusted":          number,
  "warmup_progress":         { "n_logged": integer, "n_needed": integer } | null
}

Response 404: { "detail": "no_data", "n_logged": N, "n_needed": 20 }
  — returned during warmup period
```

Query: SELECT most recent row from forecasting.disagreement joined to
forecasting.aggregated_forecasts for the given asset/horizon.
JOIN forecasting.ood_state on date = DATE(forecast_ts) for ood_flag.

### Route 2: Historical series

```
GET /api/v1/dissensus/history?asset={symbol}&horizon={label}&days=90

Response 200: array of:
{
  "period_ts":    string,
  "composite_D":  number,
  "pct_D":        number,
  "regime_flag":  string,
  "ood_flag":     boolean
}
Ordered by period_ts ASC. Max 365 days.
```

### Route 3: Regime events

```
GET /api/v1/dissensus/events?asset={symbol}&horizon={label}&limit=3

Response 200: array of:
{
  "event_ts":          string,
  "event_type":        string,
  "severity":          string,
  "triggering_metrics": object,
  "resolved_at":       string | null
}
Ordered by event_ts DESC.
```

All three routes require auth (use existing Winston auth middleware).
Add Supabase RLS so env_id filtering is enforced at DB level.

---

## STEP 11 — FRONTEND DISSENSUS PANEL

File: repo-b/src/components/history-rhymes/DissensusPanel.tsx

### Props

```typescript
interface DissensusPanelProps {
  symbol:  string;   // e.g. "SPY"
  horizon: string;   // e.g. "1m"
}
```

### Data fetching

Use the existing Winston SWR/fetch pattern. Fetch all three endpoints in
parallel on mount and on (symbol, horizon) change. Show skeleton loaders
during fetch. Show a graceful warmup state on 404 with progress bar
(n_logged / n_needed).

Do NOT use localStorage or sessionStorage anywhere.

### Layout — three rows

**Row 1 — Regime headline**

OOD warning banner (render only when ood_flag=true):
  Amber background, amber border.
  Text: "⚠ Macro environment is outside calibrated range.
        Low disagreement here is a warning, not confidence."

Regime badge:
  normal              → bm-badge-neutral
  elevated            → bm-badge-warning
  high                → bm-badge-orange   (create if not exists, amber-600)
  extreme             → bm-badge-error
  suspicious_consensus → bm-badge-purple  (create if not exists, purple-600)
  warmup              → bm-badge-muted, italic

Composite D headline: "D = {composite_D.toFixed(2)} (z = {z_D > 0 ? '+' : ''}{z_D.toFixed(1)})"
Percentile pill: "{(pct_D * 100).toFixed(0)}th pct"

Sparkline (90 days):
  Use the existing Winston sparkline pattern (not recharts — use the same
  SVG sparkline used elsewhere in HistoryRhymesTab).
  Line color: bm-chart-primary
  Mark regime-flag transitions with small vertical tick marks.
  No axes. Just the shape. Height: 48px.

**Row 2 — Three columns**

Col 1 — Disagreement Sources:
  Horizontal stacked bar. Three segments:
    W1:          width = abs(z_w1) / (abs(z_w1) + abs(z_jsd) + abs(z_dir))
    JSD:         width = abs(z_jsd) / total
    Directional: width = abs(z_dir) / total
  Colors: W1=bm-chart-blue, JSD=bm-chart-teal, DIR=bm-chart-violet
  Hover tooltip on each segment: "{label}: z = {value.toFixed(2)}"
  Label below: "Disagreement Sources"

Col 2 — Direction Split:
  Horizontal bar centered at 50%.
  Left (bearish): width = (1 - frac_bullish) * 100%, color bm-chart-red
  Right (bullish): width = frac_bullish * 100%, color bm-chart-green
  Center line: thin vertical divider
  Below: "Bear {(mean_p_bear * 100).toFixed(0)}%  ·  Bull {(mean_p_bull * 100).toFixed(0)}%"
  Label: "Agent Direction Split"

Col 3 — Diversity:
  Large number: "{n_eff.toFixed(1)} / {n_agents}"
  Color: n_eff < 2.5 → bm-text-error, 2.5–3.5 → bm-text-warning, > 3.5 → bm-text-success
  Subtitle: "Effective independent agents"
  If max_pairwise_rho available: small text "Max pair ρ = {max_pairwise_rho.toFixed(2)}"
  Label: "Diversity"

**Row 3 — Regime event log**

Show last 3 regime_events as compact rows:
  {event_ts formatted as "MMM D HH:mm"} · {event_type} · {severity badge}
  Collapsed triggering_metrics (expand on click)
  resolved_at: show "Resolved" in green if present, else "Open" in amber

Empty state: "No recent alerts" in bm-text-muted.

### Register in HistoryRhymesTab.tsx

Add DissensusPanel below the existing forecast card. Pass symbol and horizon
from the tab's existing asset/horizon selector state. No new selectors needed.

---

## VALIDATION CRITERIA

After all 11 steps, verify:

1. Migration runs cleanly on a fresh Supabase instance with no errors
2. Seed data inserts 5 agents, 7 assets, 3 horizons
3. Backfill writes at least 100 quarterly rows to forecasting.disagreement
4. Agent runner executes a single (SPY, 1m) test run end-to-end without errors
5. All three FastAPI endpoints return valid JSON for SPY/1m
6. DissensusPanel renders in Storybook with mocked data for all regime states
7. Warmup state renders correctly when endpoint returns 404
8. OOD banner shows/hides correctly based on ood_flag
9. No localStorage/sessionStorage anywhere in the component tree
10. Kill switch halts agent runner when manually triggered via DB row insert
11. Phase 1 gate queries all run without SQL errors (results will be empty until data accumulates)

---

## WHAT TO FLAG BEFORE SHIPPING

Open a PR comment for any of:

- Composite weight change from (0.5, 0.3, 0.2)
- CI lambda outside 0.3–0.7 range
- Extremization kappa outside 0.1–0.4 range
- Any agent swap reducing below 2-OpenAI/2-Anthropic/1-other floor
- Any paid data source introduced
- Any adversarial defense deferred to a later step (all ship in Phase 1)
- Token cost estimate for daily agent runner exceeding $30/day
- SPF backtest sign failure on vol regression (document, do not tune)
- Any table created without RLS enabled
- Any LLM call without model_version recorded

---

## ROUTING HINT FOR CLAUDE CODE

This prompt spans multiple surfaces. Route as follows:

  Migration + seeds:      agents/data.md
  Agent runner + scorer:  agents/ai-copilot.md + .skills/feature-dev/SKILL.md
  FastAPI routes:         agents/bos-domain.md
  Frontend panel:         agents/frontend.md
  Notebooks:              skills/historyrhymes/SKILL.md

Read ARCHITECTURE.md before touching any migration.
Read docs/CAPABILITY_INVENTORY.md before building anything — confirm
no equivalent Dissensus capability already exists.
Read docs/LATEST.md for current production health before deploying.
