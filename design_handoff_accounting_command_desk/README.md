# Handoff: Accounting Command Desk

## Overview
A terminal-dense accounting home for Novendor — the "command desk" a bookkeeper / solo operator lives inside to know **what needs action right now**. Shows unreviewed receipts, unreconciled transactions, overdue invoices, uncategorized charges, and reimbursable expenses in a single dense queue, with an intelligence rail (receipt intake feed, reconciliation triage, revenue watch) and a bottom trends band (expense by category, tooling spend, cash movement).

Designed to sit inside the existing Novendor brand — **cyberpunk meets Bloomberg, Miami Vice touches**. Dark canvas, neon cyan/magenta/amber accents, monospace data, hard corners.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype that shows the intended look, density, state system, and interactions. They are **not production code to copy directly**.

Your task is to **recreate these designs in Novendor's existing web codebase**, using its established component library, routing, data layer, and patterns. If no frontend environment exists yet, pick the most appropriate framework (React + TypeScript recommended to match the JSX prototype) and implement there.

## Fidelity
**High-fidelity.** Colors, spacing, typography, border/shadow treatments, and micro-interactions are final. Recreate pixel-close. Mock data in the HTML is illustrative — replace with live data contracts.

## Files in this bundle
- `Accounting Command Desk.html` — dark-mode prototype (default). Min width 1440px.
- `Accounting Command Desk Light.html` — light-mode prototype; same components, theme override.
- `colors_and_type.css` — the Novendor design-system token layer (colors, type, spacing, radii, shadows, motion). **This is the source of truth for all tokens** — your codebase should already have an equivalent; map to it.
- `light_mode.css` — light-theme override; loaded AFTER `colors_and_type.css` it remaps `:root` surface/text/accent vars to a warm-paper palette with deepened accents. All components use CSS vars so they theme automatically.
- `src/Atoms.jsx` — primitives: `Dot`, `Caps`, `Badge`, `Button`, `Field`, `FilterPill`, `Sparkline`, `ScanlineFrame`, `LiveClock`, `fmtUSD`, `fmtUSDK`.
- `src/TopBar.jsx` — `TopControlBar` (brand, title, status cluster, primary actions) + `FilterStrip` (pill filters, unresolved toggle, search).
- `src/KPIs.jsx` — `KPIStrip` (6 clickable metric tiles).
- `src/Queue.jsx` — `ViewSwitcher`, `NeedsAttentionTable`, `TransactionsTable`, `ReceiptsTable`, `InvoicesTable` + all mock data (QUEUE, TXNS, RECEIPTS, INVOICES).
- `src/Drawer.jsx` — right-edge `DetailDrawer` that slides in on row select.
- `src/Rail.jsx` — `ReceiptIntake`, `ReconcilePanel`, `RevenueWatch` (right intelligence rail).
- `src/Trends.jsx` — `TrendsBand` with 3 viz panels (stacked bar, MoM bars, dual-area cash chart).
- `assets/novendor_logo.png`, `fonts/mandalore*.ttf` — brand assets (already part of the Novendor design system).

## Layout (top → bottom, 1440×900+)
The whole surface is a vertical flex column, full viewport, no scroll on body.

1. **TopControlBar** — `flex: none`, height 52px, bg `--bg-void`. Left: logo + NOVENDOR / ACCOUNTING lockup, vertical rule, page title "Command Desk" + live-sync dot + descriptor copy. Right: global status counts (synced / needs action / overdue), live UTC clock, PROD env chip, user handle, vertical rule, primary actions (Import txns, + Invoice, + Expense, ↑ Upload receipt).
2. **FilterStrip** — `flex: none`, height 42px, bg `--bg-base`, bottom border `--line-2`. Left: "FILTERS" caps label + filter pills (range / entity / client / status / assignee) + Unresolved-only toggle + dashed "+ add filter" chip. Right: command search field (monospace, `>` prefix, `⌘K` suffix, 280px wide).
3. **KPIStrip** — `flex: none`, 6-column grid, bg `--bg-base`, bottom border `--line-2`. Each tile is bg `--bg-panel` with top accent gradient bar, label in mono caps, big 22px tabular-num value, delta + source line, 18px sparkline. Tiles are clickable: selecting one scopes the queue.
4. **Main split** — `flex: 1 1 auto`, `minHeight: 0`. Grid: `minmax(0,1fr) 360px`.
   - **Left (work surface):** Column with `ViewSwitcher` (tabs: Needs Attention / Transactions / Receipts / Invoices; active tab has 2px neon-cyan/amber underline + count chip), then a scrollable table region. `DetailDrawer` is positioned absolutely inside this column, slides from right (380px wide, full height of the split, own scroll).
   - **Right rail:** Column bg `--bg-void`, 10px padding, 3 stacked panels with 10px gap: Receipt Intake, Reconciliation, Revenue Watch. Whole rail scrolls as one.
5. **TrendsBand** — `flex: none`, height 220px, 3-column grid of viz panels (Expense by Category stacked bar, Tooling Spend MoM bar chart, Cash Movement 30-day dual-area). Each has a top accent gradient bar + caps header with "EXPAND ›" affordance on the right.
6. **Status bar footer** — height 22px, bg `--bg-void`, top border, monospace 10px labels: version, sync status, hotkeys (`⌘K` command, `U` upload, `E` expense, `I` invoice, `/` search), right-aligned close status + perf.

## Screens / Views

### View 1: Needs Attention (default)
Dense table of action items across receipt reviews, matches, categorizations, overdue invoices, reimbursables.

Grid template: `22px 130px 68px 90px 1fr 1fr 130px 180px 60px`
Columns: [type glyph] · TYPE · DATE · AMOUNT (right-aligned) · COUNTERPARTY · CLIENT / ENGAGEMENT · STATE (badge) · NEXT ACTION · AGE (right-aligned)

**Row types & glyphs** (`TYPE_META` in `Queue.jsx`):
- `review-receipt` → `◉` cyan · label "REVIEW RECEIPT"
- `match-receipt` → `⇋` amber · label "MATCH TO TXN"
- `categorize` → `⊕` amber · label "CATEGORIZE"
- `overdue-invoice` → `!` red · label "OVERDUE INVOICE" · red left border + red-tinted row bg (`rgba(255,31,61,.03)`) + red text-shadow glow on glyph
- `reimbursable` → `◐` violet · label "REIMBURSABLE"

**Row states:**
- Default: transparent bg, `--fg-1` text, 1px `--line-1` bottom border.
- Hover: bg `--bg-row-hover`.
- Selected: bg `--bg-row-active`, 2px `--neon-cyan` left border.
- Overdue (glow = true): 2px `--sem-error` left border + inset shadow `0 0 0 1px rgba(255,31,61,.06)`, state badge glowing.

Selecting a row opens the **DetailDrawer** on the right edge.

### View 2: Transactions
Grid: `90px 150px 120px 1fr 110px 130px 100px 110px`
Columns: ID · DATE · ACCOUNT · DESCRIPTION · AMOUNT · CATEGORY · MATCH · STATE

- Positive amounts in `--sem-up` with `+` prefix; negatives in `--fg-1`.
- Uncategorized shown as `—` in `--fg-4`.
- Match column: `unmatched` in amber, `✓` checks in green, `3 likely` / `split?` in amber.
- State badges: `reconciled` → up, `categorized` → live, `unreviewed` → warn.

### View 3: Receipts
Grid: `90px 160px 1fr 120px 150px 90px 140px`
Columns: ID · RECEIVED · VENDOR · TOTAL · SOURCE · CONF · STATE

- Confidence color-coded: ≥95% green, 80–94 cyan, <80 amber.
- States: `review` (warn), `matched` (live), `auto-matched` (up).

### View 4: Invoices
Grid: `90px 1fr 90px 90px 120px 120px 100px 120px`
Columns: ID · CLIENT · ISSUED · DUE · AMOUNT · OUTSTANDING · STATE · AGE

- Overdue rows get the glow treatment (red left border, inset shadow, glowing badge).
- Outstanding > 0 in amber; paid in `—`.

## Components — key behaviors

### DetailDrawer (`Drawer.jsx`)
- Absolutely positioned inside the work-surface column, right: 0, top/bottom: 0, width 380px.
- Box-shadow `-12px 0 32px rgba(0,0,0,.55)` for separation.
- Slide-in animation (140ms, `cubic-bezier(0.2,0.8,0.2,1)` from `translateX(20px)` + `opacity: 0`).
- Sections (top to bottom): accent bar, header (caps label + close ×), amount block, Linked To key/value list, Trace (ASCII tree ├─ └─ with status-colored values), AI Suggested list (top suggestion outlined cyan), sticky action footer.
- Actions vary by type: overdue → Send reminder / Escalate; review-receipt → Accept parse / Edit fields; match-receipt → Accept top match / Manual; categorize → Accept / Split; reimbursable → Approve / Reject. Always: Defer (ghost), Open › (ghost right-aligned).

### KPI filter behavior
Clicking a KPI tile sets it as the active filter (border changes to tile's accent, bg swap, "● FILTERED" micro-label appears). Clicking the same tile again clears. The queue filters accordingly (see `filteredQueue` mapping in `App`).

### Right rail panels
All three panels share the chrome pattern: `--bg-panel` bg, `--line-2` border, 2px top accent gradient, caps header with small live/status label on the right.

- **Receipt Intake** — list rows with a 30×36 file-icon glyph (dog-ear corner, mono source tag EML/GML/iOS/UPL), vendor + amount on row 1, source/time/confidence on row 2. Low-confidence rows get amber tint.
- **Reconciliation** — sectioned: UNMATCHED (shows likely match candidates as indented outlined rows, top one cyan-bordered) and SPLIT NEEDED (with "Propose split" cyan button).
- **Revenue Watch** — sectioned: OVERDUE (red left border, red-tinted bg, REMIND › affordance), UPCOMING, RECENT PAYMENTS (green dot prefix, `+` green amount).

### Trends band panels
- **Expense by Category** — single stacked horizontal bar (10px tall) with category legend below in 2-col grid.
- **Tooling Spend** — 6 vertical bars, current month highlighted in `--neon-violet` with soft glow.
- **Cash Movement** — 2 overlaid area series (green inflow, magenta outflow) on 100×100 normalized viewBox with dashed horizontal gridlines.

## Design Tokens (reference)
All defined in `colors_and_type.css`. Map these to Novendor's existing token layer; do not hardcode.

**Surfaces:** `--bg-void #05070A`, `--bg-base #0A0E14`, `--bg-panel #0E141C`, `--bg-panel-2 #131A24`, `--bg-row-hover #1A2230`, `--bg-row-active #1F2A3C`, `--bg-inset #060A10`

**Lines:** `--line-1 #1A2230`, `--line-2 #263243`, `--line-3 #38475E`

**Text:** `--fg-1 #E6EDF7`, `--fg-2 #A9B4C4`, `--fg-3 #6B7891`, `--fg-4 #475367`

**Neon:** `--neon-cyan #00E5FF`, `--neon-magenta #FF2E9A`, `--neon-amber #FFB020`, `--neon-violet #B07CFF`, `--neon-lime #9EFF00`

**Semantic:** `--sem-up #00E5A0`, `--sem-down #FF3B5C`, `--sem-error #FF1F3D`, `--sem-warn #FFB020`

**Fonts:** mono = JetBrains Mono; sans = IBM Plex Sans; display = Mandalore (falls back to Orbitron → IBM Plex Sans).

**Radii:** prefers hard corners — `--r-2 2px`, `--r-3 4px`, `--r-4 6px` max.

**Motion:** `--dur-1 80ms` clicks/hovers, `--dur-2 140ms` state, `--dur-3 220ms` panel reveals; ease `cubic-bezier(0.2, 0.8, 0.2, 1)`.

## State Management
State lives in the top-level `App` (prototype uses React `useState` / `useMemo`). Wire to real data:

- `view: 'needs' | 'txns' | 'recs' | 'invs'` — active tab.
- `selected: string | null` — selected row id; opens drawer when view is `needs`.
- `unresolvedOnly: boolean` — filter toggle.
- `kpiFilter: string | null` — active KPI tile; scopes the queue.
- `query: string` — command search; fuzzy-filters the queue.
- `toast: string | null` — transient confirmation (auto-clears at 2.2s).

Data contracts suggested (replace mocks in `Queue.jsx` / `Rail.jsx`):
- `GET /accounting/queue?entity&range&assignee&unresolved` → array of `{ id, type, date, time, amount, party, client, state, age, action, tone, priority, glow }`.
- `GET /accounting/transactions`, `/receipts`, `/invoices` — each with appropriate shape per table column spec above.
- `GET /accounting/kpis` → map of the 6 metrics (value, delta, spark points, source label).
- `GET /accounting/ar-aging` → OVERDUE / UPCOMING / RECENT PAYMENTS for Revenue Watch.
- `GET /accounting/reconciliation` → UNMATCHED with match candidates + SPLITS.
- `GET /accounting/receipts/intake?limit=N` → newest-first feed with OCR confidence.
- `POST /accounting/queue/:id/:action` for accept / reject / defer / match / split etc.

## Interactions & Behavior
- **KPI click** → toggle filter (optimistic).
- **Row click** in Needs Attention → set `selected`, drawer slides in (140ms).
- **Drawer close** (×) → clear selection.
- **View tab click** → swap table; selection persists across view where the id exists, otherwise clears.
- **Unresolved-only toggle** → amber outline when on.
- **Command search** (`⌘K` focus) → substring match across party/client/action/id.
- **Primary actions** → currently fire a cyan toast bottom-center for 2.2s. Wire to real upload / form modals.
- **Keyboard (in status bar)** → `⌘K` command palette (not wired yet — skeleton atoms available), `U` upload, `E` expense, `I` invoice, `/` focus search.
- **Live clock** ticks every 1s (UTC, ISO-ish format).
- **Live sync dot** next to title — pulsing green if fresh, amber if stale > 60s (extend in impl).

## Responsive
Prototype targets ≥1440px wide. For narrower, plan: collapse right rail into a bottom sheet / drawer, hide less-critical KPI tiles, let the filter pill row scroll horizontally. Not implemented in the prototype — coordinate with PM on breakpoints.

## Assets
- `novendor_logo.png` — 22–24px in the top bar; use existing brand asset from design system.
- Mandalore font family — already distributed with the Novendor design system.
- No other imagery; all glyphs are Unicode (◉ ⇋ ⊕ ! ◐ ├ └ etc.).

## Open questions for PM / design
1. Are there permission-gated actions (e.g., only admins can escalate overdue to collections)?
2. Multi-entity switching — confirmed via filter pill, but do we need a dedicated entity switcher in the top bar?
3. Close-period locking: the status bar shows "last close · Q1 2026 · locked by j.park" — does the queue auto-exclude locked-period items or show them with a lock badge?
4. Bulk actions on the queue (multi-select + batch categorize/approve)? Not in prototype.
5. Mobile/tablet scope — is this desktop-first only, or do we need a companion mobile receipt-review view?

## Theming
Both versions render from the same component files. The only difference is the light prototype loads `light_mode.css` after the base token sheet. Implement theme switching in the target codebase by toggling a class (e.g. `data-theme="light"`) on the root and scoping the light var block to that selector instead of `:root`.

All hardcoded hex values in the component source have been swept to `var(--*)` references — no color literals remain in JSX. If you add new components, follow the same rule.

## Attribution
Design system tokens are Novendor's. Typeface "Mandalore" by Iconian Fonts (donationware, commercial license required for paid use).
