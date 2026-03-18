# Feature: Portfolio Scenario Analysis — Altus Group — 2026-03-18

**Source:** Altus Group / ARGUS Intelligence — https://www.altusgroup.com/solutions/argus-intelligence/

## What It Does (User-Facing)
Lets portfolio managers run what-if simulations simultaneously at the property, asset, and portfolio level — testing how changes in assumptions (cap rates, vacancy, rent growth, interest rates) ripple through to fund-level returns without manually rebuilding models.

## Functional Components

- **Data source:** ARGUS Enterprise cash flow models; property-level valuation assumptions; rent roll data
- **Processing:** Parameterized scenario engine — user adjusts input variables (e.g., cap rate +50bps, vacancy +5%); system recalculates DCF / IRR / equity multiple at asset and portfolio aggregate level; comparison of base vs. scenario outputs
- **Trigger:** User-initiated via UI; scenario parameters entered manually
- **Output:** Side-by-side scenario comparison (base vs. stress case); waterfall charts; summary dashboard showing portfolio-level impact
- **Delivery:** In-app interactive dashboard; exportable

## Winston Equivalent
Winston has scenario modeling and stress testing capabilities mentioned in its feature set. The capability appears to exist but may not be exposed in the same structured UI flow (run parameterized stress across all assets simultaneously). This is likely a Partial match — the underlying data model exists but the scenario UI layer needs review.

## Architectural Pattern
Parameterized recalculation engine over pre-built DCF models + portfolio aggregation layer + templated output renderer. Pattern: "fork-and-recalculate on demand" — cheap to build if the underlying valuation models are already in the data store.
