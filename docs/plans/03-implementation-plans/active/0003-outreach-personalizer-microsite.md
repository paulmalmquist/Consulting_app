# Dispatch Record 0003 — Outreach Personalizer Microsite (Phase 1)

**Created:** 2026-05-19
**Status:** Phase 1 COMPLETE 2026-05-19 — migration 611 applied to Supabase
(`ozboonlsplroialdwuxj`); 16/16 backend tests pass; repo-b typecheck clean; live
end-to-end smoke verified against the real DB (seed idempotent, microsite payload,
view+cta tracking persisted, rows cleaned up). Phase 2 backlog below.
**Environment:** Consulting / Novendor CRM
**Deliverable type:** Single-ticket vertical slice (Phase 1 of a multi-phase build)

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

## Next recommended ticket

Phase 2: Loom URL edit/save loop + CRM account linking → env scaffolding via
`environment_pipeline_v2.create()` → Apollo/sales-intelligence enrichment.
