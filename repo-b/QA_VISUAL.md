# Visual QA Checklist (Business Machine Theme)

## Pages to Check
- `/` marketing home
- `/login`
- `/onboarding`
- `/app` and one department route (e.g. `/app/operations`)
- `/documents`
- `/lab` + `/lab/environments` + `/lab/chat` (with an environment selected)
- `/design-system`

## Layout + Mobile
- iPhone width: no horizontal scroll, no clipped content, safe-area padding works
- Touch targets: buttons/links >= 40px tall or comfortable to tap
- Tables: horizontally scroll within container (no page overflow)
- Sidebars: mobile drawer opens/closes and prevents background scroll

## Color + Contrast
- Primary text is readable on all glass surfaces
- Muted text still meets contrast expectations for non-critical info
- Accent is used sparingly (selected nav, primary CTA, focus ring)
- Error/warning/success colors are legible and not neon-overpowering

## Focus + Keyboard
- Tab through nav links, buttons, inputs: focus ring is clearly visible
- No focus trapping regressions (drawer close button reachable)

## Motion + Performance
- No heavy animations
- `prefers-reduced-motion` users do not lose affordances (focus/hover still visible)

## Consistency
- Cards share consistent radius + border weight + subtle glow
- Buttons have consistent heights, padding, hover/focus behavior
- Inputs/selects/textareas match in height, border, and focus state

