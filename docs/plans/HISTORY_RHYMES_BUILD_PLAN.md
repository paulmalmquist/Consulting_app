# History Rhymes — Build Plan

**Created:** 2026-03-28
**Research:** `docs/research/2026-03-28-history-rhymes-system.md`
**Skill:** `skills/historyrhymes/SKILL.md`
**Status:** Ready for execution

---

## Phase 1: Foundation (Weeks 1-3)

### Ticket 1.1: Episode Library Schema + Supabase Migration

**Surface:** `repo-b/db/schema/`, Supabase
**Effort:** 3 days
**Scheduled task integration:** None (one-time)

Create all tables from `skills/historyrhymes/references/schema_supabase.sql`:
- Episode library tables (episodes, episode_signals, episode_embeddings, analog_matches)
- Prediction tracking (hr_predictions, honeypot_patterns)
- World Signal Surveillance tables (5 layers + synthesis + silence)
- Podcast pipeline tables (episodes, speakers, viewpoints, narratives)
- Agent calibration table
- Views for pending predictions, episode balance, latest state

**Acceptance:** All tables created, pgvector HNSW indexes operational, test vector query <10ms.

### Ticket 1.2: Seed Historical Episodes

**Surface:** Backend service, Supabase
**Effort:** 5 days
**Data file:** `skills/historyrhymes/references/seed_episodes.json`

Ingest 8 seed episodes (5 crisis + 3 non-events from JSON). For each:
1. Populate `episodes` table with structured metadata
2. Populate `episode_signals` with historical data points from FRED/CryptoQuant
3. Ensure 2:1 non-event ratio compliance (add more non-events if needed: 2019 yield curve inversion, 2015 China deval, 2018 Q4 selloff)
4. Target: 18+ episodes total (6 crisis, 12+ non-events/benign)

**Acceptance:** 18+ episodes, minimum 10 signal data points each, episode balance view shows >2:1 non-event ratio.

### Ticket 1.3: Embedding Pipeline

**Surface:** Databricks + Supabase
**Effort:** 3 days
**Databricks notebook:** `templates/embedding_pipeline.py`

Build Python service:
1. Combine episode narrative text + quantitative features
2. Generate embeddings via `text-embedding-3-large` (OpenAI API)
3. MRL truncation to 256 dimensions
4. Store in `episode_embeddings` table
5. Run on all seed episodes

**Acceptance:** All episodes embedded, cosine similarity returns sensible results (2022 Luna more similar to 2008 GFC than to 1970s stagflation).

### Ticket 1.4: Basic Analog Matching API

**Surface:** `backend/app/routes/`, `backend/app/services/`
**Effort:** 4 days

FastAPI endpoint `POST /api/v1/rhymes/match`:
- Accept current state vector (or compute from latest signals)
- Query pgvector top-20
- Compute Rhyme Score (0.6 cosine + 0.3 DTW + 0.1 categorical)
- Return top-5 with confidence intervals
- Permutation testing (1000 shuffled, 95th percentile threshold)

**Acceptance:** Endpoint <200ms, results sensible, null hypothesis testing operational.

### Ticket 1.5: Honeypot Pattern Library Seed

**Surface:** Supabase
**Effort:** 2 days

Populate 7 anti-analog patterns:
1. March 2020 V-bottom bear trap
2. Dot-com "buy the dip" bull trap
3. Volmageddon VIX trap
4. FTX contagion bear trap (BTC $15,500)
5. August 2015 China devaluation bear trap
6. GameStop second squeeze bull trap
7. January 2008 financial "recovery" bull trap

**Acceptance:** Patterns embedded, cosine query <0.85 threshold operational.

### Ticket 1.6: Databricks Schema Bootstrap

**Surface:** Databricks (novendor_1.historyrhymes)
**Effort:** 1 day
**Uses:** `scripts/databricks_client.py`

Run the Unity Catalog schema creation SQL from SKILL.md:
- Create `historyrhymes` schema
- Create: feature_registry, feature_snapshots, model_performance, signal_backtest, prediction_market_events

**Acceptance:** All tables created, verified via Unity Catalog API.

---

## Phase 2: Signal Integration (Weeks 4-6)

### Ticket 2.1: P0 Signal Ingestion

**Surface:** `backend/app/services/`, scheduled tasks
**Effort:** 8 days
**New scheduled tasks:** `fin-surveillance-sweep`

Connect to free/low-cost P0 data sources:
- FRED API: yield curve, housing starts, CPI, PMI, unemployment (daily/monthly batch)
- CBOE: VIX level + term structure (daily)
- CoinGlass: funding rates, open interest (free, every 2h)
- DefiLlama: stablecoin supply (free, daily)
- AAII: sentiment (weekly)

Write to WSS Layer 2 (data_signals) + Layer 4 (positioning_signals).

**Acceptance:** All P0 signals flowing, staleness <24h, WSS tables populated.

### Ticket 2.2: State Vector Encoder

**Surface:** `backend/app/services/`, Databricks
**Effort:** 5 days

Build the 256-dim state vector encoder:
1. Collect latest signals from all sources
2. Normalize to z-scores against rolling 2-year windows
3. Quantitative → 64-dim vector
4. Text signals (Fed minutes, narratives) → `text-embedding-3-large` → 128-dim
5. Concatenate 192-dim → autoencoder (2-layer MLP) → 256-dim
6. Staleness detection: flag if critical signal >24h stale
7. Store daily snapshot in `wss_signal_state_vector`

Train autoencoder on historical state vectors in Databricks.

**Acceptance:** Daily state vectors generated, autoencoder trained, embeddings align with manual inspection.

### Ticket 2.3: Integration with Existing ML Signal Engine

**Surface:** `backend/app/services/`, market rotation engine
**Effort:** 3 days

Define interface contract:
- History Rhymes receives existing 5-pillar outputs as input features
- Returns analog scores + divergence analysis as 6th pillar input to ensemble fusion
- Feed into `fin-regime-classifier` as prediction market pillar (13% weight per Enhancement Plan)

**Acceptance:** Bidirectional data flow verified, regime classifier accepts 6th pillar input.

### Ticket 2.4: Podcast Pipeline — Basic Ingestion ✅ SCHEMA + ARCHITECTURE COMPLETE

**Surface:** Backend service + scheduled task
**Effort:** 6 days
**New scheduled task:** `fin-podcast-ingest`
**Spec:** `skills/historyrhymes/references/podcast_pipeline.md`
**Schema:** `repo-b/db/schema/425_podcast_intelligence.sql` (16 tables, 554 lines — DELIVERED)
**Architecture:** `docs/plans/PODCAST_INTELLIGENCE_ARCHITECTURE.md` (15-section spec — DELIVERED)
**Edge cases:** `docs/podcast-intelligence/tips.md` (extraction patterns + 10 edge cases — DELIVERED)

Phase 1 podcast implementation:
- RSS feed polling for 10 initial shows
- Whisper transcription
- Basic extraction (macro viewpoints, trade ideas, narrative labels)
- Store in podcast_episodes, podcast_viewpoints, podcast_narratives
- Speaker profile creation

**Status:** Schema, architecture, and extraction guide delivered. Backend service implementation pending.
**Acceptance:** 10 shows tracked, new episodes auto-ingested, viewpoints extracted.

---

## Phase 3: Intelligence Layer (Weeks 7-9)

### Ticket 3.1: Multi-Agent Forecaster Framework

**Surface:** `backend/app/services/`, Claude API
**Effort:** 8 days

Implement 5 agents + aggregator:
1. Macro-Fundamentals Agent (Dalio cycle lens)
2. Technical/Quant Agent (pure quantitative evidence)
3. Narrative/Behavioral Agent (reflexivity, sentiment)
4. Contrarian Agent (systematic consensus inversion)
5. Adversarial Red Team Agent (predatory desk simulation)
6. Aggregator: extremized log-opinion pooling (α ≈ 1.5)

Each agent: filtered signal subset → structured probability forecast → aggregator.

**Acceptance:** All 5 agents producing independent forecasts, aggregator combining, narrative synthesis generating.

### Ticket 3.2: FastDTW Refinement Module

**Surface:** Backend Python service
**Effort:** 5 days

Implement FastDTW for detailed analog comparison:
- Multi-dimensional DTW on trailing 60-day series (returns, volatility, spreads, sentiment)
- Sakoe-Chiba band constraint (window=15 days)
- Permutation testing (1000 shuffled series per candidate)
- Statistical significance output

**Acceptance:** Refinement produces sensible ordering improvements over pure cosine similarity.

### Ticket 3.3: Trap Detection System

**Surface:** Backend service
**Effort:** 6 days

Implement adversarial countermeasures:
- Suspicious consensus protocol (>75% agreement + Rhyme >0.85 + flow >0.9)
- Flow vs narrative mismatch detection with precedence hierarchy
- Honeypot pattern matching (cosine >0.85 threshold)
- Crowding score computation from positioning signals
- Red Team Agent crowding_severity → position sizing adjustment

**Acceptance:** Trap flags fire correctly on historical back-tested scenarios.

### Ticket 3.4: Rhyme Score Dashboard Component

**Surface:** `repo-b/src/app/lab/env/[envId]/markets/`
**Effort:** 6 days

New Trading Lab UI component:
- Current top analogs with Rhyme Scores (visual similarity bars)
- Trajectory overlay (current vs analog price paths, aligned)
- Divergence heatmap (where current state differs from analog)
- Probabilistic scenario cards (bull/base/bear with probabilities)
- Trap detector status indicator
- Agent agreement visualization

**Acceptance:** Component renders, updates daily, integrates with existing Trading Lab layout.

---

## Phase 4: Calibration & Feedback (Weeks 10-12)

### Ticket 4.1: Prediction Logging & Resolution

**Surface:** Backend service + scheduled task
**Effort:** 4 days
**New scheduled task:** `fin-calibration`

- Auto-log every forecast to `hr_predictions`
- Daily cron checks target dates against actual market data
- Compute Brier scores on resolution
- Track per-agent and aggregate calibration

**Acceptance:** All forecasts logged, resolutions computed within 24h of target date.

### Ticket 4.2: Agent Reweighting Pipeline

**Surface:** Backend service
**Effort:** 5 days

Monthly batch job:
- Compute 90-day rolling Brier per agent
- Auto-adjust aggregator weights (proportional to inverse Brier)
- If agent Brier > 0.33 for 90 days → halve weight, trigger alert
- Dashboard widget showing agent calibration curves

**Acceptance:** Weights update monthly, alert fires on test data, calibration visible.

### Ticket 4.3: Paper Trading Integration

**Surface:** Trading Lab, backend
**Effort:** 4 days

Connect forecasts to existing 7-rung promotion ladder:
- All History Rhymes forecasts start as paper trades
- Minimum 90-day paper trade period
- Require Brier < 0.22 before any forecast graduates to influence live positioning
- Track paper vs live performance separately

**Acceptance:** Paper trades logging, promotion gate enforced.

---

## Phase 5: Advanced (Ongoing)

### Ticket 5.1: TDA Early Warning System

**Effort:** 10 days

Implement topological data analysis:
- Takens embedding + Vietoris-Rips persistent homology on multi-asset returns
- Rolling L1/L2 persistence landscape norms
- Alert when norms exceed 2σ above 250-day trailing average
- Benchmark against <200ms latency target

### Ticket 5.2: Full Podcast Intelligence ✅ DESIGN COMPLETE

**Effort:** 8 days
**Schema:** All 16 tables in `425_podcast_intelligence.sql` already cover full pipeline (narrative_velocity, speaker_track_records, adversarial_scores, divergences, rhyme_suggestions)
**Architecture:** Dual-LLM routing (Claude for nuance, GPT-4o for structured tagging), 4-pass extraction, 9 scheduled tasks — all specified in `PODCAST_INTELLIGENCE_ARCHITECTURE.md`

Complete podcast pipeline:
- Speaker diarization
- Speaker track record system (prediction tracking, Brier per speaker)
- Adversarial filters (coordinated narratives, recycled content, suspicious timing)
- Integration with WSS Layer 5 meta-game signals

**Status:** Full design delivered. Implementation pending.

### Ticket 5.3: Narrative Silence Detector

**Effort:** 4 days

Monitor narrative dropoffs:
- Track previously dominant narratives that rapidly disappear
- Flag as "possible completed positioning"
- Feed into WSS Layer 3 and trap detection

### Ticket 5.4: Embedding Dimensionality Optimization

**Effort:** 5 days (Databricks)

Run ablation studies:
- Test 32, 64, 128, 256 dimensions
- Measure retrieval quality at each
- Test autoencoder vs simple concatenation
- Optimize based on Brier score improvement

---

## New Scheduled Tasks Summary

| Task | Cadence | Phase | Purpose |
|------|---------|-------|---------|
| `fin-rhyme-matcher` | Daily 5:15 AM | 1 | Run analog matching + forecast generation |
| `fin-surveillance-sweep` | Daily 5:00 AM (+ 4h intervals for positioning) | 2 | 5-layer signal collection and state vector update |
| `fin-podcast-ingest` | Daily 6:00 AM | 2 | Podcast RSS polling, transcription, extraction |
| `fin-calibration` | Daily 11:00 PM | 4 | Brier score computation, prediction resolution |

### Modified Existing Tasks

| Task | Modification | Phase |
|------|-------------|-------|
| `fin-regime-classifier` | Add 6th pillar (Rhyme Score) as input, add prediction market pillar | 2 |
| `fin-research-sweep` | Include History Rhymes analog matches in brief output | 3 |
| `fin-gap-detection` | Check for missing History Rhymes data sources as gaps | 2 |
| `fin-coding-session` | Prioritize History Rhymes build tickets | 1 |

### Updated Daily Pipeline Flow

```
4:00 AM   fin-rotation-scheduler     → pick today's market segments
4:30 AM   fin-research-sweep         → execute research (includes analog matches)
5:00 AM   fin-surveillance-sweep     → update all 5 WSS layers
5:15 AM   fin-rhyme-matcher          → analog matching + multi-agent forecast
5:30 AM   fin-regime-classifier      → compute regime (now with 6th pillar + prediction markets)
5:45 AM   fin-narrative-scanner      → sector rotation + narrative momentum
6:00 AM   fin-podcast-ingest         → ingest overnight podcast episodes
...
9:30 AM+  fin-price-updater          → every 30 min: prices, PnL, alert checks
          fin-risk-monitor           → every 15 min: stop-loss, exposure
          fin-surveillance-sweep     → every 4h: positioning layer update
...
1:30 PM   fin-coding-session         → build next History Rhymes ticket
...
9:00 PM   fin-gap-detection          → audit today's intelligence for gaps
9:30 PM   fin-feature-builder        → convert gaps to build-ready prompts
...
11:00 PM  fin-calibration            → resolve predictions, compute Brier scores
11:30 PM  fin-smart-alerts           → multi-signal confluence detection
```

---

## Dependencies

| Dependency | Status | Cost | Notes |
|------------|--------|------|-------|
| pgvector (Supabase) | Available | Included | Already enabled |
| OpenAI text-embedding-3-large | Available | ~$0.13/1M tokens | For episode + state embeddings |
| FRED API | Available | Free | Macro data |
| CBOE data | Available | Free | VIX |
| CoinGlass | Available | Free tier | Funding rates, OI |
| DefiLlama | Available | Free | Stablecoin supply |
| Polygon.io or Alpaca | Needs setup | Free-$29/mo | Real-time price data |
| CryptoQuant | Needs setup | $99-499/mo | On-chain + exchange data |
| Whisper (transcription) | Available | $0.006/min | Podcast pipeline |
| Databricks | Connected | Pay-per-use | MLflow, feature store, model training |

---

## Success Gates

| Gate | Criteria | Blocks |
|------|----------|--------|
| Schema deployed | All tables created + test queries pass | Everything |
| Episode library seeded | 18+ episodes, 2:1 non-event ratio | Analog matching |
| Embeddings operational | Cosine similarity returns sensible results | Rhyme Score |
| API endpoint live | `/api/v1/rhymes/match` < 200ms | Dashboard, forecaster |
| Multi-agent producing | All 5 agents + aggregator running | Forecasts |
| Brier tracking live | Predictions logged + resolved automatically | Calibration |
| 90-day paper trade | Brier < 0.22 on paper trades | Live integration |
