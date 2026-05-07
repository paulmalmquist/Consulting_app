---
name: lab-page-prod-fix
description: Generic diagnose, patch, deploy, and verify flow for ANY lab dashboard page that mounts but renders an empty-state placeholder (or stale / missing data) when the user expects populated content. Covers pages with the standard architecture — Next.js page in `repo-b/src/app/lab/env/[envId]/<feature>/`, FastAPI route in `backend/app/routes/<feature>.py`, Supabase tables with `env_id` + `business_id` RLS, served by Railway. Use when the user says "fix the <X> page", "<X> dashboard isn't loading", "<X> shows empty state", "the page at /lab/env/<envId>/<X> is broken", or any phrasing that points at a single dashboard in the lab not rendering live data correctly.
---

# Lab Page Production Fix (generic)

## When to use this skill

The user reports a single lab dashboard not rendering correctly in production despite data existing. Trigger phrases include "fix <X>", "<X> page is broken", "<X> shows empty state", "<X> dashboard not loading", "the API for <X> isn't returning data", or any reference to a `/lab/env/<envId>/<feature>` URL not behaving.

If a worked example exists for the specific page (e.g., `skills/altered-mind-prod-fix/SKILL.md` for Altered Mind), prefer the example. This generic skill is the fallback when no instance exists yet.

If the issue is design / redesign, route to `agents/frontend.md` instead. This skill is repair-only.

## Architecture this skill assumes

The standard Novendor lab dashboard has six layers:

| Layer | Typical location |
|-------|------------------|
| 1. Page route | `repo-b/src/app/lab/env/[envId]/<feature>/page.tsx` |
| 2. Dashboard component | `repo-b/src/components/<feature>/<Feature>Dashboard.tsx` (or hooks/) |
| 3. Frontend API proxy | `repo-b/src/app/api/<feature>/v1/[...path]/route.ts` |
| 4. Backend FastAPI route | `backend/app/routes/<feature>.py` |
| 5. Backend service / DB layer | `backend/app/services/<feature>*.py` (or inline `get_cursor`) |
| 6. Tables + RLS policies | Supabase under `env_id` + `business_id` scoping |

Plus an ingestion path that populates the tables (varies by feature).

If the page in question doesn't follow this shape, this skill is the wrong match.

## Required tools (and fallbacks)

- **Supabase MCP** for read-only DB inspection. Project ref: `ozboonlsplroialdwuxj`. If unavailable, fall back to `supabase db query --linked` or the host runner pending pattern.
- **File tools** (Read / Edit / Write).
- **Host bypass** at `scripts/host_runner.ps1` plus a feature-specific redeploy pending script. If a redeploy script doesn't exist for the feature yet, the bare `cd backend && railway up --service authentic-sparkle --detach` works.

## Anchors to gather before starting

Always confirm these before running any phase. Defaults can come from the URL the user pasted or the worked example.

| Field | Source |
|-------|--------|
| `feature` | the path segment after `/lab/env/<envId>/` (e.g., `altered-mind`, `historyrhymes`, `credit`) |
| `env_id` | from the URL or `selectedEnv` |
| `business_id` | from the env metadata (look up via `SELECT business_id FROM environments WHERE env_id = '<eid>'`) |
| Backend route file | `backend/app/routes/<feature>.py` (or grep for the URL pattern) |
| Tables this feature reads | grep the route file for `FROM <table_name>` |
| Expected row counts | the user's expectation (or the worked example, if any) |
| Railway service | usually `authentic-sparkle` for backend; `vercel deploy --prod` for frontend |

## Execution loop

### Phase 1: Locate the layers

If a worked-example skill exists for this feature, skip to its anchors. Otherwise grep the repo:

```bash
grep -rln "/api/<feature>/v1" repo-b/src/app
# Should return the proxy route + the dashboard component

grep -rln "router = APIRouter" backend/app/routes
# Find the FastAPI route file matching <feature>
```

Open the FastAPI route. Locate the `has_data` predicate (or whatever boolean gates the empty-state). Note:

- Which table(s) the predicate consults
- Whether there's a column-level filter (`AND clients_seen > 0`, `AND state = 'active'`, etc.)
- Whether RLS is set via `SET LOCAL app.env_id = %s` before the SELECT

### Phase 2: Verify data state via Supabase MCP

Run total counts for each table the route references:

```sql
SELECT '<table_1>' AS t, count(*)::int FROM <table_1> WHERE env_id = '<eid>'
UNION ALL
SELECT '<table_2>',          count(*)::int FROM <table_2> WHERE env_id = '<eid>'
-- ... etc for each table
;
```

Run scope check:

```sql
SELECT '<table>' AS t, count(*)::int AS n, env_id::text, business_id::text
FROM <table> GROUP BY env_id, business_id
ORDER BY n DESC LIMIT 10;
```

Run the EXACT predicate from the route, with concrete env_id substituted:

```sql
SELECT count(*) AS predicate_n FROM <table> WHERE env_id = '<eid>' AND <column_filter>;
```

### Phase 3: Branch decision

| Verification result | Branch |
|---------------------|--------|
| All counts zero for env_id | **A**: ingestion never ran for this scope. Find the ingestion script (`grep -rln "INSERT INTO <table>"` in `scripts/` and `repo-c/`). Run with correct anchors. |
| Counts non-zero but wrong env_id or business_id | **B**: re-ingest with correct anchors, OR run an `UPDATE ... SET env_id = ...` migration if the source data was correct. |
| Counts match expected, predicate_n > 0 | **C**: data is fine. Deploy is stale. Skip to Phase 5. |
| Counts match expected, predicate_n == 0 | **D**: predicate too narrow. Apply Phase 4 patch. |
| Counts match but page still empty after redeploy | **E**: dig into Railway logs, RLS pool behavior, or the frontend fetch error path. Check `r.ok` in the dashboard component — many lab dashboards swallow non-200 responses and route them to the empty-state branch. |

### Phase 4: Apply predicate widening (if branch D)

The standard fix is to broaden the has_data check from one table + column filter to "any of the feature's tables has rows for this env_id." Example pattern:

```python
# OLD: too narrow
cur.execute(
    "SELECT COUNT(*) AS n FROM <main_table> WHERE env_id = %s AND <filter>",
    (env_id,)
)
row = cur.fetchone()
if not row or row["n"] == 0:
    return <Out>(env_id=env_id, has_data=False)

# NEW: widened
cur.execute(
    """
    SELECT
        (SELECT COUNT(*) FROM <table_1> WHERE env_id = %s) AS n1,
        (SELECT COUNT(*) FROM <table_2> WHERE env_id = %s) AS n2,
        (SELECT COUNT(*) FROM <table_3> WHERE env_id = %s) AS n3
    """,
    (env_id, env_id, env_id),
)
row = cur.fetchone()
total = sum((row[k] or 0) for k in ("n1", "n2", "n3")) if row else 0
if total == 0:
    return <Out>(env_id=env_id, has_data=False)
```

Make sure downstream queries handle missing data via null fallbacks before applying. Most existing routes already do.

### Phase 5: Deploy

Standard backend deploy:

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\pending\<feature>_redeploy.ps1
```

Or, if no feature-specific pending script exists, the bare command:

```powershell
cd backend
railway up --service authentic-sparkle --detach
```

If the fix touches frontend files (rare for this skill — it's mostly backend), also push frontend:

```powershell
cd repo-b
vercel deploy --prod --yes
```

Wall-clock to live: 2–4 minutes for Railway, 1–2 minutes for Vercel.

### Phase 6: Verify live

Hit the API directly:

```powershell
curl "https://novendor.ai/api/<feature>/v1/<endpoint>?env_id=<eid>"
```

Look for the boolean / shape that controls render (e.g., `has_data: true`, populated arrays, non-null KPI fields).

Then refresh the page in the browser:

```text
https://novendor.ai/lab/env/<eid>/<feature>
```

The empty-state should be replaced with the dashboard. If not, fall back to branch E.

## Boundaries

- This skill is repair-only. Redesign goes through `agents/frontend.md`.
- Don't touch other in-flight backend work during a fix. Stay scoped to the route file + maybe a small frontend change.
- Phase 4 patches should be MINIMAL. Don't rewrite the route. Widen the predicate, ship, verify, then iterate.
- Re-run Phase 2 verification after every deploy. If `predicate_n` changes between runs, something else is in flight.

## Escalation

If branches A–E don't apply or the fix doesn't land cleanly:

- Check Railway build logs (`railway logs --service authentic-sparkle`) for backend errors after deploy.
- Check the frontend dashboard component's fetch path. Many older dashboards have `fetch(...).then(r => r.json())` without an `r.ok` check, which silently routes 5xx error JSON into the empty-state branch.
- Confirm the env_id in the URL exists in the `environments` table and the user has membership.
- If RLS is suspected (data exists in MCP but backend predicate returns 0), look at the connection role: the backend's `DATABASE_URL` should map to a role that either bypasses RLS or has `SET LOCAL app.env_id` set on every transaction. Check `backend/app/db.py`.

## Worked instances

| Feature | Skill |
|---------|-------|
| Altered Mind dashboard | `skills/altered-mind-prod-fix/SKILL.md` |

When fixing a new feature, start with this generic skill. After the fix lands, optionally write a feature-specific instance skill that fixes the anchors, references the generic flow, and captures any quirks specific to that feature.

## Companion files

- `scripts/host_runner.ps1` — host bypass entry point
- `scripts/pending/<feature>_redeploy.ps1` — feature-specific redeploy (create per feature)
- `skills/triaged-execution/` — for plans that span multiple features or include heavier reasoning steps
