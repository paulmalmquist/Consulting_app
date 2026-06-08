# Backlog — Healthcare Subscription Analytics

## Open

### Phase 2 — additional surfaces
- [ ] `GET /api/hha/v1/funnel` (read `hha_funnel_metrics`; blended + per-channel) + Funnel page.
- [ ] `GET /api/hha/v1/cohorts` (read `hha_cohort_metrics`; honor `is_suppressed` → mask cells with size <11 in the UI, render the masked reason) + Cohorts page.
- [ ] `GET /api/hha/v1/operations` (read `hha_operational_metrics`) + Operations SLA page.
- [ ] LTV:CAC by channel widget (channel funnel rows + cohort LTV already seeded).
- [ ] Cross-link the standalone surfaces with a bespoke in-env nav (still no app shell).

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
