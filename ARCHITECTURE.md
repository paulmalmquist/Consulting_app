# Winston Architecture Guardrails

This file is the durable architecture contract for autonomous coding sessions in this repo.
If a task needs to break one of these rules, the session must document why before changing code or schema.

## Table Naming And Module Boundaries

Approved durable prefixes for new public tables:

- `re_`
- `repe_`
- `pds_`
- `fin_`
- `acct_`
- `cre_`
- `ai_`
- `crm_`
- `cro_`
- `sus_`
- `nv_`
- `cc_`
- `cp_`
- `dc_`
- `legal_`
- `dim_`
- `fact_`
- `stg_`

Experimental or frozen prefixes. Do not expand these without an explicit architecture review:

- `psychrag_`
- `medoffice_`
- `resume_`
- `epi_`
- `trading_`
- `msa_`

No new table prefix may be introduced until this file is updated first.

## RLS Policy Template

Every new tenant-scoped table must enable row-level security in the same migration that creates it.
Minimum required baseline:

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table_name>
  USING (env_id = current_setting('app.env_id', true));
```

Operational guidance:

- Prefer adding `WITH CHECK (env_id = current_setting('app.env_id', true))` for write-safe policies.
- If a table does not have `env_id`, the migration must document why tenant isolation is not required.
- Application code must set `SET app.env_id = '<tenant_id>'` before querying env-scoped tables.

## Migration Naming

All new schema files in [`repo-b/db/schema/`](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/repo-b/db/schema) must use:

`NNN_module_description.sql`

Before creating a migration, check the current highest applied number with:

```sql
SELECT MAX(CAST(SPLIT_PART(name, '_', 1) AS INTEGER))
FROM supabase_migrations.schema_migrations
WHERE name ~ '^\d+_';
```

Working convention for the current cleanup pass:

- Reserve `500+` for the 2026-03-29 tech debt remediation series.
- Do not create descriptive-only names like `cre_data_quality.sql` or mixed patterns like `credit_object_model_275.sql`.
- Do not reuse sequence numbers, even if an older file was superseded.

## Multi-Tenant Pattern

Every user-facing table should include:

```sql
env_id TEXT NOT NULL,
business_id UUID NOT NULL
```

Rules:

- `env_id` scopes records to a specific environment or tenant workspace.
- `business_id` ties the record to the owning business contract and API authorization path.
- New tables that power user-visible workflows should include both columns unless they are shared dimensions or reference data.

Shared dimensions and reference tables currently exempt by design:

- `dim_date`
- `dim_currency`
- `dim_geography`
- `cre_geography_alias`
- `cre_source_registry`
- `cre_metric_catalog`
- `cre_feature_set_catalog`
- `cre_model_catalog`
- `cre_forecast_question_template`
- `module`
- `module_dependency`
- `object_type`

If a new shared reference table is introduced, add it to this exemption list in the same PR.

## Session Guardrails

Autonomous coding sessions must follow these database rules:

1. Every `CREATE TABLE` must be paired with RLS enablement and a tenant-isolation policy.
2. Every new user-facing table must include `env_id` and `business_id` unless this file explicitly exempts it.
3. Before creating a table, check whether a similar table already exists.
4. Only use the approved prefixes listed above.
5. New indexes require a named query path or workload justification.
6. Add `COMMENT ON TABLE` for every new table explaining its purpose and owning module.
