# Marketing / Domain Routing — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] All marketing pages load without 500 errors
- [ ] Login flow works (Supabase email/password)
- [ ] AI concierge responds on the public site
- [ ] Lead capture form submits correctly
- [ ] `what-we-do` page pending change resolved (see git status)

## Phase 1: Make the UI/operator flow coherent
- [ ] Homepage positioning is clear and differentiated (check `docs/site-improvements/` for latest audit)
- [ ] Industry pages have accurate, targeted copy
- [ ] Proof page shows compelling case study content
- [ ] Contact form routes to correct inbox

## Phase 2: Wire deeper data/API behavior
- [ ] Lead capture writes to Novendor CRM / Supabase
- [ ] AI concierge personalized by industry page context
- [ ] Analytics tracking (Vercel, Plausible, or equivalent) confirmed

## Phase 3: Testing, instrumentation, release gates
- [ ] Playwright tests for login flow
- [ ] Playwright tests for AI concierge query
- [ ] Core Web Vitals check on homepage and key landing pages

## Phase 4: Polish / demo readiness
- [ ] SEO meta tags accurate on all pages
- [ ] OG images set for social sharing
- [ ] Industry pages updated with latest positioning from `docs/sales-positioning/`

## Daily reference
- Check `docs/site-improvements/` each session for latest site audit
- Check `docs/competitor-research/positioning-opportunities/` for messaging gaps
