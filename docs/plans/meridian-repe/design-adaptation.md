# Meridian REPE — Design Adaptation

## Purpose in the design system

Meridian is the most financially sensitive environment. Its visual language must communicate authority and precision. Every number on screen must be trustworthy. Ambiguity in the UI is a product defect, not a style choice.

## Accent choices
- Primary accent: `--nv-purple-400` (brand)
- Positive/gain: `--nv-green-400`
- Negative/loss: `--nv-red-400`
- Alert/outlier: `--nv-amber-400`
- Null/unavailable state: a distinct visual marker (muted chip with null_reason)

## Density
High. Fund-level KPI cards must be visible without scrolling. Asset tables may be long but must be sortable and filterable.

## Component emphasis
- KPI cards must show: metric name, value, as-of date, trust status (released vs. draft)
- IRR and TVPI must show provenance (snapshot ID and period) on hover or in audit mode
- Waterfall breakdown must show LP/GP split with labeled segments, not just totals
- Period close workflow must show each step with its status

## Null state rules (CRITICAL)
- Null values must NOT show as 0%, blank, or dash without explanation
- Null values must show a chip or label indicating `null_reason`
- Example: carry shows "Requires waterfall model" chip, not 0%
- Audit mode (`?audit_mode=1`) must reveal full provenance, snapshot version, and null reasons

## What this environment must NOT do
- Show a calculated estimate when the authoritative value is unavailable
- Use the same visual treatment for a released value and an unreleased draft
- Hide period close status behind a click
