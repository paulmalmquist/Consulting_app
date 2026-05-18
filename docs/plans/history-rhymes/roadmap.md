# History Rhymes — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify `scripts/hr_daily_decision.py` runs without errors
- [ ] Verify trading routine page renders today's decision
- [ ] Confirm paper trading ledger is writable
- [ ] Confirm RLS on trading/decision tables

## Phase 1: Make the UI/operator flow coherent
- [ ] Trading routine page shows today's regime call, position sizing, and rationale
- [ ] Portfolio view shows current positions with P&L
- [ ] Decision history is scrollable and searchable
- [ ] Weekly brief is generated and accessible

## Phase 2: Wire deeper data/API behavior
- [ ] Market rotation signals visible in real time
- [ ] Podcast intelligence feeds market context
- [ ] Backtesting results visible in the lab
- [ ] MLflow experiments accessible from the UI

## Phase 3: Testing, instrumentation, release gates
- [ ] Unit tests for decision service
- [ ] Integration tests for daily decision pipeline
- [ ] Smoke test: `python scripts/hr_daily_decision.py --dry-run`
- [ ] Paper trading ledger reconciliation check

## Phase 4: Polish / demo readiness
- [ ] Demo: Winston explains today's regime call in plain English
- [ ] Historical decision replay for any date
- [ ] Risk dashboard with drawdown and Sharpe metrics

## Reference
- `docs/plans/HISTORY_RHYMES_BUILD_PLAN.md`
- `docs/plans/TRADING_LAB_ENHANCEMENT_PLAN.md`
- `docs/plans/TRADING_PLATFORM_REBUILD_PLAN.md`
- `skills/historyrhymes/SKILL.md`
- `skills/historyrhymes-execution-layer/SKILL.md`
