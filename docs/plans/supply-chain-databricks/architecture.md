# Supply Chain / Databricks — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/supply-chain` | `repo-b/src/app/lab/env/[envId]/supply-chain/` | Supply chain root |
| `.../supply-chain/ai-sdlc` | `.../supply-chain/ai-sdlc/` | AI-assisted SDLC |
| `.../supply-chain/architecture` | `.../supply-chain/architecture/` | Architecture view |
| `.../supply-chain/data-products` | `.../supply-chain/data-products/` | Data product catalog |
| `.../supply-chain/forecasting` | `.../supply-chain/forecasting/` | Demand forecasting |
| `.../supply-chain/genie` | `.../supply-chain/genie/` | Genie NL query |
| `.../supply-chain/governance` | `.../supply-chain/governance/` | Data governance |
| `.../supply-chain/medallion` | `.../supply-chain/medallion/` | Medallion architecture view |
| `.../supply-chain/notebooks` | `.../supply-chain/notebooks/` | Databricks notebooks |
| `.../supply-chain/roadmap` | `.../supply-chain/roadmap/` | Roadmap view |
| `.../supply-chain/source-systems` | `.../supply-chain/source-systems/` | Source system map |

## Backend map

### Routes
- Needs repo verification — supply chain likely routes through `lab.py` or `lab_v2.py`
- May also use dedicated routes — check `backend/app/routes/` for supply_chain or sc_ prefixed files

### Data flow
- Databricks is the primary compute layer for supply chain
- Medallion architecture: Bronze → Silver → Gold
- Genie: natural language queries against Databricks Unity Catalog

### Connectors
- Databricks MCP: `mcp__claude_ai_Databricks__*` tools
- Needs repo verification for any backend connectors to Databricks

## Data map

- Primary data: Databricks workspace (not Supabase)
- Needs repo verification — identify whether any supply chain data is mirrored to Supabase
- Unity Catalog tables expected in Gold layer for supply chain KPIs

## AI / MCP / Runtime map

- Databricks MCP: authenticate, execute notebooks, query Unity Catalog
- Genie: natural language to SQL against Unity Catalog
- Needs repo verification for any backend AI integration with Databricks

## Test map

- Needs repo verification — check for supply chain specific tests
- Databricks notebooks in `notebooks/` may be relevant

## Needs verification

- [ ] Which supply chain pages are wired to real Databricks data vs. UI stubs
- [ ] Whether a Databricks workspace is configured for this environment
- [ ] Backend route(s) that serve supply chain data
- [ ] Whether Genie is a UI mockup or a real Databricks Genie integration
- [ ] Notebook files in `notebooks/` that are relevant to supply chain
