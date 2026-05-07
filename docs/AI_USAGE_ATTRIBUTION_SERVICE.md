# AI Usage Attribution Service

A productized version of the cost ledger. The triaged-execution skill ledger is
a developer-side tool. This service is the substrate clients see.

## What Anthropic gives you natively

Anthropic's Console (console.anthropic.com) and the Claude API both expose
usage data, but at a different grain than enterprises actually need.

What's there:

- **Workspace billing**: total spend rolled up by month, by API key, by model.
- **Per-key usage**: input/output tokens per API key over a date range.
- **Rate limit telemetry**: how close each key is to its limits.
- **Per-call usage in API responses**: every API response includes `usage`
  with input_tokens, output_tokens, cache_read_input_tokens, and (for
  extended thinking) thinking-eligible counters.

What's NOT there:

- **Per-business-unit attribution**. A 300-person company running multiple
  divisions all see one bucket of spend.
- **Per-user attribution**. Same key used by 50 employees? Console can't
  separate them.
- **Per-skill / per-workflow attribution**. The Console doesn't know what
  business workflow a call belonged to.
- **Per-decision audit trail**. Which decisions were AI-assisted? Which
  outputs were trusted? No record.
- **Live waste detection**. The Console reports cost but doesn't say "this
  prompt prefix has been called 200 times uncached, you're paying full
  price every time."
- **Recommendations**. Console is descriptive; a governance product needs
  to be prescriptive.
- **Cross-tool aggregation**. Claude Code, Cowork, and direct API calls
  all show up as separate keys (or worse, one key) without the context
  that ties them together.

That gap is the service.

## What we build

Three layers on top of Anthropic's data.

### Layer 1: Attribution

Every AI call gets logged with the dimensions Anthropic doesn't capture:

- `user_email`: the human who triggered it
- `business_unit`: which division (HallBoys: plumbing, GC, equipment, marketing)
- `source`: cowork / cli / api / app / batch
- `skill`: which skill was invoked (if any)
- `workflow`: free-text tag (vendor_scorecard, ap_review, quote_compare)
- `plan_slug` / `plan_step`: triaged-execution context if applicable
- `decision_ref`: optional pointer to the decision this call informed
- token + cost + duration as Anthropic reports them

The customer's clients (Claude Code wrappers, internal apps, the cost ledger)
POST these to `/api/ai-usage/v1/events`. We store them in `nv_ai_usage_event`
under tenant-isolated RLS.

### Layer 2: Reporting

Roll-ups the customer can actually act on:

- Spend by business unit, by user, by skill, by source.
- 30-day timeline so anomalies are visible.
- Top skills by cost — surfaces hot paths.
- Open recommendations sorted by est savings.

Surfaced at `/lab/env/[envId]/ai-usage`.

### Layer 3: Recommendations

Rules that scan events and produce prescriptive recs. Initial set:

| Rule | Detects | Typical fix |
|------|---------|-------------|
| `opus_overspend` | Opus on workflows with avg <5k tokens | Route to Sonnet (~80% savings) |
| `uncached_repeat_prompt` | Skill called 50+ times in 7d, mostly uncached | Restructure prefix to be cacheable (~45% savings) |
| `high_thinking_no_payoff` | Thinking >4k on workflows with output <1500 tokens | Drop thinking budget (~30% savings) |
| `unattributed_traffic` | 100+ calls in 30d with no user_email or business_unit | Tag clients properly (informational) |

Each rec has est_monthly_savings_cents, confidence_pct, and a markdown body
with the suggested action. Customer can mark `applied` or `dismissed` (with reason).

## Service tiers (proposal back-fit)

This service maps cleanly onto the Phase 2 / Phase 3 pricing in the HallBoys
proposal:

| Phase | Service action |
|-------|----------------|
| Phase 1 Diagnostic | Inventory existing AI tooling. Estimate event volume. Recommend instrumentation plan. |
| Phase 2 Governed Pilot | Stand up the schema + ingestion endpoint. Wire 1–2 workflows for live attribution. Train one IT-team member on the dashboard. |
| Phase 3 Ongoing Oversight | Monthly review of recommendations. Token + spend reporting per business unit. New tool / model release evaluation. |

## Architecture summary

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Customer's tenancy                               │
│                                                                        │
│  Claude Code         Cowork           Internal apps     Batch jobs    │
│      │                  │                   │                │        │
│      └──────────┬───────┴────────┬──────────┴────────┬──────┘        │
│                 │                │                    │                │
│                 ▼                ▼                    ▼                │
│        POST /api/ai-usage/v1/events  (tagged with user/BU/skill/etc)  │
│                                  │                                     │
│  ┌───────────────────────────────▼────────────────────────────────┐   │
│  │              FastAPI: backend/app/routes/ai_usage.py            │   │
│  │   - ingest event / batch                                        │   │
│  │   - serve summary / timeline / by-skill / recommendations       │   │
│  └───────────────────────────────┬────────────────────────────────┘   │
│                                  │                                     │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Postgres: nv_ai_usage_event + nv_ai_recommendation              │ │
│  │  RLS tenant-isolated by env_id (per Database Guardrails)         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                  │                                     │
│      ┌───────────────────────────┴──────────────────────────────┐     │
│      ▼                                                          ▼     │
│  Recommendation rules                                  Dashboard       │
│  (cron / scheduled task)                  /lab/env/[envId]/ai-usage    │
│  ai_usage_rules.py                                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Files in this build

| File | Purpose |
|------|---------|
| `repo-b/db/schema/609_nv_ai_usage_attribution.sql` | Schema migration. Tables, indexes, RLS policies, two views. |
| `backend/app/routes/ai_usage.py` | FastAPI endpoints: ingest events, serve summary/timeline/by-skill/recommendations, mark applied/dismissed. |
| `backend/app/services/ai_usage_rules.py` | Rule engine. Four starter rules. Idempotent upsert into `nv_ai_recommendation`. |
| `repo-b/src/app/lab/env/[envId]/ai-usage/page.tsx` | Next.js page route. |
| `repo-b/src/components/ai-usage/AiUsageDashboard.tsx` | Dashboard UI: KPIs, recommendations, by-model, by-BU, top skills. |
| `scripts/pending/ai_usage_deploy.ps1` | Deploy plan. Applies migration, registers route, pushes Railway, pushes Vercel, smoke-tests live endpoint. Dry-run by default. |

## How to deploy

From your repo root, with all CLIs auth'd (run `.\scripts\check_clis.ps1` first if uncertain):

```powershell
# Dry run first — see what each step would do
.\scripts\host_runner.ps1 -Script .\scripts\pending\ai_usage_deploy.ps1

# Live deploy
.\scripts\host_runner.ps1 -Script .\scripts\pending\ai_usage_deploy.ps1 -Arguments "-Apply"
```

The deploy script will:
1. Verify all required files exist and all CLIs are on PATH.
2. Apply the migration to production Supabase via `supabase db query --linked`.
3. Print the exact two lines you need to add to `backend/app/main.py` to register the new router. (Auto-edit deliberately not done for safety.)
4. Push the backend to Railway via `railway up --service authentic-sparkle` from `backend/`.
5. Push the frontend to Vercel via `vercel deploy --prod`.
6. Smoke-test `/api/ai-usage/v1/summary` against the live URL.

After step 3 you re-run the deploy script and it picks up where it left off.

## First-time wiring (per client)

Once the service is live, three small wires complete the loop:

1. **Update `cost_ledger.py`** to also POST events to `/api/ai-usage/v1/events`
   so triaged-execution runs feed the dashboard automatically.
2. **Schedule the rules** to run every 15 minutes via a Python cron task or
   the existing scheduled-tasks system.
3. **Wrap any in-house Claude code path** so each invocation POSTs an event
   with the right `user_email` and `business_unit`. A 5-line helper is enough.

After those three are in place, every AI call across Cowork, Claude Code, and
custom apps lands in the same dashboard with full attribution. Zero clients
need to be reinstalled. Zero CLIs need to be re-authed. The dashboard updates
in near-real-time as events come in.
