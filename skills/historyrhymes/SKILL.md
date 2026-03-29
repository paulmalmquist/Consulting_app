# HistoryRhymes — Temporal Pattern-Matching, Narrative Forecasting & Financial ML

**Owner:** Winston Autonomous Loop
**Status:** Active
**Created:** 2026-03-28
**Source of truth:** true
**Research basis:** `docs/research/2026-03-28-history-rhymes-system.md`

### Delivered Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Skill spec (this file) | `skills/historyrhymes/SKILL.md` | Active |
| Databricks config | `skills/historyrhymes/config/databricks.json` | Active |
| Model registry | `skills/historyrhymes/config/model_registry.json` | Active |
| Databricks REST client | `skills/historyrhymes/scripts/databricks_client.py` | Active |
| Supabase schema (episodes, WSS, agents) | `skills/historyrhymes/references/schema_supabase.sql` | Ready to apply |
| Seed episodes (8 historical) | `skills/historyrhymes/references/seed_episodes.json` | Ready to load |
| Podcast pipeline spec | `skills/historyrhymes/references/podcast_pipeline.md` | Reference |
| Embedding pipeline template | `skills/historyrhymes/templates/embedding_pipeline.py` | Template |
| Regime classifier template | `skills/historyrhymes/templates/regime_classifier.py` | Template |
| Podcast Intelligence schema (16 tables) | `repo-b/db/schema/425_podcast_intelligence.sql` | Ready to apply |
| Podcast architecture (15 sections) | `docs/plans/PODCAST_INTELLIGENCE_ARCHITECTURE.md` | Reference |
| Podcast extraction tips | `docs/podcast-intelligence/tips.md` | Reference |
| Build plan (5 phases) | `docs/plans/HISTORY_RHYMES_BUILD_PLAN.md` | Active |
| Trading Lab dashboard tab | `repo-b/src/components/market/HistoryRhymesTab.tsx` | Wired into Trading Lab |

---

## Purpose

HistoryRhymes is the umbrella orchestrator for Winston's quantitative research, ML model development, and temporal pattern-matching forecasting system. It implements a production-grade "history rhymes" thesis — operationalizing structured analogical forecasting (Green & Armstrong: 46% vs 32% unstructured), superforecaster cognitive architecture (Tetlock: 25-30% better than intelligence community), and adversarial countermeasures against predatory institutional exploitation.

The system adds a **6th pillar** (Temporal Pattern Matching & Narrative Overlay) alongside the existing 5-pillar ML Signal Engine, and layers a **World Signal Surveillance Engine** and **Podcast Ingestion Pipeline** as upstream data sources.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UPSTREAM DATA SOURCES                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ World Signal  │  │ Podcast      │  │ Existing fin-* Tasks     │  │
│  │ Surveillance  │  │ Ingestion    │  │ (prices, on-chain, etc)  │  │
│  │ (5 layers)   │  │ Pipeline     │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STATE VECTOR ENCODER                             │
│  Quantitative (64-dim) + Text Embeddings (128-dim) → Autoencoder   │
│  → Unified 256-dim Episode Vector (pgvector HNSW)                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Episode      │  │ Multi-Agent  │  │ Adversarial      │
│ Library      │  │ Forecaster   │  │ Framework        │
│ (pgvector    │  │ (5 agents +  │  │ (Red Team Agent  │
│  matching)   │  │  aggregator) │  │  + Honeypot Lib) │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                 │                    │
       ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              6TH PILLAR: HISTORY RHYMES OUTPUT                     │
│  Rhyme Scores + Divergence Analysis + Probabilistic Scenarios      │
│  + Trap Flags → feeds into Ensemble Fusion (existing Pillar 4)     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
     ▼                     ▼                     ▼
┌──────────┐       ┌──────────────┐      ┌──────────────┐
│ Trading  │       │ Databricks   │      │ Cross-        │
│ Lab      │       │ MLflow       │      │ Vertical      │
│ Signals  │       │ Experiments  │      │ REPE/Credit   │
└──────────┘       └──────────────┘      └──────────────┘
```

### Sub-Skill Dispatch Map

| Domain | Dispatches To | When |
|--------|--------------|------|
| Feature engineering (local) | `skills/market-rotation-engine` → `scripts/ml_features.py` | Computing quantitative features from price/volume/on-chain data |
| Feature engineering (Databricks) | Databricks REST API → `novendor_1.historyrhymes.*` tables | Large-scale feature pipelines, distributed computation |
| ML training & experiments | Databricks MLflow → experiment `HistoryRhymesML` | Model training, hyperparameter tuning, experiment tracking |
| Model registry & serving | Databricks MLflow Model Registry | Promoting models to staging/production |
| Episode library & analog matching | Supabase pgvector + FastAPI `/api/rhymes/match` | Historical pattern retrieval and Rhyme Score computation |
| Multi-agent forecasting | Claude API multi-agent framework | Probabilistic scenario generation with extremized aggregation |
| World Signal Surveillance | 5-layer signal tables in Supabase | Real-time regime detection, divergence monitoring |
| Podcast narrative extraction | Ingestion pipeline → `podcast_narratives` table | Speaker tracking, narrative velocity, analog trigger detection |
| Adversarial / trap detection | Honeypot library + Red Team Agent | Consensus divergence, crowding detection, flow-narrative mismatch |
| Market data & signals | `skills/market-rotation-engine` | Daily research sweeps, regime classification, gap detection |
| Trading positions & PnL | Trading Lab types/API (`repo-b/src/lib/trading-lab/`) | Position management, hypothesis tracking |
| Research ingestion | `.skills/research-ingest` | Processing external research reports into build plans |
| Scheduled pipeline | `fin-*` scheduled tasks | Daily automated data collection and model updates |
| Cross-vertical feeds | REPE/Credit/PDS environments | Regime signals feeding underwriting, demand forecasts |

---

## Databricks Configuration

### Connection

```
Workspace:   https://dbc-2504bec5-b5ab.cloud.databricks.com
Auth:        PAT via env var DATABRICKS_PAT
Catalog:     novendor_1
Schema:      historyrhymes (create on first use)
Metastore:   ebd2f3a2-7fcb-4955-a1f1-061e8f2eddf4 (AWS us-east-1)
```

### Databricks Resources

| Resource | ID / Path | Status |
|----------|-----------|--------|
| SQL Warehouse | `0e56420fb707d861` (Serverless Starter, Small) | STOPPED — start on demand |
| MLflow Experiment | `/Users/paulmalmquist@gmail.com/HistoryRhymesML` (id: `3740651530987773`) | Active |
| Compute | Serverless — no persistent cluster needed | On demand |

### API Endpoints

All calls use `Authorization: Bearer $DATABRICKS_PAT` header.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List workspace | GET | `/api/2.0/workspace/list?path=/` |
| Create notebook | POST | `/api/2.0/workspace/import` |
| Run notebook job | POST | `/api/2.1/jobs/create` + `/api/2.1/jobs/run-now` |
| MLflow create run | POST | `/api/2.0/mlflow/runs/create` |
| MLflow log metrics | POST | `/api/2.0/mlflow/runs/log-metric` |
| MLflow log params | POST | `/api/2.0/mlflow/runs/log-parameter` |
| MLflow search runs | POST | `/api/2.0/mlflow/runs/search` |
| MLflow register model | POST | `/api/2.0/mlflow/registered-models/create` |
| Unity Catalog schemas | GET | `/api/2.1/unity-catalog/schemas?catalog_name=novendor_1` |
| Unity Catalog tables | GET | `/api/2.1/unity-catalog/tables?catalog_name=novendor_1&schema_name=historyrhymes` |
| SQL statement exec | POST | `/api/2.0/sql/statements` (warehouse_id required) |

---

## The Rhyme Score

The core innovation: encode the current multi-signal market state as a 256-dim vector and compare against a library of historical episodes.

### State Vector Composition

**Quantitative features (64 dimensions):** trailing 1/3/6/12-month returns across asset classes, realized volatility regimes, yield curve shape parameters (level/slope/curvature), credit spreads (IG, HY, CMBS), equity valuation (CAPE, forward P/E), leverage metrics (margin debt, bank leverage ratios), macro indicators (PMI, CPI trajectory, unemployment rate/direction), and asset-class-specific metrics (MVRV for crypto, cap rates for real estate, funding rates for derivatives).

**Text embeddings (128 dimensions):** Fed minutes semantic vectors, dominant market narrative themes from news corpus, earnings call sentiment trajectory, social media narrative momentum, podcast-extracted viewpoints. Generated via `text-embedding-3-large` with MRL truncation to 128-dim.

**Unified vector (256 dimensions):** Concatenate quantitative (64) + text (128) = 192-dim → autoencoder bottleneck (2-layer MLP) → 256-dim episode vector stored in pgvector with HNSW indexing.

### Rhyme Score Formula

```
rhyme_score = 0.6 × cosine_similarity(current_vector, episode_vector)
            + 0.3 × (1 - normalized_dtw_distance(current_60d_series, episode_series))
            + 0.1 × categorical_match_bonus(asset_class, regime_stage)
```

Range: 0 to 1. Only surface analogs exceeding the **95th percentile** of a 1000-sample permutation test null distribution.

### Divergence Score

For each matched analog, compute element-wise absolute difference between current state vector and analog entry state. Rank dimensions by divergence magnitude. Top-5 divergent dimensions = "what's different this time."

---

## Seven-Stage Forecasting Pipeline

### Stage 1: Ingest

Two parallel tracks:
- **Real-time:** Price data (Polygon.io/Alpaca), on-chain (CryptoQuant API), social sentiment (LunarCrush)
- **Batch:** FRED macro (daily/monthly), AAII sentiment (weekly), COT reports, Case-Shiller (monthly), earnings transcripts (quarterly via SEC EDGAR), prediction markets (Kalshi + Polymarket, every 2h)

### Stage 2: Encode

Normalize all signals to z-scores against rolling 2-year windows (fractional differentiation per López de Prado). Concatenate quantitative (64-dim) + text embeddings (128-dim). Project through autoencoder to 256-dim state vector. Flag if any critical signal >24h stale.

### Stage 3: Match

Query pgvector: `SELECT * FROM episode_embeddings ORDER BY embedding <=> $current_vector LIMIT 20`. Refine top-20 via multi-dimensional FastDTW on trailing 60-day signal series (returns, volatility, spreads, sentiment) with Sakoe-Chiba band (window=15d). Compute composite Rhyme Score. Return top-5 with confidence intervals from permutation testing.

### Stage 4: Divergence Analysis

For each top-5 analog, rank dimensions by divergence magnitude. Check against honeypot pattern library (cosine >0.85 triggers flag). Output: top-5 divergent dimensions per analog + trap probability.

### Stage 5: Synthesize

Multi-agent forecaster (5 agents + aggregator) ingests matched analogs, divergence analysis, raw signals. Each agent generates independent probabilistic forecast. Aggregator combines via extremized logarithmic opinion pooling (α ≈ 1.5). Claude generates 500-word narrative synthesis with explicit confidence levels and invalidation criteria.

### Stage 6: Calibrate

Every prediction logged to `predictions` table with target date. Daily cron checks resolutions. Brier scores computed: `Brier = (forecast_probability - outcome)²`. Rolling 90-day Brier per agent. Monthly agent weight updates. Auto-halve weight if 90-day Brier > 0.33.

### Stage 7: Output

Structured forecast object with scenarios (bull/base/bear probabilities), top analogs with Rhyme Scores, trap detector status, and confidence metadata (aggregate Brier, agent agreement, data freshness).

---

## Multi-Agent Superforecaster

Five forecasting agents + aggregator implementing Tetlock's "dragonfly eye" finding.

### Agent 1: Macro-Fundamentals

**Receives:** Yield curve, PMI, CPI/PCE, employment, Dalio cycle stage, housing starts, credit spreads, central bank balance sheets.
**Lens:** Cycle analysis via Dalio's debt cycle framework. Identify short/long-term debt cycle stage (expansion, bubble, top, depression, reflation).

### Agent 2: Technical/Quant

**Receives:** Price series, volume, volatility surfaces, momentum factors, mean reversion, cross-asset correlations, funding rates.
**Lens:** Pure quantitative evidence. Ignore narratives. Trend strength, mean reversion setup quality, volatility regime, cross-asset signals.

### Agent 3: Narrative/Behavioral

**Receives:** Fed minutes sentiment, earnings call language, social media momentum, AAII, Fear & Greed, Google Trends, podcast extractions.
**Lens:** Behavioral finance. Assess reflexive feedback loops (Soros). Evaluate whether narratives are self-reinforcing or exhausting.

### Agent 4: Contrarian

**Receives:** All data + other agents' preliminary outputs.
**Lens:** Systematic consensus inversion. When AAII bearish >60% or Fear & Greed <15 → turn bullish. When consensus alignment >80% → flag danger.

### Agent 5: Adversarial Red Team

**Receives:** Full signal state, other agents' forecasts, crowding estimates (COT, short interest, options gamma), flow vs narrative alignment.
**Lens:** "Senior trader at a predatory institutional desk." Construct highest-EV trade exploiting predictable AI/retail behavior.
**Output:** `{adversarial_thesis, exploit_mechanism, crowding_severity [0-1], position_sizing_adjustment, abstain_recommendation}`
**Integration:** If `crowding_severity > 0.7` or `abstain = true` → reduce position sizing 50%, raise Rhyme Score threshold from 95th to 99th percentile.

### Aggregator

Extremized logarithmic opinion pooling:
1. Geometric mean: `ln(p_agg) = Σ w_i × ln(p_i)` where `w_i ∝ inverse_rolling_brier`
2. Extremize: `p_final = p_agg^α / (p_agg^α + (1-p_agg)^α)` where `α ≈ 1.5`
3. Monthly weight updates based on 90-day calibration

---

## World Signal Surveillance Engine

Five-layer system feeding into History Rhymes. NOT a dashboard — a multi-layer signal detection system identifying early regime shifts, narrative/data disconnects, crowded positioning, and adversarial setups.

### Layer 1: Reality (Pre-Data Signals)

Capture behavior before it appears in reports. Track: job postings velocity/freezes, construction permits/starts/crane counts, shipping volume/freight rates, energy demand (industrial vs consumer), travel demand (airfare, hotel pricing). Compute first derivative (acceleration) and second derivative (change in acceleration). Auto-flag inflection points.

### Layer 2: Data (Reported Metrics)

Track official/lagging indicators: CPI, PCE, employment, PMI, housing starts, GDP, cap rates, CMBS spreads. Track revisions over time. Compute surprise vs expectation. Compare to prior trend.

### Layer 3: Narrative

Integrate existing podcast/news ingestion. Track: narrative_label, intensity, velocity, acceleration, sentiment, source_diversity, originality, crowding, manipulation_risk, lifecycle_stage (early → emerging → crowded → exhaustion). Detect: lifecycle phase transitions, sudden narrative drops (silence detection), over-concentration across sources.

### Layer 4: Positioning

Track what capital has already done: ETF flows, options positioning (gamma, skew), short interest clustering, fund flows, on-chain wallet clustering, stablecoin supply shifts. Detect: positioning extremes, "no one left to buy/sell" conditions. Generate crowding score (0-100).

### Layer 5: Meta-Game (Trap Detection Input)

Cross-layer synthesis. If narrative strong + data confirming + positioning crowded → increase trap_probability. If narrative strong + data NOT confirming → divergence + trap risk. Output: signal_state_vector combining all 5 layers for direct input into History Rhymes matching.

### Silence Detector

Flag when previously dominant narratives rapidly disappear. Rapid drop in mentions of a previously active narrative = "possible completed positioning."

### Cross-Layer Alert Triggers

Fire alerts when: divergence_score exceeds threshold, narrative velocity spikes without data confirmation, positioning reaches extreme, silence event on major narrative, meta trap probability high.

---

## Podcast Ingestion Pipeline

> **Status: DESIGN COMPLETE.** Full schema (`repo-b/db/schema/425_podcast_intelligence.sql`, 16 tables), architecture (`docs/plans/PODCAST_INTELLIGENCE_ARCHITECTURE.md`), and extraction guide (`docs/podcast-intelligence/tips.md`) are delivered. Backend service implementation pending.

### Purpose

Convert podcasts from transcription storage into structured alpha extraction: narrative signals, macro viewpoints, positioning insights, analog triggers, and adversarial signals.

### Pipeline

1. **Ingest:** RSS (Spotify/Apple), YouTube transcript, manual upload (mp3/wav), pasted transcript
2. **Transcribe:** Audio → text (if needed)
3. **Chunk:** Semantic chunking (not fixed-size)
4. **Extract per chunk:**
   - Speaker context (name, role, domain, credibility_score)
   - Macro viewpoints (direction, confidence, time_horizon, asset_classes)
   - Trade ideas / positioning (crowded vs contrarian, early vs late narrative)
   - Narrative detection (emerging, reinforcing, shifting — with novelty_score)
   - Analog references ("this looks like 2008" → extract referenced episode + reasoning)
   - Uncertainty/hedging language → infer confidence + intellectual honesty
5. **Aggregate:** Cross-podcast narrative velocity, unique speaker count, conviction avg, divergence vs market data

### Speaker Track Record

Track past predictions per speaker. Compute hit_rate, avg_brier_score, bias_profile (permabull, macro bear, etc.). Each extracted forecast gets tracked and later resolved.

### Integration

- Auto-suggest new rhyme entries when speakers reference analogs
- Auto-generate divergence candidates when speaker view contradicts flows/data
- Flag "crowded narrative forming" when many podcasts converge on same idea
- Feed into daily brief: top emerging ideas, most repeated narrative, most contrarian take, biggest speaker disagreements

### Adversarial Filter

Detect: recycled talking points, coordinated narratives, suspicious timing (aligned with market moves). Score: authenticity, originality, manipulation_risk.

---

## Adversarial Framework

### Five-Level Meta-Game

| Level | Name | Description |
|-------|------|-------------|
| 0 | Naive | Trade on raw signals (most retail/basic quant) |
| 1 | Analog-aware | Signals + historical pattern matching (our base system) |
| 2 | Crowd-aware | Model what L0-L1 traders will do, estimate crowding (Contrarian Agent) |
| 3 | Institution-aware | Model how L2 players (Citadel, Renaissance, Jump) exploit L0-L1 crowding (Red Team Agent) |
| 4 | Meta-aware | Detect when the system itself is being modeled → deliberate randomization/abstention |

### Trap Detection

**Honeypot Pattern Library (7 seeds):**
1. March 2020 V-bottom — "obvious" crash continuation that reversed fastest in history
2. Dot-com "buy the dip" (April 2000) — initial NASDAQ selloff that became -78% decline
3. Volmageddon (Feb 2018) — crowded short-vol trade ($2B destroyed in XIV in one day)
4. FTX contagion bear trap (Nov 2022) — BTC at $15,500 "crypto is dead" was the cycle bottom
5. August 2015 China devaluation — flash crash that reversed within days, trapping shorts
6. GameStop second squeeze (March 2021) — attempted replay with diminishing returns
7. January 2008 financial "recovery" — apparent stabilization was setup for worst phase

When current state matches a honeypot with cosine >0.85 → flag + penalty to forecasts aligned with "obvious" direction.

### Suspicious Consensus Protocol

When ALL non-adversarial agents agree directionally >75% AND top Rhyme Score >0.85 AND flow-narrative alignment >0.9:
- Do NOT increase confidence
- Check honeypot library
- Estimate crowding level
- Review historical consensus-level outcomes
- Apply contrarian weighting boost

### Flow vs Narrative Mismatch Hierarchy

When signals conflict, apply this precedence (dark pool flows predict medium-term outcomes more reliably than narrative):
1. Actual capital flows (dark pools, exchange flows, 13F changes) — highest
2. Options market positioning (gamma, put/call skew) — high
3. On-chain flows (exchange flows, whale movements, stablecoin) — high (crypto)
4. Quantitative price/volume (trend, momentum, mean reversion) — medium
5. Text sentiment and narrative — lowest when conflicting with flows

When flow and narrative diverge >2σ → "Mismatch Alert" + overweight flow signal 2x.

### Randomization Budget

Deterministic strategies are exploitable. Maintain 10-15% of decisions with deliberate deviation from optimal signal. When VPIN >0.7 (toxic flow) or crowding >90th percentile or Red Team recommends abstention → either abstain entirely or introduce ±30% random noise to position sizing.

---

## Signal Priority Matrix

Implementation order for data sources:

| Signal | Predictive Power | Effort | Cost | Priority |
|--------|-----------------|--------|------|----------|
| MVRV Z-Score (crypto) | Very High (90%+ top/bottom) | Low | Free–$299/mo | P0 |
| Housing starts/permits | High (8/10 recessions) | Low | Free (FRED) | P0 |
| Yield curve shape | High (9/10 inversions → recession) | Low | Free (FRED) | P0 |
| VIX term structure | High (backwardation = crisis) | Low | Free (CBOE) | P0 |
| Fed minutes semantic shift | High | Medium | Free | P1 |
| Exchange flows (crypto) | Medium-High (55-60%) | Medium | $99-499/mo | P1 |
| Funding rates / OI | Medium-High | Low | Free (CoinGlass) | P1 |
| AAII sentiment (contrarian) | Medium (multi-week extremes) | Low | Free | P1 |
| Put/call ratio | Medium | Low | Free (CBOE) | P1 |
| CMBS delinquency rates | Medium | Low | Free-moderate | P1 |
| Stablecoin supply dynamics | Medium | Low | Free (DefiLlama) | P2 |
| Google Trends panic/euphoria | Low-Medium | Low | Free | P2 |
| TDA persistence norms | High (experimental) | Very High | Compute | P3 |

---

## Empirically Validated Frameworks

### USE (strong evidence)

| Framework | Evidence | Application |
|-----------|----------|-------------|
| Dalio debt cycles | 48 crises analyzed, predicted 2008 | Background structural prior, cycle stage classification |
| 18-year property cycle (Harrison/Hoyt) | Predicted 1990s UK recession 8yr early, called 2008 in 1997 | CRE timing, next predicted peak: 2026 |
| Soros reflexivity | Correctly describes feedback loops, essential analytical lens | Real-time self-reinforcing loop detection |
| Leamer housing thesis | 8/10 post-WWII recessions predicted by housing starts | Recession early warning signal |

### DISCARD (no evidence)

| Framework | Why |
|-----------|-----|
| Strauss-Howe generational theory | Zero empirical backing, "vague as astrology" |
| Kondratiev waves (50-year) | Too imprecise for actionable forecasting |

---

## Episode Library Requirements

### Survivorship Bias Mitigation

Initial library is catastrophically biased toward dramatic events. MANDATORY: maintain minimum **2:1 ratio of non-events to events** for any condition cluster. Include systematic "non-event" episodes — periods resembling crisis conditions that resolved benignly (1998 LTCM, 2011 debt ceiling, 2016 Brexit, 2019 yield curve inversion).

### Null Hypothesis Testing

For every Rhyme Score, compute against 1000 randomly shuffled historical episodes. Only surface analogs exceeding 95th percentile. If no analogs pass → output "no high-confidence analogs detected" rather than forcing a match.

### Fat-Tailed Distributions

Never assume Gaussian for magnitude estimates. Bear scenario probability uses power-law distributions calibrated to actual historical drawdown distributions. In low-predictability regimes (VIX backwardation, correlation spikes, TDA elevation) → widen confidence intervals.

---

## Workflow States

### STATE: intake

1. Classify request: `analog_matching`, `feature_engineering`, `model_training`, `backtest`, `research_plan`, `signal_integration`, `episode_curation`, `podcast_ingestion`, `surveillance_setup`, `databricks_admin`
2. Check prerequisites: `DATABRICKS_PAT` available? Warehouse running? Schemas created?
3. Dispatch to appropriate state.

### STATE: analog_matching

1. Compute current state vector from latest signals (or accept pre-computed)
2. Query pgvector for top-20 candidates
3. Refine with FastDTW on 60-day trailing series
4. Compute Rhyme Scores with permutation confidence intervals
5. Run divergence analysis on top-5
6. Check honeypot library
7. Return structured match result

### STATE: forecast

1. Run analog_matching
2. Pass results + raw signals to multi-agent forecaster
3. Each agent generates independent forecast
4. Aggregator combines via extremized log-opinion pooling
5. Generate narrative synthesis via Claude
6. Log prediction with target date
7. Return structured forecast object

### STATE: feature_engineering

1. Check if feature exists in `feature_registry`
2. Local features (< 1M rows): dispatch to `ml_features.py`
3. Distributed features: create Databricks notebook, PySpark pipeline, write to `feature_snapshots`
4. Register in `feature_registry`, log to MLflow

### STATE: model_training

1. Pull features from `feature_snapshots`
2. Regime-aware walk-forward splits (never leak future data)
3. Create MLflow run under `HistoryRhymesML`
4. Train, log params/metrics/artifacts
5. Evaluate: regime-stratified metrics, walk-forward validation
6. Record in `model_performance`, register if passing thresholds

### STATE: backtest

1. Define strategy parameters
2. Walk-forward execution with regime stratification
3. Metrics: Sharpe, drawdown, win rate, profit factor, transaction costs
4. Store in `signal_backtest`, log as MLflow run

### STATE: episode_curation

1. Parse episode metadata (conditions, catalyst, timeline, cross-asset impact)
2. Generate quantitative signal vectors from historical data
3. Compute 256-dim embedding via state vector encoder
4. Store in `episodes` + `episode_signals` + `episode_embeddings`
5. Validate: cosine similarity queries return sensible results

### STATE: research_plan

1. Parse plan into phases
2. Map each phase to sub-skill and execution environment
3. Create tracking doc in `docs/research/`
4. Execute sequentially with progress logging
5. Produce final report

### STATE: signal_integration

1. Define signal generation rules (model output → direction)
2. Set confidence thresholds and decay rates
3. Wire into Trading Lab (`trading_signals` table)
4. Add to `fin-smart-alerts` monitoring

### STATE: databricks_admin

Start/stop warehouse, create schemas, import notebooks, manage experiments, archive old runs.

---

## Integration Points

### With Market Rotation Engine

- Feature gaps → feature engineering tasks
- Daily regime labels → train/test split logic + Rhyme Score stratification
- Segment briefs → training data labels
- Scoring weights calibrated by backtest results
- 34 segments each get own analog matching (filtered by asset class/sub-sector tags)

### With Trading Lab

- Model predictions → `TradingSignal` entries (source: `model` or `rhyme`)
- Research plans → `TradingHypothesis` entries
- Live accuracy → `TradingPerformanceSnapshot.metadata`
- Rhyme Score dashboard component in Trading Lab UI

### With Scheduled Tasks

| Task | HistoryRhymes Role |
|------|--------------------|
| `fin-rotation-scheduler` | Segment picks for feature computation |
| `fin-research-sweep` | Research output as labeled training data |
| `fin-regime-classifier` | ML-enhanced regime labels + 6th pillar Rhyme overlay |
| `fin-gap-detection` | Feature gap cards for prioritization |
| `fin-feature-builder` | Feature engineering from gap cards |
| `fin-coding-session` | Build features/models from implementation plan |
| `fin-price-updater` | Live prices for model inference + state vector updates |
| `fin-prediction-markets` | Prediction market signals for ensemble |
| `fin-rhyme-matcher` | **NEW** — Daily analog matching and forecast generation |
| `fin-podcast-ingest` | **NEW** — Podcast ingestion and narrative extraction |
| `fin-surveillance-sweep` | **NEW** — World Signal Surveillance 5-layer update |
| `fin-calibration` | **NEW** — Brier score computation, agent reweighting |

### With Cross-Vertical Environments

| Vertical | What HistoryRhymes Provides |
|----------|-----------------------------|
| REPE | Macro regime context for cap rate forecasting, rate sensitivity, CRE cycle positioning via 18-year property cycle |
| Credit | Consumer credit cycle indicators, DeFi lending rate comparisons, debt cycle stage |
| PDS | Construction demand indicators from housing starts signal, material cost forecasts |

---

## BANNED PATTERNS

```
- Training a model without walk-forward validation (no look-ahead bias)
- Using future data in feature computation (leakage)
- Deploying a model without regime-stratified evaluation
- Hardcoding Databricks credentials (always use DATABRICKS_PAT env var)
- Running Databricks notebooks without MLflow tracking
- Creating features without registering them in feature_registry
- Backtesting without transaction cost estimates
- Leaving the SQL Warehouse running after task completion (stop it)
- Forcing an analog match when no candidate exceeds 95th percentile permutation threshold
- Assuming Gaussian distributions for magnitude estimates (use fat-tailed/power-law)
- Surfacing only crash/bubble episodes without non-event counterexamples (maintain 2:1 ratio)
- Increasing confidence when all agents agree >75% (trigger suspicious consensus protocol)
- Chasing signals with millisecond information half-lives (Fed statement parsing, etc.)
- Deploying forecasts to influence live positions without 90-day paper trade + Brier < 0.22
```

---

## Success Metrics

| Metric | Target | Measured By |
|--------|--------|-------------|
| Feature coverage | 50+ registered features across all pillars | `feature_registry` row count |
| Model accuracy | Directional accuracy > 55% out-of-sample | MLflow experiment metrics |
| Regime awareness | Per-regime Sharpe > 0 for all regimes | `model_performance` table |
| Backtest quality | Walk-forward Sharpe > 1.0 after costs | `signal_backtest` table |
| Signal integration | 10+ model-generated signals active | `trading_signals` where source in ('model','rhyme') |
| Rhyme Score calibration | 95th-percentile matches outperform random by >20% | Permutation test results |
| Forecast calibration | Aggregate Brier < 0.22 over 90 days | `predictions` table |
| Agent agreement diversity | Agent directional agreement < 90% | Multi-agent output logs |
| Trap detection accuracy | >50% of flagged traps are validated within 30 days | `honeypot_patterns` resolution tracking |
| Episode library balance | >2:1 non-event to event ratio | `episodes` table category counts |
| Pipeline reliability | < 2% scheduled task failure rate | Orchestration logs |
| Podcast coverage | 10+ shows tracked with speaker profiles | `speaker_profiles` row count |

---

## Verification Checklist

Before marking any HistoryRhymes task complete:

- [ ] Databricks PAT is valid (test with workspace list API)
- [ ] SQL Warehouse is stopped after use (cost control)
- [ ] All new features registered in `feature_registry`
- [ ] All experiments logged in MLflow with params + metrics
- [ ] No look-ahead bias in train/test splits
- [ ] Results cross-referenced with current regime label
- [ ] Permutation testing confirms statistical significance
- [ ] Episode library maintains 2:1 non-event ratio
- [ ] Fat-tailed distributions used for magnitude estimates
- [ ] Trading Lab integration tested (signal appears in UI)
- [ ] Brier scores computed for all resolved predictions
