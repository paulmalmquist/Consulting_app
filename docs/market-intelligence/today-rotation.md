# Market Rotation Selection — 2026-03-30

**Generated:** 2026-03-30 ~04:00 UTC
**Status:** Ready for fin-research-sweep

## Selected Segments (4)

| # | Segment ID | Segment Name | Category | Tier | Overdue Ratio | Days Since Rotation |
|---|---|---|---|---|---|---|
| 1 | ma-credit-spreads | Credit Spreads & Risk Premia | macro | 1 | 6.87x | 6.9 |
| 2 | cr-regime-btc | BTC On-Chain Regime | crypto | 1 | 1.97x | 2.0 |
| 3 | dr-options-flow | Equity Options Flow | derivatives | 1 | 1.97x | 2.0 |
| 4 | ma-rates-curve | Rates & Yield Curve | macro | 1 | 1.97x | 2.0 |

## Category Mix

- **macro** (2): ma-credit-spreads, ma-rates-curve
- **crypto** (1): cr-regime-btc
- **derivatives** (1): dr-options-flow

3 of 4 active categories represented. Equities not selected this cycle — no equities Tier 1 daily segments were overdue.

## Selection Rationale

- All 4 selections are Tier 1 daily-cadence segments with overdue ratios > 1.0. Per rotation policy, these must always be included when overdue.
- Credit Spreads & Risk Premia was the top carryover from yesterday's rotation (flagged at 6.29x, now 6.87x). It is finally selected today after being deferred for category diversity yesterday.
- BTC On-Chain Regime, Equity Options Flow, and Rates & Yield Curve are all ~2 days overdue on daily cadences.
- Macro has 2 slots because both daily macro segments (credit spreads, rates) were overdue. No equities Tier 1 daily segments exist to compete for a slot.

## Heat Triggers

- **ma-credit-spreads**: 6.87x overdue — highest urgency. Nearly a week without rotation on a daily segment. Carryover from 2 consecutive rotations.
- No external heat triggers detected. Selection driven by overdue ratios and mandatory Tier 1 daily inclusion rules.

## Backlog Note

- Tier 1 3-day cadence segments with high overdue ratios: eq-factor-momentum (2.0x), cr-l1-alt (2.0x), eq-semi-ai-accel (2.0x), eq-energy-transition (2.0x). These should be prioritized in the next rotation.
- Tier 2 equities segments (Cybersecurity, Industrial Reshoring, Healthcare Services, Biotech Catalysts) remain at 325x+ overdue ratios, never rotated. Recommend scheduling a dedicated equities catch-up block.
