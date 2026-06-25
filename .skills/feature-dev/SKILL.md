---
name: feature-dev
description: Implement scoped Winston features, bug fixes, refactors, tests, and documentation changes across backend, repo-b, telemetry-platform, Excel, orchestration, scripts, and docs. Use when the user asks to build, implement, fix, add, change, create, or refactor repository behavior. Classify ADO risk first and finish through full delivery unless the user narrows the endpoint.
---

# Feature Development

Read `CLAUDE.md`, then use `winston-session-start` before mutation.

## Orient

1. Resolve the repository root and use a dedicated worktree from fresh
   `origin/main`.
2. Identify the primary write owner, affected surfaces, acceptance criteria,
   explicit non-goals, and ADO risk.
3. Confirm the R2 Session Brief when required.
4. Read adjacent implementation and the relevant architecture/plan files.
5. Run focused baseline checks. Record unrelated pre-existing failures; do not
   fix them or stop automatically when the scoped path can still be verified.

Scope is defined by one coherent ticket, not by one directory. Cross-surface
changes are valid when the same acceptance criteria require them.

## Implement

- Make the smallest durable change that satisfies the acceptance criteria.
- Preserve unrelated user changes.
- Follow adjacent patterns and current runtime ownership.
- Keep one primary writer. Supporting agents are read-only unless assigned
  explicit, non-overlapping files.
- Do not add silent fallbacks, fabricated data, invented metrics, or false
  success states.
- Do not read or print secret values unless the scoped operation requires the
  credential; never place values in logs or docs.

## Verify

Use focused commands first, then the relevant broader gate:

```powershell
# Frontend
npm --prefix repo-b run typecheck
npm --prefix repo-b run lint
npm --prefix repo-b run test:unit

# Backend
python -m pytest <focused-test-paths>

# Instructions
npm run generate:instructions
npm run validate:instructions
npm run test:instructions
```

For schema work:

- Read `ARCHITECTURE.md`.
- Identify the actual owning database; telemetry `tel_*` serving tables do not
  use the same path as ordinary Supabase tables.
- Verify the required owner and migration procedure before applying anything.
- Use `apply-pending-migrations` only after review.

## Deliver

Invoke `winston-full-delivery` unless the user explicitly requested a local-only
or plan-only endpoint.

- Commit and push from the isolated worktree.
- Open the PR and monitor CI.
- Merge before production deployment.
- Frontend deploys through the merged `main` Vercel build.
- Backend deploys only from a clean `main` checkout.
- Run scoped production smoke verification.
- Update ADO only when the task was gated or explicitly tracked.

## Completion report

Report:

- scope and outcome
- files changed
- tests and exact results
- commit, branch, PR, CI, merge
- applicable deployment and smoke evidence
- ADO state/comment when gated
- risks, deferred items, and next safe command

Never label partial delivery complete. Update `next-session.md` only when work
remains and `docs/tips.md` only for a durable repeated lesson.
