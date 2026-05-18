# Marketing / Domain Routing — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **what-we-do page pending change** — `repo-b/src/app/(marketing)/what-we-do/page.tsx` — This file is modified (git status shows M). Verify the change is intentional and the page renders correctly before next deploy.
- [ ] **AI concierge backend** — `/api/public/assistant` — Verify this endpoint is connected to a real AI backend, not a mock. Check response latency and quality.

## UX improvements
- [ ] **Homepage positioning** — Check `docs/site-improvements/` for the latest homepage audit. Apply recommended copy improvements.
- [ ] **Industry pages** — Verify each industry page (`/industries/[slug]`) has accurate, specific copy. Flag any generic placeholders.

## Backend / API
- [ ] **Lead capture destination** — `/api/public/onboarding-lead` — Verify this writes to Supabase (or external CRM) and confirm no leads are lost.
- [ ] **Login route location** — Confirm exact file path for the login page component.

## Data / migrations
- [ ] **Lead capture table** — Identify the Supabase table for inbound leads from the marketing site. Confirm it has correct fields.

## Tests
- [ ] **No known Playwright tests for login flow** — Add test for: visit /login → enter credentials → verify redirect to /app.
- [ ] **No known tests for AI concierge** — Add smoke test for public assistant endpoint.

## Documentation
- [ ] **Domain update** — Any file still referencing `paulmalmquist.com` should be updated to `novendor.ai` on next touch.

## Nice-to-have
- [ ] A/B testing on homepage headline
- [ ] Heatmap integration for click tracking

## Completed
_(none yet)_
