# 0028 - Sustainability T8: Evidence Drawer (metric to source lineage)

- Status: Done (2026-07-13) - relay 12/13, 0 unmet. The 1 "unknown" (A1) was a reviewer blind spot: the builder correctly REUSED T7's bos-api export instead of duplicating it, so the file was absent from the diff and Codex could not confirm a criterion about it. Verified by hand: export exists at bos-api.ts:7230 and the drawer calls it.
- Environment: Business OS / Sustainability
- Risk: Low (additive frontend component on the T7 surface)
- Scope: Make every governed sustainability metric inspectable: click a metric, see the snapshot it came from and the source rows behind it. One ticket (T8 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md`
- Depends on: T5 routes (merged), T7 standalone workspace (merged).

## Background (verified against the tree)

- Drawer chrome already exists and must be reused, not rebuilt: `repo-b/src/components/telemetry/drawerPrimitives.tsx` exports `DrawerWrapper`, `DrawerHeader`, `FieldRow`, and `MetricInspectorDrawer`. **Do not add a drawer library and do not hand-roll new drawer chrome.**
- The evidence endpoint exists (T5): `GET /api/re/v2/sustainability/authoritative/metric/{metric_key}/evidence`, returning rows shaped `{metric_key, source_table, source_row_ref, emission_factor_set_id, ingestion_run_id, formula_id}` (from the T4 reader's `evidence` list).
- The T7 workspace (`repo-b/src/components/sustainability/BosSustainabilityWorkspace.tsx`) renders a card per governed metric and already holds the reader payload, which carries `snapshot_version`, `promotion_state`, `trust_status`, `period_exact`, and per-metric `null_reason`.

## The point of this ticket

A governed number is only trustworthy if you can see where it came from. The drawer is the audit surface: metric -> snapshot version -> the source rows and emission-factor set that produced it. It must be equally honest when there is nothing to show: a metric with a `null_reason` must open a drawer that explains **why there is no value**, not an empty panel.

## Scope

In scope:

1. **Client** in `repo-b/src/lib/bos-api.ts` (additive only): `getSusAuthoritativeMetricEvidence(metricKey, params)` calling the T5 evidence endpoint, with an exported row type. (If T7 already added this export, reuse it and do not duplicate.)
2. **Component** `repo-b/src/components/sustainability/SustainabilityEvidenceDrawer.tsx`:
   - Composed from `drawerPrimitives` (`DrawerWrapper` / `DrawerHeader` / `FieldRow`, or `MetricInspectorDrawer`). No new drawer library, no new drawer chrome.
   - Props: the metric key, the scope params, and the governance fields already on the workspace payload (`snapshot_version`, `promotion_state`, `trust_status`, `period_exact`, the metric's `value` / `unit` / `null_reason`).
   - Renders three sections: (a) **the value and its standing** (value or the `null_reason` verbatim, unit, `trust_status`, `promotion_state`, `period_exact`); (b) **the snapshot** it was read from (`snapshot_version`); (c) **the evidence rows** from the endpoint (`source_table`, `source_row_ref`, `emission_factor_set_id`, `ingestion_run_id`, `formula_id`), one row per source record.
   - **Fail-closed states are first-class, not afterthoughts**: a metric with a `null_reason` opens a drawer that states the reason and shows no fabricated value. An evidence fetch that returns an empty list renders an explicit "no evidence rows for this metric" state, never a silent blank panel. A failed fetch renders an explicit error state.
3. **Wire it into T7**: clicking a metric card in `BosSustainabilityWorkspace` opens the drawer for that metric. Keyboard-accessible (the card is a real button or has an accessible role and opens on Enter/Space).

Out of scope (explicit):
- Report center (T9), AI copilot (T10), any write path, any change to the T4 reader / T5 routes / schema.
- Rebuilding the drawer chrome, adding a drawer/modal dependency, or changing `drawerPrimitives.tsx`.
- Touching `SustainabilityWorkspace.tsx` (the legacy REPE one) or its pages.

## Acceptance Criteria

### Screen
- Clicking a governed metric card in `BosSustainabilityWorkspace` opens `SustainabilityEvidenceDrawer` for that metric; the card is keyboard-operable (button/role with Enter or Space).
- The open drawer shows: the metric's value **or** its `null_reason` verbatim, the `unit`, `trust_status`, `promotion_state`, `period_exact`, and the `snapshot_version` the value was read from.
- The drawer lists the evidence rows returned by the endpoint, showing `source_table`, `source_row_ref`, `emission_factor_set_id`, `ingestion_run_id`, and `formula_id` per row.
- A metric whose `value` is `null` opens a drawer stating its `null_reason` and shows **no** number for that metric (no `0`, no dash-as-value).
- An empty evidence list renders an explicit "no evidence" state; a failed fetch renders an explicit error state. Neither renders a silent blank panel.

### API
- `repo-b/src/lib/bos-api.ts` calls `GET /api/re/v2/sustainability/authoritative/metric/{metric_key}/evidence` for the drawer. No existing export is modified; if T7 already added this export, it is reused rather than duplicated.

### DB/Data
Not applicable (read-only UI over the governed endpoint).

### AI behavior
- The drawer never computes or infers a value: everything it shows comes from the reader payload or the evidence endpoint. A grep of the new component finds no arithmetic on metric values and no `?? 0` / `|| 0` fallback applied to a value. When there is no value, the drawer shows the `null_reason` rather than an invented number.

### Evals/tests
- A new test `repo-b/src/components/sustainability/__tests__/SustainabilityEvidenceDrawer.test.tsx` asserts, with a mocked client: (1) opening the drawer for a metric with a value renders the value, unit, `snapshot_version`, and `trust_status`; (2) opening it for a metric whose `value` is `null` renders its `null_reason` and renders no `0`; (3) evidence rows render `source_table` and `source_row_ref`; (4) an empty evidence list renders the explicit "no evidence" state; (5) a rejected fetch renders the explicit error state.
- A test asserts clicking a metric card in `BosSustainabilityWorkspace` opens the drawer.
- `cd repo-b && npm run lint`, `npm run typecheck`, and `npm run test:unit` pass.

### Regression guard
- Only these are added/changed: `repo-b/src/components/sustainability/SustainabilityEvidenceDrawer.tsx` (new), its new test, the click wiring inside `BosSustainabilityWorkspace.tsx`, an additive export in `repo-b/src/lib/bos-api.ts` if not already present, and this plan.
- `repo-b/src/components/telemetry/drawerPrimitives.tsx` is **not** modified, and no drawer/modal package is added to `package.json`.
- `SustainabilityWorkspace.tsx` (legacy REPE), the existing REPE sustainability pages, all backend files, and all schema files are untouched.
