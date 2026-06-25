---
name: winston-session-start
description: Start or resume a Winston coding session by reconstructing repository state from git, worktrees, plans, PRs, ADO, tests, and deployment evidence. Use on "continue", "resume", selected plan files, session startup, or before any implementation.
---

# Winston Session Start

Do not edit until this state delta is complete.

1. Resolve the root:

   ```powershell
   git rev-parse --show-toplevel
   ```

2. Report:
   - current directory and resolved root
   - branch and HEAD
   - `git status --short`
   - `git worktree list`
   - active matching PRs
   - selected plan or `docs/plans/<surface>/next-session.md`
   - existing ADO Story/Bug and state

3. Determine the mode:
   - PLAN: read-only analysis and a decision-complete plan.
   - CODE: scoped implementation followed by full delivery.

4. Determine the owning surface, primary write owner, acceptance criteria,
   explicit non-goals, and ADO risk.

5. For CODE, create a dedicated worktree from fresh `origin/main`. Never
   branch-switch, reset, clean, stage, or commit from the shared checkout.

6. Before delegating, check for an existing PR or active worker on the same
   ticket. Supporting agents are read-only unless assigned non-overlapping
   files.

7. Read only relevant architecture and plan material. Search `docs/tips.md`
   for named sections; do not load the entire file.

End with a compact Session Brief containing mode, root/worktree, ticket,
primary owner, surfaces, scope, tests, delivery target, and risks.
