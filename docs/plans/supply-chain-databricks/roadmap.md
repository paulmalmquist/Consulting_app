# Supply Chain / Databricks — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Identify which supply chain pages are stubs vs. live
- [ ] Verify Databricks connectivity (if configured)
- [ ] Confirm medallion architecture view is accurate

## Phase 1: Make the UI/operator flow coherent
- [ ] Medallion architecture page shows Bronze/Silver/Gold layer diagram with table counts
- [ ] Data products page lists catalog entries
- [ ] Forecasting page shows demand forecast chart
- [ ] Source systems page maps input data sources

## Phase 2: Wire deeper data/API behavior
- [ ] Genie NL query returns real results from Unity Catalog
- [ ] Notebooks page shows runnable or viewable notebook list
- [ ] Governance page shows lineage or quality metrics
- [ ] Forecasting uses real historical data

## Phase 3: Testing, instrumentation, release gates
- [ ] Verify Databricks connection health check
- [ ] Smoke test for Genie query
- [ ] AI usage attribution for Genie calls

## Phase 4: Polish / demo readiness
- [ ] Demo script: supply chain executive queries Genie in natural language
- [ ] Forecasting chart with scenario comparison
- [ ] Architecture diagram with clickable layers

## Reference
- Databricks MCP tools available for session-level integration
