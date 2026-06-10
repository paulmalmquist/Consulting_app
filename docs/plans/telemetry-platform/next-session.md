# Next Session - RS Factory Digital Thread PR 2

**Last updated:** 2026-06-10

The existing telemetry platform remains the only user-facing environment. RS Factory work is
additive inside that environment; do not create another template or top-level route.

## Current state

- ADO Story `#518` owns PR 1 under Feature `#513`, Epic `#497`.
- `rs_factory_seed/` implements deterministic g01-g05 generation for CRM, PLM, ERP, and MES.
- Small-profile row volumes, references, natural keys, stable IDs, scenario anchors, intentional
  MES defects, and artifact determinism are covered by tests.
- PR 1 does not modify telemetry runtime code, migrations, seed packs, streaming, or frontend files.

## Copy-paste prompt

```text
Work in the Winston / Consulting_app repository on RS Factory generator PR 2 only.

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
- g06 QMS, g07 test/telemetry, g08 Jira, g09 docs/RAG, g10 ML/AI, g11 gold + DQ
- waveform, scoring, and DQ helpers
- Parquet and JSONL writers
- SQLite views and Q01-Q12 sample queries
- full scenario and determinism tests

Use scenario_config.yaml as the only source for scenario counts. Every intentional defect must carry
dq_defect_tag and produce exactly one data-quality finding. Preserve all g01-g05 contracts and the
existing telemetry behavior.
```

The prior telemetry-only optional items remain tracked in `backlog.md` and
`release-readiness.md`; they are not part of the RS Factory generator work.
