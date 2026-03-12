# Pipeline & Market Intelligence Dashboard

## Purpose
Track active deal pipeline by stage alongside portfolio geographic concentration to support acquisition decisions and capital allocation.

## Key Metrics
- Pipeline deal count by stage
- Total headline price by stage
- Average target IRR by property type
- Average target MOIC by property type
- Geographic concentration (assets by MSA)
- Portfolio NOI by market

## Layout
Row 1 (full width): Pipeline bar chart showing deal counts and total value by stage (sourced → screening → loi → dd → ic → closing → closed → dead).
Row 2 (full width): Portfolio geographic map with asset markers sized by NOI.
Row 3 (full width): Deal detail table sorted by days in stage (descending).

## Entity Scope
Fund-level dashboard. Covers all active investments across the portfolio. No specific quarter filter — current snapshot.

## Interactions
- pipeline_bar → filter → deal_detail_table: clicking a stage bar filters the deal detail table to that stage
- geographic_map → select → asset_detail_table: clicking a map region filters to assets in that geography

## Measure Intent
Operational dashboard for asset managers and portfolio managers monitoring deal velocity and geographic exposure.

Depth: operational
Required metrics: deal_count, headline_price, target_irr, target_moic
Suggestion mode: suggest

## Table Behavior
Include: always
Visibility: always
Type: detail_grid
Columns: deal_name, status, property_type, target_irr, target_moic, headline_price, days_in_stage
