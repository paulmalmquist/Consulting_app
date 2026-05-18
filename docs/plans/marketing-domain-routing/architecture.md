# Marketing / Domain Routing — Architecture

**Last updated:** 2026-05-16  
**Status:** Partially verified

## Frontend map

### Marketing routes (all under `(marketing)` route group)
| Route | File | Purpose |
|---|---|---|
| `/` | `repo-b/src/app/(marketing)/page.tsx` (verify) | Homepage |
| `/about` | `repo-b/src/app/(marketing)/about/` | About page |
| `/ai-concierge` | `repo-b/src/app/(marketing)/ai-concierge/` | AI concierge |
| `/capabilities` | `repo-b/src/app/(marketing)/capabilities/` | Capabilities |
| `/cfo` | `repo-b/src/app/(marketing)/cfo/` | CFO persona page |
| `/contact` | `repo-b/src/app/(marketing)/contact/` | Contact |
| `/demo` | `repo-b/src/app/(marketing)/demo/` | Demo request |
| `/docs` | `repo-b/src/app/(marketing)/docs/` | Documentation |
| `/industries/[slug]` | `repo-b/src/app/(marketing)/industries/[slug]/` | Industry pages |
| `/industries/consumer-credit` | `repo-b/src/app/(marketing)/industries/consumer-credit/` | Consumer credit |
| `/industries/legal` | `repo-b/src/app/(marketing)/industries/legal/` | Legal |
| `/industries/medical` | `repo-b/src/app/(marketing)/industries/medical/` | Medical |
| `/industries/real-estate-private-equity` | `repo-b/src/app/(marketing)/industries/real-estate-private-equity/` | REPE |
| `/insights` | `repo-b/src/app/(marketing)/insights/` | Insights |
| `/legal` | `repo-b/src/app/(marketing)/legal/` | Legal/privacy |
| `/method` | `repo-b/src/app/(marketing)/method/` | Method/approach |
| `/operational-assessment` | `repo-b/src/app/(marketing)/operational-assessment/` | Operational assessment |
| `/proof` | `repo-b/src/app/(marketing)/proof/` | Case studies/proof |
| `/research` | `repo-b/src/app/(marketing)/research/` | Research |
| `/saas-iceberg` | `repo-b/src/app/(marketing)/saas-iceberg/` | SaaS iceberg |
| `/services` | `repo-b/src/app/(marketing)/services/` | Services |
| `/support-ops` | `repo-b/src/app/(marketing)/support-ops/` | Support ops |
| `/what-we-do` | `repo-b/src/app/(marketing)/what-we-do/` | What we do |

### Auth routes
| Route | File | Purpose |
|---|---|---|
| `/login` | `repo-b/src/app/` (verify) | Login page |
| `/api/auth/login` | `repo-b/src/app/api/auth/login/` | Login handler |
| `/api/auth/logout` | `repo-b/src/app/api/auth/logout/` | Logout handler |
| `/api/auth/me` | `repo-b/src/app/api/auth/me/` | Current user |
| `/api/auth/session` | `repo-b/src/app/api/auth/session/` | Session management |
| `/api/auth/switch-environment` | `repo-b/src/app/api/auth/switch-environment/` | Environment switcher |

### Public API routes
| Route | File | Purpose |
|---|---|---|
| `/api/public/assistant` | `repo-b/src/app/api/public/assistant/` | Public AI assistant (AI concierge) |
| `/api/public/onboarding-lead` | `repo-b/src/app/api/public/onboarding-lead/` | Lead capture |
| `/api/website/content` | `repo-b/src/app/api/website/content/` | CMS content |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/consulting.py` | Consulting surface |
| `backend/app/routes/resume.py` | Resume/profile API |

### Services
- Needs repo verification for website-specific service files

## Domain / deployment

- **Domain:** `novendor.ai` — replaces `paulmalmquist.com` (update old references on touch)
- **Vercel project:** `consulting-app`
- **Deploy:** `cd repo-b && vercel deploy --prod`
- **Auto-deploy:** DISABLED — must deploy manually after every push

## Design system

- `skills/novendor-cyberpunk-accents/SKILL.md` — cyberpunk accent tokens (--nv-purple-*, --nv-pink-*, --nv-red-*)
- `skills/novendor-icons-system/SKILL.md` — icon system (Remix Icon, Iconoir)
- Dark theme for internal surfaces; light theme for marketing

## Test map

- Needs repo verification for Playwright tests covering marketing pages
- `docs/site-improvements/` has daily site audit with issues to fix

## Needs verification

- [ ] Verify the `what-we-do` page (has a pending git change based on git status)
- [ ] Confirm login route file location
- [ ] Confirm homepage file location
- [ ] Whether AI concierge is connected to a real backend or is a static demo
- [ ] Whether lead capture writes to Supabase or an external CRM
