# Next Session — History Rhymes

**Last updated:** 2026-06-12

## Copy-paste prompt for next Claude Code session

```
You are working on the History Rhymes telemetry-cockpit refactor in Winston / Consulting_app.

Read first:
- docs/plans/03-implementation-plans/active/history-rhymes-telemetry-cockpit-refactor.md  (the dispatch record — PR table, verified contracts, honesty rules)
- docs/plans/history-rhymes/architecture.md
- docs/plans/history-rhymes/backlog.md

Objective: pick up the first unchecked PR in the backlog's cockpit-refactor list and implement
exactly that scope. One PR per session unless told otherwise. ADO story IDs are in the backlog —
move the story to Active at start, Resolved when code+tests+evidence are ready, and append an
audit comment (branch/commit/PR, files, tests, evidence).

Hard rules (from the dispatch record):
- Do not rename or reshape /api/hr/v1/* or /api/v1/rhymes/*.
- Fail closed: every zone renders an explicit degraded/empty state with a concrete reason string.
- Degraded_reason strings from the backend matrix appear verbatim in UI and tests.
- v1 placeholder scenarios render as pending, never as real probabilities.
- No silent stream fallback; mode and source always labeled.
- Cockpit copy avoids buy/sell/trade/position-size language.

Test gates per PR:
cd repo-b && npx vitest run src/components/historyrhymes/ src/lib/historyrhymes/
cd repo-b && npm run typecheck && npm run lint
cd repo-b && npx playwright test tests/historyrhymes-cockpit.spec.ts tests/historyrhymes-planning.spec.ts
cd backend && python -m pytest tests/test_history_rhymes.py tests/test_hr_stream_*.py -q   (backend PRs)

Update docs/plans/history-rhymes/{backlog,next-session}.md and the dispatch record status table
before finishing. Reusable lessons go to docs/tips.md.
```

## Context notes
- Branch chain is stacked PRs off main (feat/hr-cockpit-NN-*); retarget stacked PRs before deleting base branches after merges.
- The execution layer skill (`skills/historyrhymes-execution-layer/SKILL.md`) owns the daily decision routine; the cockpit consumes its outputs read-only.
- Schema 10016 is reserved for HR streaming (10015 is doc-reserved by the telemetry streaming slice). Re-glob before merging PR 12.
