# Market Intelligence Environment Health Report
**Date:** 2026-03-22
**Checker:** fin-market-health (automated)
**Environment:** `c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9` (industry: `market_rotation`)
**Target Route:** `/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets`

---

## Summary

| Item | Status |
|------|--------|
| UI — `/markets` route exists | ❌ NOT BUILT |
| DB — market_segments (active) | ✅ 34 segments seeded |
| DB — market_segment_intel_brief | ❌ 0 briefs (table empty) |
| DB — trading_feature_cards | ❌ 0 cards (table empty) |
| DB — market_signals | ❌ 0 signals (table empty) |
| Chrome connectivity | ⚠️ Chrome extension not connected (observation only) |

**Overall Health: 🔴 NOT OPERATIONAL — Frontend not built, data pipeline not running**

---

## Step 1: Page Navigation Result

**Status: NOT BUILT**

The `/lab/env/[envId]/markets` route does not exist in the repo-b Next.js app. A search of the file system confirms the following:

- The route `repo-b/src/app/lab/env/[envId]/markets/` does **not** exist.
- The only `markets` path found is `repo-b/src/app/lab/env/[envId]/pds/markets/` — this is the PDS-specific markets view, not the Market Intelligence environment.
- There is no `lab_environments` table in Supabase (the table relation does not exist), confirming the Market Intelligence lab environment has not been provisioned in the DB either.

> **Primary Finding:** The Market Intelligence environment frontend has not been built by `fin-coding-session`. This is the critical blocker for all other checks.

---

## Step 2: Dashboard Section Status

Since the page does not exist, all sections are marked as **NOT BUILT**:

| Section | Expected | Status |
|---------|----------|--------|
| Regime Status | Macro regime classification display | ❌ Not built |
| Segment Grid | 34 segment cards by category | ❌ Not built |
| Intelligence Briefs | Recent per-segment AI briefs | ❌ Not built |
| Feature Card Pipeline | Trading feature cards with status counts | ❌ Not built |
| Charts / Visualizations | Regime + rotation charts | ❌ Not built |
| Cross-Vertical Alerts | REPE/credit linkage alerts | ❌ Not built |

---

## Step 3: Data Integrity — DB vs UI Comparison

### Supabase project: `ozboonlsplroialdwuxj`

#### market_segments
```sql
SELECT count(*) as segment_count FROM public.market_segments WHERE is_active = TRUE;
-- Result: 34
```

**By category:**

| Category | Count |
|----------|-------|
| equities | 16 |
| crypto | 8 |
| macro | 6 |
| derivatives | 4 |
| **Total** | **34** |

✅ All 34 expected segments are seeded and active. Schema is healthy.

**Note:** Segments were seeded today (2026-03-22). `last_rotated_at` is NULL for all segments — no rotation runs have executed yet. `rotation_priority_score` is 0.00 across the board — scoring engine has not run.

#### market_segment_intel_brief
```sql
SELECT count(*) FROM public.market_segment_intel_brief;
-- Result: 0 (table exists but is empty)
SELECT max(run_date) FROM public.market_segment_intel_brief;
-- Result: NULL
```

❌ No intelligence briefs have been generated. The scheduled brief-generation task has not run or has not been wired up yet.

#### trading_feature_cards
```sql
SELECT status, count(*) FROM public.trading_feature_cards GROUP BY status;
-- Result: (empty)
```

❌ No feature cards exist. The `trading_feature_cards` table is empty — no cards have been seeded or generated.

#### market_signals
```sql
SELECT count(*) FROM public.market_signals;
-- Result: 0
```

❌ No market signals. Signal ingestion pipeline has not run.

---

## Step 4: Bugs & Issues Found

### 🔴 Critical — P0

**[MKT-001] Market Intelligence frontend not built**
- Route `/lab/env/[envId]/markets` does not exist in repo-b
- No environment page, no dashboard, no components
- Blocks: all UI functionality

**[MKT-002] Lab environment not provisioned in DB**
- `lab_environments` table does not exist in Supabase
- env_id `c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9` not registered anywhere in the DB
- The market rotation industry template has no backing environment record

### 🟠 High — P1

**[MKT-003] Intelligence brief pipeline not running**
- `market_segment_intel_brief` table is empty
- 34 segments exist but none have ever been briefed
- The brief-generation scheduled task is either not created or not connected to the seeded segments

**[MKT-004] Trading feature cards empty**
- `trading_feature_cards` table has 0 rows
- No cards seeded, no pipeline populating cards
- The feature pipeline cannot display any status counts on the dashboard

**[MKT-005] Market signals not populating**
- `market_signals` table has 0 rows
- Signal ingestion from external data sources has not been wired up
- Rotation priority scoring (`rotation_priority_score = 0.00` for all segments) depends on this data

### 🟡 Medium — P2

**[MKT-006] Rotation engine has never fired**
- `last_rotated_at` is NULL for all 34 segments
- `rotation_priority_score` is 0.00 for all segments
- The rotation scheduling logic has not executed a single pass

---

## Step 5: Priority Items for fin-coding-session

Listed in priority order for tomorrow's planning:

### P0 — Build the frontend (blocking everything)

1. **Create `/lab/env/[envId]/markets/page.tsx`** — The Market Intelligence main dashboard page. Should follow the same pattern as `/pds/markets/page.tsx` but scoped to the market rotation industry template. Sections needed: Regime Status header, Segment Grid (4 categories × segment cards), Intelligence Briefs list, Feature Card Pipeline board, Cross-Vertical Alerts.

2. **Provision the lab environment in DB** — Either create a `lab_environments` table (or use the existing environment registry mechanism) and seed env `c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9` with `industry = 'market_rotation'`.

### P1 — Wire up the data pipeline

3. **Connect brief-generation task to market segments** — The `fin-market-rotation` or equivalent scheduled task should write rows to `market_segment_intel_brief`. Verify the scheduled task exists and has a working Supabase insert.

4. **Seed or generate initial trading_feature_cards** — At minimum, populate representative cards so the pipeline board is not empty on first load. Ideally wire up the feature card generator.

5. **Run initial rotation priority scoring** — Execute one pass of the rotation engine to populate `rotation_priority_score` and `last_rotated_at`. Even a dry-run with mock signals will unblock the segment grid's visual heat indicators.

### P2 — Signal ingestion

6. **Wire up market_signals ingestion** — The signal pipeline feeding `market_signals` must be created or connected. Without signals, the rotation engine has no inputs and cross-vertical alerts cannot fire.

---

## Environment Metadata

| Field | Value |
|-------|-------|
| Supabase project | ozboonlsplroialdwuxj |
| Market segments seeded | 34 (today 2026-03-22) |
| Segments by category | equities:16, crypto:8, macro:6, derivatives:4 |
| Intel briefs all-time | 0 |
| Trading feature cards | 0 |
| Market signals | 0 |
| Frontend route exists | No |
| Last rotation run | Never |
| Chrome UI check | Skipped (extension not connected) |

---

*Generated by fin-market-health · 2026-03-22*
