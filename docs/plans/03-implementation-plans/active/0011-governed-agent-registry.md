# Governed Agent Registry

**ADO:** Story #479 under Feature #477 / Epic #476  
**Risk:** Medium  
**Status:** Implemented locally; PR, deployment, and production registry smoke pending  
**Last updated:** 2026-06-25

## Outcome

Register the ten named governed agents as tenant-scoped Agent Builder draft templates without
introducing write-capable execution or parallel registry infrastructure:

1. Ticket Intake
2. Analytics Engineer
3. BigQuery SQL
4. Data Quality
5. Looker Dashboard
6. RAG Knowledge
7. CI/CD Evidence
8. Cost Watchdog
9. Release Notes
10. Executive Summary

The six existing demonstration workflows remain intact. The ten new graphs use `agent-graph/v1`,
bounded zero-tool/zero-cost limits, and a simulated capability gate. Until each integration has a
registered read-only contract, dry-runs block with an explicit reason and retain a
`NOT_AVAILABLE` terminal output definition.

## Implementation

- Extend the existing Agent Builder template catalog with stable `governed-*` keys.
- Reuse the tenant-scoped additive seeder and immutable version creation path.
- Tag new entries as `template`, `governed-agent`, and `read-only`.
- Keep runtime permissions, schemas, API routes, and frontend contracts unchanged.
- Preserve idempotency when registry access repeats or templates already exist.

## Verification

- Agent Builder backend suite: 28 passed.
- Isolated telemetry MCP suite: 8 passed.
- Isolated MCP registry/audit/context suite: 17 passed.
- Isolated AI dispatch and Control Tower suite: 41 passed.
- Ruff: passed.
- Frontend Agent Builder/Control Tower/proxy suite: 12 passed.
- Frontend typecheck: passed.
- Focused frontend lint: passed.
- A combined local backend command exposed pre-existing global MCP registry test pollution; the
  same tests pass when run in isolated processes, matching CI job behavior.
- Merge through CI, deploy, and verify the ten new tenant-scoped templates in production.

## Known production QA dependency

Authenticated visual smoke remains blocked until the production
`TELEMETRY_REVIEWER_USERNAME` and `TELEMETRY_REVIEWER_PASSWORD` values are populated. Production
API and persistence smoke remain available through scoped platform-session headers.
