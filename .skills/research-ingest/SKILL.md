---
name: research-ingest
description: Ingest a completed research report under docs/research, extract findings and constraints, and produce a surface-assigned Winston implementation plan. Use for "ingest research", "build plan from", "process report", or an explicit docs/research path.
---

# Research Ingest

1. Read one completed report under `docs/research/`.
2. Confirm it is ready rather than draft.
3. Extract the core question, verified findings, constraints, dependencies,
   contradictions, and unknowns.
4. Map tasks to current surfaces:
   - frontend and route handlers → `repo-b/`
   - canonical APIs and domain services → `backend/`
   - telemetry ML/pipeline → `telemetry-platform/`
   - schema/persistence → `repo-b/db/schema/`, `supabase/`, or the documented
     external serving store
   - orchestration/skills → `orchestration/`, `scripts/`, `skills/`, `.skills/`
5. Produce phased tasks with owner, paths, dependencies, risk, acceptance
   criteria, tests, and explicit non-goals.
6. Classify each implementation task R1 or R2. Use ADO intake only when the
   task requires it or the user requests board creation.
7. Update report status and `docs/tips.md` only when explicitly part of the
   approved ingestion scope.

Do not summarize without producing an actionable plan, invent implementation
facts, or route work to retired surfaces.
