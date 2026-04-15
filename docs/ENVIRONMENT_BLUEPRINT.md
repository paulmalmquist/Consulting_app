# Environment Blueprint (v2) — Forward-Looking Create System

Status: **Phase A (foundation).** Live in code, not yet surfaced in the control-tower UI.

## What this is

A forward-looking path for creating **new** environments from a template/manifest. It coexists with the current `/v1/environments` creation flow — **existing canonical environments are intentionally untouched**.

The goal is that provisioning a future environment becomes:

1. Pick a template (`repe`, `client_delivery`, `internal_ops`, …).
2. Supply a `client_name` and any overrides in a manifest.
3. Hit `POST /v2/environments`.
4. Get a reviewable pipeline report back.

No schema-per-env branching logic. No per-client if-statements. No hand-copied seed scripts.

## What this is NOT (yet)

- **Not** a migration of existing envs. novendor / floyorker / resume / trading / meridian / stone-pds remain on the legacy path.
- **Not** a runtime takeover. Middleware slug validation, provider wiring, branding catalog, MCP tool gating, RLS on `app.environments` — all unchanged in this pass.
- **Not** a full capability enforcement layer. `enabled_modules` on the template is advisory; backend still trusts its own checks.
- **Not** a cloning / retiring / rollback framework. Those are later slices.

## Shape

```
┌──────────────────────────────┐
│ app.environment_templates    │   declarative registry (seeded in 516_*.sql)
│ (template_key, version)      │
└──────────────┬───────────────┘
               │ read
               ▼
┌──────────────────────────────┐
│ create_environment_v2()      │   staged pipeline, single DB transaction
│ backend/app/services/        │
│   environment_pipeline_v2.py │
└──────────────┬───────────────┘
               │ writes
               ▼
┌──────────────────────────────┐
│ app.environments             │   additive columns from 515_*.sql:
│                              │   template_key, template_version,
│                              │   env_kind, lifecycle_state,
│                              │   seed_pack_applied, manifest_json, …
└──────────────────────────────┘
```

## Identity contract (new envs only)

| Field | Mutability | Source of truth for |
|---|---|---|
| `env_id` (uuid) | immutable | All FKs, RLS, membership |
| `slug` | renamable via controlled endpoint | URL only |
| `client_name` | renamable freely | display |
| `template_key` | immutable after create | routing, nav resolution |
| `template_version` | immutable after create | upgrade tracking |
| `env_kind` | renamable | policy hint |
| `lifecycle_state` | state machine | launch-readiness |
| `manifest_json` | free-form but **allowlisted** | overflow template-specific settings only; never routing/auth/FK |

## Lifecycle state machine

```
draft → provisioning → seeded → verified → live
                   ↓        ↓         ↓
                  failed  failed   failed
                                   
live → retired (soft; row preserved)
```

The pipeline currently walks `draft → provisioning → seeded → verified` in one pass. `live` is set explicitly once owner/launch readiness is confirmed (out of scope for this pass).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v2/environments/templates` | List all active templates |
| `GET` | `/v2/environments/templates/{key}?version=N` | Single template (latest if version omitted) |
| `POST` | `/v2/environments` | Create a new env from a manifest. Supports `dry_run: true`. |
| `GET` | `/v2/environments/{env_id}/verify` | Lightweight health report |

## Creating a new environment

Minimum body:

```json
{
  "client_name": "Riverfront Capital",
  "template_key": "repe"
}
```

Fully-specified body:

```json
{
  "client_name": "Riverfront Capital",
  "template_key": "repe",
  "template_version": 1,
  "slug": "riverfront",
  "env_kind": "client",
  "seed_pack": "repe_starter",
  "owner_platform_user_id": "00000000-0000-0000-0000-000000000001",
  "theme_tokens": {"accent": "271 62% 63%"},
  "manifest_overflow": {
    "custom_copy": {"loginTitle": "Sign in to Riverfront"},
    "feature_flags": {"beta_waterfall_ui": true}
  },
  "dry_run": false
}
```

`manifest_overflow` is allowlisted. Permitted keys:

- `custom_copy`
- `feature_flags`
- `onboarding_checklist`
- `integration_handles`

Anything else is rejected at validation. If you find yourself wanting a new key, add a structured column on `app.environments` first.

## Dry-run

Every create supports `"dry_run": true`. Runs validation and returns the full pipeline preview without persisting. Use this before every production create.

## Adding a new template

1. Write a migration like `5NN_environment_template_<key>.sql` that `INSERT … ON CONFLICT DO UPDATE` into `app.environment_templates`.
2. If the template needs a bespoke seed pack, add a module under `backend/app/services/environment_seed_packs_v2/` and register it in `SEED_PACKS`.
3. If new capabilities / modules are needed, currently they're advisory (`enabled_modules` hint). Real enforcement is a later project.
4. Ship + invalidate the template cache (`environment_templates_v2.invalidate_cache()` on boot is automatic via 5-min TTL).

## Adding a new seed pack

1. Create `backend/app/services/environment_seed_packs_v2/<pack_name>.py` exposing:
   - `NAME: str`, `VERSION: int`
   - `apply(cur, env_id, business_id, *, actor) -> SeedResult`
2. Register it in the `SEED_PACKS` dict in `__init__.py`.
3. Keep it idempotent (`ON CONFLICT DO NOTHING` / `DO UPDATE`).
4. Keep it deterministic — no `random` calls; derive fixed UUIDs from `hash(slug + pack_name + row_index)` if you need them.

## Lessons mined from existing environments

Each legacy env is a reference pattern, NOT a conformance target:

| Legacy env | Mined into template | Lesson |
|---|---|---|
| novendor | `internal_ops` | Consulting Revenue OS. Pipeline stages + CRM are table stakes; dashboard layout should be operator-first. |
| stone-pds | `client_delivery` | Executive queue + data health + staged delivery. Clients want "what shipped, what's blocked." |
| meridian | `repe` | Fund/asset/investor hierarchy + waterfall + AUTHORITATIVE STATE rules for released quarters. |
| trading | `trading_research` | Research → backtest → paper → live pipeline. History Rhymes companion integrated. |
| resume | `public_profile` | Hybrid auth: public read, admin write. Narrative-first layout. |
| floyorker | `public_content` | Fully public marketing. SEO-first page model. |

## Troubleshooting

**Pipeline returns `create_rows: skipped` with `slug already exists`** — Expected for idempotent re-runs. Check if you meant to target a different slug.

**`manifest_overflow has disallowed keys`** — You're trying to put routing/auth/capability data in the JSON drawer. Either use an existing structured column or add a new one in a migration.

**`Unknown template_key`** — Template cache is stale or template not seeded. Restart the backend or call `environment_templates_v2.invalidate_cache()`.

**Seed pack rows missing** — Check the `stages[].artifacts` in the response for the seed pack step. The pack may have swallowed an error and kept going — look for warnings.

**Legacy env broken after migration 515** — Should not happen. All new columns are nullable/defaulted. If something broke, open `/v1/environments/{env_id}` and confirm the legacy columns (`industry`, `schema_name`, etc.) are still populated.

## What's deferred (next slices)

In priority order, when we pick this up again:

1. **Frontend manifest form** — CreateEnvironmentPanel → template picker + dry-run preview.
2. **Owner membership via session** — currently requires explicit `owner_platform_user_id`; should default to the authenticated caller.
3. **Template versioning UX** — upgrading an existing env from `repe@v1` to `repe@v2`.
4. **Capability enforcement** — turn `enabled_modules` into real runtime gates (start with one module, not all).
5. **RLS on `app.environments`** — only when session-plumbing contract is proven out in tests first.
6. **Cloning + retiring + rollback** — separate feature, don't stuff into create.
7. **Migration of a legacy env onto v2** — only after the v2 path has been exercised by 2-3 brand-new environments in production.
