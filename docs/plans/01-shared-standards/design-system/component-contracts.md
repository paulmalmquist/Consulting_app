# Component Contracts

Every component type has a behavioral contract. If a component in any environment deviates from this contract, it is drift and must be fixed.

## Cards

- Must have a header (title + optional subtitle)
- Must handle loading state with a visible skeleton or spinner
- Must handle empty state with a descriptive message (not just blank)
- Must handle error state with a human-readable error and a retry affordance
- Must not clip content without an explicit truncation indicator (ellipsis or "show more")

## Tables

- Must have a visible header row with column labels
- Must handle 0-row state with an empty state message
- Must support row selection if used for actions
- Paginated tables must show current page / total count
- Sortable columns must show sort direction indicator
- Must not overflow horizontally without a scroll container

## Drawers / Panels

- Must open from the right (detail drawers) or bottom (mobile)
- Must have a visible close control
- Must trap focus when open
- Must not obscure the primary content entirely on desktop (side-by-side is preferred)
- Must handle loading state within the drawer (skeleton, not blank)

## Charts

- Must have a title and axis labels
- Must handle empty data with an empty state (not a broken chart)
- Must handle single-data-point edge cases without a visual artifact
- Tooltip must show exact value and label on hover
- Must respect the token color system (see `tokens.md`)

## Forms

- Must show inline validation errors (not page-level only)
- Submit button must be disabled while a request is in flight
- Success confirmation must be visible (toast or inline)
- Error must be visible and specific (not "something went wrong")

## Loading states

- Use skeleton screens for content areas, not full-page spinners
- Loading indicators must not obscure interactive controls
- If loading takes > 3s, show a progress indicator or status message

## Empty states

- Must explain why it is empty (no data, no permission, nothing yet)
- Should provide a clear next action where relevant
- Never show a blank page with no explanation

## Error states

- Must distinguish between: no permission (403), not found (404), server error (500), and network error
- Must give the user a recovery path (retry, go back, contact support)
- Never display a raw stack trace or API error message to end users

## Page headers (telemetry header family)

The telemetry environment uses one header family (`repo-b/src/components/telemetry/TelemetryPageHeader.tsx`)
so every route shares a typographic system. Other environments may adopt the same contract.

- Exactly one `<h1>` per page; an uppercase mono eyebrow precedes it with an accent bar.
- Four variants by page role: `hero` (the environment's opening page only), `evidence` (evidence/lineage
  surfaces), `standard` (analytical consoles), `compact` (operational consoles). Only one `hero` per env.
- Title may be segmented for controlled emphasis; gradient/brand emphasis is limited to a meaningful
  phrase, never the whole title.
- The header neither fetches nor invents data — source/freshness/ids/timestamps/status and actions are
  passed in by the caller and rendered in the `metadata`/`actions` slots; fail-closed states stay intact.
- Titles must wrap cleanly and metadata rows stack without overflow at 390px / 1024px / desktop; title
  and body text meet WCAG AA in dark mode.
- Nested section headings keep using the standard heading primitive (`PageHeading`), not a second `<h1>`.
