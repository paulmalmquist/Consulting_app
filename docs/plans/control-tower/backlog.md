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

## EnvironmentContract + Promotion Gate

### Ticket 2 — promotion state machine + fail-closed gate (NEXT)
- [ ] Migration `10005_environment_contract_promotion_guard.sql`: released-row immutability + transition-validation trigger on `app.environment_contract`, mirroring `re_authoritative_enforce_promotion()` in `repo-b/db/schema/459_re_authoritative_snapshot_audit.sql` (allowed-keys diff via `to_jsonb(NEW) - allowed_keys`, explicit transition guards).
- [ ] `assert_environment_promotable(env_id, *, target, actor)` in `backend/app/services/environment_contract_v2.py` — mirror `re_trace_gate.assert_fund_traceable`: typed result or `HTTPException`; re-run `verify_environment_contract` inside the gate (no cached pass); refuse `→staging/→released` unless `app.environments.lifecycle_state ∈ {verified,live}` AND fresh `eligible_for_promotion`.
- [ ] `POST /v2/environments/{env_id}/promote` + `POST /v2/environments/{env_id}/quarantine` in `backend/app/routes/lab_v2.py`; every transition writes one append-only `app.environment_promotion_event` row (table already exists, currently dead).
- [ ] Promotion-drift: extend `/v2/environments/health` (or add `/v2/environments/promotion-health`) to return 503 when any `promotion_state='released'` env no longer passes verification.
- [ ] Control Tower `EnvironmentContractCard` gains gated Promote/Quarantine buttons (disabled unless `eligible_for_promotion`).
- [ ] Tests: illegal transition → gate 409; released-row mutation → DB trigger raises; every transition writes an event row.

### Phase 3 — independent unblocking tickets
- [ ] **Capability binding**: implement `environment_pipeline_v2._apply_template_metadata` → create `app.environment_capabilities`, bind `template.enabled_modules`. Then flip `_CAPABILITY_BINDING_IMPLEMENTED` in `environment_contract_v2.py` and turn `capability.binding_implemented` into a real pass-capable check. (Pipeline-surface ticket; separate dispatch.)
- [ ] **Eval/smoke result store**: a recorder + table so `eval.latest_result_recordable` is real and `ai_runtime.eval_suite_declared` can be promoted from `warning` → `blocking`.
- [ ] **Per-env AI behavior contract registry** surfaced via `backend/app/assistant_runtime/contract_enforcer.py` so `ai_runtime.behavior_contract_present` is data-backed instead of `missing`.

## Nice-to-have
- [ ] Environment tagging and search
- [ ] Environment export/import for client onboarding

## Completed
- [x] **Environment table schema verified** (2026-05-19) — `app.environments` is canonical for v2 (confirmed live via Supabase CLI against `ozboonlsplroialdwuxj`: `lifecycle_state`, `template_key`, `seed_pack_applied/version`, `manifest_json` all present in prod). Documented in `ARCHITECTURE.md` §"Environment registries".
- [x] **Environment creation pipeline tests exist** (2026-05-19) — `backend/tests/test_environment_pipeline_v2.py` (8 tests) green; not modified by Ticket 1 (regression guard held with zero edits).
- [x] **EnvironmentContract + Promotion Gate — Ticket 1 (verifier + read-only)** (2026-05-19) — migration `10004` (additive, zero backfill), `environment_contract_v2.py` fail-closed verifier, `GET /v2/environments/{id}/verify` upgraded + `?strict=1` 503, `GET /v2/environments/{id}/contract`, read-only `EnvironmentContractCard` on the blueprint page. 16 backend + 5 frontend tests pass. Dispatch plan: `~/.claude/plans/here-s-a-cleaner-version-linked-flame.md`.
