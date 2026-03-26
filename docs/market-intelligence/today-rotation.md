# Market Rotation Selection — 2026-03-26

**Generated:** 2026-03-26T04:00 UTC
**Scheduler:** fin-rotation-scheduler
**Next consumer:** fin-research-sweep (4:30 AM)

---

## Selected Segments (4 of 4)

| # | Segment ID | Segment Name | Category | Tier | Overdue Ratio | Cadence (days) |
|---|---|---|---|---|---|---|
| 1 | `ma-liquidity-flows` | Global Liquidity & Capital Flows | macro | 1 | 758.8× | 3 |
| 2 | `cr-rwa-tokenization` | Real World Assets (RWA) | crypto | 1 | 455.3× | 5 |
| 3 | `eq-homebuilders` | Homebuilders & Housing | equities | 1 | 455.3× | 5 |
| 4 | `cr-l2-scaling` | L2 Scaling Solutions | crypto | 1 | 455.3× | 5 |

---

## Category Mix

| Category | Count | Segments |
|---|---|---|
| macro | 1 | Global Liquidity & Capital Flows |
| crypto | 2 | Real World Assets (RWA), L2 Scaling Solutions |
| equities | 1 | Homebuilders & Housing |

**Mix assessment:** Three-category spread across macro, crypto, and equities. Improved category diversity vs. prior rotation (2026-03-24) which was equities-heavy. Macro coverage restored with `ma-liquidity-flows` which has the shortest cadence (3 days) and highest overdue ratio.

---

## Selection Notes

- All four segments had never been rotated prior to this run (`last_rotated_at` defaulted to 2020-01-01), producing extreme overdue ratios.
- All are **Tier 1**, which per task spec should always be included when overdue.
- `rotation_priority_score` was 0.00 for all four — tiebreaking fell to query order (overdue ratio DESC).
- `ma-liquidity-flows` ranks highest due to its 3-day cadence vs. 5-day for the other three.
- `last_rotated_at` and `updated_at` have been updated to `now()` for all four segment IDs.

---

## Heat Triggers

No external heat triggers applied. Selection driven purely by overdue ratio. Future runs may incorporate:
- VIX spike flags (>25) to force macro/credit segments into the rotation
- BTC 7-day drawdown >15% to elevate crypto tier-1 segments
- Housing starts or mortgage rate moves to prioritize homebuilder coverage
- RWA TVL surges to elevate tokenization segments

---

## Segment Research Directives for fin-research-sweep

### 1. Global Liquidity & Capital Flows (`ma-liquidity-flows`)
Focus: Fed balance sheet trajectory and QT pace; global central bank reserve shifts (BOJ, PBOC, ECB); TGA drawdowns and refills; reverse repo facility usage trends; cross-border capital flow data (IIF, BIS); dollar liquidity proxy indicators; collateral availability in repo markets; implications of any Treasury refunding announcements.

### 2. Real World Assets (RWA) (`cr-rwa-tokenization`)
Focus: Tokenized Treasury and money market fund AUM (BlackRock BUIDL, Franklin Templeton, Ondo); private credit on-chain deployments (Maple, Centrifuge, Goldfinch); regulatory clarity from SEC/CFTC on tokenized securities; institutional adoption signals; bridge volumes between TradFi and DeFi rails; real estate tokenization pilots; stablecoin-RWA composability.

### 3. Homebuilders & Housing (`eq-homebuilders`)
Focus: Major homebuilder earnings and guidance (DHI, LEN, NVR, PHM, TOL); new home sales and housing starts data; mortgage rate trajectory and lock-in effect on existing supply; land bank valuations; builder incentive trends (rate buydowns, price cuts); multifamily starts vs. single-family; regional divergence (Sun Belt vs. Northeast); affordability metrics (median income-to-price ratios).

### 4. L2 Scaling Solutions (`cr-l2-scaling`)
Focus: Arbitrum, Optimism, Base, zkSync, Starknet, Scroll comparative metrics; L2 transaction volumes and fee revenue; blob fee dynamics post-EIP-4844; sequencer decentralization progress; cross-L2 bridging volumes; app migration patterns from L1 to L2; token unlock schedules and governance activity; L2 TVL composition (native DeFi vs. bridged assets).
