# RUL Calibration — Evidence Surface Redesign

**Created:** 2026-06-29
**Status:** ✅ DONE 2026-06-29 — shipped on branch `feat/rul-calibration-evidence-surface`. Single-pass
redesign of the RUL Calibration page into an inspectable ML evidence surface. Frontend-only, no backend,
no schema. 12 component tests pass (5 original assertions preserved + 7 new); 333/333 telemetry tests
green; typecheck + lint clean.

**Owning surface:** `repo-b/` shared Next.js UI (`agents/frontend.md` / `.skills/feature-dev/SKILL.md`).
**Owning env plan:** `docs/plans/telemetry-platform/` (update its `next-session.md` / `backlog.md`).
**Route:** `/lab/env/[envId]/telemetry/calibration` (component `RulCalibration.tsx`).
**Scope guard:** AI Build & Ops page untouched (its 4 tests still pass). No new backend endpoint, no
external image URLs, no fabricated provenance.

## Goal

Turn the page from "chart + metrics" into an inspectable evidence surface where a data scientist, ML
engineer, and operations leader can each click into any metric, chart point, reliability bin, or
pipeline artifact and see its provenance, formula, interpretation, and limitations — without leaving
the page. The page stays honest: not SOTA, a computed evidence artifact, replay fixture, not live
serving.

## What shipped

- **Typed evidence layer** — `repo-b/src/lib/telemetry/rulCalibrationEvidence.ts`: `RulMetricEvidence`
  (5), `RulArtifactStep` (5), `RulReliabilityBin` (6), a discriminated `RulDrawerTarget` union, and the
  pure `buildRulChartPointDrawerTarget(point)` helper (the tested chart-click seam). Every value is read
  from the committed `CALIBRATION_EVIDENCE` / `CALIBRATION_TRAJECTORY`; no invented ids — unknown fields
  (table, registry id, dataset counts, bin sample counts) carry a specific `nullReason`.
- **One right-drawer for everything** — `RulEvidenceDrawer.tsx` on the shared `DrawerWrapper` (Radix:
  right panel lg / bottom sheet mobile, Escape + overlay close + focus trap). Renders six kinds (metric,
  artifact, chart-point, reliability-bin, model-card, source-row) with Summary / Source+Provenance /
  Formula / Data used / Interpretation / Limitations / Downstream sections. Missing provenance →
  specific "Not available — …" line via `FieldRow`, never a placeholder.
- **Hero / evidence contract** — CSS-generated backdrop (gradient + soft grid + ghosted RUL arcs + dark
  scrim; no `<img>`, no external URL), `variant="hero"` header, a 6-item evidence-contract strip
  (Dataset / Model / Calibration / Serving / Gate / Claim), and a "Why this page exists" callout.
- **Evidence artifact trail** — `RulArtifactTrail.tsx`, framed as an evidence trail (not a live
  pipeline): dataset → model → evaluation → calibration → replay, each clickable → artifact drawer.
- **Recharts trajectory chart** — `RulTrajectoryChart.tsx` (house pattern, matches
  `stargate/TempVibrationChart`): range-`Area` 80/90 bands, true/predicted `Line`s, axis labels
  (`Cycle` / `RUL cycles`), a custom hover tooltip (cycle/true/pred/error/bounds/containment/late note),
  click-to-inspect via the pure helper, and a `ReferenceArea` late-risk zone near low true RUL.
- **Accessible tooltips** — `RulInfoTooltip.tsx` (no new dependency; @radix-ui/react-tooltip is not in
  the repo). Hover + keyboard focus, `aria-describedby`, Escape to dismiss. On metric labels, contract
  items, the artifact trail, calibration rows, reliability bins, and panel headers. Critical caveats
  also live on the page, never tooltip-only.
- **Clickable calibration panel + model card** — coverage rows and all 6 reliability bins open the
  drawer (bins surface the sample-count null reason); model-card fields open the model-card drawer.
- **Preserved** — every locked test string (17.33, 742, GBM 20.32, GBM 1423, 77.8%/90.3% observed,
  "honest calibration, not a SOTA claim", the negative-result bridge, the unit-rows export + `covered_90`
  + CSV), and the determinism of `CALIBRATION_TRAJECTORY`.

## Acceptance — met

Hero + contract chips + callout; 5 tooltip'd metric cards each opening evidence; 5-step artifact trail
with specific null reasons for missing ids; recharts chart with hover tooltip + click + late-risk zone;
clickable coverage rows + reliability bins; drawer opens from metric/artifact/chart-point/bin and closes
on Escape/overlay/button; Not SOTA + computed-artifact + replay-fixture all still visible; GBM baselines
retained; every metric maps to a typed evidence object; no fake artifact/run/table ids.

## Tests run

- `npx tsc --noEmit -p tsconfig.typecheck.json` — clean.
- `npx vitest run src/components/telemetry/RulCalibration.test.tsx` — 12/12 pass.
- `npx vitest run src/components/telemetry/` — 333/333 pass (74 files), incl. AiBuildOpsReference.
- `npx next lint` on all 7 touched files — no warnings or errors.

## Follow-ups (not in scope this pass)

- Optional "Copy evidence JSON" drawer button (deliberately deferred — clipboard test friction).
- A Playwright/visual-regression capture of the route at 1280×800 dark if the visual infra is wired.
