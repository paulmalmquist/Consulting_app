# Market Rotation Engine — Skill Spec

**Owner:** Winston Autonomous Loop
**Status:** Active
**Created:** 2026-03-22
**Source of truth:** true

---

## Purpose

The Market Rotation Engine is a daily autonomous intelligence pipeline that deep-dives into 34 market segments across four asset categories (equities, crypto, derivatives, macro). It follows a three-phase pipeline — Research → Gap Detection → Feature Enhancement — rotating through segments on a tier-based cadence. Cross-vertical intelligence feeds back into REPE, Credit, and PDS environments.

---

## Segment Taxonomy

| Category | Count | Subcategories |
|----------|-------|---------------|
| Equities | 16 | 12 sector micro-niches, 2 factor/style, 2 event-driven |
| Crypto | 8 | 6 protocol categories, 2 on-chain regimes |
| Derivatives | 4 | 2 flow analysis, 2 strategy lab |
| Macro | 6 | 4 regime detection, 1 liquidity, 1 FX |

### Tier Cadence

| Tier | Cadence | Description |
|------|---------|-------------|
| 1 | Every 1–5 days | Core monitors: BTC/ETH regime, rates, options flow, AI/energy/housing |
| 2 | Every 7 days | Sector rotational: biotech, defense, fintech, cybersecurity, meme |
| 3 | Every 14 days | Low-priority watch: luxury, agriculture |

---

## Three-Phase Pipeline

### Phase 1: Research Sweep (fin-research-sweep)

For each segment selected for rotation:

1. Execute the segment's `research_protocol` (1A=equities, 1B=crypto, 1C=derivatives, 1D=macro)
2. Pull data from sources in `config/source_registry.json`
3. Compute signals using scoring weights from `config/scoring_weights.json`
4. Apply regime adjustments (current regime stored in DB)
5. Write a Segment Intelligence Brief to `docs/market-intelligence/YYYY-MM-DD-{segment-slug}.md`
6. Insert brief into `market_segment_intel_brief` table
7. Identify feature gaps — capabilities missing during the research process
8. If cross-vertical references exist, note insights for REPE/Credit/PDS

**Research Protocols:**

- **1A (Equities):** price action + technicals, fundamental screen, earnings/analyst consensus, sector-relative momentum, options positioning, news sentiment
- **1B (Crypto):** on-chain metrics (NVT, MVRV, exchange flows), DeFi TVL/yields, governance health, social velocity, narrative tracking, funding rates
- **1C (Derivatives):** vol surface analysis (IV rank, skew, term structure), options flow (unusual activity, smart money), strategy suitability (spreads, hedges, income), Greek exposure
- **1D (Macro):** yield curve shape + rate trajectory, credit spread levels + direction, Fed policy + liquidity conditions, cross-asset correlation regime, global capital flows

### Phase 2: Gap Detection (fin-gap-detection)

Read today's intelligence briefs and audit what Winston's Trading Platform environment CAN'T do yet:

**Gap Categories:**
- `data_source` — need a feed we don't have
- `calculation` — need a computation we can't run
- `screening` — need a filter/scan we can't build
- `visualization` — need a chart/view we can't render
- `backtesting` — need historical strategy testing
- `risk_model` — need a risk metric we don't calculate
- `alert` — need automated detection/notification
- `cross_vertical` — gap that bridges to REPE, Credit, or PDS

For each gap, create a Feature Card in `trading_feature_cards` with priority scoring:
- `priority = (impact × 0.35) + (frequency × 0.25) + (inverse_effort × 0.15)`
- Apply 1.5x multiplier for cross-vertical features
- Apply 0.1 recency boost for gaps found in last 21 days

### Phase 3: Feature Builder (fin-feature-builder)

Convert top-priority Feature Cards into build-ready meta prompts using `templates/meta_prompt.md`. Each prompt includes:
- Repo safety contract (protected surfaces)
- Data layer spec (tables, sources, pipeline)
- Backend spec (services, routes, dependencies)
- Frontend spec (components, visualizations, integration points)
- Cross-vertical hooks
- 3 verification tests with expected outcomes
- Proof-of-execution requirements

---

## Rotation Selection Algorithm

```sql
SELECT segment_id, segment_name, category, tier,
  EXTRACT(EPOCH FROM (now() - COALESCE(last_rotated_at, '2020-01-01'))) / 86400.0
    AS days_since_rotation,
  rotation_cadence_days,
  rotation_priority_score,
  -- Overdue ratio: >1.0 means past due
  (EXTRACT(EPOCH FROM (now() - COALESCE(last_rotated_at, '2020-01-01'))) / 86400.0)
    / rotation_cadence_days AS overdue_ratio
FROM public.market_segments
WHERE is_active = TRUE
ORDER BY
  -- Most overdue first
  (EXTRACT(EPOCH FROM (now() - COALESCE(last_rotated_at, '2020-01-01'))) / 86400.0)
    / rotation_cadence_days DESC,
  -- Break ties by priority score
  rotation_priority_score DESC
LIMIT 4;  -- Pick up to 4 segments per day (mix of categories when possible)
```

---

## Regime Classification

The engine maintains a global market regime tag that influences scoring weights:

| Regime | Description |
|--------|-------------|
| `RISK_ON_MOMENTUM` | Strong trend, lean into momentum signals |
| `RISK_ON_BROADENING` | Rotation favors quality and breadth |
| `RISK_OFF_DEFENSIVE` | Prioritize risk management |
| `RISK_OFF_PANIC` | Correlations → 1, focus on liquidity/hedging |
| `TRANSITION_UP` | Early recovery, look for leaders |
| `TRANSITION_DOWN` | Late cycle, tighten risk |
| `RANGE_BOUND` | Mean reversion, premium selling |

Regime is classified daily using multi-signal input: SPX momentum, VIX level + term structure, HY spreads, BTC-SPX correlation, DXY, M2 change.

---

## Cross-Vertical Intelligence

The Market Rotation Engine doesn't operate in isolation. Each segment can have `cross_vertical` references that create intelligence bridges:

| Bridge | Example |
|--------|---------|
| Trading → REPE | Cap rate vs treasury spread; data center REIT demand from AI chip segment |
| Trading → Credit | DeFi lending rates vs TradFi; consumer lending fintech health |
| Trading → PDS | Construction spending signals from industrial/housing segments |
| Macro → All | Rate environment, credit spreads, and regime tag feed into every vertical |

Cross-vertical insights are extracted during Phase 1 and written to the brief. Phase 2 flags cross-vertical gaps with 1.5x priority multiplier.

---

## ML Signal Engine

The engine includes a proprietary ML layer (`references/ml_signal_engine.md`) organized into five pillars:

1. **Mathematical Regression** — Momentum, mean reversion, fundamental, vol surface, on-chain models
2. **Text Sentiment** — Earnings NLP, crypto governance/community, news/analyst, regulatory tone
3. **Behavioral/Structural** — Options market behavior, microstructure, cross-asset correlation, calendar/seasonality, alt data
4. **Ensemble Fusion** — Stacking classifier/regressor combining all pillar outputs
5. **Walk-Forward Evaluation** — Every prediction logged with actual outcomes for continuous model improvement

Feature engineering library: `scripts/ml_features.py`

---

## Supabase Schema

**Migration:** `419_market_rotation_engine`

| Table | Purpose |
|-------|---------|
| `market_segments` | 34 tracked segments with tickers, tier, cadence, heat triggers |
| `market_segment_intel_brief` | Phase 1 research output per rotation |
| `trading_feature_cards` | Phase 2 gap-to-feature cards with priority scoring |
| `ml_models` | ML model registry (pillar, version, hyperparams, metrics) |
| `ml_predictions` | Walk-forward prediction log with actuals |

---

## Scheduled Tasks

All tasks use `fin-*` prefix for organization:

| Task ID | Time | What it does |
|---------|------|--------------|
| `fin-rotation-scheduler` | 4:00 AM | Picks today's segments from Supabase using overdue ratio |
| `fin-research-sweep` | 4:30 AM | Phase 1: research sweep on selected segments |
| `fin-regime-classifier` | 5:00 AM | Classify current market regime from multi-signal input |
| `fin-gap-detection` | 9:00 PM | Phase 2: read briefs, audit gaps, produce Feature Cards |
| `fin-feature-builder` | 9:30 PM | Phase 3: convert top cards to build-ready meta prompts |
| `fin-rotation-digest` | 10:00 PM | Compile daily market summary for morning brief |
| `fin-coding-session` | 1:30 PM | Opus. Build market intelligence frontend + features |
| `fin-market-health` | 6:30 PM | Tour Trading Platform environment, write health report |

---

## Output Folders

| Folder | Contents |
|--------|----------|
| `docs/market-intelligence/` | Segment Intelligence Briefs (Phase 1) |
| `docs/market-features/` | Feature Cards and meta prompts (Phase 2-3) |
| `docs/market-digests/` | Daily rotation summaries |

---

## Environment

| Field | Value |
|-------|-------|
| env_id | `c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9` |
| industry | `market_rotation` |
| industry_type | `financial_markets` |
| Frontend route | `/lab/env/{envId}/markets` |

---

## Manual Triggers

From chat or Telegram:

- `rotate into {segment-slug}` — Force immediate rotation into a specific segment
- `what's the regime` — Return current regime classification with supporting signals
- `market brief for {segment}` — Return latest intelligence brief
- `what trading gaps are open` — List unshipped feature cards by priority
- `research {ticker/segment}` — Ad-hoc research sweep outside rotation schedule

---

## Production Hardening

This engine follows all Winston autonomous loop production hardening patterns:

- **Git auth:** PAT-in-remote-URL for touchless push
- **Push stagger:** 90-min minimum between git-push tasks
- **Voice-friendly formatting:** Spelled-out numbers, no tables, ~800 words for digest
- **Three-output digest:** Markdown file + Google Doc + Gmail
- **CI verification:** Chrome-based GitHub Actions check after push
- **Daily scheduling:** Runs every day, not just weekdays

See `skills/winston-autonomous-loop/SKILL.md` for full hardening reference.

---

## When To Use This Skill

**Triggers:**
- market rotation, segment research, trading intelligence
- financial monitoring, crypto monitoring, derivatives analysis
- regime classification, cross-asset correlation
- trading feature cards, market gap detection
- ML signal engine, feature engineering
- rotate into [segment], market brief, what's the regime

**When NOT to use:**
- REPE-specific fund analytics → use REPE environment skills
- Credit underwriting decisions → use credit-decisioning skill
- PDS project tracking → use PDS delivery skill
- General website or UI work → use feature-dev skill
