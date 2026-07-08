# 0018 - Sustainability Tool: Governed Business OS Extension (Planning Only)

- Status: Planning
- Environment: Business OS / Sustainability (brownfield extension of REPE-scoped `sus_*`)
- Risk: Low (docs-only in this run)
- Scope: Repo inventory + plan for extending the existing REPE sustainability capability into a governed Business OS surface.
- Owning surface: `agents/bos-domain.md`; implementation via `.skills/feature-dev/SKILL.md`.

This document is planning only. No production code, SQL migration, workflow, deploy config, or secret is created or modified by this run. Every proposed table, endpoint, or component name marked "proposed" is a proposal pending later implementation, not a promise the file exists.

Any statement in this plan about carbon frameworks (GHG Protocol, GRESB, SFDR, TCFD, PCAF, SBTi) or specific emission-factor sets is treated as **an assumption requiring later source verification** - the relay did not fetch or validate external standards content in this run.

---

## 1. Repo inventory

Verified against the tree at HEAD `73ec6ba9e035`.

**Existing sustainability schema** (`repo-b/db/schema/`):
- `287_re_sustainability.sql` - defines `sus_emission_factor_set`, `sus_emission_factor`, `sus_utility_account`, `sus_utility_monthly`, `sus_asset_profile`, `sus_asset_emissions_annual`, `sus_decarbonization_project`, `sus_regulation_catalog`, `sus_regulatory_exposure`, `sus_ingestion_run`, projection tables, and `sus_*_v` views.
- `288_re_sustainability_seed.sql` - seed pack.
- The `sus_` prefix is already listed as approved in `ARCHITECTURE.md`.

**Existing backend surface**:
- Services: `backend/app/services/re_sustainability.py`, `re_sustainability_ingestion.py`, `re_sustainability_projection.py`, `re_sustainability_reporting.py`, `re_sustainability_validation.py`, `re_sustainability_connectors.py`.
- Routes: `backend/app/routes/re_sustainability.py`, mounted at `/api/re/v2/sustainability/*` from `backend/app/main.py`.
- Schemas: `backend/app/schemas/re_sustainability.py` (includes `ReportKey` enum: `gresb`, `lp_esg_summary`, `sfdr_annex_ii`, `tcfd_summary`, `carbon_disclosure`, `quarterly_lp_section`).
- Tests: `backend/tests/test_re_sustainability_api.py`.

**Existing frontend surface**:
- BOS page: `repo-b/src/app/app/repe/sustainability/page.tsx`.
- Lab env page: `repo-b/src/app/lab/env/[envId]/re/sustainability/page.tsx`.
- Workspace: `repo-b/src/components/repe/sustainability/SustainabilityWorkspace.tsx`.

**Reusable governance / evidence / grounding surfaces (targets to clone, not rebuild)**:
- Authoritative-state contract: `backend/app/services/re_authoritative_snapshots.py`, `backend/app/schemas/re_authoritative.py`, `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` (fields `state_origin`, `trust_status`, `promotion_state`, `period_exact`, `null_reason`, `?audit_mode=1`).
- Fail-closed vocabulary: `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md` (e.g. `data_not_ingested`, `snapshot_unavailable`, `out_of_scope_requires_waterfall`).
- Evidence drawers: `repo-b/src/components/re/AuditDrawer.tsx`, `repo-b/src/components/telemetry/metadata/LineageDrawer.tsx`, `repo-b/src/components/telemetry/RulEvidenceDrawer.tsx`, drawer chrome `repo-b/src/components/telemetry/drawerPrimitives.tsx`.
- Metric cards: `repo-b/src/components/telemetry/RulMetricCard.tsx` (clickable evidence card), `repo-b/src/components/ui/MetricCard.tsx` (presentational), `repo-b/src/components/ui/StateCard.tsx` (null/empty/error), charts under `repo-b/src/components/charts/`.
- AI grounding: `backend/app/services/ai_gateway.py` - `_build_unified_metrics_block` and the no-invention rule; unified metric registry at `backend/app/services/unified_metric_registry.py`.
- Intake + seed: `backend/app/services/re_sustainability_ingestion.py` (`sus_ingestion_run`), seed packs in `backend/app/services/environment_seed_packs_v2/`.
- Report center + export: `repo-b/src/app/app/reports/page.tsx`, `re_sustainability_reporting.py`, binary-safe export proxy `repo-b/src/app/api/telemetry/[...path]/route.ts`.

**Confirmed gaps (v1 targets)**:
1. No `sus_authoritative_*` snapshot layer, and no `get_authoritative_state`-style single reader for sustainability metrics.
2. Sustainability metrics are not registered in `unified_metric_registry.py`, so the AI copilot cannot ground or fail closed on them.
3. No sustainability lineage/evidence drawer - REPE's `AuditDrawer` and telemetry's `LineageDrawer` are not wired to sustainability.
4. No dedicated sustainability planning doc (until this one), no sustainability MCP tool category, no BOS-level `/app/sustainability/` home outside the REPE-scoped page.

**Unknowns** (see Section 10): first target user, chosen carbon framework, source format, certification level, first demo environment.

---

## 2. Product framing

v1 extends the existing REPE-scoped `sus_*` capability into a governed Business OS sustainability surface that any business/portfolio can point at. It reuses the schema and services already in the repo, adds a governed authoritative-state layer so metrics behave like released REPE snapshots (versioned, reproducible, fail-closed), registers those metrics in the unified metric registry so the AI copilot can ground and refuse, and exposes an evidence drawer that reads the same snapshots. It stays read-only in v1 - no new intake write path, no compliance certifications - and treats regulator-facing reporting as a downstream flow of the report center, not a new stack.

---

## 3. v1 user workflow

1. Operator selects a business/portfolio scope in the BOS shell.
2. Operator opens the sustainability home (`/app/sustainability/` or, in a demo lab, `/lab/env/[envId]/sustainability/`).
3. If the environment has no data yet, the operator triggers a seed load (existing `288_re_sustainability_seed.sql` / seed packs). Uploading new source records is deferred to a later ticket.
4. Backend normalizes source records (utility invoices, meter readings, activity data) into facts in the existing `sus_utility_monthly` / `sus_asset_emissions_annual` tables through `re_sustainability_ingestion.py`.
5. Backend calculates governed metrics (Scope 1/2/3 tCO2e, energy intensity, water intensity, revenue-intensity) and writes them into the proposed `sus_authoritative_*` snapshot layer.
6. Operator views the dashboard - governed metric cards (`MetricCard` / a sustainability variant of `RulMetricCard`), trend charts, coverage/completeness callouts.
7. Operator clicks a metric card → the sustainability lineage drawer opens with snapshot version, `state_origin`, `trust_status`, `period_exact`, evidence rows (source records used, emission factor set, formula), and any `null_reason`.
8. Operator opens the AI assistant panel and asks a grounded question (e.g. "Why did Scope 2 rise in Q2?"). The copilot answers only from registered metrics + snapshots and cites them; unsupported asks return `not available` with a `null_reason`.
9. Operator opens the report center (`/app/reports/`) and exports an evidence-backed report (GRESB, LP ESG summary, SFDR Annex II, TCFD summary, carbon disclosure, quarterly LP section - from the existing `ReportKey` enum) through the binary-safe export proxy.

---

## 4. Data model proposal

Planning-level only. All new names below are **proposals**, not files.

**Layer separation**:
- **Source records** (existing): `sus_utility_account`, `sus_utility_monthly` (invoices/meter readings), `sus_asset_profile`, `sus_ingestion_run`, `sus_regulation_catalog`. These are the ingest surface.
- **Normalized facts** (existing): `sus_asset_emissions_annual`, projection tables under 287, `sus_*_v` views. These are the derived, per-period, per-asset facts.
- **Governed metrics** (proposed authoritative layer, mirrors `re_authoritative_snapshots`):
  - `sus_authoritative_snapshots` (proposed) - one row per `(business_id, entity_scope, period_key, metric_family, version)` with `state_origin`, `trust_status`, `promotion_state`, `period_exact`, `null_reason`, `formula_id`, `input_hash`, `created_at`.
  - `sus_authoritative_metric_value` (proposed) - the released numeric value per metric key (`scope1_tco2e`, `scope2_location_tco2e`, `scope2_market_tco2e`, `scope3_tco2e`, `energy_intensity_kwh_per_sqft`, `water_intensity_gal_per_sqft`, `emissions_intensity_tco2e_per_musd_revenue`).
  - `sus_authoritative_evidence` (proposed) - per-metric provenance rows pointing back to source `sus_utility_monthly` / `sus_emission_factor` / `sus_asset_profile` ids used to compute the value.
- **Evidence / provenance** (proposed views on top of the authoritative layer): `sus_authoritative_evidence_v`, joining source-record ids, factor-set version, formula id, and ingestion run.
- **Reporting outputs** (existing): served through `re_sustainability_reporting.py` + `ReportKey`; no schema change proposed for v1.

**Fail-closed rules the reader must enforce**:
- Missing source record for `(asset, period)` → `null_reason: data_not_ingested`.
- Missing emission factor for `(activity, factor_set_version, period)` → `null_reason: emission_factor_missing`.
- Metric key not present in the unified metric registry → `null_reason: metric_definition_missing`.
- No released snapshot for the requested period → `null_reason: snapshot_unavailable`.
- Values that require a certification we don't hold → `null_reason: out_of_certified_scope`.

The vocabulary aligns with `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`; new tokens (`emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope`) are proposals to add to that shared vocabulary - no edit in this run.

**No migration file is created in this run.**

---

## 5. API and service proposal

The existing sustainability route group `/api/re/v2/sustainability/*` (in `backend/app/routes/re_sustainability.py`) is the extension point. New endpoints ride under this group and reuse existing service modules - primarily `backend/app/services/re_sustainability.py` and `backend/app/services/re_sustainability_reporting.py` - plus a proposed new `re_sustainability_authoritative.py` sitting alongside `re_authoritative_snapshots.py`.

**Read-only v1 endpoints (proposed)**:
- `GET /api/re/v2/sustainability/overview` - dashboard payload (governed metrics for the selected scope + period).
- `GET /api/re/v2/sustainability/metric/{metric_key}` - single governed metric with `state_origin`, `trust_status`, `null_reason`.
- `GET /api/re/v2/sustainability/metric/{metric_key}/evidence` - lineage payload for the drawer (source records, factor set, formula, ingestion run).
- `GET /api/re/v2/sustainability/report/{report_key}` - evidence-backed report bundle (delegates to `re_sustainability_reporting.py`, `ReportKey` enum).
- `GET /api/re/v2/sustainability/context` - unified-metric-registry-shaped context block for the AI copilot.

**Later write/intake endpoints (deferred, not v1)**:
- `POST /api/re/v2/sustainability/intake/upload` - source-record upload (utility invoices, activity data).
- `POST /api/re/v2/sustainability/intake/normalize` - trigger normalization.
- `POST /api/re/v2/sustainability/snapshot/release` - release a governed snapshot.
- `POST /api/re/v2/sustainability/report/export` - server-side export job.

Read and write concerns are kept in separate service modules so v1 can ship without any write surface.

**No backend production code is changed in this run.**

---

## 6. UI proposal

Primary v1 home: **BOS path `repo-b/src/app/app/sustainability/`** (new area, proposed). A demo/lab variant lives at `repo-b/src/app/lab/env/[envId]/sustainability/` (proposed) so a seeded environment can showcase it end-to-end. Both compose the same workspace component. The existing REPE-scoped `SustainabilityWorkspace.tsx` is kept for REPE and refactored later; v1 introduces a new BOS-level workspace so REPE regressions are impossible.

**Chosen v1 shape**: **dashboard-first, with an integrated AI assistant panel and a report-center link**. Reason: intake, normalization, and certified reporting are the highest-risk surfaces; a read-only governed dashboard grounded on existing seed + `sus_*_v` views proves the authoritative-state contract for sustainability without touching intake writes or compliance exports. Upload/intake and export come after the read path is trusted.

**Composition (proposed, reusing repo components)**:
- Page shell: BOS chrome (dark theme).
- Governed metric grid: `RulMetricCard` (clickable, evidence-open pattern) for the six proposed metric keys, plus `MetricCard` and `StateCard` for null/empty/error states.
- Trend and coverage charts: `repo-b/src/components/charts/` primitives (line + range/area for uncertainty bands).
- Lineage: a new `SustainabilityEvidenceDrawer` (proposed) built from `drawerPrimitives.tsx`, modeled on `AuditDrawer.tsx` and `LineageDrawer.tsx` - no new drawer library.
- Report center: link out to `/app/reports/` with a sustainability filter; export through the binary-safe proxy `repo-b/src/app/api/telemetry/[...path]/route.ts`.
- AI assistant panel: right-rail copilot bound to `/api/re/v2/sustainability/context`.
- Null / empty / error states: `StateCard` variants keyed off `null_reason`, plus an `?audit_mode=1` toggle that shows snapshot version, formula id, and coverage gaps inline.

**No frontend production code is changed in this run.**

---

## 7. AI behavior proposal

- Grounding mechanism: register the v1 sustainability metric keys in `backend/app/services/unified_metric_registry.py` so `ai_gateway.py`'s `_build_unified_metrics_block` includes them. The copilot answers sustainability questions only from that block plus the citations contract in `ai_gateway.py`.
- **Unsupported answers must return `"not available"` (or a specific `null_reason`) rather than an invented estimate.** Concretely: if the snapshot returns `null_reason: data_not_ingested`, `emission_factor_missing`, `metric_definition_missing`, `snapshot_unavailable`, or `out_of_certified_scope`, the AI surfaces that reason verbatim and does not synthesize a number.
- Value classification the copilot must preserve when reading a metric:
  - **Measured** - computed from meter/invoice source records via a registered formula on a released snapshot.
  - **Estimated** - computed from a proxy or industry-average emission factor; must be labeled with the factor-set id and version.
  - **Unavailable** - no released snapshot or missing input; returned as `null` with `null_reason`.
- Separation of research vs certified reporting: research/planning answers (e.g. "what does GRESB ask for") may pull from internal notes and are labeled research-only; certified/operational reporting answers may only cite released snapshots and the `ReportKey` bundles from `re_sustainability_reporting.py`. The copilot must not blur those layers, and must not assert regulatory certification the platform does not hold.
- Framework-specific claims (GHG Protocol scope boundaries, PCAF quality tiers, SFDR PAI mappings) are treated as **assumptions requiring later source verification** and are surfaced with a "not certified" tag until a source is registered.

---

## 8. Testing and eval strategy

At least five concrete future acceptance tests (all deferred implementation, none written in this run):

1. **Normalization test** - `sus_utility_monthly` rows from a fixture invoice produce the expected `sus_asset_emissions_annual` facts and mark the `sus_ingestion_run` as `succeeded`.
2. **Metric calculation test** - given a fixed source-record set and a pinned emission-factor set, `scope1_tco2e`, `scope2_location_tco2e`, and `energy_intensity_kwh_per_sqft` match golden values within a tolerance.
3. **Missing-factor fail-closed test** - remove one row from `sus_emission_factor` for the required activity; the governed reader returns `value: null` with `null_reason: emission_factor_missing`. No estimate, no exception.
4. **Dashboard/report consistency test** - the dashboard payload from `/api/re/v2/sustainability/overview` and the report bundle from `/api/re/v2/sustainability/report/{report_key}` agree on every shared metric for the same `(business_id, period)`.
5. **Lineage-drawer reproduction test** - the evidence rows returned by `/metric/{key}/evidence` reproduce the metric value when replayed through the formula, given the same `input_hash`.
6. **AI cited-answer test** - a copilot question about `scope2_market_tco2e` returns an answer that cites the exact metric key and snapshot version, with no other numeric claims.
7. **AI refusal / null-answer test** - a copilot question about a metric with `null_reason: data_not_ingested` returns "not available" plus the `null_reason`; the model does not fabricate a value.
8. **Report export consistency test** - the exported bundle for a released snapshot is byte-stable across two exports of the same snapshot version.
9. **Regression guard against raw-table metric formulas** - a lint / grep test that fails CI if any frontend route or backend service outside the authoritative-state reader computes a sustainability metric directly from `sus_utility_monthly` or `sus_asset_emissions_annual` (mirrors `verification/lint/no_legacy_repe_reads.py`).
10. **Snapshot invariants test** - a released snapshot has non-null `state_origin`, `trust_status`, `period_exact`, `formula_id`, and either a value or a `null_reason` (never both, never neither).

---

## 9. Implementation tickets

Sequenced, planning only - not implemented in this run.

1. **T1: Capability inventory ADR**: add `docs/adr/sustainability/0001-brownfield-extension.md` recording that v1 extends the existing REPE `sus_*` capability into BOS via a governed authoritative layer; freeze scope boundaries.
2. **T2: Fail-closed vocabulary update**: append `emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope` to `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`.
3. **T3: Authoritative schema migration**: create the next-sequential feature migration (currently `618_sus_authoritative.sql`; the `10xxx` band is reserved for RLS/index/view/telemetry, not features) under `repo-b/db/schema/` with `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, `sus_authoritative_evidence` - RLS on, `env_id` + `business_id`, comments, indexes justified.
4. **T4: Authoritative reader service**: add `backend/app/services/re_sustainability_authoritative.py` mirroring `re_authoritative_snapshots.py` with a single `get_authoritative_state` entry point.
5. **T5: Route skeleton (read-only)**: extend `backend/app/routes/re_sustainability.py` with `/overview`, `/metric/{key}`, `/metric/{key}/evidence`, `/context` behind the existing group, wired to T4.
6. **T6: Unified metric registry entries**: register the six v1 metric keys in `backend/app/services/unified_metric_registry.py` with formulas, units, `formula_id`, and evidence contract.
7. **T7: BOS UI area**: scaffold `repo-b/src/app/app/sustainability/` and a lab variant, backed by a new `BosSustainabilityWorkspace.tsx` composed of `RulMetricCard`/`MetricCard`/`StateCard`.
8. **T8: Sustainability evidence drawer**: build `SustainabilityEvidenceDrawer.tsx` from `drawerPrimitives.tsx`, patterned on `AuditDrawer.tsx` and `LineageDrawer.tsx`, opened by metric-card click and `?audit_mode=1`.
9. **T9: Report center integration**: add a sustainability filter to `repo-b/src/app/app/reports/page.tsx` and route exports through the binary-safe proxy for the existing `ReportKey` bundles.
10. **T10: Grounded AI Q&A**: wire the `/context` endpoint into `ai_gateway.py`'s unified metrics block; add refusal + citation policies; smoke-test with fixtures.
11. **T11: Intake / upload (deferred to v1.1)**: add `POST /intake/upload` + `/intake/normalize` + the write side of `re_sustainability_ingestion.py`, plus an upload UI.
12. **T12: Eval / smoke suite**: implement the acceptance tests in Section 8 and add a Winston eval scenario "sustainability grounded answer" mirroring the RS demo pattern.

---

## 10. Open questions

1. **Target user for v1** - REPE fund operator (existing surface), corporate sustainability lead, or LP-facing reporting analyst? Choice drives which metrics appear on the dashboard first.
2. **Carbon accounting framework** - GHG Protocol Corporate Standard + PCAF for financed emissions? GRESB alignment? Assumption pending source verification.
3. **Source-record format** - utility CSVs, meter API pulls, LP data-room PDFs, or connector-driven pulls via `re_sustainability_connectors.py`? Format decides the upload UI in T11.
4. **Certification level** - is v1 "internal decision-support only" (no external assurance) or does it need to align with an assurance standard (ISAE 3410, AA1000AS)? Determines what `out_of_certified_scope` gates.
5. **First demo environment** - do we host the demo on the existing REPE env, spin a Business OS env via `skills/winston-create-environment/SKILL.md`, or add a dedicated sustainability lab env?

---

## Notes on this run

- Diff scope: this file only, under `docs/`. No code, schema, workflow, hook, auth, or secret is touched.
- Every proposed table, endpoint, and component name above is a proposal, not a claim that a file exists.
- Every framework / factor / regulatory claim above is an assumption requiring later source verification before it lands in shipping copy or the AI grounding block.

## Relay run evidence (2026-07-08)

This plan was produced by the Coding Relay in guided mode, then adopted with two operator corrections.

- **Command:** `python scripts/coding_relay.py` (guided mode, real prompts, no `--yes`), max 2 iterations. Operator answers: select plan 26, confirm criteria Y, confirm warnings y, start Y, PR offer Y.
- **Selected plan:** `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md` (menu entry 26).
- **Result:** PASS on iteration 1. Reviewer marked all 17 normalized criteria met, 0 unknown. The acceptance criteria were written to be judgeable from the diff and review bundle (the 0017 lesson), so no criterion needed AI-role provenance or checkout cleanliness, and the run reached a real PASS rather than MAX_ITER.
- **Worktree:** `C:/Projects/cons_wt_relay_relay/r-sustaina-095259` (branch `relay/sustainability-tool-plan-20260708-095259`, base `73ec6ba9`).
- **Run folder:** `.orchestration/runs/20260708-095259-sustainability-tool-plan/`.
- **Codex artifact-only:** Yes. `review-meta.json` shows `codex exec --cd <run>/iterations/01/review-bundle`, adapter `relay_reviewer`, exit 0, no sandbox-bypass retry.
- **Safety before PR:** Yes. `iterations/01/safety.json` present (`[]` violations) before the PR step.
- **Tests run/skipped:** None run (docs-only change, no matching changed paths); reported honestly as "No suites were run."
- **PR:** Draft PR #513, opened by the relay on a real PASS.
- **Docs-only containment:** The relay changed only this file (`review-bundle/files.txt` lists it alone); primary checkout showed only the baseline 0018 plan.
- **Operator corrections after inspection:** (1) Ticket T3 said "next-sequential `10NNN_`"; the next feature migration number is 618 and the `10xxx` band is reserved (RLS/index/view/telemetry), corrected in place. (2) The relay used em-dashes in ticket labels and a few sentences, which `docs/anti-ai-style.md` forbids; replaced with colons and spaced hyphens. Every substantive path, table, service, route, and component name in the plan was cross-checked against the repo and verified real; the plan is a grounded brownfield extension, not an invented stack.
- **Grounding check:** Verified real against the tree: `sus_*` schema (287/288), the six `re_sustainability*` services, routes at `/api/re/v2/sustainability/*`, the `ReportKey` enum, the authoritative-state contract fields, the component paths (`RulMetricCard`, `AuditDrawer`, `LineageDrawer`, `StateCard`, `drawerPrimitives`), and the `no_legacy_repe_reads.py` lint pattern the regression-guard test mirrors.
