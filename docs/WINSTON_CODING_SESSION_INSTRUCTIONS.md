# Winston Coding Session Instructions

This document defines the durable coding-session lifecycle. `CLAUDE.md` is the
compact startup contract; executable procedures live in project skills.

## Work modes

- **PLAN:** read-only inspection and a decision-complete plan. No edits,
  commits, board mutation, or production changes unless explicitly requested.
- **CODE:** scoped implementation followed by full delivery unless the user
  narrows the endpoint.

Natural-language requests may establish the mode. Explicit `PLAN ONLY` or
`CODE THIS TICKET` instructions take precedence.

## ADO risk gate

| Class | Work | Requirement |
|---|---|---|
| R0 | Explanation, audit, planning, research, inventory, validation | No ADO item |
| R1 | Focused reversible UI/code/test/docs change | Reuse existing item when useful; new intake optional |
| R2 | Schema, security/auth, MCP contracts, cloud infra/cost, production data, deploy/release, instruction governance, multi-session work | Approved Story/Bug and Session Brief |

ADO failure blocks R2 mutation, not R0 work or safe R1 local work.

## Start protocol

Use `winston-session-start`:

1. Resolve the git root, branch, HEAD, dirty state, and worktrees.
2. Inspect active matching PRs and workers to avoid duplicate work.
3. Reconstruct continuation state from git, selected plans, `next-session.md`,
   tests, deployment evidence, and ADO.
4. Select one primary write owner.
5. Record scope, acceptance criteria, non-goals, risk, test plan, and delivery
   target.
6. Before mutation, create a dedicated worktree from fresh `origin/main`.

The primary shared checkout is not safe for mutation when multiple agents run.
Do not switch, reset, clean, stage, or commit from it.

## Implementation protocol

- Work to one coherent Story/Bug or focused R1 scope.
- Cross-surface edits are allowed when one acceptance contract requires them.
- Supporting agents remain read-only unless assigned non-overlapping files.
- Run focused baseline checks; record unrelated failures without absorbing
  them into scope.
- Preserve fail-closed behavior and explicit unavailable states.
- Do not invent data, lineage, status, metrics, or deployment success.
- Do not print or persist credential values.

## Full-delivery protocol

1. Run focused tests and the relevant broader gate.
2. Review the diff and stage explicit files only.
3. Commit and push from the dedicated worktree.
4. Open a PR, monitor CI, and fix scoped failures.
5. Merge after required checks pass.
6. Frontend: verify the production Vercel build for the merged main commit.
7. Backend: deploy only after merge and only from a clean main checkout.
8. Schema: apply only the scoped reviewed migration using the correct database
   and owner, then verify.
9. Run scoped production smoke verification.
10. For tracked work, update ADO state and discussion with branch, commit, PR,
    tests, deployment, evidence, risks, and next item.

Instruction-only work completes with a merged PR, green instruction checks,
generated artifacts in sync, and fresh-session skill discovery. It does not
require application deployment.

## ADO state discipline

- `Active` when implementation begins.
- `Resolved` when code, tests, and evidence are ready for review.
- `Closed` only after the required merge and verification are complete.

## Session end

The final report includes:

- delivered scope and acceptance criteria
- files changed
- test commands and results
- commit, branch, PR, CI, and merge state
- deployment/smoke evidence when applicable
- ADO update when applicable
- blockers, deferred work, and next safe command

Update `next-session.md` only when work remains. Add to `docs/tips.md` only for
durable repo-wide lessons. Temporary branch, PR, and task state belongs in ADO,
the active plan, or local session memory.
