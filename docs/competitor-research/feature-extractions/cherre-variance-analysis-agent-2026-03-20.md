# Feature: Variance Analysis Agent — Cherre — 2026-03-20

**Source:** Cherre — cherre.com/products/agent-studio/

## What It Does (User-Facing)
Compares actual vs. forecasted metrics across a portfolio, identifies material variances, and explains their drivers automatically.

## Functional Components
- Data source: Budget/forecast data + actual performance data from connected ERP/property management systems
- Processing: Actual vs. budget comparison at property and portfolio level; threshold-based flagging of material variances; driver attribution (market, operational, one-time)
- Trigger: Scheduled (monthly/quarterly post-close) or on-demand
- Output: Variance table with magnitude, direction, and narrative explanation per line item; flagged items requiring attention
- Delivery: In-platform; dashboard integration; exportable

## Winston Equivalent
Winston has UW vs Actual reporting (underwriting baseline vs actual performance). This is adjacent but not identical — Cherre's version is budget-vs-actual at the operational level. Winston's UW vs Actual is more about investment thesis validation. Winston could extend its existing comparison framework to cover operational budget variance. This is "Partial" — close but needs operational budget data integration and automated narrative generation.

## Architectural Pattern
Scheduled ETL + threshold comparison + NLG attribution. Pattern: "budget-actual join → materiality filter → driver decomposition → narrative template."
