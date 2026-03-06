# Fund Performance Page — Redesign Instructions

**Page:** Fund detail → Performance tab
**Reference screenshots:** March 5 2026 session, Institutional Growth Fund VII

---

## Step 0: Tab Bar — Remove Three Tabs

Remove these three tabs from the fund detail tab bar:
- **Scenarios**
- **Waterfall Scenario**
- **Run Center**

The surviving tabs are: Overview | Performance | Asset Variance | LP Summary

That's it. Four tabs. If the removed features are needed later, they live inside a dedicated page, not crammed into the fund tab row. Update navigation and routing accordingly — do not leave orphaned routes.

---

## Step 1: Performance KPI Strip — Compress to One Row, Add Context

The current Performance sub-strip shows 8 metrics across two rows (DPI and RVPI awkwardly drop to a second line). Fix both the layout and the content:

**Layout:**
- Force all 8 metrics onto a single horizontal row using `flex-nowrap` and proportional column widths
- Separate the strip from the tab row with a single 1px border-bottom, not a full card or box-shadow
- Exact metrics and order: CASH-ON-CASH · GROSS IRR · NET IRR · G→N SPREAD · GROSS TVPI · NET TVPI · DPI · RVPI

**Content — add secondary context lines under the three most important metrics:**

Under GROSS IRR (12.4%):
```
12.4%
↑ +160bps vs. 2022 vintage median
```

Under NET IRR (9.9%):
```
9.9%
as of 2026Q1
```

Under G→N SPREAD (258bps):
```
258bps
Target carry: 200–300bps  ✓
```

The secondary lines should be in 10px text, `text-slate-400`, no bold. This gives a PM something to react to instead of a raw number floating in space.

---

## Step 2: Gross vs Net Comparison Chart — Tear It Down and Rebuild

The current chart is broken in a fundamental way. Two pairs of floating bars are positioned at opposite ends of a 1400px-wide card, separated by ~700px of empty white. It looks like a chart that forgot to render. Kill it entirely and replace it with one of the two options below.

**Recommended replacement: Grouped Bar Chart (4 bars, 2 groups)**

Group 1 — IRR:
- Bar A: Gross IRR (12.4%) — sky-400 (#38BDF8)
- Bar B: Net IRR (9.9%) — emerald-400 (#34D399)

Group 2 — TVPI:
- Bar A: Gross TVPI (1.08x) — sky-400
- Bar B: Net TVPI (1.02x) — emerald-400

Render on a shared y-axis. IRR group uses percentage scale (left axis). TVPI group uses multiple scale (right axis, or normalize to % of max for visual comparison). The two groups should be close together — 40px gap between groups, 8px gap between bars within a group. No isolated floating bars.

**Card constraints:**
- Max width: 520px (half the current card width — do not let a 4-bar chart span the full page)
- Height: 240px
- Place card on the LEFT half of the row
- Place the Gross → Net Bridge card on the RIGHT half of the same row (see Step 3)

**Alternatively:** If the two-axis grouped bar is complex to implement cleanly, replace the chart entirely with a **comparison table**:

| Metric | Gross | Net | Drag |
|--------|-------|-----|------|
| IRR | 12.4% | 9.9% | −250bps |
| TVPI | 1.08x | 1.02x | −0.06x |
| DPI | 0.08x | 0.07x | — |
| Cash-on-Cash | 6.5% | — | — |

Style as a tight data table with alternating row shading (`bg-slate-50` on odd rows), no borders, column headers in `text-xs uppercase tracking-wide text-slate-400`. This is actually more readable for a PM than any bar chart.

---

## Step 3: Gross → Net Bridge — Replace Text List With a Real Waterfall

The current Gross → Net Bridge is a plain text list. It reads like a comment in a spreadsheet, not a financial visualization. Replace it with a horizontal waterfall chart:

**Layout (left to right):**
1. **Gross IRR** — full-height bar, sky-400, label "12.4%" above
2. **−Mgmt Fees** — red downward bar from the gross level, label "−23bps" above (convert $375K to bps if possible, or show "$375K" below bar)
3. **−Fund Expenses** — red downward bar, label "−16bps" / "$255K"
4. **−Carry (Shadow)** — red downward bar, label shows the value (currently blank — seed a value: carry shadow on 12.4% Gross IRR at ~20% carry ≈ ~250bps, so approximately "$960K" or "~250bps")
5. **Net IRR** — resulting bar at 9.9%, emerald-400, label "9.9%" above

Between each bar, draw a thin dashed connector line at the "step" level so the eye follows the cascade.

If building this as a Recharts component, use a stacked bar with invisible base bars to achieve the waterfall float effect — this is the standard Recharts waterfall pattern.

**Card constraints:**
- Width: fills the RIGHT half of the two-card row (paired with Gross vs Net on the left)
- Height: 240px
- Same card style as the left card

**Critical fix: seed the Carry (Shadow) value.** It currently shows blank. The bridge is nonsensical without it. Back-calculate: if Gross IRR = 12.4% and Net IRR = 9.9%, total drag = 250bps. Management Fees = ~23bps, Fund Expenses = ~16bps, so Carry = 250 − 23 − 16 = 211bps. Seed this value and display it.

---

## Step 4: Side-by-Side Card Layout (Steps 2 + 3 Together)

The current layout stacks Gross vs Net and Gross → Net Bridge vertically as full-width cards. They should live side by side:

```
┌───────────────────────────┐ ┌───────────────────────────┐
│  GROSS VS NET             │ │  GROSS → NET BRIDGE       │
│  Comparison chart or      │ │  Waterfall chart           │
│  comparison table         │ │                           │
│                           │ │  Gross IRR → fees →       │
│  [4-bar grouped chart]    │ │  carry → Net IRR          │
└───────────────────────────┘ └───────────────────────────┘
```

Use `grid grid-cols-2 gap-6` on a container div. Each card gets a `rounded-lg border border-slate-100 bg-white p-6`. No box shadows — keep it flat and clean.

---

## Step 5: Typography and Spacing Tightening

The current page has too much vertical breathing room between sections, making it feel empty rather than dense and professional.

**Specific fixes:**
- Reduce the top padding of the performance KPI strip from whatever it currently is to `pt-4 pb-3`
- Reduce the gap between the KPI strip and the chart row to `mt-5` (not `mt-8` or larger)
- Section headers like "GROSS VS NET COMPARISON" and "GROSS → NET BRIDGE" should be `text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3` — currently they appear as generic section labels; give them the same mono-label treatment used elsewhere in the platform
- Remove any padding inside the chart cards that is greater than `p-6` — the current cards feel cavernous

---

## Step 6: Color Discipline

The current chart uses a muted blue-purple for Gross bars and a pale mint green for Net bars. The contrast is weak. Use the platform accent palette:

- **Gross metrics:** `#38BDF8` (sky-400) — bright, primary
- **Net metrics:** `#34D399` (emerald-400) — distinct, positive green
- **Fee drag bars (waterfall):** `#F87171` (red-400) — immediately communicates cost
- **Net IRR result bar (waterfall):** `#34D399` — same as Net metrics above

Do not use the default Recharts color palette (blue-500, green-500). These are too saturated and inconsistent with the rest of the platform.

---

## Summary of Changes

| Change | Action |
|--------|--------|
| Remove Scenarios tab | Delete from tab bar + route |
| Remove Waterfall Scenario tab | Delete from tab bar + route |
| Remove Run Center tab | Delete from tab bar + route |
| Performance KPI strip | Single row, add secondary context lines under Gross IRR, Net IRR, G→N Spread |
| Gross vs Net chart | Rebuild as grouped 4-bar chart (or comparison table) — eliminate floating isolated bars |
| Gross → Net Bridge | Replace text list with horizontal waterfall chart |
| Layout | Side-by-side cards (2-column grid) for the two chart cards |
| Carry (Shadow) | Seed value so the waterfall doesn't have a blank line |
| Spacing | Tighten vertical gaps throughout — reduce `mt` and `pt` values |
| Colors | Apply sky-400 / emerald-400 / red-400 palette |
