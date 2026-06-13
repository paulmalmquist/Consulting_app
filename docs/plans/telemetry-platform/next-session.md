# Next Session - RS Factory Digital Thread PR 3

**Last updated:** 2026-06-11

The existing telemetry platform remains the only user-facing environment. RS Factory work is
additive inside that environment; do not create another template or top-level route.

## Current state

- ADO Story `#518` owns PR 1; ADO Story `#529` owns generator PR 2.
- PR 1 ends at `94205e18`; PR 2 is isolated on `feat/rs-factory-generator-pr2` / PR `#148`.
- `rs_factory_seed/` implements deterministic g01-g11 generation across CRM, PLM, ERP, MES,
  QMS, test/IoT, Jira, docs/RAG, AI/ML, gold frames, and data-quality findings.
- CSV, SQLite, Parquet, JSONL, generated DDL, SQLite views, and Q01-Q12 queries are emitted.
- No telemetry runtime, migration, seed-pack, streaming, or frontend files changed in PR 2.

## Copy-paste prompt

```text
Work in the Winston / Consulting_app repository on RS Factory integration PR 3 only.

Read:
- CLAUDE.md
- docs/WINSTON_CODING_SESSION_INSTRUCTIONS.md
- docs/plans/PLAN_MAINTENANCE_RULES.md
- docs/plans/RS_DEMO_CAPABILITY_CHECKLIST.md
- convo.md
- rs_factory_seed/README.md

Product constraint: extend the existing telemetry environment only. Do not create a new environment
template, top-level route, seed pack, migration, backend endpoint, streaming producer, or frontend tab
in this PR.

Implement:
- migration 10016 for curated/gold `rsf_` tables with RLS, comments, indexes, and partitions
- update the existing telemetry template arrays without changing its default seed pack
- `telemetry_factory_starter` as a superset of `telemetry_starter`
- full-profile loader and fail-closed, watermark-driven ETL runner
- backend tests for stamping, idempotency, assertions, and telemetry regressions

Use the frozen generator artifacts as inputs. Preserve every existing telemetry route, page,
seed-pack behavior, and template key. Do not add a standalone RS Factory environment or route.
```

The prior telemetry-only optional items remain tracked in `backlog.md` and
`release-readiness.md`; they are not part of the RS Factory generator work.
