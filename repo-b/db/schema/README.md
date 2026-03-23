# Business OS Schema

## Philosophy

This schema implements a **vendor-neutral, append-only, tenant-isolated** data backbone for Business OS. Every table that holds business data carries `tenant_id` for row-level isolation. Computed facts are fully traceable to the dataset version, rule version, and computation run that produced them.

### Append-Only Model

The core object system uses **object + object_version** where:
- Objects are immutable identifiers
- Versions are append-only rows with `valid_from`/`valid_to` timestamps
- "Current state" is always derived (the version where `valid_to IS NULL`)
- `valid_to` is only set via a `SECURITY DEFINER` function that simultaneously closes the old version and opens a new one

### Traceability

Every computed fact (`fact_measurement`, `rent_roll_snapshot`, etc.) carries:
- `dataset_version_id` -- which snapshot of source data was used
- `rule_version_id` -- which version of the computation rules applied
- `run_id` -- which specific execution produced the value

Raw transactional records (journal entries, invoices, etc.) do not carry run lineage because they are human-entered, not computed.

### Module System

Tables are organized into **modules**:

| File | Module | Always-On? | Description |
|------|--------|-----------|-------------|
| `000_extensions.sql` | - | Yes | Postgres extensions |
| `010_backbone.sql` | backbone | Yes | Tenancy, identity, objects, lineage |
| `020_reporting.sql` | reporting | Yes | Dimensions, metrics, dashboards |
| `100_module_registry.sql` | - | Yes | Module catalog + business enablement |
| `200_accounting.sql` | accounting | No | GL, invoices, bills, payments |
| `210_projects.sql` | projects | No | Projects, WBS, timesheets, issues |
| `220_property.sql` | property | No | Properties, leases, rent rolls |
| `230_milestones.sql` | milestones | No | Milestone templates + instances |
| `900_rls.sql` | - | Yes | Row-level security policies |
| `950_indexes.sql` | - | Yes | Performance indexes |
| `990_views.sql` | - | Yes | Current-state convenience views |
| `999_seed.sql` | - | Yes | Seed data for modules + object types |

Modules are **always installed** (tables always exist). Enablement is controlled via `business_module` -- a business can only use features of modules it has enabled. This keeps the schema stable and avoids DDL at runtime.

### Naming Conventions

- **Tables**: `snake_case`, singular noun (e.g., `journal_entry`, not `journal_entries`)
- **Primary keys**: `<table>_id uuid DEFAULT gen_random_uuid()`
- **Tenant column**: `tenant_id uuid NOT NULL REFERENCES tenant(tenant_id)`
- **Timestamps**: `created_at timestamptz NOT NULL DEFAULT now()`
- **Money**: `numeric(18,2)` -- rates: `numeric(18,8)` -- quantities: `numeric(18,4)`
- **JSON payloads**: `jsonb`
- **Status fields**: `text` with `CHECK` constraints (not enums, for easier evolution)

### Schema Namespace

All tables live in `public` schema (Supabase default). The existing `app.*` schema from earlier migrations is preserved; these new tables are additive.

## Commands

```bash
# From repo-b/

# Dry-run: parse and print all statements without executing
npm run db:dry

# Apply schema to database
npm run db:apply

# Verify schema integrity after apply
npm run db:verify

# Run schema integration tests
npm run db:test
```

### Environment Variables

Set one of:
- `DATABASE_URL` -- standard Postgres connection string
- `SUPABASE_DB_URL` -- alternative name (same format)

Example:
```
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres?sslmode=require
```

### Troubleshooting

**"DATABASE_URL or SUPABASE_DB_URL must be set"**
Export the variable before running: `export DATABASE_URL=postgresql://...`

**"permission denied for schema public"**
On Supabase, the `postgres` role has full DDL access. If using a restricted role, grant CREATE on the target schema.

**"extension ... does not exist"**
Some extensions (like `pgcrypto`) must be enabled from the Supabase dashboard under Database > Extensions.

**"relation already exists"**
All DDL uses `CREATE TABLE IF NOT EXISTS` and is safe to re-run.

### Bootstrap Flow

1. Ensure `DATABASE_URL` or `SUPABASE_DB_URL` is set
2. `npm run db:dry` -- review statements
3. `npm run db:apply` -- execute against database
4. `npm run db:verify` -- confirm all tables, RLS, and invariants
5. Enable modules for a business:
   ```sql
   INSERT INTO business_module (business_id, module_id, enabled_by)
   SELECT 'your-business-uuid', module_id, 'your-actor-uuid'
   FROM module WHERE key = 'accounting';
   ```
