# Automated Data Engineering — environment notes

Planning folder for Automated Data Engineering (ADE): Winston surfaced as a governed
connector/skill fabric that turns a data request into ADO-tracked, skill-governed,
receipt-audited delivery. PR 1 names what already exists and ships the product skeleton:
docs, a read-only `/api/ade` API, and a portable control-room frontend. It rebuilds nothing.

## The operating loop

request → intake (ADO) → plan → governed skill execution → action → tests → PR → receipt

Every step already has machinery in this repo: MCP tool contracts and audit
(`backend/app/mcp/`), turn receipts (`backend/app/assistant_runtime/turn_receipts.py`),
the ADO backlog generator (`TELEMETRY_TEMPLATE/ado/`), and the 12-step ticket→PR loop in
`docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` (section 9). ADE is the surface that shows this
loop to a buyer, honestly.

## Files

| File | What it holds |
|---|---|
| `product-brief.md` | positioning, the five layers, what ships now vs roadmap |
| `architecture.md` | how the product maps onto existing code; portability classification |
| `connector-inventory.md` | per-provider status table (`live\|stub\|script\|missing`), the single doc source of truth |
| `security-and-trust-boundaries.md` | PR 1 read-only guarantees and fail-closed rules |
| `backlog.md` | pointer to the ADO import files + PR 1 status |
| `roadmap.md` | deferred work (provider abstraction, net-new connectors, analytical engine) |
| `eval-plan.md` | the PR 1 acceptance matrix as the durable test plan |
| `next-session.md` | handoff for the next session |
| `ado/` | import-ready ADO backlog files (generator + CSV + PS1; not run against the board) |

## Status

PR 1 in flight. Scope: this folder, two ADRs (`docs/adr/automated-data-engineering/`),
read-only backend route `backend/app/routes/automated_data_engineering.py`, portable
frontend package `repo-b/src/components/automated-data-engineering/` mounted in the
telemetry environment, and the ADO import files. No live board mutation, no migrations,
no provider code.
