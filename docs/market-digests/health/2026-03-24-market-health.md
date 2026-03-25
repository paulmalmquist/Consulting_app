# Market Intelligence Environment Health Report
**Date:** 2026-03-24
**Environment:** Market Intelligence Engine (`c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9`)
**Industry:** `market_rotation` / `financial_markets`
**Checker:** fin-market-health scheduled task

---

## Summary

| Check | Status | Notes |
|---|---|---|
| Environment record in DB | ✅ PASS | `is_active = true`, created 2026-03-22 |
| UI page load | ⚠️ CANNOT VERIFY | Auth wall — production requires access code login; browser cannot authenticate autonomously |
| Segment count (DB) | ✅ PASS | 34 active segments |
| Intelligence briefs (last 7 days) | ✅ PASS | 8 briefs run |
| Regime tags current | ✅ PASS | 4 briefs on 2026-03-24; 4 on 2026-03-23 |
| Feature card pipeline | ✅ PASS | 17 total cards (12 identified, 5 spec_ready) |
| Cross-vertical alerts | ✅ PASS | 6 cross-vertical cards present |

**Overall:** DATA LAYER HEALTHY — UI cannot be verified without auth.

---

## Pages Checked

### UI (Browser)
- **Route:** `/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets`
- **Production host:** `consulting-50qsa6u81-paulmalmquists-projects.vercel.app` (latest READY deploy, SHA `3347597`)
- **Result:** ❌ REDIRECTED TO LOGIN — The environment requires an access code. The browser automation cannot complete authentication. UI sections (Regime Status widget, Segment Grid render, Intelligence Briefs list, Feature Card Pipeline view, Charts, Alerts panel) **could not be visually verified**.
- **Priority:** fin-coding-session should consider a health-check bypass route or service-account token for automated testing.

---

## Data Integrity: DB vs Expected

### Segment Grid
| Metric | Expected | Actual | Status |
|---|---|---|---|
| Active segments | 34 | 34 | ✅ PASS |

**Category breakdown (all 34 active):**
- `crypto` — 8 segments (7 tier-1, 1 tier-2): AI & DePIN, Alt-L1 Platforms, BTC On-Chain Regime, DeFi Core Protocols, ETH Ecosystem Health, L2 Scaling Solutions, Real World Assets (RWA), Meme & Social Tokens
- `derivatives` — 4 segments: Crypto Derivatives Flow, Equity Options Flow, Volatility Surface Analysis, Options Strategy Ideas
- `equities` — 16 segments across sector_micro_niche, factor_style, event_driven subcategories
- `macro` — 6 segments: Fed Policy & Liquidity, Rates & Yield Curve, Credit Spreads & Risk Premia, Multi-Asset Regime Classifier, Global Liquidity & Capital Flows, Major FX Crosses

### Intelligence Briefs (Last 7 Days)
| Metric | Expected | Actual | Status |
|---|---|---|---|
| Briefs (last 7 days) | ≥1 | 8 | ✅ PASS |

**Recent briefs (last 10):**
| Segment | Run Date | Regime Tag | Composite Score |
|---|---|---|---|
| Alt-L1 Platforms | 2026-03-24 | RISK_OFF_DEFENSIVE | 4.60 |
| Semiconductor / AI Accelerators | 2026-03-24 | RISK_OFF_DEFENSIVE | 5.10 |
| Momentum Factor Screen | 2026-03-24 | RISK_OFF_DEFENSIVE | 4.20 |
| Energy Transition / Grid | 2026-03-24 | RISK_OFF_DEFENSIVE | 5.70 |
| BTC On-Chain Regime | 2026-03-23 | RISK_OFF_DEFENSIVE | 4.40 |
| ETH Ecosystem Health | 2026-03-23 | RISK_OFF_DEFENSIVE | 4.20 |
| Equity Options Flow | 2026-03-23 | RISK_OFF_DEFENSIVE | 6.75 |
| Crypto Derivatives Flow | 2026-03-23 | RISK_OFF_DEFENSIVE | 6.50 |

**Note:** All 8 recent briefs carry `RISK_OFF_DEFENSIVE` regime tag. Composite scores range 4.20–6.75. No `RISK_ON` or neutral regime found in recent window — this may reflect genuine market conditions or indicate the regime classifier hasn't been triggered yet for all segments.

**Coverage gap:** Only 8 of 34 segments have briefs in the last 7 days (24% coverage). 26 segments have no recent brief. This is expected if the rotation cadence varies by tier, but worth monitoring.

### Feature Card Pipeline
| Status | Gap Categories | Count | Top Priority Score |
|---|---|---|---|
| `identified` | visualization (3), data_source (3), calculation (3), screening (1), cross_vertical (1), alert (1) | **12** | 83.35 |
| `spec_ready` | alert (1), risk_model (1), calculation (1), cross_vertical (1), visualization (1) | **5** | 98.70 |
| `built` | — | **0** | — |

**Total:** 17 cards. No cards in `built` status — all are either identified or spec'd but not yet implemented.

### Cross-Vertical Alerts
6 cross-vertical cards present. Top priority items:

| Title | Category | Priority | Status |
|---|---|---|---|
| Regime Escalation Sentinel | alert | 98.70 | spec_ready |
| Multi-Asset Regime Classifier Dashboard | risk_model | 92.00 | spec_ready |
| BTC-SPX 30-Day Rolling Correlation Tracker | calculation | 88.60 | spec_ready |
| RWA Tokenization Pipeline Monitor | cross_vertical | 85.00 | spec_ready |
| M2 Expansion & Liquidity Floor Dashboard | data_source | 83.35 | identified |
| Regime-to-Credit Stress Scenario Bridge | cross_vertical | 82.60 | identified |

---

## Bugs Found

None at the data layer. The data schema is correctly structured and populated.

**Schema note:** The `market_segments` table uses `segment_name` (not `name`) and `market_segment_intel_brief` uses `regime_tag` (not `regime`). The task's reference SQL had minor column name mismatches — these are documentation issues, not code bugs.

---

## Priority Items for Tomorrow's Planning / Coding

### P0 — Blocking Automated Health Checks
1. **Auth wall blocks browser health checks.** The `/markets` route redirects to login before the health checker can observe the UI. Options:
   - Add a `?health_token=<secret>` bypass that renders a simplified status page
   - Create a service-account session cookie the health task can use
   - Add a `/api/v1/health/markets` endpoint that returns a JSON summary without auth

### P1 — Feature Gaps to Build
2. **Regime Escalation Sentinel** (priority 98.70, spec_ready) — Highest priority card, cross-vertical alert. Should be first build target.
3. **Multi-Asset Regime Classifier Dashboard** (priority 92.00, spec_ready) — Critical for the dashboard Regime Status section.
4. **BTC-SPX 30-Day Rolling Correlation Tracker** (priority 88.60, spec_ready) — spec complete, ready to build.

### P2 — Coverage Gaps
5. **Brief coverage is 24%** — Only 8 of 34 segments have briefs in the last 7 days. Verify rotation scheduler is running for all tier-1 segments. Expected daily cadence for tier-1 may not be executing.
6. **No built cards** — 17 cards are identified/spec'd but none are built. The build pipeline hasn't started. This is the environment's primary gap.

---

## Environment Record
```
env_id:    c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9
client:    Market Intelligence Engine
industry:  market_rotation (financial_markets)
active:    true
created:   2026-03-22
notes:     34 segments / equities + crypto + derivatives + macro / cross-vertical to REPE, Credit, PDS
```

---

*Generated by fin-market-health scheduled task — 2026-03-24*
