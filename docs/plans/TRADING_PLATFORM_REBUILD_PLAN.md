# Trading Platform — Full Product Architecture Rebuild Plan

**Created:** 2026-03-30
**Status:** ACTIVE — Audit complete, implementation in progress
**Backend note:** Backend is mid-refactor (consolidating two backends). Avoid backend route changes; focus on frontend restructure + data contracts + Databricks wiring.

---

## AUDIT SUMMARY

### What Exists and Works (Preserve)

| Component | Status | Data Source | Notes |
|-----------|--------|-------------|-------|
| 7-tab decision engine (command-center, paper-portfolio, calibration, research-briefs, history-rhymes, machine-forecasts, trap-detector) | LIVE | Mixed | Tabs exist; 3 use real data, 4 use mock/placeholder |
| DecisionEngineSidebar with asset scope selector (Global, Equities, Crypto, Real Estate) | LIVE | N/A | Good structure, needs Real Estate content |
| CommandCenterLayout (5 panels: DecisionNarrative, TopAnalog, WhatChanged, TrapDetection, ModelTransparency) | LIVE | Mock | UI wired, all data is mock constants |
| Paper Portfolio (position CRUD, PnL computation) | LIVE | Real Supabase | Fully operational, real trades |
| Calibration (win rate, profit factor, equity curve) | LIVE | Real Supabase | Performance snapshots real |
| Research Briefs | LIVE | Real Supabase | Research notes real |
| Execution Workspace (/markets/execution) | LIVE | Real BOS API | Trade intents, order ticket, kill switch |
| RegimeClassifierWidget | WIRED | API (disconnected) | Needs backend data |
| BtcSpxCorrelationChart | WIRED | API (disconnected) | Needs backend data |
| 13 backend API endpoints (trading.py) | LIVE | Real Supabase | All CRUD operations work |
| 7 MCP tools (trading_tools.py) | LIVE | Real | Regime, correlation, signals, positions |
| buildTheme() dark/light mode | LIVE | N/A | 30+ semantic tokens |

### What Is Mock Data (Must Replace)

All Command Center data is hardcoded in `HistoryRhymesTab.tsx`:
- `realitySignals` (7 items) — Pre-data behavioral signals
- `dataSignals` (6 items) — CPI, PCE, NFP, PMI, Housing Starts, CMBS
- `narrativeState` (6 items) — Soft Landing, AI Bubble, CRE Apocalypse, etc.
- `positioningData` (8 items) — SPY, QQQ, BTC, ETH, Office REITs, etc.
- `silenceEvents` (5 items) — Dropped narratives
- `mismatchData` (5 items) — Reality vs Data vs Narrative divergences
- `agentData` (5 items) — Multi-agent forecaster output
- `radarDims` (6 items) — Cross-regime comparison
- `brierHist` (24 weeks) — Brier score time series
- `trapChecks` (6 items) — Trap detector status
- `analogOverlay` (60 points) — Trajectory comparison chart

### What Is Missing

| Gap | Priority | Effort | Phase |
|-----|----------|--------|-------|
| Real Estate section in sidebar (MSA intelligence dark) | P0 | 3d | 2 |
| Data contracts (TypeScript types for agents, ensemble, analogs, traps, calibration, freshness) | P0 | 1d | 4 |
| Databricks feature ingestion service | P0 | 5d | 5 |
| Data freshness / staleness system | P1 | 2d | 9 |
| Agent output → API → UI pipeline | P1 | 5d | 7 |
| Analog matching API (pgvector) | P1 | 4d | 6 |
| Prediction logging + Brier resolution | P1 | 3d | 8 |
| Podcast extraction backend | P2 | 8d | 5.2 |
| 10+ additional non-event episodes for library balance | P2 | 2d | 6 |
| Paper trading ← forecast linking | P2 | 3d | 8 |
| TDA early warning system | P3 | 5d | future |

### What Conflicts with Product Vision

1. **History Rhymes tab is a placeholder card** — Should show the full analog engine (already built as HistoryRhymesTab.tsx but not mounted in the tab)
2. **Machine Forecasts tab is empty placeholder** — Should show 5-agent ensemble panel
3. **Trap Detector tab is empty placeholder** — Should show trap detection panel
4. **Real Estate scope selector exists but has no dedicated content** — MSA rotation data is generated daily but invisible in Trading Lab
5. **Mock data in Command Center pretends to be real** — Should use contracts that clearly label data as mock until wired

---

## IMPLEMENTATION SEQUENCE

### Phase 4: Data Contracts (DO FIRST — contracts before UI)

Create `repo-b/src/lib/trading-lab/decision-engine-types.ts`:

1. **AgentOutput** — agent_name, stance, probability, confidence, top_reasons[], horizon_days, brier_90d, weight, as_of
2. **EnsembleOutput** — bull_prob, base_prob, bear_prob, primary_posture, confidence, disagreement_score, recommended_action_tier, agents[]
3. **AnalogMatch** — episode_name, rhyme_score, similarities[], divergences[], confidence_band, trajectory_overlay[]
4. **TrapDetector** — crowding_score, flow_narrative_mismatch, suspicious_consensus, honeypot_pattern, action_adjustment, checks[]
5. **CalibrationState** — aggregate_brier_30d, aggregate_brier_90d, prediction_count_30d, agent_scores{}, sufficient_history
6. **DataFreshness** — overall_status, last_full_refresh_at, sources[]
7. **RealitySignal** — domain, signal, value, acceleration, trend, confidence
8. **DataSignal** — metric, reported, expected, surprise, trend, revision
9. **NarrativeState** — label, intensity, velocity, lifecycle, crowding, manipulation
10. **PositioningSignal** — asset, metric, value, crowding, extreme, direction
11. **MismatchEvent** — topic, reality, data, narrative, mismatch_score
12. **SilenceEvent** — label, prior_intensity, current_intensity, dropoff, significance
13. **DecisionSummary** — regime, primary_forecast, confidence, posture, key_risk, narrative

### Phase 2: Information Architecture

The sidebar already has the right bones (DecisionEngineSidebar with scope selector). Extend it:

**Add Real Estate sub-navigation when scope = "real-estate":**
- Overview (MSA heat map / zone scores)
- Housing / Permits (housing starts, building permits data)
- Cap Rates / Spreads (vs Treasury)
- CMBS / Delinquencies
- MSA Zone Briefs (daily rotation output)
- Analogs (RE-specific episodes)

**Wire MSA data into the asset scope filter:**
- When scope = "real-estate", filter signals/narratives/positioning to RE-relevant items
- Surface `msa_zone_intel_brief` data in dedicated panels
- Link to REPE environment for deal-level analysis

### Phase 3: Command Center Wiring

Replace mock constants with contract-typed data. Even if data is still mock initially, structure it through the contracts so the UI is ready for real data.

1. Wire `DecisionNarrativeCard` to use `DecisionSummary` + `EnsembleOutput` contracts
2. Wire `ModelTransparencyPanel` to use `AgentOutput[]` contracts
3. Wire `TrapDetectionPanel` to use `TrapDetector` contract
4. Wire `WhatChangedPanel` to use `RealitySignal[]` + `DataSignal[]` contracts
5. Wire `TopAnalogCard` to use `AnalogMatch` contract

### Phase 5: Databricks Wiring

**P0 Signals to ingest first:**
- MVRV Z-Score (crypto)
- Housing starts (RE)
- Building permits (RE)
- Yield curve shape (macro)
- VIX term structure (macro)

**Service layer:** Create `backend/app/services/databricks_feature_service.py` — BUT wait for backend consolidation before implementing. For now, scaffold the contract and mock the responses.

### Phase 6-9: Episode Library, Forecaster, Calibration, System Ops

These follow the existing `HISTORY_RHYMES_BUILD_PLAN.md` timeline. Key additions:
- Mount the full HistoryRhymesTab content into the History Rhymes tab (not just placeholder)
- Mount agent ensemble into Machine Forecasts tab
- Mount trap detector into Trap Detector tab
- Add Data Freshness panel to System section
- Add Calibration health badge to header

---

## SCHEMAS READY TO APPLY

| Schema | File | Tables | Status |
|--------|------|--------|--------|
| History Rhymes (episodes, WSS, agents) | `skills/historyrhymes/references/schema_supabase.sql` | ~20 | Ready |
| Podcast Intelligence | `repo-b/db/schema/425_podcast_intelligence.sql` | 16 | Ready |
| Trading Lab | `repo-b/db/schema/423_trading_lab.sql` | 10 | Already applied |
| BTC-SPX Correlation | `repo-b/db/schema/422_btc_spx_correlation.sql` | 1 | Already applied |
| Market Rotation Engine | `repo-b/db/schema/419_market_rotation_engine.sql` | 3+ | Already applied |
| MSA Rotation Engine | `repo-b/db/schema/418_msa_rotation_engine.sql` | 3 | Already applied |

## DATABRICKS INTEGRATION POINTS

| Resource | Value | Status |
|----------|-------|--------|
| Workspace | `dbc-2504bec5-b5ab.cloud.databricks.com` | Configured |
| Catalog | `novendor_1` | Active |
| Schema | `historyrhymes` | Ready to create |
| SQL Warehouse | `0e56420fb707d861` | Stopped (on-demand) |
| MLflow Experiment | `3740651530987773` | Active |
| REST Client | `skills/historyrhymes/scripts/databricks_client.py` | Functional |

## WHAT IS REAL VS MOCK (HONEST ASSESSMENT)

| Layer | Real | Mock/Stub |
|-------|------|-----------|
| Position management (CRUD) | ✅ | |
| Performance snapshots | ✅ | |
| Research notes | ✅ | |
| Daily briefs | ✅ | |
| Watchlist | ✅ | |
| Regime classification | ✅ (service exists) | Stub if no data computed |
| BTC-SPX correlation | ✅ (service exists) | Stub if no data |
| Command Center signals | | ✅ All mock constants |
| Agent ensemble output | | ✅ Mock |
| Trap detection | | ✅ Mock |
| Analog matching | | ✅ Mock |
| Brier scores | | ✅ Mock |
| Narrative tracking | | ✅ Mock |
| Positioning data | | ✅ Mock |
| Databricks features | | ❌ Not connected |
| MSA zone intelligence | ✅ (generated daily) | ❌ Not surfaced in UI |

## NEXT STEPS (ORDERED)

1. **NOW:** Create TypeScript data contracts (`decision-engine-types.ts`)
2. **NOW:** Wire existing HistoryRhymesTab into the History Rhymes tab (not placeholder)
3. **NOW:** Wire agent panel into Machine Forecasts tab
4. **NOW:** Wire trap panel into Trap Detector tab
5. **NEXT:** Add Real Estate content panels for MSA zone intelligence
6. **NEXT:** Create Databricks feature service (after backend consolidation)
7. **LATER:** Wire real agent outputs through forecast service
8. **LATER:** Implement Brier scoring and calibration loop
9. **LATER:** Connect live data feeds
