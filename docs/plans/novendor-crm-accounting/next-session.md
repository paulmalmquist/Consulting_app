# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 3 — hierarchy migration)

Ticket 1 (logger bug) and the schema inventory are DONE. This session is **Ticket 3 only**.
Read first: `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`,
`docs/plans/novendor-crm-accounting/{architecture,backlog}.md`, `ARCHITECTURE.md`,
`repo-b/db/schema/525_execution_board.sql` + `604_cro_execution_task_re_engage.sql`,
`repo-b/db/schema/10002_history_rhymes_research_planning.sql` (numbering convention).

```
Before writing migration `10003_consulting_task_hierarchy.sql`, verify the current live
schema for `cro_execution_task` in Supabase project `ozboonlsplroialdwuxj`.

Do not assume the local schema files perfectly match production.

Confirm:
- existing columns
- existing enum/check constraints
- existing indexes
- existing RLS policies
- env scoping pattern
- current migration history / latest applied migration

Then write an additive-only migration that:
- extends `cro_execution_task` without duplicating existing status/type/priority/date fields
- adds hierarchy fields only where missing
- adds `cro_operating_domain`, `cro_initiative`, and `cro_workstream` reference tables if not already present
- keeps RLS/env scoping consistent
- seeds the five controlled domains
- seeds FlowYorker under `web_properties`
- seeds Novendor industry initiatives under `novendor_web`
- includes verification queries
- updates the active implementation plan and `docs/tips.md`

Do not change frontend UI in this ticket.
Do not add assistant retrieval yet.
Do not persist Morning Checklist rows yet.
```

Migration dry-run mindset (even without a formal dry-run tool): inspect live schema first,
then write the migration, then verify against a Supabase branch / local test DB — or at
minimum produce exact verification SQL in the migration file. Hierarchy column list and the
five controlled domain keys are in dispatch `0002` ("Domain model"). Do NOT touch
`app.task_*` or `nv_tasks` (unrelated task systems). The error-envelope normalization in
backlog.md is explicitly out of scope for Ticket 3.

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
