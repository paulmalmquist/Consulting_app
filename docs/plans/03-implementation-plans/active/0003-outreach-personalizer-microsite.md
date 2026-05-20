# Dispatch Record 0003 — Outreach Personalizer Microsite (Phases 1 + 2A + 2B + 2C)

**Created:** 2026-05-19
**Status:** Phases 1 + 2A + 2B COMPLETE on `main` via PR #68 squash `d9f6733e`
(2026-05-19). **Phase 2C IN PROGRESS 2026-05-20** — explicit `crm_opportunity_id`
link + pipeline-advance gate (`compute_pipeline_advance_state`) + reuse of
`crm_svc.move_opportunity_stage` (see "Phase 2C" section below). Migration `612`
applied to Supabase (`ozboonlsplroialdwuxj`); 77/79 backend tests pass (2 skips
pre-existing); repo-b typecheck clean; live DB smoke green (Pattern A throwaway
opportunity; cleanup ran).
**Environment:** Consulting / Novendor CRM
**Deliverable type:** Multi-phase build (Phase 1 vertical slice + 2A/2B/2C operational layers)

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

## Next recommended ticket

Phase 3: Environment scaffolding via `environment_pipeline_v2.create()` (a
genuine new client → instant outreach environment loop), then Apollo /
sales-intelligence enrichment to auto-populate `profile_json`.
