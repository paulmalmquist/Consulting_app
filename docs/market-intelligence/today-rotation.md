# Market Rotation Selection — 2026-03-22

**Generated:** 2026-03-22 (fin-rotation-scheduler)
**Next step:** fin-research-sweep reads this file at 4:30 AM

---

## Selected Segments (4 of 4)

| # | Segment ID | Segment Name | Category | Tier | Overdue Ratio |
|---|---|---|---|---|---|
| 1 | `cr-regime-btc` | BTC On-Chain Regime | crypto | 1 | ~2273x overdue |
| 2 | `cr-regime-eth` | ETH Ecosystem Health | crypto | 1 | ~2273x overdue |
| 3 | `dr-options-flow` | Equity Options Flow | derivatives | 1 | ~2273x overdue |
| 4 | `dr-crypto-derivatives` | Crypto Derivatives Flow | derivatives | 1 | ~2273x overdue |

---

## Category Mix

| Category | Count | Segments |
|---|---|---|
| crypto | 2 | BTC On-Chain Regime, ETH Ecosystem Health |
| derivatives | 2 | Equity Options Flow, Crypto Derivatives Flow |

---

## Selection Notes

- **All 4 segments are Tier 1** — highest-priority daily segments covering regime classification, on-chain health, and flow data.
- **Overdue ratio of ~2273** for all segments indicates `last_rotated_at` was null (defaulted to 2020-01-01), meaning these segments have never been rotated. This is expected for a fresh database.
- **Category coverage:** Two categories represented (crypto + derivatives). Equity, fixed income, macro, and other categories were not in the top 4 — they may have higher cadence_days or be absent from the active segment set. No heat triggers detected (overdue ratio is uniform across all returned segments; no anomalous signals available without historical data).
- **`last_rotated_at` updated** to `now()` for all 4 segment IDs in `public.market_segments`.

---

## Heat Triggers

No external heat triggers applied — selection was driven entirely by overdue ratio (all segments equally maximal). On subsequent runs, differential overdue ratios will allow tier and priority score to serve as tiebreakers.

---

## For fin-research-sweep

Deep-dive research targets for 4:30 AM sweep:

1. **BTC On-Chain Regime** (`cr-regime-btc`) — on-chain metrics: NVT, MVRV, realized cap, miner flows, exchange inflows/outflows, HODLer behavior
2. **ETH Ecosystem Health** (`cr-regime-eth`) — staking yields, L2 activity, DEX volume, gas trends, burn rate, validator economics
3. **Equity Options Flow** (`dr-options-flow`) — put/call ratios, unusual options activity, term structure, skew, GEX (gamma exposure), major expiry positioning
4. **Crypto Derivatives Flow** (`dr-crypto-derivatives`) — futures open interest, funding rates, liquidation heatmaps, perpetual vs. spot premium, options OI by strike
