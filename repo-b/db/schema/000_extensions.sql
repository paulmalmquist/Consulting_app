-- 000_extensions.sql
-- Required Postgres extensions for Business OS backbone.
-- Safe to re-run (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive text for emails
