# Winston / Novendor Mobile Sweep

## Entry, Auth, Public

### `/`, `/login`, `/{environmentSlug}/login`, `/{environmentSlug}/unauthorized`
- Desktop purpose: branded Winston and environment-scoped access surfaces with large-format hero + auth panel.
- Mobile priority: sign-in first, environment scope second, preserve brand system language.
- Mobile layout decision: tightened single-column composition, smaller hero rhythm, action panel stays full-width, supporting access principles stay stacked beneath the hero.
- Components touched: `repo-b/src/components/auth/WinstonLoginPortal.tsx`, `repo-b/src/components/auth/EnvironmentAccess.tsx`.
- Desktop regression signoff: desktop grid structure and brand framing preserved; changes are mobile-first spacing/order adjustments only.

### `/public`, `/public/onboarding`
- Desktop purpose: public discovery + intake entry points.
- Mobile priority: onboarding action, grouped intake steps, visible submit affordance.
- Mobile layout decision: public landing now reads as two clear paths; onboarding uses grouped sections and a sticky mobile submit bar tied to the form.
- Components touched: `repo-b/src/app/public/page.tsx`, `repo-b/src/app/public/onboarding/page.tsx`.
- Desktop regression signoff: desktop cards remain two-up and content parity is unchanged.

### `/app`
- Desktop purpose: authenticated environment selector and system access launch point.
- Mobile priority: current environment, open-workspace action, provisioned environment switching.
- Mobile layout decision: dedicated mobile branch with sticky top bar, selected-environment summary card, native environment selector, and collapsible admin/system access.
- Components touched: `repo-b/src/app/app/page.tsx`.
- Desktop regression signoff: existing desktop split-pane selector remains intact behind the `lg` branch.

## Shared Shells

### RE shell primitives
- Desktop purpose: dense three-zone operating shell with sidebar, main canvas, and context rail.
- Mobile priority: sticky header, bottom nav, modal/drawer behavior, safe-area handling.
- Mobile layout decision: expanded bottom-nav icon vocabulary and body-scroll locking; context rail becomes a bottom sheet on phones and a right sheet on tablet.
- Components touched: `repo-b/src/components/repe/workspace/WinstonShell.tsx`, `repo-b/src/components/repe/workspace/MobileBottomNav.tsx`.
- Desktop regression signoff: desktop grid columns unchanged.

### Consulting shell
- Desktop purpose: dense consulting workspace with persistent left nav and top action strip.
- Mobile priority: section context, fast creation actions, quick navigation.
- Mobile layout decision: compact sticky header, drawer nav, mobile summary card, and bottom nav projection for `Home`, `Pipeline`, `Contacts`, `Tasks`, `Reports`.
- Components touched: `repo-b/src/components/consulting/ConsultingWorkspaceShell.tsx`.
- Desktop regression signoff: desktop hero + sidebar remain unchanged in the `lg` branch.

### PDS shell
- Desktop purpose: grouped enterprise nav with dense sidebar taxonomy.
- Mobile priority: current module, grouped navigation drawer, focused bottom-nav access.
- Mobile layout decision: mobile header + grouped drawer + bottom nav for `Home`, `Accounts`, `Pipeline`, `Revenue`, `Risk`.
- Components touched: `repo-b/src/components/pds-enterprise/PdsEnterpriseShell.tsx`.
- Desktop regression signoff: desktop grouped sidebar preserved in the `xl` branch.

### Generic domain shell
- Desktop purpose: lightweight domain command shell with left nav and environment context.
- Mobile priority: current module, environment context, full module drawer.
- Mobile layout decision: drawer-first mobile shell with compact context card instead of bottom-nav projection.
- Components touched: `repo-b/src/components/domain/DomainWorkspaceShell.tsx`.
- Desktop regression signoff: desktop section header + sidebar remain the source of truth.

## Core Pages

### Resume
- Desktop purpose: visual resume module canvas with persistent rail + assistant.
- Mobile priority: active module first, contextual narrative second, assistant third.
- Mobile layout decision: main module stays full-width; rail and assistant move into collapsible sections that remain mounted only on mobile.
- Components touched: `repo-b/src/components/resume/ResumeWorkspace.tsx`.
- Desktop regression signoff: desktop two-column behavior preserved via viewport-conditional rendering.

### Winston chat surfaces
- Desktop purpose: conversation workspace plus utilities rail.
- Mobile priority: conversation thread, composer, recent threads/utilities behind progressive disclosure.
- Mobile layout decision: utilities collapse into mobile `details` sections while desktop keeps the right rail.
- Components touched: `repo-b/src/components/winston-companion/WinstonCompanionSurface.tsx`.
- Desktop regression signoff: full desktop workspace layout preserved.

### RE dashboards
- Desktop purpose: dashboard builder with canvas + config rail.
- Mobile priority: canvas first, config second.
- Mobile layout decision: widget config rail becomes a bottom sheet on small screens; desktop keeps the side rail.
- Components touched: `repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx`.
- Desktop regression signoff: desktop builder rail preserved.

### Consulting pipeline
- Desktop purpose: horizontal kanban with drag-and-drop.
- Mobile priority: summary metrics first, swipeable board second.
- Mobile layout decision: preserved horizontal kanban, added mobile summary cards and snap-based scrolling.
- Components touched: `repo-b/src/app/lab/env/[envId]/consulting/pipeline/page.tsx`.
- Desktop regression signoff: board orientation and drag model preserved.

### PDS workspace + placeholders
- Desktop purpose: dense enterprise command center with many analytic panels.
- Mobile priority: metrics and intervention queue first, one heavy analytic panel at a time.
- Mobile layout decision: viewport-aware conditional rendering for heavy lower panels; placeholder pages upgraded to intentional preview states.
- Components touched: `repo-b/src/components/pds-enterprise/PdsWorkspacePage.tsx`, `repo-b/src/components/pds-enterprise/PdsPlaceholderPage.tsx`.
- Desktop regression signoff: desktop still renders the full multi-panel command surface.

## Preview / Placeholder Domains

### `impact`, `metric-dict`, `blueprint`, `outputs`, `pilot`, `workflow-intel`, `case-factory`, `vendor-intel`, `data-chaos`
- Desktop purpose: future focused modules inside the domain shell.
- Mobile priority: explain what the page will become without pretending it is live.
- Mobile layout decision: standardized preview-state component with short purpose framing and environment context.
- Components touched: `repo-b/src/components/domain/DomainPreviewState.tsx` plus the route files above.
- Desktop regression signoff: these were placeholder pages already; behavior improves without altering live workflows.

## Verification Notes
- Chromium Playwright coverage added for `/app`, `/public/onboarding`, and resume workspace paths.
- Control Tower Playwright coverage remains in-code but is skipped under the current bypass-auth harness because `/lab/system/control-tower` resolves back through the app selector in this local harness.
- WebKit/iPhone project still needs local browser install (`npx playwright install`) before mobile project execution can run here.
