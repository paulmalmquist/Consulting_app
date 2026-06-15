# History Rhymes — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** NOT READY (unverified)

## Functional readiness
- [ ] Daily decision script runs without errors
- [ ] Trading routine page shows current decision
- [ ] Paper trading ledger is writable and readable
- [ ] Portfolio view shows open positions

## Data readiness
- [ ] HR table schema confirmed
- [ ] RLS enforced on trading tables
- [ ] Seed or real decision data available

## Test readiness
- [ ] Unit tests for decision service: MISSING
- [ ] Daily decision script smoke test: UNVERIFIED
- [ ] Integration tests: MISSING

## UX readiness
- [ ] Trading routine page loads without errors: UNVERIFIED
- [ ] Portfolio view renders correctly: UNVERIFIED

## Security / auth readiness
- [ ] Trading data scoped by env_id: UNVERIFIED

## Observability readiness
- [ ] Decision generation events logged: UNVERIFIED

## Streaming gates (telemetry cockpit refactor)
- [ ] HR_STREAM_MODE=off leaves the app fully inert (no background task, health = not_configured)
- [ ] Synthetic mode deterministic and broker-less (ring buffer; pytest green)
- [ ] Health endpoint never 500s and never exposes secrets (test-asserted)
- [ ] Migration 10016 additive, idempotent, hr_* exemption header, COMMENT ON TABLE everywhere
- [ ] Consumer fails closed on missing/invalid Kafka config with a degraded reason
- [ ] Replay preserves observed_at; no replayed data rendered as current without the replaying label
- [ ] No live Confluent connection enabled before synthetic/replay are proven

## Known blockers
- [ ] Daily decision script not verified
- [ ] Architecture unverified

## Release verdict

**Status:** NOT READY  
**Reason:** Decision script unverified; architecture unverified; no tests.
