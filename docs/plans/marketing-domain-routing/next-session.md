# Next Session — Marketing / Domain Routing

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on the Novendor marketing site and domain routing (novendor.ai).

Read first:
- docs/plans/marketing-domain-routing/architecture.md
- docs/plans/marketing-domain-routing/backlog.md
- docs/site-improvements/ (read the most recent daily audit file)
- docs/sales-positioning/ (read the most recent file)

Objective (choose one):
A) Resolve the pending what-we-do page change:
   - File: repo-b/src/app/(marketing)/what-we-do/page.tsx
   - Verify the change is intentional and the page renders correctly
   - Deploy: cd repo-b && vercel deploy --prod

B) Apply homepage copy improvements from docs/site-improvements/:
   - Read the latest site audit
   - Identify the top 2-3 copy improvements for the homepage
   - Edit repo-b/src/app/(marketing)/page.tsx (verify exact path)
   - Deploy: cd repo-b && vercel deploy --prod

Files to inspect:
- repo-b/src/app/(marketing)/what-we-do/page.tsx
- repo-b/src/app/(marketing)/ (list all pages)
- repo-b/src/app/api/public/assistant/ (verify AI concierge connection)
- repo-b/src/app/api/public/onboarding-lead/ (verify lead capture)

Acceptance criteria:
- [ ] what-we-do page renders correctly (if working on objective A)
- [ ] Homepage copy improvements applied (if working on objective B)
- [ ] Deployed to production and verified at https://novendor.ai
- [ ] No regressions in login flow

Tests to run:
cd repo-b && vercel deploy --prod
# Then verify at https://novendor.ai

Update docs/plans/marketing-domain-routing/next-session.md and backlog.md before finishing.
```

## Context notes
- Deploy is MANUAL — push to git does NOT trigger Vercel deploy for this project
- Use `printf` not `echo` when setting Vercel env vars (echo adds trailing newline)
- Daily site audit in `docs/site-improvements/` is the authoritative source of what to fix
- `docs/competitor-research/positioning-opportunities/` for messaging angle improvements
