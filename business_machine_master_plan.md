# Business Machine: Master Expansion Plan & Claude Code Meta-Prompt
*Strategic roadmap + engineering brief for PDS / General Contracting vertical and platform-wide parity*

---


## PART 1: STRATEGIC DIRECTION

### Philosophy (overriding the PDF's "cut" recommendations)
The PDF recommends shelving underdeveloped verticals (medical, legal, credit, consulting, etc.). **We reject that.** Every vertical stays. The goal is to bring ALL verticals to the same depth and quality as the REPE module — the best-built part of the platform today. REPE is the proof of concept for what every domain should become.

**Priority order for vertical build-out:**
1. **PDS (Project Delivery Services) / General Contracting** — next up, starting now
2. **CRO Consulting** — already has 16 tables, needs frontend parity
3. **Healthcare** — has finance schema, needs operational modules
4. **Legal Ops** — has tables, needs workflow UI
5. **Credit** — has schema, needs full lifecycle management
6. **Medical** — retain and expand
7. **All others** — retain, build toward parity iteratively

---

## PART 2: WHAT "REPE-LEVEL QUALITY" MEANS

Before building PDS, define the bar. REPE currently has:

| Layer | What Exists |
|-------|-------------|
| **Database** | 38+ tables, versioned quarter-state, waterfall engine, scenario runner, loan amortization |
| **API** | 15+ routes: funds, deals, assets, metrics, scenarios, runs, models, rollforward |
| **Frontend** | Fund dashboard, asset cockpit (218kB bundle), deals list/detail, waterfall views, capital views, portfolio overview, sustainability |
| **AI** | Codex integration, explain/summarize endpoints |
| **Governance** | Audit trail on calculations, lineage model, environment sandboxing |

**PDS must reach this same bar.** That means: schema → API → pages → dashboards → AI copilot → governance.

---

## PART 3: PDS / GENERAL CONTRACTING MODULE DESIGN

### What PDS is in the context of STO Building Group / Business Machine
STO Building Group manages construction projects across office, healthcare, hospitality, retail, and data centers — interior fit-outs, renovations, and new construction — in the US, UK, and Ireland. PDS is the project delivery vertical: tracking projects from conception to completion with financial rigor.

### Database tables already available
From the schema audit, these tables are ready for use:
- `project` — core project entity with budget, dates, manager
- `milestone` / `milestone_template` / `milestone_instance` / `milestone_event`
- `assignment`, `resource`, `time_entry`, `timesheet`
- `issue`, `risk`, `work_breakdown_item`, `work_order`
- `close_task`
- `fin_budget`, `fin_budget_version`, `fin_budget_line_csi` — CSI division cost codes
- `fin_journal_entry`, `fin_journal_line`
- `v_project_current` — enriched project view

### New tables needed (add to Supabase)
```sql
-- Project schedule / Gantt
CREATE TABLE project_schedule_event (
  schedule_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  wbs_item_id uuid REFERENCES work_breakdown_item(wbs_item_id),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_days int GENERATED ALWAYS AS (end_date - start_date) STORED,
  percent_complete numeric(5,2) DEFAULT 0,
  status text DEFAULT 'not_started',
  created_at timestamptz DEFAULT now()
);

-- Task dependencies (critical path)
CREATE TABLE task_dependency (
  dependency_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  predecessor_id uuid NOT NULL REFERENCES project_schedule_event(schedule_event_id),
  successor_id uuid NOT NULL REFERENCES project_schedule_event(schedule_event_id),
  lag_days int DEFAULT 0,
  dependency_type text DEFAULT 'finish_to_start'
);

-- Subcontractor / vendor management
CREATE TABLE subcontractor (
  subcontractor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  trade text,
  license_number text,
  insurance_expiry date,
  status text DEFAULT 'active',
  contact_name text,
  contact_email text,
  created_at timestamptz DEFAULT now()
);

-- Subcontractor contract / scope
CREATE TABLE subcontract (
  subcontract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  subcontractor_id uuid NOT NULL REFERENCES subcontractor(subcontractor_id),
  scope_description text,
  contract_value numeric(15,2),
  currency_code text DEFAULT 'USD',
  executed_date date,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

-- RFI (Request for Information)
CREATE TABLE rfi (
  rfi_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  rfi_number text NOT NULL,
  subject text NOT NULL,
  description text,
  assigned_to uuid,
  due_date date,
  status text DEFAULT 'open',
  priority text DEFAULT 'normal',
  response text,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Change Order
CREATE TABLE change_order (
  change_order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  co_number text NOT NULL,
  description text,
  cost_impact numeric(15,2) DEFAULT 0,
  schedule_impact_days int DEFAULT 0,
  status text DEFAULT 'pending',
  submitted_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Daily field report
CREATE TABLE daily_report (
  daily_report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  report_date date NOT NULL,
  weather text,
  temperature_high int,
  temperature_low int,
  workers_on_site int DEFAULT 0,
  work_performed text,
  delays text,
  safety_incidents text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Submittal tracking
CREATE TABLE submittal (
  submittal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  submittal_number text NOT NULL,
  description text,
  spec_section text,
  subcontractor_id uuid REFERENCES subcontractor(subcontractor_id),
  required_date date,
  submitted_date date,
  reviewed_date date,
  status text DEFAULT 'pending',
  review_notes text,
  created_at timestamptz DEFAULT now()
);

-- Punch list
CREATE TABLE punch_list_item (
  punch_list_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  description text NOT NULL,
  location text,
  assigned_to uuid,
  trade text,
  priority text DEFAULT 'normal',
  status text DEFAULT 'open',
  due_date date,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Project document registry
CREATE TABLE project_document (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(project_id),
  title text NOT NULL,
  document_type text, -- 'drawing', 'spec', 'contract', 'rfi', 'submittal', 'photo'
  version text,
  file_url text,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);
```

---

## PART 4: PDS FRONTEND PAGE ARCHITECTURE

Map to existing routing pattern `/app/[deptKey]/`:

```
/app/pds/
  /                         → PDS Command Center (overview dashboard)
  /projects                 → Project list with status, budget, schedule health
  /projects/new             → New project wizard
  /projects/[projectId]     → Project cockpit (tabs below)
    /overview               → Summary: budget, schedule, team, health score
    /schedule               → Gantt chart view (project_schedule_event)
    /budget                 → Budget vs. actuals (fin_budget + fin_budget_line_csi)
    /team                   → Resources + timesheets
    /subcontractors         → Subcontract register
    /rfis                   → RFI log + detail
    /submittals             → Submittal log
    /change-orders          → CO register + approval workflow
    /issues                 → Issue + risk register
    /daily-reports          → Field report log
    /documents              → Document registry
    /punch-list             → Punch list tracker
  /subcontractors           → Subcontractor directory
  /schedule                 → Portfolio-level schedule (all projects)
  /financials               → Cross-project financial dashboard
  /reports                  → Executive reports: budget variance, schedule performance
```

---

## PART 5: API ROUTES TO BUILD

```
/api/pds/v1/projects                          GET (list) / POST (create)
/api/pds/v1/projects/[projectId]              GET / PATCH / DELETE
/api/pds/v1/projects/[projectId]/overview     GET (aggregated cockpit data)
/api/pds/v1/projects/[projectId]/schedule     GET / POST schedule events
/api/pds/v1/projects/[projectId]/budget       GET fin_budget + lines
/api/pds/v1/projects/[projectId]/rfis         GET / POST
/api/pds/v1/projects/[projectId]/rfis/[id]    GET / PATCH
/api/pds/v1/projects/[projectId]/change-orders GET / POST
/api/pds/v1/projects/[projectId]/change-orders/[id]/approve  POST
/api/pds/v1/projects/[projectId]/submittals   GET / POST
/api/pds/v1/projects/[projectId]/daily-reports GET / POST
/api/pds/v1/projects/[projectId]/punch-list   GET / POST
/api/pds/v1/projects/[projectId]/issues       GET / POST
/api/pds/v1/projects/[projectId]/documents    GET / POST
/api/pds/v1/subcontractors                    GET / POST
/api/pds/v1/subcontractors/[id]               GET / PATCH
/api/pds/v1/portfolio/dashboard               GET (all projects health)
/api/pds/v1/portfolio/financials              GET (cross-project budget)
```

---

## PART 6: PLATFORM-WIDE PRIORITIES (parallel track)

While PDS is being built, these platform improvements should run in parallel:

### 1. Navigation overhaul
Add `pds` as a first-class department in the sidebar/nav, alongside `repe`, `finance`, `crm`. Each department should have consistent sub-nav: Dashboard, Projects/Assets/Funds, Financials, Reports, Settings.

### 2. Shared component library
Build reusable components that ALL verticals use:
- `<StatusBadge>` — consistent status chips across projects, issues, deals
- `<MetricCard>` — KPI card with trend indicator (used in REPE cockpit, replicate everywhere)
- `<GanttChart>` — timeline component for PDS scheduling
- `<BudgetVarianceBar>` — budget vs. actual progress bar
- `<ApprovalQueue>` — workflow queue component (reuse across change orders, model governance, etc.)
- `<AuditTrailPanel>` — lineage/history drawer (already in REPE, extract as shared)

### 3. Finance & Budget Tracking (cross-vertical)
The `fin_budget` + `fin_budget_line_csi` tables are perfect for PDS. Also surface them in:
- Construction finance (`/app/finance/construction`) — budget tracking for construction loans
- Healthcare — operating budget tracking
- Each project in PDS gets a `fin_budget` record automatically on creation

### 4. AI Copilot pattern
Establish the pattern once in PDS, reuse everywhere:
- "Explain schedule variance" button → calls `/api/ai/codex/run` with project schedule data
- "Summarize project health" → generates executive summary from budget + milestone + issue data
- "Draft RFI response" → AI-assisted response generation

---

## PART 7: 90-DAY SPRINT PLAN

### Sprint 1 (Weeks 1-2): Foundation
- [ ] Run the new SQL migrations (10 new PDS tables above)
- [ ] Create `/api/pds/v1/projects` CRUD routes
- [ ] Create `/app/pds/projects` list page (mirror pattern from `/app/repe/assets`)
- [ ] Create `/app/pds/projects/new` wizard
- [ ] Add `pds` to sidebar navigation

### Sprint 2 (Weeks 3-4): Project Cockpit Core
- [ ] Build `/app/pds/projects/[projectId]/overview` — aggregate dashboard tab
- [ ] Build `/app/pds/projects/[projectId]/budget` — connect to `fin_budget_line_csi`
- [ ] Build `/app/pds/projects/[projectId]/schedule` — Gantt using Recharts/D3
- [ ] Build `/app/pds/projects/[projectId]/team` — resource assignments + timesheets

### Sprint 3 (Weeks 5-6): Construction Workflow
- [ ] RFI module (list + detail + status workflow)
- [ ] Change Order module (with approval queue)
- [ ] Submittal tracking
- [ ] Daily field reports

### Sprint 4 (Weeks 7-8): Portfolio & Executive Layer
- [ ] PDS Command Center dashboard (`/app/pds/`)
- [ ] Portfolio schedule view (all projects on one timeline)
- [ ] Cross-project financial dashboard
- [ ] Subcontractor directory

### Sprint 5 (Weeks 9-10): AI + Governance
- [ ] "Explain budget variance" AI copilot button
- [ ] "Generate project health summary" AI output
- [ ] Change order audit trail
- [ ] Milestone approval workflow

### Sprint 6 (Weeks 11-12): Reports + Polish
- [ ] Executive PDF report export (budget variance, schedule performance)
- [ ] Punch list tracker
- [ ] Document registry
- [ ] Connect PDS data to `/app/finance/construction`

---

## PART 8: CLAUDE CODE META-PROMPT

**Copy this entire block into a Claude Code session to begin implementation.**

---

```
You are a senior full-stack engineer working on Business Machine — an enterprise SaaS platform 
built as a Next.js 14 App Router application with TypeScript, Tailwind CSS, Supabase (Postgres), 
and a Python/FastAPI backend. The platform serves institutional clients in REPE, construction, 
healthcare, legal, and consulting.

## YOUR MISSION
Build the PDS (Project Delivery Services) / General Contracting vertical to REPE-level quality. 
The REPE module is the gold standard — it has a full database schema, 15+ API routes, a project 
cockpit page, fund dashboards, scenario runners, and audit trails. PDS must reach the same depth.

## CODEBASE CONTEXT

**Stack:**
- Next.js 14 App Router, TypeScript, Tailwind CSS
- Supabase client at `@/lib/supabaseClient` (env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- Recharts for all data visualization
- Lucide React for icons
- Multi-tenant: every DB query MUST include `tenant_id` and `business_id` filters
- All PKs are UUID via `gen_random_uuid()`
- Status fields use text with string defaults (not enums)
- Existing patterns: `/app/[deptKey]/` for pages, `/api/[domain]/v[n]/` for routes

**Existing tables available for PDS (do not recreate):**
- `project` (project_id, name, code, status, start_date, target_end, budget, manager_id, tenant_id, business_id)
- `milestone`, `milestone_template`, `milestone_instance`, `milestone_event`
- `assignment`, `resource`, `time_entry`, `timesheet`
- `issue`, `risk`, `work_breakdown_item`, `work_order`, `close_task`
- `fin_budget`, `fin_budget_version`, `fin_budget_line_csi` (csi_division, cost_code, original_budget, approved_changes, revised_budget, committed_cost, actual_cost)
- `fin_journal_entry`, `fin_journal_line`
- `v_project_current` (enriched view)

**New tables to create via migration (run in Supabase SQL editor):**
- `project_schedule_event` — Gantt tasks with start_date, end_date, percent_complete
- `task_dependency` — predecessor/successor for critical path
- `subcontractor` — vendor directory with trade, license, insurance
- `subcontract` — contract records linking projects to subcontractors
- `rfi` — Request for Information log
- `change_order` — CO register with cost/schedule impact and approval workflow
- `daily_report` — field reports with weather, workers, work performed
- `submittal` — submittal tracking by spec section
- `punch_list_item` — closeout punch list
- `project_document` — document registry

**Page routing pattern to follow:**
Look at `/app/repe/assets/[assetId]/page.tsx` as your template for the project cockpit.
Look at `/app/repe/assets/page.tsx` as your template for the project list.
Look at `/api/re/v2/assets/[assetId]/route.ts` as your template for API routes.

## TASK 1: DATABASE MIGRATION
Create a SQL migration file `migrations/004_pds_tables.sql` with all 10 new tables listed above.
Each table must have: UUID PK, tenant_id uuid NOT NULL, business_id uuid NOT NULL, 
appropriate FKs, created_at timestamptz DEFAULT now(), status text with a DEFAULT.

## TASK 2: API ROUTES
Create these Next.js API routes:

1. `app/api/pds/v1/projects/route.ts` — GET (list with pagination, filters by status/manager) / POST (create project + auto-create fin_budget record)
2. `app/api/pds/v1/projects/[projectId]/route.ts` — GET detail / PATCH / DELETE
3. `app/api/pds/v1/projects/[projectId]/overview/route.ts` — GET aggregated cockpit: project + milestones progress + budget summary + open issues count + open RFIs count + schedule health
4. `app/api/pds/v1/projects/[projectId]/budget/route.ts` — GET fin_budget with all fin_budget_line_csi rows; return variance calculations (revised_budget - actual_cost)
5. `app/api/pds/v1/projects/[projectId]/schedule/route.ts` — GET/POST project_schedule_event rows
6. `app/api/pds/v1/projects/[projectId]/rfis/route.ts` — GET list / POST new RFI (auto-increment rfi_number)
7. `app/api/pds/v1/projects/[projectId]/rfis/[rfiId]/route.ts` — GET / PATCH (including respond action)
8. `app/api/pds/v1/projects/[projectId]/change-orders/route.ts` — GET / POST
9. `app/api/pds/v1/projects/[projectId]/change-orders/[coId]/approve/route.ts` — POST (set status='approved', set approved_by, approved_at, update project budget)
10. `app/api/pds/v1/projects/[projectId]/daily-reports/route.ts` — GET / POST
11. `app/api/pds/v1/projects/[projectId]/submittals/route.ts` — GET / POST
12. `app/api/pds/v1/projects/[projectId]/punch-list/route.ts` — GET / POST
13. `app/api/pds/v1/projects/[projectId]/issues/route.ts` — GET / POST (wraps existing `issue` table)
14. `app/api/pds/v1/subcontractors/route.ts` — GET / POST
15. `app/api/pds/v1/portfolio/dashboard/route.ts` — GET: all projects with health scores, budget variance %, schedule variance, open issues count

Every route must:
- Query Supabase with tenant_id + business_id scoping
- Return consistent JSON: `{ data: ..., error: null }` or `{ data: null, error: "message" }`
- Handle 400/404/500 properly
- Log mutations (store who did what, when) where applicable

## TASK 3: FRONTEND PAGES

### A. Project List Page
File: `app/app/pds/projects/page.tsx`
- Table/grid of all projects
- Columns: Name, Code, Status (badge), Start Date, Target End, Budget, % Budget Used (progress bar), Manager, Actions
- Filter bar: status, date range, manager
- "New Project" button → opens create modal or navigates to /new
- Status badges: planning (gray), active (blue), on-hold (yellow), complete (green), over-budget (red)

### B. New Project Page  
File: `app/app/pds/projects/new/page.tsx`
- Multi-step wizard: (1) Basic Info → (2) Budget Setup → (3) Team/Resources → (4) Review
- Step 1: name, code, description, sector (office/healthcare/hospitality/retail/data-center), project_type (fit-out/renovation/new-construction), start_date, target_end
- Step 2: budget amount, currency, CSI division breakdown (pre-populate with standard CSI divisions)
- Step 3: assign project manager, add initial team members
- Step 4: review + submit → calls POST /api/pds/v1/projects

### C. Project Cockpit
File: `app/app/pds/projects/[projectId]/page.tsx`
This is the most important page. Model it after the REPE asset cockpit.

Tab structure:
1. **Overview** — 4 KPI cards (Budget Health, Schedule Health, Open Issues, Team Size) + milestone timeline + recent activity feed
2. **Schedule** — Gantt chart using Recharts (use BarChart with horizontal bars, custom tick rendering for dates) showing project_schedule_event rows, color-coded by status
3. **Budget** — fin_budget_line_csi table grouped by CSI division; stacked bar chart showing original vs. committed vs. actual; variance highlighted in red if over
4. **Subcontractors** — subcontract register table; "Add Subcontractor" action
5. **RFIs** — RFI log table; status filter; click to expand detail; "New RFI" button
6. **Change Orders** — CO register; pending COs highlighted; approve/reject actions for authorized users
7. **Submittals** — submittal log with spec section grouping
8. **Daily Reports** — chronological log; "Log Today's Report" button
9. **Issues** — issue + risk register (reuse existing `issue` table); priority/status filters
10. **Punch List** — grouped by trade; progress bar showing % resolved
11. **Documents** — document registry table with type filter

### D. PDS Command Center
File: `app/app/pds/page.tsx`
Executive overview dashboard:
- Header metrics: Total Active Projects, Total Budget Under Management, Projects On Schedule %, Projects On Budget %
- Project health grid: each project as a card showing name, sector, schedule health bar, budget health bar, open issues count, open RFIs count
- Portfolio timeline: mini Gantt showing all active projects on one timeline
- Recent activity feed: latest RFIs, COs, daily reports across all projects
- Alert panel: projects that are over budget, behind schedule, or have overdue RFIs

## TASK 4: NAVIGATION
Add PDS to the department navigation. Find where REPE and Finance appear in the sidebar/nav 
component and add:
```
{ key: 'pds', label: 'Project Delivery', icon: HardHat, href: '/app/pds' }
```

Sub-navigation for PDS:
- Command Center (`/app/pds`)
- Projects (`/app/pds/projects`)
- Subcontractors (`/app/pds/subcontractors`)
- Schedule (`/app/pds/schedule`)
- Financials (`/app/pds/financials`)
- Reports (`/app/pds/reports`)

## TASK 5: SHARED COMPONENTS
Create these in `components/shared/` for reuse across all verticals:

1. `StatusBadge.tsx` — renders colored badge for any status string; accepts `status` + optional `statusMap` prop
2. `MetricCard.tsx` — KPI card with label, value, trend (up/down/neutral), optional sparkline; extract from REPE cockpit
3. `BudgetVarianceBar.tsx` — horizontal progress bar showing original/committed/actual with color coding
4. `ApprovalQueue.tsx` — queue component for items needing approval; used by change orders, model governance
5. `GanttChart.tsx` — horizontal bar chart using Recharts for schedule visualization

## DESIGN PATTERNS TO FOLLOW

- Use Tailwind for all styling. Match existing color scheme.
- Use Lucide React for icons: `Building2` for projects, `HardHat` for PDS/construction, `Receipt` for change orders, `FileQuestion` for RFIs, `ClipboardList` for submittals, `AlertTriangle` for issues.
- Data loading: use React `useState` + `useEffect` with fetch calls to the API routes. Show skeleton loaders while loading.
- Error states: show error message in a red banner, never crash silently.
- Empty states: show a helpful empty state with an action button (e.g., "No RFIs yet — create the first one").
- Mutations: optimistic updates where possible; always show success/error toast.
- All money values: format with `Intl.NumberFormat` in USD (or respect `currency_code`).
- All dates: format with `date-fns` (already likely installed; if not: `npm install date-fns`).

## QUALITY BAR
Every page and API route you build must be at production quality:
- TypeScript with proper interfaces (define types for Project, RFI, ChangeOrder, etc. in `types/pds.ts`)
- No `any` types
- Proper loading states
- Proper error handling
- Consistent with REPE module patterns
- Multi-tenant safe (always filter by tenant_id + business_id)

## FIRST STEPS (do these in order)
1. Read the existing REPE pages and API routes to internalize the patterns
2. Create `migrations/004_pds_tables.sql`
3. Create `types/pds.ts` with all TypeScript interfaces
4. Build `/api/pds/v1/projects/route.ts`
5. Build `/app/app/pds/projects/page.tsx`
6. Build `/api/pds/v1/projects/[projectId]/overview/route.ts`
7. Build the Project Cockpit page
8. Build the PDS Command Center
9. Add to navigation
10. Create shared components

Start with Step 1 — read the REPE files first before writing any code.
```

---

## PART 9: PARALLEL WORKSTREAMS

While PDS is being built, queue these for immediate follow-on:

### CRO Consulting (next after PDS)
16 tables already exist (`cro_*`). Needs:
- `/app/consulting/` pages: clients, engagements, proposals, pipeline, revenue
- Command center with revenue metrics dashboard
- Proposal builder workflow
- Engagement P&L tracking

### Finance Construction (`/app/finance/construction`)
Already exists as a route stub. Connect it to:
- PDS project budgets
- Construction loan drawdown tracking
- Budget-to-actual for lenders

### Cross-vertical improvements
- Unified search across projects, deals, assets, clients
- Notification center (overdue RFIs, budget alerts, milestone due)
- User preferences + dashboard customization

---

*Built for Business Machine / STO Building Group partnership expansion — March 2026*
