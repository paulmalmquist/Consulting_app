# REPE UI Design Tips

Lessons from building institutional-grade investment analysis surfaces.

## Density Over Decoration

- Use `divide-y` row containers instead of individually bordered cards. Cards add ~16px of visual overhead per item (border + padding + gap). Rows in a single bordered table recover that.
- Target `py-2` to `py-2.5` for data rows, not `py-4`. REPE professionals scan vertically; wasted height slows them down.
- Prefer `rounded-md` (6px) or `rounded-lg` (8px) for panel containers. `rounded-[18px]+` reads as consumer SaaS, not institutional.

## Bar Design

- 5px bars (`h-[5px]`) with `rounded-sm` are the sweet spot for data-dense layouts. Thicker pill-shaped bars (10px `rounded-full`) feel decorative.
- Always include a background track (`bg-[#F1F5F9]`) so empty/small bars have spatial context.
- Normalize bars to the max value in the dataset so the largest item fills the track. This is more scannable than absolute-scale bars that are all tiny.

## Typography Hierarchy

- Data labels: `text-[13px] font-medium` for primary identifiers (asset names, period labels).
- Subordinate metrics: `text-[11px] text-[#94A3B8]` inline with the primary label. Put the number first ("12.5% IRR" not "IRR: 12.5%") for faster scanning.
- Values: `text-[13px] font-semibold tabular-nums` right-aligned in a fixed-width column. `tabular-nums` is mandatory for financial figures.

## Color Discipline

- Blue (`#3B82F6`) = capital called / committed / deployed
- Green (`#059669`) = distributions / realized value / returned capital
- Gray (`#F1F5F9` track, `#94A3B8` text) = baseline / structural
- No decorative color. If a color doesn't encode data, remove it.

## Cross-Panel Alignment

- When two panels sit side-by-side, use `grid items-start` so the shorter one doesn't stretch.
- Match heading structures (same component, same `mt-*` gap to content) so first-row tops align.
- Shared row height rhythm matters more than pixel-perfect alignment. If left rows are 40px and right rows are 36px, the visual cadence still reads as unified.

## Hover States

- `hover:bg-[#F1F5F9]` (subtle background shift) is sufficient for data rows. Avoid border-color changes on hover; they cause layout shifts in dense grids.
- `transition-colors duration-150` keeps it responsive without feeling animated.

## Summary Anchors

- A small "% returned of capital called" bar at the bottom of a capital activity panel gives instant context without requiring the user to mentally sum the rows.
- Keep these anchors under 40px tall with `text-[10px]`. They are context, not content.

## Color Legends

- When removing per-row text labels (e.g., "Capital Called" / "Distributed") in favor of color-coded bars, add a minimal legend near the section heading: `text-[10px]` with small color chips.
- This recovers scanability while saving ~24px per row.

## Shell Layout Density (March 2026)

- The WinstonShell three-column grid uses `xl:gap-5 xl:px-6 xl:py-2` — tighter than the original `gap-6 px-8 py-4`. Premium finance UIs earn density; extra padding reads as template filler.
- The ThemeToggle belongs in the top-right utility nav cluster (after Home/Funds/Investments/Assets), not floating above the sidebar. Grouping controls into one horizontal system reduces visual fragmentation.
- Sidebar docking: use `rounded-2xl` with `shadow-none` and lighter border opacity (`border-bm-border/50`) to make the sidebar read as structural navigation, not a floating card. Heavy `rounded-[30px]` + deep shadows feel consumer-grade.
- A faint left border on the main content pane (`xl:border-l xl:border-bm-border/[0.06]`) creates sidebar–content separation without a visible divider line.
- RepeIndexScaffold: `space-y-5` between sections, `space-y-3` between title block and KPI strip, `py-2.5` on the title container. The gap between title and first data element is where "airy" pages lose credibility.
