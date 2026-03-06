# Winston Asset Cockpit Redesign

**TASK: Redesign the Winston asset cockpit from admin-template aesthetic to analyst-console aesthetic (Bloomberg/Datadog/Palantir density). Touch only the files listed below. Do not change data fetching, routing, or business logic.**

---

## Repo Context (Actual File Paths)

```
Tailwind Config:        repo-b/tailwind.config.js
Asset Page:             repo-b/src/app/app/repe/assets/[assetId]/page.tsx
Cockpit Components:     repo-b/src/components/repe/asset-cockpit/
  CockpitSection.tsx    (240 lines — main orchestrator)
  KpiCard.tsx           (75 lines — individual metric cards)
  ModelInputsSection.tsx
  ValuationReturnsSection.tsx
  OpsAuditSection.tsx
Charts:                 repo-b/src/components/charts/
  QuarterlyBarChart.tsx
  TrendLineChart.tsx
  SparkLine.tsx
  chart-theme.ts        (color palette + tooltip styles)
UI Base:                repo-b/src/components/ui/Card.tsx
Sidebar:                repo-b/src/components/bos/Sidebar.tsx
Winston Command Bar:    repo-b/src/components/commandbar/
  AssistantShell.tsx     (174 lines — dialog shell)
  ConversationPane.tsx   (103 lines — chat transcript)
  GlobalCommandBar.tsx   (21KB — main orchestrator)
Winston Wrapper:        repo-b/src/components/winston/WinstonInstitutionalShell.tsx
```

## Current Design Tokens (from `tailwind.config.js` + CSS variables)

```
--bm-bg:             216 31% 6%          (Deep dark blue)
--bm-bg-2:           216 30% 7.5%
--bm-surface:        217 29% 9%          (Elevated panels)
--bm-surface-2:      216 22% 11%         (Higher elevation)
--bm-border:         0 0% 100%           (White, very low alpha)
--bm-border-strong:  214 16% 34%
--bm-text:           210 24% 94%         (Off-white)
--bm-text-muted:     215 12% 72%
--bm-text-muted-2:   215 10% 58%
--bm-accent:         216 74% 55%         (#3878E0 — electric blue)
--bm-success:        142 64% 40%         (Green)
--bm-warning:        38 85% 50%          (Amber)
--bm-danger:         0 72% 48%           (Red)
```

## Current Chart Colors (from `chart-theme.ts`)

```
revenue:  hsl(216, 74%, 55%)   → Blue
opex:     hsl(0, 72%, 48%)     → Red
noi:      hsl(142, 64%, 40%)   → Green
warning:  hsl(38, 85%, 50%)    → Amber
```

---

## A. New Data Contract — `AssetCockpitModel`

**Create:** `repo-b/src/components/repe/asset-cockpit/_types.ts`

```typescript
export type KpiDef = {
  key: string;
  label: string;
  value: number | null;
  delta?: number | null;
  fmt: "money" | "pct" | "bps" | "number";
  polarity?: "up_good" | "down_good" | "neutral";
};

export type SeriesPoint = { t: string; v: number };

export type AssetCockpitModel = {
  asset: {
    id: string;
    name: string;
    city: string;
    state: string;
    type: string;
    fundName: string;
    status: "performing" | "watchlist" | "distressed";
  };
  kpis: KpiDef[];
  series: {
    revenue: SeriesPoint[];
    noi: SeriesPoint[];
    opex: SeriesPoint[];
    occupancy: SeriesPoint[];
    value: SeriesPoint[];
  };
  loan?: {
    balance?: number;
    ltv?: number;
    dscr?: number;
    debtYield?: number;
    rate?: number;
    maturity?: string;
  };
  flags?: Array<{
    level: "info" | "warn" | "bad";
    message: string;
    t?: string;
  }>;
};
```

**Create:** `repo-b/src/components/repe/asset-cockpit/_adapters.ts`
Map the existing DB fetch (from `page.tsx`'s `fetchAssetDetail()`) into this shape. All cockpit components consume `AssetCockpitModel` instead of raw DB rows.

---

## B. Replace KPI Cards with `KpiStrip`

**Modify:** `repo-b/src/components/repe/asset-cockpit/CockpitSection.tsx`

Replace the `grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` card grid with a single inline metrics strip. No boxes, no cards. Bloomberg terminal style.

**New component:** `repo-b/src/components/repe/asset-cockpit/KpiStrip.tsx`

```
Layout: flex row, items-baseline, gap-8, border-b border-bm-border/30, pb-3, mb-4
Each metric:
  Label:  text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono
  Value:  text-lg font-semibold text-bm-text font-display tabular-nums
  Delta:  text-xs ml-1.5 font-mono
          positive → text-bm-success
          negative → text-bm-danger
          neutral  → text-bm-muted
No background. No border. No card. Just data.
```

**Target rendering:**

```
NOI        REVENUE     OCCUPANCY    VALUE       CAP RATE    NAV
$4.7M      $6.3M       92.0%        $59.8M      6.3%        $39.0M
+263.6%    +12.1%      +0.0pp       +4.5%       -30bps
```

---

## C. Create `Panel` Component (Replace Card Zoo)

**Create:** `repo-b/src/components/repe/asset-cockpit/Panel.tsx`

One reusable panel frame. All charts and data blocks use this instead of ad-hoc `<div className="rounded-xl border ...">` wrappers.

```
Props:
  title: string              (uppercase section label)
  controls?: ReactNode       (right-aligned — dropdowns, toggles)
  children: ReactNode        (chart or content)
  footer?: ReactNode         (optional bottom strip)
  className?: string         (size overrides)

Styling:
  bg-bm-surface/40
  border border-bm-border/20
  rounded-lg                 (not xl — subtler corners)
  p-0                        (content fills to edge)
  Title bar: px-4 pt-3 pb-2, flex justify-between items-center
    Title: text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono
    Controls: same text style
  Content: px-0 pb-0         (charts fill edge-to-edge within panel)
```

---

## D. Main Analysis Grid Layout

**Modify:** `CockpitSection.tsx` composition.

Replace the current vertical stack of card groups with a 12-column grid:

```
<KpiStrip kpis={model.kpis} />

<div className="grid grid-cols-12 gap-3">
  {/* Row 1: Two large panels */}
  <Panel title="Revenue & NOI" className="col-span-7">
    <TrendLineChart ... />         {/* Revenue + NOI overlaid */}
  </Panel>
  <Panel title="Occupancy" className="col-span-5">
    <TrendLineChart ... />         {/* Occupancy trend */}
  </Panel>

  {/* Row 2: P&L and Value */}
  <Panel title="Quarterly P&L" className="col-span-7">
    <QuarterlyBarChart ... />
  </Panel>
  <Panel title="Asset Value" className="col-span-5">
    <TrendLineChart ... />
  </Panel>

  {/* Row 3: Loan health strip */}
  <Panel title="Debt Profile" className="col-span-12">
    <LoanHealthStrip loan={model.loan} />
  </Panel>
</div>
```

---

## E. Chart Styling Upgrade

**Modify:** `repo-b/src/components/charts/chart-theme.ts`

Shift from flat Recharts defaults to Datadog-style glow lines:

```typescript
// Upgrade chart colors to luminous accent palette
CHART_COLORS = {
  revenue:  "#00E5FF",    // Electric cyan
  noi:      "#3BFF7C",    // Neon green
  opex:     "#FF4D6D",    // Hot coral
  value:    "#4EA1FF",    // Soft blue
  warning:  "#FFBE0B",    // Gold
  muted:    "hsl(215, 10%, 30%)",
  muted2:   "hsl(215, 10%, 22%)",

  // Scenario palette (5 distinct)
  scenario: ["#00E5FF", "#3BFF7C", "#FFBE0B", "#FF4D6D", "#A78BFA"],

  // Grid and axis
  grid:     "hsl(215, 10%, 16%)",    // Barely visible
  axis:     "hsl(215, 12%, 40%)",
};
```

**Modify:** `TrendLineChart.tsx` and `QuarterlyBarChart.tsx`:

```
CartesianGrid:   strokeOpacity={0.12}  strokeDasharray="3 3"
Line strokes:    strokeWidth={2}  dot={false}  (remove dots — they add noise)
                 activeDot={{ r: 3, fill: color, stroke: color, strokeWidth: 1 }}
Bar strokes:     radius={[2, 2, 0, 0]}  (keep current)
Background:      <rect> fill with panel background so charts don't float
```

**Add glow effect for active line** (optional CSS filter on hover):

```css
.chart-line-active {
  filter: drop-shadow(0 0 6px currentColor);
}
```

---

## F. Crosshair + Synced Tooltips (The "Pro Software" Moment)

**This is the single change that makes it feel like real finance software.**

**Create:** `repo-b/src/components/repe/asset-cockpit/useCrosshairSync.ts`

A React context + hook that shares the currently-hovered X-axis value (quarter label) across all charts in the cockpit.

```typescript
const CrosshairContext = createContext<{
  activeT: string | null;
  setActiveT: (t: string | null) => void;
}>({ activeT: null, setActiveT: () => {} });
```

Each Recharts `<Tooltip>` and `<ReferenceLine>` reads from this context. When the user hovers over Q2 2025 on the Revenue chart, ALL charts show their Q2 2025 data simultaneously.

Implementation: wrap the cockpit grid in `<CrosshairProvider>`, then in each chart's `onMouseMove` handler, call `setActiveT(payload?.activeLabel)`. Each chart renders a vertical `<ReferenceLine x={activeT} stroke={accent} strokeDasharray="3 3" />` when `activeT` matches a point in its data.

---

## G. Sidebar Density Pass

**Modify:** `repo-b/src/components/bos/Sidebar.tsx`

Current sidebar uses `w-56` (224px). That's fine for width, but the content styling needs density:

```
Nav items:
  Current:  py-2 text-sm
  Change:   py-1.5 text-[13px] font-medium
  Active:   border-l-2 border-l-bm-accent bg-bm-surface/20
  Hover:    bg-bm-surface/15
  Icon:     w-4 h-4 opacity-60 (smaller, more muted)

Section headers:
  Current:  text-xs uppercase
  Change:   text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-mono
            mb-1 mt-4 px-3

Remove any rounded-lg on nav items. Use sharp left-edge highlight only.
```

---

## H. Asset Header Redesign

**Modify:** The header section in `page.tsx` (lines 125-180).

Replace the current breadcrumb + title + Generate Report layout with:

```
┌─────────────────────────────────────────────────────────────┐
│ ● Performing   Cascade Multifamily                          │
│ Value-Add Multifamily · Aurora, CO · Denver MSA             │
│ Institutional Growth Fund VII                               │
│                                                             │
│                     [Generate Report] [Open Model] [Chat]   │
└─────────────────────────────────────────────────────────────┘
```

Where:
- `● Performing` = asset health indicator (green dot + label)
  Use `bm-success` for Performing, `bm-warning` for Watchlist, `bm-danger` for Distressed
- Asset name in `font-display text-xl font-semibold`
- Property type / location / MSA in `text-sm text-bm-muted`
- Fund name in `text-xs text-bm-muted2`
- Right side: action buttons in `text-sm` with border variants
- `[Chat]` button opens the Winston command bar (already built in `commandbar/`)

**Quick Stats row** (below header, above tabs):

```
Units: 240  ·  Year Built: 2008  ·  Loan: $28.35M  ·  LTV: —  ·  DSCR: —
```

`text-xs text-bm-muted font-mono` — one line, pipe-separated, no cards.

---

## I. Winston Drawer Wiring

**The chat component already exists** in `repo-b/src/components/commandbar/`. The `AssistantShell.tsx` renders a dialog with `ConversationPane.tsx`. The `GlobalCommandBar.tsx` orchestrates plan/confirm/execute stages.

**What needs to happen:**

1. The `[Chat]` button on the asset header calls the existing `GlobalCommandBar` open function
2. The command bar receives asset context on open:
   ```typescript
   {
     assetId: params.assetId,
     assetName: detail?.asset.name,
     currentKpis: model.kpis,
     hoveredTimestamp: crosshairContext.activeT,  // from synced crosshair
     uploadedDocCount: attachments.length,
   }
   ```
3. The `ConversationPane.tsx` empty state should show contextual example queries:
   ```
   "Why did NOI jump in 2026Q1?"
   "Are we about to breach our loan covenant?"
   "What happens if occupancy drops to 88%?"
   "Show me the 5 most dangerous clauses in the loan agreement."
   ```
4. If `uploadedDocCount === 0`, show a soft nudge: "Upload documents in Ops & Audit to unlock document-grounded answers."

---

## J. `LoanHealthStrip` — New Component

**Create:** `repo-b/src/components/repe/asset-cockpit/LoanHealthStrip.tsx`

Replaces the current bottom-of-cockpit `DSCR: — | LTV: — | Debt Yield: —` badges.

```
Layout: flex row, 5 metrics inline, border-t border-bm-border/20
Each metric:
  Label: text-[10px] uppercase tracking-wide text-bm-muted2 font-mono
  Value: text-sm font-semibold text-bm-text tabular-nums
  Color: DSCR < 1.20 → text-bm-warning
         DSCR < 1.10 → text-bm-danger
         LTV > 75%   → text-bm-warning

Metrics: Loan Balance | Rate | LTV | DSCR | Debt Yield | Maturity
```

---

## File Change Summary

| File | Action | Description |
|---|---|---|
| `asset-cockpit/_types.ts` | **Create** | AssetCockpitModel type + KpiDef |
| `asset-cockpit/_adapters.ts` | **Create** | DB rows → model mapper |
| `asset-cockpit/KpiStrip.tsx` | **Create** | Inline metrics strip (replaces KPI cards) |
| `asset-cockpit/Panel.tsx` | **Create** | Reusable panel frame |
| `asset-cockpit/LoanHealthStrip.tsx` | **Create** | Debt metrics inline strip |
| `asset-cockpit/useCrosshairSync.ts` | **Create** | Shared hover context for chart sync |
| `asset-cockpit/CockpitSection.tsx` | **Modify** | New grid layout, use Panel, KpiStrip |
| `asset-cockpit/KpiCard.tsx` | **Deprecate** | Replaced by KpiStrip |
| `charts/chart-theme.ts` | **Modify** | Luminous accent colors, dimmer grid |
| `charts/TrendLineChart.tsx` | **Modify** | Remove dots, add glow, read crosshair |
| `charts/QuarterlyBarChart.tsx` | **Modify** | Dimmer grid, read crosshair |
| `bos/Sidebar.tsx` | **Modify** | Tighter spacing, mono labels, sharper active state |
| `repe/assets/[assetId]/page.tsx` | **Modify** | New header, Chat button, quick stats row |
| `commandbar/ConversationPane.tsx` | **Modify** | Asset-context example queries |

**Files NOT changed:** Data fetching, routing, API calls, DB schema, business logic, auth. This is a pure presentation-layer pass.

---

## Visual Direction Summary

```
Current:   White cards → rounded containers → flat charts → padding everywhere
Target:    No cards → inline metrics → luminous charts → edge-to-edge density

Current:   React admin template
Target:    Bloomberg Terminal + Datadog + Palantir Foundry

Current:   6 KPI cards in a 2×3 grid
Target:    1 KpiStrip — inline, borderless, tabular-nums

Current:   Charts in separate white boxes
Target:    Charts in flush Panel tiles, synced crosshair on hover

Current:   Winston command bar exists but disconnected from asset context
Target:    [Chat] button in header, pre-loaded with asset KPIs + doc count
```
