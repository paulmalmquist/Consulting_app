# Stone PDS — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/pds` | `repo-b/src/app/lab/env/[envId]/pds/` | PDS root |
| `.../pds/accounts` | `.../pds/accounts/` | Account management |
| `.../pds/adoption` | `.../pds/adoption/` | Adoption analytics |
| `.../pds/ai-briefing` | `.../pds/ai-briefing/` | AI-generated briefing |
| `.../pds/ai-query` | `.../pds/ai-query/` | Natural language query |
| `.../pds/backlog` | `.../pds/backlog/` | Project backlog |
| `.../pds/capacity` | `.../pds/capacity/` | Capacity planning |
| `.../pds/executive` | `.../pds/executive/` | Executive dashboard |
| `.../pds/financials` | `.../pds/financials/` | Financial overview |
| `.../pds/forecast` | `.../pds/forecast/` | Revenue forecast |
| `.../pds/pipeline` | `.../pds/pipeline/` | Deal pipeline |
| `.../pds/projects` | `.../pds/projects/` | Project list |
| `.../pds/resources` | `.../pds/resources/` | Resource management |
| `.../pds/revenue` | `.../pds/revenue/` | Revenue tracking |
| `.../pds/satisfaction` | `.../pds/satisfaction/` | Client satisfaction |
| `.../pds/utilization` | `.../pds/utilization/` | Utilization metrics |
| `/app/pds` | `repo-b/src/app/app/pds/` | PDS app surface |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/pds.py` | Core PDS routes |
| `backend/app/routes/pds_accounts_v2.py` | Account management v2 |
| `backend/app/routes/pds_adoption.py` | Adoption analytics |
| `backend/app/routes/pds_analytics.py` | Analytics endpoints |
| `backend/app/routes/pds_chat.py` | PDS chat/AI |
| `backend/app/routes/pds_executive.py` | Executive endpoints |
| `backend/app/routes/pds_metrics.py` | Metrics endpoints |
| `backend/app/routes/pds_query.py` | Natural language query |
| `backend/app/routes/pds_revenue.py` | Revenue endpoints |
| `backend/app/routes/pds_satisfaction.py` | Satisfaction tracking |
| `backend/app/routes/pds_utilization.py` | Utilization endpoints |
| `backend/app/routes/pds_v2.py` | V2 endpoints |

### Services
| File | Purpose |
|---|---|
| `backend/app/services/pds_adoption.py` | Adoption calculations |
| `backend/app/services/pds_adoption_analytics.py` | Adoption analytics |
| `backend/app/services/pds_revenue.py` | Revenue calculations |
| `backend/app/services/pds_satisfaction.py` | Satisfaction scoring |
| `backend/app/services/pds_utilization.py` | Utilization calculations |
| `backend/app/services/pds_analytics.py` (if exists) | Analytics aggregation |

### Schemas
| File | Purpose |
|---|---|
| `backend/app/schemas/pds.py` | Core PDS schemas |
| `backend/app/schemas/pds_executive.py` | Executive schemas |
| `backend/app/schemas/pds_v2.py` | V2 schemas |

### Connectors
- `backend/app/connectors/pds/` — PDS data source connectors (Needs repo verification for specific files)

## Data map

- Needs repo verification — identify Supabase tables for projects, resources, timecards, utilization, revenue
- Likely tables: `pds_projects`, `pds_resources`, `pds_timecards`, `pds_revenue`, `pds_satisfaction_scores`
- RLS expected via `env_id`

## AI / MCP / Runtime map

- PDS chat: `backend/app/routes/pds_chat.py`
- PDS query: `backend/app/routes/pds_query.py`
- AI briefing surface: `.../pds/ai-briefing/`

## Test map

- Needs repo verification — check `backend/tests/` for pds_* test files

## Needs verification

- [ ] Supabase table names for PDS data
- [ ] Whether utilization and revenue dashboards show real data or stubs
- [ ] What PDS connectors exist and what data sources they pull from
- [ ] Whether pds_v2.py is the active API or if pds.py is still used
