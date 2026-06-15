# Planning code and DevOps in tandem

The discipline: for each Story, design the code change and the delivery path **at the same time**, in one paired plan. DevOps is part of the design, not a step you improvise after the code compiles.

## Why tandem

When DevOps is an afterthought, you discover late that a change needs a migration gate, a new CI stage, an approval, or a rollback you didn't plan — and the branch is already a mess. Designing both together means the branch name, the gates, and the evidence are known before the first commit, so the work flows straight to a clean PR with receipts.

## The paired plan (fill `assets/code-devops-plan-template.md`)

Two columns, decided together:

### Code plan
- **Surfaces touched:** files, routes, schema/tables, models — concrete paths.
- **Approach:** the smallest change that satisfies the acceptance criteria; note alternatives rejected.
- **Tests:** unit tests; data assertions (Dataform/SQL) and a **dry-run cost check** where queries are involved; regression guard for what must not break.
- **Definition of Done:** docs updated, peer review, non-functional checks (reuse/perf/data-quality); **Responsible Engineer sign-off + FRR criterion** if the change is flight-facing.

### DevOps plan (same sitting)
- **Branch:** `feat/<slug>` (or `fix/`, `chore/`), and the commit/PR carries the work-item link `AB#<id>` so the board state rolls up.
- **CI stages that must pass:** the repo's GitHub Actions jobs (`check-mass-deletion`, `backend-lint`, `repo-guardrails`, `frontend-quality`, `db-schema-gate`, `production-smoke`, `winston-first-mile`) and, for analytics work, `dataform compile` / `dataform test` / dry-run cost.
- **Pipeline changes:** any new stage or gate this work introduces.
- **Risk class & gate:** Low → peer review; Medium → peer + owner; High (certified metric, schema, IAM, deploy, writeback, >100 GB scan) → human approval + CCB, and RE + FRR if flight-facing.
- **Evidence to attach:** test output, dry-run bytes/cost, lineage check, dashboard link, screenshots — the receipt trail on the work item.
- **Rollback/backout:** the documented way to undo (NCF's "implementation plan with backout steps"); for data, Bronze enables full reprocessing.

## State flow (board ↔ repo)

| Event | Work-item state |
|---|---|
| Paired plan approved, branch created (`AB#<id>`) | Active |
| PR opened, evidence attaching | Active |
| CI green + PR merged | Resolved |
| production-smoke / mark-refreshed passes in prod | Closed (one-way DONE) |

Missed scope after Done becomes a new work item — never a silent reopen.

## Hand-off

Once the paired plan exists and the gate is known, hand the build to `feature-dev`. This skill's job is finished when the plan is written and the DevOps path is decided — implementation belongs to feature-dev, evidence a