# Dispatch Record 0009 — Telemetry Page Header System Migration

**Created:** 2026-06-24
**Status:** IN PROGRESS — Ticket 1 (foundation + Overview hero) DONE + merged. Tickets 2–4 open.
**Environment:** Telemetry Platform (`repo-b/src/app/lab/env/[envId]/telemetry/`, `repo-b/src/components/telemetry/`)
**Owner:** lab-environment-winston (frontend support + QA verification)
**ADO:** Epic #497 → Feature #721 "Telemetry Frontend Production-Readiness Refactor". Four focused User
Stories for the migration (existing #693 and #722 do not cover it).
**Deliverable type:** Frontend-only header system + per-route migration. **Risk:** Medium (affects every
telemetry route; introduces editorial title typography on headers).

> Discrepancy note: `docs/plans/02-environments/` does not exist — using the canonical
> `docs/plans/telemetry-platform/`. The reference `launch_data_problem_header.jsx` is design-only and is
> NOT imported.

## Header architecture

`repo-b/src/components/telemetry/TelemetryPageHeader.tsx` — one header family:

- **Variants:** `hero` (Overview only), `evidence` (evidence/lineage), `standard` (models/factory),
  `compact` (operational consoles).
- **Props:** `eyebrow`, segmented `title` (typed `TitleSegment[]` with controlled `gradient` emphasis),
  `description`, `metadata` slot, `actions` slot, optional hero `metrics` row.
- **Typography:** hero/evidence titles use the existing editorial font (`var(--font-editorial)`,
  Cormorant Garamond); compact/standard use `var(--font-display)` (Inter Tight); eyebrows, ids,
  timestamps, metrics stay JetBrains Mono (`C.mono`). Colors stay on the `C` palette. Fonts are already
  loaded globally via next/font in `app/layout.tsx` — no new font infra.
- **Gradient** is limited to meaningful phrases — Overview's "Launch"/"Data", and at most one phrase on
  selected evidence headers.
- No fetching/state/invented metadata; callers pass existing values. `PageHeading` stays for nested
  section headings; evidence cards are not globally restyled.

## Tickets

1. **Foundation + Overview proof — DONE.** Add `TelemetryPageHeader` + unit tests; migrate
   `TelemetryOverview.tsx` to `hero` (copy + real Big Numbers preserved; "Launch"/"Data" gradient);
   header-family entry in `component-contracts.md`. Screenshot-verified.
2. **Operations — open.** `compact` on `MissionControlStream`, `ReplayConsole`, `stargate/StargateConsole`,
   `RunsExplorer`, `SystemHealth`, `ControlTower`; standalone `Monitoring`/`SpikeInspector` `compact`
   (embedded modes stay headerless). Preserve live verdicts, lag, controls, chips, timestamps, fail-closed
   states in metadata/action slots.
3. **Models & Factory — open.** `standard` on `ModelPerformance`, `RulCalibration`, `RegistryConsole`,
   `Copilot`, `FactoryNcrIntelligence`, `factory-ml/FactoryMlConsole`. Convert RS console strips without
   changing body data/controls/metrics/evidence-drawer work.
4. **Evidence, lineage & final QA — open.** `evidence` on `metadata/MetricLineageExplorer`,
   `metadata/TelemetryMetadataExplorer`, `GovernanceDashboard`, `HowItWorks`, `EvidenceCards`. Keep
   metadata scope/freshness/generation-time/status/refresh intact. Add `tests/telemetry-page-headers.spec.ts`
   visual-regression; update `design-adaptation.md`, `qa-checklist.md`, `eval-plan.md`, `next-session.md`,
   `docs/tips.md`.

Route wrappers, nav, APIs, DB contracts, page bodies unchanged. Remove only duplicate per-page top
padding/background where needed for shell-aligned headers.

## Acceptance

- All 18 nav pages + the two retained standalone operational routes use the header family.
- Overview is the only full `hero`; operational pages `compact`; evidence pages restrained; standard between.
- Metadata, actions, fail-closed copy, shell, nav, data behavior unchanged.
- Titles wrap cleanly + metadata rows stack without overflow at 390 / 1024 / desktop. Dark-mode text WCAG AA.
- `npm run typecheck` · `npm run lint` · `npx vitest run src/components/telemetry` · `npm run build` ·
  `npx playwright test tests/telemetry-page-headers.spec.ts`. Capture desktop/tablet/mobile evidence for
  Overview, Mission Control, Model Performance, Metadata Explorer, Resume Evidence under
  `telemetry-platform/docs/screenshots/header-system/`.
