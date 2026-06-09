# Backlog — Healthcare Subscription Analytics

## Open

### Phase 2 — ship it (built, draft PR #136)
- [ ] Flip PR #136 ready → merge → **deploy backend from a clean checkout** (Railway; route 404s until then) → production visual receipt (login → Funnel/Cohorts/Operations).
- [ ] (optional) Channel LTV:CAC remains documented-unavailable until per-channel LTV exists (Phase 3 events can supply it).

### Phase 3 — event grain + derived rollups (gated on HHA-2 shipping; own PR)
Full prompt: `PHASE3_CODEX_PROMPT.md`.
- [ ] 7 synthetic event tables (migration `10014`, re-check vs origin/main) — synthetic IDs only, no PHI, full RLS.
- [ ] **Preserve v1** seed logic, add v2 derivation (events → gold), flip `provenance_label` to "derived".
- [ ] Tolerance-based acceptance (headline KPIs in range; trends/rankings/suppression stable).
- [ ] Gated wipe + re-seed of `ceeb9ea0` with a **backup-table rollback artifact** + scratch-env verify + explicit approval.

### Phase 4 — governed copilot (after Phase 3; own PR)
Full prompt: `PHASE4_CODEX_PROMPT.md`.
- [ ] `Hone Health Analytics` scope-label guardrail in `backend/app/assistant_runtime/prompt_registry.py` (mirror Meridian).
- [ ] **Fixed-intent** `hha.aggregate_query` MCP tool (allow-listed intents; no free SQL; no identifier columns; suppression). Restrict HHA lane to the `hha` tag.
- [ ] Pre-model medical-advice refusal — lab-*operations* analytics allowed, individual lab-*result* interpretation refused.
- [ ] Audit via existing `ai_decision_audit_log` (no new governance tables unless proven necessary).
- [ ] Standalone copilot + governance pages (telemetry pattern). Evals: refusals + allowed + zero-leak + suppression.

## Known caveats
- Phase 1 rollups are **seeded**, not derived. Footer + provenance label say so. Do not present as pipeline output until Phase 3.
- `business_id` is synthesized by the seed pack (the v2 pipeline leaves it unset for demo envs). Reads scope by `env_id` only.
- Backend test run requires `--noconftest` locally OR a `duckdb` install — the global `conftest.py` imports `app.main`, which currently pulls `duckdb` via the untracked `legal_finance` route. Not an hha issue.

## Done
- [x] 2026-06-08 — HHA-1 Exec Overview slice shipped (schema, seed, API, standalone UI, tests). See `0005` dispatch record + `PROOF.md`.
