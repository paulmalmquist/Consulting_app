# Feature: Benchmark Manager — Altus Group — 2026-03-18

**Source:** Altus Group / ARGUS Intelligence — https://www.altusgroup.com/solutions/argus-intelligence/

## What It Does (User-Facing)
Allows investors to compare their portfolio's performance against internal targets and external peer benchmarks drawn from the ARGUS ecosystem (the world's largest CRE valuation dataset), with attribution analysis to identify what drove variance.

## Functional Components

- **Data source:** ARGUS valuation dataset (aggregated from Altus's global client base); internal portfolio models from ARGUS Enterprise / ARGUS Intelligence
- **Processing:** Portfolio performance metrics computed at asset and fund level; delta calculation vs. benchmark; attribution decomposition (what drove outperformance or underperformance — cap rate compression, NOI growth, leverage, etc.)
- **Trigger:** On-demand by user; scheduled reporting cycle
- **Output:** Portfolio-to-market comparison visualization; attribution report showing drivers; performance dashboard
- **Delivery:** In-app dashboard; presumably PDF/Excel export

## Winston Equivalent
Winston has UW vs. Actual reporting (underwriting baseline vs. actual performance at asset level) and P&L reporting per asset/fund. What Winston does NOT have is peer benchmarking — i.e., comparison against external market data. Winston benchmarks against the firm's own underwriting assumptions, not against an industry dataset. The attribution decomposition layer (what drove the variance — cap rate, NOI, etc.) is also not yet built as a distinct module.

## Architectural Pattern
Scheduled ETL + multi-source data join + attribution decomposition engine + templated dashboard delivery. The key differentiator is the proprietary benchmark dataset — not just the UI. Altus owns the dataset because they process valuations for thousands of institutional clients globally.
