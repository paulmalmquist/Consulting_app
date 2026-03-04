# Winston Platform — AI Engineering Meta Prompt (v5 — Exhaustive)

**Purpose:** Give this entire file to your AI coding assistant as a single context block before asking it to fix anything. It is ordered by priority. Do not skip sections, do not reorder. Every fix listed here has been confirmed broken across 5 sequential QA rounds. Fixes that were "claimed" in prior rounds but not verified by HTTP status code are treated as unresolved.

**QA history:** v1 (baseline) → v2 (AI-claimed all fixed, unverified) → v3 (confirmed v2 was a lie: nothing shipped) → v4 (genuine redeploy: partial error-surfacing improvement only) → v5 (extended test: still 12/18 items broken, 2 new 503s discovered).

---

## PLATFORM CONTEXT

**Stack:**
- **Frontend:** Next.js (React, TypeScript) — routes under `/lab/env/[envId]/...`
- **Backend:** Python (FastAPI or similar) — API routes at `/api/...`
- **Database:** PostgreSQL
- **Architecture:** Multi-tenant — each tenant identified by `env_id` UUID
- **Auth:** Session-based; `env_id` flows through every request

**Tenants under test:**
| Tenant | env_id | Surface |
|--------|--------|---------|
| StonePDS | `a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2` | PDS construction program controls |
| Meridian Capital Management | `a1b2c3d4-0001-0001-0003-000000000001` | RE/PE cross-fund scenario modeling |

**Known seeded data (DO NOT delete or overwrite):**
- Meridian: 3 funds (Institutional Growth Fund VII + 2 others), 33 assets/properties across Texas and other states, fund_id `a1b2c3d4-0001-0010-0001-000000000001` (Fund VII) and `a1b2c3d4-0002-0020-0001-000000000001` (second fund)
- Meridian models: "Morgan QA Downside" (model_id `0903b5a8-a420-433c-af5b-2aaecb9d05fc`), "Morgan Ruiz Cross-Fund Test", "Base Case Stress Test", "MR v2 Cross-Fund Scenario", plus QA-generated models
- StonePDS: environment provisioned, construction program data structure present but financial metrics empty

---

## ABSOLUTE RULES — READ BEFORE TOUCHING ANYTHING

These rules exist because the same classes of failure have recurred across 5 QA rounds.

**RULE 1 — A "fix" is not fixed until an HTTP 200 is observed in a browser network tab.**
No fix may be marked done unless the fixer has personally observed the specific API endpoint return 2xx in a live environment. Code changes and migration files written ≠ deployed. File present ≠ migration run.

**RULE 2 — Every `catch` block must re-surface the original error.**
Replace every instance of this pattern across the entire codebase:
```python
except Exception as e:
    return {"error": "Internal error"}   # ← THIS PATTERN IS BANNED
```
With:
```python
except Exception as e:
    logger.error(f"[route_name] unhandled: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(e))
```
This one change will surface every hidden DB error and save you 3+ rounds of QA.

**RULE 3 — DB migrations must be run, not just written.**
Writing `migrations/0012_add_industry_type.sql` is not a fix. Running it against the production DB is the fix. After every migration, verify with:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = '<table>' AND column_name = '<col>';
-- Must return exactly 1 row. Zero rows = migration did not run.
```

**RULE 4 — Seed data must be verified by read-back, not by assumption.**
After any INSERT seed script, immediately run:
```sql
SELECT COUNT(*) FROM <table> WHERE env_id = '<env_id>';
-- Must be > 0. Zero = seed did not execute.
```

**RULE 5 — Every disabled button must be visually and accessibly disabled.**
Any button with `disabled=True` in the DOM must have:
- Visual: reduced opacity (`opacity-50`), `cursor-not-allowed`
- Accessible: `aria-disabled="true"` attribute
- Informative: a tooltip or helper text explaining WHY it is disabled and what the user must do to enable it

**RULE 6 — Error state must never persist across tab or route navigation.**
An error raised in component A must be cleared when the user navigates to component B. Page-level error state that bleeds across tabs is a bug, not a feature.

**RULE 7 — One user action = at most one API call = at most one error handler invocation.**
If a checkbox click causes N API calls or N error messages where N = entity count, that is a loop bug. Find it and fix it before claiming the feature works.

**RULE 8 — 503 means the route does not exist or the service is down.**
A 503 on `/lab/upload` or `/re/assets` means those route handlers are not registered or the backing service is not running. Fixing a 500 elsewhere does not fix a 503 elsewhere.

**RULE 9 — Duplicate names are a data integrity issue, not a UX nicety.**
Unique name constraints belong in the database schema, not just in client-side validation. A `UNIQUE` constraint is the only guarantee. Client-side checks are a UX convenience on top of the DB constraint.

**RULE 10 — Every button that submits must handle the response explicitly.**
A button click that calls an API must: show a loading state during the call, show a success state on 2xx, show an error state on non-2xx. "Fires and forgets with no feedback" is a bug.

---

## PRE-FLIGHT INSPECTION — Run These First Before Writing Any Code

Before touching any code, run these queries against the production database. The output tells you exactly which bugs exist and which schema objects need to be created.

```sql
-- INSPECTION 1: Find the actual table name for workspace/environment context
-- (BUG-001 depends on knowing the right table)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('workspaces', 'environments', 'env_metadata', 'tenants', 'business_environments', 'env_config')
ORDER BY table_name;

-- INSPECTION 2: Check if industry_type column exists
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'industry_type';
-- Expected: 1 row. If 0 rows → BUG-001 migration has not run.

-- INSPECTION 3: Find the actual model overrides table name
-- (BUG-003 error says "re_model_override does not exist" — find what it's actually called)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name ILIKE '%override%' OR table_name ILIKE '%assumption%';
-- Whatever this returns is the REAL table name. Use it below everywhere.

-- INSPECTION 4: Find the actual model scope table name
-- (BUG-006/007 error says 500 — the scope table may not exist or have wrong name)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name ILIKE '%scope%' OR table_name ILIKE '%model_entit%';

-- INSPECTION 5: Find the actual clone-relevant column in the models table
-- (BUG-008 error says "column 'id' does not exist" — find the real PK column name)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 're_model'   -- try re_model, models, re_models, fund_models
ORDER BY ordinal_position;

-- INSPECTION 6: Check which tables exist in the RE module
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name ILIKE 're_%'
ORDER BY table_name;

-- INSPECTION 7: Check if assets have names seeded (UX-001 root cause)
SELECT COUNT(*), COUNT(name) as named_count FROM assets
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001';
-- If COUNT = COUNT(name): names are present but not returned by API
-- If COUNT > named_count: seed data is missing name field
-- If COUNT = 0: assets table not seeded at all

-- INSPECTION 8: Count existing scope entries and override entries per model
SELECT m.name, m.id,
  (SELECT COUNT(*) FROM model_scope_entities s WHERE s.model_id = m.id) AS scope_count,
  (SELECT COUNT(*) FROM model_assumption_overrides o WHERE o.model_id = m.id) AS override_count
FROM re_model m  -- adjust table name from INSPECTION 5
WHERE m.env_id = 'a1b2c3d4-0001-0001-0003-000000000001';

-- INSPECTION 9: Find duplicate model names (UX-002)
SELECT name, COUNT(*) as cnt
FROM re_model  -- adjust table name
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
GROUP BY name HAVING COUNT(*) > 1;

-- INSPECTION 10: Verify /lab/upload and /re/assets route registration
-- (This is a code check, not SQL — see code search below)
```

**Code pre-flight (run in terminal):**
```bash
# Find all route/endpoint registrations
grep -r "lab/upload\|re/assets\|upload" --include="*.py" -l
grep -r "router\|@app\|@router" --include="*.py" | grep -i "upload\|assets"

# Find all generic error suppressors (RULE 2 violations)
grep -rn '"Internal error"\|"internal error"\|{"error": "Internal' --include="*.py"
grep -rn '"Internal error"\|"internal error"' --include="*.ts" --include="*.tsx"

# Find the scope route handlers
grep -rn "scope" --include="*.py" -l
grep -rn "/scope" --include="*.py"

# Find the clone route handler
grep -rn "clone" --include="*.py" -l

# Find override/assumption route handler
grep -rn "override\|assumption" --include="*.py" -l

# Find the workspace/environment context query
grep -rn "industry_type" --include="*.py" --include="*.sql" --include="*.ts"
```

Record the results of every inspection before proceeding.

---

## SECTION 1 — P0: FIX THE PDS CRASH (BUG-001)

**Confirmed broken across ALL 5 QA rounds.** Request IDs changed between rounds (proving new code deployed) but the error is identical every time. The migration has never been run.

### What the error means exactly

```
ERROR: column "industry_type" does not exist
LINE 2: ...SELECT env_id::text, client_name, industry, industry_type...
```

A Python query or ORM model is selecting `industry_type` from a table where this column does not exist in production. The column was added to the query/model definition but the corresponding `ALTER TABLE` was never executed against the live database.

### Step 1: Find the exact table and query

```bash
# Find the query that selects industry_type
grep -rn "industry_type" --include="*.py" --include="*.sql"
# Look for the table name in the SELECT statement — it is one of:
# workspaces, environments, env_metadata, tenants, businesses, env_config
```

### Step 2: Run the migration

**Run exactly one of these — use whichever table name you found above:**

```sql
-- Most likely candidates (run the one that matches your table):
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);
ALTER TABLE environments ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);
ALTER TABLE env_metadata ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_type VARCHAR(100);

-- If industry_type should be an enum, add it explicitly:
-- DO $$ BEGIN
--   CREATE TYPE industry_type_enum AS ENUM (
--     'real_estate', 'infrastructure', 'private_equity', 'credit', 'hedge_fund', 'other'
--   );
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS industry_type industry_type_enum;

-- Populate existing rows (do not leave NULL in rows that will be queried without null guard):
UPDATE workspaces SET industry_type = 'real_estate'
WHERE industry_type IS NULL
AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001';  -- Meridian

UPDATE workspaces SET industry_type = 'infrastructure'
WHERE industry_type IS NULL
AND env_id = 'a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2';  -- StonePDS
```

### Step 3: Verify

```sql
-- Must return 1 row
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = '<your_table>' AND column_name = 'industry_type';

-- Must return a row for StonePDS env
SELECT industry_type FROM <your_table>
WHERE env_id = 'a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2';
```

Then: navigate to `/pds` in the StonePDS environment. The page must load without any error. HTTP 200, no pink error banner.

### BUG-001 cascade: BUG-002 (Nav absent)

BUG-002 is a **direct consequence** of BUG-001 crashing the entire page including the layout component. Once BUG-001 is fixed, BUG-002 will also resolve — because the crash no longer happens.

However, independently ensure the error boundary architecture is correct:

```tsx
// app/layout.tsx or the shell component — CORRECT pattern:
<AppShell>
  <SideNav />           {/* OUTSIDE error boundary — always renders */}
  <TopBar />            {/* OUTSIDE error boundary — always renders */}
  <ErrorBoundary fallback={<ModuleErrorFallback />}>
    <main>{children}</main>   {/* INSIDE — crash here does not affect nav */}
  </ErrorBoundary>
</AppShell>

// WRONG — do not put nav inside the error boundary:
<ErrorBoundary>
  <SideNav />     {/* ← this will disappear on any crash */}
  <main>{children}</main>
</ErrorBoundary>
```

---

## SECTION 2 — P0: FIX ALL RE API DATABASE BUGS

These four bugs (003, 006, 007, 008) all have the same root cause: Python queries reference table/column names that do not exist in the production PostgreSQL schema. The fix in every case is: find the real name, use it in the query (or run the migration to create it).

### MANDATORY FIRST STEP: Map all RE table names

Before fixing any RE bug, build a complete map of what actually exists:

```sql
-- Get all RE-related tables and their columns
SELECT t.table_name, c.column_name, c.data_type, c.column_default, c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON c.table_name = t.table_name
WHERE t.table_schema = 'public'
AND (t.table_name ILIKE 're_%' OR t.table_name ILIKE '%model%' OR t.table_name ILIKE '%override%' OR t.table_name ILIKE '%scope%')
ORDER BY t.table_name, c.ordinal_position;
```

Save this output. Every fix below uses column names that must match this map exactly.

---

### BUG-003: GET + POST /api/re/v2/models/{id}/overrides → 500

**Confirmed broken v1–v5. v5 regression: GET /overrides NOW also returns 500 on page load (was POST-only in v4). Error text confirmed: `relation "re_model_override" does not exist`.**

This is unambiguous: the Python query says `FROM re_model_override` (or uses an ORM model called `ReModelOverride`) but the actual table has a different name in production.

#### Step 1: Find the actual override table name

```bash
grep -rn "re_model_override\|model_override\|assumption_override\|model_assumption" --include="*.py" -l
# Then inspect the file for the exact SQLAlchemy model class or raw SQL table reference
```

The actual table is likely one of:
- `re_model_overrides` (plural)
- `model_assumption_overrides`
- `re_assumption_overrides`
- `fund_model_overrides`

#### Step 2a: If the table exists under a different name — fix the query

```python
# Find the route handler — likely in a file named routes/overrides.py, api/re/overrides.py, etc.
# Change every reference from the wrong name to the real name:

# WRONG:
result = db.execute("SELECT * FROM re_model_override WHERE model_id = :id", {"id": model_id})

# RIGHT (use whatever INSPECTION 3 returned):
result = db.execute("SELECT * FROM model_assumption_overrides WHERE model_id = :id", {"id": model_id})
```

#### Step 2b: If the table does not exist — create it

```sql
CREATE TABLE IF NOT EXISTS re_model_override (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES re_model(id) ON DELETE CASCADE,
  fund_id       UUID REFERENCES re_fund(id),
  entity_id     UUID,
  entity_type   VARCHAR(20) CHECK (entity_type IN ('asset', 'investment', 'jv')),
  key           VARCHAR(100) NOT NULL,
  value         TEXT NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_model_override_model_id ON re_model_override(model_id);
CREATE INDEX IF NOT EXISTS idx_re_model_override_fund_id ON re_model_override(fund_id);
```

#### Step 3: Fix the error surfacing in the Python handler

```python
# Find the GET and POST override handlers
# Replace ALL catch-all error suppression:

# WRONG — banned pattern:
except Exception as e:
    return JSONResponse({"error": "Internal error"}, status_code=500)

# RIGHT:
except Exception as e:
    import traceback
    logger.error(f"[overrides][{request.method}] model_id={model_id} error: {e}\n{traceback.format_exc()}")
    raise HTTPException(status_code=500, detail=str(e))
```

#### Step 4: Fix the error banner bleeding across tabs (NEW-004 — v5 finding)

The error state from a failed /overrides call is stored at page level and persists when the user navigates between Overview, Scope, Fund Impact, and Monte Carlo tabs. Fix this in the React component:

```tsx
// In the model detail page component:
const [tabError, setTabError] = useState<string | null>(null);

// Clear error on tab change:
const handleTabChange = (newTab: string) => {
  setTabError(null);   // ← clear error when switching tabs
  setActiveTab(newTab);
};

// Only show error within the Assumptions tab, not at page level:
// WRONG:
<div className="model-page">
  {pageError && <ErrorBanner message={pageError} />}  {/* ← bleeds to all tabs */}
  <TabContent activeTab={activeTab} />
</div>

// RIGHT:
<div className="model-page">
  <TabContent activeTab={activeTab} tabError={tabError} />
</div>
// Where tabError is passed only to and rendered within the relevant tab component.
```

#### Step 5: Verify

```bash
curl -X GET "https://www.paulmalmquist.com/api/re/v2/models/0903b5a8-a420-433c-af5b-2aaecb9d05fc/overrides" \
  -H "Cookie: <session>" | python3 -m json.tool
# Must return 200 with JSON array (may be empty), NOT 500
```

Then in browser: open any model, navigate across all tabs. No error banner should appear unless the user explicitly submits a form that fails.

---

### BUG-006 + BUG-007: GET + POST /api/re/v2/models/{id}/scope → 500 + LOOP BUG

**Confirmed broken v1–v5. v5 new finding: each checkbox click fires the error handler once per entity in the entity list (N errors per click). ~3 clicks generated 146+ console errors.**

#### Step 1: Find the scope route handler

```bash
grep -rn "models.*scope\|scope.*model" --include="*.py" -l
grep -rn "/scope" --include="*.py"
```

#### Step 2: Find the real scope table name

```sql
-- From INSPECTION 4 above — use whatever table exists
-- Likely: model_scope_entities, re_model_scope, re_scope_entities, model_entities
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name ILIKE '%scope%' OR table_name ILIKE '%model_entit%');
```

#### Step 3a: If the table exists under a different name — fix the query in Python

```python
# WRONG (causes BUG-006/007):
db.execute("SELECT * FROM re_model_scope WHERE model_id = :id", {"id": model_id})

# RIGHT (use actual table name from inspection):
db.execute("SELECT e.*, a.name, a.state, a.type FROM model_scope_entities e
            JOIN assets a ON a.id = e.entity_id
            WHERE e.model_id = :id", {"id": model_id})
```

#### Step 3b: If the table does not exist — create it

```sql
CREATE TABLE IF NOT EXISTS model_scope_entities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID NOT NULL REFERENCES re_model(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL,
  entity_type  VARCHAR(20) NOT NULL CHECK (entity_type IN ('asset', 'investment', 'jv', 'fund')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_model_id ON model_scope_entities(model_id);
CREATE INDEX IF NOT EXISTS idx_scope_entity_id ON model_scope_entities(entity_id);
```

#### Step 4: Fix entity names in scope GET response (UX-001)

The GET /scope endpoint must return entity names, not just IDs. Without names, the scope picker shows blank labels:

```python
# Python GET handler for /scope:
@router.get("/models/{model_id}/scope")
async def get_model_scope(model_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            """
            SELECT
                s.entity_id,
                s.entity_type,
                a.name,
                a.state,
                a.property_type,
                a.city
            FROM model_scope_entities s
            LEFT JOIN assets a ON a.id = s.entity_id  -- LEFT JOIN so scope shows even if asset data missing
            WHERE s.model_id = :model_id
            ORDER BY a.name
            """,
            {"model_id": str(model_id)}
        )
        rows = result.mappings().all()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"[scope][GET] model_id={model_id} error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

#### Step 5: Fix the scope POST handler (toggle entity in/out of scope)

```python
@router.post("/models/{model_id}/scope")
async def toggle_model_scope(model_id: UUID, body: ScopeToggleRequest, db: AsyncSession = Depends(get_db)):
    try:
        # Check if entity is already in scope
        existing = await db.execute(
            "SELECT id FROM model_scope_entities WHERE model_id = :m AND entity_id = :e",
            {"m": str(model_id), "e": str(body.entity_id)}
        )
        row = existing.first()

        if row:
            # Remove from scope
            await db.execute(
                "DELETE FROM model_scope_entities WHERE model_id = :m AND entity_id = :e",
                {"m": str(model_id), "e": str(body.entity_id)}
            )
            action = "removed"
        else:
            # Add to scope
            await db.execute(
                """INSERT INTO model_scope_entities (model_id, entity_id, entity_type)
                   VALUES (:m, :e, :t)
                   ON CONFLICT (model_id, entity_id) DO NOTHING""",
                {"m": str(model_id), "e": str(body.entity_id), "t": body.entity_type}
            )
            action = "added"

        await db.commit()

        # Return updated scope count
        count_result = await db.execute(
            "SELECT COUNT(*) FROM model_scope_entities WHERE model_id = :m",
            {"m": str(model_id)}
        )
        scope_count = count_result.scalar()
        return {"action": action, "entity_id": str(body.entity_id), "scope_count": scope_count}

    except Exception as e:
        await db.rollback()
        logger.error(f"[scope][POST] model_id={model_id} entity_id={body.entity_id} error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

#### Step 6: Fix the frontend loop bug (BUG-007 client-side)

The scope checkbox click fires the error handler once per entity in the list, not once per click. This is a React bug — likely caused by calling `toggleEntity` inside a `forEach` or `map` in the event handler, or using a subscription that fires for every entity when any entity changes.

```tsx
// WRONG — triggers N callbacks on one click:
const handleToggle = async (entityId: string) => {
  entities.forEach(e => {   // ← iterates ALL entities on every single toggle
    await toggleScope(modelId, e.id);
  });
};

// ALSO WRONG — useEffect dependency causing re-fires:
useEffect(() => {
  entities.forEach(e => handleError(e));  // ← runs on every entity for any state change
}, [entities, error]);

// RIGHT — toggle only the target entity:
const handleToggle = async (entityId: string, entityType: string) => {
  try {
    setLoadingEntity(entityId);   // show spinner on just this row
    await api.post(`/models/${modelId}/scope`, { entityId, entityType });
    await refetchScope();         // refresh scope count from server
  } catch (e) {
    showToast({ type: "error", message: `Failed to update scope: ${e.message}` });
    // ← ONE error message per ONE click, not one per entity
  } finally {
    setLoadingEntity(null);
  }
};
```

#### Step 7: Verify scope fixes

```bash
# GET scope must return 200 with array including entity names:
curl -X GET ".../api/re/v2/models/0903b5a8.../scope" | python3 -m json.tool
# Expect: [{"entity_id": "...", "name": "Austin Office Tower", "state": "TX", ...}, ...]

# POST scope toggle must return 200:
curl -X POST ".../api/re/v2/models/0903b5a8.../scope" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "<any_asset_id>", "entity_type": "asset"}' | python3 -m json.tool
# Expect: {"action": "added", "scope_count": 1}
```

Browser test: Navigate to Scope tab. Click one checkbox. Exactly one API call fires. No console errors. Scope count increments by 1 on the Overview tab.

---

### BUG-008: POST /api/re/v2/models/{id}/clone → 500

**Confirmed broken v1–v5. Specific error: `column "id" does not exist`. The clone query references a column named `id` but the actual primary key column in the models table has a different name.**

#### Step 1: Find the real column name

```bash
grep -rn "clone" --include="*.py" -l
# Find the clone handler, then look at the INSERT/SELECT statement
```

```sql
-- From INSPECTION 5: find the actual PK column name of the models table
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 're_model'   -- use actual table name from INSPECTION 6
AND (column_name = 'id' OR column_name ILIKE '%model_id%' OR column_name ILIKE '%uuid%')
ORDER BY ordinal_position;
```

The real column is likely `model_id`, `re_model_id`, `uuid`, or `pk`. Use whatever the inspection returns.

#### Step 2: Fix the clone Python handler

```python
@router.post("/models/{model_id}/clone")
async def clone_model(model_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        # STEP A: Fetch source model using the REAL primary key column name
        source_result = await db.execute(
            "SELECT * FROM re_model WHERE id = :id",  # ← replace 'id' with actual PK from inspection
            {"id": str(model_id)}
        )
        source = source_result.mappings().first()
        if not source:
            raise HTTPException(status_code=404, detail="Source model not found")

        # STEP B: Create the clone record
        new_model_id = str(uuid4())
        await db.execute(
            """
            INSERT INTO re_model (id, env_id, fund_id, name, description, strategy, status, created_at)
            VALUES (:new_id, :env_id, :fund_id, :name, :desc, :strategy, 'draft', NOW())
            """,
            {
                "new_id": new_model_id,
                "env_id": source["env_id"],
                "fund_id": source["fund_id"],
                "name": f"{source['name']} (Copy)",
                "desc": source.get("description"),
                "strategy": source.get("strategy", "equity"),
            }
        )

        # STEP C: Clone scope entities
        await db.execute(
            """
            INSERT INTO model_scope_entities (model_id, entity_id, entity_type, created_at)
            SELECT :new_id, entity_id, entity_type, NOW()
            FROM model_scope_entities
            WHERE model_id = :source_id
            """,
            {"new_id": new_model_id, "source_id": str(model_id)}
        )

        # STEP D: Clone assumption overrides
        await db.execute(
            """
            INSERT INTO re_model_override (model_id, fund_id, entity_id, entity_type, key, value, reason, created_at)
            SELECT :new_id, fund_id, entity_id, entity_type, key, value, reason, NOW()
            FROM re_model_override
            WHERE model_id = :source_id
            """,
            {"new_id": new_model_id, "source_id": str(model_id)}
        )

        await db.commit()

        # STEP E: Return the new model
        new_model = await db.execute(
            "SELECT * FROM re_model WHERE id = :id",
            {"id": new_model_id}
        )
        return dict(new_model.mappings().first())

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"[clone] source_model_id={model_id} error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

#### Step 3: Fix the silent failure in the frontend

The clone failure currently shows no feedback to the user despite the 500 error. Fix:

```tsx
const handleClone = async (modelId: string) => {
  try {
    setIsCloning(modelId);  // show loading state on the specific row
    const response = await fetch(`/api/re/v2/models/${modelId}/clone`, { method: "POST" });
    if (!response.ok) {
      const { detail } = await response.json().catch(() => ({ detail: "Clone failed" }));
      toast.error(`Clone failed: ${detail}`);
      return;
    }
    const newModel = await response.json();
    toast.success(`Model cloned: "${newModel.name}"`);
    await refetchModels();  // refresh the model list
  } catch (e) {
    toast.error(`Clone failed: ${e.message}`);
  } finally {
    setIsCloning(null);
  }
};
```

#### Step 4: Verify

Click kebab → Clone on any model. A new model with "(Copy)" suffix must appear in the list within 2 seconds. No 500 error. Toast shows success.

---

## SECTION 3 — P1: FIX RUN MODEL + RUN MONTE CARLO BUTTONS

### NEW-005: Run Model button is disabled:true but has no visual indication

**v5 finding: `Run Model` button has `disabled: true` in the DOM but appears visually identical to an active button. Users cannot tell it is disabled.**

The button is correctly disabled when scope is empty — but the UX is deceptive. Fix both the visual and the messaging:

```tsx
// WRONG — no visual affordance for disabled state:
<button
  disabled={model.entityCount === 0}
  onClick={handleRunModel}
  className="bg-blue-500 text-white px-4 py-2 rounded"   // ← looks identical whether disabled or not
>
  Run Model
</button>

// RIGHT — clear disabled visual + tooltip:
<Tooltip
  content={model.entityCount === 0
    ? "Add at least one entity in the Scope tab before running"
    : "Run the model against all scoped entities"}
>
  <button
    disabled={model.entityCount === 0}
    aria-disabled={model.entityCount === 0}
    onClick={handleRunModel}
    className={cn(
      "inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium transition",
      model.entityCount === 0
        ? "opacity-40 cursor-not-allowed bg-blue-400 text-white"   // ← disabled state
        : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer" // ← active state
    )}
  >
    <PlayIcon className="w-4 h-4" />
    Run Model
  </button>
</Tooltip>
```

Also add a server-side guard in the Python run handler:

```python
@router.post("/models/{model_id}/run")
async def run_model(model_id: UUID, db: AsyncSession = Depends(get_db)):
    # Guard: require at least 1 entity in scope
    scope_count = await db.scalar(
        "SELECT COUNT(*) FROM model_scope_entities WHERE model_id = :id",
        {"id": str(model_id)}
    )
    if scope_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Model has no entities in scope. Add assets in the Scope tab before running."
        )
    # ... rest of run logic
```

---

### NEW-006: Run Monte Carlo button fires zero API calls

**v5 finding: `Run Monte Carlo` button has `disabled: false` but clicking it produces no API calls and no console errors.**

Find the Monte Carlo button click handler:

```bash
grep -rn "monte.*carlo\|montecarlo\|RunMonteCarlo\|runMonteCarlo" --include="*.tsx" --include="*.ts" -l
```

The handler is either:
1. **Missing entirely** — the onClick prop is undefined or not attached
2. **Short-circuiting silently** — there is a guard condition that returns early with no feedback
3. **Wired to a form submit** — but the form is not wrapped in a `<form>` tag or has no `onSubmit`

Fix pattern:

```tsx
// Check that the handler is actually attached:
<button
  type="button"               // ← explicit type to prevent accidental form submit behavior
  onClick={handleRunMonteCarlo}
  disabled={isRunning}
>
  Run Monte Carlo
</button>

// The handler must be defined AND exported from the component:
const handleRunMonteCarlo = async () => {
  if (!simulations || !seed) {
    toast.error("Set simulation count and seed before running");
    return;
  }
  if (model.entityCount === 0) {
    toast.error("Add entities to scope before running Monte Carlo");
    return;
  }
  try {
    setIsRunning(true);
    const response = await fetch(`/api/re/v2/models/${modelId}/monte-carlo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulations, seed }),
    });
    if (!response.ok) {
      const { detail } = await response.json();
      throw new Error(detail);
    }
    const result = await response.json();
    setMonteCarloResult(result);
    toast.success("Monte Carlo simulation complete");
  } catch (e) {
    toast.error(`Monte Carlo failed: ${e.message}`);
  } finally {
    setIsRunning(false);
  }
};
```

---

## SECTION 4 — P1: FIX SERVICE HEALTH (503s)

### NEW-007: /lab/upload → 503 Service Unavailable

**v5 finding: GET /lab/upload returns 503 on every request. The upload route is not registered or the service is not running.**

```bash
# Find the upload route handler registration
grep -rn "upload\|lab/upload" --include="*.py" -l
grep -rn "router.include\|app.include_router\|app.mount" --include="*.py"
```

**Likely cause:** The upload router is defined but not included in the main FastAPI app, or the route path does not match what Next.js is proxying.

```python
# In main.py or app/api/__init__.py:
from routes.upload import router as upload_router

app.include_router(upload_router, prefix="/api/lab", tags=["upload"])
# Verify: the route registers at /api/lab/upload

# In routes/upload.py — make sure a GET (or OPTIONS for CORS) handler exists:
@router.get("/upload")
async def get_upload_config():
    return {"max_size_mb": 50, "accepted_types": ["csv", "xlsx", "pdf"]}

@router.post("/upload")
async def upload_file(file: UploadFile, ...):
    ...
```

Verify: `curl https://www.paulmalmquist.com/api/lab/upload` must return 200 or 405 (Method Not Allowed), not 503.

---

### NEW-008: /re/assets prefetch → 503 on every model page load

**v5 finding: Every model page load fires a prefetch to /re/assets which returns 503. This fires automatically and suggests a broken background fetch in the model page initialization.**

```bash
grep -rn "re/assets\|reAssets\|prefetch.*assets\|assets.*prefetch" --include="*.tsx" --include="*.ts" -l
```

Fix:
1. **If /re/assets is the correct route:** Register the route handler in Python
2. **If /re/assets was renamed:** Update the prefetch call to use the correct route
3. **If /re/assets is a Next.js prefetch artifact:** Add a `<link rel="prefetch" ...>` guard or remove the prefetch entirely if not needed

```python
# Register the assets route in the RE router:
@router.get("/assets")
async def list_re_assets(env_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            "SELECT id, name, state, city, property_type FROM assets WHERE env_id = :env_id ORDER BY name",
            {"env_id": str(env_id)}
        )
        return result.mappings().all()
    except Exception as e:
        logger.error(f"[assets][GET] env_id={env_id} error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

---

## SECTION 5 — P1: FIX UX-002 (DUPLICATE MODEL NAMES)

**Confirmed broken v4 and v5. The uniqueness check is client-side only (or completely missing) — two models named "Morgan QA Downside" currently coexist.**

### Step 1: Add DB-level unique constraint

```sql
-- First, resolve existing duplicates (keep the original by created_at):
WITH ranked AS (
  SELECT id, name, env_id,
    ROW_NUMBER() OVER (PARTITION BY name, env_id ORDER BY created_at ASC) AS rn
  FROM re_model  -- use actual table name
)
DELETE FROM re_model
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
AND name = 'Morgan QA Downside'
AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001';
-- CAUTION: verify this deletes only QA-generated duplicates before running

-- Then add the constraint:
ALTER TABLE re_model
ADD CONSTRAINT uq_re_model_name_env
UNIQUE (name, env_id);
```

### Step 2: Handle the constraint in the Python API

```python
@router.post("/funds/{fund_id}/models")
async def create_model(fund_id: UUID, body: CreateModelRequest, db: AsyncSession = Depends(get_db)):
    try:
        # ... insert logic
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "uq_re_model_name_env" in str(e) or "unique" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"A model named '{body.name}' already exists in this environment. Choose a different name."
            )
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        await db.rollback()
        logger.error(f"[create_model] error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 3: Handle 409 in the frontend

```tsx
const handleCreateModel = async () => {
  const response = await fetch(`/api/re/v2/funds/${fundId}/models`, {
    method: "POST",
    body: JSON.stringify({ name, description, strategy }),
  });
  if (response.status === 409) {
    const { detail } = await response.json();
    setNameError(detail);   // show inline error under the name input
    return;
  }
  if (!response.ok) {
    toast.error("Failed to create model");
    return;
  }
  // success
};
```

---

## SECTION 6 — P1: SEED ALL DATA (Exhaustive — Run After DB Fixes Are Applied)

**This section must run AFTER all schema fixes in Sections 1–5 are applied. Seed data inserts will fail if the underlying tables or columns don't exist.**

### Pre-seed verification

```sql
-- Confirm required tables exist before seeding:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  're_model',              -- or whatever model table is named
  'model_scope_entities',  -- or whatever scope table is named
  're_model_override',     -- or whatever override table is named
  'assets',
  'model_runs',
  'model_run_results'
);
-- Must return all rows you need. Missing tables = stop and create them first.

-- Confirm assets are seeded for Meridian:
SELECT COUNT(*), COUNT(name) as with_names FROM assets
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001';
-- Must return: count > 0, with_names = count (all assets must have names)
```

### 6.1 — Asset seed (if assets have no names)

```sql
-- If assets exist but have NULL names, update them with realistic RE property data:
UPDATE assets SET
  name = CASE
    WHEN state = 'TX' THEN 'Austin Office Tower ' || ROW_NUMBER() OVER (PARTITION BY state ORDER BY id)
    WHEN state = 'CA' THEN 'LA Industrial Park ' || ROW_NUMBER() OVER (PARTITION BY state ORDER BY id)
    WHEN state = 'NY' THEN 'Manhattan Mixed-Use ' || ROW_NUMBER() OVER (PARTITION BY state ORDER BY id)
    ELSE 'Portfolio Asset ' || ROW_NUMBER() OVER (ORDER BY id)
  END
WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
AND name IS NULL;

-- Verify:
SELECT COUNT(*) FROM assets WHERE env_id = 'a1b2c3d4-0001-0001-0003-000000000001' AND name IS NOT NULL;
-- Must equal total asset count
```

### 6.2 — Scope seed (entity-model relationships)

```sql
-- Seed scope for "Morgan QA Downside"
-- First: get 8 asset IDs from Meridian environment
INSERT INTO model_scope_entities (model_id, entity_id, entity_type, created_at)
SELECT
  '0903b5a8-a420-433c-af5b-2aaecb9d05fc'::uuid,
  a.id,
  'asset',
  NOW()
FROM assets a
WHERE a.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
  AND a.name IS NOT NULL
LIMIT 8
ON CONFLICT (model_id, entity_id) DO NOTHING;   -- idempotent: safe to re-run

-- Seed scope for "Base Case Stress Test"
INSERT INTO model_scope_entities (model_id, entity_id, entity_type, created_at)
SELECT
  (SELECT id FROM re_model
   WHERE name = 'Base Case Stress Test'
   AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
   LIMIT 1),
  a.id,
  'asset',
  NOW()
FROM assets a
WHERE a.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
  AND a.name IS NOT NULL
LIMIT 12
ON CONFLICT (model_id, entity_id) DO NOTHING;

-- Verify:
SELECT m.name, COUNT(s.entity_id) AS scope_count
FROM re_model m
LEFT JOIN model_scope_entities s ON s.model_id = m.id
WHERE m.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
GROUP BY m.name;
-- Morgan QA Downside: 8, Base Case Stress Test: 12, others: 0+
```

### 6.3 — Assumption override seed

```sql
-- Delete and re-insert to ensure clean state (idempotent):
DELETE FROM re_model_override   -- use actual table name
WHERE model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc'
AND reason LIKE 'Seed%';

INSERT INTO re_model_override (model_id, fund_id, entity_id, entity_type, key, value, reason, created_at)
VALUES
  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'a1b2c3d4-0001-0010-0001-000000000001', NULL, NULL,
   'exit_cap_rate', '0.065', 'Seed: Downside 50bps cap rate expansion vs base', NOW()),

  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'a1b2c3d4-0001-0010-0001-000000000001', NULL, NULL,
   'revenue_growth', '-0.02', 'Seed: Downside 2% NOI decline stress', NOW()),

  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', 'a1b2c3d4-0002-0020-0001-000000000001', NULL, NULL,
   'vacancy_rate', '0.12', 'Seed: Elevated vacancy downside assumption', NOW()),

  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', NULL, NULL, NULL,
   'hold_period_years', '7', 'Seed: Extended hold under downside scenario', NOW()),

  ('0903b5a8-a420-433c-af5b-2aaecb9d05fc', NULL, NULL, NULL,
   'discount_rate', '0.095', 'Seed: Risk-adjusted discount rate downside', NOW());


-- Base Case Stress Test overrides:
DELETE FROM re_model_override
WHERE model_id = (
  SELECT id FROM re_model
  WHERE name = 'Base Case Stress Test'
  AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
  LIMIT 1
)
AND reason LIKE 'Seed%';

INSERT INTO re_model_override (model_id, fund_id, entity_id, entity_type, key, value, reason, created_at)
SELECT
  m.id, NULL, NULL, NULL, v.key, v.value, v.reason, NOW()
FROM re_model m,
(VALUES
  ('exit_cap_rate', '0.055', 'Seed: Base case market exit assumption'),
  ('revenue_growth', '0.03', 'Seed: Base case 3% NOI growth'),
  ('hold_period_years', '5', 'Seed: Standard 5-year hold'),
  ('discount_rate', '0.08', 'Seed: Blended cost of capital base case')
) AS v(key, value, reason)
WHERE m.name = 'Base Case Stress Test'
AND m.env_id = 'a1b2c3d4-0001-0001-0003-000000000001';

-- Verify:
SELECT m.name, COUNT(o.id) as override_count
FROM re_model m
LEFT JOIN re_model_override o ON o.model_id = m.id
WHERE m.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'
GROUP BY m.name;
-- Morgan QA Downside: 5, Base Case Stress Test: 4
```

### 6.4 — Seeded model runs and fund impact data

```sql
-- Insert seeded run records (so Fund Impact tab shows data immediately):
INSERT INTO model_runs (id, model_id, status, started_at, completed_at, triggered_by, simulation_count, seed_value)
VALUES
  (gen_random_uuid(),
   '0903b5a8-a420-433c-af5b-2aaecb9d05fc',
   'completed',
   NOW() - INTERVAL '2 hours',
   NOW() - INTERVAL '119 minutes',
   'seed',
   1000, 42),
  (gen_random_uuid(),
   (SELECT id FROM re_model WHERE name = 'Base Case Stress Test'
    AND env_id = 'a1b2c3d4-0001-0001-0003-000000000001' LIMIT 1),
   'completed',
   NOW() - INTERVAL '3 hours',
   NOW() - INTERVAL '179 minutes',
   'seed',
   1000, 42)
ON CONFLICT DO NOTHING;

-- Insert fund-level impact results for the seeded runs:
-- (Adjust metric column names to match your actual model_run_results schema)
INSERT INTO model_run_results (run_id, fund_id, metric, base_value, model_value, pct_change)
SELECT
  r.id,
  v.fund_id::uuid,
  v.metric,
  v.base_val::numeric,
  v.model_val::numeric,
  ((v.model_val::numeric - v.base_val::numeric) / v.base_val::numeric)
FROM model_runs r,
(VALUES
  ('a1b2c3d4-0001-0010-0001-000000000001', 'tvpi',  '1.21', '1.05'),
  ('a1b2c3d4-0001-0010-0001-000000000001', 'irr',   '0.12', '0.07'),
  ('a1b2c3d4-0001-0010-0001-000000000001', 'moic',  '1.85', '1.52'),
  ('a1b2c3d4-0002-0020-0001-000000000001', 'tvpi',  '1.21', '1.08'),
  ('a1b2c3d4-0002-0020-0001-000000000001', 'irr',   '0.12', '0.09'),
  ('a1b2c3d4-0002-0020-0001-000000000001', 'moic',  '1.85', '1.71')
) AS v(fund_id, metric, base_val, model_val)
WHERE r.model_id = '0903b5a8-a420-433c-af5b-2aaecb9d05fc'
AND r.triggered_by = 'seed'
ON CONFLICT DO NOTHING;

-- Verify:
SELECT COUNT(*) FROM model_run_results
WHERE run_id IN (SELECT id FROM model_runs WHERE triggered_by = 'seed');
-- Must be > 0
```

### 6.5 — StonePDS financial metrics seed

```sql
-- Insert financial overview metrics for StonePDS (after BUG-001 fix is confirmed):
INSERT INTO env_financial_metrics (env_id, metric_key, metric_value, metric_label, updated_at)
VALUES
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'total_program_budget',     850000000, 'Total Program Budget',     NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'committed_spend',          612000000, 'Committed Spend',          NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'actual_to_date',           487000000, 'Actual to Date',           NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'forecasted_at_completion', 863000000, 'Forecasted at Completion', NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'schedule_variance_days',  -14,        'Schedule Variance (Days)', NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'cost_variance_pct',        0.015,     'Cost Variance %',          NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'active_projects',          23,        'Active Projects',          NOW()),
  ('a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2', 'flagged_milestones',       5,         'Flagged Milestones',       NOW())
ON CONFLICT (env_id, metric_key) DO UPDATE
  SET metric_value = EXCLUDED.metric_value,
      updated_at = NOW();

-- Verify:
SELECT metric_key, metric_value FROM env_financial_metrics
WHERE env_id = 'a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2';
-- Must return 8 rows
```

---

## SECTION 7 — GLOBAL: REPLACE ALL SWALLOWED ERRORS IN PYTHON BACKEND

This is the most important systemic fix. Every `"Internal error"` response across 5 QA rounds was caused by catch blocks that suppress the actual error. Do this find-and-replace across the entire backend:

```bash
# Find all suppressed error locations:
grep -rn '"Internal error"\|"internal error"\|"Something went wrong"\|{"error": "Error"}' --include="*.py"
```

For every match, apply this transformation:

```python
# BEFORE (found across multiple routes):
except Exception as e:
    return JSONResponse({"error": "Internal error"}, status_code=500)

# AFTER (apply to every match):
except Exception as e:
    import traceback
    logger.error(
        f"[{__name__}][{request.method} {request.url.path}] Unhandled exception: {type(e).__name__}: {e}\n"
        f"Request body: {await request.body()}\n"
        f"{traceback.format_exc()}"
    )
    raise HTTPException(
        status_code=500,
        detail={
            "error": str(e),
            "type": type(e).__name__,
            "path": str(request.url.path)
        }
    )
```

Also add a global exception handler so nothing slips through:

```python
# In main.py:
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"[GLOBAL] Unhandled: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__}
    )
```

---

## SECTION 8 — COMPLETE VERIFICATION CHECKLIST

Run every item in this checklist in order after all fixes and seeds are applied. Do not mark any fix done until the specific HTTP status is confirmed.

### StonePDS (tenant: StonePDS, env_id: a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2)

- [ ] `GET /pds` → **200** (not 500). Dashboard loads with financial metrics (not dashes). **BUG-001 fix verified.**
- [ ] Left nav remains fully clickable while on any module. **BUG-002 fix verified.**
- [ ] `GET /legal` → 200. Schema error does not appear.
- [ ] `/lab/upload` → **200 or 405** (not 503). **NEW-007 fix verified.**

### Meridian Capital Management RE Models (env_id: a1b2c3d4-0001-0001-0003-000000000001)

- [ ] `GET /api/re/v2/models` → **200**, returns model list. No error banner on page load.
- [ ] `GET /re/assets` (prefetch) → **200** (not 503). **NEW-008 fix verified.**
- [ ] Open "Morgan QA Downside": Overview tab shows **8 entities in scope, 5 overrides**. No error banner anywhere on the page. **BUG-003 + seed fix verified.**
- [ ] Navigate across all 5 tabs (Overview → Scope → Assumptions → Fund Impact → Monte Carlo). Error banner does NOT persist from one tab to another. **NEW-004 fix verified.**
- [ ] `GET /api/re/v2/models/{id}/scope` → **200**, returns array of entities with `name` field populated. **BUG-006 + UX-001 fix verified.**
- [ ] `POST /api/re/v2/models/{id}/scope` → **200/201** on checkbox click. Entity count updates on Overview. Exactly ONE API call and ONE console event per checkbox click (not N). **BUG-007 fix + loop bug fix verified.**
- [ ] `GET /api/re/v2/models/{id}/overrides` → **200** on page load. No error on load. **BUG-003 GET regression fix verified.**
- [ ] `POST /api/re/v2/models/{id}/overrides` → **200/201** after submitting `key: "exit_cap_rate", value: "0.065"` in Assumptions form. New row appears in overrides list. **BUG-003 POST fix verified.**
- [ ] `POST /api/re/v2/models/{id}/clone` → **201**. New model with "(Copy)" suffix appears in list. **BUG-008 fix verified.**
- [ ] Run Model button on a model with 0 entities in scope: button is visually dimmed (`opacity-40`, `cursor-not-allowed`), shows tooltip "Add entities in Scope tab first". Clicking it does NOT fire an API call. **NEW-005 fix verified.**
- [ ] Run Model button on a model WITH entities in scope: button is visually active. Clicking it fires an API call. **NEW-005 positive case verified.**
- [ ] Run Monte Carlo button: clicking it fires a visible network request to a Monte Carlo endpoint. **NEW-006 fix verified.**
- [ ] Approve button → **200**, status badge changes `draft → approved`. **Passed in v5, verify still passing.**
- [ ] Archive button → **200**, status badge changes `approved → archived`. **Passed in v5, verify still passing.**
- [ ] Create Model form → **201**, model appears in list within 2 seconds. **Passed in v5, verify still passing.**
- [ ] Attempt to create a second model named "Morgan QA Downside" → **409**, inline error "already exists", model NOT created. **UX-002 DB constraint fix verified.**
- [ ] Fund Impact tab on "Morgan QA Downside" shows Base vs Model comparison table/chart (not empty state). **Seed 6.4 verified.**
- [ ] Monte Carlo tab shows result distribution after running a simulation. **Requires NEW-006 fix first.**
- [ ] Scope picker shows entity names (not blank / not just "·TX"). **UX-001 + seed 6.1 verified.**

---

## SECTION 9 — BUG PRIORITY ORDER

Fix in this exact order. Later bugs may depend on earlier fixes being stable.

| Priority | ID | Description | Blocked-by |
|----------|-----|-------------|------------|
| **P0** | BUG-001 | PDS workspace crash (`industry_type` column missing) | — |
| **P0** | Section 7 | Replace all swallowed errors across entire Python backend | — |
| **P1** | BUG-003 | Overrides GET+POST → 500 (`re_model_override` table name) | — |
| **P1** | BUG-006/007 | Scope GET+POST → 500 + loop bug | — |
| **P1** | BUG-008 | Clone → 500 (`column "id"` missing) | — |
| **P1** | NEW-007 | /lab/upload → 503 | — |
| **P1** | NEW-008 | /re/assets prefetch → 503 | — |
| **P1** | UX-002 | Duplicate model names (add DB UNIQUE constraint) | — |
| **P2** | NEW-004 | Error banner bleeds across all tabs | BUG-003 |
| **P2** | NEW-005 | Run Model button no visual disabled state | BUG-006/007 |
| **P2** | NEW-006 | Run Monte Carlo fires zero API calls | — |
| **P2** | BUG-002 | Nav absent after crash (fix error boundary) | BUG-001 |
| **P2** | UX-001 | Blank entity labels in Scope picker | BUG-006/007 |
| **P3** | Seed 6.1-6.5 | All data seeding | All P1 fixes |
| **P3** | BUG-001 cascade | StonePDS financial metrics seed | BUG-001 |

---

## SECTION 10 — HOW TO PREVENT THIS ENTIRE CLASS OF FAILURES

These are process changes. Without these, the same bugs will recur in the next deploy cycle.

**10.1 — Schema-first development for every new route**
Before writing any Python route that queries a table, run `\d <table>` in psql and confirm the exact column names. Do not guess column names from ORM model definitions — verify against the live schema.

**10.2 — CI migration check**
Add a CI step that compares the ORM/schema definitions against the actual production DB schema on every PR. A PR that references a column that doesn't exist in production must fail CI automatically.

**10.3 — Required proof-of-fix format for every bug**
Any PR that claims to fix a bug must include in the PR description:
```
- Route fixed: POST /api/re/v2/models/{id}/overrides
- HTTP status before fix: 500
- HTTP status after fix: 201
- Request body used to test: {"key": "exit_cap_rate", "value": "0.065", "fund_id": "..."}
- Response body after fix: {"id": "...", "key": "exit_cap_rate", ...}
- Screenshot of network tab: [attached]
```
PRs without this block must not be merged.

**10.4 — Integration test for every API route**
Each API route must have at least one integration test that:
1. Sets up the DB state (either with fixtures or by running seed)
2. Calls the route with a real HTTP client
3. Asserts the HTTP status code is 2xx
4. Asserts the response body has the expected shape

If an integration test exists for a route, it is impossible to accidentally ship a DB schema mismatch for that route.

**10.5 — Seed script in source control, run on every deploy**
The seed scripts in Section 6 must be committed to the repository and run as part of every deployment to test/staging environments. Seed scripts must be idempotent (`ON CONFLICT DO NOTHING`). Verify after every deploy with a read-back query.

---

*Generated from Morgan Ruiz QA Audit Reports v1–v5 — Winston Platform — 2026-03-04*
*QA rounds: v1 (baseline) → v2 (AI-claimed, unverified) → v3 (undeployed) → v4 (genuine redeploy) → v5 (extended)*
*28% pass rate confirmed on v5: 5/18 items passing. All core RE workflow bugs remain unresolved.*
