# Market Rotation Engine — Phase 3 Build Prompts
**Generated:** 2026-03-23
**Task:** fin-feature-builder (scheduled)
**Cards Converted:** 3

---

## Cards Converted Today

| # | Title | Card ID | Priority | Segment | Gap Type | Prompt File |
|---|---|---|---|---|---|---|
| 1 | Regime Escalation Sentinel | d8d20773 | 98.70 | ma-regime-classifier | alert | `2026-03-22-regime-escalation-sentinel.md` |
| 2 | Multi-Asset Regime Classifier Dashboard | c61eb780 | 92.00 | ma-regime-classifier | risk_model | `2026-03-22-multi-asset-regime-classifier-dashboard.md` |
| 3 | BTC-SPX 30-Day Rolling Correlation Tracker | 45901608 | 88.60 | cr-regime-btc | calculation | `2026-03-22-btc-spx-30d-rolling-correlation-tracker.md` |

All 3 cards status confirmed `spec_ready` in Supabase with full prompt text and prompt_file path stored.

---

## Build Order Recommendation

### Phase A — Foundation (build first)
**Card 2: Multi-Asset Regime Classifier Dashboard** (Priority 92.00, ~8 hours)

Build this first because:
- It creates `market_regime_snapshot` — the table that Card 1 (Sentinel) writes escalation promotions into
- It provides the composite regime scoring engine that Card 3's BTC correlation feeds into
- It has the most self-contained data pipeline (no dependency on either other card)
- Unblocks the REPE, Credit, and PDS cross-vertical context hooks that Cards 1 and 3 also rely on

**Deliverables:**
- `public.market_regime_snapshot` table
- `backend/app/services/market_regime_engine.py`
- `GET /api/v1/market/regime/latest` + `GET /api/v1/market/regime/history`
- `repo-b/src/components/market/RegimeClassifierWidget.tsx`

---

### Phase B — Correlation Signal (build second)
**Card 3: BTC-SPX 30-Day Rolling Correlation Tracker** (Priority 88.60, ~6 hours)

Build second because:
- Fully self-contained — reads only `fact_market_timeseries`, no dependency on Card 1 or Card 2
- Its output (rolling correlation value) should feed the crypto signal row in `RegimeClassifierWidget` from Phase A
- Lightweight: 1 new table, 1 new service, 2 new routes, 1 new chart component
- Zero external API dependencies (all data from existing tables)

**Deliverables:**
- `public.btc_spx_correlation` table
- `backend/app/services/btc_spx_correlation_service.py`
- `GET /api/v1/market/correlation/btc-spx` + `GET /api/v1/market/correlation/btc-spx/latest`
- `repo-b/src/components/market/BtcSpxCorrelationChart.tsx`
- Wire correlation value into `RegimeClassifierWidget` crypto signal row (additive prop only)

---

### Phase C — Sentinel (build third)
**Card 1: Regime Escalation Sentinel** (Priority 98.70, ~10 hours)

Build last despite highest priority score because:
- Depends on `market_regime_snapshot` existing (created in Phase A) for the stress-promotion write
- The SSE streaming endpoint (`/api/v1/market/alerts/stream`) requires the most careful implementation
- Frontend components (`RegimeEscalationBanner`, `RegimeAlertFeed`) are more complex than Phase B
- Once Phases A and B are live, the Sentinel completes the full real-time regime monitoring stack

**Deliverables:**
- `public.regime_alerts` table
- `public.regime_sentinel_config` table + default threshold seed rows
- `backend/app/services/regime_sentinel_service.py`
- 5 new routes (latest alerts, acknowledge, config GET/PUT, SSE stream)
- `repo-b/src/components/market/RegimeEscalationBanner.tsx`
- `repo-b/src/components/market/RegimeAlertFeed.tsx`
- Background polling scheduler (APScheduler or Railway cron, 15-min interval, market hours only)

---

## Estimated Effort

| Card | Estimated Hours | Data Layer | Backend | Frontend | Scheduler |
|---|---|---|---|---|---|
| Multi-Asset Regime Classifier Dashboard | 8h | 1h | 3h | 3h | 1h |
| BTC-SPX 30-Day Rolling Correlation Tracker | 6h | 1h | 2h | 2.5h | 0.5h |
| Regime Escalation Sentinel | 10h | 1.5h | 3.5h | 3h | 2h |
| **Total** | **24h** | **3.5h** | **8.5h** | **8.5h** | **3.5h** |

---

## Cross-Vertical Impact Matrix

| Feature | → REPE | → Credit | → PDS | Requires Protected Surface? |
|---|---|---|---|---|
| Regime Classifier Dashboard | ✅ Regime label in underwriting context | ✅ Tightening advisory on Risk-Off | ✅ Market conditions summary | ❌ No |
| BTC-SPX Correlation Tracker | ❌ No direct hook | ✅ Crypto collateral haircut signal | ❌ No direct hook | ❌ No |
| Regime Escalation Sentinel | ✅ Escalation advisory on 2+ triggers | ✅ Stress advisory on 2+ triggers | ✅ Market stress advisory on 2+ triggers | ❌ No (UPDATE latest regime row only) |

All three features are **additive only**. No existing service files are modified. The Sentinel's stress promotion is a single-row label UPDATE to `market_regime_snapshot` (a new table from Phase A) — it does not touch any protected surface.

---

## Shared Infrastructure Requirements

Before or during Phase A, verify the following are available:

1. **`FRED_API_KEY`** — required by Regime Classifier and Sentinel. Add to Railway + Vercel env if not already present.
2. **`fact_market_timeseries`** — must contain recent BTC-USD, ^GSPC, ^VIX, and DX-Y.NYB daily close data. Verify data freshness before Phase B/C builds.
3. **`sse-starlette`** — required for the SSE streaming endpoint in Phase C. Add to `requirements.txt` if not present.
4. **`scipy` or `numpy`** — required for Pearson correlation in Phase B. Verify availability in the backend environment.
5. **Scheduler infrastructure** — verify APScheduler or Railway cron is configured and functional before Phase C deployment.

---

## Supabase Verification

All 3 cards confirmed updated in `public.trading_feature_cards`:

```
d8d20773 | Regime Escalation Sentinel            | spec_ready | 98.70 | 2026-03-24
c61eb780 | Multi-Asset Regime Classifier Dashboard| spec_ready | 92.00 | 2026-03-22
45901608 | BTC-SPX 30-Day Rolling Correlation     | spec_ready | 88.60 | 2026-03-24
```

---

## Prompt Files Written

```
docs/market-features/prompts/2026-03-22-regime-escalation-sentinel.md           (new — 98.70)
docs/market-features/prompts/2026-03-22-multi-asset-regime-classifier-dashboard.md (existing — 92.00)
docs/market-features/prompts/2026-03-22-btc-spx-30d-rolling-correlation-tracker.md (new — 88.60)
```
