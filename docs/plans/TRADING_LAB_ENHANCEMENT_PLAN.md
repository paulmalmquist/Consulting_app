# Trading Lab Enhancement Plan

## Market Intelligence Engine → Full-Stack Crypto Trading Lab

**Created:** 2026-03-28
**Source analysis:** Winston Trading Lab: Market Intelligence Engine Analysis and Enhancement Recommendations
**Status:** PLANNING — ready for phased execution

---

## Current State Summary

### What's Built

| Layer | Component | Status |
|---|---|---|
| Schema | 10 tables (themes, signals, hypotheses, positions, perf snapshots, research, daily briefs, watchlist, price snapshots, hypothesis_signals) | LIVE in Supabase, RLS enabled |
| Backend | `market_regime_engine.py` — 4-pillar composite (equities 30%, rates 25%, credit 25%, crypto 20%) | LIVE |
| Backend | `btc_spx_correlation_service.py` — 30-day rolling Pearson r with zero-crossing detection | LIVE |
| Backend | Regime + correlation routes (`/api/v1/market/regime/*`, `/api/v1/market/correlation/*`) | LIVE |
| Frontend | Trading lab page — 7 tabs, light/dark mode toggle, regime widget, BTC-SPX chart | LIVE |
| Frontend | `RegimeClassifierWidget` — full + compact modes, 90-day history, cross-vertical implications | LIVE |
| Frontend | `BtcSpxCorrelationChart` — line chart with regime signals, decoupling zones | LIVE |
| Types | `trading-lab/types.ts` — 505 lines, full CRUD input/output types for all entities | LIVE |
| API | `GET /api/v1/trading` — read-only aggregator for all 8 entity types | LIVE |
| Scheduled | `fin-rotation-scheduler` (4 AM), `fin-research-sweep` (4:30 AM), `fin-regime-classifier` (5 AM) | ENABLED |
| Scheduled | `fin-gap-detection` (9 PM), `fin-feature-builder` (9:30 PM), `fin-coding-session` (1:30 PM) | ENABLED |
| Scheduled | `fin-market-health` (6:30 PM weekdays) | ENABLED |
| Data | `fact_market_timeseries` — SPX, VIX, US2Y, US10Y, BTC-USD, FEDFUNDS, DXY | Populated |

### What's Missing

| Gap | Impact |
|---|---|
| No write API — positions, signals, hypotheses are read-only | Cannot manage trades from UI |
| No MCP tools for market intelligence | AI agents can't query regime or correlation data |
| No on-chain data feeds (whale flows, exchange inflows, funding rates) | Crypto signal depth limited to BTC-SPX correlation |
| No derivatives intelligence (open interest, liquidation levels, options skew) | Missing sentiment layer |
| No prediction market feeds (Kalshi, Polymarket) | Missing forward-looking event probabilities for regime classification |
| No sector/narrative tracking engine | Can't detect DeFi 2.0, DePIN, RWA capital rotation |
| No automated risk management (stop-loss triggers, circuit breakers) | Paper trading is manual only |
| No position entry UI | All positions require direct DB inserts |
| Research tab has no on-chain or derivative notes | Research is equity/macro only |
| Watchlist has no automated price updates | Prices are stale unless manually refreshed |
| `CAPABILITY_INVENTORY.md` doesn't document trading lab | Discovery gap for other agents |

---

## Implementation Plan

### Guiding Principles

1. **Build on what exists.** The schema, types, and scheduled task pipeline are already wired. Enhancements extend these rather than replacing them.
2. **Scheduled tasks are the intelligence engine.** New data feeds and analytics get their own scheduled tasks that feed into the existing rotation → research → gap → build pipeline.
3. **MCP tools unlock AI reasoning.** Every new data source should be queryable by Winston's AI agents via MCP, not just rendered in the UI.
4. **Risk management is not optional.** Any position tracking or execution capability must ship with automated stop-loss and exposure monitoring.
5. **Cross-vertical value.** Crypto intelligence feeds back into REPE underwriting (crypto-collateral haircuts), credit decisioning (macro regime), and PDS demand signals.

---

### Phase 1: Foundation — Write API + MCP Tools + Position Management

**Timeline:** Week 1
**Priority:** P0 — unblocks everything else
**Builds on:** Existing schema, types, routes

#### 1A. Trading Write API

Create `backend/app/services/trading_write.py` and add routes to `backend/app/routes/trading.py`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/trading/signals` | POST | Create signal (manual or AI-generated) |
| `/api/v1/trading/signals/{id}` | PATCH | Update signal strength, status, evidence |
| `/api/v1/trading/hypotheses` | POST | Create hypothesis with proves_right/wrong |
| `/api/v1/trading/hypotheses/{id}` | PATCH | Update status, confidence, outcome |
| `/api/v1/trading/positions` | POST | Open position linked to hypothesis |
| `/api/v1/trading/positions/{id}` | PATCH | Update current price, close position |
| `/api/v1/trading/positions/{id}/close` | POST | Close with exit price, realized PnL calc |
| `/api/v1/trading/watchlist` | POST | Add ticker to watchlist |
| `/api/v1/trading/watchlist/{id}` | PATCH | Update alerts, notes, prices |
| `/api/v1/trading/research` | POST | Create research note |
| `/api/v1/trading/briefs` | POST | Create/update daily brief |
| `/api/v1/trading/performance` | POST | Snapshot daily performance |

**Validation:** Pydantic models from existing types. Position close auto-calculates realized PnL. Hypothesis links validated.

#### 1B. Market Intelligence MCP Tools

Register in `backend/app/mcp/` under a new `market_intelligence` category:

| Tool | Description |
|---|---|
| `get_market_regime` | Return current regime snapshot (label, confidence, pillar scores, cross-vertical implications) |
| `get_regime_history` | Return N-day regime history for trend analysis |
| `get_btc_spx_correlation` | Return latest correlation value, crossing direction, advisory |
| `get_trading_signals` | Query active signals by asset class, direction, strength threshold |
| `get_open_positions` | Return all open positions with current PnL |
| `get_hypothesis_status` | Check if a hypothesis is confirmed/invalidated |
| `create_trading_signal` | AI agent can register a new signal from research |
| `update_position_price` | Mark a position to current market price |
| `get_watchlist_alerts` | Return watchlist items where price has breached alert levels |
| `get_prediction_market_odds` | Return current probabilities for tracked events by category (fed_rates, recession, geopolitical, crypto) |
| `get_prediction_market_movers` | Return events with largest probability shifts in last 24h |

**Why this matters:** The 3 PM autonomous coding session, morning brief, and AI chat can all query market conditions. Winston can say "the current regime is risk-off with BTC-SPX correlation at 0.74 — I'd be cautious on crypto collateral" instead of just showing a dashboard.

#### 1C. Position Management UI

Add to the trading lab page:

- **New Position** button → modal with ticker, direction, entry price, size, stop-loss, take-profit, linked hypothesis
- **Close Position** action on each open position row → modal with exit price, auto-calculated P&L
- **Edit Position** → update stop-loss, take-profit, notes
- Position rows show stop-loss distance and take-profit distance as colored bars

**File changes:** `repo-b/src/app/lab/env/[envId]/markets/page.tsx` (add modals), `repo-b/src/lib/trading-lab/api.ts` (new write functions)

---

### Phase 2: Data Intelligence — On-Chain + Derivatives + Price Feeds

**Timeline:** Weeks 2–3
**Priority:** P1 — transforms signal depth
**Builds on:** Phase 1 write API and MCP tools

#### 2A. Automated Watchlist Price Updates

**New scheduled task: `fin-price-updater`**
- Schedule: Every 30 minutes during market hours (9:30 AM – 4 PM ET weekdays), every hour for crypto (24/7)
- Action: Fetch current prices for all active watchlist tickers and open position tickers from a free API (Yahoo Finance via `yfinance`, CoinGecko for crypto)
- Updates: `trading_watchlist.current_price`, `trading_watchlist.price_change_1d/1w`, `trading_positions.current_price`, `trading_positions.unrealized_pnl`
- Triggers: Check alert thresholds — if price breaches `alert_above` or `alert_below`, write an alert signal

**Schema addition:** `market_price_cache` table for raw price storage:
```sql
CREATE TABLE market_price_cache (
    ticker TEXT NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    volume NUMERIC(18,2),
    change_1d NUMERIC(10,4),
    change_1w NUMERIC(10,4),
    source TEXT DEFAULT 'yfinance',
    fetched_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (ticker, fetched_at)
);
```

#### 2B. On-Chain Data Feed

**New scheduled task: `fin-onchain-sweep`**
- Schedule: Every 2 hours (crypto markets are 24/7)
- Data sources (free tier): Blockchain.com API (BTC mempool, whale txns), Etherscan API (ETH gas, large transfers), DeFiLlama (TVL by protocol, chain flows)
- Writes to: New `onchain_signal` table and creates `trading_signals` with `category: 'onchain'`

**New schema: `onchain_signals`**
```sql
CREATE TABLE onchain_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    chain TEXT NOT NULL,           -- 'bitcoin', 'ethereum', 'solana'
    metric_type TEXT NOT NULL,     -- 'whale_flow', 'exchange_inflow', 'tvl_change', 'gas_spike'
    value NUMERIC(18,6),
    direction TEXT,                -- 'bullish', 'bearish', 'neutral'
    magnitude TEXT,                -- 'low', 'medium', 'high', 'extreme'
    raw_data JSONB,
    detected_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

**Signals generated:**
- Whale wallet movement > $10M → `whale_flow` signal
- Exchange inflow spike > 2σ from 30-day mean → `exchange_inflow` bearish signal
- TVL change > 5% in 24h for a protocol → `tvl_change` signal
- ETH gas spike > 100 gwei sustained → `gas_spike` signal (indicates on-chain activity surge)

#### 2C. Derivatives Intelligence Feed

**New scheduled task: `fin-derivatives-sweep`**
- Schedule: Every 4 hours
- Data sources (free tier): CoinGlass API (funding rates, open interest, liquidation data), Deribit public API (options skew for BTC/ETH)
- Writes to: New `derivatives_snapshot` table and creates `trading_signals` with `category: 'technical'`

**New schema: `derivatives_snapshot`**
```sql
CREATE TABLE derivatives_snapshot (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    ticker TEXT NOT NULL,
    funding_rate NUMERIC(10,6),        -- perpetual swap funding rate
    open_interest NUMERIC(18,2),       -- total OI in USD
    oi_change_24h NUMERIC(10,4),       -- % change
    long_short_ratio NUMERIC(8,4),
    liquidations_24h NUMERIC(18,2),    -- total liquidations USD
    liq_long_pct NUMERIC(6,2),         -- % of liq that were longs
    options_put_call_ratio NUMERIC(8,4),
    max_pain_price NUMERIC(18,2),
    iv_rank NUMERIC(6,2),              -- implied volatility percentile
    snapshot_at TIMESTAMPTZ DEFAULT now()
);
```

**Signals generated:**
- Funding rate > 0.05% → overheated longs signal (bearish)
- Funding rate < -0.03% → short squeeze setup (bullish)
- OI spike + price flat → volatility compression (direction TBD)
- Liquidation cascade > $100M in 1h → regime stress signal
- Put/call ratio > 1.5 → fear signal

#### 2D. Prediction Market Sentiment Feed (Kalshi + Polymarket)

**New scheduled task: `fin-prediction-markets`**
- Schedule: Every 2 hours (both platforms update continuously; 2h cadence balances freshness vs. rate limits)
- Data sources (public, no API key required for read):
  - **Kalshi** (US-regulated, macro events): `GET /markets` and `GET /markets/{ticker}/candlesticks` from `https://api.elections.kalshi.com/trade-api/v2`. Covers Fed rate decisions, recession probability, geopolitical events, CPI surprises, government shutdown odds.
  - **Polymarket** (decentralized, broader coverage): CLOB API `GET /price`, `GET /prices-history` and Gamma API `GET /events` from `https://gamma-api.polymarket.com`. Covers crypto-specific events, regulatory outcomes, ETF approvals, election markets, geopolitical escalation.
- Rate limits: Kalshi public endpoints are per-key; Polymarket public is 60/min (CLOB) and 4,000/10s (Gamma). Both are generous for our 2-hour polling cadence.
- Authentication: **None required** — both platforms expose market data publicly. API keys only needed for placing trades (not planned).
- Python SDKs: `kalshi-python` (official) for Kalshi, `py-clob-client` (official) for Polymarket
- Writes to: New `prediction_market_snapshot` table and creates `trading_signals` with `category: 'sentiment'`

**New schema: `prediction_market_snapshot`**
```sql
CREATE TABLE prediction_market_snapshot (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    platform TEXT NOT NULL,              -- 'kalshi' or 'polymarket'
    market_id TEXT NOT NULL,             -- platform-specific market identifier
    market_title TEXT NOT NULL,          -- human-readable event title
    category TEXT NOT NULL,              -- 'fed_rates', 'recession', 'crypto_regulatory', 'geopolitical', 'macro', 'crypto_specific'
    yes_price NUMERIC(6,4),             -- implied probability (0.00–1.00)
    no_price NUMERIC(6,4),
    volume_24h NUMERIC(18,2),
    open_interest NUMERIC(18,2),
    prev_yes_price NUMERIC(6,4),        -- previous snapshot for delta calc
    price_delta NUMERIC(6,4),           -- change since last snapshot
    settlement_date TIMESTAMPTZ,
    is_settled BOOLEAN DEFAULT false,
    raw_data JSONB,                      -- full API response for audit
    snapshot_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pms_tenant_cat ON prediction_market_snapshot(tenant_id, category);
CREATE INDEX idx_pms_snapshot_at ON prediction_market_snapshot(snapshot_at DESC);
```

**Tracked market categories and signal generation:**

| Category | Kalshi examples | Polymarket examples | Signal trigger |
|---|---|---|---|
| Fed rates | "Fed rate decision June 2026", "Next rate cut timing" | "Will Fed cut rates by July?" | Probability shift > 10pp in 24h → `sentiment` signal |
| Recession | "US recession in 2026" | "US GDP negative Q2 2026" | Probability > 60% → bearish macro signal; < 30% → bullish |
| Crypto regulatory | "SEC approves SOL ETF" | "Crypto legislation by Q3" | Probability shift > 15pp → regulatory momentum signal |
| Geopolitical | "Iran conflict escalation", "China-Taiwan tension" | "Military action in 2026" | Probability > 40% → risk-off regime input |
| Macro events | "CPI above 3%", "Unemployment above 5%" | "S&P 500 above 7000 by Dec" | Large volume + probability shift → macro signal |
| Crypto-specific | — | "BTC above $150K", "ETH above $10K" | Aligns with position hypotheses for conviction scoring |

**Regime classifier integration:**
- Add prediction market data as a 5th pillar input to `market_regime_engine.py`:
  - Current 4 pillars: equities (30%), rates (25%), credit (25%), crypto (20%)
  - New weighting: equities (25%), rates (22%), credit (22%), crypto (18%), prediction markets (13%)
  - Prediction market score: composite of recession prob (inverse), Fed dovishness prob, geopolitical risk (inverse)
  - This gives the regime classifier forward-looking sentiment alongside backward-looking price data

**Cross-vertical value:**
- REPE underwriting: recession probability feeds into cap rate assumptions
- Credit decisioning: Fed rate expectations inform DTI stress testing
- PDS demand: geopolitical risk and macro confidence affect construction pipeline forecasts

**Frontend: Prediction Market Panel**
- New card on Overview tab: "Market Odds" showing top 6 tracked events with probability bars, 24h delta arrows, and volume badges
- Color coding: > 70% probability = high confidence (strong color), 40-60% = contested (amber), < 30% = unlikely (muted)
- Click-through to detail view showing probability history chart (from candlestick data)

#### 2E. Frontend: Derivatives, On-Chain & Prediction Market Panels

Add three new cards to the Overview tab:
- **On-Chain Pulse** — latest whale flows, exchange inflows, TVL changes with directional badges
- **Derivatives Dashboard** — funding rates heatmap (BTC, ETH, SOL), OI bar, liquidation cascade timeline
- **Market Odds** — top prediction market events from Kalshi + Polymarket with probability bars and deltas

Add to Signals tab:
- New filter chips: `onchain`, `derivatives`, `sentiment` alongside existing `fundamental`, `technical`, `macro`, `cross-asset`

---

### Phase 3: Intelligence — Sector Rotation + Narrative Engine

**Timeline:** Weeks 3–4
**Priority:** P1 — moonshot discovery capability
**Builds on:** Phase 2 on-chain data, Phase 1 MCP tools

#### 3A. Sector & Narrative Tracking Engine

**New scheduled task: `fin-narrative-scanner`**
- Schedule: Daily 5:30 AM (after regime classifier)
- Action: Web search for capital flow signals across 6 crypto sectors:
  1. **DeFi 2.0** — TVL trends, protocol launches, yield innovations
  2. **DePIN** — hardware network growth, partnership announcements
  3. **RWA Tokenization** — institutional adoption, regulatory milestones
  4. **AI Protocols** — compute token launches, GPU marketplace growth
  5. **Layer 2 / New Chains** — gas metrics, developer activity, bridge volumes
  6. **Meme / Community** — social velocity, volume spikes, influencer signals
- Output: Sector scores (0-100 momentum), narrative direction (emerging/peaking/fading), top projects per sector

**New schema: `sector_narrative`**
```sql
CREATE TABLE sector_narrative (
    narrative_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sector TEXT NOT NULL,
    narrative_label TEXT NOT NULL,
    momentum_score NUMERIC(5,2),       -- 0-100
    phase TEXT,                         -- 'emerging', 'accelerating', 'peaking', 'fading'
    capital_flow_direction TEXT,        -- 'inflow', 'stable', 'outflow'
    top_projects JSONB,                -- [{name, ticker, signal, catalyst}]
    evidence JSONB,                    -- sources, links, quotes
    cross_vertical_implications JSONB, -- REPE, credit, PDS hooks
    detected_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

#### 3B. Tokenomics & Project Fundamentals Module

**New scheduled task: `fin-project-fundamentals`**
- Schedule: Weekly Sunday 6 AM
- For each watchlist crypto ticker + top projects from narrative scanner:
  - Fetch: supply schedule, vesting periods, staking yields, governance info (from CoinGecko, DeFiLlama)
  - Score: sustainable value vs. hype (based on TVL/market cap ratio, developer commits, revenue generation)
- Output: Project scorecard written to `trading_research_notes` with `note_type: 'analysis'`

#### 3C. Frontend: Narratives Tab

Replace or augment the Research tab:
- **Sector Heatmap** — 6 sectors with momentum scores, color-coded by phase
- **Narrative Cards** — expandable cards per narrative with top projects, evidence, catalysts
- **Capital Flow Waterfall** — where money is moving across sectors (weekly view)

---

### Phase 4: Risk Management & Automation

**Timeline:** Weeks 4–5
**Priority:** P1 — required before any real position sizing
**Builds on:** Phase 1 write API, Phase 2 price feeds

#### 4A. Automated Risk Controls

**New backend service: `trading_risk_engine.py`**

| Control | Trigger | Action |
|---|---|---|
| Stop-loss monitor | Position price crosses stop_loss | Auto-close position, create research note "stopped out" |
| Take-profit monitor | Position price crosses take_profit | Auto-close position |
| Max drawdown circuit breaker | Portfolio equity drops > X% from peak | Pause all new position creation, alert |
| Exposure limit | Total notional > configurable limit | Block new positions until exposure reduced |
| Single-position limit | Any position > Y% of equity | Warn on creation, block if > 2Y% |
| Correlation risk | Multiple positions in same direction on correlated assets | Warning signal |

**New scheduled task: `fin-risk-monitor`**
- Schedule: Every 15 minutes during market hours
- Checks all open positions against stop-loss/take-profit levels
- Checks portfolio exposure against limits
- Writes risk alerts to a new `risk_alert` table
- Creates `trading_signals` with `category: 'risk'` for UI visibility

#### 4B. Performance Analytics Enhancement

Add to the Performance tab:
- **Drawdown chart** — max drawdown from equity peak over time
- **Risk-adjusted metrics** — Sharpe ratio, Sortino ratio, Calmar ratio
- **Win/loss distribution** — histogram of trade returns
- **Holding period analysis** — average hold time for winners vs. losers
- **Hypothesis attribution** — P&L broken down by which hypothesis generated the trade

#### 4C. Stress Testing Module

**New backend service: `trading_stress_test.py`**
- Scenario library: 2020 COVID crash, 2022 Luna collapse, 2022 FTX contagion, generic -30% BTC flash crash, yield curve inversion shock
- For each scenario: replay price moves against current open positions, calculate hypothetical P&L
- Output: stress test report as research note

**New MCP tool: `run_stress_test`**
- AI agents can request stress tests: "What happens to my portfolio if BTC drops 30%?"

---

### Phase 5: AI Intelligence Layer

**Timeline:** Weeks 5–6
**Priority:** P2 — transforms from dashboard to co-pilot
**Builds on:** All previous phases + existing AI gateway

#### 5A. Market Intelligence AI Agent

Extend the existing AI gateway (`backend/app/services/ai_gateway.py`) with a new trading-specific prompt layer:

**Capabilities:**
- "What's the current market regime and what does it mean for my positions?" → queries regime MCP tool + open positions
- "Should I be concerned about my BTC short?" → checks on-chain signals + derivatives + correlation + regime
- "What sectors are showing momentum?" → queries narrative engine + sector scores
- "Run a stress test on my portfolio" → triggers stress test service
- "Generate a daily brief" → synthesizes all data sources into `trading_daily_briefs`

**Implementation:** New prompt template in `prompts/` that gives the AI agent access to all market MCP tools with instructions to synthesize across data sources and explain reasoning.

#### 5B. Automated Daily Brief Generation

**Modify scheduled task: `fin-regime-classifier`**
- After computing regime, also generate the daily brief by:
  1. Querying all active signals, open positions, hypothesis status
  2. Checking on-chain and derivatives signals from last 24h
  3. Running narrative scanner results
  4. Composing `trading_daily_briefs` entry with regime, what_changed, key_moves, signals_fired, hypotheses_at_risk, position_pnl_summary, recommended_actions

This replaces the manual brief creation with an AI-synthesized daily intelligence report.

#### 5C. Smart Alert System

**New scheduled task: `fin-smart-alerts`**
- Schedule: Every hour
- Checks for confluence: when technical + on-chain + narrative conditions align
- Example: RSI divergence + whale inflow > $50M + sector momentum score rising → "High-conviction setup detected"
- Writes to `trading_signals` with `source: 'ai_generated'` and high strength score
- Creates research note with full reasoning chain

---

### Phase 6: UI Polish & Collaboration

**Timeline:** Week 6+
**Priority:** P2 — usability and team readiness

#### 6A. Custom Dashboard Composer

Allow users to drag-and-drop widgets from a palette:
- Regime badge, correlation chart, sector heatmap, derivatives panel, on-chain pulse
- Position table, equity curve, drawdown chart, signal feed
- Saved as user preference in localStorage (or a new `dashboard_layout` table)

#### 6B. Research Notebook Integration

Extend the Research tab:
- Markdown editor for notes with auto-linking to signals, hypotheses, positions
- Version history per note
- Tag-based filtering and full-text search
- "Create hypothesis from research" button that pre-fills the hypothesis form

#### 6C. Education Tooltips

Add contextual education throughout:
- Hover on "Funding Rate" → explanation of what it means and why it matters
- Hover on "Regime: Risk-Off" → what risk-off means for different asset classes
- Hover on "Sharpe Ratio" → definition and interpretation guide
- Sourced from a static `education_glossary.ts` file

---

## Scheduled Task Integration

### New Tasks to Create

| Task ID | Schedule | Phase | Description |
|---|---|---|---|
| `fin-price-updater` | Every 30 min (market hours), hourly (crypto) | 2A | Fetch prices, update positions and watchlist, check alerts |
| `fin-onchain-sweep` | Every 2 hours | 2B | Monitor whale flows, exchange inflows, TVL changes |
| `fin-derivatives-sweep` | Every 4 hours | 2C | Funding rates, OI, liquidations, options data |
| `fin-prediction-markets` | Every 2 hours | 2D | Kalshi + Polymarket event probabilities, volume, deltas |
| `fin-narrative-scanner` | Daily 5:30 AM | 3A | Sector rotation and narrative momentum scoring |
| `fin-project-fundamentals` | Weekly Sunday 6 AM | 3B | Deep-dive tokenomics and project scoring |
| `fin-risk-monitor` | Every 15 min (market hours) | 4A | Stop-loss/take-profit monitoring, exposure checks |
| `fin-smart-alerts` | Every hour | 5C | Multi-signal confluence detection |

### Existing Tasks to Modify

| Task ID | Change | Phase |
|---|---|---|
| `fin-regime-classifier` | Add prediction market pillar (13% weight) + daily brief auto-generation after regime compute | 2D, 5B |
| `fin-research-sweep` | Include on-chain and derivatives data in research output | 2B, 2C |
| `fin-gap-detection` | Check new data tables (onchain, derivatives, narratives) for gaps | 3A |
| `fin-coding-session` | Prioritize trading lab features from this plan | All |
| `morning-ops-digest` | Include derivatives and on-chain highlights in morning digest | 2B, 2C |

### Task Pipeline (Daily Flow After Full Build)

```
4:00 AM   fin-rotation-scheduler     → pick today's market segments
4:30 AM   fin-research-sweep         → execute research (now includes on-chain + derivatives)
5:00 AM   fin-regime-classifier      → compute regime + auto-generate daily brief
5:30 AM   fin-narrative-scanner      → sector rotation + narrative momentum
6:00 AM   morning-ops-digest         → compile everything into morning brief
          ─── market opens ───
9:30 AM+  fin-price-updater          → every 30 min: prices, PnL, alert checks
          fin-risk-monitor           → every 15 min: stop-loss, exposure
          fin-onchain-sweep          → every 2 hours: whale flows, TVL
          fin-prediction-markets     → every 2 hours: Kalshi + Polymarket odds
          fin-derivatives-sweep      → every 4 hours: funding, OI, liq
          fin-smart-alerts           → every hour: confluence detection
1:30 PM   fin-coding-session         → build features from this plan
6:30 PM   fin-market-health          → verify environment health
9:00 PM   fin-gap-detection          → identify what's missing
9:30 PM   fin-feature-builder        → convert gaps to build prompts
```

---

## Schema Migration Sequence

| Migration | Tables/Columns | Phase |
|---|---|---|
| `426_market_price_cache.sql` | `market_price_cache` | 2A |
| `427_onchain_signals.sql` | `onchain_signals` | 2B |
| `428_derivatives_snapshot.sql` | `derivatives_snapshot` | 2C |
| `429_prediction_market_snapshot.sql` | `prediction_market_snapshot` | 2D |
| `430_sector_narratives.sql` | `sector_narrative` | 3A |
| `431_risk_alerts.sql` | `risk_alert` | 4A |
| `432_dashboard_layouts.sql` | `dashboard_layout` (optional) | 6A |

---

## Success Metrics

| Metric | Current | Phase 1 Target | Full Build Target |
|---|---|---|---|
| Signal sources | 4 (macro, technical, fundamental, cross-asset) | 4 + manual write | 8 (+onchain, derivatives, sentiment/prediction, ai_generated) |
| Data update frequency | Daily (regime only) | Daily + position writes | Real-time (15-min price, hourly alerts) |
| MCP tools for market intelligence | 0 | 9 | 15+ |
| Automated risk controls | 0 | 0 | 6 (stop-loss, take-profit, drawdown, exposure, concentration, correlation) |
| Sector coverage | None | None | 6 crypto sectors with momentum scores |
| AI agent can query market state | No | Yes (regime, positions, signals) | Yes (full synthesis across all data) |
| Cross-vertical integration | Regime → REPE/Credit/PDS | Same + MCP queryable | On-chain → credit haircuts, derivatives → regime, prediction markets → rate expectations + recession risk |
| Prediction market coverage | None | None | 6 categories across Kalshi + Polymarket, regime classifier 5th pillar |

---

## Dependency Graph

```
Phase 1 (Write API + MCP + Position UI)
    ├── Phase 2 (Data feeds) ← depends on write API for signal creation
    │   ├── Phase 3 (Narratives) ← depends on on-chain data
    │   └── Phase 4 (Risk mgmt) ← depends on price feeds
    │       └── Phase 5 (AI layer) ← depends on MCP tools + all data sources
    └── Phase 6 (UI polish) ← can start in parallel after Phase 1
```

Phase 1 is the critical path. Everything else branches from it.

---

## Integration with Existing Routines

**3 PM Autonomous Coding Session:** The `autonomous-coding-session` task should check `docs/plans/TRADING_LAB_ENHANCEMENT_PLAN.md` and `docs/feature-radar/` for trading lab items. Phase 1 items should be prioritized above general feature radar suggestions until the write API and MCP tools are operational.

**Morning Brief:** Once Phase 2 is live, the `morning-ops-digest` should include a "Market Intelligence" section summarizing overnight on-chain activity, derivatives positioning changes, and regime status.

**`fin-coding-session`:** This existing 1:30 PM task should be the primary executor for trading lab builds. Its prompt should reference this plan and work through phases sequentially.

**Demo Preparation:** Once Phase 1 is complete, the `demo-idea-generator` should include trading lab demos in its output — showing live regime classification, position tracking, and AI market queries as a Winston differentiator.

**Capability Inventory:** After each phase ships, update `docs/CAPABILITY_INVENTORY.md` with the new trading/market capabilities. The trading lab is currently undocumented there.
