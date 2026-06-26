# 0014 — Telemetry Phase 9B: Overview Event Backdrop + Sidebar Icon-Rail

Status: **9B-A shipped**, 9B-B planned. Two independently shippable PRs.

## Why

The telemetry Overview opens the demo with an editorial thesis and the Spaceflight Bottleneck Map. Two
presentation-layer polishes, over existing/correct data and routing — no backend, schema, evidence, or
export change:

- **9B-A.** When a Bottleneck Map event is selected, the hero band transitions to an era-appropriate
  illustrative backdrop (streaming-detail-preview polish, aerospace language — "Era context",
  "Backdrop: illustrative"). Click/selection-driven only.
- **9B-B.** The left rail becomes a grouped icon system: each group its own icon row, multi-item groups
  collapsible (one open by default), and the whole rail collapses to an icon-only column.

## PR 9B-A — Overview event backdrop (shipped)

- `context/BottleneckMap/types.ts` — `EventBackdrop` interface; optional `LaunchEvent.backdrop`.
- `context/BottleneckMap/data.ts` — `THEME_BACKDROPS` (keyed off `InnovationKey`, tones echo
  `INNOVATION`) + `resolveBackdrop(event)` (per-event override → era theme → null).
- `public/telemetry/backdrops/{mission,cost,reuse,manufacturing,dataops}.svg` + `README.md` —
  hand-authored abstract vector motifs, labeled illustrative/generative (not photos, not evidence).
- `OverviewBackdrop.tsx` + `.module.css` — base wash + keyed fade theme layer (`role="img"` + alt) +
  scrim + honesty caption. **Scrim reaches full `C.bg` before the chart, so the Bottleneck Map plotting
  area is never behind the backdrop** (contrast and selected-dot emphasis unchanged). CSS background
  (not `<img>`) → missing asset degrades to the tone wash, no broken-image glyph. Motion CSS-only,
  respects `prefers-reduced-motion`.
- `BottleneckMap.tsx` — additive optional `onSelectedEventChange` callback (fires on mount + every
  click/presenter change).
- `TelemetryOverview.tsx` — holds `selectedEvent`, renders backdrop behind hero (zIndex 0), content at
  zIndex 1. `SourceHonestyStrip`/`EventRecord` unchanged — no metric/evidence value moves.
- Tests: `context/BottleneckMap/backdrop.test.ts`, `OverviewBackdrop.test.tsx`, extended
  `TelemetryOverview.test.tsx`. Green: vitest, `tsc -p tsconfig.typecheck.json`, `next lint`.

## PR 9B-B — Sidebar grouped icon rail (planned)

Base on post-8H `main` (the ADE cross-link is already removed; **do not restore it**). Group icon
metadata in `telemetryNav.ts`; accordion + collapse rewrite in `TelemetrySidebar.tsx`; collapse state +
animated rail width (64↔224) + localStorage hydration in `TelemetryShell.tsx`. Collapsed group icons are
buttons that expand the rail and open the group (no immediate navigation). Operations open by default;
colors preserved; mobile drawer unchanged. Tests update `TelemetrySidebar.test.tsx` to the new contract
(routability preserved by expanding groups) + an 8H regression guard asserting the ADE link stays absent.
