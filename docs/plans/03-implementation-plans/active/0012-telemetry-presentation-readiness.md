---
id: 0012-telemetry-presentation-readiness
kind: plan
status: active
owners:
  - repo-b
  - telemetry
  - lab-environment
intent_tags:
  - telemetry
  - frontend
  - drill-through
  - export
  - page-rationalization
ado_trace: "Epic #497 → Feature #721 (Telemetry Frontend Production-Readiness Refactor) → Story #722; spins #707/#716/#718/#719/#723/#726"
source_of_truth: false
related:
  - claim_coverage_matrix.md
  - PLAN_DIVERGENCE_REVIEW.md
  - docs/plans/telemetry-platform/
  - docs/plans/01-shared-standards/
---

# Phase 8 — Telemetry Presentation Readiness, Drill-Through, Export, Page Rationalization

## Goal

Make the telemetry environment read as one governed data product, not a pile of demo pages. The
through-line is "launch became a data problem": collect telemetry → transform into trustworthy
features and metrics → validate models honestly → trace a number back to its source rows or
artifact → give an operator a path from dashboard value → explanation → row-level evidence →
export. This phase does presentation, drill-through, export, and nav rationalization only. It does
not touch model semantics, ML evidence values, DB schema, or Databricks notebooks.

## Hard constraints (binding)

- **Preserve every shipped ML value and caveat.** The numbers and "must NOT overclaim" boundaries
  in `claim_coverage_matrix.md` are the contract. Do not reinterpret, strengthen, or improve any
  value. Specifically keep intact: Spin 1 regime anomaly (90% worst-regime FP reduction, η²=1.0→0,
  FD004, no anomaly labels); Spin 2 lead-lag (93% co-move, leads 9/14/11, ~11-cycle lag, simulated);
  Spin 3 conformal RUL (PICP 0.86 measured-not-guaranteed, 15/100 flip, FD001 not transferable);
  Spin 5 competence envelope (FD001 98.9% in, FD004 90.5% out, regime-shift not hot-fire,
  in-envelope ≠ safe); Spin 6 analog retrieval (+8.4%, 9% overlap, most modest, linked dispositions
  unavailable); the autoencoder stays a judgment artifact, never the champion; honest pointwise F1
  0.313 stays primary, point-adjusted 0.645 never the headline; Brier stays absent for telemetry.
- **Honesty UX / fail-closed.** Keep explicit null / unavailable / not_measured states. Label
  computed evidence artifacts as "computed evidence artifact, not live serving". Label Stargate as
  "recorded capture, replayed", never a live printer. Never present a seeded/fixture value as live
  or measured. Never surface a number the copilot post-validator would block.
- **Design system is a contract.** Use `--nv-*` tokens, the Card/Table/Drawer/Chart/Empty/Error
  component contracts, 4px spacing, WCAG AA (never `--nv-text-muted` to communicate status). Every
  route uses `TelemetryPageHeader` (one `<h1>`, mono eyebrow, accent bar; one hero per env =
  Overview; gradient on a meaningful phrase only; header fetches no data). Nested headings use
  `PageHeading`.
- **Env UI is standalone.** The telemetry env is its own full-bleed shell. Never wrap it in
  `DomainWorkspaceShell` / `RepeWorkspaceShell` / shared app chrome. Dark theme.
- **Anti-AI writing style** (`docs/anti-ai-style.md`) binds all copy, eyebrows, card titles, commit
  and PR prose.
- **No DB schema, no Databricks notebook, no evidence-JSON changes** unless explicitly routed and
  approved. Export reads existing endpoints/artifacts; it does not add tables.

## Reality deltas (verify-then-build — several requirements are already satisfied)

A 5-agent reality map (constraints, surface, primitives, Overview/controls, data sources) found the
telemetry surface is more complete than the Phase 8 brief assumes. These rescopes are material:

1. **Overview story control is already Play/Stop**, not "Present"/"hold"
   (`context/BottleneckMap/BottleneckMap.tsx:101-117`, ▶ "Play the story" ↔ ■ "Stop (Esc)", keyboard
   P/arrows/Esc). 8B does not need to "replace Present" — verify + keep.
2. **The standalone "Who Flies" and "Cost to LEO" tabs are already retired**
   (`BottleneckMap.tsx:22-24`). Cost is a Big Number; commercial share is the green underlay. 8B does
   not need to remove them — they are gone.
3. **The green commercial-share wave is already 0-at-bottom (not inverted)** but deliberately
   compressed (`MapPanel.tsx:136` `domain={[0,260]}` vs data max ~70%) so it reads as a subordinate
   underlay, footnoted "0–70%". The brief's "0 bottom / 50 mid / 100 top readable" conflicts with the
   intentional subordinate compression. **Decision needed in 8B** (faint labeled true-scale axis vs
   keep-compressed-with-clearer-label); do not silently rescale.
4. **Streaming controls are already honest and distinct.** Stargate = "▸ Start recorded capture"
   (titled "recorded capture, not a live printer"). Mission Control = "Start stream" (start ingest
   worker) + "Hold/Resume" (pause poll) + a display-only GO/NO-GO badge. These are different real
   actions, not duplicate "GO" buttons. 8C is relabel/clarify (e.g. "Hold"→"Pause") + consolidate any
   genuine duplicate, not a Play/Pause rewrite.
5. **Anomalies-routed and dead-letters counts are already real and drillable** — live SSE frame
   counts off the Kafka bridge (`stargateStream.ts:246-250`), with `AnomalyInspectionDrawer` + `DlqPanel`.
   They are real counts over a recorded-capture replay. 8C adds export + keeps the capture framing,
   not "decide if fixture".
6. **The drill foundation already exists.** `MetricRow`/`Stat` already take `onDrill`/`drillLabel`
   (`primitives.tsx:272-285`) and `MetricInspectorDrawer` exists (`drawerPrimitives.tsx:87`, with
   `primitivesDrill.test.tsx`). `LineageDrawer` (`metadata/LineageDrawer.tsx`) and
   `FactoryEvidenceDrawer` (`factory-ml/FactoryEvidenceDrawer.tsx`) are production-grade. The
   Databricks/MLflow link builders exist and fail closed (`lib/lab/factoryEvidenceLinks.ts`:
   `mlflowRunLink`/`registeredModelLink`/`deltaTableLink`). A CSV Blob/anchor pattern exists
   (`winston/blocks/ChatTableBlock.tsx`). So 8A is mostly **extract + promote + wire**, not net-new.

## Decisions (2026-06-26, owner-confirmed)

1. **Green-wave axis (8B):** show a faint labeled true-scale 0/50/100% axis so the commercial-share
   wave reads correctly, while keeping it visually subordinate (lower opacity, behind the bars). Do
   not rescale it to full height; do not leave it compressed-and-unlabeled.
2. **Agent Control Tower (8F):** hide from the nav (route still resolves), same hide-before-delete
   treatment as the other folded surfaces. Its nav comment already calls it a "mockup".
3. **Export (8A + wiring PRs):** CSV now (client-side Blob, reflects the on-screen filter) **and** a
   server-side XLSX export route. The XLSX route is a new read-only FastAPI endpoint over existing
   `tel_*` data via `openpyxl` (already a dep), mirroring the REPE `ExcelExportButton` →
   `exportFundExcelUrl` → server-built `.xlsx` pattern. No new table. The XLSX route + its
   `ExportToExcelButton` land in 8A's framework but require a backend deploy to be live in prod
   (`scripts/deploy_backend.sh`) — treat that deploy as a normal, low-risk additive step. This moves
   XLSX out of the original out-of-scope list.

## The honesty source-kind framework (the axis that makes drill-through safe)

Drill-through and export must carry the source kind so no page implies more than it has. Four kinds:

| Kind | Meaning | Pages | Drill target | Export |
|---|---|---|---|---|
| `live-rows` | real `tel_*` rows via an existing API | Model Performance (`/api/telemetry/model-performance`), Model Registry (`/registry`), Factory NCR (`/ncr`), Mission Control (`/stream/live`) | the rows | CSV of the rows |
| `computed-artifact` | a measured evidence artifact, not live serving | RUL Calibration (FD001 conformal evidence JSON), the Spin evidence cards | the artifact values, labeled "computed evidence artifact, FD00x, not live serving" | CSV of the artifact values |
| `fixture` | committed export / replay fixture | Flight Readiness (`public/labs/factory-ml/*.json`), the RUL trajectory replay | the fixture values, labeled "committed export / representative replay" | CSV of the fixture |
| `unavailable` | genuinely absent | linked dispositions in analog retrieval; usefulness `not_measured` | explicit null_reason, no rows | disabled with the reason |

Every drilldown drawer and export reflects the on-screen filter context, shows row count + as-of,
and renders the kind label. No fabricated rows, no silent fallback. If rows are unavailable: "Row-level
data unavailable" + null_reason + the artifact/source pointer if one exists.

## PR split (grounded; hide-before-delete; one worktree off origin/main)

- **PR 8A — shared drill/export framework (extract + promote, additive).** Build `ExportToCsvButton`
  (lift the `ChatTableBlock` Blob/anchor pattern, style with `TelemetryActionButton`); `SourceRowsTable`
  (compose `TelemetryProvenancePanel` + `FieldRow`, carrying the source-kind label + row count +
  as-of); extract the private `EvidenceLinkButton` from `FactoryEvidenceDrawer` into a shared
  `EvidenceLink` (backing `DatabricksRunLink`/`ModelArtifactLink` over `factoryEvidenceLinks`); add an
  inline `LineageLink` that opens the existing `LineageDrawer` for a metric/catalog node. Reuse the
  existing `onDrill`/`MetricInspectorDrawer`. Wire **one or two** representative examples only (a
  `live-rows` one on Model Performance + the existing Flight Readiness `fixture` drill). Do not wire
  every page here. Target: `repo-b/src/components/telemetry/{primitives.tsx,drawerPrimitives.tsx,
  exportCsv.ts(new),sourceRows.tsx(new),evidenceLink.tsx(new),lineageLink.tsx(new)}`,
  `lib/lab/factoryEvidenceLinks.ts`. Risk: low (additive).
  - **DONE (PR #402, main `abc79096`).** New shared dir `repo-b/src/components/telemetry/drill/` (sourceKind, exportCsv, telemetryExport, ExportButtons, SourceRowsTable, evidenceLinks, index) — all additive, zero edits to existing telemetry components except the two wiring targets. Backend: `app/routes/telemetry_export.py` (`GET /api/telemetry/export/{dataset}.xlsx` + `/export/datasets`) registered in `main.py`; **no SQL from request input** — datasets are an allowlist, each mapped to an existing tenant-scoped read service, so the export == the page data; fixed columns, row-limit bounded (500/5000), openpyxl, null_reason header on empty. Proxy `api/telemetry/[...path]/route.ts` gained a binary branch (the `.text()` path corrupts xlsx). Wired: Model Performance (live-rows drawer → SourceRowsTable + CSV + XLSX + champion MLflow link); Flight Readiness (honestly-labeled fixture CSV of `readiness.json`). Tests: 7 backend + 15 frontend; full telemetry suite 205 green; typecheck + lint + ruff clean. Reused `MetricInspectorDrawer`/`onDrill`/`FactoryEvidenceDrawer`/`factoryEvidenceLinks` (rebuilt nothing). Rebase clean (no concurrent conflict). **DEPLOY NEED:** the XLSX route is a new read-only backend endpoint — it needs `scripts/deploy_backend.sh` to be live in prod (prod backend is at `a18dd063`, predates this). The frontend works on merge; the XLSX button returns gracefully until the backend ships. Surfaced for an explicit backend deploy (the deploy bundles the un-deployed re_env_portfolio cleanup + dep pins too) rather than auto-deployed.
  - **DEPLOY RECEIPT (2026-06-26, owner-approved controlled release).** Deployed current `main` backend from the clean `cons_wt_telemetry` worktree (railway link `-p/-s authentic-sparkle -e production`, then `scripts/deploy_backend.sh`). Pre: `/api/version`=`a18dd063`, verify_lineage 6/1/0. Post (all green): `/api/version`=`65cd15e2c71d…` (SHA flipped); verify_lineage **6 PASS / 1 WARN / 0 FAIL** (same honest posture — health + routes respond, lineage fail-closed intact); the XLSX route `/api/telemetry/export/model_runs.xlsx?env_id=telemetry-demo&business_id=7e1eb000-…` returns **HTTP 200, 6520 bytes, content-type spreadsheetml + attachment disposition, a valid openpyxl-loadable file (header + 6 real model rows)** through the Next proxy (binary branch works, not corrupted); unknown dataset → **404 + `null_reason: export_dataset_not_allowed`**. The bundled re_env_portfolio cleanup + dep pins shipped with no regression. CSV + XLSX drill/export path now fully live in prod.
- **PR 8B — Overview polish.** Keep the thesis + the existing Play/Stop + the integrated Bottleneck
  Map. Strengthen the header (hero variant), balance the Big Numbers, **resolve the green-wave axis
  decision** (delta #3), add a richer selected-event explanation (bottleneck solved / new data burden
  / harder question / which downstream page proves it next), a source/evidence strip, and drill-through
  on Big Numbers where the source is `live-rows`. Add cross-links to Mission Control / Evidence /
  Replay / Metric Lineage / Model Performance. Target: `TelemetryOverview.tsx`,
  `context/BottleneckMap/{BottleneckMap,MapPanel,data}.tsx`. Risk: medium (live demo hero) — screenshot
  before/after, preserve all Big Number values.
  - **DONE (PR #405, main `0af103cc`).** Stayed strictly in the four scoped files + their tests. (a) **Green-wave axis**: `MapPanel` share axis `domain [0,260]→[0,100]` (true scale) + faint labeled `ReferenceLine`s at 0/50/100% — 0 bottom, 50 mid, 100 top; wave reaches ~70% on its own scale (no full-height rescale), kept low-opacity behind the bars; footnote updated. (b) **Big Number drill** (`TelemetryOverview` + `data.ts`): each Big Number → `MetricInspectorDrawer` + `SourceRowsTable` over the public series (`CADENCE`/`SHARE_ANCHORS`/`COST_POINTS`), labeled `fixture — curated public data`, CSV export; Timeline → honest no-rows state + null_reason (no dead click). (c) **Richer event framing**: new `EVENT_NARRATIVE` map adds the harder-question + downstream "proves next" link per event (real route); bottleneck-solved/burden stay in the record below (no duplication); fails closed without envId. (d) **Bridge links**: Stargate / Mission Control / Replay / Evidence / Metric Lineage / Model Performance (Governance dropped; "Resume Evidence"→"Evidence"). Verify: 209 telemetry tests + typecheck + lint green; **frozen-evidence 8/8 (no ML value/caveat changed)**; reused 8A primitives (no rebuild); rebase clean (no concurrent conflict). Frontend auto-deploys on merge.
> **SUPERSEDED (2026-06-26).** The PR split below (8C–8G) is replaced by the finer **8C–8I** sequence
> in the "Original Scope Coverage Gap — Remaining 30–40%" section further down. Kept here for history;
> execute against the 8C–8I list.

- **PR 8C — streaming/Stargate/Mission Control controls.** Relabel for clarity (e.g. "Hold"→"Pause"),
  remove any genuine duplicate control, keep every "recorded capture" / source-chip honesty label,
  make anomalies-routed + dead-letters drillable (already) + exportable. Never imply live hardware.
  Target: `stargate/StargateConsole.tsx`, `MissionControlStream.tsx`, `stargate/DlqPanel.tsx`. Risk:
  medium (live stream surface).
- **PR 8D — Model Performance / RUL Calibration / Model Registry.** Header alignment, explanation,
  champion vs challenger clarity, source/artifact links (8A), drill + CSV export where `live-rows`
  (Model Performance, Registry) and drill-to-artifact labeled where `computed-artifact`/`fixture` (RUL
  Calibration). Improve the squished RUL layout (width/spacing). Preserve PICP 0.86 + 15/100 + the
  autoencoder-not-champion + honest-vs-point-adjusted framing. Fill registry blanks with explicit
  null_reason, not blank cells. Target: `ModelPerformance.tsx`, `RulCalibration.tsx`,
  `RegistryConsole.tsx`, `lib/telemetry/calibrationEvidence.ts` (read-only). Risk: medium.
- **PR 8E — Factory NCR + Flight Readiness.** NCR (`live-rows` via `/ncr`): header, explanation,
  filters, tooltips, drill-through, row export, label data kind, tie to the thesis. Flight Readiness
  (`fixture` via `public/labs/factory-ml/*.json`): readiness-tab typography, give the radials underlying
  tabular data + drill + export, re-evaluate the layer heatmap (explain or demote to a table), keep the
  committed-export labels + freshness/null behavior. Target: `FactoryNcrIntelligence.tsx`,
  `factory-ml/*`, reuse `FactoryEvidenceDrawer`. Risk: medium.
- **PR 8F — page rationalization (hide-before-delete).** Fold from nav: Test Intelligence (copilot),
  Trust Center (governance), How This Works (how-it-works), Resume Evidence framing (evidence → keep an
  "Evidence" surface, do not lose the frozen ML evidence cards guarded by `test_evidence_freeze.py`),
  the Data Engineering group (8 entries) + the hard-coded Platform ADE link. Fold their load-bearing
  pieces (signed receipt, one grounded copilot answer + one refusal, the how-it-works exhibit, the DE
  lineage) into Evidence / Metric Lineage / source-evidence strips / drill drawers. Routes keep
  resolving (hide-before-delete; no page deleted this phase). Decide `control-tower` (nav comment calls
  it a "mockup"; not in the target nav — propose hiding it too). Target: `telemetryNav.ts`,
  `TelemetrySidebar.tsx`, `telemetryArchitectureData.test.ts`, the fold targets. Risk: medium (nav +
  test slugs) — every de-navved route must still resolve.
- **PR 8G (was 8F final) — smoke / screenshots / docs / tips.** Route-resolve smoke on all kept pages,
  screenshots of the acceptance set, update this plan + `tips.md` + `claim_coverage_matrix.md` cross-check.

Final nav target: Overview · Mission Control · Stargate Live · Replay · Test Runs · System Health ·
Model Performance · RUL Calibration · Model Registry · Factory NCR · Flight Readiness · Metric Lineage
· (Metadata Explorer under Evidence & Lineage). Fold the five flagged surfaces + DE group.

## Original Scope Coverage Gap — Remaining 30–40%

8A (drill/export framework + XLSX route, deployed) and 8B (Overview polish) shipped, but the original
Phase 8 ask was broader than Overview + the framework. This section tracks the remaining product scope
so it does not collapse into "controls cleanup." **Global rule for every item:** every chart, number,
radial, table summary, and model metric must be **drillable/exportable, or explicitly unavailable with
a `null_reason`** — source-kind honesty everywhere, no fabricated rows or links.

**Remaining product requirements**

- **Test Runs / Run Autopsy / Review flows** — Databricks run links, source artifacts, model artifacts, drill-through, export.
- **Model Performance** — deeper champion/challenger explanation, model artifact links, source/evidence links, exportable metric rows.
- **RUL Calibration** — wider/saner layout; unit-level prediction drill-through; export of lower/upper bound, point, actual, flip status, gate decision; **preserve PICP 0.86 and the 15/100 flips**.
- **Model Registry** — challenger values or explicit `null_reason`; training window, validation method, promotion gate, artifact/model-version/run links; export/drill-through; no blank-looking cells.
- **Factory NCR** — typography, explanation, filters, tooltips, source-kind honesty, row-level drill-through/export.
- **Flight Readiness** — radial ingredient tables, drill-through, export; re-evaluate the layer heat-map (explain or demote if not meaningful); preserve source/freshness/null behavior.
- **Global all-important-numbers rule** — the rule above, enforced as a hard acceptance gate.
- **Page rationalization** — not just hide nav: **fold** the essential trust / how-it-works / resume-evidence / data-engineering content into Evidence, Metric Lineage, source strips, and drill drawers; **delete only after quarantine/approval** (hide-before-delete).
- **Screenshots / smoke receipts** across Overview, Mission Control/Stargate, Replay, Evidence, Model Performance, RUL Calibration, Model Registry, Factory NCR, Flight Readiness, Metric Lineage.

**Remaining PR sequence (8C–8I)** — replaces the superseded 8C–8G split above:

- **PR 8C** — Streaming/Stargate/Mission Control controls + anomalies/DLQ export. **DONE (PR #408, main `bfbce31f`).** Frontend-only. Verify-then-build found **no duplicate controls** (surfaces already honest + distinct) → the only relabel was Mission Control `Hold`→`Pause` (+ aria/title). Added CSV export (reusing 8A `ExportToCsvButton`) for Stargate anomalies + dead letters (SSE `CircularBuffer`, captioned "real SSE rows over a recorded-capture replay") and Mission Control live anomaly events (`tel_anomaly_events` via `/stream/live`). New `stargate/streamExportRows.ts` flattens `AnomalyRow`/`DlqRow` (absent enrichment → null, never fabricated); fail-closed when buffers empty. `AnomalyInspectionDrawer` drill already existed. The `tel_anomaly_events` **server XLSX dataset deferred to 8D**. No backend, no route/service deleted, no Model/RUL/Registry/Factory/Flight touched. Frozen-evidence 8/8 green; full telemetry suite 216 green.
- **PR 8D** — Model Performance + Model Registry: artifact/run links + exportable metric rows (incl. the server `tel_anomaly_events` XLSX dataset batched here, with one controlled backend deploy). **Split per the don't-force-a-giant-PR rule: 8D-1 Model Performance · 8D-2 Model Registry · 8D-3 backend datasets + deploy.**
  - **8D-1 Model Performance — DONE (PR #410, main `5f6ede77`), frontend-only.** Reused the 8A drill drawer + the already-deployed `model_runs` XLSX dataset (no backend, no deploy). Made champion vs challenger explicit (role tag "champion" / "challenger · state", "Role" column); added operational-use copy per kind; a "live rows · tel_model_runs" source-kind chip; per-model run/artifact links in the drawer (live `DatabricksRunLink` per `mlflow_run_id`; fail-closed `ModelArtifactLink` for the seed model names). Gate already surfaced (note + exportable `gate` column). Honest-vs-point-adjusted + MAD-champion caveats preserved; frozen-evidence 8/8; 218 telemetry tests green.
  - **8D-2 Model Registry — DONE (PR #412, main `9fa91180`), frontend-only.** `RegistryConsole.tsx`: replaced the raw `mlflow {run_id}` text (champion + challenger) with live `DatabricksRunLink` + fail-closed `ModelArtifactLink` (seed names → "Unavailable — seed registry key"); added a metadata section where `training_window`/`validation_method` render explicit null_reason ("not recorded in tel_model_runs — see the MLflow run") and `operational_use` is an honest description; "no challenger" → explicit null_reason; Models CSV + Models XLSX (reusing the `model_runs` dataset — same `tel_model_runs`) + Drift CSV (client-side); "live rows" source-kind chip (lifecycle labeled derived); a legend for the metric-bar "n/a". No backend/deploy. Honest-vs-point-adjusted + honest_gate preserved; frozen-evidence 8/8; 219 telemetry tests green.
  - **8D-3 backend dataset + deploy — DONE (PR #414, main `e28f2c73`), deployed.** Added the allowlisted `anomaly_events` XLSX dataset → `tel_anomaly_events`; the extractor reuses the existing read-only `telemetry_stream_etl.stream_live` (the same scoped/bounded query the Mission Control page uses — no new SQL), fixed columns, bounded (20/200), empty → header-only XLSX + honest null_reason. Wired the Mission Control XLSX button next to the CSV. **Controlled deploy:** pre `/api/version`=`65cd15e2`, verify_lineage 6/1/0, anomaly_events correctly 404 on the old backend; deployed clean main; post `/api/version`=`e28f2c73`, verify_lineage **6 PASS / 1 WARN / 0 FAIL**, `/export/datasets` lists `anomaly_events`+`model_runs`, the `anomaly_events` XLSX returns a **valid header-only workbook** (live consumer off → 0 rows, honest) with the exact columns through the proxy, unknown dataset 404s, `model_runs` XLSX still works (6 rows, no regression). 4 new backend tests (the sys.modules-stub trap fixed via `setattr` on the real module). **8D COMPLETE (8D-1 + 8D-2 + 8D-3).**
- **PR 8E** — RUL Calibration: wider layout + unit-level drill/export (preserve PICP 0.86 / 15-of-100).
- **PR 8F** — Factory NCR + Flight Readiness: source/drill/export + layer-heat-map review.
- **PR 8G** — Test Runs / Run Autopsy / Review flows, incl. Databricks run links where available.
- **PR 8H** — Page rationalization / folding, hide-before-delete only.
- **PR 8I** — Screenshots / smoke / final acceptance pass.

**Hard constraints (carry through every remaining PR):** no evidence value changes · no claim-strength
changes · no fake links · no fake rows · no schema changes unless explicitly routed · fail closed with
`null_reason` · source-kind honesty everywhere.

## Test plan

Per PR: focused vitest for the changed components + the drill/export units + nav tests
(`telemetryNav.test.ts`, `TelemetrySidebar.test.tsx`, `telemetryArchitectureData.test.ts` with the
hidden slugs still resolving); `npm run typecheck`; `npm run lint`; backend tests only if an export
endpoint is touched (none planned — exports read existing routes). Frozen-evidence guard
(`backend/tests/test_evidence_freeze.py`) must stay green through every PR. Route-resolve smoke + a
screenshot for: Overview, Model Performance, RUL Calibration, Model Registry, Factory NCR, Flight
Readiness, the simplified sidebar, one drill drawer, one CSV export path.

## Out of scope

Model semantics, ML evidence artifacts/values, claim strength, DB schema, Databricks notebooks,
evidence JSONs (no routed refresh), the deferred Spin 6 / Spin 2 UI cards (a concurrent agent owns
that surface), any new backend **table**. (XLSX export is now IN scope per Decision 3 — a new
read-only export endpoint over existing `tel_*` data, no new table.)

## Risks

- **R1 — concurrent agent on `repo-b/src/components/telemetry/**`.** Another agent owns the frontend
  refactor (PR C/D) and the deferred Spin 6/2 cards. Mitigation: isolated worktree off origin/main,
  GitHub PR flow (race-safe), avoid the deferred Spin card files, small PRs, rebase before each.
- **R2 — folding Resume Evidence loses frozen cards.** The evidence page hosts the load-bearing ML
  evidence cards. Mitigation: keep an Evidence surface, fold framing only, keep `test_evidence_freeze`
  green, hide-before-delete.
- **R3 — drill/export implies more than the data has.** Mitigation: the source-kind framework on every
  drill + export; `computed-artifact`/`fixture` labels mandatory; `unavailable` renders null_reason.
- **R4 — live demo page regression.** Mitigation: screenshot before/after, route-resolve smoke, ship
  green only, hide-before-delete, every value preserved.

## Acceptance (mapped to reality)

Overview: stronger header, balanced Big Numbers, integrated Bottleneck Map, green-wave axis decision
resolved, Play/Stop kept (already present). Standalone Who-Flies/Cost-to-LEO already retired (verify).
Stargate/Mission Control controls clarified, never implying live hardware (already honest — verify +
relabel). Important `live-rows` numbers drillable + CSV-exportable; `computed-artifact`/`fixture`
drillable with the honest kind label; `unavailable` shows null_reason. Databricks/MLflow/artifact links
where available (fail-closed). Anomalies/DLQ sourced + drillable + exportable. Model/RUL/Registry more
explanatory + linked + exportable. NCR + Flight Readiness get typography/explanation/filters/drill/export.
The five flagged surfaces folded (routes still resolve). Contrast stays AA. All shipped ML values +
caveats preserved. Tests/typecheck/lint green. Screenshots + smoke captured. `claim_coverage_matrix.md`
not contradicted.
