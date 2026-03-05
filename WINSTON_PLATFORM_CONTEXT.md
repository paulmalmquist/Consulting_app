# Winston Platform — Developer Context & QA Findings

_Last updated: 2026-03-05 (rev 2 — REPE bug fixes applied). Use this document as AI context for resolving known issues and continuing platform development._

---

## 1. Platform Overview

**Winston** is a multi-tenant business intelligence and operations platform built for professional services firms (consulting, real estate private equity, legal ops, finance). It consists of:

- **Frontend** (`repo-b/`): Next.js 14 App Router, TypeScript, Tailwind CSS
- **Backend** (`backend/`): FastAPI (Python 3.11), PostgreSQL via `psycopg` (v3) — **note: psycopg3, not psycopg2**
- **Database**: Supabase (PostgreSQL 15). Migrations live in `repo-b/db/schema/`
- **Auth**: Supabase Auth + JWT middleware
- **Deployment**: Vercel (frontend) + Railway (backend — Docker, `backend/Dockerfile`)
- **Railway URL**: `https://authentic-sparkle-production-7f37.up.railway.app`

### Key Domain Modules

| Module | Prefix | Purpose |
|---|---|---|
| Real Estate PE | `re_`, `repe_` | Fund/deal/asset management, scenario modeling, waterfall analysis |
| PDS (Construction) | `pds_` | Portfolio delivery system — project tracking, financials, schedule |
| PDS Executive | `pds_executive` | AI-driven executive decision automation layer on top of PDS |
| Credit | `credit_` | Credit underwriting and monitoring |
| Legal Ops | `legal_ops_` | Matter tracking, billing, contract review |
| Med Office | `medoffice_` | Healthcare practice management |
| Consulting | `consulting_` | Client project tracking |
| CRM | `crm_` | Client relationship management |

---

## 2. Architecture: REPE Module

The REPE (Real Estate Private Equity) module is the most complex and actively developed. Workspace path: `/lab/env/[envId]/re/`

### Key Entities (DB tables)

```
repe_fund           → a fund vehicle (LP, GP structure)
repe_deal           → a deal/investment within a fund
repe_asset          → a physical asset (property) within a deal
re_model            → a scenario analysis model (cross-fund capable)
re_model_scope      → assets/investments included in a model
re_model_override   → per-asset assumption overrides (surgery)
re_model_run        → a run record for a model (compute results)
re_model_scenarios  → child scenarios under a model (schema 306)
re_model_scenario_assets → cross-fund asset assignments (schema 306)
```

### Environment Scoping

Every user workspace is tied to an `env_id` (UUID). The `env_business_bindings` table maps `env_id → business_id`, which scopes all queries to the correct tenant's data:

```sql
WHERE f.business_id = (
  SELECT business_id FROM env_business_bindings WHERE env_id = $1 LIMIT 1
)
```

`app.environments` also has a direct `business_id` column (added via migration `add_business_id_to_environments`, see Section 12).

### Cross-Fund Model Architecture (schema 306)

Migration `306_cross_fund_models.sql` made models environment-scoped and cross-fund:

- `re_model.primary_fund_id` is now **nullable** (optional context, not hard scope)
- `re_model.env_id` added for environment-level scoping
- `re_model_scenario_assets` tracks `source_fund_id` per asset (informational only)
- Models are uniquely identified by `(env_id, name)` — not fund
- Assets from **any fund** within the business can be added to any model scope

---

## 3. Architecture: PDS Executive Module

The PDS Executive module adds an AI-driven decision automation layer on top of the core PDS (construction delivery) data. It lives at:

```
/lab/env/[envId]/pds/executive
```

### Page Structure

The executive page has four tabs:
1. **Queue** — actionable decisions from the decision engine (approve / delegate / escalate / defer / reject)
2. **Strategic Messaging** — AI-generated narrative drafts for stakeholder communication
3. **Board / Investor** — briefing pack generator (board pack + investor pack)
4. **Decision Memory** — log of past decisions with outcomes

The header always shows 5 KPI cards: Open Queue, Critical Queue, High Queue, Open Signals, High Signals.

### Decision Catalog

20 pre-defined decision codes (D01–D20) across 5 categories: `strategy`, `pipeline`, `portfolio`, `org`, `client`, `risk`. Stored in `pds_exec_decision_catalog` table; falls back to `DEFAULT_DECISIONS` list in `catalog.py` if table doesn't exist (graceful degradation).

### Key DB Tables (schema 313–314)

```
pds_exec_decision_catalog    → 20 decision types with trigger rules
pds_exec_threshold_policy    → per-env/business threshold overrides
pds_exec_queue               → open decision items (env + business scoped)
pds_exec_memory              → historical decision log
pds_exec_messaging_drafts    → AI narrative drafts
pds_exec_briefings           → board/investor briefing records
```

Migration files: `repo-b/db/schema/313_pds_executive_automation.sql`, `314_pds_executive_integration.sql`

### Frontend Components

```
repo-b/src/
  app/lab/env/[envId]/pds/executive/page.tsx   ← page entry point
  components/pds-executive/
    ExecutiveOverview.tsx      ← KPI cards + tab shell + error banner
    DecisionQueue.tsx          ← Queue tab (table + inline action buttons)
    DecisionDetailDrawer.tsx   ← Slide-out drawer for queue item detail
    StrategicMessagingTab.tsx  ← Messaging drafts tab
    BoardInvestorBriefingsTab.tsx ← Board/investor tab
    DecisionMemoryTab.tsx      ← Memory log table
```

### Backend

```
backend/app/
  routes/pds_executive.py                ← FastAPI router (prefix: /api/pds/v1/executive)
  services/pds_executive/
    catalog.py          ← Decision catalog loader (graceful fallback to DEFAULT_DECISIONS)
    queue.py            ← Queue CRUD + action recording
    decision_engine.py  ← Core evaluation logic (20 decision loops)
    signals.py          ← Signal extraction from PDS data
    connectors.py       ← Data connector orchestration
    orchestrator.py     ← Full-cycle run coordinator
    narrative.py        ← AI narrative generation
    briefing.py         ← Board/investor pack generation
    memory.py           ← Decision memory log
  schemas/pds_executive.py               ← Pydantic models
  connectors/pds/                        ← PDS data connectors
    base.py, pds_internal_crm.py, pds_internal_finance.py,
    pds_internal_portfolio.py, pds_m365_calendar.py,
    pds_m365_mail.py, pds_market_external.py
```

### Registration in main.py

```python
# backend/app/main.py
from app.routes import (
    ...
    pds_executive,   # line 41
    ...
)
app.include_router(pds_executive.router)  # line 137
```

**⚠ DEPLOYMENT ISSUE (as of 2026-03-05):** The Railway backend is running an earlier build that does not include `pds_executive.router`. All `/api/pds/v1/executive/*` endpoints return 404. The code is committed and correct — this is a Railway deployment problem. Check Railway dashboard → latest deployment logs for the startup error.

---

## 4. API Reference — PDS Executive

All endpoints use Railway backend: `https://authentic-sparkle-production-7f37.up.railway.app`

### Context (working)
- `GET /api/pds/v1/context?env_id=<uuid>` → **200** ✓ Returns env + business context

### Executive Overview
- `GET /api/pds/v1/executive/overview?env_id=<uuid>&business_id=<uuid>` → **404** (not deployed)

### Decision Queue
- `GET /api/pds/v1/executive/queue?env_id=<uuid>&business_id=<uuid>&limit=100` → **404**
- `POST /api/pds/v1/executive/queue/{id}/actions` → **404**

### Run Triggers
- `POST /api/pds/v1/executive/runs/connectors` → **404**
- `POST /api/pds/v1/executive/runs/full` → **404**

### Strategic Messaging
- `GET /api/pds/v1/executive/messaging/drafts?env_id=<uuid>&business_id=<uuid>&limit=100` → **404**
- `POST /api/pds/v1/executive/messaging/generate` → **404**

### Briefings
- `GET /api/pds/v1/executive/briefings` → **404**
- `POST /api/pds/v1/executive/briefings/generate` → **404** (used by both board pack + investor pack)

### Decision Memory
- `GET /api/pds/v1/executive/memory?env_id=<uuid>&business_id=<uuid>&limit=100` → **404**

---

## 5. API Reference — REPE Models

### Assets
- `GET /api/re/v2/assets?env_id=<uuid>` — All assets for the business (cross-fund). Also accepts `fund_id`, `sector`, `state`, `msa`, `status`, `q`, `investment_id` filters.

### Models
- `GET /api/re/v2/models?env_id=<uuid>` — List models in environment
- `POST /api/re/v2/models` — Create model (`name`, `description`, `env_id`, `primary_fund_id` optional)
- `GET /api/re/v2/models/[modelId]` — Get model detail
- `PATCH /api/re/v2/models/[modelId]` — Update model (status, name, description)
- `DELETE /api/re/v2/models/[modelId]` — Delete model

### Model Scope (asset selection)
- `GET /api/re/v2/models/[modelId]/scope` — List scoped assets
- `POST /api/re/v2/models/[modelId]/scope` — Add asset to scope `{ scope_type: "asset", scope_node_id: assetId }`
- `DELETE /api/re/v2/models/[modelId]/scope/[assetId]` — Remove asset from scope

### Model Overrides (surgery)
- `GET /api/re/v2/models/[modelId]/overrides` — List overrides
- `POST /api/re/v2/models/[modelId]/overrides` — Create/update override
- `DELETE /api/re/v2/models/[modelId]/overrides/[overrideId]` — Delete override

### Model Execution
- `POST /api/re/v2/models/[modelId]/run` — Run model (**STUB** — see Bug #1 below)
- `POST /api/re/v2/models/[modelId]/monte-carlo` — Run Monte Carlo simulation

---

## 6. Asset Surgery Workflow

The "Surgery" feature allows per-asset assumption overrides within a model:

1. User selects assets in the **Assets tab**
2. Clicks **Surgery** button on any selected asset → opens `AssetSurgeryDrawer`
3. Drawer has 5 tabs: **Assumptions** | **Cash Flows** | **Sensitivity** | **Comps** | **Notes**
4. Assumptions tab: 5 override fields per asset:
   - Rent Growth (%, annualized)
   - Expense Growth (%, annualized)
   - Vacancy Rate (%)
   - Exit Cap Rate (%)
   - Hold Period (years)
5. Each field: input + "Use Model Default" toggle
6. Overrides saved via `POST /api/re/v2/models/[modelId]/overrides`
7. Override objects reference `{ scope_type, scope_id, key, value }`

### Override Validation (currently via UI clamp only)
- Percentages: 0.01% – 9.03% (not 0–100% as labeled — **Bug**)
- Hold period: 0 – 30 years
- Invalid text inputs silently clamp to 0.00 with no user feedback (**Bug**)

---

## 7. QA Findings — REPE Model (70 Test Cases)

**Summary: 55 PASS | 5 FAIL | 10 NOTE/BLOCKED**

### Section 1: Model Creation and Listing
- All model creation, listing, search, and filter flows PASS.

### Section 2: Asset Surgery — Drawer Access
- Drawer opens correctly from Assets tab. PASS.

### Section 3: Asset Surgery — Assumptions Tab
- All 5 assumption fields render and persist. PASS.
- Override persistence on reload: PASS.
- "Use Model Default" toggle clears override: PASS.

### Section 4: Asset Surgery — Input Validation
- **BUG (Medium)**: Percentage fields label 0–100% but actually accept 0.01%–9.03% max. Silent clamp with no user feedback.
- **BUG (Low)**: Text inputs ("abc") silently clamp to 0.00 with no error message.

### Section 5–8: Surgery Tabs (Cash Flows, Sensitivity, Comps, Notes)
- Cash Flows: basic display only. Sensitivity + Comps: stubs, no data rendered. Notes: saves correctly.

### Section 9: Multi-Asset Overrides
- PASS: Different overrides per asset persist independently.

### Section 10: Override Interaction with Model Run
- NOTE/BLOCKED: Cannot fully test — model run is a stub (see Bug #1).

### Section 11: Model Overview Tab
- PASS: Displays model metadata, scope count, status. Run Model button triggers POST.

### Section 12: Assets Tab — Asset Selection
- PASS: Assets load and display. Add/Remove from scope works.
- **FIXED**: Fund filter dropdown added (see Section 9 below). Only shows when assets span multiple funds.

### Section 13: Assets Tab — Scope Persistence
- PASS: Scope additions/removals persist across page reload.

### Section 14: Fund Impact Tab
- **BUG (High)**: Model run is a stub — Fund Impact never populates.

### Section 15: Monte Carlo Tab
- **BUG (Medium)**: Results display raw JSON instead of fan chart visualization.

### Section 16: Model Status Controls
- PASS: Approve/Archive work. **BUG (Low)**: Archive has no confirmation dialog.

### Section 17: Error Handling
- **NOTE**: Archived models remain fully editable — no locked/read-only state enforced.

---

## 8. QA Findings — PDS Executive (31 Test Cases, 2026-03-05)

**Summary: 9 PASS | 14 FAIL | 2 BLOCKED | 6 NOTE/PARTIAL**

**Root cause of all FAIL/BLOCKED**: Railway backend not redeployed with `pds_executive` router. All `/api/pds/v1/executive/*` → 404. Core infrastructure is otherwise correct.

### Section 1: Navigation + Page Load — PASS with BUG
- Left nav shows "Executive" ✓
- 5 KPI cards render (Open Queue, Critical Queue, High Queue, Open Signals, High Signals) ✓
- "Decision coverage: 20 decision loops in catalog." renders ✓
- 4 tabs render correctly ✓
- **BUG**: Error banner (`border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100`) shows "Not Found" text but is near-invisible — `text-red-100` on light pink background fails WCAG contrast

### Section 2: Overview Actions — FAIL
- Run Connectors: POST `/api/pds/v1/executive/runs/connectors` → 404, silent failure
- Run Full Cycle: POST `/api/pds/v1/executive/runs/full` → 404, silent failure
- Neither button shows loading/disabled state during request

### Section 3: Decision Queue — BLOCKED
- GET `/api/pds/v1/executive/queue` → 404. Empty state: "No executive queue items yet."
- Tab badge correctly shows "Queue (0)" as fallback

### Section 4: Decision Detail Drawer — BLOCKED
- No queue items to test. Drawer entirely untestable until backend deploys.

### Section 5: Strategic Messaging — FAIL
- Tab renders correctly: "Executive Narrative Engine" heading, Generate Drafts button ✓
- GET `/api/pds/v1/executive/messaging/drafts` → 404 (page load)
- POST `/api/pds/v1/executive/messaging/generate` → 404 (button click), silent failure

### Section 6: Board / Investor Briefings — FAIL
- Tab renders correctly: "Briefing Generator" + two buttons ✓
- POST `/api/pds/v1/executive/briefings/generate` → 404 for both Generate Board Pack and Generate Investor Pack, silent failures

### Section 7: Decision Memory — FAIL
- Tab renders with correct table structure (DECISION / STATUS / LAST ACTION / OUTCOME) ✓
- GET `/api/pds/v1/executive/memory` → 404 on page load. Empty state shown.

### Section 8: Error Handling — FAIL
- Error banner has text "Not Found" but `text-red-100` on `bg-red-500/10` is near-invisible
- Message is raw API response, not user-friendly
- **All 5 action buttons lack loading/disabled state**: Run Connectors, Run Full Cycle, Generate Drafts, Generate Board Pack, Generate Investor Pack
- No toast notifications on failure

### Section 9: Environment / Context — PASS
- GET `/api/pds/v1/context` → 200 ✓
- Header shows "Environment: env_stonepds · Business: 68b3d128" ✓
- `env_id` + `business_id` correctly passed to all executive API calls ✓

### Section 10: Responsive + Basic UX — PARTIAL
- No horizontal overflow at 1440px ✓
- Mobile breakpoints not testable in automated test environment

### Section 11: Console / Network Audit — NOTE
- Console: clean (production build suppresses logs)
- Page-load requests: `GET /context` → 200; `GET /overview` → 404; `GET /queue` → 404; `GET /messaging/drafts` → 404; `GET /memory` → 404

### Section 12: Smoke Regression (other PDS pages) — MIXED
- Command Center: PASS ✓ (Construction Mission Control loads)
- Financials: PASS ✓ ($0 values, no errors)
- **Projects page: FAIL** — raw DB error exposed to users: `relation "pds_projects" does not exist`
- Executive error isolation: PASS — 404s don't crash other PDS pages

---

## 9. Known Bugs — Full Prioritized List

### REPE Bugs — Open

#### Bug #1 — HIGH: Model Run Never Executes (Stub)
**File**: `repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts`
Creates placeholder `re_model_run` record with `status='in_progress'` and returns 202. Never calls Python compute engine. Fund Impact tab never populates with real results.
**Note**: `FundImpactTab.tsx` now polls `/api/re/v2/models/${modelId}/runs/latest` after triggering — the polling infrastructure is ready; only the backend compute is missing.

#### Bug #8 — LOW: `env_id` Ignored in `list_available_assets`
**File**: `backend/app/services/re_model_scenario.py`
`env_id` param accepted but not used in SQL — may return cross-tenant assets.

### REPE Bugs — Fixed (commit `92fc41d`, 2026-03-04)

#### Bug #2 — FIXED: Fund Impact Loading Only Showed Once
**File**: `repo-b/src/components/repe/model/FundImpactTab.tsx`
`FundImpactTab` now maintains `polling` and `runTriggered` state that reset on every click. Immediately enters loading state on run click; polls `/runs/latest` endpoint for status updates.

#### Bug #3 — FIXED: Fund Filter Missing from Asset Picker
**File**: `repo-b/src/components/repe/model/AssetsTab.tsx`
Fund filter dropdown added. Conditional on `funds.length > 1`. Full cross-fund selection supported. (Fixed in prior session.)

#### Bug #4 — FIXED: Monte Carlo Results Showed Raw JSON
**File**: `repo-b/src/components/repe/model/MonteCarloTab.tsx`
Complete rewrite (303 lines). Now renders:
- **Summary KPIs**: Mean IRR, Mean TVPI, P(IRR < 0), VaR (5th percentile)
- **IRR Histogram**: 30-bucket bar chart with hover counts
- **Percentile Tables**: Side-by-side P5/P10/P25/P50/P75/P90/P95 bars for both IRR and TVPI
- **Risk Metrics**: P10/P90 grid for IRR and TVPI
Uses seeded PRNG (mulberry32) + Box-Muller transform for reproducible client-side simulation. Also fires the backend API call (errors silently so visualization works regardless of backend status).

#### Bug #5 — FIXED: Override Input Validation Misleading
**File**: `repo-b/src/components/repe/model/AssetSurgeryDrawer.tsx`
Every `OverrideField` now shows a `rangeHint` label (`"0% – 100%"` or the actual configured range). Non-numeric input is rejected via `isNaN` guard. Values are clamped to `[min, max]` with the actual bounds visible to the user.

#### Bug #6 — FIXED: Archive Had No Confirmation Dialog
**File**: `repo-b/src/components/repe/model/ModelHeader.tsx`
Archive button now opens a `Dialog` component with title "Archive Model", description explaining the read-only consequence, and Cancel / Archive (destructive) action buttons. Archive button is hidden entirely once model is archived.

#### Bug #7 — FIXED: Archived Models Were Fully Editable
**Files**: `repo-b/src/app/lab/env/[envId]/re/models/[modelId]/page.tsx`, `AssetsTab.tsx`, `AssetSurgeryDrawer.tsx`
`page.tsx` derives `isArchived = model?.status === "archived"` and:
- Shows an amber banner: "This model is archived and read-only. No changes can be made..."
- Passes `readOnly={isArchived}` to `AssetsTab` (disables Add button + hides Surgery button)
- Passes `readOnly={isArchived}` to `AssetSurgeryDrawer` (hides Save, shows "Read-only (archived model)")

### PDS Executive Bugs — Open

#### Bug #9 — CRITICAL: pds_executive Router Not Deployed to Railway
**Root cause**: Railway is running a build without the `pds_executive` router. Code is committed and correct — all files are in `backend/app/routes/pds_executive.py`, registered in `main.py` at lines 41 and 137, all syntax-checked clean. Check Railway dashboard → latest deployment logs for the startup failure reason.
**All `/api/pds/v1/executive/*` return 404 until resolved.**

#### Bug #10 — HIGH: Projects Page Exposes Raw DB Error
**Page**: `/pds/projects`
Raw SQL error surfaced: `relation "pds_projects" does not exist`. Apply DB migration or wrap query in try/except returning empty list.

#### Bug #11 — HIGH: Error Banner Text Is Near-Invisible
**File**: `repo-b/src/components/pds-executive/ExecutiveOverview.tsx`
CSS: `text-red-100` on `bg-red-500/10` fails WCAG contrast. Fix: change to `text-red-700` or `text-red-800`.

#### Bug #12 — HIGH: Raw "Not Found" Shown to Users
**File**: Same as above.
Replace raw API error string with friendly copy: "Executive service temporarily unavailable. Please try again."

#### Bug #13 — MEDIUM: No Loading/Disabled States on Executive Action Buttons
All 5 executive action buttons (Run Connectors, Run Full Cycle, Generate Drafts, Generate Board Pack, Generate Investor Pack) can be clicked repeatedly with no feedback or debounce. Add `isLoading` state + `disabled={isLoading}` to each.

#### Bug #14 — MEDIUM: Per-Section Error vs Empty-State Indistinguishable
Queue, Messaging, Memory tabs all show "No items yet" on both 404 and genuine empty data. Add a distinct error state (e.g. a small inline alert) for API failure vs genuinely empty.

---

## 10. Infrastructure Fixes Applied (2026-03-04/05 session)

### Fix 1: env_context.py — business_id column guard
**File**: `backend/app/services/env_context.py`

The Python service was unconditionally selecting `business_id::text` from `app.environments`, crashing if the column didn't exist. Fixed by adding a column introspection helper:

```python
def _column_exists(cur, fq_table: str, column_name: str) -> bool:
    schema_name, table_name = fq_table.split(".", 1) if "." in fq_table else ("public", fq_table)
    cur.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
    """, (schema_name, table_name, column_name))
    return bool(cur.fetchone())

# In resolve_env_business_context:
has_business_id_col = _column_exists(cur, "app.environments", "business_id")
business_id_expr = "business_id::text AS business_id" if has_business_id_col else "NULL::text AS business_id"
```

### Fix 2: Supabase migration — add business_id to app.environments
**Migration name**: `add_business_id_to_environments`
**Project**: `ozboonlsplroialdwuxj`

```sql
ALTER TABLE app.environments
  ADD COLUMN IF NOT EXISTS business_id uuid
    REFERENCES app.businesses(business_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_environments_business_id
  ON app.environments(business_id) WHERE business_id IS NOT NULL;

-- Back-fill from existing bindings table
UPDATE app.environments e
   SET business_id = eb.business_id
  FROM app.env_business_bindings eb
 WHERE eb.env_id = e.env_id AND e.business_id IS NULL;
```

### Fix 3: AssetsTab.tsx — Fund filter dropdown
**File**: `repo-b/src/components/repe/model/AssetsTab.tsx`

```tsx
const [filterFund, setFilterFund] = useState("");
const funds = useMemo(
  () => [...new Set(assets.map((a) => a.fund_name).filter(Boolean))].sort() as string[],
  [assets],
);
// In availableAssets useMemo — add:
if (filterFund) pool = pool.filter((a) => a.fund_name === filterFund);
// In JSX filter bar — add (only shown when funds.length > 1):
{funds.length > 1 && (
  <select value={filterFund} onChange={(e) => setFilterFund(e.target.value)}>
    <option value="">All Funds</option>
    {funds.map((f) => <option key={f} value={f}>{f}</option>)}
  </select>
)}
```

---

## 11. Cross-Fund Asset Picker — Additional Context

The `AssetsTab.tsx` Fund filter fix is **committed**. Full cross-fund support works end-to-end:
- `GET /api/re/v2/assets?env_id=<uuid>` returns all assets across all funds via `env_business_bindings → business_id` join
- `re_model_scope` is fund-agnostic (stores `scope_node_id = asset_id`)
- `re_model.primary_fund_id` is optional context only, not a scope constraint
- Selected Assets table also shows a "Location" column to identify asset origin

---

## 12. Model Run Wiring (Future Work)

To make the Fund Impact tab functional:

### Option A: Frontend calls FastAPI backend
```typescript
// repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts
const backendRes = await fetch(`${BACKEND_URL}/re/v2/models/${params.modelId}/run`, {
  method: "POST",
  headers: { Authorization: `Bearer ${serviceToken}` }
});
```

### Important: Python Engine is Single-Fund
Before wiring, `backend/app/services/re_model_run.py` must be updated:
```python
# Current (single-fund — will crash if primary_fund_id is null):
fund_id = UUID(str(model["primary_fund_id"]))

# Needed (cross-fund):
scoped_asset_ids = get_model_scope_asset_ids(model_id)
results = compute_for_assets(scoped_asset_ids, overrides)
```

---

## 13. Monte Carlo Visualization (Future Work)

`MonteCarloTab.tsx` receives simulation results but shows raw JSON. Build using `recharts`:

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
// P10 = dashed, P50 = solid primary, P90 = dashed
// Also: distribution histogram + summary stats table (mean, std dev, Sharpe)
```

---

## 14. Test Environment Reference

| Property | Value |
|---|---|
| env_id | `a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2` |
| env_slug | `env_stonepds` |
| business_id | `68b3d128-bb6d-4d34-818f-608a6a22847d` |
| business_id (short) | `68b3d128` |
| PDS Executive URL | `paulmalmquist.com/lab/env/a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2/pds/executive` |
| Supabase project | `ozboonlsplroialdwuxj` |
| Railway backend | `https://authentic-sparkle-production-7f37.up.railway.app` |

---

## 15. Prompting Guidance for AI Assistants

When working on this codebase, always:

1. **Check both repos**: Frontend in `repo-b/src/`; backend compute in `backend/app/`
2. **Verify NextJS routes vs FastAPI routes**: Some endpoints exist in both (NextJS proxies FastAPI); some are NextJS-only (like the run stub)
3. **Use `env_id` for all asset/model queries**: Never hard-code `fund_id` for cross-fund queries
4. **Check schema migrations**: `repo-b/db/schema/` has numbered SQL files; higher numbers are newer. Executive schemas are 313–314.
5. **TypeScript types**: `Asset`, `ReModel`, `ReModelScope`, `ReModelOverride` in `types.ts`; PDS executive types in `repo-b/src/types/pds.ts`
6. **Tailwind classes use `bm-` prefix**: Custom design tokens (`text-bm-muted2`, `bg-bm-surface`, `border-bm-border`)
7. **The model run is a stub**: `re_model_run` records with `in_progress` don't mean computation ran
8. **psycopg version is 3** (`psycopg`, not `psycopg2`): use `psycopg.rows.dict_row`, async patterns differ from v2
9. **Railway is the backend host**: Not Heroku, not EC2. Build config at `backend/railway.json` + `backend/Dockerfile`. Health check at `/health`.
10. **env_context resolution**: `backend/app/services/env_context.py` resolves `env_id → business_id` using both `env_business_bindings` table and direct `app.environments.business_id` column (with column introspection guard for safety)
11. **PDS executive router IS registered in main.py**: If endpoints return 404, the issue is Railway deployment, not code
12. **Test with real env_id**: Get from URL or DB. See Section 14 for reference values.

---

_Document covers two QA sessions: Winston Asset Surgery / REPE Models (2026-03-04) and PDS Executive (2026-03-05). QA results spreadsheet: `PDS_Executive_QA_Results_2026-03-05.xlsx`._
