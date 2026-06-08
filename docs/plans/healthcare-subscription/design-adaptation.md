# Design adaptation — Healthcare Subscription Analytics

## Hard rule: standalone, no app shell

The environment UI is its own full-bleed design. It is **not** wrapped in
`DomainWorkspaceShell`, `RepeWorkspaceShell`, or any shared app chrome. `page.tsx` is a thin
async wrapper that renders the client component directly; the client component owns its
background, header, KPI grid, drawer, and footer. This is a standing preference — every env
ships standalone unless told otherwise.

Precedent followed: `repo-b/src/app/lab/env/[envId]/telemetry/page.tsx` →
`TelemetryOverview` (self-contained, inline palette).

## Visual language

Bespoke health-tech, dark, teal-accented (distinct from the telemetry cyan console). The
palette lives inline in `OverviewClient.tsx` (`const C = {…}`):

- background `#0a1413`, panels `#0f1d1b`/`#12302b`, border `#1d3a35`
- accent teal `#2dd4bf`, soft `#5eead4`; good `#34d399`, warn `#fbbf24`, bad `#fb7185`
- matches the env template `theme_tokens` in the migration: `accent '168 76% 42%'`, `glow '45, 212, 191'`

Feel: membership lifecycle, growth engine, subscription economics, retention engine, care
operations. Not an EMR, not a patient portal, not a generic SaaS template.

## Required UI elements (every hha surface)

1. **Non-dismissible NO-PHI banner** — "Synthetic demo · no PHI. Business analytics only…"
2. **Metric-definition drawer** — click any KPI → formula / grain / owner / source (the
   "one definition per metric" contract made visible).
3. **Freshness + provenance footer** — as-of date, refresh time, and an honest provenance
   label ("synthetic gold rollup (seeded)").

## Reuse note for Phase 2

The `C` palette and the `KpiCard` / `Drawer` / `Banner` primitives in `OverviewClient.tsx`
should be extracted into a shared `repo-b/src/components/healthcare-subscription/primitives.tsx`
when the second surface (Funnel/Cohorts) lands, so all surfaces stay visually consistent
without a shell.
