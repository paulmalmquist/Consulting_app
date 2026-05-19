# repo-b Repository Tips & Guardrails

## Domain Routing Notes

This repo serves **two domains** from the same Next.js project:

- **paulmalmquist.com** — Paul's personal portfolio and Evidence Ledger
- **novendor.ai** — Novendor consulting app and marketing homepage

Both domains route through the same `repo-b` Vercel project. Routing is handled via Next.js App Router and optional middleware/rewrites.

### Key Routes to Preserve

| Route | Domain | Purpose | Status |
|-------|--------|---------|--------|
| `/` | paulmalmquist.com | Personal portfolio (Paul page) | Canonical |
| `/paul` | paulmalmquist.com | Personal portfolio (alias) | Working |
| `/paul/evidence` | paulmalmquist.com | Evidence Ledger (proof/credentials) | Working |
| `/login` | paulmalmquist.com | Winston app login | Critical |
| `/` | novendor.ai | Novendor marketing homepage | Critical |
| `/app` | novendor.ai | Novendor dashboard (after login) | Critical |
| `/login` | novendor.ai | Novendor app login | Critical |

### Implementation Details

- **Root route structure**: `src/app/page.tsx` serves paulmalmquist.com root (via Next.js default). The `(marketing)` route group handles other marketing routes.
- **Paul page structure**: `src/app/paul/page.tsx` renders `PersonalPageBody.tsx` (extracted shared component) for DRY, so `/` and `/paul` render identical content.
- **Paul layout**: `src/app/paul/layout.tsx` applies the ROS (Resume Operating System) theme with `<ResumeThemeInit />` and global metadata.
- **Evidence page**: `src/app/paul/evidence/page.tsx` is a server component that renders `<EvidenceGraphPage />` (client component) with Evidence Ledger metadata.

### Before Making Routing Changes

Always inspect these files to understand the current routing setup:

1. **`src/app/layout.tsx`** — Global layout; check for host-aware routing logic or middleware guards
2. **`src/middleware.ts`** — Check for hostname-based routing rules or request rewrites
3. **`vercel.json` or `.vercel/project.json`** — Check for domain-specific rewrites or environment routing
4. **`src/app/(marketing)/`** — Verify it contains only Novendor routes, not personal portfolio
5. **`src/app/paul/`** — Verify Paul-specific routes are in this directory, not duplicated elsewhere

### Testing Routing Changes

After any routing modification:

1. **Local build**: `npm run build` must pass
2. **Smoke test**: Visit `/`, `/paul`, `/paul/evidence`, `/login` — all should render without 404
3. **Domain isolation**: Verify `novendor.ai/` still serves Novendor content; do not break `novendor.ai/login`
4. **Metadata**: Confirm metadata (title, description, OG image) is correct for each route

### Common Pitfalls

- **Do not** move or rename `src/app/(marketing)/` routes without updating Vercel rewrites
- **Do not** duplicate Paul content in the `(marketing)` group — use the shared `PersonalPageBody.tsx` component
- **Do not** hardcode domain names in components — use Next.js routes and relative links instead
- **Do not** break `/login` routes for either domain; both are critical

### Related Files

- `src/components/resume/PersonalPageBody.tsx` — Shared content for `/` and `/paul`
- `src/components/resume/EvidenceGraphPage.tsx` — Evidence Ledger orchestrator
- `src/app/paul/layout.tsx` — ROS theme setup for Paul routes
