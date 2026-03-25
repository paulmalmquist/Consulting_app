# Market Rotation Engine — Phase 3 Build Prompts
**Generated:** 2026-03-24
**Task:** fin-feature-builder (scheduled)
**Cards Converted:** 3 (confirmed spec_ready, prompts validated)
**Regime Context:** RISK_OFF_DEFENSIVE (unchanged since 2026-03-22 — high confidence)

---

## Cards Processed Today

| # | Title | Card ID | Priority | Segment | Gap Type | Est. Hours | Prompt File |
|---|---|---|---|---|---|---|---|
| 1 | Regime Escalation Sentinel | d8d20773 | 98.70 | ma-regime-classifier | alert | 10h | `2026-03-22-regime-escalation-sentinel.md` |
| 2 | Multi-Asset Regime Classifier Dashboard | c61eb780 | 92.00 | ma-regime-classifier | risk_model | 8h | `2026-03-22-multi-asset-regime-classifier-dashboard.md` |
| 3 | BTC-SPX 30-Day Rolling Correlation Tracker | 45901608 | 88.60 | cr-regime-btc | calculation | 6h | `2026-03-22-btc-spx-30d-rolling-correlation-tracker.md` |

**Note:** These same 3 cards were also top-ranked on 2026-03-23. All remain `spec_ready` with no status advancement — they are build-ready and awaiting implementation. No new `identified` cards have surpassed them in priority score as of today's run.

---

## Build Order Recommendation

### Priority 1: Multi-Asset Regime Classifier Dashboard
**Card:** c61eb780 | **Score:** 92.00 | **Effort:** 8h

Build this first. It creates the `market_regime_snapshot` table and `market_regime_engine.py` service that all other market features depend on. The Regime Escalation Sentinel (Card 1) reads from `market_regime_snapshot` to promote regime labels, and the BTC-SPX Correlation Tracker (Card 3) feeds its output into the regime engine as a crypto signal input. Without this table and service in place, the other two features cannot complete their cross-vertical hooks.

**Blockers:** None — purely additive. Requires `FRED_API_KEY` env var in Railway and Vercel.

---

### Priority 2: BTC-SPX 30-Day Rolling Correlation Tracker
**Card:** 45901608 | **Score:** 88.60 | **Effort:** 6h

Build second. Depends on `fact_market_timeseries` being populated with BTC-USD and ^GSPC symbols (existing). Creates `btc_spx_correlation` table, `btc_spx_correlation_service.py`, two routes, and `BtcSpxCorrelationChart`. The correlation value it produces feeds into the Regime Classifier Dashboard as the crypto asset class input signal, so this should be wired in before the Regime Classifier's first production compute run. No env vars beyond what's already present.

**Blockers:** Verify `scipy` or `numpy` is in `requirements.txt`.

---

### Priority 3: Regime Escalation Sentinel
**Card:** d8d20773 | **Score:** 98.70 | **Effort:** 10h

Build third despite highest priority score. Depends on `market_regime_snapshot` (from Card 2) for stress promotion logic, and benefits from the BTC correlation signal being available. Most complex build: background polling loop, SSE streaming endpoint, two new tables, two new components. Build after the data foundation is established.

**Blockers:** `sse-starlette` may need to be added to `requirements.txt`. Scheduler: confirm APScheduler is available or use Railway cron fallback.

---

## Estimated Total Effort

| Phase | Hours | Description |
|---|---|---|
| Regime Classifier Dashboard | 8h | Data layer + service + 2 routes + 1 component |
| BTC-SPX Correlation Tracker | 6h | Data layer + service + 2 routes + 1 component |
| Regime Escalation Sentinel | 10h | Data layer + service + 5 routes + 2 components + SSE + scheduler |
| **Total** | **24h** | Full market intelligence data layer complete |

---

## Cross-Vertical Impact Matrix

| Vertical | Regime Classifier | BTC-SPX Tracker | Escalation Sentinel |
|---|---|---|---|
| **REPE** | Regime context injected into underwriting sessions | No direct hook | Stress advisory on 2+ trigger breach |
| **Credit** | Tightening advisory context on Risk-Off/Stress | Recoupling advisory for crypto-collateralized loans | Stress advisory on 2+ trigger breach |
| **PDS** | Market conditions context for project financing | No direct hook | Stress advisory on 2+ trigger breach |
| **Market Intelligence** | Foundation widget (RegimeClassifierWidget) | Crypto tab (BtcSpxCorrelationChart) | Alerts tab (RegimeAlertFeed) + global banner |

**No existing service code is modified in any vertical.** All cross-vertical hooks are additive context strings or advisory flags.

---

## Repo Safety Status

All three prompts comply with the repo safety contract:
- Zero modifications to REPE engines, credit decisioning services, or PDS dashboard services
- Zero ALTER on existing tables — all new tables are CREATE TABLE only
- All new backend work is isolated to new service files and new route files
- All new frontend work is new component files only
- RLS enabled on all new tables

---

## New Cards in Pipeline (from 2026-03-24 gap scan)

The `fin-gap-detection` task identified **16 new feature cards** today from segments: cr-l1-alt, eq-energy-transition, eq-factor-momentum, eq-semi-ai-accel. These will be ranked and promoted to `spec_ready` in tomorrow's fin-feature-builder run if they exceed the current top-3 priority thresholds. See `docs/market-features/2026-03-24-gaps.md` for full list.
