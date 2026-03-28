---
id: meta-prompt-friday-night-session
kind: prompt
status: active
source_of_truth: false
topic: mega-session-2026-03-27
owners:
  - repo-b
  - backend
intent_tags:
  - build
  - bug-fix
  - crm
  - demo-readiness
  - ai-gateway
triggers: []
entrypoint: true
handoff_to:
  - winston-chat-workspace
  - feature-dev
  - ai-copilot
when_to_use: "Friday night coding session — covers all unaddressed bugs, CRM gaps, demo friction, and high-impact enhancements across the entire repo."
when_not_to_use: "After all items here are resolved."
---

# MEGA META PROMPT — Friday Night Coding Session (2026-03-27)

## For a coding agent. Read this in full before touching any file.

> **Context:** Two CRM commits just landed (8ea1f89, 6dd7ccf — Phases 1-7 of CRM transformation).
> Migration 311 applied to production Supabase. Vercel frontend READY. Railway backend live.
> This session addresses ALL remaining unbuilt items, bugs, and enhancements across the repo.
> Priority order: P0 blockers → Demo friction → CRM completion → Feature enhancements.

---

## Repository Rules

| Rule | Detail |
|---|---|
| 3 runtimes | `repo-b/` (Next.js 14 App Router), `backend/` (FastAPI + psycopg), `repo-c/` (Demo Lab) |
| Pattern A | `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/` |
| Pattern B | Direct fetch `/api/re/v2/*` → Next route handler → Postgres (NO FastAPI) |
| Chat gateway | POST `/bos/api/ai/gateway/ask` → `backend/app/routes/ai_gateway.py` |
| Tests after every change | `make test-frontend` and `make test-backend` |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 | All raw SQL strings |
| All Pydantic models | `extra = "ignore"`, never `extra = "forbid"` |
| Supabase project ID | `ozboonlsplroialdwuxj` |
| Novendor env_id | `62cfd59c-a171-4224-ad1e-fffc35bd1ef4` |

---

## Pre-Session: Read Intelligence First

1. `docs/LATEST.md` — situational awareness
2. `docs/CAPABILITY_INVENTORY.md` — never rebuild what exists
3. `docs/revenue-ops/demo-friction-log.md` — know what's broken in demos
4. `docs/revenue-ops/product-backlog-feed.md` — revenue-ranked backlog

---

## PHASE 1: P0 BLOCKERS (Do These First)

### 1A. Fix Lane A Narration-Only Regression
**Priority:** P0 — blocks 40% of REPE demo impact
**Evidence:** AI test 33% pass rate; narration-only responses return no data
**Location:** `backend/app/services/ai_gateway.py`, `backend/app/services/request_router.py`
**Reference:** `META_PROMPT_LANE_A_DATA_RENDERING.md` (320 lines of diagnosis)

**Root cause hypotheses (investigate in order):**
1. Lane A system prompt makes model believe it has tools when it doesn't
2. Token loop breaks early before data section is emitted
3. Tool hallucination — model outputs tool-call-like text instead of data
4. Missing page context from `contextSnapshot` not passed through
5. SSE event ordering drops data events

**Fix strategy:**
- Confirm the system prompt for Lane A does NOT reference tools
- Verify `repe_fast_path` SQL generation actually reaches production (Railway deploy)
- If SQL gen works: ensure results are formatted into response text, not tool calls
- If SQL gen doesn't reach production: investigate Railway deploy status

**Acceptance:** Simple query like "show me all funds" returns rendered data, not narration-only text.

---

### 1B. Fix Bug 0: Raw Tool Call Spam in AI Chat UI
**Priority:** P0 — visible to every demo user
**Evidence:** Users see raw MCP tool names, retry attempts, validation errors
**Location:** `repo-b/src/components/winston/`, `backend/app/services/run_narrator.py` (CREATE)
**Reference:** `META_PROMPT_CHAT_WORKSPACE.md` (full RunNarrator spec)

**Required implementation:**
1. Create `TOOL_STEP_MAP` in `repo-b/src/lib/winston/stepMap.ts` (maps tool names to human labels)
2. Create `RunNarrator` class in `backend/app/services/run_narrator.py`
3. Wire narrator into `ai_gateway.py` SSE stream
4. Frontend: parse `tool_activity` events, render as clean step indicators
5. Dedup rules: same tool = one step; retries invisible; single clean error on final failure

**Acceptance:** No raw tool names, UUIDs, or validation errors visible in chat UI. Users see: "Fetching assets → Loading fund data → Done"

---

### 1C. Confirm/Fix Railway Backend Deployment
**Priority:** P0 — SQL generation fix may not have reached production
**Evidence:** 0 tokens consumed on 2026-03-24 health check
**Action:**
1. Check Railway deploy status for latest commits
2. If not deployed: trigger new deploy
3. Verify `/health` endpoint returns ok
4. Test one SQL generation query against production

---

## PHASE 2: DEMO FRICTION ELIMINATION

### 2A. Meridian Capital — IGF VII TVPI/IRR Contradiction
**Priority:** P0 — visible contradiction on same page
**Symptom:** IGF VII shows TVPI 0.21x / IRR -98.9% in one view but AI summary says 2.59x / 87.2%
**Root cause:** TVPI/IRR calculation excludes unrealized NAV
**Fix:** Include unrealized NAV in TVPI calculation: `(distributions + nav) / paid_in`
**Files:** `repo-b/src/app/api/re/v2/` fund metrics routes, or `backend/app/services/repe_fund_metrics.py`

### 2B. Meridian Capital — Paid-In Exceeds Committed
**Priority:** P1 — impossible for closed-end PE funds
**Symptom:** Both equity funds show paid-in > committed capital
**Root cause:** Likely double-counting or seed data error
**Fix:** Audit `pa_capital_call` and `pa_fund_commitment` tables; fix calculation or seed data

### 2C. Meridian Capital — Portfolio NAV Mismatch
**Priority:** P1 — header contradicts detail
**Symptom:** Portfolio NAV ($2.1B) doesn't match sum of fund remaining values (~$58.6M)
**Fix:** Align NAV aggregation between portfolio list and fund detail views

### 2D. Meridian Capital — Apply Migration 425 (Investment Backfill)
**Priority:** P2 — investment records show "No type / No market / No valuation / Pending"
**File:** `repo-b/db/schema/425_meridian_investment_backfill.sql` (210 lines, already written)
**Action:** Apply this migration to production Supabase

### 2E. Meridian Capital — Seed Distribution Payout Rows
**Priority:** P2 — distribution events show "0 payout rows"
**Fix:** Seed payout rows for paid distribution events, OR fix the fallback in `reFinanceOperations.ts:1526-1528`

### 2F. Meridian Capital — Push Unpushed Commit
**Priority:** P1 — asset display fix (commit 9574069e) stuck behind git lock
**Action:** Clean git lock files (`rm -f .git/packed-refs.lock .git/refs/remotes/origin/auto/*.lock`), then push

### 2G. Stone PDS — Seed Missing Data
**Priority:** P2 — multiple empty states hurt credibility
**Items to seed:**
- `pds_client_satisfaction_snapshot` data (client risk scores all 0.0)
- Pipeline deals (empty state)
- Utilization and timecard data (empty states)
- Business line performance snapshot (0 rows)

---

## PHASE 3: CRM TRANSFORMATION COMPLETION

### 3A. Map Visualization for Leads/Accounts
**Priority:** MEDIUM — from original CRM directive
**Spec:** Interactive map showing lead/account locations with score-based markers
**Implementation:** Use Leaflet or similar in `repo-b/src/app/lab/env/[envId]/consulting/accounts/page.tsx`
**Data:** Accounts already have city/state from `crm_account`; geocode or use approximate MSA coordinates

### 3B. Outreach Sequence Builder
**Priority:** MEDIUM — from original CRM directive
**Spec:** Multi-step outreach sequences (not just single touches)
**Existing:** `cro_outreach_log` tracks individual touches; `cro_outreach_template` has templates
**Gap:** No sequence orchestration (step 1 → wait 3 days → step 2 → wait 5 days → step 3)
**Implementation:**
1. New `cro_outreach_sequence` table: sequence_id, template_id, step_order, delay_days, status
2. Service to advance sequences based on time and response status
3. Frontend: sequence builder UI in Strategic Outreach page

### 3C. Pipeline Kanban Drag-and-Drop Stage Advancement
**Priority:** LOW — nice-to-have polish
**Current:** Pipeline kanban shows cards but no drag-to-advance
**Implementation:** Add DnD via @dnd-kit or similar; call `advanceOpportunityStage()` on drop

### 3D. CRM Lead Scoring Breakdown Display
**Priority:** MEDIUM — scoring breakdown is stored but not shown
**Current:** `cro_lead_profile.score_breakdown` jsonb column is populated
**Gap:** No UI displays the breakdown factors (ai_maturity, pain_category, company_size, budget, source_quality)
**Implementation:** Add score breakdown visualization to Account Detail page (bar chart or factor list)

### 3E. Deal Objects with Revenue Tracking
**Priority:** MEDIUM — from original CRM directive
**Current:** `crm_opportunity` exists but lacks deal-specific fields
**Gap:** Win/loss reason capture, deal velocity metrics, competitive info on deals
**Implementation:**
1. Add columns to opportunity: `loss_reason`, `competitive_incumbent`, `decision_timeline`, `deal_velocity_days`
2. Win/loss capture modal when advancing to closed_won or closed_lost
3. Deal velocity calculated from created_at to close date

---

## PHASE 4: HIGH-IMPACT FEATURE BUILDS

### 4A. AI Operations Diagnostic Questionnaire
**Priority:** HIGH — top revenue blocker; cited in 5 independent reports
**Revenue:** Enables Offer A ($7.5K AI Diagnostic)
**Spec:** 15-20 questions assessing AI readiness across 5 dimensions:
- Current AI usage and tooling
- Data infrastructure maturity
- Process automation level
- Team AI literacy
- Strategic alignment

**Implementation:**
1. New lab environment type: `diagnostic`
2. Questionnaire page with progress stepper
3. Scoring engine that maps answers to readiness score (0-100)
4. Output: generated report with scores, benchmarks, and recommended interventions
5. PDF export for client delivery

**Files:**
- `repo-b/src/app/lab/env/[envId]/diagnostic/` (new page tree)
- `backend/app/services/diagnostic_engine.py` (scoring + report generation)
- `repo-b/db/schema/312_diagnostic_questionnaire.sql` (responses table)

### 4B. Deal Quick Screen — 2-Minute AI Deal Assessment
**Priority:** HIGH — counters Dealpath AI Studio
**Reference:** `docs/feature-radar/2026-03-27.md` Idea 3
**Spec:** Drop a deal memo/OM/URL → get instant AI assessment with:
- Market comps, tenant quality, cap rate analysis
- Risk flags and mitigation strategies
- IRR projection under 3 scenarios
- Go/no-go recommendation with confidence score

**Implementation:**
1. New intake page accepting PDF upload, URL, or pasted text
2. Document extraction pipeline (existing `winston-document-pipeline` skill)
3. AI orchestration: extract → analyze → score → render
4. Output: structured deal scorecard as response blocks

### 4C. ILPA Q1 2026 LP Reporting Compliance
**Priority:** HIGH — strongest demand signal from target accounts
**Evidence:** Marcus Partners (score 4.25) triggered by ILPA compliance need
**Spec:** Verify existing LP reporting templates meet ILPA 2026 standards
**Implementation:**
- Audit existing LP report generation against ILPA template requirements
- Add any missing fields/calculations
- Build ILPA compliance badge/indicator on fund reporting pages

---

## PHASE 5: OPERATIONAL CLEANUP

### 5A. Clean Git Lock Files
```bash
rm -f .git/packed-refs.lock
rm -f .git/refs/remotes/origin/auto/*.lock
rm -f .git/index.lock
rm -f .git/refs/heads/main.lock
```

### 5B. Stale Scheduled Task Investigation
**6 intelligence feeds have stopped producing output:**
- Feature radar (3 days stale)
- Site improvements (5 days stale)
- Sales positioning (3 days stale)
- Meridian health (3 days stale)
- Nightly ops validator (never produced)
- Market intelligence (never produced)

**Action:** Check scheduled task configurations, verify they're running, check for auth/access failures.

### 5C. Update LATEST.md After Session
After all fixes, regenerate `docs/LATEST.md` with current status.

---

## EXECUTION ORDER (Recommended)

```
1. Phase 1A + 1B + 1C  (AI gateway fixes — parallel if possible)
2. Phase 2F            (push stuck commit, clean git)
3. Phase 2A + 2B + 2C  (Meridian demo data fixes)
4. Phase 2D + 2E       (Meridian migrations and seeding)
5. Phase 2G            (Stone PDS seeding)
6. Phase 3D + 3E       (CRM scoring display + deal objects)
7. Phase 4A            (Diagnostic questionnaire — highest revenue impact)
8. Phase 3A + 3B       (Map viz + outreach sequences)
9. Phase 4B + 4C       (Deal Quick Screen + ILPA compliance)
10. Phase 5            (Operational cleanup)
```

---

## SUCCESS CRITERIA

After this session, these statements should be true:
1. AI chat returns data (not narration-only) for "show me all funds"
2. No raw tool call spam visible in chat UI
3. Meridian Capital: TVPI/IRR consistent across all views
4. Meridian Capital: investment records show property type, market, valuation
5. Stone PDS: no empty states on demo-critical pages
6. CRM: lead score breakdown visible on Account Detail
7. CRM: closed deals capture win/loss reason
8. Pipeline kanban cards click through to opportunity detail (DONE ✓)
9. Contact detail shows outreach history (DONE ✓)
10. Command Center shows pipeline metrics + top leads (DONE ✓)

---

## FILES ALREADY MODIFIED TODAY (Don't Revert)

```
backend/app/routes/consulting.py        — 8 new entity detail routes
backend/app/services/cro_entity_detail.py — NEW: entity detail queries
backend/app/services/cro_leads.py       — score breakdown + stage update
backend/app/services/cro_next_actions.py — NEW: next action engine
backend/app/services/cro_pipeline.py    — 9-stage pipeline
backend/app/schemas/consulting.py       — 6 new Pydantic models
repo-b/src/lib/cro-api.ts              — 127 new lines (entity detail API client)
repo-b/src/lib/api.ts                  — [object Object] fix
repo-b/src/components/consulting/ActivityTimeline.tsx       — NEW
repo-b/src/components/consulting/NextActionPanel.tsx        — NEW
repo-b/src/components/consulting/ConsultingWorkspaceShell.tsx — nav reorg
repo-b/src/app/lab/env/[envId]/consulting/page.tsx         — CRO overview
repo-b/src/app/lab/env/[envId]/consulting/accounts/page.tsx — NEW
repo-b/src/app/lab/env/[envId]/consulting/accounts/[accountId]/page.tsx — rewired API
repo-b/src/app/lab/env/[envId]/consulting/contacts/[contactId]/page.tsx — NEW
repo-b/src/app/lab/env/[envId]/consulting/pipeline/[opportunityId]/page.tsx — NEW
repo-b/src/app/lab/env/[envId]/consulting/pipeline/page.tsx — linked cards
repo-b/db/schema/311_crm_next_actions.sql — APPLIED to production
```

---

## REFERENCE DOCUMENTS

| Doc | What it contains |
|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Bug 0 RunNarrator spec, 6 confirmed bugs, chat workspace build priorities |
| `META_PROMPT_LANE_A_DATA_RENDERING.md` | Lane A regression diagnosis with 5 hypotheses and code patches |
| `META_PROMPT_VISUAL_RESUME.md` | Resume lab environment spec (lower priority) |
| `docs/REVENUE_OPERATING_PROGRAM.md` | Revenue hypotheses, CRM pipeline governance rules, proof asset backlog |
| `docs/revenue-ops/demo-friction-log.md` | Every friction point observed in Meridian + Stone demos |
| `docs/revenue-ops/product-backlog-feed.md` | Revenue-ranked product backlog (PBF-01 through PBF-10) |
| `docs/feature-radar/2026-03-27.md` | 5 prioritized feature ideas with competitive intel |
| `docs/competitor-research/daily-summary/2026-03-27.md` | Latest competitor moves (Juniper Kudu, Dealpath Connect, Cherre Agent.STUDIO) |
