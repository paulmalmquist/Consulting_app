# Winston Platform — AI Engineering Meta Prompt
**Purpose:** Paste this prompt into your AI coding assistant (Claude Code, Cursor, Copilot, etc.) to fix all critical bugs, complete missing features, and seed end-to-end functional data across the Winston platform. Work through every section in order — later items depend on earlier fixes.

---

## CONTEXT

You are working on **Winston**, a multi-tenant SaaS platform built for institutional investment operations. It has two primary product surfaces relevant to this task:

1. **PDS (Project Delivery System)** — construction program controls for a tenant called `StonePDS`. Routes live under `/pds`, `/legal`, `/accounting`, `/reporting`, etc.
2. **RE/REPE (Real Estate / Private Equity Modeling)** — cross-fund scenario modeling for a tenant called `Meridian Capital Management`. Routes live under `/re`, `/re/models`.

The platform uses:
- **Next.js** (or similar React framework) on the frontend
- **PostgreSQL** as the primary database
- **Multi-tenant architecture** — each tenant is identified by an `env_id` UUID
- **Seeded test environments** populated via a `environment.seeded` system event

---

## SECTION 1 — CRITICAL DATABASE FIX (Do this first)

### BUG-001: Missing `industry_type` column causes full PDS crash

**Symptom:** Every request to `/pds`, `/legal`, and any route requiring workspace context returns:
```
ERROR: column "industry_type" does not exist
LINE 2: ...SELECT env_id::text, client_name, industry, industry_type...
```

**Root cause:** A query/ORM definition references an `industry_type` column that was never added to the workspace/environment table, or was added to the query but the corresponding migration was never run.

**Fix — choose the appropriate approach:**

**Option A (preferred): Run the missing migration**
```sql
-- Add the missing column to whichever table the workspace context query hits
-- (likely named: workspaces, environments, env_metadata, or tenants)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);

-- If there is a related enum or lookup table, create it too:
-- CREATE TYPE industry_type_enum AS ENUM ('real_estate', 'infrastructure', 'private_equity', 'credit', 'other');
-- ALTER TABLE workspaces ALTER COLUMN industry_type TYPE industry_type_enum USING industry_type::industry_type_enum;
```

**Option B (fallback): Remove the column from the query**
Find the workspace context resolver (search for `SELECT env_id::text, client_name, industry`) and remove `industry_type` from the SELECT if the column is not yet supported in the schema.

**Verify fix:** Navigate to `/pds` in the StonePDS environment. The dashboard must load without errors.

---

## SECTION 2 — NAVIGATION & ERROR RECOVERY

### BUG-002: Nav sidebar freezes after a module crash

**Symptom:** When any module crashes with an unhandled error, clicking nav icons in the left sidebar no longer navigates. The user is stuck on the error screen and must manually type a URL to escape.

**Root cause:** The error boundary is likely swallowing the click events or the nav is conditionally rendered/disabled when the main content area is in an error state.

**Fix:**
1. Ensure the left nav component sits **outside** the error boundary that wraps the main content area.
2. The error boundary should catch errors in `<MainContent />` only, never in `<SideNav />` or `<TopNav />`.
3. If using React Router or Next.js routing, confirm that nav link `<Link>` or `<a>` tags are not inside the error-caught subtree.

**Example pattern:**
```jsx
// CORRECT: nav is outside the error boundary
<AppShell>
  <SideNav />           {/* always renders, always clickable */}
  <ErrorBoundary>
    <MainContent />     {/* crashes are caught here */}
  </ErrorBoundary>
</AppShell>

// WRONG: nav inside the error boundary
<ErrorBoundary>
  <SideNav />
  <MainContent />
</ErrorBoundary>
```

**Verify fix:** Force a module crash (e.g., visit `/pds` before BUG-001 is fixed, or simulate a throw). Confirm the left nav remains clickable and navigates to a different module without requiring a URL change.

---

## SECTION 3 — PE MODELING WORKFLOW (RE Module)

All of the following bugs are in the RE module of the `Meridian Capital Management` environment. Routes: `/re/models`, `/re/models/:modelId`.

### BUG-003: Assumption override save returns "Internal error"

**Symptom:** On any model's Assumptions tab, submitting a key/value override (e.g., `key: "revenue_growth"`, `value: "0.10"`) shows a pink "Internal error" banner with no detail.

**Investigation steps:**
1. Find the API route handler for saving assumption overrides (likely `POST /api/models/:id/assumptions` or similar).
2. Check server logs for the actual error — it is being swallowed by a generic catch block.
3. Common causes: type mismatch (value is a string, schema expects float), missing required field validation, FK constraint violation if `fund_id` is required but not provided correctly.

**Fix:**
1. **Server side:** Replace the generic `catch (e) { return { error: "Internal error" } }` with specific error mapping:
   ```typescript
   catch (e) {
     if (e.code === '23503') return res.status(400).json({ error: "Invalid fund reference" });
     if (e.code === '22P02') return res.status(400).json({ error: "Value must be a number (e.g. 0.10 for 10%)" });
     console.error('[assumptions] save error:', e);
     return res.status(500).json({ error: e.message || "Failed to save override" });
   }
   ```
2. **Client side:** Display the actual `error` field from the response body in the banner, not a hardcoded "Internal error" string.
3. **Validation:** Add client-side validation before submit — key must be non-empty, value must be parseable as a number.
4. **Unit label:** Add a `%` or `$` suffix/toggle to the value input field so users know what format is expected.

**Verify fix:** Save `key: "exit_cap_rate"`, `value: "0.065"` on the Assumptions tab of any model. It should save successfully and appear as a row in the overrides list.

---

### BUG-004 + BUG-005: Run Model fails silently or with generic error

**Symptom A:** On a model with 0 entities in scope, clicking "Run Model" returns a generic pink "Internal error" banner with no useful detail.

**Symptom B:** On some pre-seeded models, clicking "Run Model" fails silently — no toast, no error, no spinner, no state change.

**Fix — Pre-run validation guard (BUG-005 first):**
Before calling the run API, add a client-side guard:
```typescript
function handleRunModel() {
  if (model.entityCount === 0) {
    showToast({
      type: "error",
      title: "Cannot run model",
      message: "Add at least one asset or investment to scope before running. Use the Scope tab to add entities."
    });
    return; // do not call the API
  }
  // proceed with run...
}
```
Optionally, disable the "Run Model" button with a tooltip when `entityCount === 0`.

**Fix — Server-side error propagation (BUG-004):**
1. Find the run model API handler (likely `POST /api/models/:id/run` or a Supabase Edge Function).
2. Add a server-side guard at the top:
   ```typescript
   const entityCount = await db.modelEntities.count({ where: { modelId: id } });
   if (entityCount === 0) {
     return res.status(400).json({ error: "Model has no entities in scope. Add assets before running." });
   }
   ```
3. Replace all generic catches with specific error messages (same pattern as BUG-003 fix).
4. For the silent failure: check if the run API call is being made but the response handler has a bug — e.g., it resolves on a non-2xx status without triggering the error branch. Add explicit status code checking:
   ```typescript
   const res = await fetch(`/api/models/${modelId}/run`, { method: "POST" });
   if (!res.ok) {
     const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
     showToast({ type: "error", title: "Run failed", message: error });
     return;
   }
   ```

**Verify fix:**
- Model with 0 entities: clicking "Run Model" shows a clear blocking toast (no API call made).
- Model with entities: run proceeds and either shows results or a meaningful error.

---

### UX-001: Scope tab — build in-UI entity picker

**Current state:** The Scope tab shows "No entities in scope. Use the API to add entities." There is no UI to add assets, investments, or JVs to a model.

**Required behavior:** The Scope tab must allow users to:
1. Browse assets/investments from the funds the model is associated with
2. Select/deselect entities to include in scope
3. See a running count of selected entities
4. Save the scope

**Implementation approach:**
```tsx
// ScopeTab.tsx — replace the empty state with an entity picker

const ScopeTab = ({ modelId, envId }) => {
  const { data: availableEntities } = useQuery(['entities', envId], () =>
    fetchEntities(envId) // fetch all assets + investments for this environment
  );
  const { data: scopedEntities, refetch } = useQuery(['model-scope', modelId], () =>
    fetchModelScope(modelId)
  );

  const toggleEntity = async (entityId: string, entityType: 'asset' | 'investment' | 'jv') => {
    const isScoped = scopedEntities.some(e => e.id === entityId);
    if (isScoped) {
      await api.delete(`/models/${modelId}/scope/${entityId}`);
    } else {
      await api.post(`/models/${modelId}/scope`, { entityId, entityType });
    }
    refetch();
  };

  return (
    <div>
      <h3>Entity Scope</h3>
      <p>{scopedEntities.length} entities in scope</p>

      {/* Fund filter */}
      <FundFilter />

      {/* Entity list with checkboxes */}
      {availableEntities.map(entity => (
        <EntityRow
          key={entity.id}
          entity={entity}
          isSelected={scopedEntities.some(e => e.id === entity.id)}
          onToggle={() => toggleEntity(entity.id, entity.type)}
        />
      ))}
    </div>
  );
};
```

**API endpoints needed** (if not already present):
- `GET /api/env/:envId/entities` — returns all assets, investments, JVs for the environment
- `GET /api/models/:id/scope` — returns entities currently in scope
- `POST /api/models/:id/scope` — add entity to scope (`{ entityId, entityType }`)
- `DELETE /api/models/:id/scope/:entityId` — remove entity from scope

**Verify fix:** Open any model's Scope tab. See a list of the 33 seeded assets. Select 5. Count shows "5 entities in scope." Open Overview tab — "IN SCOPE" counter shows 5.

---

### UX-003: Assumption overrides — add asset-level granularity

**Current state:** Assumption override form has Key / Value / Fund-scope dropdown / Reason. Fund-level only.

**Required addition:** Add an optional "Entity" selector that appears when the user wants to override at the asset level rather than fund level:

```tsx
<OverrideForm>
  <Input label="Key" placeholder="exit_cap_rate" />
  <Input label="Value" placeholder="0.065" suffix="%" />
  <Select label="Scope">
    <option value="fund">Fund-level</option>
    <option value="asset">Asset-level</option>
  </Select>

  {/* Show only when scope = "asset" */}
  {scope === "asset" && (
    <Select label="Asset">
      {scopedEntities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </Select>
  )}

  <Input label="Reason" optional />
  <Button>Add Override</Button>
</OverrideForm>
```

Update the database schema if needed:
```sql
ALTER TABLE model_assumption_overrides
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES assets(id),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) CHECK (entity_type IN ('asset', 'investment', 'jv'));
-- entity_id NULL means fund-level; entity_id NOT NULL means asset-level
```

---

### FEAT-001: Clone model feature

**Current state:** No clone functionality exists anywhere — no button on list rows, no action in model detail.

**Required behavior:**
1. On the model list, each row should have a "..." (kebab) menu with: **Clone**, **Archive**
2. Clone creates a new draft model with:
   - Name: `"{original name} (Copy)"`
   - Same strategy, description
   - Same entities in scope (deep copy of scope relationships)
   - Same assumption overrides (deep copy)
   - Status: `draft`
   - No run results
3. After clone, navigate to the new model's detail page

**Implementation:**

```tsx
// Model list row — add kebab menu
<TableRow key={model.id}>
  <td>{model.name}</td>
  <td>{model.strategy}</td>
  <td><StatusBadge status={model.status} /></td>
  <td>{model.createdAt}</td>
  <td>
    <DropdownMenu>
      <DropdownItem onClick={() => handleClone(model.id)}>Clone</DropdownItem>
      <DropdownItem onClick={() => handleArchive(model.id)}>Archive</DropdownItem>
    </DropdownMenu>
  </td>
</TableRow>
```

```typescript
// API route: POST /api/models/:id/clone
export async function cloneModel(sourceId: string) {
  const source = await db.model.findUnique({
    where: { id: sourceId },
    include: { scopeEntities: true, assumptionOverrides: true }
  });

  const clone = await db.model.create({
    data: {
      name: `${source.name} (Copy)`,
      description: source.description,
      strategy: source.strategy,
      envId: source.envId,
      status: 'draft',
      scopeEntities: {
        create: source.scopeEntities.map(e => ({ entityId: e.entityId, entityType: e.entityType }))
      },
      assumptionOverrides: {
        create: source.assumptionOverrides.map(a => ({
          key: a.key, value: a.value, fundId: a.fundId, entityId: a.entityId, reason: a.reason
        }))
      }
    }
  });

  return clone;
}
```

**Verify fix:** On the models list, hover a model row, click "...", select Clone. New model appears in list with "(Copy)" suffix. Opening it shows identical scope and assumptions.

---

### UX-002: Duplicate model name validation

**Current state:** Submitting a model name that already exists in the environment creates a duplicate with no warning.

**Fix:**
```typescript
// Client-side: check before submit
const handleCreateModel = async () => {
  const duplicate = models.find(
    m => m.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  if (duplicate) {
    setNameError(`A model named "${name}" already exists. Choose a different name.`);
    return;
  }
  // proceed...
};

// Server-side: add unique constraint
ALTER TABLE models ADD CONSTRAINT models_env_name_unique UNIQUE (env_id, name);
// Then catch the unique violation (code '23505') and return 409 with a clear message
```

---

## SECTION 4 — END-TO-END DATA SEEDING

The platform's seeded environments must demonstrate the **full workflow end-to-end** so that any user opening a model sees a working, realistic example — not empty shells.

### Seed Script Requirements

Create or update the environment seeding script for `Meridian Capital Management` (env_id: `a1b2c3d4-0001-0001-0003-000000000001`) to include:

#### 4.1 — Entity-Model Relationships (Scope)

Both pre-seeded models must have entities in scope:

```sql
-- For "Morgan QA Downside" (model_id: 0903b5a8-a420-433c-af5b-2aaecb9d05fc)
-- Add a representative cross-fund selection of assets

-- Assuming assets table has seeded rows; get their IDs and insert scope records:
INSERT INTO model_scope_entities (model_id, entity_id, entity_type, created_at)
SELECT
  '0903b5a8-a420-433c-af5b-2aaecb9d05fc',
  id,
  'asset',
  NOW()
FROM assets
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
LIMIT 8;  -- a realistic cross-fund selection

-- For "Base Case Stress Test" (find its model_id from the models table)
INSERT INTO model_scope_entities (model_id, entity_id, entity_type, created_at)
SELECT
  (SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'),
  id,
  'asset',
  NOW()
FROM assets
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
LIMIT 12;
```

#### 4.2 — Seeded Assumption Overrides

Both models must have pre-populated, realistic assumption overrides:

```sql
-- For "Morgan QA Downside" — downside scenario assumptions
INSERT INTO model_assumption_overrides (model_id, key, value, fund_id, entity_id, reason, created_at) VALUES
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'exit_cap_rate',      '0.065', 'a1b2c3d4-0001-0010-0001-000000000001', NULL, 'Downside: 50bps cap rate expansion vs base', NOW()),
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'revenue_growth',     '-0.02', 'a1b2c3d4-0001-0010-0001-000000000001', NULL, 'Downside: 2% NOI decline stress scenario', NOW()),
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'vacancy_rate',       '0.12',  'a1b2c3d4-0002-0020-0001-000000000001', NULL, 'Downside: elevated vacancy assumption', NOW()),
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'hold_period_years',  '7',     NULL,                                    NULL, 'Extended hold under downside scenario', NOW()),
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'discount_rate',      '0.095', NULL,                                    NULL, 'Risk-adjusted discount rate for downside', NOW());

-- For "Base Case Stress Test" — base case assumptions
INSERT INTO model_assumption_overrides (model_id, key, value, fund_id, entity_id, reason, created_at) VALUES
  ((SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'), 'exit_cap_rate',     '0.055', NULL, NULL, 'Base case market exit assumption', NOW()),
  ((SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'), 'revenue_growth',    '0.03',  NULL, NULL, 'Base case: 3% NOI growth', NOW()),
  ((SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'), 'hold_period_years', '5',     NULL, NULL, 'Standard 5-year hold period', NOW()),
  ((SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'), 'discount_rate',     '0.08',  NULL, NULL, 'Blended cost of capital base case', NOW());
```

#### 4.3 — Seeded Model Run Results (Fund Impact)

After populating scope and assumptions, execute a seeded run for both models so the Fund Impact tab shows real output data:

```sql
-- Insert a model run record
INSERT INTO model_runs (id, model_id, status, started_at, completed_at, triggered_by) VALUES
  (gen_random_uuid(), '0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'completed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '59 minutes', 'seed'),
  (gen_random_uuid(), (SELECT id FROM models WHERE name = 'Base Case Stress Test' AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'), 'completed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '119 minutes', 'seed');

-- Insert fund impact results for each run (adjust column names to match your schema)
-- Example: base TVPI vs model TVPI, base IRR vs model IRR, per fund
INSERT INTO model_run_results (run_id, fund_id, metric, base_value, model_value) VALUES
  ((SELECT id FROM model_runs WHERE model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc' AND triggered_by = 'seed'), 'a1b2c3d4-0001-0010-0001-000000000001', 'tvpi',     1.21, 1.05),
  ((SELECT id FROM model_runs WHERE model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc' AND triggered_by = 'seed'), 'a1b2c3d4-0001-0010-0001-000000000001', 'irr',      0.12, 0.07),
  ((SELECT id FROM model_runs WHERE model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc' AND triggered_by = 'seed'), 'a1b2c3d4-0002-0020-0001-000000000001', 'tvpi',     1.21, 1.08),
  ((SELECT id FROM model_runs WHERE model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc' AND triggered_by = 'seed'), 'a1b2c3d4-0002-0020-0001-000000000001', 'irr',      0.12, 0.09);
```

**Note:** Adjust column names to match your actual schema. The goal is that after seeding, opening "Morgan QA Downside" → Fund Impact tab shows a side-by-side Base vs Model comparison chart.

#### 4.4 — StonePDS: Populate Financial Overview Metrics

After BUG-001 is fixed, the StonePDS financial overview shows all dashes (`—`). Seed realistic construction program metrics:

```sql
-- Insert financial overview metrics for StonePDS env
INSERT INTO env_financial_metrics (env_id, metric_key, metric_value, metric_label, updated_at) VALUES
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'total_program_budget',    850000000, 'Total Program Budget',    NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'committed_spend',         612000000, 'Committed Spend',         NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'actual_to_date',          487000000, 'Actual to Date',          NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'forecasted_at_completion', 863000000, 'Forecasted at Completion', NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'schedule_variance_days',  -14,       'Schedule Variance (Days)', NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'cost_variance_pct',       0.015,     'Cost Variance %',         NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'active_projects',         23,        'Active Projects',         NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'flagged_milestones',      5,         'Flagged Milestones',      NOW());
```

---

## SECTION 5 — ADDITIONAL UX POLISH

### UX-005: Fix Models page subtitle

**File:** `app/.../re/models/page.tsx` (or equivalent)

Change:
```
"Create and manage analytical models for fund-level scenario analysis"
```
To:
```
"Create and manage cross-fund scenario models for PE and real estate analysis"
```

### UX-004: Add unit labels to assumption value inputs

In the assumption override form, add a unit hint to the value field:

```tsx
<div className="relative">
  <Input
    placeholder="e.g. 0.065"
    value={value}
    onChange={e => setValue(e.target.value)}
  />
  <span className="absolute right-3 text-gray-400 text-sm">
    decimal (0.065 = 6.5%)
  </span>
</div>
```

---

## SECTION 6 — END-TO-END VERIFICATION CHECKLIST

After completing all fixes and seeding, verify the following user journey works without errors:

### Journey A — PDS Mission Control (StonePDS)
- [ ] `/pds` loads without any error — dashboard shows financial overview metrics (not dashes)
- [ ] Left nav is clickable at all times, including after visiting any module
- [ ] `/legal` loads without the schema error
- [ ] Navigating between modules does not freeze nav state

### Journey B — Full Cross-Fund Modeling (Meridian Capital Management)
- [ ] `/re/models` loads with the 3 existing models listed
- [ ] Opening "Morgan QA Downside" shows: **8 entities in scope**, **5 overrides**, **1 completed run**
- [ ] Scope tab shows entities with checkboxes; user can add/remove; count updates on Overview
- [ ] Assumptions tab shows the 5 pre-seeded overrides; adding a new one (`hold_period_years = 6`) succeeds without error
- [ ] Fund Impact tab shows the Base vs Model comparison chart for the completed run
- [ ] Monte Carlo tab: clicking "Run Monte Carlo" with valid inputs either runs or shows a meaningful in-progress state
- [ ] Click "..." on a model row → Clone option appears → clicking Clone creates a `(Copy)` model → navigates to new model detail
- [ ] Try to create a model named "Morgan QA Downside" → validation message fires, model is NOT created
- [ ] Try "Run Model" on a model with 0 entities → blocked with a clear message (no API call)

---

## IMPORTANT NOTES FOR THE AI ASSISTANT

1. **Adjust table/column names** to match the actual schema — the column names used in this prompt are inferred from error messages and observed behavior. Use `grep`, `find`, or schema inspection to verify exact names before running migrations.

2. **Do not break existing seed data** — the Meridian Capital Management RE fund data ($2.0B, 33 assets, 3 funds) is already present and should not be overwritten. Scope and run result seeds are additive.

3. **Run each section's verify step** before moving to the next section. Later fixes depend on earlier ones being stable.

4. **If the run model feature requires a background job or queue**, the seeded run results (Section 4.3) bypass the queue by inserting directly into the results table. Ensure the results reader does not require a specific job completion flag that would hide these records.

5. **Duplicate model cleanup** — there are currently two models named "Morgan QA Downside" in the Meridian Capital Management environment as a result of QA testing. Clean up the duplicate (the one without the original UUID `0903b5a8-a420-433c-af5b-2aaecb9d05fc`) after adding the unique constraint.

---

*Generated from Morgan Ruiz QA Audit Report — Winston Platform — March 4, 2026*
*Full audit findings: Winston_QA_Audit_Morgan_Ruiz_2026-03-04.docx*
