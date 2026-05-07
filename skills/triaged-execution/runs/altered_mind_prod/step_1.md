# Step 1: Altered Mind Data Path Inspection

**Date**: 2026-05-05  
**Task**: Read-only inspection of all six data layers for the Altered Mind environment  
**env_id**: bf5c5b10-9a17-4fe7-9f5b-e7de9a380122  
**Expected data counts**: 355 daily / 16 weekly / 63 referrals / 3 reflections  
**Symptom**: Frontend page mounts but displays "Run the ingestion pipeline to seed this environment."

---

## Layer 1: Frontend Page

**File**: `C:\Projects\Consulting_app\repo-b\src\app\lab\env\[envId]\altered-mind\page.tsx`

**Contract**:
- env_id source: route parameter (async params deserialized at line 8)
- Tables queried: none (page is purely presentational SSR)
- Return shape: n/a

**Env scoping**:
- env_id filter: n/a
- RLS policy applied: n/a
- Silent fallback: no

**Notes**:
- Minimal page that imports `AlteredMindDashboard` component and passes `envId` as a prop. All data logic delegates to the component.

---

## Layer 2: Frontend Component & Data Fetching

**File**: `C:\Projects\Consulting_app\repo-b\src\components\altered-mind\AlteredMindDashboard.tsx`

**Contract**:
- env_id source: passed as prop from page (line 108); used in two fetch calls at lines 118-119
- Tables queried: indirectly queries am_daily_checkin, am_weekly_summary, am_referral, am_monthly_reflection via backend API
- Return shape: `DashboardData` object (lines 31-44) with `has_data: boolean` field

**Env scoping**:
- env_id filter: YES — passed as query parameter to both `/api/am/v1/dashboard?env_id=${envId}` and `/api/am/v1/checkins?env_id=${envId}&limit=10`
- RLS policy applied: applied at database layer (not frontend responsibility)
- Silent fallback: NO — on error, displays error message (lines 139-145); on no data, displays empty state (lines 149-157)

**Empty-state controller**:
- **String location**: line 154
- **Text**: "Run the ingestion pipeline to seed this environment."
- **Condition**: `if (!dash?.has_data)` at line 149

**Notes**:
- Component makes two parallel fetch calls:
  1. GET `/api/am/v1/dashboard?env_id=${envId}` → returns `DashboardData` with `has_data` boolean
  2. GET `/api/am/v1/checkins?env_id=${envId}&limit=10` → returns checkins list
- Line 122: responses are destructured as `[d, c]`, assigned to state
- **Critical observation**: Component correctly passes `env_id` to both API endpoints. If either returns an error or empty response, the component should render either error or empty state. The empty state is triggered by `has_data=false`.

---

## Layer 3: Frontend API Proxy Route

**File**: `C:\Projects\Consulting_app\repo-b\src\app\api\am\v1\[...path]\route.ts`

**Contract**:
- env_id source: query parameter passed through from client (line 7 preserves `req.nextUrl.search`)
- Tables queried: none (proxy only)
- Return shape: proxies response from backend unchanged

**Env scoping**:
- env_id filter: pass-through (no filtering at this layer)
- RLS policy applied: no (delegated to backend)
- Silent fallback: no (errors propagate)

**Notes**:
- Generic proxy route using `[...path]` catch-all that forwards GET/POST to `proxyToBos` (imported from `@/lib/server/bosProxy`)
- Line 9: builds upstream URL by concatenating `/api/am/v1/${path}${search}`, preserving query parameters including `env_id`
- Lines 12-25: GET and POST methods both delegate to `proxyOrFail`, which calls `proxyToBos`
- No env_id validation or filtering here — that responsibility belongs entirely to the backend route

---

## Layer 4: Backend FastAPI Route

**File**: `C:\Projects\Consulting_app\backend\app\routes\altered_mind.py`

**Contract**:
- env_id source: Query parameter `env_id: EnvId` (enforced by `_require_env()` at line 42), required on all routes
- Tables queried: am_daily_checkin, am_weekly_summary, am_referral, am_monthly_reflection
- Return shape: `AMDashboardOut` (dashboard), `AMCheckinsOut` (checkins), and other schema models

**Env scoping**:
- env_id filter: YES — present on every route:
  - Line 79: `cur.execute("SET LOCAL app.env_id = %s", (env_id,))` in dashboard route
  - Line 196: `cur.execute("SET LOCAL app.env_id = %s", (env_id,))` in checkins route
  - Similar pattern in all routes (lines 317, 400, 474)
- RLS policy applied: YES — `SET LOCAL app.env_id` activates Postgres RLS policies defined in schema (lines 71-73 of 9985_altered_mind_core.sql)
- Silent fallback: NO — the code explicitly checks for data existence and returns `has_data=False` when no rows match (line 87)

**Empty-state controller (backend)**:
- **String location**: `schemas/altered_mind.py`, line 172 — field definition `has_data: bool = True`
- **Logic location**: `routes/altered_mind.py`, line 82-87:
  ```python
  cur.execute(
      "SELECT COUNT(*) AS n FROM am_weekly_summary WHERE env_id = %s AND clients_seen > 0",
      (env_id,)
  )
  row = cur.fetchone()
  if not row or row["n"] == 0:
      return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
  ```
- The `has_data` predicate is **computed from a COUNT query on `am_weekly_summary`**, checking if there exists at least one row where `env_id` matches the provided query parameter AND `clients_seen > 0`

**Notes**:
- All queries filter by `env_id` as the first WHERE clause
- The critical query at lines 81-86 counts rows in `am_weekly_summary` with matching `env_id` and `clients_seen > 0`
- If that count is zero, the route returns `has_data=False` immediately without executing the rest of the dashboard logic
- **This is the gate**: if the ingestion script never populated `am_weekly_summary`, or if it did but all rows have `clients_seen = 0` or NULL, then `has_data=False` and the empty state displays

---

## Layer 5: Backend Service Module

**File**: `C:\Projects\Consulting_app\backend\app\schemas\altered_mind.py` (schema definitions only)

**Notes**:
- No separate service module exists; routes directly query the database via `get_cursor()`
- `get_cursor()` returns a context manager (imported at line 17) that handles connection pooling and Postgres session setup
- Schemas are purely Pydantic response models; no business logic in this layer

---

## Layer 6: Ingestion Script

**File**: `C:\Projects\Consulting_app\scripts\ingest_altered_mind.py`

**Contract**:
- env_id source: `--env-id` command-line argument (line 539), required
- Tables written: am_daily_checkin (line 581), am_weekly_summary (line 584), am_referral (line 587), am_monthly_reflection (line 590)
- Input: Excel file with four sheets: "Daily Check In", "Weekly Summary", "Refferal Intake Log", "Monthly Reflections Archive"

**Env scoping**:
- env_id filter: YES — script sets `SET app.env_id = '{args.env_id}'` at line 579 before upserting
- Silent fallback: NO — script validates row counts at the end (lines 476-488) and exits with error code 2 if counts don't match expected (line 602)

**Ingestion gates**:
- **Daily check-ins** (lines 106-153): Reads "Daily Check In" sheet; skips rows where Date is unparseable or contains "TOTAL" (line 111)
- **Weekly summary** (lines 156-244): Reads "Weekly Summary" sheet (transposed format); **only weeks with `clients_seen > 0` are ingested** (line 207-209). Empty future weeks are explicitly skipped.
- **Referrals** (lines 247-281): Reads "Refferal Intake Log" sheet; skips rows with missing Date or Platform
- **Reflections** (lines 284-330): Reads "Monthly Reflections Archive" sheet; only months with at least one of (theme, wins, challenges, adjustment) are included (lines 308-310)

**Upsert logic**:
- Daily: `ON CONFLICT (env_id, session_date) DO UPDATE` (line 359) — idempotent, keyed on env_id + date
- Weekly: `ON CONFLICT (env_id, week_starting) DO UPDATE` (line 409) — idempotent, keyed on env_id + week
- Referral: `ON CONFLICT DO NOTHING` (line 446) — referrals are append-only, no updates
- Reflection: `ON CONFLICT (env_id, reflection_month_date) DO UPDATE` (line 457) — idempotent, keyed on env_id + month

**Critical observation**: The script validates Excel row counts match database row counts at the end (line 597). If this verification fails, the script exits with error code 2 and logs "Row count mismatch!" (line 601). This means if the ingestion script was run and passed, the data SHOULD be in the database.

---

## Synthesis

### Empty-state controller
- **String**: "Run the ingestion pipeline to seed this environment." (AlteredMindDashboard.tsx, line 154)
- **Condition**: `if (!dash?.has_data)` at line 149
- **has_data source**: Backend route `GET /api/am/v1/dashboard` returns `has_data: bool` field in response schema
- **has_data predicate (backend)**: Computed at line 82-87 of `altered_mind.py`:
  ```sql
  SELECT COUNT(*) AS n FROM am_weekly_summary 
  WHERE env_id = %s AND clients_seen > 0
  ```
  If count is 0, return `has_data=False`

### has_data predicate

**Location**: `backend/app/routes/altered_mind.py`, line 82-87  
**Logic**: 
```python
cur.execute(
    "SELECT COUNT(*) AS n FROM am_weekly_summary WHERE env_id = %s AND clients_seen > 0",
    (env_id,)
)
row = cur.fetchone()
if not row or row["n"] == 0:
    return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
```

The predicate consults **only** `am_weekly_summary` table. It does NOT check `am_daily_checkin`, `am_referral`, or `am_monthly_reflection`. The condition is:
- env_id matches the provided query parameter (scoped by RLS policy via `SET LOCAL app.env_id`)
- AND at least one row in `am_weekly_summary` has `clients_seen > 0` (not NULL, not 0)

---

## Most likely bug location

Based on the data path inspection:

**Option A (60% probability)**: Ingestion script never ran successfully on this env_id.
- Evidence: Frontend correctly passes env_id to API; backend correctly filters by env_id and sets RLS; the empty state check is correct code. If the page shows "Run the ingestion pipeline," it means `am_weekly_summary` has 0 rows where env_id matches AND clients_seen > 0.

**Option B (30% probability)**: Ingestion script ran but wrote to the wrong env_id or wrong business_id.
- Evidence: The script accepts both `--env-id` and `--business-id` as CLI args. If the wrong env_id was passed when calling the script, the data would be in the database but under a different env_id, invisible to RLS queries.

**Option C (10% probability)**: The ingestion script ran, wrote the correct env_id, but all `am_weekly_summary` rows have `clients_seen = NULL` or 0.
- Evidence: The script explicitly skips weeks where `clients_seen <= 0` (line 207-209). If the Excel source had no weeks with valid client counts, the table would be empty.

---

## One-line theory

**The ingestion pipeline has not been run against this env_id (bf5c5b10-9a17-4fe7-9f5b-e7de9a380122), OR it was run with a different env_id value, leaving `am_weekly_summary` empty or unpopulated for the target env_id.**

---

## Verification checklist

To proceed to Step 2 (root-cause diagnosis):

- [ ] Query the production database: `SELECT COUNT(*) FROM am_weekly_summary WHERE env_id = 'bf5c5b10-9a17-4fe7-9f5b-e7de9a380122'`
  - If count = 0: no data ingested for this env_id
  - If count > 0: some data exists; check if `clients_seen > 0` for any rows
- [ ] Check audit logs or job history for the ingestion script runs
- [ ] Verify the correct env_id and business_id were passed to the ingestion command
- [ ] If data exists but `clients_seen` is NULL/0 for all rows, check the source Excel file for validity
