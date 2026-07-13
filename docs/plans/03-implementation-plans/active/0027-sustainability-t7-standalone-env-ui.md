# 0027 - Sustainability T7: Standalone BOS Sustainability Environment (UI)

- Status: Done (2026-07-13) - relay PASS, 12/12 criteria, 0 unmet, 0 unknown. All 4 suites green; self-corrected a unit-test failure on iteration 3.
- Environment: Business OS / Sustainability
- Risk: Medium (new frontend surface; no existing page modified)
- Scope: Build the v1 sustainability surface as its own environment behind the login, reading only through the governed T5 endpoints. One ticket (T7 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (decisions 2 and 3).
- Depends on: T5 routes (merged), T6 registry (merged, live).

## Frozen decisions this ticket must honor (ADR 0001)

- **Decision 2**: v1 ships as its **own standalone Business OS environment behind the login**, not as a section of the existing REPE workspace.
- **Decision 3**: the UI **must not** be wrapped in shared workspace chrome. No `RepeWorkspaceShell`, no `DomainWorkspaceShell`, no shared app shell. It renders its own full-bleed layout. (This is a standing operator rule for environment UIs.)
- **Decision 4**: the existing REPE-embedded `SustainabilityWorkspace.tsx` and its two pages are **kept as-is**. The new surface is net-new UI. It must not import from `SustainabilityWorkspace.tsx`.

## Background (verified against the tree)

- Existing standalone env pages are a plain `Suspense` + workspace component, with no shell wrapper (see `repo-b/src/app/lab/env/[envId]/re/sustainability/page.tsx`). That is the pattern to follow.
- The API client is `repo-b/src/lib/bos-api.ts`, using `bosFetch(path, { params })` returning a typed promise (see `getReV2SustainabilityOverview`).
- Reusable primitives confirmed present: `repo-b/src/components/ui/MetricCard.tsx`, `repo-b/src/components/ui/StateCard.tsx` (null/empty/error), `repo-b/src/components/telemetry/drawerPrimitives.tsx`.
- The governed endpoints (T5) are `/api/re/v2/sustainability/authoritative/{overview,metric/{key},metric/{key}/evidence,context}` taking `business_id`, `env_id`, `entity_scope`, `period_key`, `metric_family`, optional `snapshot_version`.
- The six governed metric keys (T6, live): `scope1_tco2e`, `scope2_location_tco2e`, `scope2_market_tco2e`, `scope3_tco2e`, `energy_intensity_kwh_per_sqft`, `water_intensity_gal_per_sqft`.

## Scope

In scope:

1. **API client** additions in `repo-b/src/lib/bos-api.ts` (additive; do not modify existing exports): `getSusAuthoritativeOverview(params)` and `getSusAuthoritativeMetricEvidence(metricKey, params)`, both `bosFetch` against the T5 `/authoritative/*` paths, with exported response types mirroring the T5 Pydantic models (fields optional/nullable, since the reader is fail-closed).
2. **Workspace component** `repo-b/src/components/sustainability/BosSustainabilityWorkspace.tsx` (new directory; NOT under `components/repe/`):
   - Renders its **own full-bleed layout**. No shared shell import.
   - A governed metric grid: one card per governed metric returned by `/authoritative/overview`, using `MetricCard`.
   - **Fail-closed rendering is the point of this ticket**: when a metric's `value` is `null`, render its `null_reason` verbatim via `StateCard` (or an equivalent explicit state) instead of `0`, `-`, or a blank. When the whole snapshot is unavailable (`null_reason: "snapshot_unavailable"`), the page renders an explicit unavailable state naming the reason, not an empty grid.
   - Surface the governance header from the reader payload: `snapshot_version`, `promotion_state`, `trust_status`, and `period_exact`. A snapshot that is not `released` or not `trusted` must be visibly marked, not silently shown as if it were.
3. **Route** `repo-b/src/app/app/sustainability/page.tsx`: a client page that renders `BosSustainabilityWorkspace` inside `Suspense`, with **no shell wrapper**, mirroring the existing standalone env page pattern.

Out of scope (explicit):
- The evidence drawer (T8 owns it; T7 only needs the metric cards to be clickable-ready, but must not build the drawer).
- Report center (T9), AI copilot panel (T10), any write/intake path.
- Any change to `SustainabilityWorkspace.tsx`, the existing REPE sustainability pages, the T4 reader, T5 routes, or any backend file.
- Seeding or releasing an authoritative snapshot. With no released snapshot in the demo env, the correct v1 behavior is the fail-closed `snapshot_unavailable` state, and this ticket must render that honestly.

## Acceptance Criteria

### Screen
- A new route `/app/sustainability` exists at `repo-b/src/app/app/sustainability/page.tsx` and renders `BosSustainabilityWorkspace` inside `Suspense`.
- The page and the workspace import **no** shared workspace shell: the strings `RepeWorkspaceShell`, `DomainWorkspaceShell`, and any import from `@/components/repe/sustainability/SustainabilityWorkspace` are absent from both new files.
- The workspace renders a governed metric card per metric from `/authoritative/overview`, and renders `snapshot_version`, `promotion_state`, and `trust_status` from the reader payload.
- When the reader returns `null_reason: "snapshot_unavailable"`, the page renders an explicit unavailable state that names that reason. It does not render an empty grid, a zero, or a dash.
- When an individual metric's `value` is `null`, its card shows the metric's `null_reason` rather than `0` or a blank.

### API
- New additive exports in `repo-b/src/lib/bos-api.ts` call the T5 endpoints `/api/re/v2/sustainability/authoritative/overview` and `/api/re/v2/sustainability/authoritative/metric/{key}/evidence` via `bosFetch`. No existing export is modified.

### DB/Data
Not applicable (read-only UI over the governed endpoints; no direct table access).

### AI behavior
- The UI never computes a sustainability metric client-side and never substitutes a fallback number. Every displayed value comes from the governed reader payload, and every absent value renders its `null_reason`. A grep of the new files finds no arithmetic on metric values and no `?? 0` / `|| 0` fallback applied to a metric value.

### Evals/tests
- A new test `repo-b/src/components/sustainability/__tests__/BosSustainabilityWorkspace.test.tsx` renders the workspace with a mocked client and asserts: (1) a released snapshot renders a card per metric plus the `snapshot_version` / `trust_status`; (2) a `snapshot_unavailable` payload renders the explicit unavailable state naming the reason, and renders no `0`; (3) a metric whose `value` is `null` renders its `null_reason` and not `0`.
- `cd repo-b && npm run lint`, `npm run typecheck`, and `npm run test:unit` pass.

### Regression guard
- Only these are added/changed: `repo-b/src/app/app/sustainability/page.tsx` (new), `repo-b/src/components/sustainability/BosSustainabilityWorkspace.tsx` (new), its new test, additive exports in `repo-b/src/lib/bos-api.ts`, and this plan.
- `repo-b/src/components/repe/sustainability/SustainabilityWorkspace.tsx`, `repo-b/src/app/app/repe/sustainability/page.tsx`, and `repo-b/src/app/lab/env/[envId]/re/sustainability/page.tsx` are untouched.
- No backend file, schema file, or existing `bos-api.ts` export is modified.
