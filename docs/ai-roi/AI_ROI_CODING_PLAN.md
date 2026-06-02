# AI ROI Reframing Exercise - Coding Plan

Build target: ship the AI ROI section in `repo-b` as published marketing pages, an AI ROI reframing calculator, a discovery questionnaire, lead capture, and gated downloads.

The calculator is a thinking tool. It shows why the same freed hour can have different business value depending on the role, the audience for the work, and the output being produced. It does not produce a quote, savings guarantee, or client commitment.

Visible calculator disclaimer:

> Illustrative model. Not a quote.

Primary surfaces:

- `repo-b/src/app/(marketing)/ai-roi/**`
- `repo-b/src/components/marketing/aiRoi/**`
- `repo-b/src/lib/marketing/aiRoi/**`
- `repo-b/src/app/api/public/ai-roi-lead/route.ts`
- `repo-b/db/schema/10005_ai_roi_leads.sql`
- `docs/ai-roi/**`

No FastAPI change is part of this build.

---

## Public Interfaces

Routes:

- `/ai-roi`
- `/ai-roi/assessment`
- `/ai-roi/calculator`
- `/ai-roi/case-studies`
- `/ai-roi/resources`

Lead API:

- `POST /api/public/ai-roi-lead`
- Payload: `{ email, company_name?, source, payload_json }`
- Success: `{ status: "created", id }`
- `400`: invalid email or source
- `503`: database pool unavailable
- `500`: insert failed

Database:

- Migration: `repo-b/db/schema/10005_ai_roi_leads.sql`
- Table: `nv_ai_roi_leads`
- RLS enabled.
- No public read policies.
- Direct insert from the Next.js route through `getPool()`.
- `ARCHITECTURE.md` records the pre-tenant exemption from `env_id` and `business_id`.

---

## Calculator Contract

Inputs:

- `annualCompensation`
- `freedHoursPerWeek`
- `roleType`
- `servedAudience`
- `outputType`

Defaults:

- `annualCompensation`: `120000`
- `freedHoursPerWeek`: `3`
- `roleType`: `analyst`
- `servedAudience`: `executive_board`
- `outputType`: `decision_packet`

Role multipliers:

- `individual`: `1.0`
- `analyst`: `1.4`
- `manager`: `2.0`
- `executive`: `3.2`
- `revenue_or_client`: `4.0`

Audience multipliers:

- `self`: `1.0`
- `team`: `1.4`
- `function`: `2.2`
- `executive_board`: `3.4`
- `customer_investor`: `4.0`

Output multipliers:

- `task`: `1.0`
- `recurring_report`: `1.3`
- `decision_packet`: `1.8`
- `customer_asset`: `2.2`

Rules:

- Combined multiplier is capped at `24`.
- Invalid inputs return null result fields and `nullReason`.
- Output includes a comparison across role presets using the same salary and hour inputs.
- Output includes the selected-role multiplier, one insight sentence, and a secondary dollar range labeled as illustrative.

---

## Discovery Questionnaire Contract

The questionnaire has ten required questions, two in each category:

- Manual assembly
- Decision latency
- Reporting fragility
- AI spend measurement
- Governance readiness

Scoring:

- Each option has explicit points.
- The score function returns category scores plus an overall band.
- Incomplete answers return the missing question names and block scoring.

---

## Pages And Components

Use existing marketing primitives and classes:

- `HeroBackground`
- `NvCard`
- `NvButton`
- `PageHeader`
- `nv-*` classes from the marketing stylesheet

Navigation:

- Add `AI ROI` to `repo-b/content/navigation.json`.
- Add `AI ROI` to the `SidebarNav` allowlist.
- Map it to the existing bar-chart icon.

Visuals:

- Governance gate diagram
- Baseline-to-target bar
- ROI scoreboard mock
- Decision-latency timeline

Resources:

- Add placeholder PDFs under `repo-b/public/assets/ai-roi/`.
- Submit resource downloads through `/api/public/ai-roi-lead`.
- Trigger the static PDF download only after lead capture succeeds.

---

## Verification

Baseline:

- Try `make test-frontend` before edits. If local tooling blocks it, record the blocker.

Focused tests:

- Calculator full-input case.
- Calculator missing-input case.
- Calculator multiplier cap case.
- Questionnaire partial scoring case.
- Questionnaire complete scoring case.
- Lead API valid insert with mocked `getPool()`.
- Lead API invalid email returns `400`.
- Lead API missing pool returns `503`.
- Lead API insert failure returns `500`.

Build checks:

- `cd repo-b && npm run typecheck`
- `cd repo-b && npm run test:unit`
- `cd repo-b && npm run build`

DB checks:

- `cd repo-b && npm run db:dry`
- Confirm `nv_ai_roi_leads` has `COMMENT ON TABLE`.
- Confirm RLS is enabled.
- Confirm no anonymous read policy exists.
- Confirm the `ARCHITECTURE.md` exemption is present.

Browser checks:

- Run the Next.js dev server locally.
- Inspect `/ai-roi` and each subroute on desktop and 375px mobile.
- Exercise calculator, questionnaire, and resource download forms.
- Confirm no console errors or dead links.

Copy check:

- Compare new marketing files and these docs with `docs/anti-ai-style.md`.
- Replace banned wording in user-facing copy before completion.
