# Stone PDS / Professional Services Analytics

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

Stone PDS is the Professional and Delivery Services analytics environment. It tracks utilization, revenue, satisfaction, adoption, capacity, project status, resource allocation, and executive reporting for consulting and delivery operations. It is typically deployed for professional services firms tracking billable work, client engagements, and delivery health.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `docs/plans/PDS_DEEP_RESEARCH_PLAN.md` — deep research plan for PDS
- `docs/pds/` — PDS-specific docs folder
- `skills/winston-pds-delivery/SKILL.md` — PDS delivery prompt skill
- `backend/app/routes/pds*.py` — 12 backend routes
- `backend/app/services/pds_*.py` — 10+ services

## First recommended next session

Read `next-session.md`. Start by verifying that the utilization and revenue dashboards render real data for at least one PDS environment.
