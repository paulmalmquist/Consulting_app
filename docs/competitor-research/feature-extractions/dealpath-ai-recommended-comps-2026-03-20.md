# Feature: AI Recommended Comps — Dealpath — 2026-03-20

**Source:** Dealpath — dealpath.com/ai-studio/

## What It Does (User-Facing)
Automatically identifies optimal comparable transactions based on price, proximity, square footage, and other criteria using proprietary and third-party market data (MSCI/RCA). Helps teams benchmark deals and accelerate underwriting.

## Functional Components
- Data source: Proprietary deal database ($10T+ in transactions); MSCI/Real Capital Analytics comparables; user's historical deal data
- Processing: Multi-criteria similarity matching (proximity, price, SF, property type, vintage); ranking algorithm scoring relevance; AI-powered recommendation engine
- Trigger: User views a deal or initiates underwriting; can be automatic on deal creation
- Output: Ranked list of comparable transactions with key metrics (price/SF, cap rate, vintage, proximity); side-by-side comparison view
- Delivery: Inline within deal detail view; integrated with underwriting workflow

## Winston Equivalent
Winston has valuation via Direct Cap methodology but does not have an automated comps recommendation engine. Winston lacks a large proprietary transaction database for matching. However, Winston could build a comps engine over its own portfolio data and any connected market data feeds. This is "Moderate build" — needs transaction data sourcing and similarity matching algorithm, but the UI and workflow integration is straightforward in Winston.

## Architectural Pattern
Similarity search over structured transaction database + multi-criteria scoring. Pattern: "deal context extraction → vector/criteria similarity search → relevance ranking → inline presentation."
