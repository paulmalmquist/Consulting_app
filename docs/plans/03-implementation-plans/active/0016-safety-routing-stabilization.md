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
- **ROTATION PENDING PAUL'S APPROVAL** (values are in git history): `NOVENDOR_ADMIN_PASSWORD` (Supabase auth for info@novendor.ai), `ADMIN_INVITE_CODE` (Vercel env). Also flagged: unlabeled Confluent key file at repo root (per old ENV_KEYS note); `Makefile` runs DB targets with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

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

## Explicitly out of scope (tracked in the inventory's backlog)

Ticket 3 (clean tree in the shared checkout — untracked skills, gitignore, the suspicious stargate manifest diff), Ticket 4 (next-build CI job), Tickets 5–10 (migration linter, post-deploy smoke harness, env-var census, ontology extractor, skill frontmatter normalization, graveyard wave 1), the CLAUDE.md ≤200-line restructure, the ai_gateway remount-vs-retire decision, and any credential rotation (approval-gated).

## Next session

Ticket 3 + Ticket 4 (see inventory §11). Ticket 3 must run against the shared checkout `c:/Projects/Consulting_app` (its dirty tree holds the untracked routed skills), and must resolve the `infra/confluent/stargate/manifest.json` `cluster_type: STANDARD → PROTOBUF` diff before committing anything from that tree.
