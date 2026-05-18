# Stone PDS — Design Adaptation

## Purpose in the design system

Stone PDS is a professional services operations surface. It serves delivery managers, executives, and client relationship owners. The visual language should feel like a well-organized operations control tower — professional, dense but not overwhelming, with clear KPI hierarchy.

## Accent choices
- Primary: `--nv-purple-400`
- Utilization alerts (under-utilized): `--nv-amber-400`
- Utilization good: `--nv-success`
- Revenue positive variance: `--nv-green-400`
- Revenue negative variance: `--nv-red-400`

## Density
Medium. Executive summary pages should be scannable. Operational detail pages (timecards, resource allocation) may be denser.

## Component emphasis
- Utilization metric must be a prominent KPI card, not buried in a table
- Revenue vs. forecast variance must use directional color (green/red), not neutral gray
- Project status indicators must be visible in the project list row without expanding
- AI briefing must have a distinct visual container (not blend into body text)

## What this environment must NOT do
- Show utilization as a chart when a KPI card is more readable
- Use generic loading spinners without per-card skeletons
- Show revenue figures without a period context (always "as of [date]")
