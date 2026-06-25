# Next Session - RS Factory Digital Thread PR 3

**Last updated:** 2026-06-24

> **Implemented locally (2026-06-25) — Agent Builder eval lifecycle + staged gate:** Story #735 adds
> migration `10036_agent_builder_evals.sql`, persisted suites/cases/runs/results/failure memory,
> deterministic graph/tool/permission/fail-closed/cost/regression/replay checks, failed-run promotion,
> and a staged-only publish gate. Production publish/run remains fail-closed. Focused verification:
> 79 backend regressions, 15 frontend regressions, typecheck/lint/ruff green; targeted 10035+10036
> dry-run parsed 65 statements. No database URL is configured locally, so migration application and
> authenticated browser evidence remain pending. Active plan:
> `docs/plans/03-implementation-plans/active/0010-agent-builder-eval-publish-gate.md`.
>
> **Implemented locally (2026-06-25) — Agent Builder read-only MVP:** Story #478 now has the governed
> `agent-graph/v1` builder, immutable draft versions, read-only MCP registry binding, live bounded
> prompt nodes, synchronous dry-runs, ordered events/receipts, six draft templates, and the six-mode
> Control Tower UI. Migration `10035_agent_builder_mvp.sql` is additive and dry-run parsed but was not
> applied. Focused backend regressions: 87 pass; telemetry/frontend regressions: 172 pass;
> typecheck/lint pass. Full frontend remains red only in the unrelated REPE fund-page loading suite
> (three failures in the final run; five in the initial baseline) under the operator-approved
> exception. The full backend suite exceeded ten minutes. Next: apply/verify 10035 in an authorized DB,
> run authenticated desktop/mobile smoke, then
> apply and verify the Agent Builder schema and run authenticated smoke. Plan:
> `docs/plans/03-implementation-plans/active/0009-agent-builder-read-only-mvp.md`.

> **Shipped (2026-06-24) — Replay Forensics UI v2 (frontend-only, NOT yet committed/PR'd):** Upgraded
> `/lab/env/[envId]/telemetry/replay` (`repo-b/src/components/telemetry/ReplayConsole.tsx`) from a
> verdict poster into an inspectable forensics surface. New: a **source-truth banner** (public NASA
> SMAP/MSL stand-in, hot-fire-*style*, "not proprietary rocket hot-fire data"); a **run-packet strip**;
> **dual chart overlays** — red model-fired region vs amber NASA-labeled window — with a legend and an
> honest caption; an inspectable **"Why this verdict"** card; and a **5-tab "Replay forensics" drawer**
> (`ReplayForensicsDrawer.tsx`: Signal / Model / Evidence / Operator action / Lineage) built on the
> Radix `drawerPrimitives` + `SectionTabButton`. All diagnostics math lives in a pure, unit-tested
> adapter `repo-b/src/lib/telemetry/replayDiagnostics.ts` (no frontend metric constants).
> **Honesty surfaced, not hidden:** the champion first fires at **t=728, ~4,504 ticks BEFORE** the NASA
> label window **[5232–8472]** (141 pre-label false alarms — shown as such, never as lead time); the
> per-tick `score` is numerically degenerate (~1e12) and is **never** drawn as a threshold; and
> threshold / margin / physical-unit / sample-rate / held-out-F1 / stage-boundaries / top-channels all
> render an explicit **"Not available — <reason>"**. Real held-out metrics + the conformal false-alarm
> budget are pulled **fail-closed** from `/api/telemetry/model-performance` + `/monitoring` (Model tab).
> No DB migration, no backend change. **Gates:** typecheck + lint clean; **19 new Vitest** tests
> (`replayDiagnostics.test.ts` 13, `ReplayForensicsDrawer.test.tsx` 6); full telemetry suite **143
> pass**. A 4-dimension adversarial review (honesty / correctness / design-regression / data-contract)
> with a verify pass fixed **6 confirmed** findings and dismissed **9** (incl. 3 false "lint-break"
> claims). **Held for owner decision** before commit/PR: (a) ADO intake/Session-Brief, (b) branch off
> `main` vs the in-flight `fix/telemetry-stream-partition-ddl`. **Working-tree note:** the concurrent
> Factory ML evidence-drawer workstream (below) also edits `primitives.tsx`; keep replay-forensics
> commits scoped to the 5 replay files. **Next backend ticket (recommended):** expose model validation
> + scoring diagnostics from MLflow/Databricks into the replay API so the Model tab shows first-class
> numbers, not a pointer. Reusable lessons captured in `docs/tips.md`.

> **Shipped (2026-06-24):** Factory ML drillable evidence surface. The Model Quality, Registry, NCR
> Intelligence, and Readiness tabs are now click-into-evidence: every metric card, SHAP feature,
> registry version/champion badge, live MLflow run, NCR category/exemplar, and vehicle opens a shared
> `FactoryEvidenceDrawer` (Radix shell copied from `metadata/LineageDrawer.tsx`). The SHAP "top drivers"
> chart was rewritten from recharts to a custom left-justified clickable label gutter + bar area.
> New libs (all unit-tested): `factoryEvidenceLinks.ts` (live-by-default Databricks/MLflow deep links
> to the dbc-2504bec5-b5ab workspace, disabled-with-reason only when an identifier is missing),
> `factoryFeatureCatalog.ts` (name-inferred feature defs, units-unknown marked),
> `factoryMetricGlossary.ts` (honest weak-metric bands — AUC≈0.51 → near-random, R²<0, Brier poor),
> `factoryPromotionRationale.ts` (derived why-champion/why-not from registry JSON). Drawers carry an
> "Operational use" decision-relevance line + a reviewer-questions block. tsc/lint/tests green; 29 new
> tests. **Deferred:** data-backed feature units / per-version promotion gates need the next Databricks
> regen (TODO left in `skills/rs-factory-ml/scripts/export_dashboard_json.py`); Layer Heatmap drill not
> added this pass.

> **Shipped (2026-06-19):** Telemetry demo→real data audit + Spike Inspector conversion. Full
> data-source classification in [`data-source-matrix.md`](./data-source-matrix.md); the Spike Inspector
> now reads real analyzer findings via the new thin route `GET /api/telemetry/findings`
> (`backend/app/routes/telemetry.py`, delegates to `telemetry_analyzer`) with a Data Source Audit
> provenance panel and fail-closed states — static `DEMO_SPIKES` deleted. Genuinely-local gaps are
> tracked in [`local-seed-backlog.md`](./local-seed-backlog.md) (NCR mirror, fused vectors, stream
> worker, stargate bridge, calibration endpoint, post-change watcher, Gemma/Vertex). **Next pickup for
> this track:** the top backlog item is the **NCR Databricks mirror seed** so `/telemetry/factory`
> renders real clusters instead of failing closed; after that, a post-change-degradation analyzer
> finding family (needs a watcher table). telemetry-demo seeding verified: 59,898 predictions / 104
> drift / 102 anomaly events / 6 model runs.

> **Parallel track (research gap remediation):** A 2026-06-18 inspection compared the research reports
> against the actual telemetry code and produced
> [`docs/plans/03-implementation-plans/active/telemetry-research-gap-remediation.md`](../03-implementation-plans/active/telemetry-research-gap-remediation.md).
> Its **recommended first PR** is *Ticket 1 — Security & Access Posture panel + cross-tenant RLS
> permission-leak test* (no migration, no deploy; adds the first automated cross-tenant isolation test
> and an honest enforced/not-enforced posture panel on `/telemetry/governance`). Pick that up if not
> continuing RS Factory PR 3. The plan also flags a **working-tree hazard**: 83 uncommitted deletions
> (RUL Calibration screen + notebooks, ADE/audit-dashboard/workflow-registry, telemetry-trust/
> calibration plans) that must NOT be committed as part of gap remediation.

> **Also shipped (2026-06-17):** the "How This Works" architecture & evidence exhibit — dispatch
> `docs/plans/03-implementation-plans/active/0008-telemetry-how-it-works-exhibit.md`, ADO Story #654
> (Feature #513 / Epic #497), route `/lab/env/[envId]/telemetry/how-it-works`, branch
> `feat/telemetry-how-it-works`. Companion interview docs live in this folder
> (`RS_DEMO_SCRIPT.md`, `RS_INTERVIEW_TALK_TRACK.md`, `RS_EVIDENCE_CHECKLIST.md`,
> `architecture-mermaid.md`). Open follow-up: production-verify the deep-links on novendor.ai and
> promote those rows from `code_verified` to `prod_verified` in `howItWorksData.ts`.

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
