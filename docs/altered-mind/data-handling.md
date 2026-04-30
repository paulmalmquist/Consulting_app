# Altered Mind — Data Handling

## What this environment is

A personal-practice business tracker for a therapy practice. Tracks weekly check-ins, referral pipeline, capacity utilization, and monthly qualitative reflections. It is **business operations data** (revenue, session counts, platform sources), not a clinical system.

## Current status

**Business-ops ready. PHI-adjacent. Not HIPAA-certified.**

RLS is enabled and env-scoped. The data contains aggregate session metrics and referral notes — it may drift toward PHI if reflection or notes fields are used to log client-identifiable information. That boundary has not been crossed yet, but must be actively maintained.

## System identifiers

| Item | Value |
|---|---|
| env_id | `bf5c5b10-9a17-4fe7-9f5b-e7de9a380122` |
| business_id | `50d028ab-45b4-402c-957f-a652dfcca621` |
| Supabase project | `ozboonlsplroialdwuxj` |
| Access | Paul only (owner membership) |
| Auth mode | private |

## Database tables (Supabase `public` schema)

| Table | RLS | Content |
|---|---|---|
| `am_daily_checkin` | enabled | Session counts, revenue, topic breakdowns per working day |
| `am_weekly_summary` | enabled | Aggregated weekly capacity, revenue, referrals |
| `am_referral` | enabled | Referral intake log — platform, source, conversion status, notes |
| `am_monthly_reflection` | enabled | Monthly qualitative narrative (theme, wins, challenges, adjustment) |

All tables use `env_id = current_setting('app.env_id', true)` for row-level isolation.

## Source data

The Excel workbook (`Altered Mind Weekly Business Check In.xlsx`) lives at:

```
data/altered-mind/checkin.xlsx
```

This path is gitignored. The workbook is never committed. Do not upload it to any shared storage, paste into prompts, or include in screenshots without reviewing for client-identifiable content first.

## Ingestion

```bash
# dry run first
python scripts/ingest_altered_mind.py \
  --file "data/altered-mind/checkin.xlsx" \
  --env-id bf5c5b10-9a17-4fe7-9f5b-e7de9a380122 \
  --business-id 50d028ab-45b4-402c-957f-a652dfcca621 \
  --dry-run

# live run (requires DATABASE_URL in backend/.env)
python scripts/ingest_altered_mind.py \
  --file "data/altered-mind/checkin.xlsx" \
  --env-id bf5c5b10-9a17-4fe7-9f5b-e7de9a380122 \
  --business-id 50d028ab-45b4-402c-957f-a652dfcca621
```

The script logs aggregate counts and summary metrics only. It never logs individual row contents, client notes, or reflection text.

## PHI guardrails

**Do not:**
- Log or print raw notes, reflection text, or referral source names into console output, tickets, or prompts
- Upload the workbook to any service without reviewing for client-identifiable content
- Add free-text client name fields to any `am_*` table without a BAA and reviewed data-handling workflow in place
- Screenshot the dashboard in a context where reflection narrative is visible, then share it publicly

**The `notes` and reflection fields** (`wins`, `challenges`, `adjustment`, `notes` on referrals and daily check-ins) may contain narrative text written during the workweek. Treat these as potentially sensitive. Review before including in any artifact.

## Honest current position

| Control | Status |
|---|---|
| Row-level isolation (RLS) | ✓ in place |
| Env-scoped access | ✓ Paul only |
| Aggregate-only logging | ✓ ingest script |
| Workbook gitignored | ✓ |
| BAA with any vendor | ✗ not in place |
| Formal HIPAA assessment | ✗ not performed |
| Client-identifiable data in any field | ✗ not present today |

The dashboard is appropriate for tracking practice business metrics. It is not appropriate for storing identifiable patient information until a BAA is in place and data-handling has been formally reviewed.
