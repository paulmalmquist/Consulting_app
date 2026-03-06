# Winston Sitewide Visual Consistency Pass

**TASK: Apply the analyst-console aesthetic established in the asset cockpit redesign across the entire Winston platform. This prompt covers (1) the global shell and navigation, (2) the admin Control Tower, and (3) the REPE funds and fund-level pages. Touch only presentation-layer code — no data fetching, routing, or business logic changes.**

The target aesthetic is Bloomberg Terminal + Datadog + Linear. Dense, monochrome-adjacent, sharp edges, no decorative chrome, monospace labels on all metadata.

---

## Shared Design Rules (Apply Everywhere)

These rules supersede whatever is currently in each component. When in doubt, apply these.

```
Corner radius:    rounded-lg everywhere (8px). Never rounded-xl or rounded-2xl.
                  Exception: pill badges stay rounded-full.

Borders:          border-bm-border/20 for panels and rows.
                  border-bm-border/40 for inputs and interactive containers.
                  Never border-bm-borderStrong unless it's a focus ring.

Card backgrounds: bg-bm-surface/40 for panels.
                  bg-transparent for list rows (use border-b instead).
                  bg-bm-surface/20 on row hover.

Spacing:          p-4 max for panel padding. p-3 preferred.
                  gap-3 between panels. gap-2 between rows.
                  Remove all space-y-6 — use gap-4 in flex/grid instead.

Typography:
  Page title:     text-xl font-semibold text-bm-text font-display
                  (not text-[28px] — too large, template-feeling)
  Section label:  text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono
  Body:           text-sm text-bm-text
  Metadata:       text-xs text-bm-muted font-mono
  Values:         tabular-nums for any number

Icons:            lucide-react only. Size w-4 h-4 everywhere.
                  Stroke width: strokeWidth={1.5} (thinner = more refined).
                  Color: text-bm-muted (not text-bm-text — icons should recede).
                  Never emoji icons. Never large decorative icon circles.

Hover states:     bg-bm-surface/20 for rows.
                  No translate-y lift effects — that's a marketing pattern, not a data tool.
                  Transition: transition-colors duration-100 only.

Status dots:      w-1.5 h-1.5 rounded-full inline-block
                  Active/Performing: bg-bm-success
                  Warning/Watchlist: bg-bm-warning
                  Failed/Distressed: bg-bm-danger
                  Archived/Inactive: bg-bm-muted2

KPI strips:       Use the KpiStrip pattern from the cockpit redesign.
                  No MetricCard boxes with borders. Just inline label/value/delta.
                  Applied consistently on every page that shows aggregate metrics.
```

---

## Part 1 — Global Shell

### 1A. TopBar — `repo-b/src/components/bos/TopBar.tsx`

**Current problem:** Department tabs use emoji characters (`$`, `⚙`, `👤`, `📈`) from a hardcoded string map. This breaks the icon language and looks inconsistent on different OSes.

**Replace the emoji ICON_MAP with lucide-react imports:**

```typescript
// Remove this:
const ICON_MAP: Record<string, string> = {
  "dollar-sign": "$",
  settings: "⚙",
  users: "👤",
  "trending-up": "📈",
  shield: "🛡",
  cpu: "💻",
  megaphone: "📣",
  folder: "📁",
};

// Replace with:
import {
  DollarSign, Settings, Users, TrendingUp,
  Shield, Cpu, Megaphone, Folder, LayoutDashboard
} from "lucide-react";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  "dollar-sign": DollarSign,
  settings:      Settings,
  users:         Users,
  "trending-up": TrendingUp,
  shield:        Shield,
  cpu:           Cpu,
  megaphone:     Megaphone,
  folder:        Folder,
};

// Render as:
const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
<Icon className="w-3.5 h-3.5 shrink-0 text-bm-muted" strokeWidth={1.5} />
```

**TopBar height + tab styling:**

```
Bar:            h-10 (down from h-12) — every pixel of vertical space matters
                sticky top-0 z-30 border-b border-bm-border/20 bg-bm-bg/95 backdrop-blur-sm

Department tab (inactive):
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-bm-muted
                whitespace-nowrap rounded transition-colors duration-100
                hover:text-bm-text hover:bg-bm-surface/20

Department tab (active):
                text-bm-text bg-bm-surface/30
                border-b-2 border-bm-accent
                (remove border-transparent — it adds visual weight)

"Winston" brand link:
                text-sm font-semibold font-display text-bm-text
                (no special treatment — it's a nav element, not a logo lockup)
```

---

### 1B. Sidebar — `repo-b/src/components/bos/Sidebar.tsx`

Already specified in `Winston_Cockpit_Redesign_Prompt.md` (Section G). Apply those rules sitewide — the sidebar is shared across all non-admin pages.

Key rule: no `rounded-lg` on nav items. Left-edge accent only.

---

### 1C. BosAppShell — `repo-b/src/components/bos/BosAppShell.tsx`

```
Main content area:
  Current:  p-4 sm:p-6
  Change:   p-4 sm:p-5  (trim the extra breathing room — analysts want data)
```

---

### 1D. Global MetricCard — wherever `MetricCard` is used sitewide

Find the `MetricCard` component (likely in `repo-b/src/components/ui/` or `repo-b/src/components/shared/`). It is used as a KPI box on the admin page, the funds page, and potentially others.

**Replace MetricCard with the KpiStrip pattern everywhere:**

Instead of:
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Total Envs   │  │ Active       │  │ Provisioning │
│    12        │  │    9         │  │    2         │
│  +2 this mo  │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

Use:
```
TOTAL ENVS    ACTIVE       PROVISIONING   FAILED    ARCHIVED
12            9            2              0         1
+2 this mo
```

Same `KpiStrip` component from the cockpit. Pass it `KpiDef[]` and it renders a single borderless row. Import and reuse — this is already built.

---

## Part 2 — Admin / Control Tower

### Files to modify:
```
repo-b/src/app/admin/page.tsx
repo-b/src/components/lab/environments/EnvironmentCard.tsx
repo-b/src/components/lab/environments/EnvironmentList.tsx
repo-b/src/components/admin/AdminShell.tsx
```

---

### 2A. AdminShell — `repo-b/src/components/admin/AdminShell.tsx`

```
Sidebar:
  w-64 → w-52  (narrower — admin has few nav items)
  p-6 → p-4
  gap-6 → gap-4

  Nav items: same density rules as Sidebar.tsx (Section G of cockpit prompt)
  text-[13px] font-medium py-1.5
  Active: border-l-2 border-l-bm-accent bg-bm-surface/20 (no rounded-lg)

Header bar:
  px-6 py-4 → px-5 py-3
  "Control Tower" title: text-lg font-semibold (not larger — this is a tool, not a brand moment)
  Provision button: text-sm px-3 py-1.5 rounded-md bg-bm-accent text-white
```

---

### 2B. Environment Cards → Horizontal Rows

**Current:** Square cards in a `grid-cols-1 md:grid-cols-2 2xl:grid-cols-3` grid.
Each card is `rounded-2xl p-4 md:p-5 space-y-4` with a large icon circle, action button row, and 3-column stats grid.

**Target:** Thin horizontal rows in a single-column list. Think Linear issue list or Datadog host table.

**Modify:** `repo-b/src/components/lab/environments/EnvironmentCard.tsx`

Replace the entire card layout with:

```
Row container:
  flex items-center gap-4
  px-4 py-3
  border-b border-bm-border/15
  bg-transparent
  hover:bg-bm-surface/15 transition-colors duration-100
  cursor-pointer
  (no border on all sides — only bottom separator)

Left: status dot
  w-1.5 h-1.5 rounded-full shrink-0
  active    → bg-bm-success
  failed    → bg-bm-danger
  archived  → bg-bm-muted2
  prov'ing  → bg-bm-warning animate-pulse

Industry icon (inline, not in a circle):
  lucide icon, w-4 h-4 text-bm-muted shrink-0 strokeWidth={1.5}
  No background circle. No border. Just the icon.
  Map: repe → Building2, healthcare → HeartPulse, legal → Scale,
       construction → HardHat, credit → BarChart3, consulting → Layers

Client name:
  text-sm font-medium text-bm-text
  min-w-[180px]  (fixed-width name column so metadata aligns)

Metadata (pipe-separated, font-mono):
  text-xs text-bm-muted font-mono
  flex items-center gap-2
  Industry label · Schema name · Vintage/Created date

Spacer: flex-1

Last activity:
  text-xs text-bm-muted2 font-mono tabular-nums
  "2h ago" / "3d ago" / "never"

Action buttons (right side, icon-only):
  flex items-center gap-1

  Open button:
    p-1.5 rounded hover:bg-bm-surface/30 transition-colors
    <ArrowRight className="w-3.5 h-3.5 text-bm-muted" strokeWidth={1.5} />

  Settings button:
    p-1.5 rounded hover:bg-bm-surface/30 transition-colors
    <Settings className="w-3.5 h-3.5 text-bm-muted" strokeWidth={1.5} />

  Delete button:
    p-1.5 rounded hover:bg-bm-surface/30 transition-colors
    <Trash2 className="w-3.5 h-3.5 text-bm-muted/60 hover:text-bm-danger" strokeWidth={1.5} />
    (slightly more muted — destructive action should not be prominent)
```

**Full row target visual:**

```
● [Building2]  Meridian Capital Management    repe · re · Jan 2025      3h ago   → ⚙ 🗑
● [Layers]     Apex Consulting Group          consulting · ac · Mar 2025  1d ago   → ⚙ 🗑
○ [Building2]  Northgate Residential          repe · ng · Dec 2024       7d ago   → ⚙ 🗑
```

---

### 2C. EnvironmentList Container — `repo-b/src/components/lab/environments/EnvironmentList.tsx`

**Grid layout:**

```
Current:  grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4
Change:   flex flex-col  (single column — rows, not cards)
```

**List container:**

```
Wrap the rows in:
  rounded-lg border border-bm-border/20 bg-bm-surface/20 overflow-hidden
  (single rounded rect containing all rows, separated by border-b)
```

**Filter/search row:**

```
Current:  grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 with rounded filter pills
Change:   flex items-center gap-2 mb-3

Search input:
  h-8 text-xs rounded-md bg-bm-surface/40 border border-bm-border/30
  px-3 placeholder:text-bm-muted2
  focus:border-bm-accent/60 focus:outline-none

Dropdowns (Sector, Sort):
  h-8 text-xs rounded-md bg-bm-surface/40 border border-bm-border/30 px-2
  appearance-none cursor-pointer

Filter toggle pills (Active/Archived/Failed):
  text-[11px] font-mono px-2.5 py-1 rounded-full
  inactive:  border border-bm-border/30 text-bm-muted
  active:    border border-bm-accent/50 text-bm-accent bg-bm-accent/10
```

**Column header row** (add this above the list):

```
Add a sticky header row above the environment rows:
  flex items-center gap-4 px-4 py-1.5
  border-b border-bm-border/20
  bg-bm-surface/10

  Labels in text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono:
  "STATUS"  "ENVIRONMENT"  (flex-1 spacer)  "LAST ACTIVE"  "ACTIONS"
```

---

### 2D. Admin Page KPIs — `repo-b/src/app/admin/page.tsx`

```
Current:  MetricCard grid (grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3)
Change:   KpiStrip (same component from cockpit redesign)
          Place it directly below the page header, no wrapper card.

Page title:
  Current:  text-[28px] font-display font-bold
  Change:   text-xl font-semibold font-display text-bm-text

"Provision" button:
  Keep as a primary action, but:
  text-sm px-3 py-1.5 rounded-md  (not the large button variant)

ActivityFeed and InsightRail:
  Remove any rounded-2xl or rounded-xl → rounded-lg
  Replace any card header with Panel-style header
  (text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-mono)
```

---

## Part 3 — REPE Funds Page

### Files to modify:
```
repo-b/src/app/app/repe/funds/page.tsx
```

### 3A. Fund Cards → Consistent with Admin Row Treatment

**Current fund cards:** `rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5` in a `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` grid.

Fund cards can stay as cards (unlike environments, funds have richer data worth card treatment), but apply global rules:

```
Container:
  Current:  rounded-xl p-5 hover:-translate-y-[2px] hover:shadow-bm-card
  Change:   rounded-lg p-4 hover:bg-bm-surface/30 transition-colors
            (no Y-lift. bg shift instead.)
  Border:   border border-bm-border/20  (lighter than /70)

Fund name:
  text-base font-semibold font-display  (not the bolder variant)

Strategy tag / Status badge:
  rounded-full text-[11px] font-mono px-2.5 py-0.5
  Keep semantic colors (green/amber/muted2)

KPIs inside each fund card:
  Current:  probably a mini grid of labeled values
  Change:   font-mono tabular-nums for all numbers
            text-xs text-bm-muted labels
            text-sm font-semibold text-bm-text values
            No boxes within the card — just label/value pairs inline
```

### 3B. Funds Page KPI Strip

```
Current:  grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 MetricCard grid
Change:   KpiStrip — same component. No boxes.

Metrics: Total Committed · Total Called · Total NAV · Avg Gross IRR · Avg Net IRR
```

### 3C. Funds Page Filter Row

```
Same treatment as EnvironmentList filter row:
  h-8 inputs, text-xs, rounded-md, bg-bm-surface/40, border-bm-border/30
  No large rounded-xl filter container
  Just a flex row of compact inputs
```

---

## Part 4 — Icons Sitewide

### 4A. Replace All Decorative Icon Circles

Search for this pattern sitewide and remove the circle container:

```typescript
// Find (any variation of this):
<div className="... h-9 w-9 ... rounded-lg border ... bg-bm-surface/40 ...">
  <SomeIcon className="w-5 h-5" />
</div>

// Replace with just:
<SomeIcon className="w-4 h-4 text-bm-muted" strokeWidth={1.5} />
```

The circle-with-icon pattern is a mobile app pattern. Finance data tools don't use it.

### 4B. Global Icon Sizing Standard

```
Nav/sidebar icons:    w-4 h-4 strokeWidth={1.5}
Row action icons:     w-3.5 h-3.5 strokeWidth={1.5}
Inline content icons: w-4 h-4 strokeWidth={1.5}
Status/indicator:     w-3 h-3 strokeWidth={2}  (slightly heavier for clarity at small size)
Empty state icons:    w-8 h-8 strokeWidth={1}   (lighter when decorative)

All icons: text-bm-muted by default.
           text-bm-muted2 when truly subordinate (action icons in rows).
           text-bm-accent only for interactive icons that are the primary action.
           text-bm-danger only on destructive action hover.
```

### 4C. TopBar Emoji → Lucide (Critical)

Already specified in Section 1A. This is a high-visibility regression — the emoji icons break on Windows and look unintentional. Replace with proper lucide icons at `w-3.5 h-3.5 text-bm-muted strokeWidth={1.5}`.

---

## File Change Summary

| File | Action | Change |
|---|---|---|
| `bos/TopBar.tsx` | **Modify** | Emoji ICON_MAP → lucide imports; h-12→h-10; tab density |
| `bos/BosAppShell.tsx` | **Modify** | p-6→p-5 in main content area |
| `bos/Sidebar.tsx` | **Modify** | Per cockpit redesign Section G |
| `admin/AdminShell.tsx` | **Modify** | w-64→w-52; p-6→p-4; header text-lg |
| `admin/page.tsx` | **Modify** | MetricCard→KpiStrip; title text-xl; Provision btn size |
| `lab/environments/EnvironmentCard.tsx` | **Rewrite** | Square card → thin horizontal row |
| `lab/environments/EnvironmentList.tsx` | **Modify** | grid→flex col; add column header row; filter row density |
| `app/repe/funds/page.tsx` | **Modify** | rounded-xl→rounded-lg; no Y-lift hover; KpiStrip; filter density |
| Any `MetricCard` usage sitewide | **Replace** | Switch to KpiStrip component |
| Any decorative icon circle pattern | **Remove** | Just render `<Icon>` directly, w-4 h-4 text-bm-muted |

**Do NOT modify:** Data fetching, API routes, business logic, auth, DB schema, the `_types.ts`/`_adapters.ts`/`KpiStrip.tsx`/`Panel.tsx`/`LoanHealthStrip.tsx` files created in the cockpit redesign (those are already done).

---

## Visual Direction Summary

```
Current admin:  Square environment cards in a 3-column grid. Large icon circles.
                Bold page titles. Wide sidebars. Emoji nav icons.
Target admin:   Single-column row list. Tiny status dot + inline lucide icon.
                Compact page title. Tight sidebar. Lucide nav icons at w-3.5.

Current funds:  Grid of cards with hover Y-lift. Heavy borders. Wide MetricCard boxes.
Target funds:   Same grid but rounded-lg, no lift, lighter borders, KpiStrip header.

Current nav:    Emoji tab icons. h-12 bar. gap-1.5 between icon and label.
Target nav:     Lucide icons at w-3.5 h-3.5 strokeWidth 1.5. h-10 bar. Tighter tabs.

Sitewide rule:  If it's a circle-with-icon, remove the circle.
                If it's emoji, replace with lucide.
                If it's rounded-xl or rounded-2xl, change to rounded-lg.
                If it has hover:-translate-y, remove the translate and add hover:bg instead.
```

---

## Companion Prompt

This prompt is the sitewide companion to `Winston_Cockpit_Redesign_Prompt.md`. Apply both together. The cockpit prompt defines the component library (`KpiStrip`, `Panel`, `LoanHealthStrip`, `useCrosshairSync`). This prompt consumes those components everywhere else and applies the same aesthetic to the shell, admin portal, and fund pages.

Build order: cockpit components first → sitewide consistency pass second.
