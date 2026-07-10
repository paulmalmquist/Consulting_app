# ADR 0001: Sustainability v1 is a Brownfield Extension into a Standalone BOS Environment

- Status: Accepted
- Date: 2026-07-10
- Deciders: Paul (owner)
- Supersedes: none
- Superseded by: none
- Related: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md` (master plan, PR #513)

## Context

The Novendor codebase already ships a REPE-scoped sustainability capability. Plan 0018 (`docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`) inventoried it, sequenced tickets T1-T12, and left five open questions. This ADR is the T1 deliverable: it records the existing capability, freezes the scope boundary between what stays put and what v1 builds, resolves the open question about the first demo environment, and defers the rest to specific downstream tickets.

The v1 sustainability tool is a brownfield extension, not a new build. The schema, backend services, routes, and REPE-scoped UI already exist. What is missing is a governed authoritative-state layer for sustainability metrics, unified-metric-registry entries for AI grounding, an evidence drawer, and a Business OS home outside the REPE workspace.

### Capability inventory verified against the repo (from plan 0018 section 1)

Schema (`repo-b/db/schema/`):

- `287_re_sustainability.sql` defines `sus_emission_factor_set`, `sus_emission_factor`, `sus_utility_account`, `sus_utility_monthly`, `sus_asset_profile`, `sus_asset_emissions_annual`, `sus_decarbonization_project`, `sus_regulation_catalog`, `sus_regulatory_exposure`, `sus_ingestion_run`, projection tables, and `sus_*_v` views.
- `288_re_sustainability_seed.sql` is the seed pack.
- The `sus_` prefix is listed as approved in `ARCHITECTURE.md`.

Backend:

- Services: `backend/app/services/re_sustainability.py`, `re_sustainability_ingestion.py`, `re_sustainability_projection.py`, `re_sustainability_reporting.py`, `re_sustainability_validation.py`, `re_sustainability_connectors.py`.
- Routes: `backend/app/routes/re_sustainability.py`, mounted at `/api/re/v2/sustainability/*` from `backend/app/main.py`.
- Schemas: `backend/app/schemas/re_sustainability.py`, including a `ReportKey` enum with `gresb`, `lp_esg_summary`, `sfdr_annex_ii`, `tcfd_summary`, `carbon_disclosure`, `quarterly_lp_section`.
- Tests: `backend/tests/test_re_sustainability_api.py`.

Frontend:

- BOS page (REPE-scoped): `repo-b/src/app/app/repe/sustainability/page.tsx`.
- Lab env page (REPE-scoped): `repo-b/src/app/lab/env/[envId]/re/sustainability/page.tsx`.
- Workspace: `repo-b/src/components/repe/sustainability/SustainabilityWorkspace.tsx`.

Reusable governance / evidence / grounding surfaces (targets to compose from, not rebuild):

- Authoritative-state contract: `backend/app/services/re_authoritative_snapshots.py`, `backend/app/schemas/re_authoritative.py`, `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`.
- Fail-closed vocabulary: `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`.
- Evidence drawers: `repo-b/src/components/re/AuditDrawer.tsx`, `repo-b/src/components/telemetry/metadata/LineageDrawer.tsx`, `repo-b/src/components/telemetry/RulEvidenceDrawer.tsx`, drawer chrome at `repo-b/src/components/telemetry/drawerPrimitives.tsx`.
- Metric cards: `repo-b/src/components/telemetry/RulMetricCard.tsx`, `repo-b/src/components/ui/MetricCard.tsx`, `repo-b/src/components/ui/StateCard.tsx`.
- AI grounding: `backend/app/services/ai_gateway.py` (the `_build_unified_metrics_block` and no-invention rule); registry at `backend/app/services/unified_metric_registry.py`.
- Intake + seed: `backend/app/services/re_sustainability_ingestion.py` and `sus_ingestion_run`; seed packs in `backend/app/services/environment_seed_packs_v2/`.
- Report center + export: `repo-b/src/app/app/reports/page.tsx`, `re_sustainability_reporting.py`, and the binary-safe export proxy at `repo-b/src/app/api/telemetry/[...path]/route.ts`.

### Confirmed v1 gaps

1. No `sus_authoritative_*` snapshot layer and no `get_authoritative_state`-style single reader for sustainability metrics.
2. Sustainability metrics are not registered in `unified_metric_registry.py`, so the AI copilot cannot ground or fail closed on them.
3. No sustainability lineage/evidence drawer wired to the REPE `AuditDrawer` or telemetry `LineageDrawer` pattern.
4. No dedicated BOS sustainability home outside the REPE-scoped page, and no sustainability MCP tool category.

## Decision

1. **v1 is a brownfield extension of the existing capability, not a rebuild.** All schema in `287_re_sustainability.sql`, all `re_sustainability*.py` services, and the `/api/re/v2/sustainability/*` routes stay as-is and are the substrate v1 builds on. No parallel `sus_*` service tree.

2. **v1 ships as its own dedicated Business OS environment behind the login.** The sustainability tool is a standalone environment, not a section of the existing REPE workspace. This resolves plan 0018 Open Question 5 (first demo environment).

3. **The v1 UI must not be wrapped in shared REPE or BOS workspace chrome.** No `RepeWorkspaceShell`, no `DomainWorkspaceShell`, no shared app-level shells. The new sustainability environment renders its own full-bleed layout, consistent with the standing operator rule that lab environment UIs are standalone. Composition still reuses primitives (`RulMetricCard`, `MetricCard`, `StateCard`, `drawerPrimitives`, charts) and the report-center export proxy.

4. **Scope boundary between the existing REPE-embedded surface and the new standalone environment is frozen for v1:**
   - The existing REPE-embedded pages (`repo-b/src/app/app/repe/sustainability/page.tsx`, `repo-b/src/app/lab/env/[envId]/re/sustainability/page.tsx`) and the existing `repo-b/src/components/repe/sustainability/SustainabilityWorkspace.tsx` are kept as-is. This ADR does not authorize edits to them. Any regression there during v1 delivery is out of scope for v1 and blocks the v1 release only if v1 caused it.
   - The new standalone Business OS sustainability environment is net-new UI at BOS paths (proposed home `repo-b/src/app/app/sustainability/` with a lab variant under `repo-b/src/app/lab/env/[envId]/sustainability/`). It composes a new BOS-level workspace (proposed `BosSustainabilityWorkspace.tsx`) that does not import from `SustainabilityWorkspace.tsx`.
   - Backend reuse is intentional: the new environment reads through the existing `/api/re/v2/sustainability/*` route group, extended in T5 with the read-only endpoints proposed in plan 0018 section 5. No new parallel route group.
   - Schema reuse is intentional: the proposed `sus_authoritative_*` layer (T3) sits on top of the existing `sus_*` facts, and does not replace or reshape them.

5. **The authoritative-state contract from REPE is the model for sustainability metrics.** The proposed `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, and `sus_authoritative_evidence` tables mirror `re_authoritative_snapshots` and expose the same `state_origin`, `trust_status`, `promotion_state`, `period_exact`, `null_reason`, `formula_id`, and `input_hash` fields. The reader service (T4) has a single `get_authoritative_state` entry point. No sustainability metric is displayed outside that path.

6. **Fail-closed vocabulary is the single source for null reasons.** New tokens `emission_factor_missing`, `metric_definition_missing`, and `out_of_certified_scope` land in `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md` in T2. The reader, the UI, and the AI copilot use those tokens; no local strings.

7. **v1 is read-only.** No new intake write path, no compliance certifications, no server-side export jobs. Uploads and normalization writes are deferred to T11. Certified regulator-facing reporting is a downstream flow of the existing report center via the existing `ReportKey` enum, not a new stack.

8. **The approved follow-on ticket sequence is T2 through T12 from plan 0018 section 9, unchanged.** T1 is this ADR.

### Open questions from plan 0018 section 10: resolved or deferred

1. **Target user for v1 (frozen deferred to T7 scoping).** The v1 UI ships governed dashboards for both the REPE fund operator persona and the corporate sustainability lead persona from the same read path; the LP-facing reporting analyst persona is served through the existing report center and not through a dedicated persona view in v1. Final metric-tile prioritisation on the dashboard is a T7 decision, not an ADR decision.
2. **Carbon accounting framework (deferred to T6).** GHG Protocol Corporate Standard scope 1/2/3 plus PCAF-style financed-emissions treatment is the working assumption behind the six proposed metric keys. This assumption requires source verification and is registered as such (`state_origin` labelled research-only until a source is registered) in T6 when the metric keys are added to `unified_metric_registry.py`. This ADR does not certify a framework.
3. **Source-record format (deferred to T11).** v1 is read-only against seed and existing facts; the source-record intake format (CSV vs meter API vs LP data-room PDF vs `re_sustainability_connectors.py` pull) is a T11 decision when the upload UI is designed. This ADR does not choose one.
4. **Certification level (frozen: internal decision-support only).** v1 is internal decision-support only. No external assurance (ISAE 3410, AA1000AS, or equivalent) is claimed by the platform. The `out_of_certified_scope` fail-closed token exists to make that boundary explicit at read time: any metric or report path that would require an assurance we do not hold returns `null` with that reason. Aligning to an assurance standard is a later ADR, not part of v1.
5. **First demo environment (frozen: dedicated standalone BOS environment).** v1 ships as its own Business OS environment behind the login, not embedded in the existing REPE env, and not spun on top of `skills/winston-create-environment/SKILL.md` as a lab-only pattern. The lab variant under `repo-b/src/app/lab/env/[envId]/sustainability/` exists to seed and demo the same environment end-to-end; it is not the shipping surface.

### Approved follow-on sequence (from plan 0018, unchanged)

- T2: Fail-closed vocabulary update in `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`.
- T3: Authoritative schema migration under `repo-b/db/schema/` (next feature migration number, currently 618; the 10xxx band is reserved for RLS/index/view/telemetry, not features) with `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, `sus_authoritative_evidence`, RLS on, `env_id` + `business_id`, comments, indexes justified.
- T4: Authoritative reader service `backend/app/services/re_sustainability_authoritative.py` mirroring `re_authoritative_snapshots.py`, single `get_authoritative_state` entry point.
- T5: Route skeleton extending `backend/app/routes/re_sustainability.py` with `/overview`, `/metric/{key}`, `/metric/{key}/evidence`, `/context`.
- T6: Register six v1 metric keys (`scope1_tco2e`, `scope2_location_tco2e`, `scope2_market_tco2e`, `scope3_tco2e`, `energy_intensity_kwh_per_sqft`, `water_intensity_gal_per_sqft`; note plan 0018 also proposes `emissions_intensity_tco2e_per_musd_revenue`, a T6 decision on tile ordering) in `backend/app/services/unified_metric_registry.py` with formulas, units, `formula_id`, and evidence contract.
- T7: Scaffold `repo-b/src/app/app/sustainability/` and a lab variant, backed by a new `BosSustainabilityWorkspace.tsx` composed of `RulMetricCard`/`MetricCard`/`StateCard`, no shared workspace shell.
- T8: Build `SustainabilityEvidenceDrawer.tsx` from `drawerPrimitives.tsx`, patterned on `AuditDrawer.tsx` and `LineageDrawer.tsx`, opened by metric-card click and `?audit_mode=1`.
- T9: Add a sustainability filter to `repo-b/src/app/app/reports/page.tsx` and route exports through the binary-safe proxy for the existing `ReportKey` bundles.
- T10: Wire the `/context` endpoint into `ai_gateway.py`'s unified metrics block; add refusal + citation policies; smoke-test with fixtures.
- T11: Add intake/upload endpoints and the write side of `re_sustainability_ingestion.py`, plus an upload UI (deferred to v1.1).
- T12: Implement the acceptance tests in plan 0018 section 8 and add a Winston eval scenario "sustainability grounded answer" mirroring the RS demo pattern.

## Consequences

### Positive

- Zero risk to the existing REPE-embedded sustainability surface. The scope boundary is stated in this ADR, and any diff that touches `SustainabilityWorkspace.tsx` or `repo-b/src/app/app/repe/sustainability/page.tsx` during v1 delivery is out of scope and reviewable as such.
- Backend reuse is maximal. v1 does not fork the schema, does not fork the route group, does not fork the services. The authoritative layer is additive.
- The v1 dashboard behaves like a released REPE snapshot from day one: versioned, reproducible, fail-closed, evidence-drawer-backed, AI-groundable. The contract is copied, not reinvented.
- Standalone environment gives sustainability its own login-visible surface, which is what a client evaluation needs. It also matches the operator rule that env UIs are full-bleed and not wrapped in shared chrome.
- The five open questions from plan 0018 are either resolved or explicitly deferred to a specific downstream ticket, so no v1 ticket has to re-litigate them.

### Negative

- Two BOS sustainability surfaces exist temporarily: the REPE-embedded one (kept as-is) and the new standalone Business OS environment. That is intentional for v1 to avoid regression risk, but it is duplication that will need a retire-vs-fold-in decision after v1 ships. That decision is a later ADR, not part of v1.
- Six metric keys and a working carbon-framework assumption (GHG Protocol + PCAF) are carried forward as research-only assumptions until T6 registers them with a verified source. The AI copilot must tag them as such until then.
- Deferring the source-record intake format to T11 means v1 demos run entirely on seed data plus existing facts. That is acceptable for a decision-support surface but does constrain what v1 can honestly claim about live tenant data.

### Neutral

- No schema, no route, no service, no frontend production code changes as a result of this ADR. The only diff for T1 is this ADR file and a status update on the master plan.

## Alternatives Considered

**Embed v1 inside the existing REPE sustainability page.** Rejected. It forces every v1 change to reason about REPE-scoped regressions, and it hides the sustainability tool behind a REPE workspace that some target users (corporate sustainability lead) do not otherwise use. The standalone environment removes both problems.

**Wrap the new BOS sustainability home in `RepeWorkspaceShell` or `DomainWorkspaceShell`.** Rejected. The standing operator rule is that lab environment UIs must be their own full-bleed design and not wrapped in shared chrome; sustainability v1 is treated the same way. Shared shells are useful for cross-module ops surfaces where nav consistency matters more than surface identity; that is not the sustainability v1 shape.

**Rebuild the sustainability schema from scratch under a new prefix.** Rejected. The `sus_*` prefix is already approved in `ARCHITECTURE.md` and the schema in `287_re_sustainability.sql` already carries the facts v1 needs to compute Scope 1/2/3, energy intensity, and water intensity. A rebuild would add risk without adding capability.

**Ship v1 with a full authoritative-state contract and a write-side intake in the same release.** Rejected. Intake writes and released snapshots are the two highest-risk surfaces in the plan. Shipping only the read side against seed + existing facts proves the authoritative contract for sustainability first; intake follows in T11.

## Implementation Notes

- This ADR is the T1 deliverable. It changes no code, no schema, no route, and no frontend production surface.
- Downstream tickets T2 through T12 are approved as sequenced in plan 0018 section 9, with T6 and T7 carrying the deferred decisions from Open Questions 1 and 2.
- Any assumption in this ADR about carbon frameworks (GHG Protocol scope boundaries, PCAF quality tiers) is a research-only assumption requiring source verification before it lands in shipping copy or the AI grounding block. See plan 0018 sections 4 and 7.
