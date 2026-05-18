# Next Session — History Rhymes

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on History Rhymes / Trading Research in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/history-rhymes/architecture.md
- docs/plans/history-rhymes/backlog.md
- docs/plans/HISTORY_RHYMES_BUILD_PLAN.md
- skills/historyrhymes-execution-layer/SKILL.md
- scripts/hr_daily_decision.py

Objective:
1. Run the daily decision script and verify it completes without errors.
2. Verify the trading routine page renders today's decision.
3. Identify the Supabase tables for decisions, positions, and trades.
4. Document findings in docs/plans/history-rhymes/architecture.md.

Files to inspect:
- scripts/hr_daily_decision.py
- backend/app/routes/rhymes.py
- backend/app/services/history_rhymes_service.py
- backend/app/schemas/trading.py
- repo-b/src/app/lab/env/[envId]/historyrhymes/routine/

Acceptance criteria:
- [ ] Daily decision script runs without errors
- [ ] Trading routine page shows a decision (not empty)
- [ ] Supabase table names confirmed in architecture.md
- [ ] Response shape of rhymes endpoint documented

Tests to run:
python scripts/hr_daily_decision.py
cd backend && python -m pytest tests/ -k "rhymes or trading" -v

Update docs/plans/history-rhymes/next-session.md and backlog.md before finishing.
```

## Context notes
- The execution layer skill (`skills/historyrhymes-execution-layer/SKILL.md`) owns the daily decision routine
- MLflow experiments may be on Databricks — verify before assuming local
- Paper trading ledger appends should be non-destructive
