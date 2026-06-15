# History Rhymes — Design Adaptation

## Purpose in the design system

History Rhymes is a quantitative trading intelligence surface. The visual language should evoke a Bloomberg terminal or trading workstation — dense, high-signal, high-contrast. Every pixel is information. Nothing is decorative.

## Accent choices
- Primary signal: `--nv-amber-400` (regime calls, alerts, signals)
- Gain / long: `--nv-green-400`
- Loss / short: `--nv-red-400`
- Historical analog / pattern: `--nv-copper-400`
- Neutral / hold: `--nv-text-secondary`

## Density
Very high. The trading routine page must show regime, positions, and alerts without scrolling on a 1280px wide screen. Use compact table rows. Use mono font for prices and percentages.

## Component emphasis
- Regime call must be the single most prominent element on the routine page (large text, colored by regime type)
- Position sizing must show: ticker, direction, size, entry, current P&L — all visible in one row
- Alerts must use colored chips with severity level
- Weekly brief should be scannable in under 30 seconds

## Typography rules
- Use mono font for all prices, percentages, and date ranges
- Do not use light font weight for numeric data — at minimum `weight: 500`

## Cockpit primitives (telemetry refactor, 2026-06-12)

The cockpit uses HR-local primitives at `repo-b/src/components/historyrhymes/cockpit/primitives.tsx`, copy-adapted from the telemetry environment's `primitives.tsx` — NOT imported from it. Environments stay standalone; a telemetry restyle must not silently restyle HR.

Palette: bg `#07090c`, rail `#0a0d12`, panel `#0f141c`, panelHi `#131a24`, accent bronze `#d4a85a` (the HR identity color), status family shared by value with telemetry for lab-wide status literacy — green `#3ddc97`, amber `#f3b14a`, red `#ef7066`, cyan `#3fb1e8`. Mono: JetBrains Mono.

HR-specific primitives: `regimeColor()` (expansion→green, recovery→cyan, late_cycle→amber, stagflation→`#e08e45`, crisis→red, unknown→dim), `StatusChip(fresh|stale|missing|degraded)`, `FreshnessDot`, and the two honesty primitives — `DegradedNote({reason, refusal?})` and `CockpitEmptyState({zone, reason, hint})` — which require a concrete reason string by type and are the only way zones render degraded/empty states.

Layout: 224px fixed left rail + full-bleed main (TelemetryShell pattern), mobile drawer. Status-first hierarchy: regime header above the fold, then signal strip, analog timeline, alert rail.

## What this environment must NOT do
- Use soft pastel accents (this is not an executive dashboard)
- Show prices in proportional font (always mono)
- Use a pie chart for portfolio allocation (use a bar chart with percentage labels)
- Present "signal" as a percentage without also showing the underlying basis
