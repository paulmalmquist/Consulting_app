# Dispatch Record 0003 — Outreach Personalizer Microsite (Phases 1 + 2A + 2B + 2C + 3 + 3.5)

**Created:** 2026-05-19
**Status:** Phases 1 + 2A + 2B + 2C + 3 LANDED on `main` via PR #68 (`d9f6733e`),
PR #81 (`c22182ba`), and PR #85 (`53d0e9d0`). **Phase 3.5 IN PROGRESS 2026-05-20** —
operator-selectable template + visible template summary + explicit
`/scaffold-env/recreate` flow + per-business sprawl guard (see "Phase 3.5"
section below). **Zero-migration ticket** — all required columns
(`scaffolded_env_id`, `app.environments.slug` + unique index,
`app.environment_templates.display_name` + `default_seed_pack`) already exist.
80/80 outreach tests pass + 34 pitch-forge/env_pipeline_v2 regression pass + 2
skips pre-existing; repo-b typecheck clean.
**Environment:** Consulting / Novendor CRM
**Deliverable type:** Multi-phase build (Phase 1 vertical slice + 2A/2B/2C/3 operational layers)

---

## Phase 2A — Loom URL edit/save + CRM account linking

**Scope (intentionally limited):** persist + validate `loom_url`, link a target to an
existing `crm_account` via `crm_account_id`, optional `logo_url`/`accent_hsl` updates.
Reuse the existing CRM surface — `crm_svc.list_accounts` / `GET /api/crm/accounts`
(`backend/app/routes/crm.py:16`, `backend/app/services/crm.py:11`). **No new CRM
model. No new migration** — `loom_url`, `crm_account_id`, `logo_url`, `accent_hsl`
already exist in `cro_outreach_target` (migration 611). **Env scaffolding stays out
of scope.** No Apollo, scraping, Clearbit. History Rhymes diffs untouched.

**Backend**
- `backend/app/services/outreach_personalizer.py`: `normalize_loom_url()` (shared
  validator — accepts only `loom.com/share|embed/<id>`, normalizes to embed URL,
  rejects javascript:/data:/arbitrary iframes; `None` clears); `patch_target()`
  (dynamic SET, supports explicit null-clear, keeps Phase 1 `update_target` intact);
  `crm_account_exists()` + `crm_account_summary()` (FK existence guard + summary read
  of `crm_account`, not a model).
- `backend/app/schemas/outreach_personalizer.py`: `MicrositeUpdateIn`
  (all-optional; route uses `model_dump(exclude_unset=True)` so absent ≠ explicit null).
- `backend/app/routes/outreach_personalizer.py`: `PATCH /targets/{id}` (validate
  loom + crm_account_id; 400 on invalid/missing; returns target+assets+microsite_url
  +crm_account). `_microsite_payload` re-validates `loom_url` so a tampered DB value
  can't inject an arbitrary iframe (defense in depth).

**Frontend**
- `repo-b/src/lib/outreach-personalizer-api.ts`: `patchOutreachTarget()`,
  `listCrmAccounts()` (reuses `/bos/api/crm/accounts?business_id=`).
- operator page: Loom URL input + Save + error state; CRM account picker (lists when
  `businessId` present, else manual id) + linked-account display; logo/accent inputs;
  refresh after save.
- `LoomEmbed.tsx`: explicit reject of non-loom/unsafe schemes (render-side guard;
  preserve the intentional `&apos;` lint edit in `MicrositeView.tsx`).

**Acceptance:** valid Loom saves → microsite flips pending→ready embed; invalid Loom
→ clear 400; crm link validated (exists→ok, missing→400); logo/accent persist;
Phase 1 seed + public tracking unaffected; pitch-forge + typecheck green.

---

## Phase 2B — Engagement rollup + CRM activity follow-through

**Scope (intentionally limited):** close the loop
`microsite engagement → operator visibility → CRM activity`. Aggregate
`cro_microsite_event` (Phase 1 table — the source of engagement truth) into per-target
rollups surfaced on the operator read endpoints, and let the operator log that
engagement as a CRM activity by **reusing the existing** `crm_svc.create_activity`
(`backend/app/services/crm.py:271`) into `crm_activity`. **No new CRM/event/activity
model. No new migration.** Env scaffolding, Apollo, scraping, Clearbit remain out of
scope. History Rhymes + the `fix/consulting-task-generation-logging` dirty tree
untouched (Phase 2B is built in an isolated git worktree).

**Pipeline advance — deliberately NOT built.** The only existing stage mechanism is
`crm_svc.move_opportunity_stage` (`backend/app/services/crm.py:344`), which needs a
linked `crm_opportunity` + stage id; outreach targets have no opportunity linkage in
this model. Inventing one is out of scope, so the operator UI shows a disabled
"Advance pipeline — not available (Phase 2C)" affordance instead.

**Backend**
- `backend/app/services/outreach_personalizer.py`: `engagement_rollup(target_id)`
  (total_views, total_ctas, last_viewed_at, last_cta_at, recent_events[] —
  event_type+occurred_at only; no IP/user-agent exposed) and
  `engagement_rollup_bulk(target_ids)` (one grouped query for the list view).
- `backend/app/routes/outreach_personalizer.py`: `GET /targets/{id}` gains
  `engagement` (full rollup incl. recent_events); `GET /targets` gains a per-target
  `engagement` summary (counts + last seen, no recent list). POST/PATCH responses
  unchanged so Phase 1/2A FakeCursor sequences don't regress. New
  `POST /targets/{id}/crm-activity` → composes a subject/body from the rollup and
  calls `crm_svc.create_activity`. Fail closed: 400 if target has no
  `crm_account_id`; 400 if no `business_id` (can't resolve tenant for create_activity).
- `backend/app/schemas/outreach_personalizer.py`: `LogCrmActivityIn` (optional
  operator `note`).

**Frontend**
- `repo-b/src/lib/outreach-personalizer-api.ts`: `logCrmActivity()`; engagement
  fields typed onto the target detail/list responses.
- operator page: detail panel shows views / CTAs / last viewed / last CTA / recent
  events + "Log CRM activity" button (disabled w/ reason when not CRM-linked or no
  business_id) + success/error state; small "Hot" badge in the list when CTAs > 0;
  detail re-fetched after seed/save so counts refresh.

**Acceptance:** detail+list carry correct rollups (counts, last-seen, recent desc);
log-activity 400s clearly without a linked account; succeeds via mocked `crm_svc`;
no IP/UA in operator UI; Phase 1 seed + 2A loom/CRM + public tracking unaffected;
pitch-forge + typecheck green; no new migration; no duplicate models.

---

## Context

Novendor has pitch-forge (deck generation, `backend/app/routes/pitch_forge.py`) and consulting
outreach surfaces (`repo-b/src/app/lab/env/[envId]/consulting/strategic-outreach/page.tsx`), but
nothing that turns a single named REPE/asset-management firm into a public, personalized
business-development microsite with tracked views/CTA clicks.

Phase 1 builds the smallest working vertical slice for one test lead — **Artemis Real Estate
Partners** (`firm_slug = artemis-real-estate-partners`, public route
`/for/artemis-real-estate-partners`): operator seeds the target, AI (or deterministic fallback)
generates insight/loom-script/cold-email assets, a public microsite renders, and
microsite_view / microsite_cta events persist.

Intended outcome: operator can demo a tailored Novendor case for Artemis end to end without any
environment scaffolding.

---

## Dispatch routing

- **Environment:** Consulting / Novendor CRM
- **Backend:** `backend/app/routes/outreach_personalizer.py`,
  `backend/app/services/outreach_personalizer.py`,
  `backend/app/services/outreach_personalizer_ai.py`,
  `backend/app/services/outreach_personalizer_prompts.py`,
  `backend/app/schemas/outreach_personalizer.py`, `backend/app/main.py` (router registration)
- **Frontend:** `repo-b/src/lib/outreach-personalizer-api.ts`,
  `repo-b/src/app/lab/env/[envId]/consulting/outreach-personalizer/page.tsx`,
  `repo-b/src/app/(marketing)/for/[slug]/page.tsx` (+ `MicrositeView.tsx`, `opengraph-image.tsx`),
  `repo-b/src/components/marketing/personalizer/{FirmHeader,InsightCards,LoomEmbed,CtaButton}.tsx`,
  `repo-b/src/components/consulting/ConsultingWorkspaceShell.tsx` (1 nav item)
- **DB/schema:** additive only — new migration `repo-b/db/schema/611_outreach_personalizer.sql`
  (611 confirmed next free; highest existing is 610)
- **AI/runtime:** mirrors pitch-forge — `get_instrumented_sync_client()`, `gpt-4o`, temp `0.2`,
  strict JSON; deterministic Artemis fallback on the seed path only
- **Evals:** `backend/tests/test_outreach_personalizer.py` (modeled on
  `backend/tests/test_pitch_forge_constraints.py`), `repo-b` typecheck
- **Skill/router:** `skills/outreach-personalizer/SKILL.md` + `CLAUDE.md` router row

---

## Requested work

1. Planning artifact (this file).
2. Migration `611_outreach_personalizer.sql`: `cro_outreach_target`, `cro_outreach_asset`,
   `cro_microsite_event` (additive table — see Decisions).
3. Backend route/service/AI/prompts/schemas + router registration, prefix
   `/api/outreach-personalizer/v1`.
4. AI generation of 3 assets (insight, loom_script, cold_email) + deterministic Artemis pack.
5. Operator page + consulting nav link.
6. Public microsite (server shell + client view + 4 section components + OG image).
7. Skill doc + CLAUDE.md router row.
8. Backend tests + verification.

## Decisions (resolved this ticket)

- **AI fallback = deterministic seed pack.** `POST /targets` for Artemis uses AI when
  `OPENAI_API_KEY` is set, else emits a clearly-labeled deterministic pack
  (`source: "deterministic_seed"`). `POST /targets/{id}/regenerate/{asset_type}` fails closed
  (AI required) to preserve pitch-forge parity (pitch-forge has no fallback —
  `backend/app/services/pitch_forge_ai.py:36-45`).
- **Dedicated `cro_microsite_event` table, not extending `cro_engagement_event`.**
  `cro_engagement_event` (`repo-b/db/schema/437_engagement_tracking.sql:13-18`) has
  `tracking_id uuid NOT NULL` + `business_id uuid NOT NULL` + an email-specific inline
  `CHECK (event_type IN ('open','click'))`. Public microsite events are anonymous. Weakening
  production NOT NULLs to overload an email table is the unsafe hack the ticket warns against;
  a clearly-named additive table is the sanctioned path.

## Files expected to change

See Dispatch routing above. All new files except `backend/app/main.py` (2 lines),
`repo-b/src/components/consulting/ConsultingWorkspaceShell.tsx` (1 nav entry), `CLAUDE.md`
(1 router row), `backend/tests/conftest.py` (1 line — add service to `_GET_CURSOR_TARGETS`),
`docs/tips.md` (append lessons).

## Acceptance criteria

- Operator opens `/lab/env/[envId]/consulting/outreach-personalizer`, seeds Artemis, sees
  insights / loom script / cold email / microsite URL.
- `/for/artemis-real-estate-partners` renders a polished microsite; missing Loom →
  "Personal video pending", never a broken embed.
- `POST /api/outreach-personalizer/v1/targets` idempotent on `(env_id, firm_slug)`;
  `GET /targets` lists it; `GET /microsite/artemis-real-estate-partners` returns sections;
  `POST /microsite/artemis-real-estate-partners/track` records view + cta.
- Migration applies cleanly; target/assets/events persist.
- AI output structured JSON; deterministic seed when no key; cold email exactly 4 sentences
  referencing ≥1 named insight; no fabricated private facts.
- New backend tests pass; `repo-b` typecheck passes (or pre-existing failures documented).
- pitch-forge, existing consulting outreach pages, auth, env scaffolding all untouched.

## Risks

- Public microsite must reach backend through the non-auth-gated `/bos/[...path]` proxy
  (`repo-b/src/app/bos/[...path]/route.ts`) — confirmed it forwards without requiring a session.
- RLS vs public read: new tables use the 609-style
  `env_id = current_setting('app.env_id', true) OR current_setting('app.env_id', true) IS NULL`
  policy; backend pool role also bypasses RLS. Public read is slug-scoped — fine for the
  single-tenant test; Phase 2 must add env disambiguation if a slug recurs across envs.
- Deterministic fallback diverges from pitch-forge's fail-hard convention — contained to the
  seed path, clearly labeled; regenerate stays fail-closed.
- `apply.js` runs single-transaction by default — `611` is self-contained and idempotent.
- `crm_account` FK targets `crm_account_id` (not `id`) — `repo-b/db/schema/260_crm_native.sql:5`.

## Out of scope (Phase 2+)

Environment scaffolding (`environment_pipeline_v2.create()` is **not** called), CRM account
auto-linking, Apollo/sales-intelligence enrichment, Loom URL edit/save loop, web scraping,
repo-c.

## Verification

1. `cd repo-b/db/schema && node apply.js --files 611 --dry-run`
2. `python -m pytest backend/tests/test_outreach_personalizer.py -q`
3. `cd repo-b && npm run typecheck`
4. Backend up: POST /targets (Artemis) twice → same id; GET /targets;
   GET /microsite/artemis-real-estate-partners; POST .../track view+cta.
5. Operator page + `/for/artemis-real-estate-partners` visual check.

---

## Phase 2C — Pipeline follow-through (COMPLETE 2026-05-20)

Closes the loop: target → CRM account → CRM opportunity → safe pipeline advance.

**Decision (re-verified against current main):** explicit `crm_opportunity_id`
link on `cro_outreach_target` (Option A). `crm_opportunity` carries no
account-cardinality guarantee (no UNIQUE, no partial-unique on `status='open'`,
`crm_account_id` is even nullable on the opportunity side); the "one open
opportunity per account" rule is a convention in `lead_ingest.py:462-473` only.
Resolving opportunity from account would be unsafe.

**Pre-implementation precondition verified:** end-to-end trace of the Artemis
seed path (`useConsultingEnv().businessId` → `seedOutreachTarget(envId, ARTEMIS,
businessId || undefined)` → query+body `business_id` → `_resolve_env` →
`create_target(business_id=...)` → INSERT) confirmed business_id IS persisted
when the env has one. Live smoke re-confirmed (assertion `seed["target"]
["business_id"] is not None` passed). No fix needed; the live smoke runs under
an env with a real business_id.

**Migration `612_outreach_personalizer_opportunity_link.sql`** — applied.
Single additive column `crm_opportunity_id uuid REFERENCES
crm_opportunity(crm_opportunity_id) ON DELETE SET NULL`, partial index
`idx_cro_outreach_target_opp`, idempotent CHECK
`cro_outreach_target_opp_requires_account` (opp NULL OR account NOT NULL).
Idempotent guards mirror `611`.

**Backend** (`backend/app/services/outreach_personalizer.py`,
`backend/app/routes/outreach_personalizer.py`,
`backend/app/schemas/outreach_personalizer.py`):
- `crm_opportunity_exists(*, crm_opportunity_id, business_id)` — FK guard +
  same-business check.
- `crm_opportunity_summary(*, crm_opportunity_id)` — opp + joined stage fields.
- `list_opportunity_summaries_bulk(*, opp_ids)` — single LEFT JOIN for the
  list-view linked indicator (no N+1; empty input short-circuits, so existing
  Phase 1/2A/2B tests do not consume an extra FakeCursor push).
- `_next_open_stage(*, cur, business_id, current_order)` — **single owner** of
  the next-stage policy: `ORDER BY stage_order ASC, key ASC LIMIT 1`,
  business-scoped, `is_closed=false`, `stage_order > current`.
- `_CLOSED_OPP_STATUSES = ("won", "lost", "archived")` — single owner of the
  terminal-status set. (`on_hold` + `cold_hold` are active-but-paused and CAN
  be advanced.)
- `compute_pipeline_advance_state(*, target, opportunity=None)` — single source
  of truth for the 7-step gate, used by both display (GET /targets/{id}) and
  enforcement (POST .../advance-pipeline). `opportunity` kwarg lets the route
  pre-fetch the summary once and avoid a duplicate SELECT.
- `_PATCHABLE` extended with `crm_opportunity_id`; UUID-stringification branch
  generalised via `_UUID_PATCH_COLS`.
- Route: PATCH adds (a) clear-order guard with exact message
  `"Clear the linked CRM opportunity before clearing the CRM account."` at the
  route layer (before the migration 612 CHECK can fire), (b) opp FK +
  same-business guard.
- Route: `GET /targets/{id}` adds `crm_opportunity` summary + `pipeline` full
  gate state (pre-fetched opp passed to compute to avoid the duplicate query).
- Route: `GET /targets` per-row `crm_opportunity` + `pipeline: {linked,
  opportunity_name, current_stage_label}` via one bulk JOIN (no N+1).
- Route: new `POST /targets/{id}/advance-pipeline` reuses
  `crm_svc.move_opportunity_stage` (`backend/app/services/crm.py:344-410`),
  passes the deterministic computed next-stage id, recomputes and returns the
  post-move gate state.
- Schemas: `MicrositeUpdateIn` gains `crm_opportunity_id`; new
  `AdvancePipelineIn { note }`.
- `crm_svc.move_opportunity_stage` return shape passed through verbatim under
  `opportunity` (no prettier wrapper).

**Frontend** (`repo-b/src/lib/outreach-personalizer-api.ts`,
`repo-b/src/app/lab/env/[envId]/consulting/outreach-personalizer/page.tsx`):
- New TS types `CrmOpportunitySummary`, `PipelineAdvanceState`,
  `PipelineListSummary`, `MovedOpportunity`, `CrmOpportunityListRow`;
  `OutreachTarget` gains `crm_opportunity_id`; `TargetResponse` gains
  `crm_opportunity` + `pipeline`; `PatchTargetPayload` gains
  `crm_opportunity_id`.
- New API calls `listCrmOpportunities(businessId)` (reuses existing
  `/api/crm/opportunities`) and `advancePipeline(targetId, note?)`.
- Operator page: opportunity picker mirroring the Phase 2A account picker
  (select when businessId+list, manual UUID fallback otherwise; linked-state
  shows opp name + current stage label).
- Operator page: Phase 2B's disabled "Advance pipeline — not available"
  placeholder replaced with a real button gated on `detail.pipeline.available`;
  label `Advance to "{next_stage.label}"`; when disabled, exact
  `blocking_reason` rendered verbatim beside the button. Pipeline-advance
  refreshes detail and shows success in `saveMsg`.

**Tests** (`backend/tests/test_outreach_personalizer.py`):
- New `TestOpportunityLink` (6 tests): success, no-business-id, opp
  missing/wrong-business, null-clear, clear-account-while-opp-linked
  (exact-message assertion at route layer, NOT DB CHECK), atomic clear-both.
- New `TestAdvancePipeline` (9 tests): seven gate failures (no business_id,
  no account, no opp, business mismatch, opp closed, current stage terminal,
  no next stage) + success (mocks `route.crm_svc.move_opportunity_stage`,
  asserts kwargs `business_id` / `crm_opportunity_id` / `to_stage_id` / `note`)
  + 404.
- All 62 existing tests still pass. Total **77 passed, 2 skipped**.

**Verification**
- `python -m pytest backend/tests/test_outreach_personalizer.py
   backend/tests/test_pitch_forge_constraints.py -q` → 77 passed, 2 skipped.
- `cd repo-b && npm run typecheck` → clean.
- `node apply.js --files 612 --dry-run` → 6 statements, OK.
- `cat 612_*.sql | supabase db query --linked` → applied; column present.
- Live DB smoke (Pattern A throwaway opportunity + try/finally cleanup): seed
  Artemis with business_id, link account + opp, GET shows
  `pipeline.available=true`, clear-order guard fires with exact message,
  `POST /advance-pipeline` moves opportunity to next stage,
  `crm_opportunity_stage_history` row written; cleanup ran (smoke opp +
  history + target + microsite events all deleted).

---

## Phase 3 — Environment scaffolding (COMPLETE 2026-05-20)

Closes the loop with: **target → REPE-flavored scaffolded environment** via
`environment_pipeline_v2.create_environment_v2()`, idempotent on
`cro_outreach_target.scaffolded_env_id`. The operator clicks "Create outreach
environment", the env is provisioned in-band (synchronous, `lifecycle_state =
verified` in one call), the target row persists `scaffolded_env_id`, the UI
flips the button to an "Open environment ↗" success/link state.

**Decision (verified against current main):** explicit `scaffolded_env_id` FK
to `app.environments` (Option A). The v2 pipeline IS slug-idempotent
(`environment_pipeline_v2._existing_env_by_slug`, lines 158–199) but that is
defense-in-depth — the operator contract is one-env-per-target via the FK,
enforced at the service-level gate `compute_scaffold_env_state`.

**Pre-implementation precondition verified:** end-to-end pre-checks ran
before any code: (1) `scaffolded_env_id` confirmed absent on `origin/main`
611+612 AND live Supabase (information_schema query); (2)
`environment_pipeline_v2._build_response` confirmed as the only place
`default_home_route.replace("{env_id}", env_id)` is composed — no sibling
helper to reuse, so `env_summary()` repeats the substitution and the route
uses `result.links["dashboard_url"]` directly post-create. Both paths
converge.

**Migration `613_outreach_personalizer_scaffold_env.sql`** — applied.
Additive only: `ADD COLUMN IF NOT EXISTS scaffolded_env_id uuid REFERENCES
app.environments(env_id) ON DELETE SET NULL` (cross-schema FK, standard
Postgres). Partial index `idx_cro_outreach_target_scaffolded_env`. No CHECK
constraint — `scaffolded_env_id` is independent of account/opp linkage.

**Backend** (`backend/app/services/outreach_personalizer.py`,
`backend/app/routes/outreach_personalizer.py`,
`backend/app/schemas/outreach_personalizer.py`):
- `SCAFFOLD_READY_STATUSES = ("assets_ready", "microsite_live")`,
  `_OUTREACH_SCAFFOLD_TEMPLATE_KEY = "repe"`.
- `env_summary(env_id)` reads `app.environments` (cross-schema) and adds
  `dashboard_url` via the same substitution `env_v2._build_response` uses.
- `_template_exists("repe")` is the last gate check before the create path opens.
- `get_scaffolded_env_id_bulk(target_ids)` — list-view bulk lookup with
  empty-input short-circuit; existing Phase 1/2A/2B/2C list-view tests with
  unscaffolded targets do NOT consume an extra FakeCursor push.
- `set_scaffolded_env_id(target_id, env_id)` — direct UPDATE;
  `scaffolded_env_id` is **NOT** in `_PATCHABLE` (only the new endpoint
  writes it).
- `compute_scaffold_env_state(target, env=None)` — single source of truth
  for the 5-step gate, used by both display and enforcement. Accepts a
  pre-fetched `env` to let the route avoid duplicate SELECTs.
- Route: `_scaffolded_env_summary(target)` mirrors `_crm_account_summary` /
  `_crm_opportunity_summary` exactly.
- Route: `GET /targets/{id}` adds `scaffold` key (full gate state via
  `compute_scaffold_env_state` with pre-fetched env).
- Route: `GET /targets` per-row `scaffold: {linked, env_id}` via the bulk
  lookup (no N+1).
- Route: `POST /targets/{id}/scaffold-env` (new). Already-scaffolded branch
  returns 200 with `created=False` (idempotency); gate failures return 400
  with the exact `blocking_reason`; `LookupError` from `env_v2.get_template`
  maps to 400 "Environment template is not available."; generic exceptions
  → 500 with safe "Environment pipeline failed: …".
- `ScaffoldEnvIn { note: str | None }` — symmetric with
  `AdvancePipelineIn` / `LogCrmActivityIn`.

**Frontend** (`repo-b/src/lib/outreach-personalizer-api.ts`,
`repo-b/src/app/lab/env/[envId]/consulting/outreach-personalizer/page.tsx`):
- New TS types `ScaffoldedEnvSummary`, `ScaffoldEnvState`,
  `ScaffoldListSummary`; `OutreachTarget` gains `scaffolded_env_id`;
  `TargetResponse` gains `scaffold`; `OutreachTargetWithEngagement` gains
  `scaffold`.
- New API call `scaffoldEnv(targetId, note?)` (POST `/scaffold-env`).
- Operator page: **three-state render** for the affordance —
  (a) `scaffold.env_summary` present → success/link state with "Open
  environment ↗" and a small `Scaffolded · {lifecycle_state}` success label.
  **NOT a warning**: the backend's `"Environment already exists."` is an
  idempotency signal, not an error.
  (b) `scaffold.available === true` → enabled primary "Create outreach
  environment" button.
  (c) gate failure WITHOUT env_summary → disabled secondary button + exact
  `blocking_reason` in `text-bm-warning`.
- List view: small "env" badge mirroring Phase 2B's "Hot" badge for rows
  with `scaffold.linked === true`.
- Public microsite untouched (operator-only affordance).

**Accepted v1 behavior (NOT a bug):** Two outreach targets in different
operator envs with the same `firm_slug` will resolve to the **same**
scaffolded env via the v2 layer's slug-idempotency. This is the explicit v1
design choice ("there should be one Artemis demo env"), not a sprawl bug.
A more complex per-target slug scheme is reserved for an explicit follow-on
decision, not retrofitted silently.

**Verified:**
- `python -m pytest backend/tests/test_outreach_personalizer.py
   backend/tests/test_pitch_forge_constraints.py
   backend/tests/test_environment_pipeline_v2.py -q` → 101 passed, 2 skipped
  (51 outreach + 7 Phase 3 gate + 9 Phase 3 route mocking
  `route.env_v2.create_environment_v2` + 26 pitch-forge + 8 env_pipeline_v2
  regression; 2 skips pre-existing).
- `cd repo-b && npm run typecheck` → clean.
- `node apply.js --files 613 --dry-run` → 5 statements, OK.
- `cat 613_*.sql | supabase db query --linked` → applied; column present.
- **Live DB smoke** (`env_id="verify-artemis-3"`, unique short slug
  `p3-smoke-art-{6hex}`): seeded target persists business_id, PATCH links
  real CRM account, gate `available=True` pre-create, POST scaffold-env
  creates a real env (`lifecycle_state="verified"`,
  `dashboard_url="/lab/env/{env_id}/re"`, 5 pipeline-stage rows from
  `repe_starter`), second call returns `created=False` + same env_id,
  recomputed gate carries "Environment already exists." + populated
  env_summary, public microsite payload contains **none** of `scaffold` /
  `scaffolded_env_id` / `dashboard_url`. FK inspection printed
  `(app.environments: 1, v1.environments: 1, v1.pipeline_stages: 5,
  app.environment_memberships: 0)` before dependency-ordered cleanup deleted
  all 7 rows + outreach target + microsite events.

## Phase 3.5 — Operator-controlled scaffolding (template picker + recreate + sprawl guard)

**Scope:** add operator agency on top of Phase 3's one-click REPE scaffold —
operator-selectable template (default still `repe`), visible template summary
on the success/link state, explicit `/scaffold-env/recreate` flow gated to
stale/retired stored envs only, and a per-business sprawl soft cap. **Zero
migration.** Reuses `GET /v2/environments/templates` (no new endpoint),
`env_v2.create_environment_v2` (still the only env creation path),
`_template_exists`, `_existing_env_by_slug`. Public microsite invariant
preserved — no template choice / env link / recreate affordance ever surfaces
on the public payload.

**Backend (config + schema)**
- `backend/app/config.py`: `OUTREACH_ENV_QUOTA_PER_BUSINESS: int =
  int(os.getenv("OUTREACH_ENV_QUOTA_PER_BUSINESS", "25"))` — soft cap;
  bypassed on the recreate path by construction (net env count unchanged).
- `backend/app/schemas/outreach_personalizer.py`: `ScaffoldEnvIn` extended
  with `template_key: str | None = None` (default `repe` if absent).

**Backend (service — `outreach_personalizer.py`)**
- `env_summary` extended via LEFT JOIN on `app.environment_templates` (latest
  row) — adds `template_display_name`, `template_seed_pack`. Existing call
  sites need no change; the dict simply carries more keys.
- `compute_scaffold_env_state` already-scaffolded branch reshaped into
  three cases distinguishable by `lifecycle_state`:

| Stored env state | `available` | `blocking_reason` | `env_summary` | `can_recreate` |
|---|---|---|---|---|
| Row found, lifecycle not `retired` (healthy) | False | `Environment already exists.` | populated | **False** |
| Row found, `lifecycle_state = 'retired'` | False | `Linked environment is retired.` | populated | **True** |
| Row not found (FK auto-cleared or direct-SQL deletion) | False | `Stored scaffolded environment was not found.` | None | **True** |

  Healthy envs are deliberately **not** recreatable through the recreate
  endpoint; operator must retire in the v2 env UI first (honors "idempotency
  beats cleverness" — one healthy env per target, full stop).
- New sprawl-quota step on the **create path only**, after the
  already-scaffolded branch and before `_template_exists`:
  `count(*) FROM app.environments WHERE business_id = ? AND lifecycle_state
  != 'retired'`. If `count >= OUTREACH_ENV_QUOTA_PER_BUSINESS`, return
  `Outreach environment quota reached (N/Q) for this business; archive an old
  env to proceed.`
- `_active_env_count_for_business(*, business_id) -> int` helper.
- `_compute_recreate_slug(*, target) -> str` — derives `{firm_slug}-r{n}`
  where `n = count(*) WHERE slug = '{firm_slug}' OR slug LIKE
  '{firm_slug}-r%'`. n monotone; first recreate is `-r1`. Race window
  (two simultaneous recreates picking the same n) is closed by
  `idx_app_environments_slug` UNIQUE — one wins, the other re-enters the
  existing-by-slug branch, both operators end up linked to the same fresh
  env (benign).

**Backend (routes — `outreach_personalizer.py`)**
- `POST /targets/{id}/scaffold-env`: now reads
  `payload.template_key or _OUTREACH_SCAFFOLD_TEMPLATE_KEY` and threads it
  through the manifest. Unknown template → existing `LookupError` handler →
  400 `"Environment template is not available."`
- `POST /targets/{id}/scaffold-env/recreate` (new). Precondition:
  `compute_scaffold_env_state(target)` MUST return `can_recreate=True`.
  Healthy-env case rejects with the exact `"Cannot recreate a healthy
  environment. Retire it in the env UI first."` Template choice cascade:
  payload `template_key` → prior env's `template_key` (preserves operator's
  prior choice) → `"repe"`. New slug from `_compute_recreate_slug`. Calls
  `env_v2.create_environment_v2` with `actor="outreach_personalizer_recreate"`,
  then `set_scaffolded_env_id` overwrites the target's link. Old env is
  **not** auto-retired — operator manages lifecycle in the v2 env UI.

**Frontend**
- `repo-b/src/lib/outreach-personalizer-api.ts`: `ScaffoldedEnvSummary`
  carries `template_display_name`, `template_seed_pack`; `scaffoldEnv`
  accepts `templateKey?`; new `recreateScaffoldEnv(targetId, opts?)` →
  `POST /scaffold-env/recreate`; new `listEnvironmentTemplates()` thin
  wrapper over `GET /bos/api/v2/environments/templates`.
- operator page: `<details>` template picker (collapsed-by-default
  disclosure) with `<select>` filtered client-side to the outreach
  allowlist `{repe (default), internal_ops, client_delivery,
  trading_research, legal_ops}`. Excludes `public_profile`,
  `public_content`, `empty_lab` — not prospect-demo material. Template
  summary line `Template: {display_name} · home: {dashboard_url} · seed:
  {default_seed_pack}` rendered next to "Open environment ↗" on the
  success/link state. "Recreate environment" secondary button conditional
  on `detail.scaffold?.can_recreate === true`, with `window.confirm()`
  before firing. Quota-exceeded state renders the exact backend
  `blocking_reason` verbatim in the existing warning span.

**Public microsite invariant**
- `MicrositeView.tsx` and `_microsite_payload` are untouched. Phase 3
  regression test (`test_public_microsite_payload_excludes_scaffold`)
  passes unmodified. Phase 3.5 adds a parallel guard:
  `test_public_microsite_payload_excludes_template_choice` asserts the
  public payload contains none of `scaffold`, `template_key`,
  `template_display_name`, `dashboard_url`.

**Verified:**
- `python -m pytest backend/tests/test_outreach_personalizer.py
   backend/tests/test_pitch_forge_constraints.py
   backend/tests/test_environment_pipeline_v2.py -q` →
  80 outreach + 34 regression passed, 2 skips pre-existing.
- `cd repo-b && npm run typecheck` → clean.
- **Live DB smoke** under `env_id="verify-artemis-3-5"`:
  *deferred — Supabase DB endpoint was unreachable at scoped-commit time
  (REST gateway alive, DB pooler returning `ECHECKOUTTIMEOUT`); will
  retry on recovery before PR merge.*

## Next recommended ticket

**Phase 3.6** (lifecycle round-trip): "Retire and recreate" combo
affordance — wires a retire-then-recreate in a single click for operators
who genuinely need to swap a healthy env's template. Phase 3.5
deliberately blocks healthy-env recreate; Phase 3.6 unblocks it through
an explicit two-step affordance, not a single endpoint surprise.

**Phase 4**: Apollo / sales-intelligence enrichment to auto-populate
`profile_json` from `firm_name` + domain.
