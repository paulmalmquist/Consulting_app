# CRE Intelligence Graph MVP

This is the first Winston CRE intelligence slice implemented inside the existing FastAPI backend and Next.js RE workspace.

## Scope
- Target geography: Miami-Fort Lauderdale-West Palm Beach MSA
- Data sources: TIGER, ACS 5-year, BLS, HUD FMR, HUD USPS crosswalk, NOAA storm events, Kalshi market data
- LLM role: extraction and reconciliation support only; never the final system of record
- Market signals: read-only probabilities only; no trade execution, order guidance, or user trade data

## Database
- New schema bundle files:
  - `repo-b/db/schema/303_cre_intelligence_graph.sql`
  - `repo-b/db/schema/304_cre_intelligence_catalog.sql`
  - `repo-b/db/schema/305_cre_intelligence_rls.sql`
- The intelligence graph is additive and separate from the existing operational property tables.
- `re_pipeline_property` now gets a `canonical_property_id` column when migrations are applied.

## Connectors
- Runtime package: `backend/app/connectors/cre`
- Each connector follows the required `fetch.py`, `parse.py`, `load.py`, `tests.py` layout.
- The current MVP connectors are deterministic Miami fixtures so tests and demos remain reproducible without live network calls.
- Connector runs are written to `cre_ingest_run` and return an object-store path in the `cre-intel/raw/...` namespace.

## APIs
- Prefix: `/api/re/v2/intelligence`
- Coverage:
  - ingest runs
  - geography overlays
  - canonical property summaries and drilldowns
  - externalities
  - feature store reads
  - forecast materialization and retrieval
  - forecast questions and signal refresh
  - entity-resolution approvals
  - CRE document extraction index writes

## UI
- New RE workspace nav item: `Intelligence`
- New pages:
  - `/lab/env/[envId]/re/intelligence`
  - `/lab/env/[envId]/re/intelligence/properties/[propertyId]`
- The pipeline page now supports a choropleth overlay selector backed by the intelligence geography endpoint.

## Operations
- Backfill the seeded Miami slice:
  - `cd backend && python scripts/cre_backfill.py`
- Refresh a single source:
  - `cd backend && python scripts/cre_refresh.py acs_5y`
- Write seeded backtest rows for a property:
  - `cd backend && python scripts/cre_backtest.py <property_uuid>`

## Limitations
- The current connectors are fixture-backed scaffolds. They establish the production interface, run logging, and normalized write path, but they do not yet call live public APIs.
- Forecasting uses deterministic seeded formulas with model-versioned outputs. The contract is in place for true fitted models, but this slice prioritizes auditable end-to-end wiring.
- The document extraction endpoint persists a citation-backed structured record to `doc_store_index`; it does not yet replace the existing generic extraction service for all profiles.
