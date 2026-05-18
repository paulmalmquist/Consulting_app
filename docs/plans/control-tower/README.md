# Control Tower / Environment Provisioning

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

Control Tower is the environment provisioning and management surface. It is where environments are created, configured, seeded, and linked to business contexts. It is the meta-layer above all other product environments.

## Plan files

- [architecture.md](architecture.md) — Implementation map: routes, services, tables, components
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next coding session
- [release-readiness.md](release-readiness.md) — Release gate status

## First recommended next session

Read `next-session.md` in this folder. The highest-value starting point is verifying that environment creation, seeding, and switching works end-to-end for a fresh environment.

## Key existing docs

- `docs/ENVIRONMENT_BLUEPRINT.md` — environment model and provisioning design
- `docs/CAPABILITY_INVENTORY.md` — what capabilities exist per environment type
- `backend/app/services/environment_seed_packs_v2/` — seed pack implementations
