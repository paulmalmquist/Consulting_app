# Outreach Personalizer — Personalized BD Microsite Generator

**Owner:** Novendor consulting / Consulting Revenue OS
**Status:** Active — Phase 1 (single-target vertical slice)
**Trigger:** "personalize outreach for [firm]", "build microsite for [firm]", "outreach personalizer for [firm]", "make a microsite for [firm]"

---

## What this skill does

Turns one named firm into a public, personalized business-development microsite with
tracked engagement. For a target it: generates 3 assets (insight, loom_script,
cold_email), publishes a public page at `/for/{firm_slug}`, and records anonymous
`microsite_view` / `microsite_cta` events.

It is built for REPE / real estate investment management positioning: data readiness,
investor reporting and portfolio intelligence, pipeline / asset-management operating
insight, and AI framed as controlled internal infrastructure (not chatbot hype).

Reference test lead: **Artemis Real Estate Partners** (`artemis-real-estate-partners`).

---

## Surfaces

- **Operator UI:** `/lab/env/[envId]/consulting/outreach-personalizer`
  (`repo-b/src/app/lab/env/[envId]/consulting/outreach-personalizer/page.tsx`)
- **Public microsite:** `/for/{firm_slug}`
  (`repo-b/src/app/(marketing)/for/[slug]/page.tsx` + `MicrositeView.tsx`,
  components in `repo-b/src/components/marketing/personalizer/`)
- **API:** `/api/outreach-personalizer/v1` (`backend/app/routes/outreach_personalizer.py`)
- **Service / AI:** `backend/app/services/outreach_personalizer*.py`
- **Schema:** `repo-b/db/schema/611_outreach_personalizer.sql`
  (`cro_outreach_target`, `cro_outreach_asset`, `cro_microsite_event`)

---

## How to use it

### 1. Create / seed a target

`POST /api/outreach-personalizer/v1/targets?env_id=<env>` with
`{firm_name, firm_slug, profile_json?, logo_url?, accent_hsl?, loom_url?}`.

Idempotent on `(env_id, firm_slug)` — re-posting returns the existing target and
assets. On first creation it generates the asset pack and sets status
`assets_ready` + `microsite_url = /for/{firm_slug}`. From the operator page, the
"Seed Artemis Real Estate Partners" button does this.

### 2. View / regenerate assets

`GET /targets`, `GET /targets/{id}`. Regenerate one asset with
`POST /targets/{id}/regenerate/{insight|loom_script|cold_email}`.

### 3. Public microsite + tracking

`GET /microsite/{slug}` returns the public payload (or `{ready:false}` /
404 fail-closed). `POST /microsite/{slug}/track` with
`{event_type: microsite_view|microsite_cta}` records an event.

---

## Generation rules

- AI mirrors pitch-forge: `get_instrumented_sync_client()`, `gpt-4o`, temp `0.2`,
  strict JSON, anti-AI-style banned-phrase / writing rules reused from
  `pitch_forge_prompts`.
- **Cold email is exactly 4 sentences** and must reference one named insight. The
  service validates this and raises on violation.
- No fabricated private facts. Non-given public observations use cautious framing.
- **Seed fallback:** if `OPENAI_API_KEY` is unset, the seed flow returns a
  clearly-labeled deterministic Artemis pack (`payload.source = "deterministic_seed"`)
  so the slice is demoable/testable offline.
- **Regeneration fails closed:** `regenerate/{asset_type}` requires AI; no
  deterministic fallback (pitch-forge parity).
- Missing Loom URL → "Personal video pending" state, never a broken embed.

---

## Current limitation (Phase 1)

Environment scaffolding is **out of scope**. This skill does NOT call
`environment_pipeline_v2.create()`. No CRM auto-linking, no Apollo enrichment, no
Loom edit/save loop, no web scraping. Those are Phase 2 — see
`docs/plans/03-implementation-plans/active/0003-outreach-personalizer-microsite.md`.
