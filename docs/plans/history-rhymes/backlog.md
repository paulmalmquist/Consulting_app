# History Rhymes — Backlog

**Last updated:** 2026-06-12

## Telemetry cockpit refactor (active — dispatch record in 03-implementation-plans/active/)

ADO stories #541–#556 under Epic #213. Order is fixed: cockpit first, synthetic/replay second, live Kafka third.

- [x] PR 1 (#541) Plan + intake + credential safety
- [ ] PR 2 (#542) Cockpit shell: primitives, shell/nav, regime header, implications, routes, allowlist token
- [ ] PR 3 (#543) Signal telemetry strip (8 sensor tiles, missing-safe)
- [ ] PR 4 (#544) Streaming architecture doc + topic contract
- [ ] PR 5 (#545) Synthetic stream adapter (broker-less via ring buffer)
- [ ] PR 6 (#546) Stream health API + chip + admin diagnostics
- [ ] PR 7 (#547) Analog timeline + rhymes match integration
- [ ] PR 8 (#548) Alert/trap rail + acknowledge flow
- [ ] PR 9 (#549) Scenario pressure panel (placeholder-honest)
- [ ] PR 10 (#550) Evidence drawer
- [ ] PR 11 (#551) Kafka consumer scaffold (Confluent/Google config matrix)
- [ ] PR 12 (#552) Persist stream events/offsets (additive migration 10016)
- [ ] PR 13 (#553) Live cockpit updates (replay/runner/polling)
- [ ] PR 14 (#554) Research/planning demotion split
- [ ] PR 15 (#555) Episodes explorer + calibration status page
- [ ] PR 16 (#556) Visual polish, copy audits, degraded-backend e2e gate

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
