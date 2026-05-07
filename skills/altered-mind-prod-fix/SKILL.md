---
name: altered-mind-prod-fix
description: End-to-end diagnose, patch, deploy, and verify for the Altered Mind production page when it shows the empty-state placeholder despite ingestion having run. Use when the user says "fix altered mind", "altered mind shows empty state", "the altered mind dashboard isn't loading", or references the URL `/lab/env/<envId>/altered-mind` not rendering. Self-contained — invokable in a fresh Claude session without prior context.
---

# Altered Mind Production Fix

## Symptom this skill addresses

The page at `https://novendor.ai/lab/env/<envId>/altered-mind` mounts but renders the empty state:

> **No data available**
> *Run the ingestion pipeline to seed this environment.*

This skill diagnoses the actual cause, applies the right fix, redeploys, and verifies live.

## Anchors (default — override if a different env)

| Field | Value |
|-------|-------|
| env_id | `bf5c5b10-9a17-4fe7-9f5b-e7de9a380122` |
| business_id | `50d028ab-45b4-402c-957f-a652dfcca621` |
| Owner | `paulmalmquist@gmail.com` |
| Supabase project_ref | `ozboonlsplroialdwuxj` |
| Railway service | `authentic-sparkle` |
| Expected counts | `am_daily_checkin=355`, `am_weekly_summary=16`, `am_referral=63`, `am_monthly_reflection=3` |

## Required tools

This skill assumes the executing session has access to:

- Supabase MCP (project-level execute_sql) — for read-only DB inspection
- File tools (Read / Edit / Write) — for the predicate patch
- Host bypass scripts at `scripts/host_runner.ps1` and `scripts/pending/altered_mind_redeploy.ps1` — for the Railway deploy

If the host bypass scripts are missing, recreate them from `scripts/HOST_BYPASS_README.md` before proceeding.

## Execution loop

Run these phases in order. Stop and report immediately if any phase fails unexpectedly.

### Phase 1: Verify data state (Haiku-grade reads)

Use Supabase MCP to run these queries against project `ozboonlsplroialdwuxj`. The MCP runs as a privileged role that bypasses RLS, so what you see is the raw row count.

```sql
SELECT 'am_daily_checkin'      AS t, count(*)::int AS n FROM am_daily_checkin
UNION ALL SELECT 'am_weekly_summary',     count(*)::int FROM am_weekly_summary
UNION ALL SELECT 'am_referral',           count(*)::int FROM am_referral
UNION ALL SELECT 'am_monthly_reflection', count(*)::int FROM am_monthly_reflection;
```

Then scope check:

```sql
SELECT 'am_weekly_summary' AS t, count(*)::int AS n, env_id::text, business_id::text
FROM am_weekly_summary GROUP BY env_id, business_id;
```

Then the deployed predicate, run as the backend would:

```sql
SELECT count(*)::int AS predicate_n
FROM am_weekly_summary
WHERE env_id = '<envId>' AND clients_seen > 0;
```

### Phase 2: Branch decision

Use the verification output to pick the branch.

| Verification result | Branch |
|---------------------|--------|
| All counts zero | **A**: ingestion never ran. Run `scripts/pending/altered_mind_step_5_repair.ps1` with the source Excel, confirm counts populate, then proceed to Phase 4. |
| Counts non-zero but scoped to a different env_id or business_id | **B**: re-ingest with correct anchors. Same script as A but verify scope after. |
| Counts match expected and `predicate_n > 0` | **C**: data is fine. The deployed Railway revision is stale. Skip directly to Phase 4. The patch in Phase 3 is harmless to apply too. |
| Counts match expected but `predicate_n == 0` (e.g. all `clients_seen` null/zero) | **D**: predicate too narrow. Apply the Phase 3 patch and proceed to Phase 4. |

The healthy "everything works after a fresh deploy" path is C. The patch from Phase 3 still ships even on path C because it makes the predicate robust against future cases of D.

### Phase 3: Apply predicate widening (if not already applied)

Open `backend/app/routes/altered_mind.py`. Locate the dashboard route's predicate. The OLD form:

```python
cur.execute(
    "SELECT COUNT(*) AS n FROM am_weekly_summary WHERE env_id = %s AND clients_seen > 0",
    (env_id,)
)
row = cur.fetchone()
if not row or row["n"] == 0:
    return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
```

Replace with the WIDENED form (already in HEAD as of the most recent commit; check before patching):

```python
cur.execute(
    """
    SELECT
        (SELECT COUNT(*) FROM am_weekly_summary    WHERE env_id = %s) AS weekly_n,
        (SELECT COUNT(*) FROM am_daily_checkin     WHERE env_id = %s) AS daily_n,
        (SELECT COUNT(*) FROM am_referral          WHERE env_id = %s) AS referral_n,
        (SELECT COUNT(*) FROM am_monthly_reflection WHERE env_id = %s) AS reflection_n
    """,
    (env_id, env_id, env_id, env_id),
)
row = cur.fetchone()
total_rows = (
    (row["weekly_n"]     or 0) +
    (row["daily_n"]      or 0) +
    (row["referral_n"]   or 0) +
    (row["reflection_n"] or 0)
) if row else 0
if total_rows == 0:
    return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
```

If the file already has the widened form, skip this phase.

### Phase 4: Deploy to Railway

Tell the user to run, in their terminal:

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_redeploy.ps1
```

This runs `railway up --service authentic-sparkle --detach` from `backend/` (per the project's CLAUDE.md guardrail) and tails logs for 30 seconds. Wall-clock to live: 2–4 minutes.

If `host_runner.ps1` or `altered_mind_redeploy.ps1` is missing, fall back to the bare command:

```powershell
cd backend
railway up --service authentic-sparkle --detach
```

### Phase 5: Verify live

After Railway reports the new revision is serving traffic, hit the API directly:

```powershell
curl "https://novendor.ai/api/am/v1/dashboard?env_id=<envId>"
```

Expect `"has_data": true` plus populated `latest_clients_seen`, `latest_weekly_revenue`, `total_referrals`, etc.

Then check the page in the browser:

```text
https://novendor.ai/lab/env/<envId>/altered-mind
```

The empty-state should be replaced with: header strip, four large KPI cards (Clients This Week / Weekly Revenue / Capacity / YTD Revenue), three medium cards (YTD Sessions / Total Referrals / Conversion Rate), an 8-Week Trend table, a Recent Check-ins table, and a Latest Reflection card.

## Companion files

- `skills/triaged-execution/plans/altered_mind_prod.yaml` — the original 9-step triaged plan this skill grew out of
- `scripts/pending/altered_mind_step_2.ps1` — DB verification with full report (heavier than Phase 1's MCP queries)
- `scripts/pending/altered_mind_step_5_repair.ps1` — ingestion repair, dry-run by default
- `scripts/pending/altered_mind_step_7_predicate.ps1` — standalone predicate patcher
- `scripts/pending/altered_mind_redeploy.ps1` — Railway deploy entry point used in Phase 4
- `skills/triaged-execution/runs/altered_mind_prod/` — receipts from prior runs

## Boundaries

- Phase 1 (read-only) and Phase 4 (deploy your own committed code) are safe to run unattended.
- Phase 2 branch B (re-ingestion) writes to production. Always run dry-run first.
- Phase 3 patch is idempotent — re-running on an already-patched file is a no-op (the matcher won't find the old pattern).
- Do not modify other backend routes during this fix. Other engineers may have in-flight work on `prompt_strategy.py`, `request_lifecycle.py`, etc.

## When this skill is the wrong choice

- The empty-state shows on a DIFFERENT environment dashboard (not Altered Mind). Use the broader `triaged-execution` skill with a tailored plan instead.
- The page returns a 5xx error from the API. That's a different failure mode (auth, RLS pool, or backend crash) and warrants direct Railway log inspection before applying any patch.
- The user wants to *redesign* the dashboard. This skill is repair-only. Redesign goes through `agents/frontend.md`.
