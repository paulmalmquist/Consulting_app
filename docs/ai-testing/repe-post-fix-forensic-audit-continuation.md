# REPE Post-Fix Forensic Audit — Continuation Block

Recovered on 2026-04-19 from the ChatGPT project `WInston - Re PE`, chat `Execution Delta Request`, thread URL:

`https://chatgpt.com/g/g-p-69ca6be896a88191ad638486affcb35f-winston-re-pe/c/69e50176-f448-83ea-b0d8-49e093e95232`

## Current instruction to continue in Claude

Continue the archived second-part plan titled `Meridian REPE — Post-Fix Forensic Audit (archived)`.

Key recovered guidance:

- Phase 0 is complete and already surfaced three additional first-class findings to address before comprehensive forensics:
  - `NF-1`: orphaned `d4560000-...` fund rows contaminating rollups for MCOF I and MREF III; quarantine via migration 462.
  - `NF-2`: `canonical_metrics` key drift (`tvpi` vs `gross_tvpi`); standardize reads/writes and add lint enforcement.
  - `NF-3`: snapshot builder writes `beginning_nav = 0` for Meridian 2026Q2 snapshots; must derive from prior released quarter's ending NAV and re-promote.
- Delivery scope is a single session, phases 0-11 end to end, with diagnostic receipts plus patches landing together.
- Live Meridian env is the authoritative baseline. Every post-patch rerun must be against the live env, not fixtures.

## Global invariants to enforce

- `INV-1`: single source of truth for fund-level financial metrics must be authoritative-state only.
- `INV-2`: period coherence across all quarter-aligned inputs.
- `INV-3`: IRR only when cash flow series is economically complete.
- `INV-4`: ownership applied at the edge exactly once.
- `INV-5`: UI must respect null and never coerce missing metrics to zero.

Each invariant must exist in lint, runtime assertion, and test.

## Phases recovered from the archived plan

- `Phase 3`: fund-level receipts trace for IGF VII with formula/input/intermediate/final/source rows per metric.
- `Phase 4a`: period integrity + cash flow completeness gate before IRR work.
- `Phase 4b`: IRR forensic revalidation comparing stored, backend-calculated, independently recalculated, and UI-rendered values.
- `Phase 5`: NAV reconciliation from asset -> investment -> fund -> portfolio.
- `Phase 6`: waterfall / capital account / distribution validation; explicitly enumerate fail-closed violations from fallback carry logic.
- `Phase 7`: encode the invariants in lint/runtime/tests, including scanners like:
  - `backend_nav_source_drift`
  - `banned_legacy_table_reads`
  - `period_coherence_violation`
  - `ownership_at_aggregation`
  - `fail_closed_violation`
  - `ui_fallback_to_stale_metrics`
  - `canonical_metrics_key_drift`

## Live-site finding already re-verified by Codex

As of 2026-04-19, the live Meridian fund-detail page still renders `GROSS IRR 66.4%` and `NET IRR 52.4%` on:

`/lab/env/a1b2c3d4-0001-0001-0003-000000000001/re/funds/a1b2c3d4-0003-0030-0001-000000000001`

The extra top strip is gone, but the forensic audit is still needed because the live numbers remain materially suspect.

## Working instruction

Resume in the same REPE supervised loop with the archived forensic plan as the next review/execution artifact. Do not restart from the original IRR/API recovery phases. Treat the archived forensic audit as the next continuation block and keep receipts under `verification/receipts/`.
