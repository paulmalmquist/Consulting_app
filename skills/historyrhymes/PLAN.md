# History Rhymes — Implementation Plan

## Context

History Rhymes is positioned as the **6th pillar** of Winston's ML Signal Engine — a temporal pattern-matching and narrative forecasting system that retrieves historical analogs to current market state, runs adversarial trap detection, and produces probabilistic scenario forecasts. The other 5 pillars already exist (math regression, sentiment, behavioral, ensemble fusion, Claude-as-analyst — see [skills/market-rotation-engine/references/ml_signal_engine.md](skills/market-rotation-engine/references/ml_signal_engine.md)).

This plan exists because the existing scaffolding has the **shape** of a pipeline (5 Databricks notebooks, Supabase schema, frontend mocks) but the **load-bearing pieces are missing or stubbed**: no FastAPI route, no real pgvector retrieval, no walk-forward validation, episode library underfilled, and the job DAG between notebooks is implicit. Without a backtest gate, the 6th pillar cannot be allowed to influence regime classification weights — that's the core risk this plan addresses.

---

## Reality Check Against User's Brief

The user's task description contains several factual inaccuracies vs. the current repo state. **These must be reconciled before code is written.**

| User claim | Repo reality | Source |
|---|---|---|
| `/history-rhymes` directory exists | No such directory. Module lives at [skills/historyrhymes/](skills/historyrhymes/) | filesystem |
| `main.default` Unity Catalog path | Config uses `novendor_1.historyrhymes` | [config/databricks.json](skills/historyrhymes/config/databricks.json) |
| 18 seed episodes loaded | **8 episodes** loaded (5 events + 3 non-events: LTCM, Debt Ceiling, Brexit) | [references/seed_episodes.json](skills/historyrhymes/references/seed_episodes.json), migration `435_history_rhymes_seed.sql` |
| "Zero non-events" | 3 non-events already exist (`is_non_event: true` in seed JSON) | seed_episodes.json |
| pgvector HNSW retrieval is wired | Matching uses **hardcoded SQL VALUES** for 8 reference vectors. pgvector schema exists but is unused by `04_score_analogs.py` | [04_score_analogs.py:54-64](skills/historyrhymes/notebooks/04_score_analogs.py#L54) |
| Notebook `00_bootstrap_schema.py` exists | True | [skills/historyrhymes/notebooks/00_bootstrap_schema.py](skills/historyrhymes/notebooks/00_bootstrap_schema.py) |
| `01-05` and `run_pipeline.py` exist | True — full 5-step DAG already orchestrated by `run_pipeline.py` | [run_pipeline.py](skills/historyrhymes/notebooks/run_pipeline.py) |
| FastAPI `/api/rhymes/match` does not exist | Confirmed | grep results |
| 14 Supabase tables | True (migrations 434 + 435) | `repo-b/db/schema/434_history_rhymes_wss.sql` |
| Frontend components built | True — `HistoryRhymesTab.tsx`, `TopAnalogCard.tsx`, `TrapDetectorFullView.tsx`, `CalibrationFooter.tsx`, `RegimeClassifierWidget.tsx`, `EpisodeLibrary.tsx`, `DivergenceTable.tsx`, `AgentForecastPanel.tsx` (all reading mock data) | `repo-b/src/components/market/` |

The user's Section 4 ("Non-Event Episode Ingestion") was cut off mid-sentence in the original brief but has been clarified — see "Resolved Decisions" below.

A separate, older build plan exists at [docs/plans/HISTORY_RHYMES_BUILD_PLAN.md](docs/plans/HISTORY_RHYMES_BUILD_PLAN.md) (5 phases, 25+ tickets, dated 2026-03-28). **This plan is narrower and tactical** — it addresses only the four Databricks-and-validation problems the user named, and supersedes the old plan's sequencing for those specific items.

---

## Resolved Decisions (from user clarification)

1. **Plan location**: `skills/historyrhymes/PLAN.md` (canonical, co-located with module). This file is the planning scratch pad; the final PLAN.md gets written during execution.
2. **Catalog**: Stay with `novendor_1.historyrhymes`. No migration to `main.default`.
3. **Non-event ingestion**: **Automated FRED detection** — see Section 4 (rewritten below). This is the harder but more rigorous path.
4. **Backtest signal history**: Extend [01_load_signals.py](skills/historyrhymes/notebooks/01_load_signals.py) to backfill FRED from `2020-01-01` (one-time, then incremental).
5. **Treat repo as ground truth**: 8 episodes loaded, not 18. Plan around the actual state.

## Still-open conventions (default below; confirm during execution if non-obvious)

- **Brier resolution rule**: `p_up` is the predicted probability of positive 30-day return; resolution uses `actual_return_30d > 0` as the binary outcome. Magnitude buckets are computed but not used in the binary Brier — they're stored for later multiclass calibration.

---

## Section 1 — Databricks Job DAG

### Current state

A linear DAG already exists, orchestrated by [`run_pipeline.py`](skills/historyrhymes/notebooks/run_pipeline.py):

```
00_bootstrap_schema  (one-time DDL — not in daily DAG)
        ↓
01_load_signals  →  novendor_1.historyrhymes.signals_raw  (MERGE dedup)
        ↓
02_build_features  →  signals_featured  (z-scores, deltas, percentiles)
        ↓
03_classify_regime  →  market_state_daily  (5 regime labels)
        ↓
04_score_analogs  →  history_rhymes_daily  (TOP-3 analogs, hardcoded vectors)
        ↓
05_export_to_supabase  →  Supabase wss_*, analog_matches, hr_predictions
```

The **gap**: the DAG stops at scenario probability assignment in `04_score_analogs.py`. There is no Stage 4 (divergence + honeypot), no Stage 5 (multi-agent forecaster), no Stage 6 (calibration), and Stage 7 is partial. Stages 5–6 are designed but unimplemented.

### Proposed seven-stage DAG

Each stage maps to a Databricks notebook under `skills/historyrhymes/notebooks/`. New notebooks are marked **NEW**. Existing notebooks are reused.

| Stage | Notebook | Inputs | Outputs | New? | Idempotent? | Restart strategy |
|---|---|---|---|---|---|---|
| 1. Ingest | `01_load_signals.py` | FRED, CoinGecko, VIX (CBOE), AAII, CoinGlass APIs | `novendor_1.historyrhymes.signals_raw` (Delta, MERGE) | Extend (add VIX/AAII/CoinGlass fetchers + **backfill window to 2020-01-01**) | Yes (MERGE) | Re-run safe; sources may rate-limit |
| 2. Encode | `02_build_features.py` + `06_state_vector.py` **NEW** | `signals_raw`; OpenAI text-embedding-3-large for narrative slots | `signals_featured` (Delta), `wss_signal_state_vector` (Supabase, daily 256-dim row) | Partially new | Yes (UPSERT on `as_of_date`) | Re-runnable; upstream gating on `02` row count |
| 3. Match | `04_score_analogs.py` (rewrite) + `04b_pgvector_match.py` **NEW** | `wss_signal_state_vector` (today), Supabase `episode_embeddings` (HNSW) | `history_rhymes_daily` (Delta), Supabase `analog_matches` (top-20 + scores) | Rewrite | Yes (MERGE on `as_of_date, scope`) | Cosine retrieval first; FastDTW refinement second; restart from cosine cache |
| 4. Divergence | `07_divergence_honeypot.py` **NEW** | Today's state vector, top-5 analog vectors, `honeypot_patterns` | Element-wise diff JSON in `history_rhymes_daily.divergence`, `trap_flag` boolean, `honeypot_match_id` | NEW | Yes | Independent of stage 5; can run in parallel with synthesis |
| 5. Synthesize | `08_multi_agent_forecast.py` **NEW** | Top-5 analogs + divergences + agent calibration weights | `hr_predictions` row in Supabase (5 agent forecasts + aggregator + Claude narrative) | NEW | Yes (UPSERT on `prediction_date, scope`) | Each agent is independent; failure of one does not block others |
| 6. Calibrate | `09_calibrate_brier.py` **NEW** | `hr_predictions` resolved rows (T-30d), `hr_agent_calibration` | Updated agent weights in `hr_agent_calibration`, monthly Brier rollup | NEW | Yes (idempotent on resolution_date) | Runs independently; resolves only mature predictions |
| 7. Output | `05_export_to_supabase.py` (extend) | Delta `history_rhymes_daily`, all stage 4–6 outputs | Final structured forecast object in Supabase `hr_predictions` | Extend | Yes (UPSERT) | Final write happens at end of run; safe to re-run |

### Dependency edges

```
01_load_signals
       ↓
02_build_features        (gates on signals_raw row count for today)
       ↓
06_state_vector ──┐      (Stage 2: text + quant fusion + projection)
       ↓          │
03_classify_regime ←─────┘
       ↓
04b_pgvector_match  (Stage 3a: cosine top-20)
       ↓
04_score_analogs    (Stage 3b: rewritten — FastDTW refine + Rhyme Score on top-20)
       ↓
07_divergence_honeypot  ─── runs in parallel with ───┐
       ↓                                              │
08_multi_agent_forecast ←─────────────────────────────┘
       ↓
05_export_to_supabase   (final UPSERT into hr_predictions)
       ↓
09_calibrate_brier      (independent — only resolves mature predictions; may run later in day)
```

### Failure / restart behavior

- **Each notebook is idempotent**. All Delta writes use MERGE on `as_of_date` (existing pattern); all Supabase writes use UPSERT with `(prediction_date, scope)` conflict targets.
- **`run_pipeline.py` already implements per-step row-count validation**. Extend it with the new notebooks; failures in stage 4–6 should not block stage 7's final write of whatever was successfully computed.
- **Warehouse lifecycle**: keep the single-start/single-stop pattern from `run_pipeline.py` ([line 53](skills/historyrhymes/notebooks/run_pipeline.py#L53)). Do not introduce new warehouse calls.

### CLI invocation per stage

The repo uses a custom REST client ([scripts/databricks_client.py](skills/historyrhymes/scripts/databricks_client.py)) instead of `databricks bundle`. To trigger an individual stage from the local machine:

```bash
# Set credentials
export DATABRICKS_PAT=$(cat databrickstoken.txt)

# Run a single stage
python -m skills.historyrhymes.notebooks.01_load_signals
python -m skills.historyrhymes.notebooks.02_build_features
python -m skills.historyrhymes.notebooks.06_state_vector       # NEW
python -m skills.historyrhymes.notebooks.03_classify_regime
python -m skills.historyrhymes.notebooks.04b_pgvector_match    # NEW
python -m skills.historyrhymes.notebooks.04_score_analogs       # rewritten
python -m skills.historyrhymes.notebooks.07_divergence_honeypot # NEW
python -m skills.historyrhymes.notebooks.08_multi_agent_forecast # NEW
python -m skills.historyrhymes.notebooks.05_export_to_supabase
python -m skills.historyrhymes.notebooks.09_calibrate_brier     # NEW

# Run the full DAG (recommended)
python -m skills.historyrhymes.notebooks.run_pipeline
```

A separate Databricks Jobs API registration (via `DatabricksClient.create_job`) should be added in a follow-up to schedule `run_pipeline.py` daily at 5:15 AM ET — but that is **out of scope for this plan** unless the user requests it.

---

## Section 2 — Vector Production Decision

### Recommendation: **Option B (no learned reduction)** for now, with a documented upgrade path.

### Reasoning

1. **PCA on n=8 episodes is statistically meaningless.** PCA finds directions of maximum variance; with 8 samples in a 192-dim space, the first 7 components will trivially explain 100% of variance and the loadings will be pure noise. Storing a "fitted PCA" object in MLflow would create a false sense of rigor.
2. **Concatenation is honest.** A 256-dim vector built from 128-dim normalized quant features (z-scored, padded with zeros where signals are unavailable) + 128-dim text embedding (`text-embedding-3-large` MRL-truncated to 128) preserves all the signal we currently have, without imputing structure that doesn't exist.
3. **HNSW cosine works on raw concatenations.** pgvector's cosine distance is invariant to the relative scale of the two halves only if both halves are L2-normalized before concatenation. We will L2-normalize each half independently, then concatenate. This is a 4-line change.
4. **The autoencoder upgrade path is unblocked**. Once we have ≥500 daily state vectors (~1.5 years of `06_state_vector.py` running), we can train a 192→256 autoencoder on real production state vectors and swap it in behind the same `encode_state_vector()` function signature.

### Implementation

`skills/historyrhymes/notebooks/06_state_vector.py` **NEW** — daily job that:

1. Reads latest row from `signals_featured` (z-scored quant features).
2. Pads/truncates to **128-dim quant block** (consistent feature ordering, NaN→0).
3. Pulls latest narrative text slot (top headlines + Fed minutes summary, if available — otherwise empty string).
4. Calls `text-embedding-3-large` with `dimensions=128` (MRL truncation).
5. L2-normalizes each half independently.
6. Concatenates → 256-dim final vector.
7. UPSERTs into Supabase `wss_signal_state_vector` (daily snapshot) and into `episode_embeddings` if backfilling an episode.

```python
# skills/historyrhymes/services/state_vector_encoder.py (NEW)

def encode_state_vector(quant_features: dict[str, float], narrative_text: str) -> list[float]:
    """
    Build the 256-dim state vector by concatenating L2-normalized quant
    and text embedding halves.

    TODO(history-rhymes): Replace with trained autoencoder once ≥500 daily
    state vectors exist in wss_signal_state_vector. The 500-vector threshold
    gates the upgrade — see Section 2 of skills/historyrhymes/PLAN.md.
    """
    quant_vec = _pad_or_truncate(quant_features, 128)
    quant_vec = _l2_normalize(quant_vec)

    text_vec = _openai_embed(narrative_text, dimensions=128)
    text_vec = _l2_normalize(text_vec)

    return quant_vec + text_vec  # 256-dim
```

### What this avoids

- No fake MLflow PCA artifact that future-us would have to invalidate.
- No untrained autoencoder weights bleeding into Brier scores.
- Single function `encode_state_vector()` can be swapped to a real autoencoder in one place when the data exists.

---

## Section 3 — Walk-Forward Backtest Harness

### Notebook: `skills/historyrhymes/notebooks/05_backtest_walk_forward.py` **NEW**

This is the **primary validation gate**. Until this passes its acceptance criteria, the 6th pillar cannot be allowed to influence the regime classifier weights or paper-trading promotion ladder.

### Inputs

- **Parameter**: `backtest_start_date` (default: `2020-01-01`)
- **Parameter**: `backtest_end_date` (default: `2023-12-31`)
- **Parameter**: `step_days` (default: `30`)
- **Parameter**: `horizon_days` (default: `30`)
- **Parameter**: `tickers` (default: `["SPY", "BTC"]` — matched to episode library asset classes)

### Logic (no-lookahead is non-negotiable)

```python
for D in date_range(backtest_start_date, backtest_end_date, step=step_days):

    # 1. Build state vector using ONLY data available at D
    quant = read_signals_featured(as_of_date=D)              # WHERE as_of_date <= D
    narrative = read_narrative_corpus(as_of_date=D)          # WHERE published_at < D
    state_vec = encode_state_vector(quant, narrative)

    # 2. Restrict episode library — episodes that ENDED before D
    candidate_episodes = read_episodes(end_date_lt=D)        # critical: end_date < D, not start_date

    # 3. Cosine retrieval
    top_20 = pgvector_search(state_vec, candidates=candidate_episodes, k=20)

    # 4. FastDTW refine on top-20 → top-5
    top_5 = fastdtw_refine(state_vec, top_20, k=5)

    # 5. Generate forecast (use the deterministic aggregator path; skip Claude narrative for speed)
    forecast = multi_agent_forecast(top_5, mode="deterministic")
    # forecast = {"direction": "up"|"down"|"flat", "magnitude": float, "p_up": float, "p_down": float}

    # 6. Resolve at D + horizon_days
    actual_return = price_at(D + horizon_days) / price_at(D) - 1
    actual_direction = "up" if actual_return > 0 else "down"
    brier = (forecast["p_up"] - (1 if actual_direction == "up" else 0)) ** 2

    # 7. Log row
    write_row(backtest_results, {
        "date": D,
        "top_analog_id": top_5[0]["episode_id"],
        "rhyme_score": top_5[0]["rhyme_score"],
        "predicted_direction": forecast["direction"],
        "predicted_p_up": forecast["p_up"],
        "predicted_magnitude": forecast["magnitude"],
        "actual_return_30d": actual_return,
        "actual_direction": actual_direction,
        "brier_score": brier,
    })
```

### No-lookahead invariants (must be enforced by code, not just convention)

| Invariant | Enforced by |
|---|---|
| State vector uses only data with `as_of_date <= D` | SQL `WHERE` clause; assertion on max(as_of_date) of result |
| Episodes filtered to `end_date < D` | SQL `WHERE`; assertion on max(end_date) of result |
| Embeddings computed at D do not include features observed after D | `06_state_vector.py` accepts an `as_of_date` override |
| Price data for resolution comes from a separate read AFTER forecast is logged | Two-phase: write forecast → wait → write resolution |

A unit test harness must validate these by injecting a synthetic D in the middle of the dataset and asserting no row touched has timestamp ≥ D except for the resolution read.

### Outputs

- **Delta table**: `novendor_1.historyrhymes.backtest_results` — one row per (date, ticker)
- **Delta table**: `novendor_1.historyrhymes.backtest_summary` — one row per (run_id, ticker), aggregated metrics

### Aggregate metrics computed at the end

```python
aggregate = {
    "n_predictions": len(rows),
    "aggregate_brier": mean([r.brier_score for r in rows]),
    "directional_accuracy": mean([r.predicted_direction == r.actual_direction for r in rows]),
    "precision_up": precision(predicted_up, actual_up),
    "recall_up": recall(predicted_up, actual_up),
    "vs_baseline": {
        "persistence": brier_vs_persistence_baseline,
        "random_walk": brier_vs_random_walk,
        "fifty_fifty": brier_vs_uninformed,
    },
    "rhyme_score_p95_uplift": p95_rhyme_score_directional_accuracy - p50_rhyme_score_directional_accuracy,
}
```

### Acceptance gates (gating live promotion)

| Gate | Threshold | Source |
|---|---|---|
| Aggregate Brier | < 0.22 over backtest window | SKILL.md target |
| Beats fifty-fifty by | ≥ 5 Brier points | sanity floor |
| Beats persistence by | ≥ 2 Brier points | meaningful skill |
| Rhyme Score 95th percentile uplift | ≥ 20% improvement vs random | SKILL.md target |
| Permutation test (1000 shuffles) | p < 0.05 | SKILL.md target |

If any gate fails, the 6th pillar weight in `fin-regime-classifier` stays at 0. No exceptions.

### CLI invocation

```bash
# Run full backtest (slow — 4 years × 12 dates × ~5s per forecast ≈ 4 minutes Databricks compute)
python -m skills.historyrhymes.notebooks.05_backtest_walk_forward \
    --start 2020-01-01 --end 2023-12-31 --step 30 --horizon 30

# Quick smoke test
python -m skills.historyrhymes.notebooks.05_backtest_walk_forward \
    --start 2023-01-01 --end 2023-06-30 --step 30 --horizon 30
```

---

## Section 4 — Non-Event Episode Ingestion (Automated FRED Detection)

### State of play

- Currently loaded: 8 episodes total (5 events + 3 non-events: 1998 LTCM, 2011 Debt Ceiling, 2016 Brexit).
- Required ratio (per SKILL.md and survivorship-bias correction logic): **2:1 non-events to events.**
- With 5 events, the floor is **10 non-events** → add at least 7 more programmatically.
- The user explicitly chose **automated detection over manual curation** — this is the harder, more rigorous path and the more durable answer because the detector can backfill non-events whenever new event episodes are added.

### Detector design

A non-event is a window where macro/positioning signals **looked like a crisis precursor** but the market either recovered quickly or no recession followed. The detector must avoid two failure modes:

1. **False positives** (labeling a real crisis as a non-event because the recovery happened "fast enough")
2. **Trivial detections** (every elevated-VIX week becomes a non-event, drowning the library in noise)

### Detection rules

A window is flagged as a **non-event candidate** if it satisfies ALL of:

| Signal | Threshold | Source |
|---|---|---|
| Trigger condition | **Any** of: VIX > 30 closing for ≥3 consecutive trading days, OR HY OAS > 600 bps, OR 10y2y inverted by > 50 bps for ≥30 days, OR initial claims 4-week MA up > 25% YoY | FRED: VIXCLS, BAMLH0A0HYM2, T10Y2Y, IC4WSA |
| Window | T0 = first day trigger fires; T1 = first day all triggers normalized for ≥10 trading days | computed |
| Drawdown floor | SPX drawdown from T0 peak ≥ 5% (must be a real episode, not a blip) | FRED SP500 daily |
| **Non-event criteria (must all hold)** | | |
| - No NBER recession | No NBER recession indicator within 12 months of T0 | FRED USREC |
| - SPX recovered | SPX returned to within 2% of T0 peak within 6 months of T1 | FRED SP500 |
| - Drawdown bounded | Peak-to-trough drawdown < 25% | FRED SP500 |
| Exclusion | Window cannot overlap with an existing event episode in `episodes` table | DB query |

A window is flagged as an **event** (not a non-event) if drawdown ≥ 25% OR NBER recession occurs within 12 months. The detector logs both classifications but only inserts non-events; events are flagged for manual review.

### New notebook: `skills/historyrhymes/notebooks/10_detect_non_events.py` **NEW**

```python
"""Scan FRED history for crisis-precursor windows that did NOT lead to recession.

Inputs:  FRED API (VIXCLS, BAMLH0A0HYM2, T10Y2Y, IC4WSA, SP500, USREC)
Output:  Inserts into Supabase episodes (is_non_event=true) and episode_signals
         For each candidate: full signal panel from T0-90d to T1+90d
         Logs detection_audit row (reason, thresholds tripped) for traceability

Idempotent: Uses a content hash of (start_date, end_date, trigger_set) as
the dedup key. Re-running will not duplicate non-events.
"""
```

### Algorithm pseudocode

```python
def detect_non_events(start="1990-01-01", end="2024-12-31"):
    # 1. Pull all FRED series
    vix = fred("VIXCLS", start, end)
    hy_oas = fred("BAMLH0A0HYM2", start, end)
    yc = fred("T10Y2Y", start, end)
    claims = fred("IC4WSA", start, end)
    spx = fred("SP500", start, end)
    nber = fred("USREC", start, end)

    # 2. Scan for trigger windows
    triggers = identify_trigger_windows(vix, hy_oas, yc, claims)
    # Returns list of (T0, T1, trigger_set) tuples

    candidates = []
    for T0, T1, trigger_set in triggers:
        # Drawdown check
        peak = spx.loc[T0:T0+timedelta(days=10)].max()
        trough = spx.loc[T0:T1+timedelta(days=180)].min()
        drawdown = (trough - peak) / peak

        if drawdown > -0.05:
            continue  # blip, not an episode

        # Recession check
        had_recession = nber.loc[T0:T0+timedelta(days=365)].sum() > 0

        # Recovery check
        recovery_window = spx.loc[T1:T1+timedelta(days=180)]
        recovered = (recovery_window.max() / peak) > 0.98

        if had_recession or drawdown < -0.25:
            log_audit(T0, T1, "classified_as_event", drawdown, had_recession)
            continue

        if not recovered:
            log_audit(T0, T1, "did_not_recover", drawdown, had_recession)
            continue

        # Overlap check against existing episodes
        if overlaps_existing_episode(T0, T1):
            continue

        candidates.append({
            "name": auto_name_episode(T0, trigger_set),
            "start_date": T0,
            "end_date": T1,
            "peak_date": peak_date(spx, T0),
            "trough_date": trough_date(spx, T0, T1),
            "max_drawdown_pct": drawdown * 100,
            "is_non_event": True,
            "regime_type": classify_regime_type(trigger_set),
            "trigger_set": trigger_set,
            "category": "non_event_auto",
            "narrative_arc": auto_generate_narrative(T0, trigger_set, drawdown),
            "tags": ["auto_detected"] + trigger_set,
        })

    return candidates
```

### Output

For each detected non-event the notebook:
1. **Inserts into `episodes`** with `category='non_event_auto'`, `is_non_event=true`, `tags` including `auto_detected` and the trigger set.
2. **Pulls a full signal panel** from FRED for `T0-90d` to `T1+90d` and inserts into `episode_signals` (one row per trading day, full quant feature panel).
3. **Generates an embedding** by calling `state_vector_encoder.encode_state_vector()` on the median state during the window, and inserts into `episode_embeddings`.
4. **Logs an audit row** to a new `episode_detection_audit` table for traceability (which thresholds tripped, reason for classification).

### Auto-naming convention

To avoid collisions: `{start_year}-{end_year_or_blank} {primary_trigger} ({drawdown_pct}%)`. Example: `"2018 Q4 Vol Spike (-19.8%)"`. Manual rename is allowed post-insert.

### Expected detector yield (1990–2024)

Conservative estimate based on known windows:
- 1994 Bond rout (early non-event)
- 1998 LTCM (already manually loaded — will be skipped via overlap check)
- 2010 Flash Crash + Greek crisis
- 2011 Debt Ceiling (already loaded — skipped)
- 2013 Taper Tantrum
- 2014 Q4 oil crash + ruble
- 2015 China deval
- 2016 Brexit (already loaded — skipped)
- 2018 Q4 vol spike
- 2019 yield curve inversion
- 2023 SVB / regional banking
- 2024 yen carry unwind

≈ 8–10 fresh non-events after deduping against the 3 manually loaded ones. **Brings library to ~16 episodes (5 events + 11 non-events)**, exceeding the 2:1 floor.

### Run mechanism

```bash
# One-time backfill
python -m skills.historyrhymes.notebooks.10_detect_non_events --start 1990-01-01 --end 2024-12-31

# Incremental — runs after each event episode is added
python -m skills.historyrhymes.notebooks.10_detect_non_events --start 2024-01-01 --end today
```

### New tables

- `repo-b/db/schema/NNN_history_rhymes_detection_audit.sql` — audit trail for the detector. Schema:
  ```sql
  CREATE TABLE episode_detection_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      trigger_set TEXT[] NOT NULL,
      classification TEXT NOT NULL,  -- 'non_event' | 'event' | 'rejected_overlap' | 'rejected_no_recovery'
      max_drawdown_pct NUMERIC,
      had_recession BOOLEAN,
      reason TEXT,
      episode_id UUID REFERENCES episodes(id),  -- null if not inserted
      content_hash TEXT UNIQUE  -- dedup key (start, end, trigger_set)
  );
  ```
- The `episodes` table needs no schema changes — `is_non_event` and `tags` columns already support the auto-detected pattern.

### Why this is more robust than manual curation

- **Reproducible**: Re-running the detector with new FRED data automatically discovers new non-events as time passes.
- **Auditable**: The audit table records every threshold trip, every classification, every rejection — so the human reviewer can validate the decision boundary.
- **Bias-aware**: The detector cannot accidentally cherry-pick "convenient" non-events because the rules are uniform across the entire scan window.
- **Self-tightening**: As the event library grows, overlap detection ensures non-events never collide with manually labeled events.

### Caveats

- FRED `SP500` series goes back to 1957 but VIXCLS only starts 1990-01-02 — detector start date floor is **1990**.
- HY OAS (`BAMLH0A0HYM2`) only starts 1996. Triggers using HY before 1996 are skipped automatically.
- The detector is **not** part of the daily DAG. It is a **bootstrap + manual-trigger** notebook. It runs once at module bootstrap and re-runs only when the event library grows.

---

---

## Section 5 — Hoyt Cycle, Harrison Convergence, EPU, and Era Discount

> **Note:** These features were added per user feedback after the initial plan was approved. The detailed specs (Hoyt peak episode list, Harrison convergence thresholds, EPU weighting) were not in the original brief I received, so the design below works from inferred fundamentals (Homer Hoyt's 18-year real estate cycle theory; Fred Harrison's 2026 peak prediction; Baker/Bloom/Davis EPU index). **Items marked `[CONFIRM]` need user input on specifics before implementation.**

### 5.1 EPU Signal Ingestion (P1, lowest-hanging)

**What:** Add Economic Policy Uncertainty Index (Baker, Bloom, Davis) to the daily FRED ingest.

**Series:**
- `USEPUINDXD` — daily US EPU index
- `WLEMUINDXD` — weekly world EPU index (proxy for global tariff regime)

**Where:** Extend [`01_load_signals.py`](skills/historyrhymes/notebooks/01_load_signals.py) to add these two FRED series alongside the existing P0 set. No new fetcher class — same FRED client, two more series IDs.

**Featurization:** In [`02_build_features.py`](skills/historyrhymes/notebooks/02_build_features.py), z-score `epu_us_daily` against rolling 1-year window. Also compute `epu_us_5d_change` and `epu_us_30d_change` deltas for narrative pivot detection.

**Why now:** The current tariff environment (April 2026) has EPU running near historical highs. Adding the signal lets the regime classifier and analog matcher see policy uncertainty as a first-class input.

### 5.2 Structural Era Discount (preventing 1970s-vs-2022 false equivalence)

**Problem:** A 1970s stagflation episode has zero crypto signal, zero VIX (VIX starts 1990), zero perpetual futures funding rate (starts ~2018). When today's state vector includes those modalities, naive cosine similarity will still rank old episodes high — but the comparison is meaningless because the missing modalities are zero by construction.

**Solution:** Apply a multiplicative discount to the Rhyme Score for episodes from eras predating critical signal modalities present in today's state vector.

**Discount table (proposed):**

| Era | Missing modalities | Discount when modality is non-zero today |
|---|---|---|
| Before 1990 | VIX | × 0.85 |
| Before 1996 | HY OAS | × 0.90 |
| Before 2009 | BTC, crypto market signals | × 0.80 |
| Before 2018 | Perp funding rates, on-chain flows | × 0.90 |

**Compounded floor:** A 1970s episode being compared against a state with VIX + crypto + funding rate signals would receive `0.85 × 0.80 × 0.90 = 0.612` discount. Floor at `0.50` to prevent the score from collapsing to noise.

**Where applied:** In `backend/app/services/history_rhymes_service.py` and `04_score_analogs.py`, applied to the Rhyme Score AFTER cosine + DTW + categorical, and BEFORE Hoyt amplification (see 5.3). Order matters because Hoyt amplification can boost a score and we want the era discount to act on the raw similarity, not the amplified value.

```python
def apply_structural_era_discount(rhyme_score: float, episode: Episode, current_state: dict) -> float:
    discount = 1.0
    if episode.start_date.year < 1990 and current_state.get("vix_z") is not None:
        discount *= 0.85
    if episode.start_date.year < 1996 and current_state.get("hy_oas_z") is not None:
        discount *= 0.90
    if episode.start_date.year < 2009 and current_state.get("btc_z") is not None:
        discount *= 0.80
    if episode.start_date.year < 2018 and current_state.get("perp_funding_z") is not None:
        discount *= 0.90
    return rhyme_score * max(discount, 0.50)
```

**Test:** Unit test must verify that comparing today's full-modality state vector against the 1970s stagflation episode yields a Rhyme Score ≤ 0.612 of what it would get without the discount. This is the regression case that prevents the bug from re-introducing itself.

### 5.3 Hoyt Cycle Position Signal

**What:** Add a derived signal `hoyt_cycle_position` (0–17, where 0 = trough, 17 = pre-trough peak) that anchors the current date against Homer Hoyt's 18-year real estate cycle.

**Anchor:** Last confirmed Hoyt trough: **2009-Q1** (post-GFC). The 18-year cycle places the next expected peak at **2026-Q4 / 2027-Q1**, with the next trough at **2027-2028**. Current date 2026-04-10 maps to position **17.0** (peak).

**Computation (deterministic):**
```python
HOYT_TROUGH_ANCHOR = date(2009, 3, 1)
HOYT_CYCLE_YEARS = 18

def hoyt_cycle_position(d: date) -> float:
    delta_years = (d - HOYT_TROUGH_ANCHOR).days / 365.25
    return delta_years % HOYT_CYCLE_YEARS  # 0.0 - 17.999
```

**Where:** A new function in `skills/historyrhymes/services/hoyt_cycle.py`. Called by `02_build_features.py` to write a daily row into `signals_featured` with `signal_name='hoyt_cycle_position'` and `raw_value` = the position number.

**[CONFIRM]** Whether the user wants `hoyt_phase_label` as a discrete classifier (`expansion`/`mid_cycle`/`peak`/`bust`/`recovery`) alongside the continuous position number. Default: yes, with phase boundaries at 0–4=`recovery`, 4–9=`expansion`, 9–14=`mid_cycle`, 14–17=`peak`, 17–18=`bust`.

### 5.4 Hoyt Peak Episodes (seed library expansion)

**What:** Add three additional event episodes to the seed library, anchored on prior Hoyt peaks. These are pre-existing real estate cycle peaks that the analog matcher should be able to retrieve when the current Hoyt position is high.

**Proposed episodes:**

1. **1973 Real Estate Cycle Peak** (Hoyt peak before the 1974 trough)
   - Date range: 1972-Q4 → 1975-Q1
   - Catalysts: REIT collapse, oil shock, stagflation onset
   - `regime_type`: `inflationary`, `tags`: `[hoyt_peak, real_estate, stagflation, oil_shock]`

2. **1990 S&L Crisis / Real Estate Bust** (Hoyt peak before 1991 trough)
   - Date range: 1989-Q1 → 1991-Q4
   - Catalysts: Savings & Loan collapse, commercial real estate overbuild
   - `regime_type`: `deflationary_deleveraging`, `tags`: `[hoyt_peak, real_estate, savings_loan]`

3. **2007 GFC** — already in the library as `2007-2009 Global Financial Crisis`. Add `hoyt_peak` to its tags array via UPDATE in the new migration.

**[CONFIRM]** Whether the user wants the 1955 peak (post-WWII real estate) as a fourth — it's the earliest Hoyt peak we have any data for, but pre-FRED for most macro signals.

**Migration:** These get added to migration **503** (see "Resolved" below). The episode insertion uses the same shape as `435_history_rhymes_seed.sql`.

### 5.5 Harrison 2026 Convergence Alert

**What:** A frontend-visible alert that fires when the current Hoyt cycle position is within 6 months of a predicted peak AND any of: HY OAS spike, yield curve re-inversion, equity drawdown ≥ 5% from 60-day high.

**Why:** Fred Harrison's 18-year cycle prediction places a peak at 2026-2027. If macro stress signals confirm cycle-peak conditions, the system should escalate visibility — this is the "the cycle is converging with reality" moment.

**Implementation:**
- New table `structural_alerts` in migration 503 (see below):
  ```sql
  CREATE TABLE structural_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      env_id TEXT NOT NULL,
      business_id UUID NOT NULL,
      alert_date DATE NOT NULL,
      alert_type TEXT NOT NULL,  -- 'hoyt_convergence' | 'era_mismatch' | 'narrative_silence'
      severity TEXT NOT NULL,    -- 'info' | 'warning' | 'critical'
      hoyt_position NUMERIC,
      trigger_signals JSONB NOT NULL,
      narrative TEXT,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id, alert_date, alert_type)
  );
  ```
- **New notebook checkpoint** inside `08_multi_agent_forecast.py`: after generating the forecast, check if `hoyt_cycle_position > 16.5` AND any stress trigger fires, and if so insert a `hoyt_convergence` alert into `structural_alerts`.
- **New frontend component** `repo-b/src/components/market/CycleConvergenceCard.tsx` — pinned at the top of the History Rhymes tab when an unacknowledged `hoyt_convergence` alert exists. Renders the Hoyt position, the firing triggers, and the historical analog (1973, 1990, 2007). Includes an "acknowledge" button that sets `acknowledged_at`.
- **New API endpoint:** `GET /api/v1/rhymes/alerts?type=hoyt_convergence&unacknowledged=true` — returns active alerts. `POST /api/v1/rhymes/alerts/{id}/acknowledge`.

### 5.6 Updated DAG dependencies (Section 1 amendment)

The Section 1 DAG must be amended:
- `02_build_features.py` now also writes the `hoyt_cycle_position` derived signal.
- `04_score_analogs.py` calls `apply_structural_era_discount(...)` BEFORE the existing `apply_hoyt_amplification(...)` call. (Note: `apply_hoyt_amplification` is referenced as if it exists; if it doesn't yet, it must be added — currently the post-scoring path in the existing notebook does not have any amplification.) **[CONFIRM]** the desired Hoyt amplification formula.
- `08_multi_agent_forecast.py` checks for and writes `hoyt_convergence` alerts.

### 5.7 Files to add/modify (Section 5 additions)

**New:**
- `skills/historyrhymes/services/hoyt_cycle.py` — `hoyt_cycle_position()`, `hoyt_phase_label()`
- `skills/historyrhymes/services/era_discount.py` — `apply_structural_era_discount()`
- `repo-b/src/components/market/CycleConvergenceCard.tsx` — Harrison convergence alert UI

**Modified:**
- [`skills/historyrhymes/notebooks/01_load_signals.py`](skills/historyrhymes/notebooks/01_load_signals.py) — Add USEPUINDXD, WLEMUINDXD FRED series
- [`skills/historyrhymes/notebooks/02_build_features.py`](skills/historyrhymes/notebooks/02_build_features.py) — Add EPU z-scores + `hoyt_cycle_position` derived signal
- [`skills/historyrhymes/notebooks/04_score_analogs.py`](skills/historyrhymes/notebooks/04_score_analogs.py) — Apply era discount before Hoyt amplification
- [`skills/historyrhymes/notebooks/08_multi_agent_forecast.py`](skills/historyrhymes/notebooks/08_multi_agent_forecast.py) — Insert hoyt_convergence alerts when triggered
- [`backend/app/services/history_rhymes_service.py`](backend/app/services/history_rhymes_service.py) — Era discount + Hoyt amplification in the matching path; alerts CRUD
- [`backend/app/routes/rhymes.py`](backend/app/routes/rhymes.py) — `/alerts` endpoints
- [`repo-b/src/components/market/HistoryRhymesTab.tsx`](repo-b/src/components/market/HistoryRhymesTab.tsx) — Mount `CycleConvergenceCard` at the top

---

## Section 6 — FastAPI Contract (`POST /api/v1/rhymes/match`)

### Request

```json
{
  "as_of_date": "2026-04-10",          // optional; default = today
  "scope": "global",                    // optional; default = "global"
  "k": 5,                               // optional; default = 5; max = 20
  "include_narrative": false,           // optional; default = false (skip Claude call for speed)
  "force_refresh": false                // optional; default = false (read cached row from history_rhymes_daily)
}
```

### Response

```json
{
  "as_of_date": "2026-04-10",
  "scope": "global",
  "request_id": "req_xxx",
  "latency_ms": 187,
  "scenarios": {
    "bull": { "probability": 0.22, "narrative": "..." },
    "base": { "probability": 0.50, "narrative": "..." },
    "bear": { "probability": 0.28, "narrative": "..." }
  },
  "top_analogs": [
    {
      "rank": 1,
      "episode_id": "uuid",
      "episode_name": "2022 Luna/3AC/FTX Crypto Contagion Cascade",
      "rhyme_score": 0.78,
      "rhyme_score_components": {
        "cosine": 0.82,
        "dtw": 0.71,
        "categorical": 0.80,
        "era_discount": 1.00,
        "hoyt_amplification": 1.00
      },
      "divergence": {
        "key_differences": ["VIX is lower today", "yield curve steeper"],
        "vector_diff": [0.12, -0.04, 0.31, ...]   // 256-dim element-wise diff (only sent if include_narrative=true)
      },
      "trajectory_overlay": {
        "episode_path": [{"day": -30, "value": 1.00}, ...],
        "current_path": [{"day": -30, "value": 1.00}, ...]
      }
    }
  ],
  "trap_detector": {
    "trap_flag": false,
    "trap_reason": null,
    "honeypot_match": null,
    "crowding_score": 0.42,
    "consensus_divergence": 0.18
  },
  "structural_alerts": [
    {
      "alert_type": "hoyt_convergence",
      "severity": "warning",
      "hoyt_position": 17.1,
      "trigger_signals": ["yield_curve_re_inversion", "hy_oas_above_500bps"],
      "narrative": "..."
    }
  ],
  "confidence_meta": {
    "agent_agreement": 0.74,
    "permutation_p_value": 0.018,
    "sample_size": 16,
    "data_freshness_hours": 2.3
  }
}
```

### Error responses

- `400` — invalid `as_of_date` or `scope`
- `404` — no `history_rhymes_daily` row exists for `as_of_date` (caller must run the pipeline first OR pass `force_refresh=true`)
- `409` — `force_refresh=true` while a daily run is already in progress for `as_of_date`
- `503` — pgvector retrieval timeout (>5s) — fail closed, do NOT return stale cache

### Performance budget

- p50 < 200 ms (cache hit, `include_narrative=false`)
- p95 < 500 ms (cache miss, `include_narrative=false`, full pgvector + DTW path)
- p99 < 2 s (`include_narrative=true`, includes Claude call)

### Companion endpoints

- `GET /api/v1/rhymes/episodes` — list with filters (`asset_class`, `is_non_event`, `has_hoyt_peak_tag`)
- `GET /api/v1/rhymes/predictions/{prediction_id}` — fetch a stored forecast for resolution checking
- `GET /api/v1/rhymes/alerts?type=hoyt_convergence&unacknowledged=true` — Section 5.5 alerts feed
- `POST /api/v1/rhymes/alerts/{id}/acknowledge` — Section 5.5 acknowledgment

---

## Section 7 — Operational Rules

These are not optional. They are how the system fails safely.

1. **Failed backtest gates → 6th pillar weight stays at 0.** If any of the Layer 3 acceptance gates (Brier < 0.22, beats baselines by required margins, p < 0.05 permutation test) fails, the History Rhymes module is **not allowed to influence** the `fin-regime-classifier` weights or the paper-trading promotion ladder. The plan does not specify a workaround. The fix is "make the backtest pass", not "lower the gate".
2. **`10_detect_non_events.py` is not part of `run_pipeline.py`.** It is a bootstrap-only and event-library-grew-trigger notebook. It must NOT be added to the `STEPS` list in `run_pipeline.py`, even as a conditional step. A conditional step would tempt a future dev to enable it daily and thrash FRED + insert duplicates. Keep it strictly out of band.
3. **Daily DAG failures in stages 4–6 do not block stage 7.** `05_export_to_supabase.py` exports whatever stages 4–6 successfully wrote. Partial pipelines are better than dropped runs because the frontend's worst case is "yesterday's analog with no narrative" instead of "blank widget".
4. **No fallback to legacy hardcoded vectors.** Once `04_score_analogs.py` is rewritten to use pgvector, the hardcoded VALUES list (lines 54-64 of the current file) is deleted, not commented out. A future dev cannot uncomment a fallback because there is no fallback to uncomment.
5. **Pgvector retrieval timeouts fail closed.** `503` instead of returning a cached top-5 from yesterday. Stale results in a temporal pattern matcher are worse than no result.
6. **Era discount applied before Hoyt amplification.** Order is fixed (see Section 5.2). Tests must enforce this order via assertion on the call sequence.

---

## Section 8 — Explicit Scope Decisions

### In scope for this plan
- Sections 1–7 (DAG, vectors, backtest, non-event detector, Hoyt/EPU/era discount, FastAPI contract, operational rules)
- Migrations 503 and 504
- The 6 new notebooks + 1 rewrite + 3 modified existing notebooks
- FastAPI route + service + 4 endpoints
- 1 new frontend component (`CycleConvergenceCard.tsx`) + frontend wiring of `HistoryRhymesTab.tsx` to live API

### Deferred to a named follow-up ticket (not in this plan)
- **`agent_prompt_versions` and `agent_prompt_regression_cases` tables** — prompt versioning for the multi-agent forecaster. **Decision: deferred.** The Phase 1 multi-agent forecaster (`08_multi_agent_forecast.py`) ships with prompts inlined in code. Versioning becomes load-bearing once we have ≥2 agents whose prompts have been edited based on Brier feedback — that's the trigger for the follow-up ticket. Track as: **HR-PROMPT-VERSIONING** (no work until trigger).
- **`validate_prompts.py` script** — same trigger as above, same ticket.
- **Trained autoencoder for state vector projection** — gated on ≥500 daily state vectors in `wss_signal_state_vector` (Section 2 TODO marker).
- **Databricks Jobs API scheduling of `run_pipeline.py`** — the daily 5:15 AM ET cron registration. Section 1 mentions this is "out of scope unless the user requests it".
- **TDA early warning module** — referenced in the older `HISTORY_RHYMES_BUILD_PLAN.md` ticket 5.1; not required for the 6th pillar to ship.
- **Podcast pipeline narrative ingestion** — separate workstream tracked elsewhere.
- **The CI guardrail 9999 collision fix** — that's a different module's problem (`9999_multi_entity_operator.sql`). This plan uses 503/504 to avoid touching the 9999 range entirely. The collision must be resolved by the multi-entity-operator owner; not blocking this plan.

---

## Files to create

### New notebooks
- [skills/historyrhymes/notebooks/06_state_vector.py](skills/historyrhymes/notebooks/06_state_vector.py) — Stage 2 encoder
- [skills/historyrhymes/notebooks/04b_pgvector_match.py](skills/historyrhymes/notebooks/04b_pgvector_match.py) — Stage 3a cosine retrieval
- [skills/historyrhymes/notebooks/07_divergence_honeypot.py](skills/historyrhymes/notebooks/07_divergence_honeypot.py) — Stage 4
- [skills/historyrhymes/notebooks/08_multi_agent_forecast.py](skills/historyrhymes/notebooks/08_multi_agent_forecast.py) — Stage 5
- [skills/historyrhymes/notebooks/09_calibrate_brier.py](skills/historyrhymes/notebooks/09_calibrate_brier.py) — Stage 6
- [skills/historyrhymes/notebooks/05_backtest_walk_forward.py](skills/historyrhymes/notebooks/05_backtest_walk_forward.py) — Validation gate
- [skills/historyrhymes/notebooks/10_detect_non_events.py](skills/historyrhymes/notebooks/10_detect_non_events.py) — FRED-driven non-event detector (Section 4)

### New services
- [skills/historyrhymes/services/state_vector_encoder.py](skills/historyrhymes/services/state_vector_encoder.py) — Reusable encoder (called from `06`, `05_backtest`, `10_detect_non_events`)
- [skills/historyrhymes/services/hoyt_cycle.py](skills/historyrhymes/services/hoyt_cycle.py) — `hoyt_cycle_position()`, `hoyt_phase_label()` (Section 5.3)
- [skills/historyrhymes/services/era_discount.py](skills/historyrhymes/services/era_discount.py) — `apply_structural_era_discount()` (Section 5.2)
- [backend/app/services/history_rhymes_service.py](backend/app/services/history_rhymes_service.py) — pgvector retrieval, FastDTW refinement, Rhyme Score, era discount, Hoyt amplification, alerts CRUD
- [backend/app/routes/rhymes.py](backend/app/routes/rhymes.py) — `POST /api/v1/rhymes/match`, `GET /episodes`, `GET /predictions/{id}`, `GET /alerts`, `POST /alerts/{id}/acknowledge` (Section 6) + register in `backend/app/main.py`

### New frontend components
- [repo-b/src/components/market/CycleConvergenceCard.tsx](repo-b/src/components/market/CycleConvergenceCard.tsx) — Harrison 2026 convergence alert UI (Section 5.5)

### New migrations (prefixes resolved 2026-04-10)

Confirmed via `ls repo-b/db/schema/`: highest active module migration is **502** (`502_drop_abandoned_modules.sql`). The 9990–9999 reserve range is full (9999 is `9999_multi_entity_operator.sql`, which is the source of the CI guardrail collision in the IDE selection logs). The next two sequential prefixes are **503** and **504**.

- `repo-b/db/schema/503_history_rhymes_structural.sql` — `episode_detection_audit` table (Section 4) + `structural_alerts` table (Section 5.5) + Hoyt peak episode seed inserts (Section 5.4) + UPDATE on existing 2007 GFC episode to add `hoyt_peak` tag. Single migration for atomicity.
- `repo-b/db/schema/504_history_rhymes_backtest_results.sql` — `backtest_results` and `backtest_summary` mirror tables for Supabase-side UI consumption of walk-forward results.

### Modified files
- [skills/historyrhymes/notebooks/04_score_analogs.py](skills/historyrhymes/notebooks/04_score_analogs.py) — Rewrite: drop hardcoded VALUES (lines 54-64), call `04b_pgvector_match`, run FastDTW refine, compute Rhyme Score = 0.6·cosine + 0.3·DTW + 0.1·categorical, then apply `era_discount` (Section 5.2) then `hoyt_amplification` (Section 5.3) in that fixed order
- [skills/historyrhymes/notebooks/01_load_signals.py](skills/historyrhymes/notebooks/01_load_signals.py) — Add AAII + CoinGlass fetchers; add USEPUINDXD + WLEMUINDXD FRED series (Section 5.1); **change FRED `observation_start` from incremental to `2020-01-01` for backfill, then revert to incremental on subsequent runs** (controlled via a `--backfill` flag)
- [skills/historyrhymes/notebooks/02_build_features.py](skills/historyrhymes/notebooks/02_build_features.py) — Add EPU z-scores; add `hoyt_cycle_position` derived signal (Section 5.3)
- [skills/historyrhymes/notebooks/08_multi_agent_forecast.py](skills/historyrhymes/notebooks/08_multi_agent_forecast.py) — Insert `hoyt_convergence` alerts into `structural_alerts` when triggered (Section 5.5)
- [skills/historyrhymes/notebooks/run_pipeline.py](skills/historyrhymes/notebooks/run_pipeline.py) — Add new stages (`06`, `04b`, `07`, `08`, `09`) to `STEPS` list with row-count validation. **`10_detect_non_events.py` is NOT added — not even as a conditional/disabled-by-default step** (Section 7 rule 2)
- [skills/historyrhymes/notebooks/05_export_to_supabase.py](skills/historyrhymes/notebooks/05_export_to_supabase.py) — Add `hr_predictions` UPSERT path
- [backend/app/main.py](backend/app/main.py) — Register `rhymes` router (sibling of `market_regime`, `market_correlation`)
- [repo-b/src/components/market/HistoryRhymesTab.tsx](repo-b/src/components/market/HistoryRhymesTab.tsx) — Mount `CycleConvergenceCard` at the top; replace mock data with real `/api/v1/rhymes/match` calls
- [skills/historyrhymes/PLAN.md](skills/historyrhymes/PLAN.md) — This file

---

## Verification

End-to-end verification has three layers — each must pass before the next runs.

### Layer 0: Library bootstrap (one-time)
```bash
# 1. Backfill FRED to 2020-01-01
python -m skills.historyrhymes.notebooks.01_load_signals --backfill --start 2020-01-01

# 2. Run the non-event detector
python -m skills.historyrhymes.notebooks.10_detect_non_events --start 1990-01-01 --end 2024-12-31

# 3. Verify episode balance
psql $SUPABASE_URL -c "SELECT is_non_event, COUNT(*) FROM episodes GROUP BY is_non_event;"
# Expected: non_event=true count >= 2 * non_event=false count
```

### Layer 1: DAG smoke test
```bash
# Test that all stages execute and write expected rows
python -m skills.historyrhymes.notebooks.run_pipeline
# Expected: all 9 steps OK, validate_row_count passes for each table
```

### Layer 2: API contract test
```bash
# After backend deploy
curl -X POST https://<backend>/api/v1/rhymes/match \
  -H "Content-Type: application/json" \
  -d '{"as_of_date": "2026-04-10"}'
# Expected: 200 OK, top-5 analogs with rhyme_score, divergence, trap_flag, < 200ms
```

### Layer 3: Backtest validation gate (the real test)
```bash
python -m skills.historyrhymes.notebooks.05_backtest_walk_forward \
    --start 2020-01-01 --end 2023-12-31 --step 30 --horizon 30
# Expected (must all pass):
#   - aggregate_brier < 0.22
#   - directional_accuracy > 0.55
#   - beats fifty-fifty baseline by ≥ 5 Brier points
#   - beats persistence baseline by ≥ 2 Brier points
#   - rhyme_score p95 uplift ≥ 20%
#   - permutation test p < 0.05
```

### Layer 4: Frontend wiring smoke test
```bash
# Local
cd repo-b && npm run dev
# Open http://localhost:3000/lab/env/<env_id>/markets
# Switch to "history-rhymes" tab — confirm components are reading from /api/v1/rhymes/match,
# not from the hardcoded mocks in HistoryRhymesTab.tsx
```

### Layer 5: Frontend test suite
```bash
cd repo-b && npm test -- HistoryRhymesTab
```

If Layer 3 fails, do not proceed to wiring the 6th pillar weight in `fin-regime-classifier`. The 6th pillar weight stays at 0 until backtest passes.

---

## Risks and notes

1. ~~**Guardrail collision**~~ — **RESOLVED.** Confirmed via `ls repo-b/db/schema/`: highest module migration is 502, 9990–9999 reserve range is full. New migrations are 503 and 504 (Section "New migrations"). The CI guardrail failure on `9999_multi_entity_operator.sql` is a different module's responsibility — not blocking this plan since 503/504 don't touch the 9999 range.
2. ~~**Catalog mismatch**~~ — **RESOLVED via user clarification.** Stay with `novendor_1.historyrhymes`. No migration to `main.default`.
3. **PRD-grade backtest takes ~4 minutes Databricks compute** per full run. Smoke tests should use the 6-month range to fit in CI budget if a CI hook is added later.
4. **OpenAI text embedding cost**: ~$0.13/1M tokens for `text-embedding-3-large`. Daily state vector + 16 episode backfills + 50 backtest dates ≈ negligible (<$1/month at current scale).
5. **The `04_score_analogs.py` rewrite is a breaking change** for any consumer reading from `history_rhymes_daily.top_analog_name`. Frontend mocks insulate us today, but the new schema needs to match the FastAPI contract in Section 6.
6. **`[CONFIRM]` markers in Section 5 need user input** before those subsections can be implemented. Specifically: (a) Hoyt phase label boundaries, (b) whether to add a 1955 Hoyt peak episode, (c) the desired Hoyt amplification formula. Implementation can start on Sections 1–4, 6, 7 in parallel while waiting for these answers.
7. **The Hoyt/Harrison/EPU features were added retroactively** and were not in the brief I originally received. Section 5 works from inferred fundamentals (Hoyt's 18-year cycle anchored to 2009, Baker/Bloom/Davis EPU index, era-discount logic). If the user has more detailed specs from a separate prompt, those should override the defaults in Section 5.
