# Cherre Platform Reverse-Engineering — Scaffolding Audit & Meta-Prompt

- **Date**: 2026-03-16
- **Author**: Paul / Winston Architect
- **Status**: ready
- **Topic area**: CRE Intelligence Platform — Competitive Architecture
- **Question**: What does Winston already have that maps to Cherre's platform, what's missing, and what's the phased build plan to close the gap?

---

## Executive Summary

Cherre is a CRE data integration + knowledge graph + AI agent platform. After a full code audit of the Winston monorepo, **Winston already has ~60% of Cherre's core architecture built** — the intelligence graph schema, connector framework, entity resolution pipeline, forecast engine, and document extraction profiles are all in production-grade SQL and Python. The remaining ~40% falls into four categories: (1) live connector wiring, (2) knowledge graph traversal and owner unmasking, (3) data quality/observability, and (4) agent workflow marketplace.

This document is the canonical scaffolding audit: every Cherre capability mapped to a specific Winston file with a concrete status verdict.

---

## SECTION 1 — HAVE (Built and Functional)

### 1.1 Universal Data Model (Cherre: CORE)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Property dimension with geocoding | `dim_property` — uuid PK, PostGIS point, address, lat/lon, parcel_ids[], resolution_confidence, source_provenance | `repo-b/db/schema/303_cre_intelligence_graph.sql` | **BUILT** |
| Parcel dimension | `dim_parcel` — text PK (FIPS), MultiPolygon geom, assessed_value, tax_year | `303_cre_intelligence_graph.sql` | **BUILT** |
| Building dimension | `dim_building` — floors, construction_type, sqft, year_built | `303_cre_intelligence_graph.sql` | **BUILT** |
| Entity dimension (owners, tenants, lenders) | `dim_entity` — entity_type CHECK (owner, borrower, lender, manager, tenant, broker, analyst, insurer, servicer, other), identifiers JSONB | `303_cre_intelligence_graph.sql` | **BUILT** |
| Property-Entity bridge with confidence | `bridge_property_entity` — role, start_date, end_date, confidence, provenance | `303_cre_intelligence_graph.sql` | **BUILT** |
| Geography dimension (tracts, counties, CBSAs, ZIPs) | `dim_geography` — geoid, MultiPolygon geom, vintage, metadata | `303_cre_intelligence_graph.sql` | **BUILT** |
| Property-Geography bridge | `bridge_property_geography` — spatial_join match_method, confidence | `303_cre_intelligence_graph.sql` | **BUILT** |
| Pipeline geography (parallel model) | `pipeline_geography` — text GEOID PK, bbox, centroid, area_sq_miles | `303_pipeline_geography.sql` | **BUILT** |
| Geography aliases | `cre_geography_alias` — alias_type, alias_value, source | `303_cre_intelligence_graph.sql` | **BUILT** |
| Canonical property link from pipeline | `re_pipeline_property.canonical_property_id` FK → `dim_property` | `303_cre_intelligence_graph.sql` | **BUILT** |

### 1.2 Data Ingestion Layer (Cherre: CONNECT)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Connector SDK (fetch → parse → load) | `BaseConnector` with `ConnectorContext` / `ConnectorResult` dataclasses, `ensure_source_allowed()` gate | `backend/app/connectors/cre/base.py` | **BUILT** |
| Source registry with license/access controls | `cre_source_registry` — license_class, allows_robotic_access, respect_robots_txt, rate_limit | `303_cre_intelligence_graph.sql` | **BUILT** |
| Ingest run audit trail | `cre_ingest_run` — status, rows_read/written, error_count, duration_ms, raw_artifact_path | `303_cre_intelligence_graph.sql` | **BUILT** |
| Census TIGER geography connector | `tiger_geography/` — fetch.py, parse.py, load.py, tests.py | `backend/app/connectors/cre/tiger_geography/` | **SCAFFOLD** (fixture-backed) |
| ACS 5-Year demographics connector | `acs_5y/` | `backend/app/connectors/cre/acs_5y/` | **SCAFFOLD** |
| BLS labor market connector | `bls_labor/` | `backend/app/connectors/cre/bls_labor/` | **SCAFFOLD** |
| HUD Fair Market Rent connector | `hud_fmr/` | `backend/app/connectors/cre/hud_fmr/` | **SCAFFOLD** |
| HUD USPS ZIP crosswalk connector | `hud_usps_crosswalk/` | `backend/app/connectors/cre/hud_usps_crosswalk/` | **SCAFFOLD** |
| NOAA storm events connector | `noaa_storm_events/` | `backend/app/connectors/cre/noaa_storm_events/` | **SCAFFOLD** |
| Kalshi prediction markets connector | `kalshi_markets/` | `backend/app/connectors/cre/kalshi_markets/` | **SCAFFOLD** |
| Geography upsert helpers | `upsert_geographies()`, `upsert_market_facts()`, `upsert_geography_aliases()` | `backend/app/connectors/cre/base.py` | **BUILT** |
| Backfill scripts | `cre_backfill.py`, `cre_refresh.py`, `cre_backtest.py` | `backend/scripts/` | **BUILT** |

### 1.3 Intelligence APIs (Cherre: API Layer)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Ingest run management | POST/GET `/api/re/v2/intelligence/ingest/runs` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Geography GeoJSON endpoint | GET `/api/re/v2/intelligence/geographies` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Property search with bbox/type/risk | GET `/api/re/v2/intelligence/properties` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Property detail drilldown | GET `/api/re/v2/intelligence/properties/{id}` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Externalities bundle (hazards, market context) | GET `/api/re/v2/intelligence/properties/{id}/externalities` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| ML feature store reads | GET `/api/re/v2/intelligence/properties/{id}/features` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Forecast materialization | POST `/api/re/v2/intelligence/forecasts/materialize` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Forecast questions (prediction market style) | GET/POST `/api/re/v2/intelligence/questions` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Entity resolution candidates | GET `/api/re/v2/intelligence/entity-resolution/candidates` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Entity resolution approval | POST `/api/re/v2/intelligence/entity-resolution/candidates/{id}/approve` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| PostGIS spatial queries | `dim_property.geom` with GIST index, bbox filtering | `303_cre_intelligence_graph.sql` | **BUILT** |
| Full-text search (trigram) | `idx_dim_property_name_trgm` using `gin_trgm_ops` | `303_cre_intelligence_graph.sql` | **BUILT** |

### 1.4 ML / Forecasting Infrastructure (Cherre: ALPHA)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Feature store | `feature_store` — entity_scope, entity_id, period, feature_key, value, version, lineage_json | `303_cre_intelligence_graph.sql` | **BUILT** |
| Forecast registry with confidence intervals | `forecast_registry` — prediction, lower/upper_bound, baseline, explanation_json, source_vintages | `303_cre_intelligence_graph.sql` | **BUILT** |
| Model catalog | `cre_model_catalog` — model_family, model_version, is_active | `303_cre_intelligence_graph.sql` | **BUILT** |
| Feature set versioning | `cre_feature_set_catalog` — version, target_metro | `303_cre_intelligence_graph.sql` | **BUILT** |
| Forecast question framework | `forecast_questions` — probability, method, brier_score, resolution_criteria | `303_cre_intelligence_graph.sql` | **BUILT** |
| Signal observations per question | `forecast_signal_observation` — signal_source, signal_type, probability, weight | `303_cre_intelligence_graph.sql` | **BUILT** |
| Backtest results | `forecast_backtest_result` — metric_key, metric_value, sample_size, window_label | `303_cre_intelligence_graph.sql` | **BUILT** |
| Question templates | `cre_forecast_question_template` — fed_above_threshold, unemployment, hurricane, delinquency | `304_cre_intelligence_catalog.sql` | **BUILT** |
| Seeded model versions | elastic_net_seed_v1, hist_gradient_seed_v1, ensemble_seed_v1 | `304_cre_intelligence_catalog.sql` | **BUILT** |
| Metric catalog (16 metrics) | noi_actual, noi_proxy, rent_growth_next_12m, vacancy_change, distress_probability, etc. | `304_cre_intelligence_catalog.sql` | **BUILT** |

### 1.5 Entity Resolution (Cherre: Owner Unmasking Foundation)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Resolution candidate queue | `cre_entity_resolution_candidate` — candidate_type (merge/split/link), confidence, evidence JSONB | `303_cre_intelligence_graph.sql` | **BUILT** |
| Resolution decision audit trail | `cre_entity_resolution_decision` — action, before_state, after_state, approved_by | `303_cre_intelligence_graph.sql` | **BUILT** |
| Approval API | POST `/entity-resolution/candidates/{id}/approve` | `backend/app/routes/re_intelligence.py` | **BUILT** |
| Candidate listing API | GET `/entity-resolution/candidates` | `backend/app/routes/re_intelligence.py` | **BUILT** |

### 1.6 Document Extraction (Cherre: AI-Powered Ingestion)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Document store index | `doc_store_index` — type, uri, extracted_json, citations, confidence_score, review_status | `303_cre_intelligence_graph.sql` | **BUILT** |
| Extraction profiles | Offering Memo, Rent Roll, T12, Appraisal, Loan Agreement, Lease Abstract | `backend/app/services/extraction_profiles.py` | **BUILT** |
| CRE document extraction orchestration | `extraction.py` | `backend/app/services/extraction.py` | **BUILT** |

### 1.7 Frontend (Cherre: Dashboards)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Intelligence dashboard | `/lab/env/[envId]/re/intelligence/` | `repo-b/src/app/lab/env/[envId]/re/intelligence/page.tsx` | **BUILT** |
| Property detail page | `/lab/env/[envId]/re/intelligence/properties/[propertyId]/` | `repo-b/src/app/lab/env/[envId]/re/intelligence/properties/[propertyId]/page.tsx` | **BUILT** |
| Choropleth overlay selector | Pipeline page with geography endpoint | `repo-b/` | **BUILT** |
| REPE fund/deal/asset dashboards | Full REPE workspace | `repo-b/src/app/repe/` (10+ pages) | **BUILT** |
| Portfolio view | `/app/repe/portfolio/` | `repo-b/src/app/repe/portfolio/page.tsx` | **BUILT** |

### 1.8 Security & Multi-Tenancy (Cherre: SOC2 / RBAC)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| Row-level security on all intelligence tables | RLS with `current_tenant_id()` on 12 env-scoped tables | `305_cre_intelligence_rls.sql` | **BUILT** |
| Read-only shared reference tables | RLS `FOR SELECT USING (true)` on 8 catalog/geography tables | `305_cre_intelligence_rls.sql` | **BUILT** |
| Business-ID scoping | All dimension/fact tables include `env_id` + `business_id` FK | `303_cre_intelligence_graph.sql` | **BUILT** |

### 1.9 AI Gateway (Cherre: Agent.STUDIO Foundation)

| Cherre Concept | Winston Implementation | File(s) | Status |
|---|---|---|---|
| AI copilot with tool-calling | AI Gateway with OpenAI function-calling, 4-lane request routing | `backend/app/services/ai_gateway.py` (175KB) | **BUILT** |
| MCP tool registry | 27+ registered MCP tools with execution audit | `backend/app/mcp/registry.py`, `backend/app/mcp/tools/` | **BUILT** |
| REPE-specific MCP tools | 8 REPE tool modules (finance, workflow, platform, investor, analysis, ops) | `backend/app/mcp/tools/repe_*.py` | **BUILT** |
| RAG retrieval | Vector chunks with pgvector | `repo-b/db/schema/316_rag_vector_chunks.sql` | **BUILT** |
| LLM observability | Langfuse integration | `backend/app/` (config) | **BUILT** |

---

## SECTION 2 — SCAFFOLD (Interface Exists, Needs Wiring)

These have the production interface and normalized write paths but are fixture-backed or stub-only.

### 2.1 Live Connectors

All 7 CRE connectors follow the `fetch.py / parse.py / load.py / tests.py` pattern and write into the correct tables. They need live API calls replacing fixture data.

| Connector | Live API | Complexity | Priority |
|---|---|---|---|
| `tiger_geography` | Census TIGER/Line Shapefiles download | Medium (shapefile parsing) | **P1** — geography is foundation |
| `acs_5y` | Census API (`api.census.gov`) | Low (REST JSON) | **P1** — demographics feed features |
| `bls_labor` | BLS download files | Low (flat files) | **P2** |
| `hud_fmr` | HUD User API | Low (REST) | **P2** |
| `hud_usps_crosswalk` | HUD User download | Low (CSV) | **P3** |
| `noaa_storm_events` | NCEI bulk download | Medium (CSV, large) | **P3** |
| `kalshi_markets` | Kalshi REST API | Low (REST JSON) | **P3** |

### 2.2 Deterministic Forecasting

The forecast engine (`forecast_registry`, `forecast_questions`, `forecast_signal_observation`, `forecast_backtest_result`) is fully wired but uses seeded deterministic formulas. Needs:

- Real fitted models (elastic net, gradient boosting) on historical feature store data
- Brier-weighted ensemble logic for signal aggregation
- Automated backtest evaluation after each model version bump

---

## SECTION 3 — MISSING (Not Yet Built)

### 3.1 Knowledge Graph Traversal & Owner Unmasking (Cherre's Differentiator)

**What Cherre has**: Graph database with 4B+ entities, community detection algorithm, PySpark pipeline for owner unmasking, weighted typed edges, relationship traversal APIs.

**What Winston has**: The schema (`dim_entity`, `bridge_property_entity`, `cre_entity_resolution_candidate/decision`) but NO traversal engine, NO graph walk queries, NO community detection, NO automated candidate generation.

| Component | Winston File Target | What to Build |
|---|---|---|
| Ownership chain traversal | `backend/app/services/re_intelligence.py` | Recursive CTE walking `bridge_property_entity` chains: given Entity X → find all properties → find all co-entities → walk their properties. SQL-first, no graph DB needed. |
| Entity-to-entity relationship table | `repo-b/db/schema/306+` (new migration) | `cre_entity_relationship` — entity_a_id, entity_b_id, relationship_type (controls, subsidiary_of, partner_of, managed_by), confidence, provenance, weight (source count). Cherre uses weighted edges by frequency. |
| Community detection service | `backend/app/services/re_owner_unmasking.py` (new) | Python service using networkx or scipy sparse graphs. Louvain/Leiden community detection on entity relationship graph. Output: cluster assignments written to `dim_entity.cluster_id`. |
| Automated candidate generation | `backend/app/services/re_entity_matching.py` (new) | Fuzzy name matching (Jaro-Winkler, TF-IDF) + address overlap + role co-occurrence → generate `cre_entity_resolution_candidate` rows automatically. Current system only supports manual creation. |
| Owner unmasking API | `backend/app/routes/re_intelligence.py` | New endpoints: GET `/owner-graph/{entity_id}` (return relationship network), GET `/owner-unmasking/report/{property_id}` (trace true beneficial owner). |
| Owner network visualization | `repo-b/src/app/lab/env/[envId]/re/intelligence/` | D3 or Vis.js force-directed graph showing entity relationships, with owner-unmasking highlights. |

### 3.2 Data Quality & Observability (Cherre: QUALITY)

**What Cherre has**: Composable observability modules, row counts, fill rates, schema drift detection, lineage tracking, anomaly flagging.

**What Winston has**: `cre_ingest_run` audit trail (rows_read, rows_written, error_count) but NO automated quality checks, NO fill rate monitoring, NO lineage tracking beyond provenance JSONB.

| Component | Winston File Target | What to Build |
|---|---|---|
| Data quality rules engine | `backend/app/services/cre_data_quality.py` (new) | Rule definitions: required fill rates per column, value range checks (rent > 0), cross-table referential consistency, freshness thresholds per source. |
| Quality check table | `repo-b/db/schema/` (new migration) | `cre_quality_check` — run_id, table_name, check_type, check_name, passed boolean, metric_value, threshold, details JSONB. |
| Pipeline observability dashboard | `repo-b/src/app/lab/env/[envId]/re/intelligence/` | New tab showing: connector health (last run, row counts, error rates), fill rate heatmaps, stale source alerts. |
| Schema drift detection | `backend/app/services/cre_data_quality.py` | Compare incoming record schemas against expected schema per source. Flag new/missing/changed columns. |
| Lineage service | `backend/app/services/re_lineage.py` (exists — extend) | Extend existing lineage service to track intelligence graph data flow: source → ingest_run → dim_* table → feature_store → forecast_registry. |

### 3.3 Additional Connectors (Cherre: 120+ Partner Ecosystem)

**What Cherre has**: RentCast (rental market), Shovels (permits), Aterio (population forecasts), Clear Estimates (repair costs), CoStar/CBRE feeds, ERP connectors (Yardi, MRI, SAP).

**What Winston needs**: High-value public and semi-public data sources that feed the feature store and enable competitive analytics.

| Connector | Data Type | API | Priority | Target Files |
|---|---|---|---|---|
| RentCast (or Zillow ZTRAX equivalent) | Rental rates, vacancy, short-term rental data | REST API | **P1** | `backend/app/connectors/cre/rentcast/` |
| County Assessor / FOIA property records | Ownership, deed transfers, assessed values | Varies (bulk download or API) | **P1** | `backend/app/connectors/cre/county_assessor/` |
| Building permits (Shovels-style) | Permit filings, construction starts | REST API | **P2** | `backend/app/connectors/cre/building_permits/` |
| FRED / Treasury rates | Macro rates (Fed Funds, 10Y, spread) | FRED API | **P2** | `backend/app/connectors/cre/fred_macro/` |
| SEC EDGAR (REIT filings) | Institutional ownership, fund disclosures | EDGAR FULL-TEXT | **P3** | `backend/app/connectors/cre/sec_edgar/` |
| OpenStreetMap POI | Points of interest (retail, transit, schools) | Overpass API | **P3** | `backend/app/connectors/cre/osm_poi/` |
| Yardi / MRI adapter (client ERP) | Rent rolls, GL, lease data | Custom per client | **P3** | `backend/app/connectors/cre/erp_adapter/` |
| Submission Portal (vendor file upload) | Any CSV/Excel/PDF from 3rd-party vendors | Internal | **P2** | `backend/app/routes/cre_submission_portal.py` (new) |

### 3.4 Agent Workflow Marketplace (Cherre: Work Packages & Action Blocks)

**What Cherre has**: Curated AI agent chains for CRE tasks (due diligence, market scan, investor lists), Agent.STUDIO for building custom workflows, model-agnostic block chaining.

**What Winston has**: AI Gateway + 27 MCP tools + Codex orchestration engine, but NO curated CRE-specific workflow packages, NO visual workflow builder, NO marketplace catalog.

| Component | Winston File Target | What to Build |
|---|---|---|
| Work Package registry | `repo-b/db/schema/` (new migration) | `cre_work_package` — package_key, display_name, description, tool_chain JSONB (ordered list of MCP tool calls with input/output mappings), category, estimated_cost, is_active. |
| Work Package execution engine | `backend/app/services/cre_work_packages.py` (new) | Orchestrator that reads a `tool_chain` definition and executes MCP tools sequentially, passing outputs as inputs. Builds on existing `mcp/registry.py`. |
| Work Package API | `backend/app/routes/cre_work_packages.py` (new) | GET `/api/re/v2/work-packages` (catalog), POST `/api/re/v2/work-packages/{key}/run` (execute), GET `/api/re/v2/work-packages/runs/{id}` (status). |
| Seed work packages | `repo-b/db/schema/` (new migration seed) | Initial packages: `due_diligence` (property → owner → comps → zoning → report), `market_scan` (geography → demographics → rent trends → employment → summary), `investor_outreach` (owner-unmask → entity profile → draft outreach), `risk_assessment` (property → features → forecasts → risk score). |
| Workflow UI | `repo-b/src/app/lab/env/[envId]/re/intelligence/` | New "Workflows" tab showing available packages, run history, and results. |

### 3.5 Data Egress (Cherre: Snowflake/BigQuery/S3 Export)

**What Cherre has**: Scheduled export to Snowflake, AWS S3, Azure, BigQuery, SFTP. Bulk + incremental.

**What Winston has**: Nothing — all data stays in Supabase PostgreSQL.

| Component | Winston File Target | What to Build |
|---|---|---|
| Egress configuration table | `repo-b/db/schema/` (new migration) | `cre_egress_config` — target_type (snowflake, s3, bigquery, sftp), connection_config JSONB (encrypted), tables_included text[], schedule_cron, last_run_at. |
| Egress service | `backend/app/services/cre_egress.py` (new) | Worker that reads egress configs, queries Supabase, writes to target. Start with S3/SFTP (simplest), then Snowflake. |
| Incremental sync | `backend/app/services/cre_egress.py` | Track high-water-mark (last `updated_at`) per table per egress config. Only export changed rows. |

### 3.6 Address Standardization at Scale (Cherre: "3.3B+ Addresses")

**What Cherre has**: Address standardization using hundreds of millions of known addresses, automatic geocoding, address-to-parcel resolution.

**What Winston has**: `dim_property.address` (text), `dim_property.geom` (PostGIS point), `dim_parcel.parcel_id` — but NO standardization service, NO geocoding pipeline, NO address-to-parcel matching.

| Component | Winston File Target | What to Build |
|---|---|---|
| Address standardization service | `backend/app/services/cre_address.py` (new) | Parse → normalize → standardize addresses using libpostal or usaddress library. Deduplicate against `dim_property`. |
| Geocoding pipeline | `backend/app/services/cre_geocode.py` (new) | Batch geocoding via Census Geocoder API (free) or Nominatim. Write lat/lon/geom to `dim_property`. |
| Address-to-parcel spatial join | `backend/app/services/cre_address.py` | PostGIS `ST_Contains` join of geocoded point against `dim_parcel.geom`. Write to `dim_property.parcel_ids`. |

---

## SECTION 4 — ARCHITECTURE COMPARISON SCORECARD

| Cherre Layer | Cherre Description | Winston Equivalent | Completeness |
|---|---|---|---|
| **CONNECT** | 200+ connectors, submission portal, AI ingestion | `BaseConnector` + 7 scaffold connectors | **35%** — framework built, connectors need live API + new sources |
| **CORE** | Universal Data Model, schema mapping, normalization | `303-305` migrations, `dim_*` tables, `bridge_*` tables | **75%** — schema is strong, address standardization missing |
| **QUALITY** | Observability, fill rates, lineage, anomaly flagging | `cre_ingest_run` audit only | **15%** — audit trail exists, quality engine not built |
| **ALPHA** | AI agents, Agent.STUDIO, Work Packages marketplace | AI Gateway + 27 MCP tools + Codex orchestration | **40%** — AI infrastructure strong, CRE-specific workflows not packaged |
| **Knowledge Graph** | 4B+ entities, weighted edges, community detection, owner unmasking | `dim_entity` + `bridge_property_entity` + entity resolution | **30%** — schema exists, traversal/detection/unmasking not built |
| **APIs** | Unified geospatial + search + aggregation | `/api/re/v2/intelligence/*` (14 endpoints) | **70%** — comprehensive, needs owner graph + egress endpoints |
| **Dashboards** | Pre-built portfolio/market/asset templates | Intelligence + REPE dashboards | **50%** — intelligence page + REPE suite, needs portfolio KPI + owner network |
| **Egress** | Snowflake, S3, BigQuery, SFTP export | Not built | **0%** |
| **Security** | SOC2, RLS, RBAC, encryption | RLS on all tables, tenant isolation | **80%** — strong multi-tenant isolation |
| **Pricing/Metering** | Base + per-agent-run usage tracking | Not built (not yet needed) | **0%** (defer) |

---

## SECTION 5 — PHASED BUILD PLAN

### Phase 1: Live Data Foundation (Weeks 1-3)
**Goal**: Replace fixture-backed connectors with live API calls. Get real data flowing.

| Task | Surface | Files | Depends On |
|---|---|---|---|
| Wire `tiger_geography` to Census TIGER shapefile download | backend | `backend/app/connectors/cre/tiger_geography/fetch.py` | Nothing |
| Wire `acs_5y` to Census API for Miami CBSA 33100 | backend | `backend/app/connectors/cre/acs_5y/fetch.py` | TIGER geographies loaded |
| Wire `bls_labor` to BLS flat-file download | backend | `backend/app/connectors/cre/bls_labor/fetch.py` | Nothing |
| Wire `hud_fmr` to HUD User API | backend | `backend/app/connectors/cre/hud_fmr/fetch.py` | TIGER geographies loaded |
| Build address standardization service | backend | `backend/app/services/cre_address.py` (new) | Nothing |
| Build geocoding pipeline (Census Geocoder) | backend | `backend/app/services/cre_geocode.py` (new) | Address service |
| Add data quality checks for each connector | backend | `backend/app/services/cre_data_quality.py` (new), new migration | Live connectors |

### Phase 2: Knowledge Graph & Owner Unmasking (Weeks 3-5)
**Goal**: Build the graph traversal engine and automated entity resolution that differentiates from Cherre.

| Task | Surface | Files | Depends On |
|---|---|---|---|
| Add `cre_entity_relationship` table | schema | `repo-b/db/schema/` (new migration) | Nothing |
| Build ownership chain traversal (recursive CTE) | backend | `backend/app/services/re_intelligence.py` (extend) | Entity relationship table |
| Build fuzzy entity matching service | backend | `backend/app/services/re_entity_matching.py` (new) | `dim_entity` populated |
| Build community detection service (networkx Louvain) | backend | `backend/app/services/re_owner_unmasking.py` (new) | Entity relationships populated |
| Add owner-graph and unmasking API endpoints | backend | `backend/app/routes/re_intelligence.py` (extend) | Traversal + unmasking services |
| Build county assessor connector (deed/ownership records) | backend | `backend/app/connectors/cre/county_assessor/` (new) | Phase 1 address standardization |
| Build owner network visualization (D3 force-directed) | repo-b | `repo-b/src/components/intelligence/OwnerGraph.tsx` (new) | Owner-graph API |

### Phase 3: Agent Workflows & Work Packages (Weeks 5-7)
**Goal**: Package existing MCP tools into CRE-specific curated workflows.

| Task | Surface | Files | Depends On |
|---|---|---|---|
| Design work package schema and registry | schema | `repo-b/db/schema/` (new migration) | Nothing |
| Build work package execution engine | backend | `backend/app/services/cre_work_packages.py` (new) | MCP registry |
| Build work package API | backend | `backend/app/routes/cre_work_packages.py` (new) | Execution engine |
| Seed "due_diligence" work package | schema | `repo-b/db/schema/` (seed migration) | Package API |
| Seed "market_scan" work package | schema | `repo-b/db/schema/` (seed migration) | Package API |
| Seed "risk_assessment" work package | schema | `repo-b/db/schema/` (seed migration) | Phase 2 forecasts |
| Build Workflows UI tab | repo-b | `repo-b/src/app/lab/env/[envId]/re/intelligence/` (extend) | Package API |
| Add RentCast or equivalent rental data connector | backend | `backend/app/connectors/cre/rentcast/` (new) | Phase 1 framework |

### Phase 4: Observability & Egress (Weeks 7-9)
**Goal**: Production-grade data quality monitoring and external export.

| Task | Surface | Files | Depends On |
|---|---|---|---|
| Build quality rules engine | backend | `backend/app/services/cre_data_quality.py` (extend) | Phase 1 quality table |
| Build pipeline observability dashboard | repo-b | Intelligence page extension | Quality rules engine |
| Build lineage tracking extension | backend | `backend/app/services/re_lineage.py` (extend) | Quality rules engine |
| Build S3/SFTP egress service | backend | `backend/app/services/cre_egress.py` (new) | Nothing |
| Build egress configuration table | schema | `repo-b/db/schema/` (new migration) | Nothing |
| Add FRED macro rates connector | backend | `backend/app/connectors/cre/fred_macro/` (new) | Phase 1 framework |
| Add building permits connector | backend | `backend/app/connectors/cre/building_permits/` (new) | Phase 1 framework |

### Phase 5: Scale & Polish (Weeks 9-12)
**Goal**: Production hardening, real ML models, and advanced features.

| Task | Surface | Files | Depends On |
|---|---|---|---|
| Replace seeded forecasts with fitted models | backend | `backend/app/services/re_intelligence.py` (extend) | Phase 1 live data |
| Automated backtest evaluation | backend | `backend/app/services/re_intelligence.py` (extend) | Fitted models |
| Submission portal for vendor data upload | backend + repo-b | New route + new page | Phase 1 framework |
| SEC EDGAR REIT filings connector | backend | `backend/app/connectors/cre/sec_edgar/` (new) | Entity resolution |
| Snowflake egress adapter | backend | `backend/app/services/cre_egress.py` (extend) | Phase 4 S3 egress |
| Portfolio KPI dashboard (NOI, occupancy, LTV rollups) | repo-b | Intelligence page extension | Phases 1-3 data |
| ERP adapter framework (Yardi/MRI) | backend | `backend/app/connectors/cre/erp_adapter/` (new) | Phase 1 framework |

---

## SECTION 6 — NOTES FOR WINSTON AGENT

**Routing**: This document routes through `.skills/research-ingest/SKILL.md` for ingestion. Phase 1 tasks route to `.skills/feature-dev/SKILL.md` targeting `backend/app/connectors/cre/`. Phase 2 tasks route to `agents/data.md` (schema) + `.skills/feature-dev/SKILL.md` (services). Phase 3 tasks route to `.skills/feature-dev/SKILL.md` (all surfaces).

**Key Architectural Decisions**:
1. **No graph database required**: Cherre uses a graph DB, but Winston's PostgreSQL + PostGIS + recursive CTEs can handle the same traversals for our scale. The `bridge_property_entity` and new `cre_entity_relationship` tables form an adjacency list that supports graph walks.
2. **Work packages = MCP tool chains**: Cherre's "Action Blocks" are our MCP tools. Cherre's "Work Packages" are ordered sequences of MCP tool calls with typed I/O. The orchestration already exists in `mcp/registry.py` — we just need a declarative config layer.
3. **Start SQL-first, ML-second**: Cherre's knowledge graph training uses PySpark. We start with SQL-based entity matching (trigram similarity, address overlap, role co-occurrence) and upgrade to ML when the data volume justifies it.
4. **Live connectors are the bottleneck**: Every downstream feature (entity matching, forecasting, owner unmasking) depends on having real data in the graph. Phase 1 is the critical path.

**Open Questions**:
1. Which county assessor data source for Miami-Dade? (Options: county open data portal, FOIA bulk, or third-party aggregator)
2. RentCast API pricing — is it feasible for production use or do we need an alternative (Zillow ZTRAX, Apartment List)?
3. Should owner unmasking target Miami-Dade initially (matching our MSA scope) or go national from the start?
4. Egress priority — is any client currently requesting Snowflake/BigQuery export, or is S3 sufficient for now?
