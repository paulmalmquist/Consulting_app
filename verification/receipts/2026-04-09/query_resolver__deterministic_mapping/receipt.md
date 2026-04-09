# Verification Receipt: Query Resolver — Deterministic Mapping

**Timestamp:** 2026-04-09T18:38:51.336567+00:00
**Result:** PASS

## Test Cases
- [PASS] `DSCR < 1.25`
  - [PASS] filter_weighted_dscr
- [PASS] `multifamily in texas`
  - [PASS] filter_property_type
  - [PASS] filter_state
- [PASS] `IRR > 12%`
  - [PASS] filter_gross_irr
- [PASS] `vintage 2024`
  - [PASS] filter_vintage_year
- [PASS] `/debt surveillance`
  - [PASS] slash_command
- [PASS] `DSCR < 1.25 multifamily texas`
  - [PASS] filter_weighted_dscr
  - [PASS] filter_property_type
  - [PASS] filter_state