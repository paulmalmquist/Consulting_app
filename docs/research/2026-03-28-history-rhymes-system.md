# History Rhymes: Production-Grade Temporal Pattern-Matching and Narrative Forecasting System

**Date:** 2026-03-28
**Author:** Deep Research
**Status:** ready
**Topic area:** Financial ML, temporal pattern matching, narrative forecasting, adversarial trading systems

---

## Question

How can we build a production-grade system that operationalizes the "history rhymes" thesis — using structured analogical forecasting, multi-agent superforecaster simulation, and adversarial countermeasures — as a 6th pillar alongside Winston's existing ML Signal Engine?

---

## Sources

- Tetlock, P. — Good Judgment Project / Superforecasting (IARPA 2011-2015)
- Green & Armstrong (2007) — Structured Analogies for Forecasting
- Dalio, R. — Principles for Navigating Big Debt Crises (48 historical debt crises)
- Soros, G. — Reflexivity Theory
- Hamilton (1989) — Regime-Switching Models (2-4 optimal regimes)
- Two Sigma — Gaussian Mixture Model macro regime detection
- Gidea & Katz (2018) — Topological Data Analysis crash detection
- López de Prado — Fractional differentiation for non-stationarity
- McLean & Pontiff (2016) — Factor alpha decay post-publication
- Leamer, E. — "Housing IS the Business Cycle"
- Harrison, F. — 18-year property cycle (predicted 1990s UK recession, 2008 crash)

---

## Findings

### Core Architecture
- 6th pillar overlay on existing 5-pillar ML Signal Engine
- Episode library with pgvector HNSW indexing for analog matching
- 256-dimensional state vectors combining quantitative (64-dim) and text embeddings (128-dim) through autoencoder
- Rhyme Score composite: 0.6 × cosine similarity + 0.3 × DTW distance + 0.1 × categorical match
- Multi-agent forecaster (5 agents + aggregator) implementing Tetlock's dragonfly eye
- Adversarial red team agent + honeypot pattern library for trap detection
- World Signal Surveillance with 5 layers: Reality, Data, Narrative, Positioning, Meta-Game
- Podcast ingestion pipeline for narrative extraction and speaker tracking

### Key Empirical Findings
- Structured analogical forecasting: 46% accuracy vs 32% unstructured (Green & Armstrong)
- Superforecasters beat intelligence community by 25-30% on Brier scores
- Reference class forecasting: Brier 0.17 vs 0.26 next-best technique
- MVRV Z-Score: 90%+ top/bottom accuracy for crypto
- Housing starts: predicted 8/10 post-WWII recessions
- TDA persistence norms: F1 ≈ 0.50 with ~34-day lead before crises
- Published factor alpha decays ~50% post-publication

### Implementation Phases
- Phase 1 (Weeks 1-3): Episode library schema, seed data, embedding pipeline, basic analog matching API
- Phase 2 (Weeks 4-6): Signal ingestion (Polygon.io, CryptoQuant, FRED, CoinGlass), text signal NLP, state vector encoder
- Phase 3 (Weeks 7-9): Multi-agent forecaster, DTW refinement, narrative synthesis, Rhyme Score dashboard
- Phase 4 (Weeks 10-12): Prediction logging, Brier calibration, agent reweighting
- Phase 5 (Ongoing): TDA early warning, full trap detector, trading strategy integration

### Database Design
- 7 core tables: episodes, episode_signals, episode_embeddings, analog_matches, predictions, honeypot_patterns
- World Signal Surveillance: 6 additional tables across 5 signal layers
- Podcast pipeline: podcast_narratives, speaker_profiles
- pgvector with HNSW indexing (m=16, ef_construction=256)

### Adversarial Framework
- 5-level meta-game reasoning (Naive → Analog-aware → Crowd-aware → Institution-aware → Meta-aware)
- Honeypot pattern library (7 seed anti-analogs)
- Flow vs narrative mismatch hierarchy
- Consensus divergence scoring (suspicious when >75% agreement + Rhyme >0.85 + flow alignment >0.9)
- Randomization budget (10-15% deliberate deviation for unpredictability)

---

## Recommendations

1. Build Episode Library schema in Supabase with pgvector, seed 18 episodes (5 detailed + 13 additional)
2. Implement embedding pipeline on Databricks using text-embedding-3-large → 256-dim MRL truncation
3. Deploy multi-agent forecaster using existing Claude API infrastructure
4. Integrate as 6th pillar feeding into ensemble fusion layer
5. Mandatory: permutation testing for all Rhyme Scores (95th percentile threshold)
6. Mandatory: 2:1 non-event to event ratio in episode library to counter survivorship bias
7. Track Brier scores for all predictions; auto-halve agent weight if 90-day Brier > 0.33

---

## Hard Constraints

- Never assume Gaussian distributions for magnitude estimates (use fat-tailed/power-law)
- Walk-forward validation only — no look-ahead bias
- Minimum 90-day paper trading before any forecast influences live positioning
- Brier < 0.22 over 90 days required before forecast graduation
- SQL Warehouse must be stopped after Databricks use (cost control)
- Permutation testing (1000 shuffled series) for every Rhyme Score confidence interval
- 2:1 non-event to event ratio in episode library

---

## Open Questions

1. Optimal embedding dimensionality (32 vs 64 vs 128 vs 256) — needs ablation study
2. Autoencoder vs simple concatenation for state vectors
3. Optimal number of analogs (3? 5? 10?)
4. Extremization parameter α calibration for LLM agents (Tetlock found 1.5 for humans)
5. TDA computation viability at <200ms latency target
6. MVRV Z-Score reliability in ETF era (diminishing peak Z-scores)
7. Honeypot false positive rate calibration (0.85 threshold)
8. System's own predictive decay rate tracking (Lucas Critique)
