# Market Rotation Selection — 2026-03-24

**Generated:** 2026-03-24T04:00 UTC
**Scheduler:** fin-rotation-scheduler
**Next consumer:** fin-research-sweep (4:30 AM)

---

## Selected Segments (4 of 4)

| # | Segment ID | Segment Name | Category | Tier | Overdue Ratio | Cadence (days) |
|---|---|---|---|---|---|---|
| 1 | `eq-semi-ai-accel` | Semiconductor / AI Accelerators | equities | 1 | 758.1× | 3 |
| 2 | `eq-factor-momentum` | Momentum Factor Screen | equities | 1 | 758.1× | 3 |
| 3 | `eq-energy-transition` | Energy Transition / Grid | equities | 1 | 758.1× | 3 |
| 4 | `cr-l1-alt` | Alt-L1 Platforms | crypto | 1 | 758.1× | 3 |

---

## Category Mix

| Category | Count | Segments |
|---|---|---|
| equities | 3 | Semiconductor / AI Accelerators, Momentum Factor Screen, Energy Transition / Grid |
| crypto | 1 | Alt-L1 Platforms |

**Mix assessment:** Two-category spread. All four returned segments from the overdue query were selected. No macro/rates/credit/derivatives segments appeared in the top 4 — those categories may have longer cadences or were rotated more recently. fin-research-sweep should note if macro coverage is expected.

---

## Selection Notes

- All four segments had overdue ratios of ~758× as of 2026-03-24. Their `last_rotated_at` was previously stamped on 2026-03-22 (the prior run), and with a 3-day cadence they were due today.
- All are **Tier 1**, which per task spec should always be included when overdue.
- `rotation_priority_score` was 0.00 for all four — tiebreaking fell to query order (already sorted by overdue ratio DESC).
- `last_rotated_at` and `updated_at` have been updated to `now()` for all four segment IDs.

---

## Heat Triggers

No external heat triggers applied. Selection driven by overdue ratio. Future runs may incorporate:
- VIX spike flags (>25) to force macro/credit segments into the rotation
- BTC 7-day drawdown >15% to elevate crypto tier-1 segments
- Earnings calendar density to prioritize relevant equity sub-sectors

---

## Segment Research Directives for fin-research-sweep

### 1. Semiconductor / AI Accelerators (`eq-semi-ai-accel`)
Focus: NVDA, AMD, AVGO, MRVL, ASML supply chain dynamics; AI training vs. inference compute demand split; HBM memory constraints; China export control tail risk; datacenter CapEx trajectory from hyperscalers.

### 2. Momentum Factor Screen (`eq-factor-momentum`)
Focus: Current top-decile momentum names (12-1 month return); factor crowding signals; momentum crash risk given recent rate volatility; cross-asset momentum reads (equities + FX + commodities); sector rotation within the factor.

### 3. Energy Transition / Grid (`eq-energy-transition`)
Focus: Grid capex cycle (transformers, substations, long-lead equipment); utility-scale storage deployments; IRA credit transferability utilization; nuclear renaissance (SMR permitting pipeline); data center power demand as structural demand catalyst; policy risk around IRA modifications.

### 4. Alt-L1 Platforms (`cr-l1-alt`)
Focus: SOL, AVAX, SUI, APT relative performance vs. ETH; DEX volume market share shifts; stablecoin issuance on alt-L1s; fee revenue and token burn dynamics; validator/staker economics; developer activity trends.
