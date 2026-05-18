# Marketing / Public Site / Domain Routing

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

This area covers the public-facing Novendor marketing site (novendor.ai), the login flow, domain routing, and the marketing pages that drive inbound. It includes the homepage, industry pages, capabilities, proof/case studies, the AI concierge, onboarding lead capture, and the contact page.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key facts

- **Production URL:** `https://novendor.ai`
- **Login URL:** `https://novendor.ai/login` (or person icon in header)
- **Auth:** Supabase email/password — `info@novendor.ai`
- **Vercel project:** `consulting-app`
- **Deploy:** `cd repo-b && vercel deploy --prod` (does NOT auto-deploy on push)

## Key existing docs

- `docs/site-improvements/` — Daily page-by-page site audit with copy suggestions
- `docs/sales-positioning/` — Counter-positioning angles
- `docs/competitor-research/positioning-opportunities/` — Messaging gaps
- `skills/site-audit/SKILL.md` — Site audit skill
- `skills/novendor-cyberpunk-accents/SKILL.md` — Brand/design system

## First recommended next session

Read `next-session.md`. Check `docs/site-improvements/` for the latest site audit before touching any copy or layout. The most impactful improvement is usually positioning clarity on the homepage.
