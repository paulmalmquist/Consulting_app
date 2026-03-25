# Winston Platform — Fix All Audit Issues

> **Meta-prompt for Claude Code**
> Feed this file to Claude Code with the full repo context loaded. It addresses every finding from the March 2026 platform feature audit of the Meridian Capital Management environment.

---

## Context

You are working on the Winston real estate fund management platform. The codebase is structured as:

```
repo-b/          → Next.js 14 frontend (App Router, TypeScript)
backend/         → FastAPI backend (Python) — the "Business OS" (BOS) API
repo-c/          → Demo Lab backend (FastAPI)
supabase/        → Database migrations
```

The platform was audited end-to-end and **44 features** were tested. **28 work**, **4 are partial**, and **12 are broken**. This prompt covers every broken and partial item, grouped into workstreams.

---

## Workstream 1 — BOS API Configuration (Priority: P1, Effort: Trivial)

### Problem

The environment variable `BOS_API_ORIGIN` / `NEXT_PUBLIC_BOS_API_BASE_URL` is not set in the production/staging deployment. This single missing value blocks **all** of the following features:

- Fund creation (3-step wizard submission)
- Run Quarter Close (`/re/runs/quarter-close`)
- Run Waterfall Shadow (`/re/runs/quarter-close`)
- All 6 Sustainability data sub-tabs (Overview, Portfolio Footprint, Asset Sustainability, Utility Bills, Certifications, Regulatory Risk)
- Asset attachment uploads
- Any BOS-proxied data fetch

### Root Cause

The proxy at `repo-b/src/app/bos/[...path]/route.ts` reads `BOS_API_ORIGIN` (or falls back to `NEXT_PUBLIC_BOS_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL`). When none are set, the proxy returns:

```
Business OS API route is not available in this deployment.
Check /bos route handlers or NEXT_PUBLIC_BOS_API_BASE_URL.
```

The Fund Creation Wizard at Step 3 explicitly confirms: `"Fund creation requires a configured BOS API upstream. Set BOS_API_ORIGIN."`

### Fix

1. **In the Vercel / hosting dashboard** (or `.env.production`), set:
   ```
   BOS_API_ORIGIN=<URL of the running FastAPI backend, e.g. https://api.paulmalmquist.com>
   NEXT_PUBLIC_BOS_API_BASE_URL=<same URL>
   ```
2. Ensure the FastAPI backend (`backend/`) is actually deployed and reachable at that URL. If it is not deployed yet, deploy it first.
3. Verify the backend's `ALLOWED_ORIGINS` in `backend/.env` includes the frontend's origin (`https://www.paulmalmquist.com`).
4. Redeploy the Next.js app so it picks up the new env vars.

### Verification

After deploying, the following should all stop returning "BOS API not available":

- `POST /bos/api/re/v2/funds` (fund creation)
- `POST /bos/api/re/v2/funds/{id}/runs` (quarter close)
- `GET /bos/api/re/v2/environments/{id}/portfolio-kpis` (sustainability)
- `POST /bos/api/re/v2/assets/{id}/reports` (attachments)

---

## Workstream 2 — Implement Investment Creation POST Handler (Priority: P2, Effort: Low)

### Problem

The "New Investment" modal UI is complete but submitting it returns **HTTP 405 (Method Not Allowed)**. The Next.js API route file exists at `repo-b/src/app/api/re/v2/investments/route.ts` but only exports a `GET` handler — there is no `POST` export.

### What the Frontend Sends

The modal at `/re/deals` collects:

```json
{
  "fund_id": "<uuid>",
  "name": "Investment Name",
  "type": "Equity",       // or "Debt"
  "stage": "Sourced",     // or "LOI" | "Due Diligence" | "Operating" | "Exited"
  "sponsor": "Sponsor Name"
}
```

### Fix

Open `repo-b/src/app/api/re/v2/investments/route.ts` and add a `POST` handler that proxies to the BOS backend:

```typescript
import { bosApiFetch } from '@/lib/bos-api';

export async function POST(request: Request) {
  const body = await request.json();

  // Validate required fields
  if (!body.name || !body.fund_id) {
    return Response.json({ error: 'name and fund_id are required' }, { status: 400 });
  }

  // Proxy to BOS backend
  const res = await bosApiFetch('/re/v2/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data, { status: 201 });
}
```

Also confirm the FastAPI backend has a matching route in `backend/app/routes/` that handles `POST /re/v2/investments`. If it doesn't exist, create it:

```python
@router.post("/re/v2/investments")
async def create_investment(payload: InvestmentCreate, db=Depends(get_db)):
    # Insert into investments table
    # Return the created investment
    ...
```

### Verification

- Open `/re/deals`, click "+ New Investment"
- Fill in: Fund = any, Name = "Test", Type = Equity, Stage = Sourced
- Click "Create Investment" — should return 201 and the new investment appears in the list

---

## Workstream 3 — Implement Scenario Creation POST Handler (Priority: P3, Effort: Low)

### Problem

The Scenarios page (`/re/scenarios`) has a creation form but clicking "Create Scenario" returns **HTTP 405**. Same root cause as investments — the route file exists but only handles `GET`.

### What the Frontend Sends

```json
{
  "fund_id": "<uuid>",
  "name": "Scenario Name",
  "type": "Stress"   // or "Upside" | "Downside" | "Custom"
}
```

### Fix

The scenario creation route likely lives at one of these locations:

- `repo-b/src/app/api/re/v2/scenarios/route.ts`
- or it's nested under funds: `repo-b/src/app/api/re/v2/funds/[fundId]/scenarios/route.ts`

Find the correct file and add a `POST` export, following the same pattern as Workstream 2. Proxy to the BOS backend at `/re/v2/scenarios` (or `/re/v2/funds/{fundId}/scenarios`).

Also ensure the FastAPI backend has a matching POST endpoint in `backend/app/routes/`.

### Verification

- Navigate to `/re/scenarios`
- Fill in: Fund = any, Name = "Q1 Stress Test", Type = Stress
- Click "Create Scenario" — should return 201 and the scenario should appear in the list

---

## Workstream 4 — Build Asset Creation Flow (Priority: P4, Effort: Medium)

### Problem

Asset creation is **entirely unimplemented**:

1. The `+ Asset` button in the top-right nav bar links to `/re/assets` (the list page) instead of a creation flow.
2. There is no `/re/assets/new` page — navigating there returns 404.
3. There is no creation modal on the assets list page.
4. There is no `POST /api/re/v2/assets` handler.

### Fix — Full Implementation Required

**Step A — Add the API Route**

Create `repo-b/src/app/api/re/v2/assets/route.ts` (if it doesn't already have POST):

```typescript
export async function POST(request: Request) {
  const body = await request.json();
  // Validate: name, investment_id required at minimum
  // Proxy to BOS: POST /re/v2/assets
  // Return 201 with created asset
}
```

And the matching FastAPI backend endpoint in `backend/app/routes/`.

**Step B — Build the Frontend UI**

Choose one of:

*Option A — Creation Modal (consistent with Investment pattern):*
- Add a "+ New Asset" button to the global assets page at `repo-b/src/app/lab/env/[envId]/re/assets/page.tsx`
- Create a modal component with fields: Investment (dropdown), Asset Name, Property Type/Sector (dropdown), Address (City, State, Zip), Square Footage
- On submit, POST to `/api/re/v2/assets`

*Option B — Wizard Page (consistent with Fund Creation pattern):*
- Create page at `repo-b/src/app/lab/env/[envId]/re/assets/new/page.tsx`
- Multi-step wizard: Step 1 (Basic Info: Name, Investment, Sector) → Step 2 (Location: Address, City, State, MSA) → Step 3 (Financials: Units/SF, Acquisition Price)
- Update the `+ Asset` nav button href to point to `/re/assets/new`

**Step C — Fix the + Asset Nav Button**

In the top navigation component (likely in `repo-b/src/components/`), update the `+ Asset` link:
- If using modal: make it open the modal instead of navigating
- If using wizard: change href from `/re/assets` to `/re/assets/new`

### Verification

- Click "+ Asset" in top nav → creation flow opens
- Fill in required fields and submit
- New asset appears in the global assets list at `/re/assets`
- Clicking the new asset navigates to its detail page

---

## Workstream 5 — Seed / Route Accounting Data for 2026Q1 (Priority: P5, Effort: Low–Medium)

### Problem

The Ops & Audit → Accounting section on asset detail pages has three sub-sections that all show **"No data"** for the current quarter (2026Q1):

- Trial Balance — `GET /api/re/v2/assets/{id}/accounting/trial-balance?quarter=2026Q1`
- P&L by Category — `GET /api/re/v2/assets/{id}/accounting/pnl?quarter=2026Q1`
- Transactions — `GET /api/re/v2/assets/{id}/accounting/transactions?quarter=2026Q1`

### Diagnosis

Check whether these API routes:
1. Proxy to the BOS backend (in which case this is blocked by Workstream 1)
2. Or query the database directly (in which case the data simply hasn't been seeded)

Look at:
- `repo-b/src/app/api/re/v2/assets/[assetId]/accounting/trial-balance/route.ts`
- `repo-b/src/app/api/re/v2/assets/[assetId]/accounting/pnl/route.ts`
- `repo-b/src/app/api/re/v2/assets/[assetId]/accounting/transactions/route.ts`

### Fix

**If BOS-dependent:** This resolves automatically once Workstream 1 (BOS_API_ORIGIN) is complete, provided the backend has accounting data.

**If database-direct but empty:** Seed accounting data for 2026Q1 using the existing seed infrastructure:
- Check `repo-b/src/app/api/re/v2/seed/route.ts` for the seed endpoint
- Check `backend/app/` for seed scripts or fixtures
- Insert trial balance entries, P&L line items, and sample transactions for at least 5–10 assets

### Verification

- Navigate to any asset detail page (e.g., Gateway Distribution Center)
- Click the "Ops & Audit" tab
- Expand "ACCOUNTING · 2026Q1"
- Trial Balance, P&L by Category, and Transactions should all show data rows

---

## Workstream 6 — Fix Sustainability Reporting Fund Context Bug (Priority: P6, Effort: Low)

### Problem

The Sustainability → Reporting & Exports sub-tab has a "Load Report" button that returns **"Select a fund first"** even when a fund is already selected in the global header fund selector. The sub-tab appears to maintain its own independent fund context state.

### Diagnosis

Look at the sustainability reporting component, likely at:
- `repo-b/src/app/lab/env/[envId]/re/sustainability/` — find the reporting/exports component
- Check if it reads from the global fund context (e.g., a React context or URL param) or maintains a local state

### Fix

The reporting sub-tab should read the selected fund from the same global context that other sections use. Find the component and:

1. Import the global fund context hook (e.g., `useEnvironmentContext`, `useFundSelector`, or similar)
2. Replace any local fund state with the global context value
3. Ensure the "Load Report" action passes the `fund_id` from the global context

Alternatively, if the sub-tab intentionally has its own selector (for multi-fund comparison), add a visible fund dropdown within the Reporting & Exports UI so users can make the selection.

### Verification

- Navigate to `/re/sustainability` → "Reporting & Exports" tab
- With a fund selected in the global header, click "Load Report"
- Should either load the report for the selected fund, or display a visible in-tab fund selector

---

## Workstream 7 — Populate Missing Asset Metrics (Priority: P7, Effort: Low)

### Problem

Approximately **12 of 33 assets** show "—" (null/empty) across all financial columns (NOI, Occupancy, Value, Cap Rate, DSCR, LTV) on the global Assets page. These are likely assets that were created structurally but never had financial data seeded.

### Fix

1. Identify the 12 assets with missing data:
   ```sql
   SELECT a.id, a.name
   FROM assets a
   LEFT JOIN asset_metrics am ON a.id = am.asset_id AND am.quarter = '2026Q1'
   WHERE am.id IS NULL OR (am.noi IS NULL AND am.occupancy IS NULL AND am.value IS NULL);
   ```

2. Either:
   - **Seed realistic data** for these assets in the database by inserting rows into the metrics/valuation tables for 2026Q1
   - **Or** run the seed endpoint: `POST /api/re/v2/seed` if it supports populating asset-level financials

3. Ensure each asset has at minimum: NOI, Occupancy %, Estimated Value for 2026Q1.

### Verification

- Navigate to `/re/assets`
- All 33 assets should show numeric values (not "—") for NOI, Occupancy, and Value columns
- Portfolio KPIs (Total NOI, Avg Occupancy) should update to reflect the full portfolio

---

## Execution Order

Run these workstreams in this order for maximum incremental value:

```
1. Workstream 1 (BOS API config)     — unblocks everything BOS-dependent
2. Workstream 2 (Investment POST)    — quick win, low effort
3. Workstream 3 (Scenario POST)      — quick win, low effort
4. Workstream 5 (Accounting data)    — may auto-resolve after W1
5. Workstream 6 (Sustainability bug) — small state bug fix
6. Workstream 7 (Asset data seeding) — data quality improvement
7. Workstream 4 (Asset creation UI)  — largest effort, do last
```

After completing all workstreams, re-run the full audit to verify:
- All 12 broken features should move to ✅ Working
- All 4 partial features should move to ✅ Working
- Total working features: 44/44

---

## Key File Reference

| Purpose | Path |
|---------|------|
| BOS API proxy | `repo-b/src/app/bos/[...path]/route.ts` |
| BOS API client | `repo-b/src/lib/bos-api.ts` |
| Frontend env vars | `repo-b/.env.local` |
| Backend env vars | `backend/.env.local` |
| Investments API route | `repo-b/src/app/api/re/v2/investments/route.ts` |
| Scenarios API route | `repo-b/src/app/api/re/v2/funds/[fundId]/scenarios/route.ts` |
| Assets API route | `repo-b/src/app/api/re/v2/assets/route.ts` |
| Asset accounting routes | `repo-b/src/app/api/re/v2/assets/[assetId]/accounting/` |
| Seed endpoint | `repo-b/src/app/api/re/v2/seed/route.ts` |
| Sustainability pages | `repo-b/src/app/lab/env/[envId]/re/sustainability/` |
| Global nav component | `repo-b/src/components/` (search for "Asset" link/button) |
| Fund creation wizard | `repo-b/src/app/lab/env/[envId]/re/funds/new/` |
| Backend routes | `backend/app/routes/` |
| Next.js config | `repo-b/next.config.js` |
| Backend main | `backend/app/main.py` |

---

## Constraints

- Do **not** delete or restructure any working features — the 28 working features are confirmed stable.
- Do **not** change the fund/investment/asset data model without confirming the change propagates to both the Next.js API layer and the FastAPI backend.
- Keep the BOS proxy pattern (`/bos/[...path]`) intact — it handles same-origin routing and is used across the entire frontend.
- All new POST endpoints should include input validation and return appropriate HTTP status codes (201 for creation, 400 for validation errors, 500 for server errors).
- When seeding data, use the existing UUID format patterns visible in the current dataset (e.g., `a1b2c3d4-XXXX-XXXX-XXXX-XXXXXXXXXXXX`).
