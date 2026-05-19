# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 5 — assign tasks to domains, write-path)

Tickets 1, 2, 2B, 3, and 4 are DONE & production-verified. The board reads + displays
hierarchy (filter strip + per-card crumb), backend returns the fields, four lanes intact.
Current honest state: **all live tasks have NULL `domain_key`** (everything renders under
"Ungrouped") because nothing assigns hierarchy yet. This session adds the write-path so
tasks can actually be placed into a domain/initiative/workstream.

Read first: `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`
(Workstream C/Ticket 4 result + Workstreams D/E/F), `docs/plans/novendor-crm-accounting/{architecture,backlog}.md`,
`docs/plans/01-shared-standards/design-system/shell-navigation-rules.md`,
`repo-b/src/components/consulting/execution/ExecutionTaskDrawer.tsx` (task edit surface),
`repo-b/src/components/consulting/execution/ExecutionBoard.tsx` (quick-capture),
`backend/app/services/execution_tasks.py` (update path) + `backend/app/schemas/consulting.py`
(`ExecutionTaskUpdate` / `ExecutionTaskCreate`), the seeded reference tables
(`cro_operating_domain` / `cro_initiative` / `cro_workstream`, env
`62cfd59c-a171-4224-ad1e-fffc35bd1ef4`, `business_id` `225f52ca-cdf4-4af9-a973-d1d310ddcba1`).

```
Add the write-path to assign domain_key / initiative_key / workstream_key to a
task. Minimum viable, low-risk:

Backend (additive, no schema change — 10003 columns are live):
- Allow domain_key/initiative_key/workstream_key on the task UPDATE path
  (ExecutionTaskUpdate + update_execution_task SQL). Validate the keys
  exist in the reference tables for the env; reject unknown keys with a
  clean 4xx (do NOT silently write garbage). parent_task_id optional.
- Optionally allow them on quick-capture/create if cheap; otherwise leave
  create flat and only support edit-to-assign this ticket.

Frontend:
- ExecutionTaskDrawer.tsx: add domain → initiative → workstream selectors
  (dependent dropdowns sourced from the reference tables via a small
  read endpoint or the board payload). Saving assigns the keys.
- Keep it inside the dark operator shell. No new left-nav item.
- Honest empty states; selectors clear cleanly back to Ungrouped.

Do NOT: persist Morning Checklist rows, add assistant/CoWork retrieval,
change the schema, touch app.task_*/nv_tasks, alter unrelated environments,
or fabricate reference data.
```

Need a reference-list read path (domains/initiatives/workstreams for the env) — check if
the board payload is enough or add a small additive `GET` endpoint. Verification: backend
route tests + `test_execution_board_route.py`, CI Frontend Typecheck (local typecheck not
possible in a fresh worktree — no `node_modules`; CI is the gate), production smoke that
assigning a domain to one task moves it out of "Ungrouped" into the right filter, and that
unknown keys are rejected. Work in a fresh `git worktree` off `origin/main` (primary tree
carries unrelated concurrent work). Deploy BOTH backend (Railway `authentic-sparkle`) and
frontend (Vercel repo-b — no auto-deploy) and production-smoke. Repo Guardrails `1000` /
repo-wide Backend Lint reds are documented pre-existing baseline (tips #18) — do not chase.

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
