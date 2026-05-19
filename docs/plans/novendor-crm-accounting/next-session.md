# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 6 — Morning Checklist generated view)

Tickets 1–5 are DONE & production-verified. Full chain works live: schema (10003) →
read/display grouping (Ticket 4) → write-path (Ticket 5). Tasks can carry
domain/initiative/workstream and one live task is assigned `Web Properties →
FlowYorker.com → Content / SEO`. This session adds the **Morning Checklist**: a
read-time-generated daily brief over `cro_execution_task`. **Do NOT persist checklist
rows** — derive on read (the Domain model decision; persistence only if a later ticket
explicitly needs audit/review history).

Read first: `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`
(Ticket 5 result + Workstream G spec + "Morning Checklist" in the Domain model section),
`docs/plans/novendor-crm-accounting/{architecture,backlog}.md`,
`backend/app/services/execution_tasks.py` (`list_tasks`, `board_summary`) +
`backend/app/routes/consulting.py` (board route shape),
`repo-b/src/components/consulting/execution/ExecutionBoard.tsx` (where a brief panel could mount),
`docs/plans/01-shared-standards/design-system/shell-navigation-rules.md`.

```
Add a Morning Checklist: a generated, read-only daily brief derived from
cro_execution_task. No new table, no persistence, no assistant retrieval.

Backend (additive read-only):
- New GET endpoint (e.g. /execution/morning-checklist?env_id&business_id)
  that derives the brief from existing task data: top priorities for
  today (impact + revenue_tag + due_date + status='today'), overdue
  follow-ups, items per domain_key, what's next. Pure SELECT/derivation
  over cro_execution_task — no writes, no new table. Honest empty states
  if there are no tasks. Fail-closed on error.
- Reuse list_tasks / board_summary logic where possible; do not
  duplicate status/priority semantics.

Frontend:
- A "Morning Brief" panel/section on the tasks page (or a collapsible
  strip above the board). Read-only. Dark operator shell. No new
  left-nav item. Honest empty states. Lanes + filter strip unchanged.

Do NOT: persist checklist rows, add assistant/CoWork retrieval, change
the schema, touch app.task_*/nv_tasks, alter unrelated environments.
```

Verification: backend route tests + `test_execution_board_route.py` + the new brief
endpoint test (empty-env honest state + a populated case), CI Frontend Typecheck (local
not possible in a fresh worktree — no `node_modules`, tips #20; CI is the gate), prod smoke
that the brief renders and reflects the one assigned FlowYorker task. Work in a fresh
`git worktree` off `origin/main` (primary tree carries unrelated concurrent work). Deploy
BOTH backend (Railway `authentic-sparkle`) and frontend (Vercel repo-b — no auto-deploy)
and production-smoke. Repo Guardrails `1000` / repo-wide Backend Lint reds are documented
pre-existing baseline (tips #18) — do not chase. Assistant/CoWork retrieval over the brief
is a *later* ticket (Workstream H), explicitly out of scope here.

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
