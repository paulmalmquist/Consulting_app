# History Rhymes — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Daily decision script status** — `scripts/hr_daily_decision.py` — Run this script and verify it completes without errors. Document output format.
- [ ] **Trading routine page data** — `/lab/env/[envId]/historyrhymes/routine` — Confirm this page shows today's decision, not an empty state or stale data.

## UX improvements
- [ ] **Portfolio P&L view** — `/lab/env/[envId]/markets/portfolio` — Verify positions are shown with unrealized P&L and entry prices.
- [ ] **Decision history** — Confirm there is a way to browse past decisions, not just the current one.

## Backend / API
- [ ] **Rhymes endpoint response shape** — `backend/app/routes/rhymes.py` — Document the response shape (regime, signal, rationale, positions) so frontend can render correctly.
- [ ] **Weekly brief generation** — `scripts/hr_weekly_brief.py` — Run and verify it produces a complete brief.

## Data / migrations
- [ ] **HR table schema** — Needs repo verification. Identify Supabase tables for decisions, positions, and trades.
- [ ] **Paper trading ledger** — Confirm writes to the ledger persist correctly and are readable.

## Tests
- [ ] **No known tests for history_rhymes_service.py** — Needs unit tests for decision logic.
- [ ] **No known integration tests for daily decision pipeline** — Needs end-to-end test.

## Documentation
- [ ] **Link build plans** — `docs/plans/HISTORY_RHYMES_BUILD_PLAN.md` and `TRADING_PLATFORM_REBUILD_PLAN.md` — Reference from architecture.md.

## Nice-to-have
- [ ] Telegram/Slack notification for daily decision
- [ ] Drawdown alert system

## Completed
_(none yet)_
