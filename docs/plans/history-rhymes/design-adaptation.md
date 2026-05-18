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

## What this environment must NOT do
- Use soft pastel accents (this is not an executive dashboard)
- Show prices in proportional font (always mono)
- Use a pie chart for portfolio allocation (use a bar chart with percentage labels)
- Present "signal" as a percentage without also showing the underlying basis
