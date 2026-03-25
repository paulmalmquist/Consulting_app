# Market Intelligence Health Report — 2026-03-23

**Environment:** Market Intelligence Engine
**env_id:** `c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9`
**URL:** https://www.paulmalmquist.com/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets
**Checked at:** 2026-03-23 (automated fin-market-health task)
**Overall Status:** ⚠️ PARTIAL — Environment built and rendering, but live DB data not surfacing in UI

---

## Pages Checked

| Page / Tab | Status | Notes |
|---|---|---|
| Overview | ✅ RENDERS | Docs-backed landing displays. Cold-start message shown correctly. |
| Regime Classifier | ✅ RENDERS | Widget present. Shows "Transitional / 0.0% confidence / Not Found" (DB snapshots not loading). |
| Segments | ✅ RENDERS | "Active Market Segments: 0 — live segment table is still empty" (DB data not loading). |
| Intel Briefs | ✅ RENDERS | "No live intelligence briefs yet" (DB data not loading). |
| Feature Pipeline | ✅ RENDERS | "No live feature cards yet / Pipeline state not documented yet" (DB data not loading). |

All 5 tabs render without JS errors. Navigation and tab switching work correctly.

---

## Critical Issue: Supabase Not Connected in Production

**Severity: HIGH**

A yellow warning banner is displayed across all tabs:

> "Supabase is not configured in this checkout, so the page is rendering the docs-backed intelligence layer only."

This means the production Vercel deployment does not have the Supabase environment variables wired to project `ozboonlsplroialdwuxj`. All live DB widgets fall back to docs-backed placeholders, which is why the UI shows 0 everywhere despite the database containing real data.

---

## Data Integrity: DB vs UI

| Metric | DB (Supabase) | UI Display | Match? |
|---|---|---|---|
| Active segments | **34** | 0 | ❌ MISMATCH |
| Intel briefs (last 7 days) | **4** | 0 | ❌ MISMATCH |
| Feature cards (identified) | **6** | 0 | ❌ MISMATCH |
| Feature cards (spec_ready) | **5** | 0 | ❌ MISMATCH |
| Feature cards total | **11** | 0 | ❌ MISMATCH |

### DB Detail

**market_segments (34 active)** — breakdown by category:
- `crypto`: 8 segments (tiers 1–2) — AI & DePIN, Alt-L1, BTC On-Chain, DeFi Core, ETH Ecosystem, L2 Scaling, Meme & Social, RWA
- `derivatives`: 4 segments — Crypto Derivatives Flow, Equity Options Flow, Options Strategy Ideas, Volatility Surface
- `equities`: 16 segments — Data Center REITs, Energy Transition, Homebuilders, Momentum Factor, Semiconductors/AI, and 11 others
- `macro`: 6 segments — Credit Spreads, Fed Policy, Global Liquidity, Major FX, Multi-Asset Regime Classifier, Rates & Yield Curve

**market_segment_intel_brief (4 briefs, all run_date 2026-03-23):**
- `cr-regime-btc` — RISK_OFF_DEFENSIVE, composite score 4.40
- `cr-regime-eth` — RISK_OFF_DEFENSIVE, composite score 4.20
- `dr-options-flow` — RISK_OFF_DEFENSIVE, composite score 6.75
- `dr-crypto-derivatives` — RISK_OFF_DEFENSIVE, composite score 6.50

**trading_feature_cards (11 total):**
- `identified`: 6 cards, avg priority score 62.0
- `spec_ready`: 5 cards, avg priority score 90.3

---

## Additional Issues Found

### 1. `docs/LATEST.md` Missing
The Pipeline Health panel on the Overview tab reports:
> "docs/LATEST.md is missing; latest-doc precedence fell back to directory sorting."

The market regime report, rotation selection file, and market digest are also missing from `docs/`. The docs-backed landing is degraded because the scheduled intelligence tasks haven't written their first outputs to the market-specific folders yet.

### 2. Regime Classifier Shows No Snapshots
The Regime Classifier tab shows no computed regime snapshots. The `fin-research-sweep` scheduled task needs to run and write regime data to the DB before this widget populates.

### 3. "Unknown" Pipeline State Badge
The top-right badge shows "Unknown" — expected for day-one cold start, but should clear after first sweep runs.

### 4. Cross-Vertical Alerts — Not Visible
No cross-vertical alerts displayed. This is expected at cold start (no briefs have surfaced cross-vertical signals yet), but worth noting.

---

## Root Cause Summary

Two distinct cold-start gaps:

1. **Supabase env vars not wired in Vercel** — live DB widgets cannot query `ozboonlsplroialdwuxj`. This is the highest-priority fix; it blocks all live data from rendering.
2. **`fin-research-sweep` has not run yet** — regime snapshots, rotation selection files, and market digest docs have not been generated. The docs-backed layer falls back gracefully but is sparse.

---

## Priority Items for fin-coding-session Tomorrow

### P0: Wire Supabase to Vercel Production (BLOCKING)
The `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and any server-side `SUPABASE_SERVICE_ROLE_KEY`) for project `ozboonlsplroialdwuxj` must be added to the `consulting-app` Vercel project environment variables. Without this, 34 segments, 4 briefs, and 11 feature cards sitting in the DB are invisible to the UI.

**Steps:**
1. Go to Vercel → consulting-app → Settings → Environment Variables
2. Add `NEXT_PUBLIC_SUPABASE_URL=https://ozboonlsplroialdwuxj.supabase.co`
3. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Supabase project settings → API)
4. Redeploy

### P1: Run `fin-research-sweep` to Populate Docs Layer
After Supabase is wired, trigger the first `fin-research-sweep` run to:
- Write regime snapshot to DB (populates Regime Classifier widget)
- Generate `docs/market-digests/` output files (populates docs-backed landing)
- Generate `docs/LATEST.md` to clear the source health warning

### P2: Verify `docs/LATEST.md` Generation
The market intelligence environment depends on `docs/LATEST.md` for its docs-backed content layer. Confirm the scheduled 7:30 AM task that writes this file is targeting the correct path.

---

## What's Working Well

- All 5 tabs render without errors — the page shell, tab navigation, and cold-start fallback messaging all function correctly.
- The docs-backed landing design is solid: it explains the cold-start state clearly and doesn't show broken widgets.
- The DB schema is fully populated with 34 segments across 4 categories and has already received its first 4 intel briefs from today's sweep (the DB-side pipeline is running, just not surfacing in UI).
- Feature card pipeline has 11 cards (6 identified, 5 spec_ready) ready to display once Supabase is connected.
