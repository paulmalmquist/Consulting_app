# Novendor Launch Blockers — Root Cause Report

## Date: 2026-03-30

## Issue: SCHEMA_NOT_MIGRATED

### Symptom
The Novendor consulting environment returns `SCHEMA_NOT_MIGRATED` (HTTP 503) when loading leads, loops, or any CRO-dependent view. The command center shows empty metrics and no pipeline data.

### Root Cause
The error is **reactive, not proactive**. The frontend BOS API routes (`/bos/api/consulting/leads/route.ts`, `/bos/api/consulting/loops/route.ts`) catch PostgreSQL errors containing "does not exist" or "relation" and translate them into a `SCHEMA_NOT_MIGRATED` response. There is no upfront schema validation — the system only discovers missing tables when queries fail.

The underlying cause is that one or more required migration files have not been applied to the Supabase database.

### Schema Dependency Chain

```
260_crm_native.sql           → crm_account, crm_contact, crm_pipeline_stage,
                                crm_opportunity, crm_opportunity_stage_history, crm_activity

280_consulting_revenue_os.sql → cro_lead_profile, cro_contact_profile, cro_outreach_template,
                                cro_outreach_log, cro_proposal, cro_client, cro_engagement,
                                cro_revenue_schedule, cro_revenue_metrics_snapshot

281_strategic_outreach_engine.sql → cro_strategic_lead, cro_lead_hypothesis,
                                    cro_strategic_contact, cro_outreach_sequence,
                                    cro_trigger_signal, cro_diagnostic_session, cro_deliverable

302_consulting_loop_intelligence.sql → nv_loop, nv_loop_role, nv_loop_intervention

311_crm_next_actions.sql → cro_next_action

431_consulting_proof_assets_objections.sql → cro_proof_asset, cro_objection, cro_demo_readiness
```

**Total: 29 tables across 6 migrations**

### How to Verify

**Health check endpoint**: `GET /bos/api/consulting/health`

Returns:
- `schema_ready`: boolean — true if all 29 tables exist
- `tables_missing`: list of missing table names
- `migrations_needed`: list of migration files to apply
- `seed_status`: row counts for key tables
- `has_data`: boolean — true if seed data exists

### How to Fix

1. Apply all migrations in order via `node repo-b/db/schema/apply.js` or the Supabase MCP `execute_sql` tool
2. Seed the environment via `POST /api/consulting/strategic-outreach/seed` (backend) or the Python `cro_seed.seed_consulting_environment()` function
3. Verify via the health check endpoint

### Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `SCHEMA_NOT_MIGRATED` | Required tables missing | Apply migrations |
| `CONFIG_ERROR` | `DATABASE_URL` not set | Check environment variables |
| `CONTEXT_TIMEOUT` | Environment resolution timed out | Check Supabase connectivity |
| `INTERNAL_ERROR` | Unexpected query failure | Check server logs |

### Additional Blockers Identified

1. **Empty pipeline**: Zero opportunities, zero outreach touches — seed data was generic demo data, now replaced with real signal-sourced targets
2. **Split identity**: Command center mixed "Local AI Classes CRM" with revenue execution — now focused solely on revenue ops
3. **Missing tables**: No proof asset, objection, or demo readiness tracking — migration 431 adds these
4. **Nav bloat**: 15 nav items diluted focus — reduced to 10 focused items
5. **No health check**: Schema validation was purely reactive — proactive health endpoint now exists
