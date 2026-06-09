# HHA-1 — browser validation prompt (logged-in screenshot)

The HHA-1 API/deploy gates are verified live (see `release-readiness.md` / `PROOF.md`). The one
open item is a logged-in visual confirmation + screenshot, which needs a browser. Paste the prompt
below into ChatGPT agent mode (or any browser-driving agent), run it, save the screenshot under
`repo-b/src/app/lab/env/[envId]/healthcare-subscription/screenshots/`, and flip the
"Live route smoke (logged-in browser)" gate in `release-readiness.md` to PASS with the date.

Credentials: Supabase email/password login. Email `info@novendor.ai`; password is in
`docs/reference/ENV_KEYS.md` (field `NOVENDOR_ADMIN_PASSWORD`) — do not paste it into shared logs.

---

## Prompt

You are validating a production web page. Be precise and report only what you actually see.

1. Go to `https://novendor.ai/login`. Log in with email `info@novendor.ai` and the password I provide.
2. Navigate to:
   `https://novendor.ai/lab/env/ceeb9ea0-9f8b-4369-b853-adcd60c01def/healthcare-subscription`
3. Wait for the page to finish loading (KPI values load client-side from the API).
4. Take a full-page screenshot.
5. Confirm each of these, answering yes/no with a one-line note for each:
   - The page renders (no error / empty state).
   - It is a **standalone** design — its own full-bleed dark/teal chrome, NOT wrapped in the
     standard app sidebar/header shell.
   - Visible title is neutral: **"Healthcare Subscription Analytics"** (no "Hone Health" branding).
   - A non-dismissible **synthetic-only / NO-PHI banner** is visible near the top
     ("Synthetic demo · no PHI … no medical advice").
   - The **executive KPI cards** render with values (e.g. Active Members ~4,250; MRR ~$501K;
     NRR ~111%; LTV:CAC ~8.5×; CAC Payback ~8.6 mo).
   - Clicking a KPI card opens a **metric-definition drawer** showing formula / grain / owner / source.
   - A **freshness / provenance footer** is visible (as-of date 2026-05-31 and a label like
     "synthetic gold rollup (seeded)").
   - There is **no PHI** anywhere on screen (no names, emails, DOBs, addresses, phone numbers,
     diagnoses, or exact lab values).
6. Report the yes/no list and attach the screenshot.

If anything fails to render, capture the screenshot anyway and describe what you see.
