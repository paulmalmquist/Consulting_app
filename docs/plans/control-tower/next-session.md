# Next Session — Control Tower

**Last updated:** 2026-05-19
**Priority:** High — this is the meta-surface that all other environments depend on

## Where we are

EnvironmentContract + Promotion Gate **Ticket 1 (verifier + read-only) is DONE & tested**
(migration `10004`, `environment_contract_v2.py` fail-closed verifier, `/v2/.../verify`
upgraded + `?strict=1`, `/v2/.../contract`, read-only `EnvironmentContractCard` on the
blueprint page; 16 backend + 5 frontend tests pass; pipeline regression green, zero
edits). Dispatch plan: `~/.claude/plans/here-s-a-cleaner-version-linked-flame.md`.

**Next is Ticket 2: the promotion state machine + fail-closed gate.**

## Copy-paste prompt for next Claude Code session

```
You are working on Control Tower / EnvironmentContract Ticket 2 in the Novendor /
BusinessMachine platform: the promotion state machine + fail-closed promotion gate.
Ticket 1 (the read-only verifier) is already shipped and tested — do NOT redo it.

Read first:
- docs/plans/control-tower/architecture.md (§"EnvironmentContract + Promotion Gate")
- docs/plans/control-tower/backlog.md (§"Ticket 2")
- docs/tips.md (§"EnvironmentContract + Promotion Gate (2026-05-19)")
- backend/app/services/environment_contract_v2.py (the verifier to build the gate on)
- backend/app/services/re_trace_gate.py (the fail-closed gate idiom to mirror)
- repo-b/db/schema/459_re_authoritative_snapshot_audit.sql lines 50-88
  (re_authoritative_enforce_promotion — the immutability/transition trigger to mirror)
- backend/app/routes/lab_v2.py (extend, do not fork)

Objective — implement, fully additive:
1. Migration repo-b/db/schema/10005_environment_contract_promotion_guard.sql:
   released-row immutability + transition-validation trigger on
   app.environment_contract. Mirror re_authoritative_enforce_promotion:
   - released rows immutable except no-op; payload immutability via
     `to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys`
   - explicit transitions: draft→seeded→verified→staging→released;
     any→quarantined; quarantined→verified; released cannot downgrade.
   (10005 is the next free number — 10003 reserved by Dispatch 0002, 10004 = Ticket 1.)
2. assert_environment_promotable(env_id, *, target, actor) in
   environment_contract_v2.py — typed result or HTTPException (mirror
   assert_fund_traceable). Re-run verify_environment_contract inside the gate (no
   cached pass). Refuse →staging/→released unless
   app.environments.lifecycle_state ∈ {verified,live} AND fresh
   eligible_for_promotion is True.
3. POST /v2/environments/{env_id}/promote and POST /v2/environments/{env_id}/quarantine
   in lab_v2.py. Each successful transition writes ONE append-only
   app.environment_promotion_event row (the table already exists from 10004 and is
   currently dead — this is where it comes alive).
4. Promotion-drift: extend /v2/environments/health (or add
   /v2/environments/promotion-health) to return 503 when any
   promotion_state='released' env no longer passes verify_environment_contract.
5. EnvironmentContractCard gains gated Promote / Quarantine buttons, disabled unless
   eligible_for_promotion. Wire through bosFetch (no hard-coded origin).

Hard constraints (carried from Ticket 1):
- Additive only. Do not weaken/rewrite existing pipeline/template/health/contract
  tests to pass — fix the implementation or report a pre-existing failure.
- emit_log is keyword-only; pass error=exc, never exc_info=.
- New service code that calls get_cursor must already be patched in
  conftest.py _GET_CURSOR_TARGETS (environment_contract_v2 is already there).
- Fail closed: unknown/missing/not_available are never pass; the gate must not
  promote on a stale/cached verification.

Files to inspect:
- backend/app/services/environment_contract_v2.py
- backend/app/routes/lab_v2.py
- backend/app/schemas/lab_v2.py
- repo-b/db/schema/459_re_authoritative_snapshot_audit.sql
- backend/app/services/re_trace_gate.py
- repo-b/src/components/lab/environments/EnvironmentContractCard.tsx

Acceptance criteria:
- [ ] Released-row mutation raises at the DB (trigger test proves it)
- [ ] Illegal transition → gate returns 409 with structured detail
- [ ] No promotion possible while any blocking check is non-pass
- [ ] Every transition writes exactly one app.environment_promotion_event row
- [ ] Drift on a released env → 503
- [ ] Existing Ticket 1 + pipeline tests still green with zero edits

Tests to run:
cd backend && python -m pytest tests/test_environment_contract_v2.py tests/test_environment_pipeline_v2.py -q
cd repo-b && npx vitest run src/components/lab/environments/__tests__/EnvironmentContractCard.test.tsx

Update docs/plans/control-tower/next-session.md and backlog.md before finishing.
```

## Context notes
- `app.environments` is the verified canonical v2 registry; `app.environment_contract`
  is the env_id-keyed governance sidecar added by `10004`. `app.environment_capabilities`
  does NOT exist (Phase 3) — `capability.binding_implemented` stays `not_available`
  until that pipeline ticket lands; do not fake it in Ticket 2.
- `lab_v2.router` mounts at `/v2` (no `/api/v1/lab` prefix). Frontend reaches it via
  `bosFetch("/v2/...")` through the `/bos` same-origin proxy.
- Pre-existing unrelated tsc failure in `repo-b/src/components/historyrhymes/ResearchBriefUpload.tsx`
  (untracked HistoryRhymes WIP) — not this ticket's; do not touch it.
