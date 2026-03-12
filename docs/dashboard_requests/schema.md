# Dashboard Request Schema

This file explains how Winston agents interpret dashboard request markdown files.
It is the authoritative reference for the `research-ingest` and `feature-dev` skills
when processing files in `docs/dashboard_requests/`.

---

## Required Sections

Every dashboard request MUST have these sections. A missing required section causes
the agent to stop and ask the user to fill it in before generating.

| Section | H2 heading | What it provides |
|---|---|---|
| Purpose | `## Purpose` | Business question → archetype selection |
| Key Metrics | `## Key Metrics` | Metric list → metric catalog lookup |
| Layout | `## Layout` | Row/col structure → widget grid positions |
| Entity Scope | `## Entity Scope` | entity_type + env_id context → API params |

---

## Optional Sections

| Section | H2 heading | Effect if absent |
|---|---|---|
| Primary Users | `## Primary Users` | No user-type modifiers applied to measure suggestions |
| Data Sources | `## Data Sources` | Winston uses default sources (asset statements) |
| Filters | `## Filters` | No dashboard-level filters applied |
| Visualizations | `## Visualizations` | Agent infers widget types from Layout section |
| Interactions | `## Interactions` | Interactions inferred automatically by interaction-engine.ts |
| Measure Intent | `## Measure Intent` | Measures inferred by measure-suggestion-engine.ts from keywords |
| Table Behavior | `## Table Behavior` | Table inferred automatically by tabular-engine.ts |
| Outputs | `## Outputs` | No export/share buttons added |
| Notes for Winston Agent | `## Notes for Winston Agent` | No special constraints applied |

---

## Advanced Sections (depth-2 schema)

### ## Interactions

Controls how clicking, hovering, and selecting in one widget affects others.

**Format:** bullet list of plain-English interaction descriptions.

**Trigger keywords:** `click`, `hover`, `select`, `row click`, `map click`, `kpi click`, `range select`, `reset`

**Action keywords:** `filter`, `drilldown` / `drill into`, `highlight`, `cross-filter`, `expand` / `reveal`, `navigate`, `sync`, `update kpi`, `reset all`

**Scope keywords:** `all charts`, `entire dashboard` → global; `section` / `row` → section; (default) → local

**Persistence keywords:** `url` / `shareable` → url; `hover` → none; (default) → session

**Examples:**
```markdown
## Interactions
- clicking a market bar cross-filters the asset table and KPI strip (global)
- row click in comparison table drills down into that asset's trend chart
- map click filters the detail table and updates KPI cards
- clicking a KPI card expands the income statement rows below it
- selecting a fund in the dropdown updates all charts (global, url persistence)
- reset button clears all interaction state
```

**Parsed into:** `ParsedInteractionRule[]` by `interaction-engine.ts:parseInteractionMarkdown()`.
Unresolved source/target hints are matched to widget IDs after layout composition.

---

### ## Measure Intent

Overrides or supplements the automatic measure suggestion engine.

**Format:** structured bullet list with optional explicit metric keys.

**Depth keywords:** `executive` / `board` / `lp` → executive; `monitor` / `operational` / `exception` → operational; (default) → analytical

**Suggestion mode:** include `exact` or `only` to suppress companion measure suggestions.

**Examples:**
```markdown
## Measure Intent
- Depth: executive — keep the dashboard concise, board-facing
- User type: fund manager
- Required: GROSS_IRR, NET_TVPI, PORTFOLIO_NAV
- Also show: DPI, WEIGHTED_LTV
- Suggest companion measures: yes

## Measure Intent
- Depth: operational
- User type: asset manager
- Required: NOI, OCCUPANCY, DSCR_KPI
- exact — do not suggest additional metrics
```

**Parsed into:** `MeasureIntentHint` by `spec-from-markdown.ts:parseMeasureIntent()`.
Feeds into `measure-suggestion-engine.ts:suggestMeasures()` as `userType` and overrides.

---

### ## Table Behavior

Controls whether and how an auto-inferred table appears.

**Format:** bullet list or short sentences.

**Include keywords:** `always` / `include` → force include; `none` / `no table` → force exclude; (default) → auto-infer

**Visibility keywords:** `on select` / `on click` → on_select; `on drill` → on_drill; `expand` / `collaps` → expandable; (default) → always

**Type keywords:** `ranked` / `top N` → ranked_table; `exception` / `watchlist` → exceptions_table; `summary` / `grouped` / `by segment` → grouped_summary; `detail` → detail_grid; `scorecard` / `comparison` → comparison_scorecard

**Examples:**
```markdown
## Table Behavior
- Always include a ranked table sorted by NOI descending
- Show: ASSET_NAME, NOI, NOI_variance_pct, OCCUPANCY, DSCR_KPI

## Table Behavior
- Show detail table only on row click (on_select)
- Type: exceptions table — assets below DSCR 1.15

## Table Behavior
- none — this is a presentation dashboard, no tables needed
```

**Parsed into:** `TableBehaviorHint` by `spec-from-markdown.ts:parseTableBehavior()`.
Feeds into `tabular-engine.ts:inferTable()` as override context.

---

## Behaviour Mode Detection

The `dashboard-intelligence.ts` module uses the following logic to decide what
kind of dashboard experience to generate:

| Mode | Trigger conditions |
|---|---|
| `executive_summary` | depth=executive, archetype=executive_summary or fund_quarterly_review |
| `operational_monitor` | watchlist archetype, or keywords: monitor, alert, exception, watchlist |
| `analytical_workbench` | depth=analytical, none of the above conditions match |
| `pipeline_manager` | keywords: pipeline, deal, acquisition |
| `geographic_explorer` | keywords: map, geographic, geography |

---

## Hero Visual Selection

The "hero" widget is the primary visual. Hero priority by mode:

| Mode | Priority order |
|---|---|
| executive_summary | trend_line → bar_chart → waterfall → metrics_strip |
| operational_monitor | comparison_table → bar_chart → trend_line |
| analytical_workbench | trend_line → bar_chart → comparison_table → statement_table |
| pipeline_manager | bar_chart → comparison_table → trend_line |
| geographic_explorer | bar_chart → trend_line → comparison_table |

---

## Automatic Table Injection Rules

`tabular-engine.ts` injects a table when no table widget exists in the layout and
one of these conditions is met (first match wins):

| Rule | Condition | Table type | Visibility |
|---|---|---|---|
| 1 | watchlist archetype or "underperform" keyword | exceptions_table | always |
| 2 | map present | detail_grid | on_select |
| 3 | market comparison or "by market" / "compare" keyword | grouped_summary | always |
| 4 | "pipeline" / "deal" / "acquisition" keyword | detail_grid (deal columns) | always |
| 5 | analytical depth + KPI + trend (no map, no watchlist) | ranked_table | expandable |
| 6 | fund_quarterly_review archetype + fund entity | comparison_scorecard | always |
| 7 | executive_summary archetype (non-fund) | ranked_table | expandable |

---

## Interaction Inference Rules

`interaction-engine.ts` automatically wires interactions when widget pairs are present:

**Level 1 (always applied):**

| Source → Target | Trigger | Action |
|---|---|---|
| bar_chart → comparison_table | click | filter by asset_id |
| bar_chart → metrics_strip | click | update_kpi by asset_id |
| metrics_strip → trend_line | kpi_click | filter by metric_key |
| metrics_strip → statement_table | kpi_click | expand metric group |
| trend_line → bar_chart | range_select | filter by quarter |
| comparison_table → trend_line | row_click | filter by asset_id |
| comparison_table → metrics_strip | row_click | update_kpi by asset_id |

**Level 2 (applied for matching archetypes):**

| Archetypes | Source → Target | Action | Notes |
|---|---|---|---|
| watchlist, operating_review, monthly_operating_report | comparison_table → trend_line | drilldown | replaces trend with asset detail |
| fund_quarterly_review, executive_summary | metrics_strip → statement_table | drilldown | reveals IS rows |
| market_comparison | bar_chart → comparison_table | cross_filter | global scope, url persistence |
| watchlist, monthly_operating_report | bar_chart → bar_chart | sync_selection | cross-highlights in adjacent bars |
| fund_quarterly_review, operating_review | comparison_table → waterfall | drilldown | shows NOI bridge for selected asset |

**Map interactions (when map present):**
- map_click → comparison_table: filter by geography_id (global, url)
- map_click → metrics_strip: update_kpi by geography_id (global, url)

---

## Measure Suggestion Tiers

`measure-suggestion-engine.ts` produces three tiers per request:

| Tier | Meaning | Used for |
|---|---|---|
| required | Must appear | KPI strip, primary widget metrics |
| suggested | Should appear | Companion metrics, comparison lines |
| optional | Advanced | Only include if dashboard depth warrants |

User-type modifiers shift metrics between tiers:
- `asset manager` → promotes NOI_PER_UNIT, CAPEX, REPLACEMENT_RESERVES
- `fund manager` → promotes WEIGHTED_LTV, WEIGHTED_DSCR, DPI
- `investor` / `lp` → promotes DPI, RVPI; demotes cost-level metrics
- `ic` → promotes GROSS_TVPI, GROSS_IRR; adds NET_IRR as required companion

---

## Parsing Rules

### 1. Purpose → archetype

The agent reads the Purpose section and maps it to one of the canonical archetypes:

| Archetype key | Trigger phrases |
|---|---|
| `monthly_operating_report` | "monthly operating", "operating report", "asset management report" |
| `executive_summary` | "executive summary", "board summary", "ic memo", "quarterly update" |
| `watchlist` | "watchlist", "underperform", "at risk", "surveillance" |
| `fund_quarterly_review` | "quarterly review", "fund review", "qbr", "fund performance" |
| `market_comparison` | "compare", "vs", "versus", "benchmark", "side by side" |
| `underwriting_dashboard` | "underwriting", "deal screen", "uw dashboard" |
| `operating_review` | "operating review", "deep operating", "asset manager" |
| `custom` | (fallback — use only the explicitly requested sections) |

### 2. Key Metrics → metric catalog lookup

Metric names in the list are matched against the Winston metric catalog. Exact matches
take priority; partial matches (case-insensitive) are accepted.

**Metric catalog keys (48 total):**

Income Statement: `RENT`, `OTHER_INCOME`, `EGI`, `PAYROLL`, `REPAIRS_MAINT`,
`UTILITIES`, `TAXES`, `INSURANCE`, `MGMT_FEES`, `TOTAL_OPEX`, `NOI`, `NOI_MARGIN`

Cash Flow: `CAPEX`, `TENANT_IMPROVEMENTS`, `LEASING_COMMISSIONS`,
`REPLACEMENT_RESERVES`, `DEBT_SERVICE_INT`, `DEBT_SERVICE_PRIN`,
`TOTAL_DEBT_SERVICE`, `NET_CASH_FLOW`, `DSCR`, `DEBT_YIELD`

KPI: `OCCUPANCY`, `AVG_RENT`, `NOI_PER_UNIT`, `NOI_MARGIN_KPI`, `DSCR_KPI`,
`LTV`, `ASSET_VALUE`, `EQUITY_VALUE`

Fund: `GROSS_IRR`, `NET_IRR`, `GROSS_TVPI`, `NET_TVPI`, `DPI`, `RVPI`,
`PORTFOLIO_NAV`, `WEIGHTED_LTV`, `WEIGHTED_DSCR`

### 3. Layout → widget grid positions

The Layout section is parsed row by row. Each row becomes a set of widgets.

**Grid system:** 12 columns, 1 row ≈ 80px height. Widget height (h) is in row units.

**Row parsing:**
- `Row N — [label]` starts a new row group
- Bullet items under a row become individual widgets
- Column widths in parentheses `(8 cols)` or `(half width)` set widget `w`
- Height hints `[tall]` or `[compact]` adjust widget `h` (default: 4)

**Column width shortcuts:**
| Text | w value |
|---|---|
| full width | 12 |
| 8 cols / left 2/3 | 8 |
| 6 cols / half | 6 |
| 4 cols / right 1/3 | 4 |
| 3 cols / quarter | 3 |
| (no hint) | 12 (single item per row) or auto-split (multiple items) |

**Height shortcuts:**
| Text | h value |
|---|---|
| KPI strip / metrics row | 2 |
| compact | 3 |
| (default chart) | 4 |
| tall / large | 5 |
| statement table | 5 |

### 4. Visualizations → widget types

If the Visualizations section lists explicit widget types, they override the inferred
types from the Layout section.

If absent, the agent infers widget type from content keywords:
- "KPI" / "metrics" / "scorecard" → `metrics_strip`
- "trend" / "over time" / "historical" → `trend_line`
- "bar" / "schedule" / "maturity" / "pipeline" → `bar_chart`
- "waterfall" / "bridge" / "NOI bridge" → `waterfall`
- "income statement" / "P&L" / "cash flow statement" → `statement_table`
- "comparison" / "vs actual" / "vs budget" / "watchlist" → `comparison_table`

### 5. Entity Scope → API parameters

The `## Entity Scope` section sets:

```
entity_type: asset | investment | fund | portfolio
quarter: YYYY-QN (e.g., 2026-Q1 or 2026Q1)
```

These map directly to the generate endpoint parameters:
```json
{
  "entity_type": "asset",
  "quarter": "2026Q1",
  "env_id": "<from context>",
  "business_id": "<from context>"
}
```

If `entity_type: fund` and a fund name is given, the agent attempts to resolve it
to a fund_id before calling the generate endpoint.

---

## How Agents Use This File

### Step 1 — Validate required sections

```
READ docs/dashboard_requests/<file>.md
CHECK for: Purpose, Key Metrics, Layout, Entity Scope
IF missing → STOP, ask user to fill them in
```

### Step 2 — Build a prompt string

The agent synthesizes a natural-language prompt from the markdown sections:

```
prompt = "[Dashboard Name]. [Purpose first sentence].
          Show: [Key Metrics joined by comma].
          Layout: [Layout section verbatim or summarized].
          Entity scope: [entity_type]."
```

This prompt is sent to `POST /api/re/v2/dashboards/generate` as the `prompt` field.

### Step 3 — Call the generate endpoint

```
POST /api/re/v2/dashboards/generate
{
  "prompt": "<synthesized prompt>",
  "entity_type": "<from Entity Scope>",
  "env_id": "<from runtime context>",
  "business_id": "<from runtime context>",
  "quarter": "<from Entity Scope or current quarter>"
}
```

### Step 4 — Render and save

The response is a full `DashboardSpec`. The agent:
1. Validates the spec (widget count, metric coverage, grid bounds)
2. Saves to `POST /api/re/v2/dashboards` with `prompt_text` = synthesized prompt
3. Returns the dashboard URL to the user

---

## Example Synthesized Prompt

From `real_estate_fund_dashboard.md`:

```
Real Estate Fund Performance Dashboard. Track portfolio IRR, equity multiple, and
fund NAV with geographic investment map and deal pipeline. Show: GROSS_IRR, NET_TVPI,
PORTFOLIO_NAV, OCCUPANCY, NOI. Layout: KPI strip full width; NOI trend left; map right;
deal pipeline bar chart full width; asset performance table full width. Entity scope: fund.
```

---

## Workflow Diagram

```
User creates docs/dashboard_requests/<name>.md
  │  (using template.md)
  │
  ▼
Winston agent reads file
  │
  ├─ Validates required sections
  ├─ Detects archetype from Purpose
  ├─ Maps Key Metrics to catalog keys
  ├─ Parses Layout into grid positions
  └─ Reads Entity Scope
  │
  ▼
Synthesizes natural-language prompt
  │
  ▼
POST /api/re/v2/dashboards/generate
  │
  ▼
DashboardSpec returned
  │
  ├─ Validated (widget types, metric keys, grid bounds)
  └─ Saved to DB
  │
  ▼
User opens dashboard in builder
  │
  ├─ Reviews layout
  ├─ Edits widgets as needed
  └─ Saves / shares
```
