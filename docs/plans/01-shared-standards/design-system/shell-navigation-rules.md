# Shell and Navigation Rules

## Shell structure

The application shell is the persistent chrome surrounding all environment surfaces. It must be consistent across environments so users can orient themselves regardless of which environment they are in.

### Required shell elements
- Top bar with: Novendor logo / environment name / user menu
- Left sidebar or top navigation with: primary sections for the current environment
- Breadcrumb or back navigation for drill-down surfaces
- Environment switcher (accessible from user menu or top bar)

### Prohibited shell behaviors
- Shell must not collapse the sidebar unexpectedly based on content
- Shell must not show a different logo per environment (brand is consistent)
- Shell must not hide the environment name (users must always know which environment they are in)
- Shell must not have a top nav that wraps to two lines at 1280px wide

## Navigation rules

- Primary navigation items must be limited to 7 or fewer
- Active state must be visually distinct (color fill + text weight change, not just underline)
- Hover state must be visible
- Navigation must not require JavaScript to load the list (SSR-safe)
- Deep linking must work: a URL to a drill-down page must render correctly on direct load

## Mobile rules

- Shell collapses to a hamburger / bottom nav on mobile
- No content should be cut off on a 375px wide viewport
- Touch targets must be at least 44×44px

## Dark mode shell rule

Internal operator surfaces use dark shell. The shell background should be darker than card backgrounds to create clear depth.

Typical depth order:
`shell background` → `card/panel` → `nested panel` → `input/dropdown`
Dark values:
`#0a0a0a` → `#111111` → `#1a1a1a` → `#222222` (approximate, use tokens)
