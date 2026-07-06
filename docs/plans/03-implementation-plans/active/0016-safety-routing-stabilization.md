# 0016 — Safety-and-Routing Stabilization Slice

- **ADO**: User Story #758 (parent: Feature #727 "Claude Routing and Session Governance"), Active
- **Source**: 2026-07-02 full repository architecture inventory (approved plan; 12-agent read-only sweep + command-receipt evidence appendix)
- **Risk tier**: R2 (security + instruction governance + CI)
- **Status**: Tickets 0–2 implemented in this slice (PR pending); Tickets 3–4 next; 5–10 backlog

## Why

The inventory found (with command receipts):

1. **Security**: `docs/reference/ENV_KEYS.md` was git-tracked despite its own "do not commit" header and contained a live-looking `ADMIN_INVITE_CODE` value; worse, the actual admin password value was committed in `skills/chatgpt-agent-validate/SKILL.md` and `skills/supervised-build-review-loop/SKILL.md`; CLAUDE.md routed agents to the tracked file for the password.
2. **Routing**: CLAUDE.md routed to 14 skills that don't exist (deleted in `e96945e3`; one never existed), a `repo-c/` surface deleted 2026-03-29 (`a31c2865`), a nonexistent `workflow_engine.py`, macOS-absolute links, and a 22-task "Autonomous Intelligence Directory" that went dark ~2026-03-22.
3. **Enforcement**: `scripts/validate_instruction_docs.mjs` existed, exited 1 with 5 errors, and was wired into nothing.

## What this slice shipped (Tickets 0–2)

### Ticket 0 — secret/material-access triage
- Removed every committed credential value found (6 locations: ENV_KEYS.md invite code, chatgpt-agent-validate password ×2, supervised-build-review-loop password ×2, tips.md invite code ×2 incl. an openclaw snippet, control-tower-runbook local-dev reviewer creds).
- `docs/reference/ENV_KEYS.md` rewritten as a **names-only index** (policy in its header); stays tracked.
- CLAUDE.md login guidance + both skills now instruct runtime `vercel env pull`, never committed files.
- New CI guard: `secret_shaped_doc_values` category in `scripts/check_repo_guardrails.mjs` — scans `docs/ skills/ .skills/ agents/` markdown for known credential patterns, invite-code-shaped tokens, and password literals; reports redacted (first 4 chars + length); 10 verified false positives baselined; self-tested with a seeded fixture (fails) and clean tree (passes).
- **ROTATION COMPLETE (2026-07-03, approved).** Both historically-exposed values rotated and verified end-to-end: `NOVENDOR_ADMIN_PASSWORD` (Supabase Auth for info@novendor.ai + Vercel reference copy) and `ADMIN_INVITE_CODE` (Vercel — all three targets: production, preview, development). Live smoke on novendor.ai: new code 200, old/empty 401, protected route 200. Set via the Vercel REST API after the `vercel env add` CLI proved to silently store empty values from stdin (lesson in tips.md). Redacted receipt: `docs/receipts/security/rotation-2026-07-03.md`.
  - **Confluent key file**: identified only — `confluent)_kafka_api.json` does not exist on disk, is untracked, was never committed; `.gitignore` rule `*_api.json` covers it. No exposure, no action.
  - **Still open** (separate follow-ups, not this slice): the Vercel-stored `SUPABASE_SERVICE_ROLE_KEY` is stale (401 — use the Supabase CLI for current keys); `Makefile` DB targets run `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Ticket 1 — router truth pass
- Evidence table produced before editing (see the inventory's §15 Evidence Appendix; re-verified in this worktree: `repo-c` absent from HEAD tree, 9/9 spot-checked dead routes confirmed, validator exit 1).
- CLAUDE.md: 14 dead skill routes repointed to surviving owners (session-start, ai-copilot, mcp, qa, architect, demo, feature-dev+plan folders, chatgpt-agent-validate, outlook-draft/-creator); repo-c rows replaced with `backend/app/routes/lab*.py` + `environment_pipeline_v2.py` surfaces; `workflow_engine.py` marked planned-not-built; Mac-absolute links → relative; Vercel project list corrected from live `vercel project ls`; the Autonomous Intelligence Directory replaced with an honest live-vs-archive section (only `docs/ai-testing/reports/` is still written, by the Winston eval workflows).
- `docs/instruction-index.md` + `skills/SKILLS_INDEX.md` + `.claude/skills/*` wrappers **regenerated** via `npm run generate:instructions` (they are generated artifacts; the drift was hand-edits).
- `.skills/azure-devops-intake/SKILL.md` repo-c refs (3) → telemetry-platform.
- `docs/plans/00-dispatch/routing-map.md`: +6 missing env-folder rows (telemetry-platform, ai-provider-dispatch, ade-ops-orchestrator, automated-data-engineering, bigquery-schemas, investment-engine) + intake-gate note.

### Ticket 2 (partial) — validator in CI
- `Instruction docs validation` step added to the `repo-guardrails` CI job (`node scripts/validate_instruction_docs.mjs`).
- NOT wired: `tests/instruction-routing/router.test.mjs` — it additionally asserts CLAUDE.md ≤ 200 lines (currently ~450). 14/15 tests pass after this slice; the line-count aspiration needs its own router-restructure ticket (see backlog below).

## Verification (all run in the worktree, 2026-07-02)

- `npm run validate:instructions` → "passed for 23 routed docs (23 entrypoints)" + assistant runtime passed, exit 0 (was exit 1 / 5 errors).
- `node scripts/check_repo_guardrails.mjs` → passed; seeded credential fixture → fails with redacted finding; removed → passes.
- `node --test tests/instruction-routing/router.test.mjs` → 14 pass / 1 fail (the known ≤200-line rule, documented in ci.yml).
- Every `skills/…/SKILL.md` path referenced by CLAUDE.md exists on disk (loop check, zero missing).
- No secret value printed in any command output, commit, or doc (redaction verified).

## Ticket 3 — clean-tree hygiene (2026-07-06, Story #762) — DONE

Shared checkout was at detached HEAD `56376a52`, 0 ahead / 10 behind origin/main, dirty with 5 tracked-modified + 13 untracked items (10 concurrent worktrees in play). Evidence table produced before editing. Split: durable `.gitignore` + docs via this PR off main; shared-checkout in-place fixes for the manifest bug and immediate ignore protection.

- **`.gitignore`** (this PR): root-anchored recurring-artifact guards — `mlflow.db`, `mlruns/`, `/*.zip`, `/*.png`, `/*.jpg`, `/*.jpeg` — plus specific strays `/relativity_questions_demo.md` and `/repo-b/public/telemetry/vostok1.jpg`. Verified no tracked root zip/png/jpg exists (globs hide zero legitimate source); `*.pdf` already covered the resume + Relativity expense receipts. All 6 junk paths now `git check-ignore`-confirmed; zero tracked files hidden.
- **Stargate manifest**: `infra/confluent/stargate/manifest.json` had `cluster_type: STANDARD → PROTOBUF` — an export-script field bug (PROTOBUF is a schema format; cluster `lkc-gqpvvyv` is STANDARD). Reverted **only** that field in the shared checkout working tree (not this PR — the file belongs to the concurrent `feat/stargate-bridge-deploy` workstream); preserved the legitimate edits (new `anomaly.triage` subject, `connectors: []`, telemetry schema +6 proto fields).
- **NOT swept** (concurrent workstreams, left intact): `M CLAUDE.md` / `SKILLS_INDEX.md` / `docs/tips.md` (gke-alive-demo registration on the old base — superseded by #500's generated artifacts on main), the telemetry-schema evolution, and all untracked stargate/demo/databricks assets.
- **Ticketed, not committed**: the untracked `skills/gke-alive-demo/` and `skills/databricks-autoencoder-inspector/` (+ harness + receipts) — Story #763. They have no dangling route on main (verified), so committing them belongs to a feature-dev task that regenerates the instruction artifacts, not to tree hygiene.
- **No user files moved or deleted.** Personal folio zip + Relativity expenses stay in place, now ignore-protected; recommend the owner relocate them out of the repo at leisure.

## Explicitly out of scope (tracked in the inventory's backlog)

Ticket 4 (next-build CI job), Tickets 5–10 (migration linter, post-deploy smoke harness, env-var census, ontology extractor, skill frontmatter normalization, graveyard wave 1), the CLAUDE.md ≤200-line restructure, the ai_gateway remount-vs-retire decision. Follow-ups #760 (stale service-role key) and #761 (Makefile TLS flag) remain open.

## Next session

Ticket 4 — add `next build` to CI (its own PR, per inventory §11). Land the two untracked skills (Story #763) via the generated-artifact flow when their owner is ready.
