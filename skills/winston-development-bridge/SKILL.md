---
id: winston-development-bridge
kind: skill
status: active
source_of_truth: true
topic: development-asset-bridge
owners:
  - backend
  - repo-b
  - supabase
intent_tags:
  - build
  - docs
  - data
triggers:
  - development bridge
  - dev bridge
  - construction development
  - PDS to REPE
  - project to asset link
  - development portfolio
  - scenario impact
  - fund impact
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
  - qa-winston
when_to_use: "Use when the task is to build or repair the construction/development bridge between PDS projects, construction finance, and REPE assets: schema linkage, assumptions, scenario outputs, fund impact, seed alignment, or the development workspace UI."
when_not_to_use: "Do not use for generic REPE asset work, standalone PDS analytics work, or isolated finance tables that do not participate in the project-to-asset bridge."
surface_paths:
  - MEGA_META_PROMPT_CONSTRUCTION_DEV.md
  - backend/app/routes/dev_bridge.py
  - backend/app/services/dev_asset_bridge.py
  - backend/app/services/dev_bridge_seed.py
  - repo-b/src/app/lab/env/[envId]/re/development/
  - repo-b/db/schema/398_development_asset_bridge.sql
name: winston-development-bridge
description: "Construction and development bridge skill for Winston. Use for linking PDS projects to REPE assets, managing development assumptions and draw schedules, seeding Meridian bridge data, and maintaining the development portfolio/detail workspace."
---

# Winston Development Bridge

This skill turns the large construction/development brief into a reusable workflow for the real bridge already living in the repo.

## Load Order

- `../../MEGA_META_PROMPT_CONSTRUCTION_DEV.md`
- `../../PDS_report.md` only when the request needs the executive PDS framing behind the bridge

## Working Rules

- Preserve the existing REPE object model, construction-finance tables, and PDS core. Bridge them; do not duplicate them.
- Treat the schema link, seed alignment, backend calculations, and frontend workspace as one feature slice. A partial bridge is usually a broken bridge.
- Keep development projections as read-only overlays and comparison outputs. Do not rewrite canonical REPE quarterly state just to make the UI look integrated.
- Use the Meridian development seed as the anchor for realistic verification whenever the task touches demo flows or portfolio summaries.

## Prompt Lessons From The Source Doc

- The brief works because it clearly separates what must be preserved from what can be added.
- The durable implementation pattern is bridge-not-rebuild: map project execution reality into assumptions, compare scenarios, then show fund impact.
- Requests in this area go off track when they talk about "development" in the abstract without naming whether the change is schema, seed, calculations, or UI.

## Exit Condition

- Verify one linked project can be loaded through the development portfolio and detail surfaces.
- Verify assumptions and scenario/fund impact are computed from the bridge layer without mutating the canonical REPE state model.
