# Winston Platform — Developer Context & QA Findings

_Last updated: 2026-03-04. Use this document as AI context for resolving known issues and continuing platform development._

---

## 1. Platform Overview

**Winston** is a multi-tenant business intelligence and operations platform built for professional services firms (consulting, real estate private equity, legal ops, finance). It consists of:

- **Frontend** (`repo-b/`): Next.js 14 App Router, TypeScript, Tailwind CSS
- **Backend** (`backend/`): FastAPI (Python 3.11), PostgreSQL via `asyncpg` + `psycopg2`
- **Database**: Supabase (PostgreSQL 15). Migrations live in `repo-b/db/schema/`
- **Auth**: Supabase Auth + JWT middleware
- **Deployment**: Vercel (frontend) + containerized FastAPI (backend)

### Key Domain Modules

| Module | Prefix | Purpose |
|---|---|---|
| Real Estate PE | `re_`, `repe_` | Fund/deal/asset management, scenario modeling, waterfall analysis |
| Credit | `credit_` | Credit underwriting and monitoring |
| Legal Ops | `legal_ops_` | Matter tracking, billing, contract review |
| Med Office | `medoffice_` | Healthcare practice management |
| Consulting | `consulting_` | Client project tracking |
| PDS | `pds_` | Portfolio data system |
| CRM | `crm_` | Client relationship management |

---

## 2. Architecture Deep-Dive: REPE Module

The REPE (Real Estate Private Equity) module is the most complex and actively developed. Its workspace is accessed at:

```
/lab/env/[envId]/re/
```

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

Every user workspace is tied to an `env_id` (UUID). The `env_business_bindings` table maps `env_id → business_id`, which scopes all queries to the correct tenant's data. Asset queries use this pattern:

```sql
WHERE f.business_id = (
  SELECT business_id FROM env_business_bindings WHERE env_id = $1 LIMIT 1
)
```

### Cross-Fund Model Architecture (schema 306)

Migration `306_cross_fund_models.sql` made models environment-scoped and cross-fund:

- `re_model.primary_fund_id` is now **nullable** (optional context, not hard scope)
- `re_model.env_id` added for environment-level scoping
- `re_model_scenario_assets` tracks `source_fund_id` per asset (informational only)
- Models are uniquely identified by `(env_id, name)` — not fund
- Assets from **any fund** within the business can be added to any model scope

---

## 3. Codebase Structure

### Frontend (`repo-b/`)

```
src/
  app/
    api/re/v2/          ← Next.js API Route Handlers (server-side)
      assets/           ← GET /api/re/v2/assets (cross-fund asset list)
      models/[modelId]/
        route.ts        ← GET/PATCH/DELETE model
        run/route.ts    ← POST run model (CURRENTLY A STUB)
        monte-carlo/    ← POST Monte Carlo simulation
        scope/          ← GET/POST/DELETE scope entries
        overrides/      ← GET/POST/DELETE overrides
    lab/env/[envId]/re/
      models/[modelId]/page.tsx  ← Model workspace page
  components/repe/model/
    ModelHeader.tsx     ← Status badge, Approve/Archive actions
    ModelTabBar.tsx     ← Tab navigation (overview/assets/surgery/fund-impact/monte-carlo)
    ModelOverviewTab.tsx ← Summary + Run Model button
    AssetsTab.tsx       ← Asset picker (Sector + State filters; Fund filter MISSING)
    AssetSurgeryDrawer.tsx ← Per-asset assumption override panel
    FundImpactTab.tsx   ← Fund impact results (never populates — run is stub)
    MonteCarloTab.tsx   ← MC results viewer (shows raw JSON, no visualization)
    types.ts            ← Shared TypeScript types (ReModel, Asset, ReModelScope, etc.)
```

### Backend (`backend/`)

```
app/
  routes/
    re_v2.py            ← FastAPI routes for RE v2 models, scenarios, assets
  services/
    re_model_run.py     ← Compute engine (SINGLE-FUND, not called by frontend)
    re_model_scenario.py ← Scenario/asset helpers (already cross-fund in SQL)
  schemas/
    re_institutional.py ← Pydantic models (ReModelCreateRequest, etc.)
```

### Database Migrations

```
repo-b/db/schema/
  306_cross_fund_models.sql  ← Cross-fund model tables and schema changes
```

---

## 4. API Reference — REPE Models

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

## 5. Asset Surgery Workflow

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

## 6. QA Findings — Full Results (70 Test Cases)

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

### Section 5: Asset Surgery — Cash Flows Tab
- Tab renders. NOTE: Basic display only, no override entry in this tab.

### Section 6: Asset Surgery — Sensitivity Tab
- NOTE: Tab stub — no sensitivity analysis rendered yet.

### Section 7: Asset Surgery — Comps Tab
- NOTE: Tab stub — comp data not populated.

### Section 8: Asset Surgery — Notes Tab
- PASS: Notes field renders and saves.

### Section 9: Asset Surgery — Multi-Asset Overrides
- PASS: Different overrides per asset persist independently.

### Section 10: Asset Surgery — Override Interaction with Model Run
- NOTE/BLOCKED: Cannot fully test — model run is a stub (see Bug #1).

### Section 11: Model Overview Tab
- PASS: Displays model metadata, scope count, status.
- PASS: Run Model button triggers POST request.

### Section 12: Assets Tab — Asset Selection
- PASS: Assets load and display. Add/Remove from scope works.
- **NOTE**: Only Sector and State filters present. **Fund filter missing** (see Bug #3 / fix below).

### Section 13: Assets Tab — Scope Persistence
- PASS: Scope additions/removals persist across page reload.

### Section 14: Fund Impact Tab
- **BUG (High)**: Model run is a stub — creates `in_progress` record but never computes. Fund Impact results never populate. Loading state shows on first run trigger only (subsequent clicks show no loading indicator — **Bug #2**).

### Section 15: Monte Carlo Tab
- **BUG (Medium)**: Simulation completes (backend returns 200) but results display raw JSON metadata instead of fan chart visualization. No P10/P50/P90 percentile bands rendered.

### Section 16: Model Status Controls
- PASS: Approve (draft→approved) and Archive (approved→archived) both work via PATCH.
- **BUG (Low)**: Archive action has no confirmation dialog — immediate irreversible action.

### Section 17: Error Handling
- **NOTE (UX)**: Archived models remain fully editable (surgery, scope changes). No locked/read-only state enforced.
- **BUG (Medium)**: Input validation is UI-only; no server-side validation errors surfaced to user. Silent clamping.

---

## 7. Known Bugs — Prioritized

### Bug #1 — HIGH: Model Run Never Executes (Stub)
**File**: `repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts`
**Issue**: `POST /api/re/v2/models/[modelId]/run` only creates a placeholder `re_model_run` record with `status='in_progress'` and returns 202. It never calls the Python compute engine (`backend/app/services/re_model_run.py`). The run stays `in_progress` forever, so the Fund Impact tab never shows results.
**Fix Required**:
1. Connect the NextJS route to the FastAPI backend (HTTP call or direct DB queue)
2. OR implement the computation logic in the NextJS route using direct DB access
3. The Python engine in `re_model_run.py` uses `primary_fund_id` (single fund) — needs refactoring for cross-fund support before wiring up

### Bug #2 — HIGH: Fund Impact Loading Indicator Only Shows Once
**File**: `repo-b/src/components/repe/model/ModelOverviewTab.tsx` (or `FundImpactTab.tsx`)
**Issue**: Clicking "Run Model" shows a loading state the first time only. Subsequent clicks do not re-trigger loading state.
**Fix**: Track loading state per-click; reset to loading on each run trigger.

### Bug #3 — MEDIUM: Fund Filter Missing from Asset Picker
**File**: `repo-b/src/components/repe/model/AssetsTab.tsx`
**Issue**: The Available Assets table only has Sector and State filter dropdowns. There is no Fund filter, making it hard to browse/select assets when a model spans multiple funds.
**Fix**: Add `filterFund` state and Fund dropdown (see Section 8 below).

### Bug #4 — MEDIUM: Monte Carlo Results Show Raw JSON
**File**: `repo-b/src/components/repe/model/MonteCarloTab.tsx`
**Issue**: After a Monte Carlo simulation runs, the tab displays raw JSON metadata instead of a visualization (fan chart, P10/P50/P90 bands, histogram).
**Fix**: Build results visualization UI (recharts fan chart with percentile bands).

### Bug #5 — MEDIUM: Override Input Validation Misleading
**File**: `repo-b/src/components/repe/model/AssetSurgeryDrawer.tsx` (Assumptions tab)
**Issue**: Percentage fields display "0–100%" label but silently clamp to 0.01%–9.03%. Text input ("abc") silently becomes 0.00 with no error message.
**Fix**: (a) Correct field labels/placeholders to show actual valid range, (b) Add inline validation error messages, (c) Add server-side validation in the overrides API route.

### Bug #6 — LOW: Archive Has No Confirmation Dialog
**File**: `repo-b/src/components/repe/model/ModelHeader.tsx`
**Issue**: Clicking Archive immediately archives the model without a confirmation prompt. This is irreversible from the UI.
**Fix**: Add a confirmation modal/dialog before executing archive action.

### Bug #7 — LOW: Archived Models Remain Fully Editable
**Issue**: Models in `archived` status can still have assets added/removed, surgery performed, and overrides changed. There is no read-only enforcement.
**Fix**: Check `model.status === 'archived'` and disable editing UI (or add banner + soft lock).

### Bug #8 — LOW: `env_id` Ignored in `list_available_assets`
**File**: `backend/app/services/re_model_scenario.py`
**Issue**: The `list_available_assets(env_id)` function accepts `env_id` parameter but does not use it in the SQL query, potentially returning assets across tenants.
**Fix**: Add `env_id` filter via `env_business_bindings` join in the Python query.

---

## 8. Cross-Fund Asset Picker Fix

### Context
Models should be able to include assets from **any fund** within the organization. This supports scenarios like modeling simultaneous sales of assets held in different funds. The DB and API already support this — only the UI filter is missing.

### What Already Works
- `GET /api/re/v2/assets?env_id=<uuid>` returns **all assets** across all funds for the business (cross-fund by design — uses `env_business_bindings → business_id` join)
- `re_model_scope` table is fund-agnostic (just stores `scope_node_id = asset_id`)
- Schema 306 (`306_cross_fund_models.sql`) formally supports cross-fund models
- `re_model.primary_fund_id` is optional context only, not a constraint

### What Needs to Change: `AssetsTab.tsx`

Add a **Fund filter dropdown** to the Available Assets filter bar:

```tsx
// 1. Add state (alongside existing filterSector / filterState):
const [filterFund, setFilterFund] = useState("");

// 2. Extract unique fund names from assets:
const funds = useMemo(
  () => [...new Set(assets.map((a) => a.fund_name).filter(Boolean))].sort() as string[],
  [assets],
);

// 3. Add fund filter to availableAssets computation:
const availableAssets = useMemo(() => {
  let pool = assets.filter((a) => !scopedAssetIds.has(a.asset_id));
  if (search) { ... }
  if (filterSector) pool = pool.filter((a) => a.sector === filterSector);
  if (filterState) pool = pool.filter((a) => a.state === filterState);
  if (filterFund) pool = pool.filter((a) => a.fund_name === filterFund);  // ← ADD THIS
  return pool;
}, [assets, scopedAssetIds, search, filterSector, filterState, filterFund]);

// 4. Add Fund select dropdown to JSX filter bar:
<select
  className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
  value={filterFund}
  onChange={(e) => setFilterFund(e.target.value)}
>
  <option value="">All Funds</option>
  {funds.map((f) => (
    <option key={f} value={f}>{f}</option>
  ))}
</select>
```

Also consider adding **Fund** as a visible column in the Selected Assets table (it's already in the Available Assets table as `asset.fund_name`).

---

## 9. Model Run Wiring (Future Work)

To make the Fund Impact tab functional, the run route must invoke actual computation:

### Option A: Frontend calls FastAPI backend
```typescript
// In repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts
const backendRes = await fetch(`${BACKEND_URL}/re/v2/models/${params.modelId}/run`, {
  method: "POST",
  headers: { Authorization: `Bearer ${serviceToken}` }
});
```

### Option B: Direct DB computation in NextJS
Implement the computation logic using direct PostgreSQL access (via `getPool()`), bypassing the Python backend.

### Important: Python Engine is Single-Fund
Before wiring, `backend/app/services/re_model_run.py` must be updated to support cross-fund operation:
```python
# Current (single-fund):
fund_id = UUID(str(model["primary_fund_id"]))
scenario_id = _ensure_model_scenario(model_id, fund_id)

# Needed (cross-fund):
# Use re_model_scope to get all asset_ids, then compute per-asset regardless of fund
scoped_asset_ids = get_model_scope_asset_ids(model_id)
results = compute_for_assets(scoped_asset_ids, overrides)
```

---

## 10. Monte Carlo Visualization (Future Work)

The `MonteCarloTab.tsx` component receives simulation results but renders no chart. The backend returns simulation runs with percentile data. The visualization should show:

1. **Fan chart**: Lines for P10, P50 (median), P90 percentile bands over time
2. **Distribution histogram**: Distribution of terminal values across 1000 simulations
3. **Summary stats table**: Mean, std dev, min, max, Sharpe ratio, etc.

Use `recharts` (already available in the project) for the fan chart:
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
// P10 = dashed, P50 = solid primary, P90 = dashed
```

---

## 11. Prompting Guidance for AI Assistants

When working on this codebase, always:

1. **Check both repos**: Frontend logic is in `repo-b/src/`; backend compute is in `backend/app/`
2. **Verify NextJS routes vs FastAPI routes**: Some endpoints exist in both (NextJS proxies FastAPI); some are NextJS-only (like the run stub)
3. **Use `env_id` for all asset/model queries**: Never hard-code `fund_id` for cross-fund queries
4. **Check schema migrations**: `repo-b/db/schema/` has numbered SQL files; higher numbers are newer
5. **TypeScript types are in `types.ts`**: Check `Asset`, `ReModel`, `ReModelScope`, `ReModelOverride` before adding new fields
6. **Tailwind classes use `bm-` prefix**: Custom design tokens (e.g., `text-bm-muted2`, `bg-bm-surface`, `border-bm-border`)
7. **The model run is a stub**: Don't assume `re_model_run` records with `in_progress` mean computation is happening
8. **Test with real `env_id`**: The platform uses environment UUIDs to scope data — get one from the URL or DB before testing

---

_Document generated from QA session covering Winston Asset Surgery Workflow and REPE Model features. Contact the development team for access to test environment credentials._
