# Excel Add-in — Design Adaptation

## Purpose in the design system

The Excel add-in lives inside the Office task pane. It cannot use the full Novendor shell. It must work within Office UI constraints: narrow task pane (320px), Office font stack, Office color conventions.

## Accent choices
- Use purple sparingly — the Office host colors are already opinionated
- Status indicators: use standard green/amber/red that reads clearly in both Office light and dark themes
- Avoid cyberpunk accents — they look jarring next to Office UI chrome

## Density
High. The task pane is 320px wide. Every pixel must communicate.

## Component emphasis
- The query input must be the dominant element
- Results must be legible in a compact table or list format
- Write queue status must be visible (pending, synced, failed) without taking up full pane width
- Auth state must be visible in the header (signed in as / sign in button)

## Office constraints
- Do not use backdrop-blur or heavy box shadows (Office UI renders them inconsistently)
- Use system fonts as fallback — the task pane font stack may differ from the main app
- Confirm buttons must meet Office add-in minimum touch target sizes

## What this environment must NOT do
- Require a wide viewport for any essential functionality
- Use animations that interfere with Excel's own animations
- Show raw API error messages in Excel cells
