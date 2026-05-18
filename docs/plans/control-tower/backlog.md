# Control Tower — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Verify environment switching does not leak env_id** — Check that switching environments fully replaces the env_id context and does not serve stale data from the previous environment. Needs browser verification.

## UX improvements
- [ ] **Control Tower environment list** — Confirm the list at `/lab/system/control-tower` shows all environments with meaningful status indicators, not just raw IDs.
- [ ] **Environment creation form** — Verify the creation form includes template selection and name field. Report what fields are missing.

## Backend / API
- [ ] **Seed pack coverage** — `backend/app/services/environment_seed_packs_v2/` currently only shows `legal_ops_starter.py`. Determine if seed packs exist for REPE, PDS, Supply Chain, and other environment types.
- [ ] **Environment health check** — Add or verify a `/api/v1/lab/health` or equivalent endpoint that confirms an environment is correctly provisioned.

## Data / migrations
- [ ] **Environment table schema** — Needs repo verification. Identify the canonical table(s) for environments in Supabase and confirm RLS is enabled.

## Tests
- [ ] **No known tests for environment creation pipeline** — `backend/app/services/environment_pipeline_v2.py` needs unit tests covering happy path and failure cases.

## Documentation
- [ ] **Link `docs/ENVIRONMENT_BLUEPRINT.md` from this folder** — Confirmed it exists; update architecture.md when content is verified.

## Nice-to-have
- [ ] Environment tagging and search
- [ ] Environment export/import for client onboarding

## Completed
_(none yet)_
