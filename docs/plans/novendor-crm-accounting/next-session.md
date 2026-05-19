# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 4 — Tasks UI domain grouping)

Tickets 1, 2, 2B, and 3 are DONE & production-verified: logger bug fixed, `o.stage` SQL
fixed, board returns HTTP 200, and the additive hierarchy schema (`10003`) is applied +
verified live (10 columns on `cro_execution_task` + `cro_operating_domain`/`cro_initiative`/
`cro_workstream` ref tables + seeds for env `62cfd59c-a171-4224-ad1e-fffc35bd1ef4`,
`business_id` `225f52ca-cdf4-4af9-a973-d1d310ddcba1`). This session is **Ticket 4 only**.

Read first: `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`
(Workstream B/Ticket 3 result + Workstream C spec), `docs/plans/novendor-crm-accounting/{architecture,backlog}.md`,
`docs/plans/01-shared-standards/design-system/shell-navigation-rules.md`,
`repo-b/src/components/consulting/execution/ExecutionBoard.tsx`,
`repo-b/src/app/lab/env/[envId]/consulting/tasks/page.tsx`,
`backend/app/routes/consulting.py` (board route) + `backend/app/services/execution_tasks.py`.

```
Add domain/initiative/workstream grouping to the Consulting Tasks board WITHOUT
removing or breaking the existing Today / This Week / Waiting / Done lanes.

Backend first (read path only — no schema change, 10003 is already live):
- Surface domain_key / initiative_key / workstream_key (+ the new fields) in the
  board read API and join the cro_operating_domain / cro_initiative /
  cro_workstream reference tables to resolve labels.
- Missing reference rows must degrade to honest empty states ("No linked
  initiative" / "Ungrouped"), never error. Preserve fail-closed behavior.
- Do NOT duplicate status/type/impact/date fields — reuse existing.

Frontend:
- ExecutionBoard.tsx: add an optional domain grouping view + initiative/
  workstream filter. The four status lanes must still work exactly as today
  when no grouping is selected (default unchanged).
- Dark operator shell preserved; left nav stays ≤7 items (Pipeline,
  Accounting, Contacts, Tasks unchanged).
- Honest empty states for ungrouped/NULL-hierarchy tasks.

Do NOT: persist Morning Checklist rows, add assistant/CoWork retrieval,
change the schema, touch app.task_*/nv_tasks, or alter unrelated environments.
```

Verification: typecheck (`cd repo-b && npm run typecheck`), relevant backend route
tests + `test_execution_board_route.py`, Playwright smoke for `/consulting/tasks`,
dark-mode visual check, and a production smoke that the board still returns 200 and
existing lanes render. Work in a fresh `git worktree` off `origin/main` (the primary
tree may carry unrelated concurrent work). Repo Guardrails `1000` red is documented
pre-existing baseline (tips #18) — do not chase it.

Update dispatch `0002`, `backlog.md`, `next-session.md`, and `docs/tips.md` before finishing.

## Deferred (older session — Accounting Command Desk verification)

Still open, lower priority than the control-plane buildout. Verify ECC receipt ingestion
end-to-end (`backend/app/routes/nv_receipt_intake.py`, `backend/app/services/nv_accounting_queue.py`,
`repo-b/src/app/lab/env/[envId]/ecc/`), confirm CRM/accounting table names + RLS, trace one
receipt to the approval surface. Tests: `cd backend && python -m pytest tests/ -k "nv or accounting or receipt" -v`.

## Context notes
- The Accounting Command Desk design handoff is in `design_handoff_accounting_command_desk/` — read it for intended UX before tracing implementation
- Apollo MCP tools are available for CRM enrichment
- Gmail MCP tools are available for inbound lead signals
- The `skills/novendor-crm-supabase/SKILL.md` skill handles direct CRM CRUD via Supabase
