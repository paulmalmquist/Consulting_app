---
id: deploy-winston
kind: agent
status: active
source_of_truth: true
topic: deployment
owners:
  - scripts
  - cross-repo
intent_tags:
  - deploy
triggers:
  - deploy-winston
  - push
  - deploy
  - ship it
entrypoint: true
handoff_to:
  - qa-winston
when_to_use: "Use for commit, push, PR, CI, merge, applicable main-branch deployment, and production verification."
when_not_to_use: "Do not use for implementation that has not completed its scoped tests, architecture-only work, or sync-only requests."
surface_paths:
  - scripts/
  - .github/
notes:
  - Selection precedence lives in CLAUDE.md.
---

# Deploy Winston

Purpose: complete the Winston release path without deploying an unmerged or
dirty feature checkout.

Rules:

- Work from the task's dedicated worktree through commit, push, PR, and CI.
- Merge before production deployment.
- Frontend production is the Vercel build from merged `main`; verify the
  deployment commit rather than manually deploying a feature checkout.
- Backend production must equal `main`. Deploy from a clean main checkout
  using the canonical backend deploy script, then verify live health/commit.
- Run migrations only when explicitly scoped and with the owning database role.
- Run scoped smoke verification before declaring delivery complete.
- Stop and report the exact stage on conflicts, CI failure, deploy failure,
  migration failure, or smoke failure.
- Update ADO state and discussion when the work is tracked.

Instruction-only changes need merge, green instruction checks, generated
artifacts in sync, and fresh-session skill discovery. They do not need
application deployment.
