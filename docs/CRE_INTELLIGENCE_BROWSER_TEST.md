# CRE Intelligence Platform — Browser Test Script

**Purpose**: End-to-end validation of the CRE intelligence features deployed as part of the Cherre gap-close (Phases 1-5). This test is designed for Claude Computer Use / Cowork Mode to execute in a browser with zero prior context.

**Site**: https://www.paulmalmquist.com
**Admin Code**: `admin-local`

---

## STEP 1: Login as Admin

1. Navigate to `https://www.paulmalmquist.com/login?loginType=admin`
2. Enter the admin invite code: `admin-local`
3. Click the login/submit button
4. You should be redirected to `/admin` — the admin dashboard
5. **Verify**: You see environment cards, a KPI strip (active environments count, industry count), and an activity feed

**If login fails**: The production admin code may differ from `admin-local`. Try `admin-change-me` as a fallback. If both fail, note this as a finding — the admin code is set via Vercel environment variable `ADMIN_INVITE_CODE`.

---

## STEP 2: Navigate to the REPE Environment

1. From the admin dashboard, click "Environments" or navigate to `/lab/environments`
2. Look for an environment with industry `repe` — it may be called "Meridian Capital Management" or similar
3. If an REPE environment exists, click into it. You'll land at `/lab/env/[envId]/re/`
4. If no REPE environment exists, try the hardcoded Meridian demo URL: `https://www.paulmalmquist.com/lab/env/9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101/re`

**Verify**: You see the REPE workspace shell with navigation tabs (Funds, Assets, Deals, Pipeline, Intelligence, Models, etc.)

---

## STEP 3: Test CRE Intelligence Dashboard

1. Click the "Intelligence" tab in the REPE navigation, or navigate to `/lab/env/[envId]/re/intelligence`
2. **Verify the page loads** — you should see:
   - A property search/list section (may be empty if no data is seeded)
   - Forecast questions section
   - Property type filters or search inputs
3. **Check for errors**: Open the browser console (F12 → Console tab). Note any red errors, especially:
   - 503 errors mentioning "SCHEMA_NOT_MIGRATED" → migrations not applied
   - 500 errors → backend service issues
   - Network errors → Railway backend may be down

---

## STEP 4: Test Intelligence API Endpoints Directly

Navigate to each of these URLs and verify they return JSON (not errors):

1. **Work Packages Catalog**: `https://www.paulmalmquist.com/bos/api/re/v2/work-packages/`
   - Expected: JSON array with 4 packages (due_diligence, market_scan, risk_assessment, investor_outreach)

2. **Quality Checks**: `https://www.paulmalmquist.com/bos/api/re/v2/intelligence/quality-checks`
   - Expected: JSON array (may be empty if no connector runs have occurred)

3. **Observability Health**: `https://www.paulmalmquist.com/bos/api/re/v2/intelligence/observability/health`
   - Expected: JSON with `connectors` array showing source health status

4. **Ingest Runs**: `https://www.paulmalmquist.com/bos/api/re/v2/intelligence/ingest/runs`
   - Expected: JSON array of past connector runs (may be empty)

**Note**: These endpoints proxy through Next.js to the Railway backend. If they return HTML or 404, the proxy route `/bos/*` may not be configured for these new paths.

---

## STEP 5: Test Winston Command Bar

1. From any page in the REPE workspace, look for the Winston command bar (usually at the bottom or accessible via a keyboard shortcut like Cmd+K)
2. Try typing: `"what work packages are available?"`
3. Try typing: `"build me a monthly operating report dashboard"`
4. **Verify**: Winston responds with streaming text, possibly referencing the new work packages or dashboard generation

---

## STEP 6: Test the RE Models Page

1. Navigate to `/lab/env/[envId]/re/models`
2. **Verify**: You see a models list page with a "Create Model" form
3. Try creating a model:
   - Name: "Test Scenario"
   - Type: "Scenario"
   - Strategy: "Equity"
   - Select a fund if available
   - Click "Create Model"
4. **Verify**: The model appears in the list, or you get a meaningful error

---

## STEP 7: Test the Pipeline/Map Page

1. Navigate to `/lab/env/[envId]/re/pipeline`
2. If there's a map view, click on it or navigate to `/lab/env/[envId]/re/pipeline/map`
3. **Verify**: The map renders (may show Miami area if geography data is loaded)
4. Check if geography overlays load — this depends on TIGER connector data being present

---

## ASSESSMENT TEMPLATE

After completing the tests, provide an honest assessment in this format:

### What Works
- [ ] Admin login
- [ ] Admin dashboard renders
- [ ] REPE environment accessible
- [ ] Intelligence page loads
- [ ] Work packages API returns data
- [ ] Observability health endpoint responds
- [ ] Winston command bar functional
- [ ] Models page renders
- [ ] Pipeline/map page renders

### What Doesn't Work
List each broken item with:
- **URL**: The URL that failed
- **Expected**: What should have happened
- **Actual**: What actually happened (error message, blank page, etc.)
- **Console Errors**: Any relevant browser console errors

### Severity Assessment
- **P0 (Blocking)**: Features that crash or return 500 errors
- **P1 (Major)**: Features that load but show incorrect data or missing UI
- **P2 (Minor)**: Cosmetic issues, missing labels, empty states that need better messaging

### Data Readiness
- Are there properties in the intelligence graph? (dim_property populated?)
- Are there market facts? (fact_market_timeseries populated?)
- Are there entities? (dim_entity populated?)
- Have any connector runs completed? (cre_ingest_run has rows?)

---

## RESOLUTION PROMPT

After completing the assessment, use this prompt to fix issues:

```
Based on the browser test assessment above, fix the following issues in priority order:

1. For any 503 "SCHEMA_NOT_MIGRATED" errors: Apply the missing migrations via Supabase MCP tool. The migrations are in repo-b/db/schema/ numbered 375-385.

2. For any 404 errors on /bos/api/* routes: Check if repo-b/src/app/bos/[...path]/route.ts properly proxies to the Railway backend. The backend URL should be the BOS_API_ORIGIN environment variable.

3. For any 500 errors: Check Railway logs with `railway logs --service authentic-sparkle` to identify the Python traceback. Common issues:
   - Missing environment variables (API keys)
   - psycopg3 connection pool exhaustion
   - Missing table columns (schema drift)

4. For empty data states: Run the connector backfill to populate real data:
   - TIGER geography first (foundation): POST /api/re/v2/intelligence/connectors/tiger_geography/run
   - Then ACS demographics: POST /api/re/v2/intelligence/connectors/acs_5y/run
   - Then BLS labor: POST /api/re/v2/intelligence/connectors/bls_labor/run

5. For frontend rendering issues: Check the browser console for the specific React error and fix the component.

Work through each issue sequentially. After each fix, verify by refreshing the page.
```
