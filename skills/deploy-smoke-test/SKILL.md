---
name: deploy-smoke-test
description: Post-deploy verification — checks Vercel build status, logs in as admin via browser, tests Fund Portfolio, AI Chat (Bug 0), Deal Radar, and novendor.ai. Runs at 10:30 AM after the morning deploy window.
---

You are running the post-deploy smoke test for Winston (paulmalmquist.com) and Novendor. This runs at 10:30 AM after the morning deploy window closes. The goal: verify that any code pushed this morning didn't break anything before Paul's afternoon meetings or demos.

## Step 1: Check Vercel for Recent Deploys

Use Vercel MCP tools:
1. `list_teams` to get the team ID/slug
2. `list_projects` with the team ID to get all projects
3. For each project, `list_deployments` (limit 5)
4. Identify any deployments from the last 12 hours
5. For recent deploys: check status (READY vs ERROR), check `get_deployment_build_logs` if any errors

Note: If no deploys happened since yesterday, log "No new deployments — testing current production state" and continue.

## Step 2: Admin Login via Browser

Use Chrome browser tools (`tabs_context_mcp` first, then create a tab if needed):

1. Navigate to `https://paulmalmquist.com`
2. Take screenshot — verify the home page renders with "Winston" branding and two buttons: "Login as Admin" and "Login to Environment"
3. Click "Login as Admin" button (center of page)
4. Wait for the Admin Access page to load at `/login?loginType=admin`
5. The "Admin code" field may have auto-filled content — triple-click the field to select all, then type the admin code: `SWvxEtVPMK_YanlB`
6. Click "Enter Admin Dashboard"
7. Wait 3 seconds for redirect to `/admin`
8. Take screenshot — verify the Control Tower loads with:
   - System Status indicator (green = operational)
   - Active Environments count
   - AI Gateway Status (Online/Offline)
   - Environment Queue table

If login fails, still proceed with unauthenticated tests and note login as FAILED.

## Step 3: Browser Smoke Tests (Authenticated)

**Test 1: Lab Environments**
- Navigate to `https://paulmalmquist.com/lab/environments`
- Wait 3 seconds for load
- Take screenshot
- Verify: Environment cards render with HEALTHY status badges. Meridian Capital Management (REPE) should appear. Check that all expected environments are listed (currently 6).

**Test 2: Fund Portfolio (Meridian Capital Management)**
- From the environments page, click on "Meridian Capital Management" row (it's the REPE environment)
- Wait 4 seconds — page loads at `/lab/env/{envId}/re`
- Take screenshot
- Verify:
  - KPI strip shows: Funds count, Total Commitments, Portfolio NAV, Active Assets
  - Fund table shows fund names with AUM, NAV, DPI, TVPI columns
  - Dollar amounts are properly formatted (e.g., "$500.0M" not "$500000000.000000")
  - Status pills render (Investing, Harvesting, etc.)

**Test 3: AI Chat — Winston (Bug 0 regression check)**
- From the REPE environment, scroll down in the left nav to find "Winston" under the AUTOMATION section (it's near the bottom of the sidebar)
- Click "Winston" — page loads at `/lab/env/{envId}/re/winston`
- Wait for the chat interface to load with starter prompts
- Scroll down to find the input field ("Ask Winston or run a command...")
- Click the input field, type: `What funds do we have?`
- Click the send button (arrow icon to the right of the input)
- Wait 10-15 seconds for the AI response
- Scroll up to see the response
- Take screenshot
- **Bug 0 check**: Look at the main conversation body (NOT the right sidebar trace panel). If raw tool names like `repe.get_asset`, `repe.get_environment_snapshot`, or similar appear IN THE CONVERSATION BODY, mark as FAIL "Bug 0 still present". The right sidebar trace panel showing tool names is EXPECTED and is not Bug 0.
- Verify: Response should contain fund names and relevant data

**Test 4: Deal Radar (Pipeline)**
- From the left nav, scroll to find "Pipeline" under the ACQUISITIONS section
- Click "Pipeline" — page loads at `/lab/env/{envId}/re/pipeline`
- Wait 3 seconds
- Take screenshot
- Verify:
  - "Deal Radar" heading with deal count and pipeline value
  - Radar chart renders with sector labels (Multifamily, Industrial, Retail, Office, etc.)
  - Deal nodes visible on the radar
  - Stage Counts panel shows deal stages (Sourced, Screening, LOI, Due Diligence, etc.)

## Step 4: Novendor Site Check

Use WebFetch on https://novendor.ai:
- Check current state: Is it still a placeholder, or has it been updated to a full site?
- Note: As of 2026-03-21, novendor.ai is a full marketing site with "Put AI to Work" hero, service offerings, and industry pages. Flag if it has regressed to a placeholder.

## Step 5: Generate Report

Save to: `/Users/paulmalmquist/Documents/Claude/Consulting_app/docs/ops-reports/deploy/[YYYY-MM-DD].md`

```markdown
# Deploy Smoke Test — [DATE] 10:30 AM

## Deploy Activity
| Project | Deploys (last 12h) | Latest Status | Commit |
|---|---|---|---|
| [name] | [count] | READY/ERROR | [message if available] |

## Smoke Test Results

| Test | Status | Method | Notes |
|---|---|---|---|
| Home page | ✅/❌ | Browser | |
| Admin login | ✅/❌ | Browser | |
| Control Tower | ✅/❌ | Browser | Environments count, AI Gateway status |
| Lab environments | ✅/❌ | Browser | Environment count, all HEALTHY? |
| Fund portfolio | ✅/❌ | Browser | Dollar formatting correct? Fund count? |
| AI chat response | ✅/❌ | Browser | Response time, tool count, token count |
| AI chat — Bug 0 | ✅/❌ | Browser | Tool spam in conversation body? Y/N |
| Deal Radar | ✅/❌ | Browser | Deal count, pipeline value, radar renders? |
| novendor.ai | ✅/❌ | WebFetch | Full site or placeholder? |

## Issues Found
[Any failures with details — what broke, what it looks like, what likely caused it]

## Verdict: ✅ SAFE TO DEMO / ⚠️ ISSUES FOUND / ❌ BROKEN
```

## Step 6: Alert on Failures

If any smoke test fails:
- Create Gmail draft to paulmalmquist@gmail.com
- Subject: `⚠️ Deploy Smoke: [test name] failed — [DATE]`
- Body: What failed, screenshot description, likely cause

If all tests pass but build is broken:
- Create Gmail draft noting build is broken but production is stable
- Include the specific error and suggested fix

## Constraints
- Total runtime should be under 5 minutes — this is a quick confidence check, not a deep audit
- If login fails, still test all unauthenticated pages and note login as FAILED
- The AI chat test is the most important — Bug 0 (tool spam) should be specifically checked
- If Winston chat shows raw tool names like `repe.get_asset` IN THE CONVERSATION BODY (not the trace sidebar), mark it as FAIL and note "Bug 0 still present"
- The right-side trace panel showing tool names, elapsed time, lane, and token count is EXPECTED behavior — this is not Bug 0

## Navigation Reference (discovered 2026-03-21)

These are the confirmed working paths through the app:

```
Home page:           https://paulmalmquist.com
Admin login flow:    Home → "Login as Admin" → /login?loginType=admin → enter code → /admin
Control Tower:       /admin
Lab environments:    /lab/environments
REPE environment:    /lab/env/{envId}/re  (click Meridian Capital Management from environments)
Winston chat:        /lab/env/{envId}/re/winston  (left nav → AUTOMATION → Winston)
Deal Radar:          /lab/env/{envId}/re/pipeline  (left nav → ACQUISITIONS → Pipeline)
```

Left nav structure within REPE environment:
```
PORTFOLIO: Funds, Investments, Assets, Development
INVESTOR OPERATIONS: Investors, Capital Call Ops, Distribution Ops, Fees, IR Review
FUND ACCOUNTING: Period Close, Variance
ANALYTICS: Models, Dashboards, Saved Analyses, Reports, Sustainability
ACQUISITIONS: Pipeline (Deal Radar)
GOVERNANCE: Documents, Approvals, AI Audit
AUTOMATION: Winston (AI Chat)
CREATE: Fund, Investment, Asset
```
