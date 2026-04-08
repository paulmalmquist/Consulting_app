# PDS Winston — Meta Prompt Sequence

**Purpose:** Divide the PDS report into executable prompts that, run in order, yield the full Winston analytics platform for JLL PDS Americas.

**Stack:** Next.js 14 (repo-b) · FastAPI (backend) · Supabase PostgreSQL · OpenAI API · Recharts

**What already exists:** PDS V2 routes with lens/horizon/role filtering, executive AI briefing layer, 6 data connectors, 23 frontend page stubs, SQL agent (REPE-only catalog), seed functions, `pds_projects` / `pds_portfolio_snapshots` tables.

---

## Dependency Graph

```
P1  Supabase Schema
 │
 ├──► P2  Synthetic Data Seeder
 │     │
 │     └──► P3  Fee Revenue Backend + Dashboard
 │     │
 │     └──► P4  Utilization Backend + Dashboard
 │     │
 │     └──► P5  Client Satisfaction Backend + Dashboard
 │     │
 │     └──► P6  Technology Adoption Backend + Dashboard
 │     │
 │     └──► P7  Account Management Backend + Dashboard
 │
 ├──► P8  PDS SQL Agent (text-to-SQL) — depends on P1 schema existing
 │     │
 │     └──► P9  AI Chat Interface + Chart Rendering — depends on P8
 │
 └──► P10  Advanced Analytics & Predictive Models — depends on P2 data + P3–P7 dashboards
```

Prompts P3–P7 are independent of each other once P2 completes — they can be run in any order or parallelized across sessions.

---

## P1 — Supabase Schema: PDS Domain Tables

### Context
The existing schema has `pds_projects` and `pds_portfolio_snapshots` but lacks the full relational model the report specifies. The report (§9) defines six core tables: `accounts`, `projects`, `revenue_entries`, `survey_responses`, `timecards`, and `assignments`. These must integrate with the existing multi-tenant pattern (`business_id` FK, RLS policies) and the existing `pds_risks`, `pds_change_orders`, `pds_commitments` tables.

### Prompt

> **You are extending the Supabase PostgreSQL schema for the PDS Winston analytics platform.**
>
> **Existing infrastructure:**
> - Multi-tenant backbone in `010_backbone.sql` (tenant, business, actor tables with RLS)
> - Existing PDS tables: `pds_projects`, `pds_portfolio_snapshots`, `pds_risks`, `pds_change_orders`, `pds_commitments`, `pds_permits`, `pds_documents`
> - Migration numbering convention: `NNN_descriptive_name.sql` — use range 350–359 for PDS analytics tables
> - All tables require `business_id uuid NOT NULL REFERENCES business(id)` for tenant isolation
> - All tables require RLS policies following the pattern in existing migrations
>
> **Create the following migration files in `repo-b/db/schema/`:**
>
> **350_pds_analytics_accounts.sql** — `pds_accounts` table:
> - `account_id` uuid PK (default gen_random_uuid())
> - `business_id` uuid NOT NULL (FK → business)
> - `parent_account_id` uuid NULLABLE (self-referential FK for hierarchies)
> - `account_name` text NOT NULL
> - `tier` text NOT NULL CHECK (tier IN ('Enterprise', 'Mid-Market', 'SMB'))
> - `industry` text (Corporate, Healthcare, Life Sciences, Financial Services, Industrial, Retail, Hospitality, Data Centers, Education, Sports & Entertainment)
> - `region` text NOT NULL (Northeast & Canada, Mid-Atlantic, Southeast, Midwest, South Central, Southwest, Mountain States & Pacific NW, Northwest, Latin America)
> - `governance_track` text NOT NULL CHECK (governance_track IN ('variable', 'dedicated'))
> - `annual_contract_value` numeric(15,2)
> - `contract_start_date` date, `contract_end_date` date
> - `is_active` boolean DEFAULT true
> - Standard timestamps: `created_at` timestamptz DEFAULT now(), `updated_at` timestamptz DEFAULT now()
> - RLS: business_id = current_setting('app.business_id')::uuid
>
> **351_pds_analytics_projects.sql** — `pds_analytics_projects` table (extends existing pds_projects with analytics-specific columns):
> - `project_id` uuid PK
> - `business_id`, `account_id` (FK → pds_accounts)
> - `project_name`, `project_type` (Project Management, Development Management, Construction Management, Cost Management, Design, Multi-site Program, Location Strategy, Large Development Advisory, Tétris)
> - `service_line_key` text, `market` text, `status` text (active, completed, on_hold, cancelled)
> - `governance_track` text (variable, dedicated)
> - `total_budget` numeric(15,2), `fee_type` text (percentage_of_construction, fixed_fee, time_and_materials, retainer)
> - `fee_percentage` numeric(5,4), `fee_amount` numeric(15,2)
> - `start_date` date, `planned_end_date` date, `actual_end_date` date
> - `percent_complete` numeric(5,2)
> - Standard timestamps + RLS
>
> **352_pds_analytics_revenue.sql** — `pds_revenue_entries` table:
> - `entry_id` uuid PK
> - `business_id`, `project_id` (FK), `account_id` (FK)
> - `period` date NOT NULL (first of month)
> - `service_line` text
> - `version` text NOT NULL CHECK (version IN ('actual', 'budget', 'forecast_3_9', 'forecast_6_6', 'forecast_9_3', 'plan'))
> - `recognized_revenue` numeric(15,2), `billed_revenue` numeric(15,2), `unbilled_revenue` numeric(15,2), `deferred_revenue` numeric(15,2), `backlog` numeric(15,2)
> - `cost` numeric(15,2), `margin_pct` numeric(5,4)
> - Standard timestamps + RLS
> - Unique constraint on (business_id, project_id, period, version)
>
> **353_pds_analytics_assignments.sql** — `pds_assignments` table:
> - `assignment_id` uuid PK
> - `business_id`, `employee_id` uuid, `project_id` (FK)
> - `role_level` text CHECK (role_level IN ('junior', 'mid', 'senior_manager', 'director', 'executive'))
> - `allocation_pct` numeric(5,2)
> - `start_date` date, `end_date` date
> - `billing_rate` numeric(10,2)
> - Standard timestamps + RLS
>
> **354_pds_analytics_timecards.sql** — `pds_timecards` table:
> - `timecard_id` uuid PK
> - `business_id`, `employee_id` uuid, `project_id` (FK), `assignment_id` (FK)
> - `work_date` date NOT NULL
> - `hours` numeric(4,2) NOT NULL
> - `is_billable` boolean DEFAULT true
> - `task_code` text
> - `billing_rate` numeric(10,2)
> - Standard timestamps + RLS
> - Unique constraint on (business_id, employee_id, project_id, work_date, task_code)
>
> **355_pds_analytics_surveys.sql** — `pds_survey_responses` table:
> - `response_id` uuid PK
> - `business_id`, `account_id` (FK), `project_id` (FK)
> - `survey_date` date NOT NULL
> - `nps_score` smallint CHECK (nps_score BETWEEN 0 AND 10)
> - `overall_satisfaction` smallint CHECK (overall_satisfaction BETWEEN 1 AND 5)
> - `schedule_adherence` smallint, `budget_management` smallint, `communication_quality` smallint, `team_responsiveness` smallint, `problem_resolution` smallint, `vendor_management` smallint, `safety_performance` smallint, `innovation_value_engineering` smallint (all 1–5)
> - `open_comment_positive` text, `open_comment_improvement` text
> - `respondent_role` text, `respondent_name` text
> - Standard timestamps + RLS
>
> **356_pds_analytics_employees.sql** — `pds_employees` table:
> - `employee_id` uuid PK
> - `business_id`
> - `full_name` text, `email` text
> - `role_level` text (junior, mid, senior_manager, director, executive)
> - `department` text, `region` text, `market` text
> - `standard_hours_per_week` numeric(4,1) DEFAULT 40
> - `is_active` boolean DEFAULT true
> - `hire_date` date
> - Standard timestamps + RLS
>
> **357_pds_analytics_technology.sql** — `pds_technology_adoption` table:
> - `adoption_id` uuid PK
> - `business_id`, `account_id` (FK)
> - `tool_name` text NOT NULL (INGENIOUS.BUILD, JLL Falcon, JLL Azara, Corrigo, etc.)
> - `period` date NOT NULL (first of month)
> - `licensed_users` int, `active_users` int
> - `dau` int, `mau` int
> - `avg_session_duration_min` numeric(6,2)
> - `features_available` int, `features_adopted` int
> - `onboarding_completion_pct` numeric(5,2)
> - `time_to_value_days` int
> - Standard timestamps + RLS
>
> **358_pds_analytics_indexes.sql** — Indexes for all the above tables:
> - Composite indexes on (business_id, period) for all time-series tables
> - Composite indexes on (business_id, account_id) and (business_id, project_id) for all FK lookups
> - Index on pds_accounts(business_id, governance_track)
> - Index on pds_timecards(business_id, employee_id, work_date)
>
> **359_pds_analytics_views.sql** — Convenience views:
> - `v_pds_utilization_monthly`: joins timecards + employees, computes billable_hours / available_hours per employee per month
> - `v_pds_revenue_variance`: pivots revenue_entries to show actual vs budget vs forecast side-by-side per project per period
> - `v_pds_account_health`: aggregates latest NPS, revenue trend, utilization, project RAG across accounts
> - `v_pds_nps_summary`: computes NPS score (promoters% - detractors%), promoter/passive/detractor counts per account per quarter
>
> **Requirements:**
> - Follow the exact SQL style of existing migrations (see 245_fin_repe.sql for reference)
> - Include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and create policies
> - Include `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated` role
> - Add comments on tables and key columns
> - Each file should be idempotent (use IF NOT EXISTS where possible)

### Verification
After writing migrations, list all tables and verify FK relationships form a valid DAG. Run a dry-run with `psql` or Supabase CLI to confirm no syntax errors.

---

## P2 — Synthetic Data Seeder

### Context
The report §9 specifies precise statistical distributions (log-normal revenue, right-skewed NPS, normal-distributed hours). An existing `seed_demo_workspace()` pattern exists in `backend/app/services/pds.py`. The seeder must produce enough data for all five dashboard domains to be fully populated.

### Prompt

> **You are building a synthetic data seeder for the PDS Winston platform.**
>
> **Existing pattern:** See `backend/app/services/pds.py` → `seed_demo_workspace()` and `backend/app/services/pds_enterprise.py` → `seed_enterprise_workspace()`. Follow their signature pattern: `async def seed_pds_analytics(conn, business_id: uuid.UUID, actor: dict | None = None) -> dict`.
>
> **Create `backend/app/services/pds_analytics_seed.py`** with these requirements:
>
> **Dependencies:** `faker`, `numpy`, `uuid`, `datetime`, `asyncpg` (already in requirements.txt)
>
> **1. Accounts (50–80 accounts):**
> - Tier distribution: 15% Enterprise, 35% Mid-Market, 50% SMB
> - Governance track: 40% dedicated, 60% variable
> - Log-normal contract values by tier: Enterprise median ~$700K, Mid-Market ~$160K, SMB ~$50K
> - Pareto revenue distribution: top 20% accounts = ~70% of total revenue
> - 9 Americas regions distributed proportionally (Northeast & Midwest largest)
> - 10 industry verticals from the report
> - ~10% of accounts should have parent_account_id set (subsidiary relationships)
>
> **2. Employees (200–300 employees):**
> - Role level distribution: 40% junior, 25% mid, 20% senior_manager, 10% director, 5% executive
> - Distributed across same regions as accounts
> - Use Faker for names and emails
>
> **3. Projects (150–250 projects):**
> - 1–8 projects per account (Enterprise more, SMB fewer)
> - 9 project types from report §1 (Project Management most common at ~30%)
> - Fee types: 50% percentage_of_construction (3–15%), 25% fixed_fee, 15% T&M, 10% retainer
> - Status: 60% active, 25% completed, 10% on_hold, 5% cancelled
> - Percent complete: uniform for active, 100 for completed
> - Governance track inherited from parent account
>
> **4. Assignments (400–600):**
> - Each employee assigned to 2–4 projects (primary 50–70%, secondary 20–30%, remainder 5–15%)
> - Allocation percentages must sum to ≤ 100% per employee
> - Billing rates by role level: junior $85–120, mid $120–175, senior $175–250, director $250–350, executive $350–500
>
> **5. Timecards (18 months of daily data):**
> - Daily hours: normal distribution μ=8.0, σ=0.75, clipped to [4, 12]
> - Split across assigned projects proportional to allocation_pct
> - Non-billable: 20–30% of hours
> - Seasonal effects: December −15–20%, July/August −10%, quarter-ends +5–10%
> - Overtime (>9 hrs/day) in ~10–15% of entries, clustered around project milestones
> - Skip weekends, reduce around US holidays
>
> **6. Revenue entries (18 months, monthly grain):**
> - Generate for each (project, month) combination
> - Versions: 'actual' for past months, 'budget' for all months, 'forecast_6_6' for July-onward
> - Actual revenue: project fee × percent-complete-in-month, with multiplicative seasonality (Q1: 0.87, Q2: 1.07, Q3: 1.05, Q4: 0.95) + noise ~N(0, 0.07)
> - Margins averaging ~35% with σ=5%
> - Budget: generated once at "year start" with 3–8% optimism bias over what actuals will be
> - Recognized vs billed vs unbilled: recognized ≈ actual, billed = recognized × uniform(0.85, 1.0), unbilled = recognized − billed
>
> **7. Survey responses (1–3 per account per quarter):**
> - NPS: mixture model — 51% Promoters (scores 9–10), 26% Passives (7–8), 23% Detractors (mostly 5–6, rarely 0–4)
> - Overall satisfaction: correlated with NPS (r ≈ 0.75)
> - Dimension scores: correlated with overall (r ≈ 0.5–0.7), each 1–5
> - Open comments: generate 3–5 template sentences per NPS band, randomly select and vary
> - Accounts with higher revenue should trend slightly higher NPS
>
> **8. Technology adoption (monthly for 10–15 accounts with dedicated track):**
> - 4–6 JLL tools per account (INGENIOUS.BUILD, JLL Falcon, JLL Azara, Corrigo, BIM 360, Procore)
> - DAU/MAU ratio: 15–40% (SaaS benchmark)
> - Licensed vs active: 55–90% adoption rate
> - Features adopted: 30–80% of available
> - Onboarding completion: 60–95%
> - Trend: gradual improvement over months with occasional dips
>
> **Also create a route endpoint** `POST /api/pds/v2/seed-analytics` in `backend/app/routes/pds_v2.py` that calls this seeder, gated by admin role check.
>
> **Referential integrity order:** accounts → employees → projects → assignments → timecards → revenue_entries → survey_responses → technology_adoption
>
> **Return value:** dict with counts of all created entities.

### Verification
After seeding, run `SELECT count(*) FROM pds_timecards WHERE business_id = $1` and confirm > 30,000 rows. Spot-check that revenue seasonality shows Q2 peak. Confirm NPS distribution approximates +28.

---

## P3 — Fee Revenue Backend + Dashboard

### Context
Report §2 describes four financial reference points (Plan, Budget, Forecast, Actual), the 6+6 forecast system, ASC 606 recognition methods, variable vs dedicated forecasting, and waterfall variance analysis. The existing PDS V2 routes already have a `forecast` endpoint — this prompt extends it with the full revenue analytics specified in the report.

### Prompt

> **You are building the Fee Revenue analytics module for PDS Winston.**
>
> **Existing code to extend:**
> - `backend/app/routes/pds_v2.py` — has `/forecast` endpoint, extend with new revenue endpoints
> - `backend/app/services/pds_enterprise.py` — has lens/horizon/role normalization, reuse pattern
> - `repo-b/src/app/lab/env/[envId]/pds/revenue/page.tsx` — frontend page stub exists
> - `repo-b/src/app/lab/env/[envId]/pds/financials/page.tsx` — financials page stub exists
> - `repo-b/src/app/lab/env/[envId]/pds/forecast/page.tsx` — forecast page stub exists
>
> **Backend — add to `pds_v2.py` or create `pds_revenue.py`:**
>
> 1. `GET /api/pds/v2/revenue/time-series` — Returns monthly revenue by version (actual/budget/forecast variants) with governance_track filter. Query `pds_revenue_entries` joined with `pds_analytics_projects` and `pds_accounts`. Support parameters: `business_id`, `governance_track` (variable|dedicated|all), `version[]` (multi-select), `date_from`, `date_to`, `service_line`, `region`, `account_id`.
>
> 2. `GET /api/pds/v2/revenue/variance` — Computes four variance types from report §2: budget_vs_actual, forecast_vs_actual, forecast_vs_budget, prior_year_vs_actual. Returns labeled waterfall data (new_wins, scope_changes, delays, cancellations, timing, other). Apply materiality threshold (>5% or >$50K). Aggregate by month, quarter, or year.
>
> 3. `GET /api/pds/v2/revenue/pipeline` — For variable track only. Returns pipeline funnel stages: Prospect (weight 12%), Proposal (weight 32%), Shortlisted (weight 57%), Verbal (weight 85%), Signed (100%). Include pipeline coverage ratio (pipeline ÷ quota). Pull from `pds_analytics_projects` where status indicates stage.
>
> 4. `GET /api/pds/v2/revenue/portfolio` — For dedicated track only. Returns contract portfolio: total_contract_value, monthly_run_rate, renewal_timeline, scope_utilization per account. Pull from `pds_accounts` + `pds_revenue_entries`.
>
> 5. `GET /api/pds/v2/revenue/waterfall` — Revenue recognition waterfall: backlog → recognized → billed → collected. Aggregated by period, service_line, or account.
>
> 6. `GET /api/pds/v2/revenue/mix` — Variable vs dedicated revenue mix over time. Returns monthly percentages and absolute values for both tracks.
>
> **Frontend — implement in the three existing page stubs:**
>
> **`revenue/page.tsx`** — Primary revenue dashboard:
> - **Forecast version selector** at top: dropdown with (Original Budget, 3+9, 6+6, 9+3, Latest Forecast) — persisted in URL params
> - **Variable/Dedicated toggle** — filters all charts
> - **Time-series chart** (Recharts `ComposedChart`): Solid bars for actuals, dashed lines for forecast. Multiple series for selected versions overlaid. X-axis = months, Y-axis = revenue.
> - **Revenue mix donut** showing variable vs dedicated split for selected period
> - **KPI cards** at top: Total Revenue YTD, vs Budget %, vs Prior Year %, Backlog
>
> **`financials/page.tsx`** — Variance analysis:
> - **Waterfall chart** (Recharts) bridging budget → actual with labeled drivers
> - **Variance table**: columns = metric, budget, actual, variance $, variance %, flag (green/amber/red using 5%/15% thresholds)
> - Toggle between the four comparison types
> - Drill-down by service line or region on click
>
> **`forecast/page.tsx`** — Pipeline & Portfolio:
> - **Tab layout**: "Pipeline" (variable) | "Portfolio" (dedicated)
> - Pipeline tab: horizontal funnel visualization showing deal count and weighted value at each stage, coverage ratio gauge
> - Portfolio tab: table of dedicated accounts with contract value, run-rate, renewal date (color-coded by proximity), scope utilization bar
>
> **Shared components to create in `repo-b/src/components/pds-enterprise/`:**
> - `ForecastVersionSelector.tsx` — reusable dropdown
> - `GovernanceTrackToggle.tsx` — reusable variable/dedicated/all toggle
> - `RevenueWaterfallChart.tsx` — Recharts waterfall
> - `VarianceTable.tsx` — color-coded variance rows
>
> **Data fetching pattern:** Use the existing `PdsWorkspacePage.tsx` pattern which passes `envId`, `businessId`, lens, horizon to child components. Fetch from the new endpoints using the existing API client pattern in repo-b.

### Verification
Load the revenue page with seeded data. Confirm the forecast version selector changes the overlay lines. Verify waterfall chart bridges budget to actual with labeled segments. Check that variable/dedicated toggle filters all visualizations consistently.

---

## P4 — Utilization Backend + Dashboard

### Context
Report §3 specifies dual timecard/assignment utilization views, industry benchmarks (68.9% average, 75% target), role-adjusted targets, and five essential visualizations. Existing stubs: `timecards/page.tsx`, `resources/page.tsx`.

### Prompt

> **You are building the Utilization analytics module for PDS Winston.**
>
> **Backend endpoints (add to `pds_v2.py` or create `pds_utilization.py`):**
>
> 1. `GET /api/pds/v2/utilization/summary` — Returns aggregated utilization metrics: actual billable hours / available hours, by month. Support filters: `business_id`, `region`, `role_level`, `governance_track`, `date_from`, `date_to`. Compute from `pds_timecards` joined with `pds_employees`. Available hours = employee standard_hours_per_week × work_days_in_month − estimated PTO (use 10% deduction).
>
> 2. `GET /api/pds/v2/utilization/heatmap` — Returns employee × time-period matrix with utilization percentages. Color thresholds from report: <50% blue/gray, 50–70% yellow, 70–90% green, 90–110% orange, >110% red. Apply **role-adjusted targets**: junior 80–90%, mid 75–85%, senior_manager 65–75%, director 50–65%, executive 40–50%. Return both raw utilization and target-adjusted RAG status.
>
> 3. `GET /api/pds/v2/utilization/capacity-demand` — Forward-looking supply vs demand. Supply = headcount × standard hours − PTO − admin. Demand = confirmed assignments + pipeline-weighted (Prospect 12%, Proposal 32%, Shortlisted 57%, Verbal 85%, Signed 100%). Return rolling 3–12 month horizon.
>
> 4. `GET /api/pds/v2/utilization/bench` — Unassigned or underutilized resources. Returns employees where total allocation_pct < 50% or with no active assignments. Include: name, role_level, region, skills (from department), availability window (current assignment end dates).
>
> 5. `GET /api/pds/v2/utilization/distribution` — Workload distribution histogram. Bin employees by utilization percentage (0–10%, 10–20%, ..., 110%+). Returns bin counts for current month and trailing 3 months for trend.
>
> **Frontend:**
>
> **`resources/page.tsx`** — Primary utilization dashboard:
> - **KPI strip**: Firm-wide utilization %, vs benchmark (68.9%), vs target (75%), bench count, overtime alert count
> - **Utilization heatmap** (primary view): rows = employees (sortable by name, role, region), columns = months. Cell color follows threshold rules. Click cell → detail drawer with daily hours breakdown.
> - **Capacity vs Demand chart**: stacked area chart. Supply line (gray), confirmed demand (blue fill), pipeline-weighted demand (blue hatched). Gap regions highlighted red (over-capacity) or yellow (under-utilized).
> - **Regional allocation map**: Use a simple Americas region grid (not a geographic map) with bubble sizes = headcount, bubble color = avg utilization by threshold colors.
>
> **`timecards/page.tsx`** — Detailed timecard view:
> - **Workload distribution histogram** (Recharts BarChart): x-axis = utilization bins, y-axis = employee count. Overlay target zone (70–90%) as shaded region.
> - **Bench list table**: sortable by role, region, allocation %, availability date. Row click → employee detail.
> - **Overtime alerts table**: employees with >110% utilization in trailing 4 weeks, sorted by severity.
> - **Planned vs Actual comparison**: side-by-side bars showing assignment allocation % vs actual timecard utilization % per employee.
>
> **Threshold constants** — create `repo-b/src/lib/pds-thresholds.ts`:
> ```typescript
> export const UTILIZATION_THRESHOLDS = {
>   severely_under: 50,
>   under: 70,
>   target_high: 90,
>   high: 110,
> } as const;
> export const ROLE_TARGETS: Record<string, [number, number]> = {
>   junior: [80, 90],
>   mid: [75, 85],
>   senior_manager: [65, 75],
>   director: [50, 65],
>   executive: [40, 50],
> };
> export const INDUSTRY_BENCHMARK = 68.9;
> export const FIRM_TARGET = 75;
> ```

### Verification
Load the resources page. Confirm heatmap renders with correct color coding by role-adjusted thresholds. Verify capacity-demand chart shows a visible gap between supply and demand lines. Check bench list is non-empty and sorted correctly.

---

## P5 — Client Satisfaction Backend + Dashboard

### Context
Report §4 covers Qualtrics-style survey structure, CRE-specific survey design, NPS benchmarks (+28 for CRE), and the NLP analysis pipeline. The existing `satisfaction/page.tsx` stub needs full implementation. The NLP pipeline (BERTopic, sentiment) is a stretch goal — the dashboard should work with direct survey data first, with hooks for NLP enrichment.

### Prompt

> **You are building the Client Satisfaction analytics module for PDS Winston.**
>
> **Backend endpoints:**
>
> 1. `GET /api/pds/v2/satisfaction/nps-summary` — Compute NPS = %Promoters − %Detractors per quarter. Return: quarter, total_responses, promoters, passives, detractors, nps_score, trend_vs_prior_quarter. Filter by: business_id, account_id, region, governance_track, date_range.
>
> 2. `GET /api/pds/v2/satisfaction/drivers` — Key Driver Analysis. For each survey dimension (schedule_adherence, budget_management, communication_quality, team_responsiveness, problem_resolution, vendor_management, safety_performance, innovation_value_engineering), compute: average score, correlation with overall_satisfaction, importance rank. Return data shaped for an Importance × Performance quadrant chart.
>
> 3. `GET /api/pds/v2/satisfaction/by-account` — Account-level satisfaction table. Per account: latest NPS, NPS trend (3-quarter moving average), overall satisfaction average, lowest-scoring dimension, response count, last survey date.
>
> 4. `GET /api/pds/v2/satisfaction/verbatims` — Return open-text comments with NPS score, account, project, date. Support search/filter. Include sentiment placeholder field (for future NLP enrichment).
>
> 5. `GET /api/pds/v2/satisfaction/at-risk` — Accounts where NPS < 0 OR NPS dropped > 15 points quarter-over-quarter OR overall_satisfaction < 3.0. Return with risk reason and recommended action.
>
> 6. `POST /api/pds/v2/satisfaction/analyze-comments` — **OpenAI-powered endpoint.** Accept an array of open_comment texts. Use GPT-4o to extract: sentiment (positive/negative/neutral), topic tags (from predefined CRE list: scheduling, budget, communication, safety, quality, vendor, innovation), and a one-line summary. Batch up to 50 comments per call. Return enriched comment objects.
>
> **Frontend — `satisfaction/page.tsx`:**
>
> - **NPS gauge**: large center display showing current NPS score with color (red < 0, yellow 0–30, green 30–50, dark green > 50). Benchmark line at +28.
> - **NPS trend**: line chart by quarter with benchmark reference line at +28
> - **Promoter/Passive/Detractor breakdown**: horizontal stacked bar per quarter showing proportions
> - **Importance × Performance quadrant chart** (Recharts ScatterChart): X-axis = avg dimension score (performance), Y-axis = correlation with NPS (importance). Quadrants labeled: "Keep Up" (high-high), "Improve Priority" (high importance, low performance), "Low Priority" (low-low), "Possible Overkill" (low importance, high performance). Each dot = one survey dimension.
> - **At-risk accounts alert panel**: red-highlighted list of accounts from the at-risk endpoint
> - **Verbatim feed**: scrollable list of recent comments with NPS badge, account name, sentiment tag. Search bar for keyword filtering.
>
> **Shared component:** `NpsGauge.tsx` — reusable semicircular gauge component showing NPS from −100 to +100 with threshold colors.

### Verification
Confirm NPS gauge shows ~+28 with seeded data. Verify the quadrant chart has 8 dots (one per dimension) distributed across quadrants. Check at-risk accounts list is populated for accounts with detractor-heavy NPS.

---

## P6 — Technology Adoption Backend + Dashboard

### Context
Report §5 describes a four-tier adoption metrics framework (engagement, depth, velocity, segmentation) and a composite health score. Existing stub: there is no dedicated tech adoption page yet — create one. This is the smallest of the five domains.

### Prompt

> **You are building the Technology Adoption analytics module for PDS Winston.**
>
> **Backend endpoints:**
>
> 1. `GET /api/pds/v2/adoption/overview` — Per-tool aggregated metrics: tool_name, total_licensed, total_active, adoption_rate (active/licensed), avg_dau_mau_ratio, avg_feature_adoption_pct, avg_onboarding_completion. Filter by: business_id, account_id, tool_name, date_range.
>
> 2. `GET /api/pds/v2/adoption/by-account` — Per-account technology health: account_name, tools_deployed (count), avg_adoption_rate, avg_dau_mau_ratio, feature_breadth_score (features_adopted / features_available averaged across tools), onboarding_completion_avg.
>
> 3. `GET /api/pds/v2/adoption/health-score` — Composite health score per account. Weighted: product_usage_rate 35%, nps_csat 20% (join with survey data), product_setup 20% (onboarding_completion + feature_adoption), csm_qualitative 25% (placeholder, default 70/100). Return score 0–100 with RAG status.
>
> 4. `GET /api/pds/v2/adoption/trends` — Monthly time series per tool: dau_mau_ratio, active_users, feature_adoption trend. For Kaplan-Meier style adoption curve display.
>
> **Frontend — create `repo-b/src/app/lab/env/[envId]/pds/adoption/page.tsx`:**
>
> - **Tool adoption cards**: grid of cards, one per JLL tool. Each shows: tool name, adoption rate ring chart, DAU/MAU ratio, active vs licensed users bar.
> - **Account health score table**: sortable table with composite score column (color-coded 0–100), expandable rows showing component breakdown.
> - **Adoption trend chart**: multi-line time series (one line per tool) showing DAU/MAU ratio over time. Reference lines at 13% (SaaS low), 25% (SaaS average), 40% (excellent).
> - **Stickiness benchmark comparison**: bar chart comparing each tool's DAU/MAU to SaaS benchmarks.
>
> **Also add a nav link** for the adoption page in the PDS sidebar navigation (find the existing nav config in the PDS layout).

### Verification
Confirm adoption page loads with 4–6 tool cards. Verify health scores compute and display with correct color coding. Check trend lines show gradual improvement pattern from seeded data.

---

## P7 — Account Management Backend + Dashboard

### Context
Report §6 specifies four drill-through levels (C-Suite → Regional → Account 360 → Project), quantitative RAG scoring, and strategic quadrant scatter plots. Existing stubs: `accounts/page.tsx`, `projects/page.tsx`. The existing `PdsWorkspacePage` component supports lens/role_preset filtering which maps naturally to drill-through levels.

### Prompt

> **You are building the Account Management analytics module for PDS Winston.**
>
> **Backend endpoints:**
>
> 1. `GET /api/pds/v2/accounts/executive-overview` — Level 0 C-Suite view. Return: total_revenue_ytd, yoy_growth, portfolio_margin, health_distribution (% green/amber/red), top_5_by_revenue, top_5_at_risk. Max 7 KPIs. Health = aggregate RAG from revenue + satisfaction + utilization + delivery.
>
> 2. `GET /api/pds/v2/accounts/regional` — Level 1 Regional view. Per region: revenue, margin, account_count, health_distribution, budget_vs_actual_pct. Support comparison across regions.
>
> 3. `GET /api/pds/v2/accounts/{account_id}/360` — Level 2 Account 360. Full profile: P&L (revenue, gross_margin, operating_margin), active_project_count with RAG breakdown, utilization_gauge, nps_trend, contract_value, renewal_date, recent_engagement_log. Join across all PDS analytics tables.
>
> 4. `GET /api/pds/v2/accounts/{account_id}/projects` — Level 3 Project list for an account. Per project: timeline (start, planned_end, actual_end, percent_complete), budget_vs_actual, team_utilization, status, EVM metrics (CPI = recognized_revenue / cost, SPI = percent_complete / planned_percent).
>
> 5. `GET /api/pds/v2/accounts/quadrant/{type}` — Strategic quadrant data. Type = `revenue_growth` (BCG-style: x=revenue, y=yoy_growth, size=margin), `satisfaction_revenue` (x=revenue, y=nps), or `cost_revenue` (x=cost_to_serve, y=revenue). Return scatter data points with account labels.
>
> 6. `GET /api/pds/v2/accounts/rag-summary` — RAG scoring across all accounts. Per account, per dimension (revenue, margin, satisfaction, delivery, contract): actual value, target, variance_pct, rag_status. RAG rules: Green = within 5% of target, Amber = 5–15% below, Red = >15% below. Account overall = Red if any dimension Red.
>
> **Frontend — `accounts/page.tsx`:**
>
> - **Drill-through architecture**: use URL params to control level. Default = Level 0. Click region → Level 1. Click account → Level 2. Click project → Level 3 (navigates to `projects/[projectId]/page.tsx`).
>
> - **Level 0 (C-Suite)**: KPI cards (5–7) across top. Health distribution donut chart. Two tables: Top 5 Revenue, Top 5 At-Risk. Sparkline trends in table cells.
>
> - **Level 1 (Regional)**: Comparative bar charts (revenue by region, margin by region). Region cards with health distribution mini-donuts. Click card → filter to that region's accounts.
>
> - **Level 2 (Account 360)**: Full-width account detail page. Left column: P&L summary card, utilization gauge, NPS trend sparkline. Right column: project list with RAG badges, contract timeline bar, renewal countdown.
>
> - **Quadrant scatter plot** (accessible from Level 0): Recharts `ScatterChart` with four labeled quadrants. Dot size = third metric. Tooltips show account name and values. Dropdown to switch between revenue_growth, satisfaction_revenue, cost_revenue views.
>
> - **RAG status strip**: persistent banner across all levels showing Green/Amber/Red counts with trend arrows (improving, stable, declining vs prior month).
>
> **Shared components:**
> - `RagBadge.tsx` — colored badge (green/amber/red) with optional trend arrow
> - `AccountHealthDonut.tsx` — donut showing distribution of RAG statuses
> - `QuadrantScatter.tsx` — reusable four-quadrant scatter with configurable axes

### Verification
Navigate the full drill-through: C-Suite → Region → Account → Project. Confirm RAG badges are consistent across levels. Verify quadrant scatter populates with account dots and correct axis values. Check that clicking a region filters accounts correctly.

---

## P8 — PDS SQL Agent (Text-to-SQL)

### Context
Report §8 describes the full text-to-SQL pipeline: intent classification → schema retrieval → SQL generation → validation → execution → error correction → chart detection. The existing `backend/app/sql_agent/` has a working implementation for REPE tables. This prompt extends it to PDS tables while reusing the architecture.

### Prompt

> **You are extending the SQL agent to support PDS analytics tables.**
>
> **Existing architecture to extend (do NOT rewrite, extend):**
> - `backend/app/sql_agent/catalog.py` — has `ENTITY_TABLES` for REPE. Add a `PDS_TABLES` list following the same `Table` / `Column` dataclass pattern. Include all tables from P1 (pds_accounts, pds_analytics_projects, pds_revenue_entries, pds_assignments, pds_timecards, pds_survey_responses, pds_employees, pds_technology_adoption) plus the views (v_pds_utilization_monthly, v_pds_revenue_variance, v_pds_account_health, v_pds_nps_summary).
> - `backend/app/sql_agent/combined_agent.py` — has `_SYSTEM` prompt for REPE. Create a parallel `_PDS_SYSTEM` prompt or make the system prompt domain-aware based on an intent classification step.
> - `backend/app/sql_agent/sql_generator.py` — reuse for PDS
> - `backend/app/sql_agent/validator.py` — reuse, ensure PDS tables are whitelisted
>
> **Changes to make:**
>
> 1. **In `catalog.py`**: Add `PDS_TABLES: list[Table]` with full column definitions for all 8 tables + 4 views. Add a `pds_catalog_text()` function that returns the formatted catalog string (following the pattern of existing `catalog_text()`). Add a `combined_catalog_text()` that merges REPE + PDS when the domain is ambiguous.
>
> 2. **In `combined_agent.py`**: Add a `PDS_SYSTEM` prompt that includes:
>    - PDS-specific routing rules (all PDS queries → SQL, no python route needed for PDS)
>    - Business glossary: define governance_track, NPS, utilization, DAU/MAU, ASC 606, 6+6 forecast, EVM, CPI, SPI, RAG
>    - 10–15 few-shot examples covering each PDS domain:
>      - "What's our firm-wide utilization this quarter?" → query v_pds_utilization_monthly
>      - "Show revenue by service line, budget vs actual" → query pds_revenue_entries with version pivot
>      - "Which accounts have NPS below 20?" → query v_pds_nps_summary
>      - "What's the pipeline coverage ratio for variable work?" → query pds_analytics_projects
>      - "Show me adoption rates for INGENIOUS.BUILD" → query pds_technology_adoption
>      - "Top 10 accounts by revenue with their health status" → query v_pds_account_health
>      - "Utilization heatmap for Northeast region" → query pds_timecards joined with pds_employees
>      - "Compare Q3 forecast to actuals for dedicated accounts" → query pds_revenue_entries with filters
>      - "Which employees are on the bench?" → query pds_assignments with low allocation
>      - "Show satisfaction trend for account X" → query pds_survey_responses
>    - Tenant isolation rules: every query MUST filter by business_id
>    - SELECT-only enforcement
>    - LIMIT 1000 default
>
> 3. **Create `backend/app/sql_agent/pds_agent.py`**: A `PdsCombinedAgent` class that mirrors `CombinedAgent` but uses `PDS_SYSTEM` and `pds_catalog_text()`. Method: `async def run(self, question: str, business_id: str) -> AgentResult`. Include the validation step using sqlglot to reject non-SELECT statements.
>
> 4. **Create `backend/app/sql_agent/domain_router.py`**: Intent classifier that routes to REPE agent or PDS agent based on keywords. Use a lightweight OpenAI call with a small model (gpt-4o-mini) to classify: "Given this question, is it about real estate private equity (REPE) or professional data services / project delivery (PDS)?" Return domain string. Fall back to PDS if ambiguous (since that's the focus).
>
> 5. **Add to `backend/app/sql_agent/validator.py`**: Whitelist all PDS tables and views. Ensure the safety checks (no DDL/DML, LIMIT enforcement) apply to PDS queries too.
>
> 6. **Update the route**: In `backend/app/routes/query_engine.py` or create `backend/app/routes/pds_query.py` — add `POST /api/pds/v2/query` that accepts `{ question: string, business_id: string }`, routes through `domain_router` → appropriate agent → validator → execution → returns `{ sql: string, results: array, chart_suggestion: object | null }`.
>
> **Chart suggestion logic** (in the agent or post-processing):
> - Time series data (has date column + numeric) → `{ type: "line", x: date_col, y: numeric_col }`
> - Categorical + numeric → `{ type: "bar", x: category_col, y: numeric_col }`
> - Two numerics + category → `{ type: "scatter", x: col1, y: col2, label: category_col }`
> - Single numeric with parts → `{ type: "donut", values: col, labels: category_col }` (max 7 slices)
> - No clear pattern → `null` (show table only)

### Verification
Test with 5 natural language questions spanning all PDS domains. Confirm SQL generates correctly, executes without error, and returns results. Verify tenant isolation (business_id filter) is present in every generated query. Test chart suggestion returns appropriate types for time-series vs categorical queries.

---

## P9 — AI Chat Interface + Chart Rendering

### Context
Report §8 specifies the frontend chat experience: streaming via SSE/Vercel AI SDK, inline chart rendering with Vega-Lite/Recharts, and the `<!--CHART_START-->` / `<!--CHART_END-->` delimiter pattern. The existing backend has `ai_gateway.py` for OpenAI orchestration. The frontend has Vercel AI SDK available.

### Prompt

> **You are building the AI chat interface for PDS Winston — the text-to-SQL conversational layer.**
>
> **Backend — create `backend/app/routes/pds_chat.py`:**
>
> 1. `POST /api/pds/v2/chat` — SSE streaming endpoint. Accept: `{ messages: [{role, content}], business_id: string }`.
>    - Extract the latest user message
>    - Call the PDS agent from P8 (`PdsCombinedAgent.run()`)
>    - Stream the response using Vercel AI SDK Data Stream Protocol format:
>      - `0:` prefix for text tokens
>      - When SQL results are ready, emit the data as a tool result
>      - If chart_suggestion is non-null, emit chart config wrapped in `<!--CHART_START-->` JSON `<!--CHART_END-->` delimiters
>    - Include the generated SQL in the response (collapsible, for transparency)
>    - On SQL error: retry up to 3 times with error context fed back to OpenAI, then return a user-friendly error message
>    - Log all queries to `pds_executive_memory` table for audit trail
>
> 2. `GET /api/pds/v2/chat/suggestions` — Return 6–8 suggested starter questions based on available data:
>    - "What's our firm-wide utilization this quarter?"
>    - "Show revenue trend, budget vs actual"
>    - "Which accounts have declining NPS?"
>    - "Compare regional performance"
>    - "What's our pipeline coverage ratio?"
>    - "Show me the bench by region"
>    - "Top accounts by revenue and satisfaction"
>    - "Technology adoption rates across tools"
>
> **Frontend — create `repo-b/src/app/lab/env/[envId]/pds/ai-query/page.tsx`:**
>
> - **Chat interface** using Vercel AI SDK `useChat` hook pointed at `/api/pds/v2/chat`
> - **Message display**: user messages right-aligned, assistant messages left-aligned with Winston branding
> - **Inline chart rendering**: Parse assistant messages for `<!--CHART_START-->` / `<!--CHART_END-->` delimiters. Extract the JSON chart config. Render using a `<DynamicChart>` component that maps config to Recharts components:
>   - `type: "line"` → `<LineChart>`
>   - `type: "bar"` → `<BarChart>`
>   - `type: "scatter"` → `<ScatterChart>`
>   - `type: "donut"` → `<PieChart>` with inner radius
>   - Each chart gets a "View data" toggle that shows the raw table below it
> - **SQL disclosure**: collapsible `<details>` element showing the generated SQL, styled as a code block
> - **Data table**: when results are returned without a chart suggestion, render a sortable `<DataTable>` component
> - **Suggested questions**: on empty state, show the starter questions as clickable chips
> - **Conversation memory**: maintain message history in the chat (up to 20 messages), pass last 5 as context to each request
>
> **Create shared component `repo-b/src/components/pds-enterprise/DynamicChart.tsx`:**
> - Accept a chart config object `{ type, data, x, y, label?, title?, color? }`
> - Switch on `type` to render the appropriate Recharts component
> - Apply consistent PDS theming (use existing color palette from PdsWorkspacePage)
> - Include responsive container wrapper
> - Add download button (export chart as PNG using html2canvas or recharts export)
>
> **Configure Next.js proxy**: Add rewrite rule in `next.config.js` (or extend existing) to proxy `/api/pds/*` to the FastAPI backend URL.
>
> **Add nav link**: Add "AI Query" to the PDS sidebar navigation, with a sparkle/AI icon.

### Verification
Open the AI query page. Click a suggested question. Confirm the chat streams a response with generated SQL visible. Verify that chart renders inline for time-series questions. Test a follow-up question to confirm conversation context works. Test an intentionally bad question and confirm graceful error handling after retries.

---

## P10 — Advanced Analytics & Predictive Models

### Context
Report §7 specifies project health scoring (4 weighted dimensions), EVM metrics, predictive delay models, and additional analytics (CLV, win/loss, vendor scorecards, ESG). This is the most ambitious prompt and should be tackled last when all data and dashboards are in place.

### Prompt

> **You are building the Advanced Analytics module for PDS Winston — project health scoring, EVM, and predictive models.**
>
> **Backend endpoints:**
>
> 1. `GET /api/pds/v2/analytics/project-health/{project_id}` — Composite project health score. Four weighted dimensions:
>    - **Schedule health (27.5%)**: SPI = percent_complete / planned_percent_at_date. Green > 0.95, Amber 0.85–0.95, Red < 0.85.
>    - **Budget health (32.5%)**: CPI = recognized_revenue / cost (from revenue_entries). Green CPI > 0.95, Amber 0.85–0.95, Red < 0.85. Also: burn_rate = cost_to_date / total_budget, contingency_drawdown (placeholder).
>    - **Quality health (20%)**: Placeholder — use random score 60–95 for now. In production: defect rates, inspection pass rates from Procore/BIM integrations.
>    - **Risk health (20%)**: Count of open pds_risks for the project, weighted by severity (High=3, Medium=2, Low=1). Score = max(0, 100 − weighted_risk_count × 10).
>    - Return: composite_score (0–100), dimension_scores, rag_status, trailing_30_day_trend.
>    - Use **trailing 30-day** metrics, not cumulative, per report recommendation.
>
> 2. `GET /api/pds/v2/analytics/evm/{project_id}` — Earned Value Management dashboard data:
>    - PV (planned value) = total_budget × planned_percent_at_date
>    - EV (earned value) = total_budget × actual_percent_complete
>    - AC (actual cost) = sum of costs from revenue_entries to date
>    - CPI = EV / AC, SPI = EV / PV
>    - EAC = AC + ((BAC − EV) / CPI) where BAC = total_budget
>    - TCPI = (BAC − EV) / (BAC − AC)
>    - Return monthly time series of PV, EV, AC for S-curve chart
>    - Return current CPI, SPI, EAC, TCPI, VAC = BAC − EAC
>
> 3. `GET /api/pds/v2/analytics/portfolio-health` — Aggregate project health across all active projects. Return: health distribution (% green/amber/red), average composite score, worst 10 projects, most improved (trailing 30-day delta), geographic heatmap data (region → avg health score).
>
> 4. `POST /api/pds/v2/analytics/predict-delay` — **OpenAI-assisted prediction.** Accept project_id. Gather: SPI trend, CPI trend, change_order_count, risk_count, percent_complete, team_utilization. Send to GPT-4o with a structured prompt asking for: probability_of_delay (0–100), likely_delay_days, top_risk_factors (ranked list), recommended_actions. Return the LLM's structured assessment. (This is a practical substitute for the XGBoost model the report describes — achievable without training data.)
>
> 5. `GET /api/pds/v2/analytics/client-lifetime-value` — Per account: total_fees_all_time, project_count, avg_nps, years_as_client, cross_sell_score (count of distinct service_lines / 9), estimated_clv = annual_run_rate × predicted_retention_years (retention based on NPS band: Promoter = 5yr, Passive = 3yr, Detractor = 1.5yr).
>
> **Frontend — `repo-b/src/app/lab/env/[envId]/pds/risk/page.tsx`:**
>
> - **Portfolio health command center**: grid of project cards, each showing project name, health score ring, RAG badge, SPI/CPI gauges. Sortable and filterable by health score, region, account.
> - **EVM S-curve chart** (on project drill-in): Recharts `LineChart` with three lines (PV blue dashed, EV green solid, AC red solid). Table below with CPI, SPI, EAC, VAC, TCPI.
> - **Project health detail drawer**: click a project → slide-in panel showing the four dimension scores as a radar chart, trailing 30-day trend sparklines, and the AI delay prediction results (if requested).
> - **AI Predict button**: on each project card, a "Predict Delay Risk" button that calls the predict-delay endpoint and displays the result in the drawer with probability gauge, risk factors list, and recommended actions.
> - **CLV table** (accessible from accounts page or as a tab): sortable table with CLV, total fees, years active, cross-sell score, retention probability.

### Verification
Load the risk page. Confirm project health scores display with correct RAG colors. Click into a project, verify S-curve renders with three lines. Click "Predict Delay Risk" and confirm the OpenAI-powered prediction returns structured results. Check CLV calculations are reasonable (high-NPS accounts should have higher CLV than detractors).

---

## Execution Notes

**Order of operations:** Run P1 → P2 sequentially (schema must exist before seeding). Then P3–P7 can run in any order. P8 depends on P1 (needs table definitions for the catalog). P9 depends on P8. P10 depends on P2 (needs data) and benefits from P3–P7 being done (reuses components).

**Cross-cutting concerns already handled by existing infrastructure:**
- Authentication: Supabase Auth + JWT validation in FastAPI middleware (already wired)
- Multi-tenancy: business_id filtering + RLS (schema in P1 follows existing pattern)
- API client: repo-b has existing fetch utilities for calling FastAPI
- Routing: existing PDS layout and sidebar nav in repo-b
- Component library: existing PDS enterprise components (PdsWorkspacePage, PdsLensToolbar, etc.)
- State management: existing lens/horizon/role_preset pattern in PdsWorkspacePage

**What each prompt should NOT do:**
- Do not modify the existing PDS V1 routes (`pds.py`) — they're legacy
- Do not alter existing REPE SQL agent — extend it, don't replace
- Do not create a separate auth system — use existing Supabase Auth
- Do not install new charting libraries — Recharts is already in repo-b
- Do not create new layout files — use existing PDS layout

**Token / scope management:** Each prompt is designed to be completable in a single session. P2 (seeder) and P8 (SQL agent) are the largest. If a prompt runs long, split the backend and frontend halves into sub-sessions.
