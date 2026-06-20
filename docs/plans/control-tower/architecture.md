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
| GET/POST | `/v1/environments/*` | `backend/app/routes/lab.py` | Lab environment CRUD (legacy path) |
| GET/POST | `/v2/environments/*` | `backend/app/routes/lab_v2.py` | v2 env blueprint + contract/verify (mounted at `/v2`, no `/api/v1/lab` prefix — verified 2026-05-19). Frontend reaches it via `bosFetch("/v2/...")` through the `/bos` same-origin proxy. |
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

## EnvironmentContract + Promotion Gate (governance layer)

**Added 2026-05-19 (Ticket 1 — verifier + read-only). Status: verified.**

| Piece | File | Notes |
|---|---|---|
| Migration | `repo-b/db/schema/10004_environment_contract_promotion.sql` | Additive, zero backfill. `app.environment_contract` (env_id-keyed sidecar to `app.environments`) + `app.environment_promotion_event` (append-only audit, **dead until Ticket 2**). |
| Service | `backend/app/services/environment_contract_v2.py` | `get_or_derive_contract` (derives from `app.environments` + `app.environment_templates` only — no over-derivation), `verify_environment_contract` (fail-closed; `pass` is the only healthy status). |
| Schemas | `backend/app/schemas/lab_v2.py` | `EnvironmentContractOut`, `ContractVerificationReport`, `ContractCheck`, `PromotionState`. Additive. |
| API | `backend/app/routes/lab_v2.py` | `GET /v2/environments/{id}/verify` (upgraded from the thin stub; preserves `health_ok`; `?strict=1` → 503 fail-closed), `GET /v2/environments/{id}/contract`. |
| UI | `repo-b/src/components/lab/environments/EnvironmentContractCard.tsx` + `repo-b/src/app/lab/env/[envId]/blueprint/page.tsx` | Read-only card (modeled on `AuditDrawer`, dark `bm-*` tokens), rendered additively above the existing `DomainPreviewState` placeholder. No write affordances. |

**Key invariant:** `app.environment_contract.promotion_state` is governance state, **distinct from `app.environments.lifecycle_state`** (provisioning health). Capability binding is unimplemented (`environment_pipeline_v2._apply_template_metadata` is a no-op; no `app.environment_capabilities` table) → the verifier hard-codes `capability.binding_implemented = not_available, blocking`, so a structurally healthy env is still **not** promotable. This is intentional fail-closed posture, not a bug.

## Data map

### Tables
- **`app.environments`** — canonical v2 registry (verified live via Supabase CLI, 2026-05-19): carries `lifecycle_state`, `template_key/version`, `seed_pack_applied/version`, `manifest_json`, `last_health_report`. See `ARCHITECTURE.md` §"Environment registries".
- **`v1.environments`** — legacy narrow mirror; co-canonical until the frontend env-identity read moves off `/v1/environments/:id`.
- **`app.environment_templates`** — template registry, PK `(template_key, version)`.
- **`app.environment_contract`** / **`app.environment_promotion_event`** — governance sidecar (migration `10004`, see section above).
- **`app.environment_capabilities`** — does NOT exist yet (Phase 3). Verifier treats capability binding as `not_available`.

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
