# Control Tower — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/system/control-tower` | `repo-b/src/app/lab/system/control-tower/page.tsx` | Main control tower UI |
| `/lab/env/[envId]/definitions` | `repo-b/src/app/lab/env/[envId]/definitions/page.tsx` | Environment definition editor |
| `/lab/env/[envId]/[deptKey]/capability` | `repo-b/src/app/lab/env/[envId]/[deptKey]/capability/page.tsx` | Per-dept capability view |
| `/lab/environments` | `repo-b/src/app/lab/environments/page.tsx` | Environment list |

### Key components
- Needs repo verification — inspect `repo-b/src/components/` for environment-related components

### API clients / hooks
- Needs repo verification — inspect `repo-b/src/lib/` for lab/env API clients

## Backend map

### Routes
| Method | Endpoint | File | Purpose |
|---|---|---|---|
| GET/POST | `/api/v1/lab/*` | `backend/app/routes/lab.py` | Lab environment CRUD |
| GET/POST | `/api/v1/lab/v2/*` | `backend/app/routes/lab_v2.py` | Lab v2 endpoints |
| GET/POST | `/api/v1/operator/*` | `backend/app/routes/operator.py` | Operator surface |
| GET/POST | `/api/v1/operator/agent/*` | `backend/app/routes/operator_agent.py` | Agent-driven operator |
| GET | `/api/v1/capability/*` | `backend/app/routes/capability.py` | Capability registry |

### Services
| Service | File | Purpose |
|---|---|---|
| Environment service | `backend/app/services/assistant_environment.py` | Environment context management |
| Pipeline v2 | `backend/app/services/environment_pipeline_v2.py` | Environment provisioning pipeline |
| Templates v2 | `backend/app/services/environment_templates_v2.py` | Environment template definitions |
| Seed packs v2 | `backend/app/services/environment_seed_packs_v2/` | Domain-specific seed data packs |
| Env context | `backend/app/services/env_context.py` | Per-request env context resolution |
| Operator gateway | `backend/app/services/operator_agent_gateway.py` | Operator agent routing |

### Schemas
| Schema | File | Used by |
|---|---|---|
| Lab schemas | `backend/app/schemas/lab.py` | lab routes |
| Lab v2 schemas | `backend/app/schemas/lab_v2.py` | lab_v2 routes |

## Data map

### Tables
- Needs repo verification — check Supabase for environment/lab tables
- Likely: `environments`, `lab_environments`, `environment_capabilities`, `environment_departments`

### Key patterns
- Every environment has `env_id` as the tenant isolation key
- RLS policies should enforce `env_id = current_setting('app.env_id', true)`

## AI / MCP / Runtime map

- Operator agent gateway: `backend/app/services/operator_agent_gateway.py`
- Confirm registry: `backend/app/services/operator_confirm_registry.py`
- Execution runtime: `backend/app/services/execution_runtime.py`

## Test map

- Needs repo verification — check `backend/tests/` for lab/environment test files
- Check `scripts/` for smoke tests related to environment provisioning

## Needs verification

- [ ] Exact table names in Supabase for environment records
- [ ] Whether environment creation flow is fully wired in the UI
- [ ] How seed packs are triggered and which environments they target
- [ ] Whether `environment_seed_packs_v2/legal_ops_starter.py` is the only seed pack or if others exist
- [ ] Control Tower UI — does it show all environments or only active ones?
