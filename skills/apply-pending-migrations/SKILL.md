---
id: apply-pending-migrations
kind: skill
status: active
source_of_truth: true
topic: schema-migration
owners:
  - repo-b
  - supabase
intent_tags:
  - migration
  - schema
  - apply migration
  - run migration
  - pending migration
triggers:
  - apply migration
  - apply the migration
  - run pending migrations
  - push the schema
  - migration is all that's left
  - only migration left
entrypoint: true
handoff_to:
  - data-winston
when_to_use: "When a migration SQL file exists in repo-b/db/schema/ and the task is to apply it to the linked Supabase project."
when_not_to_use: "Do not use when migration files still need to be written or reviewed. This skill assumes the SQL file is complete and ready."
---

# Apply Pending Migrations

## Purpose

Apply one or more SQL schema files from `repo-b/db/schema/` to the linked Supabase project (`ozboonlsplroialdwuxj`) without needing to be told the exact filename.

## When this skill activates

- User says "apply the migration" without naming a file
- User says "migration is all that's left" or "only thing pending is the migration"
- Completing a feature build where schema changes are the final step

## Protocol

### Step 1 — Identify what needs to be applied

The project does NOT use Supabase managed migrations (`supabase migration push`). Schema is applied directly via `supabase db query --linked`. There is no authoritative "applied" ledger outside the DB itself.

To find candidate files, check git status for modified or untracked SQL files in `repo-b/db/schema/`:

```bash
git diff --name-only HEAD -- repo-b/db/schema/
git ls-files --others --exclude-standard repo-b/db/schema/
```

### Step 2 — Verify the table or enum doesn't already exist

For each candidate file, extract the primary object it creates (table name or enum) and probe the live DB:

```bash
echo "SELECT to_regclass('public.TABLE_NAME');" | supabase db query --linked
```

If the result is not null, the schema already exists — skip that file (idempotency check). If it returns null, proceed.

For enums:
```bash
echo "SELECT 1 FROM pg_type WHERE typname = 'ENUM_NAME';" | supabase db query --linked
```

### Step 3 — Apply

```bash
supabase db query --linked < repo-b/db/schema/NNN_filename.sql
```

An empty `rows: []` response means success. Any error text means the migration failed — report the error verbatim without retrying blindly.

### Step 4 — Confirm

After applying, re-run the existence probe from Step 2 to confirm the object now exists. Report: file applied, table/enum confirmed present.

## Multiple files

If more than one file is pending, apply them in filename order (ascending NNN prefix) so dependencies are satisfied. Each file is applied and confirmed before moving to the next.

## Guardrails

- Never run `supabase db push` — the project does not use the managed migration ledger.
- Never apply a file that hasn't been reviewed (readable SQL in `repo-b/db/schema/`).
- Never apply a file that creates a table missing `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`, RLS enable, and a tenant policy — per `ARCHITECTURE.md` rules. Flag the gap and ask for confirmation before proceeding.
- If the file uses a prefix not in the approved list from `ARCHITECTURE.md`, flag it.
- Do not apply seed data (files containing only `INSERT INTO`) without explicit confirmation.

## Reference

- Linked project: `ozboonlsplroialdwuxj`
- Schema directory: `repo-b/db/schema/`
- CLI auth: uses stored Supabase access token — no password needed
- Database guardrails: `ARCHITECTURE.md` → "Database Guardrails" section
