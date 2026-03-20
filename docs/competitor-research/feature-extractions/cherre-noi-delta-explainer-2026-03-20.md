# Feature: NOI Delta Explainer Agent — Cherre — 2026-03-20

**Source:** Cherre — cherre.com/products/agent-studio/

## What It Does (User-Facing)
Automatically explains Net Operating Income changes between periods — identifies the specific line items (revenue increases, expense spikes, vacancy changes) driving the delta and presents a narrative explanation.

## Functional Components
- Data source: Property-level P&L data, GL trial balance, occupancy/lease data connected through Cherre's data fabric
- Processing: Period-over-period comparison of NOI components; attribution analysis decomposing the total delta into constituent drivers; natural language generation for narrative explanation
- Trigger: User request or scheduled (e.g., monthly after financials close)
- Output: Structured breakdown of NOI change drivers with magnitude and direction, plus natural language narrative
- Delivery: In-platform agent output; likely exportable

## Winston Equivalent
Winston has asset-level P&L, GL trial balance, and the data foundation. Winston chat can answer NOI questions. However, Winston lacks a dedicated, automated NOI delta explanation tool that produces a structured attribution waterfall. This is a "Partial" — Winston has the data and the AI, but hasn't packaged this as a discrete, repeatable workflow.

## Architectural Pattern
Period-over-period financial attribution analysis + NLG narrative generation. Pattern: "structured financial comparison → driver decomposition → templated narrative output."
