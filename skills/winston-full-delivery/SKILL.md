---
name: winston-full-delivery
description: Finish a Winston implementation through tests, commit, push, PR, CI, merge, applicable main-branch deployment, production smoke verification, ADO receipts, and handoff documentation. Use for "full delivery", "land this", "finish", "merge and verify", or as the default end state of CODE sessions.
---

# Winston Full Delivery

Full delivery is the default CODE-session endpoint.

## Preconditions

- Work is in a dedicated worktree.
- Scope and acceptance criteria are known.
- R2 work has an approved ADO Story/Bug and Session Brief.
- The staged set contains only files owned by this task.

## Sequence

1. Run focused tests, then the relevant full gate.
2. Review `git diff` and stage explicit files only.
3. Commit with the work-item reference when one exists.
4. Push the branch and open a PR.
5. Monitor CI and fix only failures caused by this change.
6. Merge after required checks pass.
7. Frontend changes: verify the Vercel production deployment corresponds to
   the merged `main` commit; do not redeploy from a feature checkout.
8. Backend changes: update a clean `main` checkout, deploy from that checkout,
   and verify the live commit and startup health.
9. Schema changes: apply only the reviewed migration to the owning database
   with the required owner, then verify the resulting contract.
10. Run scoped production smoke verification.
11. For gated work, update ADO with state, branch, commit, PR, tests, deploy,
   evidence, risks, and next item.
12. Update `next-session.md` only when work remains. Add `docs/tips.md` content
   only for a durable repeated lesson.

Instruction-only changes do not require Railway or Vercel deployment. Their
delivery proof is a merged PR, green instruction checks, generated artifacts
in sync, and a fresh Claude session that lists and loads the project skills.

If any stage blocks, stop destructive follow-on actions and report the exact
stage, error, preserved artifacts, and next safe command. Never call a partial
delivery complete.
