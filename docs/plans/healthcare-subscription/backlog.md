# Backlog — Healthcare Subscription Analytics

## Open

### Phase 2 — review and acceptance
- [x] `GET /api/hha/v1/funnel` + Funnel page (blended stages and channel CAC/conversions).
- [x] `GET /api/hha/v1/cohorts` + Cohorts page (service-layer masking for suppressed segments).
- [x] `GET /api/hha/v1/operations` + Operations SLA page.
- [x] Cross-link all four standalone surfaces with an in-environment navigation component.
- [x] Local API, typecheck, schema verification, and authenticated browser evidence.
- [ ] PR review and acceptance. Phase 2 remains in review, not shipped, and not deployed.
- [ ] Channel LTV:CAC. Channel-specific LTV is not seeded; only blended LTV and channel CAC are available.

### Phase 3 — event grain
- [ ] Synthetic event-level tables (`hha_members`, `hha_subscriptions`, lab/consult/fulfillment/support/billing events) — synthetic IDs only, no PHI.
- [ ] Derive the gold rollups from events; flip `provenance_label` to "derived".

### Phase 4 — copilot
- [ ] `Hone Health Analytics` scope-label guardrail in `backend/app/assistant_runtime/prompt_registry.py`.
- [ ] Allow-list only `hha_*` rollups; enforce aggregate + read-only + small-cell (<11) suppression in post-gen validation.
- [ ] Medical-advice refusal string + audit receipts.
- [ ] Eval fixtures: refusal cases ("diagnose this patient", "list members and IDs"), suppression cases, KPI-movement explanations.

## Known caveats
- Phase 1 rollups are **seeded**, not derived. Footer + provenance label say so. Do not present as pipeline output until Phase 3.
- `business_id` is synthesized by the seed pack (the v2 pipeline leaves it unset for demo envs). Reads scope by `env_id` only.
- Backend test run requires `--noconftest` locally OR a `duckdb` install — the global `conftest.py` imports `app.main`, which currently pulls `duckdb` via the untracked `legal_finance` route. Not an hha issue.

## Done
- [x] 2026-06-08 — HHA-1 Exec Overview slice shipped (schema, seed, API, standalone UI, tests). See `0005` dispatch record + `PROOF.md`.
