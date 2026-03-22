# Market Rotation Engine — Phase 3 Build Prompts
**Run Date:** 2026-03-22
**Task:** fin-feature-builder (scheduled)
**Cards Converted:** 3

---

## Summary

The `trading_feature_cards` table was empty at task start — no prior rotation had seeded cards. This run bootstrapped the feature pipeline by synthesizing the top 3 cards from the `market_segments` catalog (20 active Tier 1 segments across equities, crypto, derivatives, and macro), selecting based on: cross-vertical impact, analytical gap severity, and strategic alignment with Winston's core verticals. All 3 cards were inserted as `identified` and immediately promoted to `spec_ready` with full meta prompts.

---

## Cards Converted Today

| # | Card ID | Title | Segment | Priority | Cross-Vertical | Est. Hours |
|---|---------|-------|---------|----------|----------------|------------|
| 1 | `c61eb780` | Multi-Asset Regime Classifier Dashboard | `ma-regime-classifier` | 92 | Yes | 8h |
| 2 | `c8b52caa` | Volatility Surface Viewer & Skew Monitor | `dr-vol-surface` | 87 | No | 10h |
| 3 | `55e73b7c` | RWA Tokenization Pipeline Monitor | `cr-rwa-tokenization` | 85 | Yes | 9h |

**Total estimated effort: 27 hours**

---

## Build Order Recommendation

### 1. Multi-Asset Regime Classifier Dashboard (Priority 92, 8h)
**Build first.** Highest strategic value — feeds context into REPE, Credit, and PDS modules, and provides the macro "north star" that makes all other segment rotations more actionable. Lowest external dependency risk (uses existing `fact_market_timeseries` + FRED API which is already used in other services). Sets the cross-vertical context injection pattern that cards 2 and 3 can follow.

**Prompt file:** `docs/market-features/prompts/2026-03-22-multi-asset-regime-classifier-dashboard.md`

**Key deliverables:**
- New table: `market_regime_snapshot`
- New service: `backend/app/services/market_regime_engine.py`
- New routes: `GET /api/v1/market/regime/latest` + `/history`
- New component: `repo-b/src/components/market/RegimeClassifierWidget.tsx`
- Env var needed: `FRED_API_KEY`

---

### 2. RWA Tokenization Pipeline Monitor (Priority 85, 9h)
**Build second.** Cross-vertical impact to REPE and Credit makes this immediately demo-able and strategically differentiating. DeFiLlama API is free and robust — low dependency risk. The cross-vertical context injection routes (`/rwa/cross-vertical-context`) establish a reusable pattern for other market data modules.

**Prompt file:** `docs/market-features/prompts/2026-03-22-rwa-tokenization-pipeline-monitor.md`

**Key deliverables:**
- New table: `rwa_tvl_snapshot`
- New service: `backend/app/services/rwa_monitor_service.py`
- New routes: `GET /api/v1/market/rwa/latest` + `/history` + `/cross-vertical-context`
- New component: `repo-b/src/components/market/RWAMonitorPanel.tsx`
- Env var needed: `FRED_API_KEY` (shared with Card 1)

---

### 3. Volatility Surface Viewer & Skew Monitor (Priority 87, 10h)
**Build third.** Highest frontend complexity (heatmap + multi-chart layout) and the most external data dependency (Tradier API key). The `yfinance` fallback makes it safe to build without a Tradier key, but production quality requires it. Build after the simpler data-pipeline patterns are established in Cards 1 and 2.

**Prompt file:** `docs/market-features/prompts/2026-03-22-volatility-surface-viewer-skew-monitor.md`

**Key deliverables:**
- New table: `vol_surface_snapshot`
- New service: `backend/app/services/vol_surface_service.py`
- New route: `GET /api/v1/market/vol-surface/{ticker}`
- New component: `repo-b/src/components/market/VolSurfaceViewer.tsx`
- Env var needed: `TRADIER_API_KEY` (new), `yfinance` pip install (fallback)

---

## Cross-Vertical Impact Matrix

| Feature | REPE | Credit | PDS | Standalone Market Value |
|---------|------|--------|-----|------------------------|
| Regime Classifier | ✅ Cap rate / CMBS context | ✅ Tightening advisory trigger | ✅ Pipeline demand context | ✅ Core macro signal |
| RWA Monitor | ✅ Tokenized RE fund comps | ✅ On-chain credit benchmarks | — | ✅ Crypto/TradFi bridge |
| Vol Surface | — | — | — | ✅ Derivatives research |

---

## New Env Vars Required

| Var | Used By | Notes |
|-----|---------|-------|
| `FRED_API_KEY` | Regime Classifier, RWA Monitor | Free at fred.stlouisfed.org — already may be present |
| `TRADIER_API_KEY` | Vol Surface (production) | Free tier at developer.tradier.com; yfinance fallback available |

---

## New Tables Summary

| Table | Owner Feature | Additive? | RLS |
|-------|--------------|-----------|-----|
| `market_regime_snapshot` | Regime Classifier | ✅ New only | ✅ tenant-scoped |
| `vol_surface_snapshot` | Vol Surface | ✅ New only | ✅ tenant-scoped |
| `rwa_tvl_snapshot` | RWA Monitor | ✅ New only | ✅ tenant-scoped |

All tables are additive CREATE TABLE only. No existing tables modified. Protected surfaces (schemas 274/275/277, credit services, REPE engines, PDS services, Meridian seed data) untouched.

---

## Autonomous Run Notes

- `trading_feature_cards` was empty at task start — bootstrapped from `market_segments` catalog
- `market_segment_intel_brief` was empty — no prior rotation runs have executed
- Cards selected based on: Tier 1 segment status, cross-vertical hook richness, analytical gap severity
- All 3 cards inserted as `identified`, then immediately promoted to `spec_ready` with full meta prompts
- Next scheduled rotation run should populate `market_segment_intel_brief` with live brief data, enabling future card generation from actual research outputs
