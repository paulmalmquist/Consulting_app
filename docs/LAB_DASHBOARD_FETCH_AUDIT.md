# Lab Dashboard Fetch Audit

Findings from the post-Altered-Mind audit pass. Covers two questions:

1. Which other backend routes have the narrow-predicate antipattern Altered Mind had?
2. Which frontend dashboards swallow 5xx errors by missing an `r.ok` check?

## Backend predicate antipattern — none found

Searched `backend/app/routes/` for the early-return-on-narrow-predicate pattern that bit Altered Mind:

```python
cur.execute("SELECT COUNT(*) FROM <one_table> WHERE env_id = %s AND <single_filter>", ...)
if not row or row["n"] == 0:
    return <Out>(env_id=env_id, has_data=False)
```

Only `altered_mind.py` uses this pattern. Already patched to widen to "any of the four am_* tables has rows for this env_id." No other backend route requires preemptive fixing for this specific antipattern.

Other dashboard routes either (a) compute `has_data` from a sum of multiple table counts already, or (b) return populated arrays where empty-state is expressed as `len(rows) == 0` in the frontend rather than a backend boolean. Both are acceptable shapes.

## Frontend — silent 5xx swallowing in 6 components

The Altered Mind dashboard component had this fetch pattern:

```typescript
fetch(`/api/.../dashboard?env_id=${envId}`).then((r) => r.json())
```

No `r.ok` check. When the API returns a 5xx (auth fail, RLS deny, backend crash), `r.json()` succeeds on the error JSON body (e.g. `{detail: "..."}`), and the dashboard's render path checks for the data shape and routes to the empty-state branch. Result: every backend failure looks like a missing-data problem to the user.

Six components share this pattern.

| File | Used by | Severity |
|------|---------|---------:|
| `repo-b/src/components/altered-mind/AlteredMindDashboard.tsx` | live, broken right now | **high** |
| `repo-b/src/components/ai-usage/AiUsageDashboard.tsx` | live (after deploy) | medium |
| `repo-b/src/components/altered-mind/AlteredMindTrends.tsx` | drill-through page | medium |
| `repo-b/src/components/altered-mind/AlteredMindWeekDetail.tsx` | drill-through page | medium |
| `repo-b/src/components/market/hooks/useDecisionEngine.ts` | trading decision UI | medium |
| `repo-b/src/components/ncf/GrantFrictionKpiTile.tsx` | NCF KPI tile | low |

## Recommended migration

Add a reusable helper at `repo-b/src/lib/fetchJson.ts`:

```typescript
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `API ${status}`);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let body: unknown = null;
  try { body = await r.json(); } catch { /* non-JSON body */ }
  if (!r.ok) {
    throw new ApiError(r.status, body, `${r.status} ${url}`);
  }
  return body as T;
}
```

Then components migrate from `fetch(...).then(r => r.json())` to `fetchJson<T>(...)` with proper try/catch in their effect. The error path renders an explicit "API returned 5xx" panel rather than silently routing to empty-state.

Migration order, in priority:

1. `AlteredMindDashboard.tsx` — fix today, in the same change as the predicate widening deploy
2. `AiUsageDashboard.tsx` — fix when the AI usage service ships
3. Remaining four — opportunistic, low priority, fix on next touch

## What this audit confirms about the Altered Mind fix

The diagnostic via Supabase MCP showed data exists, scoped right, with `predicate_n = 16`. So `has_data` would be `true` if the deployed backend matched HEAD. The empty-state showing means either (a) Railway is on a stale revision, or (b) the API is throwing a 5xx and the frontend is silently hiding it.

Adding the `r.ok` check to `AlteredMindDashboard.tsx` distinguishes (a) from (b). After redeploy:

- If the page renders, it was (a) — stale Railway. Done.
- If the page now shows a "5xx" error panel instead of empty-state, it's (b) — backend is failing. Check Railway logs.
- If the page still shows empty-state with the new helper, the API is returning 200 with `has_data: false`. Re-verify with the live curl.

This is why the frontend fix is worth shipping in the same deploy.
