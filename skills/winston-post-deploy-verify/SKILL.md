---
name: winston-post-deploy-verify
description: Post-deploy smoke test that logs into paulmalmquist.com as admin and verifies key environment pages are rendering correctly. Run after any deploy, branch merge, or coding session fix to confirm production or preview deploys are healthy. Triggers on "verify deploy", "check if the fix worked", "smoke test production", "log in and check", "post-deploy check", or when any auto/* branch is merged.
---

# Winston Post-Deploy Verification

Automated smoke test that logs into paulmalmquist.com (or a Vercel preview URL) as admin and checks that key environment pages render data correctly.

## When to Run

- After any commit is merged to main
- After an auto/* branch deploy is marked READY on Vercel
- When Paul says "check if that fix landed" or "verify the deploy"
- As a follow-up step in any coding session that pushes a fix

## Pre-Flight

1. Use the Vercel MCP (`list_deployments`) to confirm the latest deploy state is READY
2. Identify the correct URL:
   - **Production:** `https://www.paulmalmquist.com`
   - **Branch preview:** Use the `url` field from `list_deployments` for the target branch
3. Note the commit SHA and message to confirm the right code is deployed

## Login Procedure

1. Navigate to `{base_url}/login?loginType=admin`
2. Enter the admin code from `docs/reference/ENV_KEYS.md` (field: `ADMIN_INVITE_CODE`)
3. Click "Enter Admin Dashboard"
4. Wait for redirect to `/admin`
5. Confirm the admin dashboard renders with environment cards

## Environment Health Checks

Run these checks in order. For each, navigate to the page, wait for data to load, and read the page to verify.

### Trading Lab

**URL:** `{base_url}/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets`

**PASS criteria:**
- No "No database connection" banner
- Regime label is present (not "---" or empty)
- Net P&L shows a dollar value (not "$0" unless legitimately zero)
- Top Signals section shows at least 1 signal with a strength value
- Open Positions table has at least 1 row with ticker, entry price, current price
- Equity Curve chart has axis labels (dates)

**FAIL indicators:**
- "No database connection" text present
- "Application error: a client-side exception has occurred"
- All KPI values are zeroes/dashes
- `toFixed is not a function` in console errors

### Stone PDS

**URL:** `{base_url}/lab/env/a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2/pds`

**PASS criteria:**
- Page renders without crash
- At least one data card or chart is populated
- No "_ is not iterable" error in console

### Meridian Capital

**URL:** `{base_url}/lab/env/0f2b6f58-57c2-4a54-8b11-4fda7fd72510`

**PASS criteria:**
- Environment landing page renders
- Navigation sidebar shows expected links
- No client-side crash

## Console Error Classification

| Error | Severity | Action |
|---|---|---|
| `toFixed is not a function` | P0 | pg numeric coercion bug, fix in API route |
| `_ is not iterable` | P0 | Data contract mismatch, fix backend response shape |
| `Application error: a client-side exception` | P0 | Page crash, check console for root cause |
| `No database connection` | P0 | API route missing or pg pool not configured |
| React hydration #418/#423/#425 | P2 | SSR/CSR mismatch, pre-existing, non-blocking |
| `Failed to fetch` | P1 | Backend or API route down |

## Report Format

After checking, produce a brief report:

```
## Post-Deploy Verification — {date}

**Deploy:** {commit_sha} ({branch})
**URL:** {base_url}
**Status:** PASS / PARTIAL / FAIL

### Results
| Environment | Status | Notes |
|---|---|---|
| Market Intelligence | PASS/FAIL | {details} |
| Stone PDS | PASS/FAIL | {details} |
| Meridian Capital | PASS/FAIL | {details} |

### Console Errors
- {list any P0/P1 errors found}

### Action Items
- {any fixes needed}
```

Write the report to `docs/ops-reports/deploy/verify-{date}.md`.

## Scheduled Task Integration

This skill can be wired into a scheduled task that runs after deploys. The recommended trigger is the `morning-ops-digest` or a dedicated `post-deploy-smoke` task that fires when a new Vercel production deploy reaches READY state.
