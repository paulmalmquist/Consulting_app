# Feature: AI Deal Screening — Dealpath — 2026-03-20

**Source:** Dealpath — dealpath.com/ai-studio/

## What It Does (User-Facing)
Generates instant market, tenant, and property insights on listings from the Dealpath Connect network, reducing deal screening time from hours to minutes. Investment professionals get contextually relevant summaries without manual research.

## Functional Components
- Data source: Dealpath Connect listings (65% of institutional on-/off-market deals, CBRE/JLL brokers); MSCI/RCA comparables; proprietary deal database
- Processing: AI-powered analysis combining listing data with market context, tenant profiles, and property characteristics; generates structured summary with key investment metrics
- Trigger: New listing arrives in Dealpath Connect or user requests screening on a specific deal
- Output: Structured deal summary with market insights, tenant analysis, property assessment, and key risk factors
- Delivery: Inline within Dealpath Connect interface; integrated with pipeline management

## Winston Equivalent
Winston has Deal Radar with radar chart visualization for deal pipeline. However, Winston lacks: (1) a connected brokerage network feeding live listings, (2) automated AI screening that generates instant market context on inbound deals, (3) integration with institutional comparables databases like MSCI/RCA. Winston's deal pipeline is manual-entry focused. This is a "Major build" for the network component, but the AI screening logic over structured deal data is an "Easy build" if deal data exists.

## Architectural Pattern
Event-driven AI enrichment on inbound deal flow + market data overlay. Pattern: "listing ingestion event → multi-source data enrichment → AI summary generation → inline delivery."
