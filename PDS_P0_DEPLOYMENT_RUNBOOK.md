# PDS P0 Fixes — Deployment Runbook

**Date:** March 16, 2026
**Scope:** All P0 fixes from the Executive Gap Analysis

---

## Changes Made

### 1. Error Boundary (NEW FILE)
**File:** `repo-b/src/app/lab/env/[envId]/pds/error.tsx`
- Next.js error boundary for all PDS routes
- Catches client-side crashes, shows friendly UI with retry + back buttons
- Special message for `pds_pipeline_deals` errors
- Eliminates the 6 black-screen crash pages

### 2. KPI Card Label Visibility (CSS FIX)
**File:** `repo-b/src/components/pds-enterprise/PdsMetricStrip.tsx`
- Changed `text-current/75` → `text-white/80 font-medium` for labels
- Changed `text-current/70` → `text-white/65` for comparison text
- Added explicit `text-white` to metric values
- Labels and values are now visible on all card tones

### 3. AI Query Date Serialization (BUG FIX)
**Files:**
- `backend/app/routes/pds_chat.py` — Added `_json_default()` and `_safe_dumps()` to handle `date`, `datetime`, and `Decimal` in SSE stream
- `backend/app/routes/pds_query.py` — Inline date/Decimal conversion in results dict comprehension

### 4. Pipeline Deals Graceful Degradation (BUG FIX)
**File:** `backend/app/services/pds_enterprise.py`
- Wrapped `pds_pipeline_deals` seed block in try/catch — skips gracefully if table doesn't exist
- Wrapped `get_pipeline_summary()` query in try/catch — returns empty pipeline instead of crashing
- This eliminates the SQL error banner on 12+ pages

### 5. Analytics Auto-Seed Integration (ENHANCEMENT)
**File:** `backend/app/services/pds_enterprise.py`
- `ensure_enterprise_workspace()` now auto-detects empty analytics tables and runs `seed_pds_analytics()` automatically
- No manual seed step needed — analytics data populates on first visit

### 6. Seeder Idempotency (ENHANCEMENT)
**File:** `backend/app/services/pds_analytics_seed.py`
- Added idempotency check at top of `seed_pds_analytics()` — returns `{"status": "already_seeded"}` if employees exist
- Safe to call multiple times without duplicating data

---

## Deployment Steps

### Step 1: Apply Schema Migrations
The schema files already exist but need to be applied to the production Supabase database.

```bash
cd repo-b
NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/apply.js
```

Or dry-run first:
```bash
cd repo-b
node db/schema/apply.js --dry-run
```

This applies all numbered SQL files including:
- `331_pds_enterprise_os.sql` — Creates `pds_pipeline_deals` and 30+ other tables
- `370_pds_analytics_schema.sql` — Creates analytics tables (employees, projects, revenue, timecards, NPS, tech adoption)
- `371_pds_analytics_indexes.sql` — Performance indexes
- `372_pds_analytics_views.sql` — Analytics views (utilization, revenue variance, account health, NPS summary)

### Step 2: Deploy Backend
Restart the FastAPI backend to pick up:
- Date serialization fixes
- Pipeline deals graceful degradation
- Analytics auto-seed integration

### Step 3: Deploy Frontend
Build and deploy the Next.js app to pick up:
- Error boundary
- KPI card CSS fix

### Step 4: Seed Analytics Data (Automatic)
The analytics seed now runs automatically on first page visit. Or trigger manually:

```bash
curl -X POST "https://your-api.com/api/pds/v2/seed-analytics?env_id=YOUR_ENV_ID"
```

### Step 5: Verify
1. Visit Command Center — should load without SQL error
2. Visit Accounts — KPI card labels should be visible
3. Visit Revenue — should show error boundary (not black screen) until dashboard is implemented
4. Try AI Query — should return results with proper date formatting

---

## Expected Impact

| Before | After |
|--------|-------|
| 12 pages show SQL error banner | 12 pages load clean (data populates progressively) |
| 6 pages crash to black screen | 6 pages show friendly error with retry button |
| KPI numbers unreadable | Labels, values, and comparisons all visible |
| AI Query fails at last step | AI Query returns results with charts |
| Analytics tables empty | 65 accounts, 250 employees, ~200 projects, ~30K timecards auto-seeded |
