# Telemetry Frontend Refactor — Inventory

Verified inventory of `repo-b/src/components/telemetry/**` for the production-readiness refactor.
Behavior-preserving: no metric/claim/backend changes; the dark `C` palette stays (it is the env theme
adapter, not drift). Source: read-only multi-agent sweep + direct reads, June 2026.

## Scale

- ~46 component `.tsx` files (excl. `.test.tsx`), ~10,200 LOC, + 21 thin page routes (~5 LOC each).
- ~1,180+ inline `style={{…}}` sites, almost all re-declaring `C`-token typography/spacing/borders that a
  primitive could own.
- ~40 of 46 files use `C` directly. The exceptions use `RS` (`rsTokens.tsx`) — a second design language on
  RegistryConsole / FactoryNcrIntelligence / MissionControlStream / context/BottleneckMap/*. **Decision:
  RS is being unified into `C`** (approved visual change; data/metrics/claim copy unchanged). The only
  intentionally non-`C` inline values that stay are runtime-derived (`MetadataGraphNode.LAYER_COLORS`).

### Top files by inline-style density

| Count | File |
|---|---|
| 77 | `GovernanceDashboard.tsx` |
| 71 | `Copilot.tsx` |
| 58 | `SpikeInspector.tsx` |
| 57 | `RegistryConsole.tsx` |
| 53 | `TelemetryArchitectureMap.tsx` |
| 50 | `metadata/TelemetryMetadataExplorer.tsx` |
| 47 | `FactoryNcrIntelligence.tsx` |
| 44 | `MissionControlStream.tsx` |
| 40 | `RulCalibration.tsx` |
| 38 | `ControlTower.tsx` |
| 28 | `AiEvidenceCard.tsx`, `RulConformalCard.tsx` |
| 26 | `metadata/MetadataDetailDrawer.tsx` |
| 25 | `CompetenceEnvelopeCard.tsx`, `metadata/LineageDrawer.tsx` |

## Primitive gap map

Rule: reuse before rename before create — never a second implementation of an existing primitive.
Status as of PR A (`primitives.tsx` + `chartPrimitives.tsx` + `evidenceCard.tsx` + `drawerPrimitives.tsx`).

| Desired | Action | Status |
|---|---|---|
| `TelemetryPageHeading` | alias `PageHeading` | done (PR A) |
| `TelemetryPanel` | alias `Panel` | done (PR A) |
| `TelemetryNullState` | alias `EmptyState` | done (PR A) |
| verdict chip | `VerdictChip` over `Tag` + `verdictColor()` | done (PR A) |
| `StatusDot` | create | done (PR A) |
| `MetricRow` / `Stat` | create | done (PR A) |
| `TelemetryActionButton` / `SelectField` | create | done (PR A) |
| `InlineCode` (`TelemetryInlineCode`) | create | done (PR A) |
| `TelemetrySection` | create | done (PR A) |
| `TelemetryStatusBanner` | create (aria-live) | done (PR A) |
| `TelemetryProvenancePanel` | create | done (PR A) |
| `SectionTabButton` | create | done (PR A) |
| `TelemetryThesisHeading` / `TelemetryPageShell` | create | done (PR A) |
| `TelemetryChartFrame` / `TelemetryLegend` | create (`chartPrimitives.tsx`) | done (PR A) |
| `TelemetryEvidenceCard` + `EvidenceContract` | create (`evidenceCard.tsx`) | done (PR A) |
| `DrawerWrapper` / `DrawerHeader` / `FieldRow` | create (`drawerPrimitives.tsx`) | done (PR A) |

## Evidence-card contract gap (PR B)

Contract: title · thesisRole · sourceStatus · asOf · coreMetrics · method · claimBoundary · null_reason ·
detail · provenance. `RulConformalCard` and `RegimeAnomalyCard` already carry all fields (reference shape).

| Card | Missing fields to fill |
|---|---|
| `DataCollectionCard` | sourceStatus, asOf, method, claimBoundary (mark as static framework note, not evidence-tier) |
| `FeatureContractCard` | asOf, method, claimBoundary |
| `PipelineEvidenceCard` | asOf, method, claimBoundary |
| `ModelEvidenceCard` | asOf, claimBoundary |
| `AiEvidenceCard` | asOf, method, claimBoundary |
| `DeploymentReceiptCard` | claimBoundary (live `/version` vs build-time) |
| `KnownAnomalyCard` | null_reason wiring |
| `CompetenceEnvelopeCard` | asOf, claimBoundary |

Keep every metric and claim string byte-identical when adopting the frame.

## God-component split plan (PR C)

Container (fetch/state) + presentational subcomponents + chart + status + provenance:

- **ReplayConsole** → container + `ReplayControls` + `ReplayStageUnavailableBanner` (→ `TelemetryStatusBanner`)
  + `TelemetryTraceChart` (geometry inline, frame via `TelemetryChartFrame`) + `ReplayVerdictCard`
  (aria-live) + `SensorAttributionCard` + provenance (→ `TelemetryProvenancePanel`).
- **GovernanceDashboard** → fetch hook + `PosturePanel`/`EvalSuitePanel`/`McpToolsPanel`/`UsefulnessPanel`/
  `RecentInteractionsTable`/`RefusalExamplesPanel` (dots → `StatusDot`, metrics → `MetricRow`/`Stat`).
- **Copilot** → message hook + `CopilotMessageThread`/`CapabilityListPanel`/`LimitationListPanel`/`TabButton`.
- **ControlTower** → run/decision hook + `RunControls`/`RoutingPanel`/`GemmaPanel`/`ApprovalGate`/`ReceiptPanel`
  (Ed25519 → `TelemetryProvenancePanel`; `btn`/`inputStyle` → `TelemetryActionButton`/`SelectField`).
- **TelemetryMetadataExplorer** → ~200-LOC controller + `MetadataExplorerHeader` + `MetadataStatsGrid`
  (`StatGrid`) + `MetadataGraphVisualization` (ReactFlow, pure).
- **MetadataDetailDrawer / LineageDrawer** → shared `DrawerWrapper`/`DrawerHeader`/`FieldRow`.
- **SpikeInspector / RulCalibration / TelemetryArchitectureMap / MissionControlStream / ModelPerformance /
  Monitoring / RunsExplorer / SystemHealth** → same shape; charts → `TelemetryChartFrame`/`TelemetryLegend`.
- **RS→C**: RegistryConsole, FactoryNcrIntelligence, MissionControlStream, context/BottleneckMap/* migrate
  `RS*` → `C`/primitives. Re-skin only; screenshot-gate each (top visual-regression risk).

Sub-split PR C if review-heavy: C1 consoles · C2 metadata · C3 RS→C.

## Duplication hotlist

1. label/value mono row (15+) → `MetricRow`.
2. glowing status dot (20+) → `StatusDot`.
3. panel-title styling (8+) → `Panel` title slot.
4. verdict/status chip re-inlined → `Tag`/`VerdictChip`.
5. recharts boilerplate (margins, `isAnimationActive=false`) (4 files) → `TelemetryChartFrame`.
6. bar-chart flex (`GateBar`/`FpBar`/`BandBar`) (3 cards) → shared viz utility.
7. button/input (`btn`/`inputStyle`/`FilterSelect`) → `TelemetryActionButton`/`SelectField`.
8. Radix drawer Portal/Overlay/Content + header (~80 lines ×2) → `DrawerWrapper`/`DrawerHeader`.
9. field 2-col grid → `FieldRow`.
10. section tabs → `SectionTabButton`.
11. RS token refs scattered vs `rsTokens` helpers → fold into `C` (PR C).

## Behavior-preservation risks (must hold)

- **Fail-closed/null copy (verbatim):** `metadata_graph_unreachable`, `no_upstream_edges_in_catalog`,
  `out_of_scope_requires_waterfall`, governance N=0 reason, "Unavailable reason", `model_not_promoted`.
- **Claim copy (never strengthen):** "recorded capture replayed" / "CAPTURE (recorded live session)" /
  "not live serving" / "computed artifact" / "committed JSON, not a live Databricks query"; honest-F1 dual
  labeling; gate thresholds (F1≥0.30, RMSE≤25, GO<1.0 / REVIEW 1.0–2.0 / NO-GO>2.0); Ed25519
  tamper-evident; "promotion = alias update, fail-closed"; "no seeded numbers".
- **Geometry stays inline:** `MetadataGraphNode.LAYER_COLORS`, `TelemetryArchitectureMap` NodeShapeEl/route,
  `RulCalibration` TrajectoryChart SVG, `ReplayConsole.pathFor`, xyflow/d3 positioning. Frame the chrome,
  not the math. Keep recharts `isAnimationActive=false` through `TelemetryChartFrame`.
- **Drawer Radix contract:** preserve `Dialog.Root/Portal/Overlay/Content`, responsive `lg:right-0`,
  close-on-Escape, focus trap.
- **Tests:** assert on text/role/null_reason; RS→C surfaces are the top visual-regression risk → screenshots.

## Consolidation recommendations (LATER pass — not executed)

- Model Performance + Registry + RUL Calibration → "Model Lifecycle".
- Metric Lineage + Trust Center + Metadata Explorer → "Trust & Lineage".
- Replay + Known Anomaly + Test Runs → "Run Replay / Go-No-Go".
- Evidence + How This Works → "Evidence".
- Collapse the two metadata drawers into one parameterized drawer once `DrawerWrapper` is adopted.
