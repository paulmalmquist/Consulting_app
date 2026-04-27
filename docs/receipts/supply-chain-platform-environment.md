# Receipt — Supply Chain Data Platform demo environment

Date: 2026-04-27
Branch: main (working tree)

## What shipped

A polished internal Novendor demo surface that proves we can architect an AI-native Databricks Lakehouse for a supply chain organization. The environment registers as a first-class Winston environment (industry `supply_chain`) and ships with its own shell, sidebar, and 10 routed pages worth of seeded supply-chain content.

## Routes added

All under `/lab/env/[envId]/supply-chain/`:

- `/` — Command Center
- `/architecture` — Reference architecture + capability cards
- `/source-systems` — SAP, Oracle Procurement, Manhattan WMS, Blue Yonder, MercuryGate TMS, Rockwell MES
- `/medallion` — Bronze / Silver / Gold pipeline inventory with DLT expectations
- `/data-products` — Six certified data products with owners, SLAs, certified metrics
- `/governance` — Unity Catalog hierarchy, PII tagging, access groups, lineage example
- `/ai-sdlc` — Six-phase AI SDLC (discovery → consume) with sample artifacts and gates
- `/forecasting` — Six ML model cards
- `/genie` — Static Q&A demo grounded on Gold tables
- `/roadmap` — 90-day delivery roadmap with risks and mitigation

## Files added

Frontend pages:

- `repo-b/src/app/lab/env/[envId]/supply-chain/layout.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/architecture/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/source-systems/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/medallion/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/data-products/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/governance/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/ai-sdlc/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/forecasting/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/genie/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/roadmap/page.tsx`
- `repo-b/src/app/lab/env/[envId]/supply-chain/page.test.tsx`

Frontend components:

- `repo-b/src/components/supply-chain/SupplyChainShell.tsx`
- `repo-b/src/components/supply-chain/SupplyChainSidebar.tsx`
- `repo-b/src/components/supply-chain/SupplyChainTopBar.tsx`
- `repo-b/src/components/supply-chain/SupplyChainCommandCenter.tsx`
- `repo-b/src/components/supply-chain/ArchitectureFlow.tsx`
- `repo-b/src/components/supply-chain/SourceSystemsPanel.tsx`
- `repo-b/src/components/supply-chain/PipelineInventory.tsx`
- `repo-b/src/components/supply-chain/DataProductsPanel.tsx`
- `repo-b/src/components/supply-chain/GovernanceMatrix.tsx`
- `repo-b/src/components/supply-chain/AISDLCPanel.tsx`
- `repo-b/src/components/supply-chain/ForecastingPanel.tsx`
- `repo-b/src/components/supply-chain/GenieDemoPanel.tsx`
- `repo-b/src/components/supply-chain/RoadmapTimeline.tsx`
- `repo-b/src/components/supply-chain/primitives.tsx`
- `repo-b/src/components/supply-chain/SupplyChainSidebar.test.tsx`

Frontend seed:

- `repo-b/src/lib/supply-chain/seed.ts`

Backend:

- `backend/app/services/environment_seed_packs_v2/supply_chain_starter.py`

E2E:

- `repo-b/tests/supply-chain-platform.spec.ts`

## Files edited

- `repo-b/src/components/lab/environments/constants.ts` — registered `supply_chain` industry, display label, predicate `isSupplyChainEnvironment`, and `resolveEnvironmentOpenPath` clause.
- `repo-b/src/components/lab/LabEnvironmentShell.tsx:167` — appended `supply-chain` to the `isDomainRoute` regex so the custom shell renders without the generic department/capability bar.
- `repo-b/src/components/lab/LabEnvTopBar.tsx` — suppressed parent top bar for `/supply-chain` routes (matches the existing `re`, `consulting`, `ncf` pattern).
- `backend/app/services/environment_seed_packs_v2/__init__.py` — registered the `supply_chain_starter` pack.

## Design decisions

1. **Custom shell, not the generic one.** The supply-chain demo is a vertical with its own information architecture (medallion layers, AI SDLC phases, Genie). The generic department/capability shell would have buried that. Bypassing the generic shell follows the established pattern used by `re`, `pds`, `credit`, `consulting`.

2. **Frontend-local typed seed, not backend rows.** Per spec, the rich content lives in `repo-b/src/lib/supply-chain/seed.ts` as typed exports. The backend seed pack only registers pipeline stages so the env appears in the registry. Swapping seed → API later is one substitution, not a rewrite.

3. **Skipped DomainEnvProvider.** The provider hits `/v1/environments/:id` and `getXContext` on mount; for a demo where the env may not have a real DB record, that adds risk for no benefit. The shell takes `envId` directly from layout params.

4. **Theme tokens only, with `dark:` overrides for color-coded status.** All surface chrome uses `bm-*` tokens that already adapt to the `data-theme` attribute. Health/trust chips define light defaults and `dark:` overrides so contrast holds in both modes.

5. **Static Genie demo.** Building real LLM grounding for the demo would cost more than it earns. The Q&A panel is deterministic but reads like the real surface — confidence chip, source tables, freshness, follow-ups.

## Test commands run

```bash
cd repo-b
npx tsc --noEmit -p tsconfig.typecheck.json   # → exit 0
npx vitest run src/app/lab/env/\[envId\]/supply-chain src/components/supply-chain
                                              # → 2 files, 3 tests, all pass
npx next lint --dir src/app/lab/env/\[envId\]/supply-chain --dir src/components/supply-chain --dir src/lib/supply-chain
                                              # → clean
npx next lint --file src/components/lab/environments/constants.ts \
              --file src/components/lab/LabEnvironmentShell.tsx \
              --file src/components/lab/LabEnvTopBar.tsx
                                              # → clean

cd .. && python -c "from backend.app.services.environment_seed_packs_v2 import get_pack; print(get_pack('supply_chain_starter').NAME)"
                                              # → supply_chain_starter
```

The Playwright spec `tests/supply-chain-platform.spec.ts` was authored against the same fixture pattern as `pds-executive.spec.ts` but was not run as part of this pass (the e2e suite needs a running dev server).

## v2 templates registry (follow-up — applied 2026-04-27 evening)

After the initial ship, applied schema files `514_environment_templates.sql`, `515_environments_v2_columns.sql`, `516_environment_templates_seed.sql`, and a new `517_environment_templates_supply_chain.sql` to prod. These had been authored months earlier but never deployed, which is why `POST /v2/environments` was returning 500.

Path:

1. New file `repo-b/db/schema/517_environment_templates_supply_chain.sql` registers the `supply_chain` template with `default_seed_pack: supply_chain_starter` and `default_home_route: /lab/env/{env_id}/supply-chain`.
2. Applied 514-517 to prod in a single transaction via `supabase db query --linked` with explicit `BEGIN; … COMMIT;` (not `npm run db:apply`, which would replay all 1-516 files).
3. Verified `GET /v2/environments/templates` returns 8 templates.
4. Dry-ran `POST /v2/environments` with `template_key: supply_chain`. Validate + dry_run_preview stages both `ok`; no row inserted.
5. Backfilled the existing legacy `aa41f51c-8bb0-483e-84db-58995071879c` row with v2 columns (`template_key`, `template_version`, `env_kind`, `lifecycle_state`, `lifecycle_state_at`, `default_home_route`, `seed_pack_applied`, `seed_pack_version`). The URL we already shared still resolves.
6. `v1.environments` row needs no schema change — its columns predate v2.

## Known limitations

- Seed data is frontend-local. Six source systems, 18 medallion tables, six data products, six ML models, four Genie Q&A pairs — all typed constants in `repo-b/src/lib/supply-chain/seed.ts`. Swap to API in the next pass.
- Genie panel is static. No live model call.
- Architecture flow is a CSS grid with bordered cards, not an interactive diagram. Fine for the canonical view, won't scale to drag-edit.
- Backend seed pack only seeds `v1.pipeline_stages` (5 phases). Richer rows are deferred per the v2 seed-pack convention.
- Playwright smoke not executed in this pass — author-only.
- `supabase/config.toml` has `schema_paths = []`, so future schema files in `repo-b/db/schema/` won't auto-apply on `supabase db push`. Manual concat-and-pipe via `supabase db query --linked` remains the deploy path until that's fixed.

## How to verify locally

```bash
cd repo-b
npm run dev
# visit /lab/env/<any-existing-envId>/supply-chain
# the demo content renders regardless of the env's actual industry — the route is
# self-contained on typed seed.
```

Toggle the theme via the icon in the supply-chain top bar and confirm contrast holds across all 10 pages.
