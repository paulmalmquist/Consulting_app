---
name: apply-pending-migrations
description: Apply an already reviewed Winston migration to its actual owning database with the correct role, idempotency checks, and post-apply verification. Use when a migration file is complete and the user asks to apply it, run pending migrations, or push the schema.
---

# Apply Pending Migrations

This is an R2 workflow. Require an approved Story/Bug and explicit migration
scope.

1. Identify changed/untracked migration files and read them fully.
2. Read `ARCHITECTURE.md` and determine the owning store:
   - ordinary ordered application schema may target Supabase/Postgres
   - telemetry `tel_*` serving tables target Databricks Lakebase
   - other modules may have a documented owner-specific path
3. Confirm the connection and role are authorized for DDL. A runtime DML role
   is not automatically the table owner.
4. Verify ordering, existing objects, RLS/tenant requirements, comments,
   constraints, and idempotency.
5. Run the repo's documented dry-run or verification path when available.
6. Apply only the named reviewed files in order.
7. Re-read the resulting schema/contract and record exact evidence.

Never guess the database from a filename, apply a migration through the wrong
store, expose credentials, or treat a command exit code as sufficient proof.
