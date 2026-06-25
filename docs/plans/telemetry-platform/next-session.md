# Next Session - RS Factory Digital Thread PR 3

**Last updated:** 2026-06-24

> **Shipped (2026-06-24) — Telemetry frontend production-readiness refactor (Story #722):** Seven PRs
> merged + live: **#320** shared UI primitives (`primitives.tsx` atoms + `chartPrimitives.tsx` +
> `evidenceCard.tsx` + `drawerPrimitives.tsx` + 14 tests) + the in-repo
> `repo-b/src/components/telemetry/TELEMETRY_FRONTEND_REFACTOR_INVENTORY.md`; **#322** thesis-first
> `TelemetryOverview`/`EvidenceCards` + `ModelEvidenceCard` dedup; **#323** color-coded nav rail
> (section accents, glowing active pill, gradient logo); **#324/#325** both metadata drawers onto the
> shared `DrawerWrapper`/`DrawerHeader`/`FieldRow`; **#326** RS palette unified into `C` (one-file
> recolor). All behavior-preserving; claim/null_reason strings byte-identical (card tests are the net).
>
> **Remaining refactor work (NEEDS THE DEFERRED SCREENSHOT-GATED VERIFY PASS — see the inventory doc):**
> the console god-splits + primitive normalization (GovernanceDashboard, Copilot, ControlTower,
> SpikeInspector, ReplayConsole, RulCalibration, ModelPerformance, etc. — these are *near*-duplicates,
> so adopting primitives normalizes pixels = a visual change, not a free dedup); `TelemetryMetadataExplorer`
> controller/visualization split; folding `RsPanel`/`RsChip`/`RsKpi` fully into the `C` primitives +
> `BottleneckMap`; chart-frame adoption. Do these behind a local-run + reviewer-login screenshot pass
> (Overview, Evidence, Stargate, Replay, Model Performance, System Health, Trust/Lineage, RS surfaces),
> each annotated cleaner-layout / same-data / same-fail-closed / no-overclaim. The merged primitives +
> inventory make each piece mechanical. Lessons in `docs/tips.md` (telemetry refactor section).


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

> **Shipped (2026-06-24) — Telemetry Page Header System (dispatch 0009, all 4 tickets):** PRs #335 (foundation
> + Overview hero), #338 (operations → compact), #339 (models/factory → standard), + evidence/lineage →
> evidence. `TelemetryPageHeader` (hero/evidence/standard/compact) now leads every telemetry route; Overview
> is the only hero (editorial Cormorant). Added `tests/telemetry-page-headers.spec.ts` + doc updates
> (component-contracts, design-adaptation, qa-checklist, eval-plan, tips). All behavior-preserving; live
> data/chips/fail-closed in header slots. Remaining optional polish: header-system multi-viewport screenshot
> set under `telemetry-platform/docs/screenshots/header-system/`; deeper console component-splits (maintainability only).
