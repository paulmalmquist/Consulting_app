# Next Session - RS Factory Digital Thread PR 3

**Last updated:** 2026-06-27

> **Shipped (2026-06-27) — AI Build & Operations Reference page (telemetry, static, no migration):**
> New document-style reference at `/lab/env/[envId]/telemetry/ai-build-ops` (nav "AI Build & Ops" under
> Evidence & Lineage) answering "how was this demo built and how is it operated" — page-by-page AI
> inventory, AI-skill map, runtime AI layers, REST endpoint map, MCP tool map, CLI/DevOps, CI/CD gates,
> evidence checklist, honest boundaries. Pure static manifest (`repo-b/src/components/telemetry/
> reference/manifest.ts`) where every claim-bearing row cites a real file/route via `sourceRefs`; no
> fetch, no new API, no DB change. typecheck + lint clean, vitest 13/13, `npm run build` compiles the
> route. **Follow-up:** keep the manifest in step with the code (it's the only drift risk); an
> authenticated browser screenshot wasn't captured this session (route is auth-gated) — verified by
> build + render tests instead.

> **Shipped (2026-06-25) — Residual-vs-threshold chart on Replay (research-gap Ticket 6a, PR #375 → main, prod-verified):**
> Frontend-only (no migration, no backend deploy — reads the threshold Ticket 2 already deployed). The
> Replay page gained a **"Model residual vs serving threshold"** chart that plots residual `|value−rmean|`
> against the frozen serving redline with model-fired ticks marked — making the Ticket-2 divergence
> *visible*: on D-4 every fired tick sits **below** the redline, so the serving global-scale fallback can't
> reproduce the champion's firing. The "Why this verdict" card's stale `score/threshold/margin: Not
> available` row is replaced with the real serving threshold (0.1355) + `0 of 412 fired ticks above it`.
> New pure `residualSeries()` adapter helper + 3 tests; full telemetry suite 232; visual gate 1280×900 dark.
>
> **Research-gap remediation — accurate status (the plan doc `telemetry-research-gap-remediation.md` is
> STALE; verified against `main` 2026-06-25):** Ticket 1 (security posture + RLS test) and Ticket 3 (MCP
> tools) are MERGED (#245, #283) despite the doc marking them pending. Of the rest, **only Ticket 6 was
> migration-free with no product decision**, and 6a (above) shipped it for the Replay surface.
> - **Ticket 6b (prediction-receipt viewer) is BLOCKED on the Replay surface by the same divergence:** the
>   replay verdict comes from `model_pred` (the fixture), and `/score` returns GO for every D-4 window
>   (residuals below the global threshold), so **no `NO_GO` `tel_predictions` receipt exists for the replay
>   run** — `get_triggering_prediction` fails closed there. The fetch fns (`get_triggering_prediction`/
>   `get_prediction`/`get_predictions_by_window`) already exist and are wired as copilot MCP tools, just not
>   as REST routes. Real receipts live in the seeded predictions on **Control Tower / Monitoring** — so 6b
>   belongs there (drill into a listed real prediction), which needs a thin route + a deploy + a small
>   placement decision. Not a clean Replay-surface push.
> - **Tickets 4, 5, 7, 8, 9 each need a new DB migration and/or a product decision** (entity-ontology table
>   design; TRR-vs-draft-report scope overlap; real-vs-simulated agent write; risk-tier taxonomy + incident
>   table). Left for an explicit decision rather than autonomous marching.
>
> **Shipped (2026-06-25) — Replay Model Diagnostics API (Story #734, PR #369 squash-merged → main):**
> Made good on the #725 follow-up. `GET /api/telemetry/replay` now returns additive, DB-free
> `scoringDiagnostics` + `lineage`; the Replay Forensics drawer (Model/Evidence/Operator/Lineage) shows
> real provenance instead of only fail-closed placeholders. **scoringDiagnostics** exposes the frozen
> serving threshold `DETECTOR_THRESHOLD = MAD_K*GLOBAL_TRAIN_SCALE = 0.135467` (the same value `/score`
> applies). **The honest finding that reshaped the feature:** that threshold does NOT reproduce the
> champion's D-4 firing — **0 of 412 fired ticks** exceed it (max fired residual 0.070); the champion
> fired on a tighter **per-channel** scale the serving constants don't carry. So the surface states the
> **divergence** (`model_pred` stays authoritative) instead of deriving a per-tick verdict that would
> contradict the model — a per-tick "GO" next to a fired model is a contradiction, not honesty.
> **lineage** echoes the reproducibility chain; the Lineage tab renders live Databricks/MLflow links via
> `factoryEvidenceLinks`. Held-out metrics still come from `/api/telemetry/model-performance`.
> Backward-compatible (existing keys + `feed[]` unchanged). **Gates:** backend 12/12, frontend adapter +
> drawer 25/25, full telemetry suite 208, typecheck + lint clean; visual gate at 1280×800 dark (local
> render of the merge commit via a stdlib mock backend that proxies non-replay calls to prod). Branch
> `feat/replay-model-diagnostics` off main; backend deployed via `scripts/deploy_backend.sh`. ADO Story
> #734 (Feature #513 / Epic #497). Lessons in `docs/tips.md` (replay diagnostics sources, MLflow/Databricks
> linking, the divergence trap, mock-backend visual gate).
>
> **Shipped (2026-06-24) — Replay Forensics UI v2 (Story #725, PR open to main):** Upgraded
> `/lab/env/[envId]/telemetry/replay` (`repo-b/src/components/telemetry/ReplayConsole.tsx`) from a
> verdict poster into an inspectable forensics surface. New: a **source-truth banner** (public NASA
> SMAP/MSL stand-in, hot-fire-*style*, "not proprietary rocket hot-fire data"); a **run-packet strip**;
> **dual chart overlays** — red model-fired region vs amber NASA-labeled window — with a legend and an
> honest caption; an inspectable **"Why this verdict"** card; and a **5-tab "Replay forensics" drawer**
> (`ReplayForensicsDrawer.tsx`: Signal / Model / Evidence / Operator action / Lineage) on the Radix
> `drawerPrimitives` + `SectionTabButton`. All diagnostics math is in a pure, unit-tested adapter
> `repo-b/src/lib/telemetry/replayDiagnostics.ts` (no frontend metric constants). **Honesty surfaced,
> not hidden:** the champion first fires at **t=728, ~4,504 ticks BEFORE** the NASA label window
> **[5232–8472]** (141 pre-label false alarms — shown as such, never as lead time); the per-tick
> `score` is degenerate (~1e12) and is **never** a threshold; threshold / margin / physical-unit /
> sample-rate / held-out-F1 / stage-boundaries / top-channels all render explicit **"Not available —
> <reason>"**. Real held-out metrics + the conformal false-alarm budget are pulled **fail-closed** from
> `/api/telemetry/model-performance` + `/monitoring` (Model tab). Frontend-only, no migration. **Gates:**
> typecheck + lint clean; **19 new Vitest** (`replayDiagnostics.test.ts` 13, `ReplayForensicsDrawer.test.tsx`
> 6); full telemetry suite **143 pass**. Adversarial review (honesty / correctness / design / data-contract
> + verify): **6 fixed, 9 dismissed**. Delivered on branch `feat/telemetry-replay-forensics` (off main,
> commit cherry-picked clean) → PR to `main`; ADO Story #725 (Feature #513 / Epic #497) Resolved.
> **Next backend ticket (recommended):** expose model validation + scoring diagnostics from
> MLflow/Databricks into the replay API so the Model tab shows first-class numbers, not a pointer.

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

> ## Model Workbench + GCP migration (2026-06-27)
> The Model Workbench (Epic #497 / Feature #513, Stories #736–#746) is the inspectable, receipt-driven
> ML surface at `/lab/env/[envId]/telemetry/workbench`. Part I (S1–S5) shipped the experience
> (receipt contract, landing + headline card + lifecycle stepper + A/B/C selector, threshold-sweep tab +
> FP/FN drawer, champion review + Replay-receipt button, continuous prediction drill + MAD reconciliation).
> Part II migrates the ML **off Databricks onto GCP**: S6 provider-neutral cloud links (receipt-driven, no
> Lakebase DDL); S7 real BigQuery gold (`novendor-events-prod.telemetry.gold_smap_msl_windows`, 509,555
> rows) + real MAD_K threshold sweep + **exact parity** with the deployed champion (Δ=0, Databricks-free);
> S8 a real **Vertex Custom Training Job** (CPU, no endpoint) logging to Vertex Experiment
> `telemetry-predictive-maintenance` + GCS, exporting `experiment_runs.json` (provider=vertex); S9 real
> FP/FN `error_review.json` from BigQuery. Remaining: S10 (Vizier HPO + Vertex Model Registry promotion →
> `promotion_review.json`, MAD reconciliation gate) and S11 (drift/embedding/SHAP receipts) — backend
> kinds + routes + UI panels already scaffolded fail-closed. Conventions in `docs/tips.md` (Model
> Workbench). No Databricks dependency in the GCP proof path; no online Vertex endpoint.
