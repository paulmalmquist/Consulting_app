# REPE Typography Refactor Receipt

Date: 2026-05-01

## Scope

- Added shared typography contract in `repo-b/src/app/_typography.css`.
- Marketing imports the shared typography layer instead of owning Abadi and `.nv-*` heading/body primitives locally.
- Lab environments now bind Geist variables and the `.re-shell` operating-console scope.
- REPE portfolio tables, Winston response tables, KPI groups, Winston shell labels, approvals heading, dialog titles, companion body text, bottom-up rollup tables, and primary REPE page headings use `.nv-*` classes.
- Explicit requested light-mode cleanup was applied to `CashFlowSection.tsx`, `ncf/executive/ExecutiveView.tsx`, bottom-up REPE rollups, and the dashboard builder shell.
- `_typography.css` includes a `.re-shell` dark guardrail that remaps known legacy light-only utility classes inside lab environments while the large fund/investment detail screens continue migrating component-by-component.

## Notes

- The requested filename `334_winston_eval_repe_extensions.sql` conflicted with an existing migration, so the PR uses `607_winston_eval_repe_extensions.sql`.
- The wider lab sweep still finds legacy hard-coded light utilities in large historical screens such as fund/investment detail and standalone mockups. Those are rendered dark by the `.re-shell` guardrail, but the source-level class cleanup remains incremental.

## Verification

- Added `repo-b/tests/repe/re-typography.spec.ts`.
- Full frontend verification should run with `cd repo-b && npm run typecheck && npm run lint && npm run build`.
