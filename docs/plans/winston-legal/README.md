# Winston Legal

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

Winston Legal is the AI-native legal operations environment. It supports contract management, matter tracking, outside counsel management, compliance, governance, spend analysis, litigation support, and AI-powered document intelligence for legal teams. It is one of the primary industry verticals for Novendor.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `docs/winston-legal/` — Winston Legal specific docs
- `docs/WINSTON_LEGAL_IMPLEMENTATION.md` (if exists) — implementation notes
- `skills/winston-pds-delivery/SKILL.md` — delivery skill (legal context)
- `backend/app/routes/winston_contract_admin.py` — contract admin backend
- `backend/app/routes/legal_ops.py` — legal ops backend
- `backend/app/services/environment_seed_packs_v2/legal_ops_starter.py` — seed pack for legal environments

## First recommended next session

Read `next-session.md`. Start by verifying the contract management and matter tracking flows using the legal ops seed pack.
