# Meridian / REPE — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **T1 — Dark-mode chart/map contrast** — `FundFootprintMap.tsx` uses hardcoded light-mode hex (`#F8FAFC`, `#0F172A`, `#64748B`). Leaflet tooltips in `FundFootprintMapInner.tsx` use hardcoded light text. OSM light tiles clash with dark shell. Legend wrapperStyle in `FundComparisonChart.tsx` has no color. Routed to **Ticket 1** in dispatch record 0001.
- [ ] **T5 — Map marker persistence** — Selected marker state resets on filter change even when asset is still visible. `FundFootprintMap.tsx` / `FundFootprintMapInner.tsx`. Routed to **Ticket 5**.
- [ ] **T2 — IRR authoritative-source audit and fail-closed display correction** — IGF VII 2024Q4 shows gross_irr = 456%, MCOF I 2025Q2 shows 366%. The task is to trace what table/view/computation produced the value and what cash flows support it — not to guess a plausible replacement number. Suspected cause: XIRR on sparse early-history cash flows. Fix requires tracing source → adding sparse-history guard in `irr_engine.py` → null_reason propagation → UI chip display. **Do not tackle until T1 is done.** Routed to **Ticket 2**.
- [ ] **Verify waterfall calculations** — `backend/app/finance/waterfall_engine.py` and `waterfall_american.py` — Confirm that calculated LP/GP splits match expected outputs for at least one fund with known waterfalls.
- [ ] **Audit mode gaps** — `?audit_mode=1` should render AuditDrawer on all audited pages. Verify which pages are missing audit mode rendering.

## UX improvements
- [ ] **Period close workflow** — `/lab/env/[envId]/re/period-close` — Confirm this guides operators through close steps with clear status. Report if it is a stub or fully functional.
- [ ] **Operator diagnostics** — `/lab/env/[envId]/re/operator-diagnostics` — Verify this shows useful diagnostic data, not empty state.

## Backend / API
- [ ] **Legacy read enforcement** — `verification/lint/no_legacy_repe_reads.py` — Run this lint check and report any violations. Re-route violating code through authoritative state layer.
- [ ] **State lock invariants** — `backend/tests/test_state_lock_invariants.py` — Run and report pass/fail status.

## Data / migrations
- [ ] **Fund and asset table schema** — Needs repo verification. Identify Supabase table names for funds, assets, investors, and snapshots.
- [ ] **IRR outlier data** — After identifying the cause of IGF VII and MCOF I outliers, determine whether a data correction or code fix is needed.

## Tests
- [ ] **REPE unit tests** — Check `backend/tests/` for REPE-specific test coverage. Report gaps.
- [ ] **Playwright tests for REPE flows** — None known. Add fund → asset → waterfall flow.

## Documentation
- [ ] **Link investment engine ADRs** — `docs/adr/investment-engine/` has key decisions. Reference from architecture.md.

## Nice-to-have
- [ ] Real-time NAV updates during period close
- [ ] Investor portal with IRR/TVPI drill-down

## Completed
_(none yet)_
