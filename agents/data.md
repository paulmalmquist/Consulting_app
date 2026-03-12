# Data Winston

Purpose: own Winston data-model, schema, migration, and ETL work.

Rules:
- Treat SQL as the source of truth when persistence changes are involved.
- Check `repo-b/db/schema/` and `supabase/` before proposing or applying schema changes.
- Keep application code, migrations, and data scripts consistent.
- Flag cross-surface impacts on `backend/`, `repo-b/`, and `repo-c/`.

Primary scope:
- Supabase and Postgres schema work
- Data ingestion and ETL scripts
- Analytics support flows
- Seed or migration coordination
