# Plan Maintenance Rules

These rules apply to every coding session that touches this repository.

## Session start rules

1. Read `docs/plans/<environment>/next-session.md` before writing any code.
2. Read `docs/plans/<environment>/architecture.md` to understand the current implementation map.
3. Read `docs/plans/<environment>/backlog.md` to know what is already tracked.
4. If `docs/LATEST.md` exists, read it for overnight intelligence before starting feature work.
5. If `docs/CAPABILITY_INVENTORY.md` exists, check it before suggesting a new feature — it may already be built.

## Session end rules

1. Update `docs/plans/<environment>/next-session.md` with what the next session should pick up. Write it as a copy-paste-ready prompt, not a summary.
2. New bugs discovered during the session go into `docs/plans/<environment>/backlog.md` under the relevant section.
3. Durable architecture discoveries go into `docs/plans/<environment>/architecture.md`. Mark anything unverified as "Needs repo verification."
4. New acceptance criteria go into `docs/plans/<environment>/qa-checklist.md` or `release-readiness.md`.
5. Reusable repo-wide lessons, commands, gotchas, and preferences go into `docs/tips.md`. Not into session notes. Not into one-off comments.

## Quality rules

6. Plans stay honest. If something is not verified, say "Needs repo verification."
7. No plan should claim a feature works unless there is a test, screenshot, API receipt, or browser verification to back it.
8. Prefer concrete file paths over vague references. "backend/app/routes/re_fund.py:47" is better than "the fund route."
9. Backlog items should be specific enough that a fresh coding session can act on them without asking questions.
10. Next-session prompts should include: objective, files to inspect, required reading, step-by-step plan, acceptance criteria, tests to run.

## Architecture rules

11. Do not duplicate existing plan files. Link to them instead.
12. When a roadmap phase is completed, mark it done with a date. Do not delete completed phases.
13. When a bug is fixed, mark it done in backlog.md with a date and a git commit reference if available.
14. When a release gate passes, mark it in release-readiness.md with a date and verification method.

## Anti-patterns

- Do not start coding without reading the relevant environment plan.
- Do not finish a session without updating next-session.md.
- Do not add vague backlog items like "fix the UI" — make them specific.
- Do not claim a feature works because the code looks right — verify it.
- Do not put repo-wide lessons in environment-specific plans — put them in tips.md.
