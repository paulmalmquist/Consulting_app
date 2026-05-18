# Novendor CRM / Accounting Command Desk

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

This environment is the internal Novendor operating surface. It includes the CRM (contacts, deals, accounts), the Accounting Command Desk (expense ingestion, receipt processing, ledger operations), and the AI copilot layer that connects them. It is the system Novendor uses to run its own business.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next coding session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs and resources

- `design_handoff_accounting_command_desk/` — design handoff artifacts for the Accounting Command Desk
- `novendor-crm/` — CRM-related files
- `docs/novendor/` — Novendor-specific docs
- `skills/novendor-crm-supabase/SKILL.md` — CRM direct-DB skill
- `skills/winston-sales-intelligence/SKILL.md` — Apollo/CRM intelligence skill
- `backend/app/routes/nv_*.py` — 15 backend routes
- `backend/app/services/nv_*.py` — 20+ services

## First recommended next session

Read `next-session.md`. Start by verifying the Accounting Command Desk receipt ingestion flow and the CRM contact/deal CRUD. These are the two highest-traffic internal workflows.
