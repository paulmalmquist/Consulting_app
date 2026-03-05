# Winston Platform — Bug Fix Prompt
_Generated 2026-03-05. Contains exact file paths, current code, and precise instructions for all 8 open bugs._

---

## HOW TO USE THIS PROMPT

Work through bugs in this order:
1. **Bugs #11, #12, #13, #14** — pure frontend; no Railway dependency; can be done and deployed immediately.
2. **Bug #8** — one-line backend Python fix; safe and isolated.
3. **Bug #10** — requires a DB migration + backend guard.
4. **Bug #9** — Railway deployment investigation (no code change; diagnostics only).
5. **Bug #1** — complex backend compute wiring; tackle last.

Always `Read` the file before editing. Always verify syntax/types compile before committing.

---

## Platform Quick Reference

- **Frontend repo root**: `repo-b/`  — Next.js 14, TypeScript, Tailwind with `bm-` design tokens
- **Backend root**: `backend/`  — FastAPI, Python 3.11, psycopg **v3** (`psycopg`, NOT `psycopg2`)
- **DB**: Supabase (PostgreSQL 15). Migrations in `repo-b/db/schema/`
- **Railway backend URL**: `https://authentic-sparkle-production-7f37.up.railway.app`
- **Test env_id**: `a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2`
- **Test business_id**: `68b3d128-bb6d-4d34-818f-608a6a22847d`

---

## Bug #11 — HIGH: Error Banner Text Is Near-Invisible

**File**: `repo-b/src/app/lab/env/[envId]/pds/executive/page.tsx`

**Line 254** (the error display block):
```tsx
// CURRENT (broken — text-red-100 on bg-red-500/10 fails WCAG contrast):
<div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100" data-testid="pds-executive-error">
  {error}
</div>

// FIX — change text-red-100 → text-red-700:
<div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700" data-testid="pds-executive-error">
  {error}
</div>
```

This is a single-token change. `text-red-100` is nearly white, invisible on a pale pink background. `text-red-700` gives proper dark-red contrast.

---

## Bug #12 — HIGH: Raw API Error Text Shown to Users

**File**: `repo-b/src/app/lab/env/[envId]/pds/executive/page.tsx`

The `error` state is populated from raw `err.message` strings thrown by failed API calls. When Railway returns 404 the user sees "Not Found". Fix by normalising error messages in the catch handlers and in the display block.

### Step 1 — Add a helper at the top of the component (before `return`):

```tsx
function friendlyApiError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
    return "Executive service is temporarily unavailable. Please try again shortly.";
  }
  if (msg.includes("500") || msg.toLowerCase().includes("internal server error")) {
    return "A server error occurred. Please try again or contact support.";
  }
  return fallback;
}
```

### Step 2 — Replace raw error messages in all catch blocks:

Find each `setError(err instanceof Error ? err.message : "…")` call and replace with `setError(friendlyApiError(err, "…"))`. There are 7 catch blocks total:

| Function | Current fallback | Replace with |
|---|---|---|
| `refreshAll` | `"Failed to load executive workspace"` | keep as-is (used as `friendlyApiError` fallback) |
| `handleRunConnectors` | `"Failed to run connectors"` | keep |
| `handleRunFull` | `"Failed to run full cycle"` | keep |
| `handleQueueAction` | `"Failed queue action"` | keep |
| `handleDrawerAction` | `"Failed queue action"` | keep |
| `handleGenerateMessaging` | `"Failed to generate messaging"` | keep |
| `handleGenerateBriefing` | `"Failed to generate briefing"` | keep |

Each of these should become:
```tsx
} catch (err) {
  setError(friendlyApiError(err, "Failed to load executive workspace")); // substitute the fallback per-function
}
```

---

## Bug #13 — MEDIUM: No Loading Spinner on Executive Action Buttons

**Note**: The buttons already have `disabled={running}` / `disabled={generating}` states. What's missing is a **visible spinner** so users know the action is in progress (currently they only see reduced opacity, which is hard to notice when 404s return instantly).

### Files to edit:
1. `repo-b/src/components/pds-executive/ExecutiveOverview.tsx`
2. `repo-b/src/components/pds-executive/StrategicMessagingTab.tsx`
3. `repo-b/src/components/pds-executive/BoardInvestorBriefingsTab.tsx`

### Spinner component to add (inline, no new file needed):

```tsx
// Add this small inline component at the top of each file that needs it:
function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}
```

### ExecutiveOverview.tsx — update both buttons:

```tsx
// Run Connectors button:
<button
  type="button"
  onClick={() => void onRunConnectors()}
  disabled={running}
  className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs font-medium hover:bg-bm-surface/40 disabled:opacity-60"
>
  {running && <Spinner />}
  {running ? "Running…" : "Run Connectors"}
</button>

// Run Full Cycle button:
<button
  type="button"
  onClick={() => void onRunFull()}
  disabled={running}
  className="inline-flex items-center gap-1.5 rounded-lg border border-bm-accent/60 bg-bm-accent/15 px-3 py-2 text-xs font-medium hover:bg-bm-accent/25 disabled:opacity-60"
>
  {running && <Spinner />}
  {running ? "Running…" : "Run Full Cycle"}
</button>
```

### StrategicMessagingTab.tsx — update Generate Drafts button:

```tsx
<button
  type="button"
  onClick={() => void onGenerate()}
  disabled={generating}
  className="inline-flex items-center gap-1.5 rounded-lg border border-bm-accent/60 bg-bm-accent/15 px-3 py-2 text-xs font-medium hover:bg-bm-accent/25 disabled:opacity-60"
>
  {generating && <Spinner />}
  {generating ? "Generating…" : "Generate Drafts"}
</button>
```

### BoardInvestorBriefingsTab.tsx — update both generate buttons:

```tsx
// Generate Board Pack:
<button
  type="button"
  onClick={() => void onGenerate("board")}
  disabled={generating}
  className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
>
  {generating && <Spinner />}
  {generating ? "Generating…" : "Generate Board Pack"}
</button>

// Generate Investor Pack:
<button
  type="button"
  onClick={() => void onGenerate("investor")}
  disabled={generating}
  className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
>
  {generating && <Spinner />}
  {generating ? "Generating…" : "Generate Investor Pack"}
</button>
```

---

## Bug #14 — MEDIUM: Error vs Empty State Indistinguishable in Tab Components

**Problem**: Queue, Messaging, Briefings, and Memory tabs all show "No items yet" when the API returns 404. Users cannot tell if the backend failed or if there's genuinely nothing to show.

**Root cause**: `page.tsx` tracks a single global `error` state. When any load fails, the error banner appears at the page level, but the tab components still receive empty arrays and show their "no data" empty state.

### Fix: Pass per-section `hasError` boolean to each tab

#### Step 1 — Add per-section error tracking in `page.tsx`:

Replace the single `error` state with per-section error booleans:

```tsx
// Add alongside existing state:
const [overviewError, setOverviewError] = useState(false);
const [queueError, setQueueError] = useState(false);
const [draftsError, setDraftsError] = useState(false);
const [memoryError, setMemoryError] = useState(false);
```

Update each load function to set the corresponding error flag:

```tsx
async function loadQueue() {
  try {
    const data = await listPdsExecutiveQueue(envId, businessId || undefined, { limit: 100 });
    setQueue(data);
    setQueueError(false);
  } catch {
    setQueueError(true);
  }
}

async function loadDrafts() {
  try {
    const data = await listPdsExecutiveDrafts(envId, businessId || undefined, { limit: 100 });
    setDrafts(data);
    setDraftsError(false);
  } catch {
    setDraftsError(true);
  }
}

async function loadMemory() {
  try {
    const data = await getPdsExecutiveMemory(envId, businessId || undefined, 100);
    setMemoryItems(data.items || []);
    setMemoryError(false);
  } catch {
    setMemoryError(true);
  }
}
```

Keep the global `error` catch in `refreshAll` for the page-level banner (summary of all failures).

#### Step 2 — Pass `hasError` to tab components:

```tsx
// In the JSX return, update each tab render:
{activeTab === "queue" ? (
  <DecisionQueue
    items={queue}
    loading={loading}
    hasError={queueError}         // ← add this
    onSelect={setSelectedItem}
    onAction={handleQueueAction}
  />
) : null}

{activeTab === "messaging" ? (
  <StrategicMessagingTab
    drafts={drafts}
    loading={loading}
    generating={generating}
    hasError={draftsError}         // ← add this
    onGenerate={handleGenerateMessaging}
    onApprove={handleApproveDraft}
  />
) : null}

{activeTab === "memory" ? (
  <DecisionMemoryTab
    items={memoryItems}
    loading={loading}
    hasError={memoryError}         // ← add this
  />
) : null}
```

#### Step 3 — Update tab component Props types and render logic:

For each of `DecisionQueue.tsx`, `StrategicMessagingTab.tsx`, `BoardInvestorBriefingsTab.tsx`, `DecisionMemoryTab.tsx`:

Add `hasError?: boolean` to Props type, then replace the empty-state `<p>` with:

```tsx
// In the else/empty branch of each tab:
{hasError ? (
  <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700">
    Could not load data — service may be unavailable. Try running the full cycle or check back shortly.
  </div>
) : (
  <p className="text-sm text-bm-muted2">No items yet…</p>  // keep existing empty state copy
)}
```

**Example for StrategicMessagingTab.tsx** (currently lines 33–56):
```tsx
<div className="mt-4 space-y-3">
  {loading ? (
    <p className="text-sm text-bm-muted2">Loading drafts...</p>
  ) : hasError ? (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700">
      Could not load messaging drafts — service may be temporarily unavailable.
    </div>
  ) : drafts.length ? (
    drafts.map((draft) => ( /* existing card rendering unchanged */ ))
  ) : (
    <p className="text-sm text-bm-muted2">No drafts yet. Generate messaging drafts to begin.</p>
  )}
</div>
```

Apply the same pattern to `BoardInvestorBriefingsTab.tsx` and `DecisionMemoryTab.tsx`.

For `DecisionQueue.tsx` you'll need to also read the full file first to find the correct empty state location.

---

## Bug #8 — LOW: `env_id` Ignored in `list_available_assets`

**File**: `backend/app/services/re_model_scenario.py`

**Current code** (lines 174–206): The function accepts `env_id` but the SQL has no `WHERE` clause filtering by it — all tenants' assets are returned.

**Fix**: Add a business_id join before the main query:

```python
def list_available_assets(
    *,
    env_id: UUID | None = None,
    scenario_id: UUID | None = None,
) -> list[dict]:
    """List assets NOT already in the scenario, with fund/sector info."""
    with get_cursor() as cur:
        # Resolve business_id from env_id for tenant scoping
        business_id_filter: str | None = None
        if env_id:
            cur.execute(
                "SELECT business_id FROM env_business_bindings WHERE env_id = %s LIMIT 1",
                (str(env_id),),
            )
            row = cur.fetchone()
            business_id_filter = str(row["business_id"]) if row else None

        exclude_clause = ""
        tenant_clause = ""
        params: list = []

        if scenario_id:
            exclude_clause = """
                AND a.asset_id NOT IN (
                    SELECT asset_id FROM re_model_scenario_assets WHERE scenario_id = %s
                )
            """
            params.append(str(scenario_id))

        if business_id_filter:
            tenant_clause = "AND f.business_id = %s"
            params.append(business_id_filter)

        cur.execute(
            f"""
            SELECT a.asset_id, a.asset_name, a.asset_type,
                   d.fund_id AS source_fund_id,
                   d.deal_id AS source_investment_id,
                   f.name AS fund_name
            FROM repe_asset a
            LEFT JOIN repe_deal d ON d.deal_id = a.deal_id
            LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE 1=1 {exclude_clause} {tenant_clause}
            ORDER BY f.name, a.asset_name
            """,
            params,
        )
        return cur.fetchall()
```

**Note**: `env_business_bindings` uses column names `env_id` and `business_id`. Uses psycopg v3 cursor — `cur.fetchone()` returns a dict when using `dict_row` row factory (which `get_cursor()` should set). Verify `get_cursor()` in `backend/app/db.py` uses `psycopg.rows.dict_row`.

---

## Bug #10 — HIGH: Projects Page Exposes Raw DB Error (`pds_projects` table missing)

**Page**: `paulmalmquist.com/lab/env/[envId]/pds/projects`
**Backend service**: `backend/app/services/pds.py` — `list_projects()` at line 136
**Root cause**: The `pds_projects` table doesn't exist in the Supabase database. All calls to the PDS service that reference this table return a PostgreSQL `UndefinedTable` error, which the frontend renders as-is.

**Two-part fix required:**

### Part A — Immediate guard in `backend/app/routes/pds.py`

Find the `list_projects` route handler (around line 85–118). Wrap the service call to catch `UndefinedTable`:

```python
from psycopg.errors import UndefinedTable

@router.get("/projects", response_model=list[PdsProjectOut])
def list_projects(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    stage: str | None = Query(default=None),
    status: str | None = Query(default=None),
    project_manager: str | None = Query(default=None),
    limit: int = Query(default=100),
):
    try:
        resolved_env_id, resolved_business_id = resolve_env(request, env_id, business_id)
        rows = pds_svc.list_projects(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            stage=stage,
            status=status,
            project_manager=project_manager,
            limit=limit,
        )
        return rows
    except UndefinedTable:
        # Table not yet migrated — return empty list rather than crash
        return []
    except Exception as exc:
        # existing error logging
        ...
```

This stops the raw DB error reaching the frontend.

### Part B — Apply the missing migration

Read `backend/app/services/pds.py` to understand the full `pds_projects` schema (the `INSERT` statement around line 198 will show all columns). Then create a migration file in `repo-b/db/schema/` with the next sequence number. Use Supabase MCP `apply_migration` to run it against project `ozboonlsplroialdwuxj`.

Minimum schema based on service usage:
```sql
CREATE TABLE IF NOT EXISTS pds_projects (
    project_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          uuid NOT NULL,
    business_id     uuid NOT NULL,
    name            text NOT NULL,
    code            text,
    description     text,
    stage           text,
    status          text NOT NULL DEFAULT 'active',
    project_manager text,
    start_date      date,
    end_date        date,
    budget_total    numeric(18,2),
    budget_spent    numeric(18,2),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pds_projects_env ON pds_projects(env_id);
CREATE INDEX IF NOT EXISTS idx_pds_projects_business ON pds_projects(business_id);
```

**Important**: Before applying, read `pds.py` INSERT around line 198 to confirm all column names match exactly. Do not guess columns.

---

## Bug #9 — CRITICAL: Railway Not Serving `pds_executive` Router

**This is NOT a code bug** — all code is committed and correct. The issue is that Railway is running a prior build that pre-dates the `pds_executive` router.

**Diagnosis steps**:
1. Open Railway dashboard → `authentic-sparkle-production` service → **Deployments** tab
2. Find the latest deployment (should show a recent timestamp if triggered)
3. Click the deployment → view **Build logs** and **Deploy logs**
4. Look for Python startup errors (import errors, syntax errors in `pds_executive.py` or its imports)

**Verification command** (after any new deploy):
```bash
curl -s https://authentic-sparkle-production-7f37.up.railway.app/openapi.json \
  | python3 -c "import sys,json; d=json.load(sys.stdin); routes=[p for p in d['paths'] if 'executive' in p]; print(f'{len(routes)} executive routes'); print('\n'.join(routes[:5]))"
```
Expected after successful deploy: `10 executive routes` (not `0`).

**If Railway shows no new deployments**: Push a trivial change to trigger a new build (e.g., add a comment to `backend/app/main.py`).

**Known clean status of the code**:
- `backend/app/routes/pds_executive.py` — syntax-checked clean
- `backend/app/main.py` — imports `pds_executive` at line 41, registers at line 137
- `backend/requirements.txt` — all dependencies present
- All `pds_executive` service files parse without error

---

## Bug #1 — HIGH: Model Run Never Executes (Stub)

**This is the most complex fix. Read all referenced files carefully before making any changes.**

### Current state

**File A** — `repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts`:
- Creates an `in_progress` `re_model_run` record in PostgreSQL
- Returns 202 `{ run_id, model_id, status: "in_progress", ... }`
- **Never calls the Python compute engine** — it's a stub with `// For now, create a placeholder run record.` comment at line 46

**File B** — `backend/app/services/re_model_run.py` — `run_model()`:
- Has full computation logic: quarter close, waterfall, provenance
- **BUG on line 39**: `fund_id = UUID(str(model["primary_fund_id"]))` — will throw `TypeError` for cross-fund models where `primary_fund_id = NULL` (nullable since migration 306)
- Uses `re_model.get_scoped_asset_ids(model_id)` to get actual scoped assets ✓

### Fix overview

Two changes needed:

**1. Fix `re_model_run.py` to handle null `primary_fund_id`**:

```python
def run_model(*, model_id: UUID, quarter: str, ...) -> dict:
    model = re_model.get_model(model_id=model_id)

    # Handle cross-fund models (primary_fund_id may be null since schema 306)
    raw_fund_id = model.get("primary_fund_id")
    if raw_fund_id:
        fund_id: UUID | None = UUID(str(raw_fund_id))
    else:
        # Derive fund_id from the first scoped asset's fund
        scoped_ids = re_model.get_scoped_asset_ids(model_id=model_id)
        if not scoped_ids:
            raise ValueError("Model has no scoped assets and no primary_fund_id — cannot run")
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT d.fund_id FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE a.asset_id = %s LIMIT 1
                """,
                (str(scoped_ids[0]),),
            )
            row = cur.fetchone()
            if not row or not row.get("fund_id"):
                raise ValueError("Cannot determine fund_id for model run")
            fund_id = UUID(str(row["fund_id"]))

    # Continue with existing logic...
    scenario_id = _ensure_model_scenario(model_id, fund_id)
    ...
```

**2. Wire `run/route.ts` to call the Python backend**:

The Next.js route needs to call FastAPI after creating the `re_model_run` record. Add a fire-and-forget backend call (or use a proper job queue if available):

```typescript
// repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts
// After the INSERT that creates the run record (line 48), add:

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
if (BACKEND_URL) {
  // Fire-and-forget: kick off the actual computation
  // Don't await — return 202 immediately, let backend update the run record
  void fetch(`${BACKEND_URL}/re/v2/models/${params.modelId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Add auth if needed: "Authorization": `Bearer ${process.env.BACKEND_SERVICE_TOKEN}`
    },
    body: JSON.stringify({
      run_id: runRes.rows[0].id,
      quarter: new Date().toISOString().slice(0, 7).replace("-", "Q").replace(/Q(\d+)/, (_, m) => `Q${Math.ceil(parseInt(m) / 3)}`),
    }),
  }).catch((err) => {
    console.error("[model run] Backend kick-off failed:", err);
  });
}
```

**3. Create the Python backend route** (`backend/app/routes/re_v2.py` or similar):

Check `backend/app/routes/re_v2.py` for existing `/re/v2/models/{model_id}/run` POST handler. If it exists, ensure it calls `re_model_run.run_model()`. If it doesn't exist, add:

```python
@router.post("/models/{model_id}/run")
def trigger_model_run(model_id: UUID, body: dict):
    from app.services import re_model_run
    from datetime import date
    quarter = body.get("quarter") or f"{date.today().year}Q{(date.today().month - 1) // 3 + 1}"
    result = re_model_run.run_model(
        model_id=model_id,
        quarter=quarter,
        triggered_by="api",
    )
    # Update re_model_run record status to 'success' or 'failed'
    return result
```

**4. Update `re_model_run` record on completion**:

The Python `run_model()` function needs to update the `re_model_run` record (in the Next.js DB) when done. Currently it only updates `re_provenance`. Add after `_persist_investment_results`:

```python
# Update the model run record status
with get_cursor() as cur:
    cur.execute(
        """
        UPDATE re_model_run
        SET status = %s, completed_at = now(), result_json = %s
        WHERE id = %s::uuid
        """,
        ("success", json.dumps({"assets_processed": result.get("assets_processed", 0)}), str(result["run_id"])),
    )
```

**Important**: Read `backend/app/routes/re_v2.py` fully before implementing to understand the existing route structure and auth patterns. Check `BACKEND_URL` env var name in `repo-b/.env.local` or `repo-b/.env.example`. Check `re_model_run` table schema in Supabase (project `ozboonlsplroialdwuxj`) to confirm `result_json` column exists.

---

## Commit Order Recommendation

```
commit 1: "fix: error banner contrast + friendly error messages (Bugs #11, #12)"
  - repo-b/src/app/lab/env/[envId]/pds/executive/page.tsx

commit 2: "feat: loading spinners on executive action buttons (Bug #13)"
  - repo-b/src/components/pds-executive/ExecutiveOverview.tsx
  - repo-b/src/components/pds-executive/StrategicMessagingTab.tsx
  - repo-b/src/components/pds-executive/BoardInvestorBriefingsTab.tsx

commit 3: "feat: per-section error vs empty state in executive tabs (Bug #14)"
  - repo-b/src/app/lab/env/[envId]/pds/executive/page.tsx
  - repo-b/src/components/pds-executive/DecisionQueue.tsx
  - repo-b/src/components/pds-executive/StrategicMessagingTab.tsx
  - repo-b/src/components/pds-executive/BoardInvestorBriefingsTab.tsx
  - repo-b/src/components/pds-executive/DecisionMemoryTab.tsx

commit 4: "fix: scope list_available_assets to env tenant (Bug #8)"
  - backend/app/services/re_model_scenario.py

commit 5: "fix: guard pds.py list_projects against missing table + migration (Bug #10)"
  - backend/app/routes/pds.py
  - repo-b/db/schema/315_pds_projects.sql  (use next available number)

commit 6: "feat: wire model run to backend compute engine (Bug #1)"
  - repo-b/src/app/api/re/v2/models/[modelId]/run/route.ts
  - backend/app/services/re_model_run.py
  - backend/app/routes/re_v2.py (if applicable)
```

---

_All file paths are relative to the repo root. Bugs #11–#14 and #8 can be done in a single session without any backend deployment. Bug #10 requires Supabase MCP to apply the migration. Bug #9 is a Railway dashboard action. Bug #1 requires the most careful testing._
