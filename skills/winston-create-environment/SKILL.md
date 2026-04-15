---
name: winston-create-environment
description: Provisions a new Winston environment from a template + manifest via the v2 pipeline. Covers dry-run preview, full create, health check, and post-create verification. Use for any new client workspace, internal lab, REPE fund portal, delivery engagement, or trading research env. Does NOT touch existing canonical envs (novendor, meridian, stone-pds, trading, resume, floyorker).
source_of_truth: true
entrypoint: true
triggers:
  - create environment
  - new environment
  - provision environment
  - scaffold environment
  - set up client workspace
  - create client portal
  - new REPE environment
  - new PDS environment
  - new lab environment
  - new consulting environment
status: active
phase: A  # Foundation live. Frontend manifest form deferred to Phase B.
---

# Winston Create Environment

Creates a new environment from a declarative manifest via the v2 pipeline. The v1 canonical environments (novendor, meridian, stone-pds, etc.) are untouched — this path is forward-looking only.

## When to Use

- Onboarding a new client who needs their own workspace
- Spinning up a demo or sandbox environment
- Creating a new internal-ops or trading research lab
- Any time "create environment" or "new environment" is invoked
- Provisioning a fresh REPE, PDS, or consulting environment from scratch

## When NOT to Use

- Modifying an existing canonical env — edit its config directly
- Migrating legacy envs to the v2 path — that's a later phase
- Renaming slugs — use `POST /v1/environments/{env_id}/rename-slug`

---

## Quick Invocation

### Minimum manifest (Claude will derive slug, pick template defaults)

```json
{
  "client_name": "Riverfront Capital",
  "template_key": "repe",
  "dry_run": true
}
```

### Full manifest

```json
{
  "client_name": "Riverfront Capital",
  "template_key": "repe",
  "slug": "riverfront",
  "env_kind": "client",
  "seed_pack": "repe_starter",
  "theme_tokens": { "accent": "271 62% 63%" },
  "manifest_overflow": {
    "custom_copy": { "loginTitle": "Sign in to Riverfront Capital" },
    "feature_flags": { "paper_trading_only": false }
  },
  "dry_run": false
}
```

### Via curl

```bash
# Dry-run preview
curl -X POST $BACKEND_URL/v2/environments \
  -H "Content-Type: application/json" \
  -d '{"client_name": "Riverfront Capital", "template_key": "repe", "dry_run": true}'

# Apply for real
curl -X POST $BACKEND_URL/v2/environments \
  -H "Content-Type: application/json" \
  -d '{"client_name": "Riverfront Capital", "template_key": "repe", "slug": "riverfront", "env_kind": "client"}'

# List available templates
curl $BACKEND_URL/v2/environments/templates

# Health-check an existing env
curl $BACKEND_URL/v2/environments/{env_id}/verify
```

### Via Claude

Say any of:
- "Create a new REPE environment for Riverfront Capital"
- "Provision a client delivery workspace for Acme Corp"
- "Spin up an internal ops environment called Labs"
- "Dry-run a trading research lab"
- "What templates are available for new environments?"

Claude will ask for any missing required fields (client_name, template_key), run a dry-run first, show the stage preview, then apply on confirmation.

---

## Available Templates

| `template_key` | Use for | Default seed pack |
|---|---|---|
| `repe` | REPE fund portals, investor dashboards, waterfall | `repe_starter` |
| `client_delivery` | PDS / delivery engagements, exec summaries, data health | `client_delivery_starter` |
| `internal_ops` | Consulting revenue OS, CRM pipeline, operators | `internal_ops_minimal` |
| `trading_research` | Research → backtest → paper pipeline, History Rhymes | `trading_research_starter` |
| `public_profile` | Hybrid-auth public profiles, narrative-first | `public_profile_starter` |
| `public_content` | Fully public marketing sites, SEO-first | `public_content_starter` |
| `empty_lab` | Schema-only shell, no seed rows | `empty` |

See all templates live:

```bash
curl $BACKEND_URL/v2/environments/templates
```

---

## Manifest Fields

| Field | Required | Description |
|---|---|---|
| `client_name` | yes | Display label. 1–120 chars. |
| `template_key` | yes | One of the keys above. Immutable after create. |
| `template_version` | no | Pins to a specific version; omit for latest. |
| `slug` | no | URL-safe, derived from client_name if omitted. Pattern: `^[a-z0-9][a-z0-9-]{0,39}$` |
| `env_kind` | no | `internal` \| `client` \| `demo` \| `public` \| `lab` \| `resume`. Defaults from template. |
| `seed_pack` | no | Override template's default seed pack. |
| `theme_tokens` | no | `{ "accent": "H S% L%" }` (HSL string). |
| `manifest_overflow` | no | Allowlisted overflow. Keys: `custom_copy`, `feature_flags`, `onboarding_checklist`, `integration_handles`. |
| `owner_platform_user_id` | no | UUID of owner. Defaults to authenticated caller when session plumbing is wired. |
| `dry_run` | no | `true` = validate + preview without persisting. **Always run dry-run first.** |

`manifest_overflow` rejects any key not in the allowlist. Structured data always goes in explicit columns.

---

## Workflow

1. **Scope** — Gather `client_name` and `template_key`. Ask about `env_kind`, `slug`, seed pack only if non-obvious.
2. **Dry-run** — POST with `dry_run: true`. Review stage outputs:
   - `validate` — manifest shape, template lookup
   - `derive_ids` — slug uniqueness, env_id generation
   - `create_rows` — env + v1 mirror rows
   - `assign_owner_membership` — membership binding
   - `run_seed_pack` — deterministic seed rows
   - `health_check` — env row readable, seed coherent
3. **Confirm** — Show the user the stage preview and links. Prompt before applying.
4. **Apply** — Repost without `dry_run: true`. Confirm `env_id` and `lifecycle_state: verified` in response.
5. **Verify** — GET `/v2/environments/{env_id}/verify`. All stages should show `status: ok`.
6. **Report** — Emit `env_id`, dashboard URL, slug, seed pack applied, any warnings.

---

## Pipeline Stages (what the response shows)

```json
{
  "env_id": "...",
  "slug": "riverfront",
  "template_key": "repe",
  "template_version": 1,
  "lifecycle_state": "verified",
  "stages": [
    { "name": "validate",               "status": "ok", "duration_ms": 2 },
    { "name": "derive_ids",             "status": "ok", "duration_ms": 1 },
    { "name": "create_rows",            "status": "ok", "duration_ms": 18, "artifacts": { "env_id": "...", "slug": "riverfront" } },
    { "name": "assign_owner_membership","status": "ok", "duration_ms": 5  },
    { "name": "run_seed_pack",          "status": "ok", "duration_ms": 12, "artifacts": { "pack": "repe_starter", "rows_inserted": 5 } },
    { "name": "health_check",           "status": "ok", "duration_ms": 3  }
  ],
  "links": { "dashboard_url": "/lab/env/.../re" },
  "warnings": [],
  "errors": [],
  "dry_run": false
}
```

Idempotency: re-running the same manifest with the same slug returns `"status": "skipped"` on `create_rows` and reuses the existing env.

---

## Guardrails

- **Never touch canonical envs** — novendor, meridian, stone-pds, trading, resume, floyorker are legacy-path only. The v2 pipeline has no UPDATE or DELETE path to existing rows.
- **Authoritative state** — REPE seed packs (`repe_starter`) do NOT write `re_authoritative_snapshots`. That table remains read-only from the pipeline.
- **McpContext** — Only `actor`, `token_valid`, `resolved_scope`, `context_envelope`. Never add env_id or business_id as constructor fields.
- **manifest_overflow allowlist** — `custom_copy`, `feature_flags`, `onboarding_checklist`, `integration_handles`. Anything else belongs in a structured column. Add the column first, then use it.
- **v1 mirror required** — `_create_rows` inserts into both `app.environments` and `v1.environments`. Pipeline_stages FK (`v1.pipeline_stages.env_id → v1.environments.env_id`) requires this. Never insert pipeline_stages without the mirror row.
- **Slug uniqueness** — Slug is unique across all environments. If the slug already exists, `create_rows` returns `skipped` and reuses the existing env_id. Check for conflicts before proposing a slug.
- **Always dry-run first** — Confirm the pipeline preview before the real create, especially for client envs.

---

## Files

| File | Role |
|---|---|
| [backend/app/schemas/lab_v2.py](backend/app/schemas/lab_v2.py) | Pydantic manifest + response schemas |
| [backend/app/services/environment_pipeline_v2.py](backend/app/services/environment_pipeline_v2.py) | Staged create pipeline |
| [backend/app/services/environment_templates_v2.py](backend/app/services/environment_templates_v2.py) | Template registry reader (5-min TTL cache) |
| [backend/app/services/environment_seed_packs_v2/](backend/app/services/environment_seed_packs_v2/) | Seed pack registry + implementations |
| [backend/app/routes/lab_v2.py](backend/app/routes/lab_v2.py) | FastAPI router (`/v2/environments/...`) |
| [repo-b/db/schema/514_environment_templates.sql](repo-b/db/schema/514_environment_templates.sql) | `app.environment_templates` table |
| [repo-b/db/schema/515_environments_v2_columns.sql](repo-b/db/schema/515_environments_v2_columns.sql) | Additive columns on `app.environments` |
| [repo-b/db/schema/516_environment_templates_seed.sql](repo-b/db/schema/516_environment_templates_seed.sql) | Template seed data (7 templates) |
| [docs/ENVIRONMENT_BLUEPRINT.md](docs/ENVIRONMENT_BLUEPRINT.md) | Architecture reference + deferred items |
| [docs/examples/environment-manifests/](docs/examples/environment-manifests/) | 4 example manifests (all `dry_run: true`) |

---

## Example Manifests

Pre-built examples in [docs/examples/environment-manifests/](docs/examples/environment-manifests/):

- `repe-client.json` — REPE fund portal with Yardi integration handle
- `client-pds-delivery.json` — PDS delivery engagement with exec queue enabled
- `internal-ops-novendor-style.json` — Internal consulting ops with onboarding checklist
- `trading-research-lab.json` — Trading lab with History Rhymes and paper trading

All have `"dry_run": true`. Copy, edit `client_name` + `slug`, flip `dry_run` to apply.

---

## Deferred (not in Phase A)

- Frontend manifest form (CreateEnvironmentPanel template picker + step flow)
- Owner membership defaulting to authenticated session caller
- Template versioning UX (upgrade an env from repe@v1 → repe@v2)
- Capability enforcement (turn `enabled_modules` into runtime gates)
- RLS on `app.environments`
- Clone / retire / rollback
- Migration of legacy canonical envs onto v2

Reference: [docs/ENVIRONMENT_BLUEPRINT.md](docs/ENVIRONMENT_BLUEPRINT.md) — "What's deferred" section.
