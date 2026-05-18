# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-16  
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session

```
You are working on the Novendor CRM / Accounting Command Desk in the BusinessMachine platform.

Read first:
- docs/plans/novendor-crm-accounting/architecture.md
- docs/plans/novendor-crm-accounting/backlog.md
- design_handoff_accounting_command_desk/ (list files, read the most recent one)
- backend/app/routes/nv_accounting_desk.py
- backend/app/services/nv_accounting_queue.py

Objective:
1. Verify the ECC (Accounting Command Center) receipt ingestion flow works end-to-end.
2. Identify the Supabase tables for CRM contacts, deals, and accounting entries.
3. Confirm RLS is enabled on those tables.
4. Trace one receipt from submission through the accounting queue to the approval surface.
5. Document findings in docs/plans/novendor-crm-accounting/architecture.md.

Files to inspect:
- backend/app/routes/nv_receipt_intake.py
- backend/app/services/nv_accounting_queue.py
- backend/app/services/accounting_engine.py
- repo-b/src/app/lab/env/[envId]/ecc/ (all subpages)
- repo-b/src/app/api/ecc/ (all API routes)

Acceptance criteria:
- [ ] Supabase table names for CRM and accounting confirmed
- [ ] RLS status confirmed
- [ ] Receipt ingestion flow traced from frontend to DB
- [ ] Any broken steps documented in backlog.md

Tests to run:
cd backend && python -m pytest tests/ -k "nv or accounting or receipt" -v

Update docs/plans/novendor-crm-accounting/next-session.md and backlog.md before finishing.
```

## Context notes
- The Accounting Command Desk design handoff is in `design_handoff_accounting_command_desk/` — read it for intended UX before tracing implementation
- Apollo MCP tools are available for CRM enrichment
- Gmail MCP tools are available for inbound lead signals
- The `skills/novendor-crm-supabase/SKILL.md` skill handles direct CRM CRUD via Supabase
